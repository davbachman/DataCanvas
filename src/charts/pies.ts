import { CanvasError, column, type Chart } from "../domain/model";
import { Engine, displayValue, plainValue } from "../engine/core";
import { quote as q, requireColumn } from "../compiler/expressions";
import type { ResolvedChart } from "./resolve";

/** Slices are computed from the complete relation, never a preview. */
export async function resolvePie(
  engine: Engine,
  chart: Chart,
): Promise<ResolvedChart> {
  if (chart.layers.length !== 1 || chart.facetRow || chart.facetColumn)
    throw new CanvasError(
      "VALIDATION",
      "Pie and donut charts require one layer and no facets.",
    );
  const layer = chart.layers[0];
  const input = engine.relations.get(chart.inputRecipeId);
  if (!input) throw new CanvasError("BLOCKED", "Run the chart’s recipe first.");
  if (!layer.x) throw new CanvasError("VALIDATION", "Choose a category field.");
  const category = requireColumn(input.columns, layer.x);
  const mode = layer.aggregate || "explicit";
  if (!["explicit", "count", "sum"].includes(mode))
    throw new CanvasError(
      "VALIDATION",
      "Choose explicit values, count, or sum for slices.",
    );
  const value =
    mode !== "count" && layer.y
      ? requireColumn(input.columns, layer.y)
      : undefined;
  if (
    mode !== "count" &&
    (!value || !["integer", "decimal"].includes(value.type))
  )
    throw new CanvasError(
      "VALIDATION",
      "Choose a numeric slice value, or select count.",
    );
  const x = q(category.id),
    y = value ? q(value.id) : "*",
    from = q(input.name);
  if (
    mode === "explicit" &&
    (
      await engine.db.query(
        `SELECT ${x} FROM ${from} WHERE ${x} IS NOT NULL GROUP BY ${x} HAVING count(*)>1 LIMIT 1`,
      )
    ).length
  )
    throw new CanvasError(
      "VALIDATION",
      "Multiple records share a category. Choose sum or count, or summarize the recipe first.",
    );
  const valid = `${x} IS NOT NULL${value ? ` AND ${y} IS NOT NULL` : ""}`;
  if (
    value &&
    (
      await engine.db.query(
        `SELECT 1 FROM ${from} WHERE ${valid} AND (${y}<0 OR NOT isfinite(${y}::DOUBLE)) LIMIT 1`,
      )
    ).length
  )
    throw new CanvasError(
      "VALIDATION",
      "Slice values must be finite and nonnegative. Filter or transform invalid values in the recipe.",
    );
  const omitted = Number(
    (
      await engine.db.query(
        `SELECT count(*) AS n FROM ${from} WHERE NOT (${valid})`,
      )
    )[0].n,
  );
  const stat = layer.id + "_value",
    share = layer.id + "_percent",
    records = layer.id + "_records";
  const calculation =
    mode === "count" ? "count(*)" : mode === "sum" ? `sum(${y})` : `max(${y})`;
  const grouped = `SELECT ${x}, ${calculation} AS ${q(stat)}, count(*) AS ${q(records)}, md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)) AS "__rid", flatten(list("__lineage")) AS "__lineage" FROM ${from} WHERE ${valid} GROUP BY ${x}`;
  const stats = (
    await engine.db.query(
      `SELECT count(*) AS n, sum(${q(stat)}::DOUBLE) AS total FROM (${grouped})`,
    )
  )[0];
  const total = Number(stats.total);
  if (!Number.isFinite(total) || total <= 0)
    throw new CanvasError(
      "VALIDATION",
      "A pie or donut needs a positive, finite total.",
    );
  if (Number(stats.n) > 50)
    throw new CanvasError(
      "VALIDATION",
      "Pie and donut charts allow at most 50 categories. Filter or group categories in the recipe, or use a bar chart.",
    );
  const sql = `SELECT *, (${q(stat)}::DOUBLE / sum(${q(stat)}::DOUBLE) OVER ())*100 AS ${q(share)} FROM (${grouped}) ORDER BY ${x}`;
  const name = "chart_" + layer.id;
  await engine.db.exec(`CREATE OR REPLACE TEMP VIEW ${q(name)} AS ${sql}`);
  const valueTitle =
    mode === "count"
      ? "Count"
      : `${mode === "sum" ? "Sum of " : ""}${value!.name}`;
  engine.relations.set(layer.id, {
    ...input,
    cacheKey: undefined,
    name,
    columns: [
      category,
      column(valueTitle, mode === "count" ? "integer" : "decimal", stat),
      column("Input records", "integer", records),
      column("Share (%)", "decimal", share),
    ],
    rowMeaning:
      "One category, its slice value and share of the included total.",
  });
  const table = await engine.fullTable(layer.id, 50);
  table.sql = sql;
  const values = table.rows.map((row, i) => ({
    _category: displayValue(row[category.id]),
    _value: Number(plainValue(row[stat])),
    _percent: Number(plainValue(row[share])),
    _records: Number(plainValue(row[records])),
    _record: i,
    _layer: 0,
    _order: i,
  }));
  const notes = [
    `${layer.mark}: ${mode === "explicit" ? "explicit values (one record per category)" : mode + " by category"}; ${omitted} records omitted for missing categories or values. Percentages use the included total.`,
    "Zero-value categories remain in the statistical table. Slices below 3% show their percentage in the tooltip; larger slices also have labels when enabled.",
    ...(values.length > 8
      ? [
          "Many categories can be difficult to compare; consider a bar chart or group categories in the recipe.",
        ]
      : []),
  ];
  const theta = { field: "_value", type: "quantitative", stack: true };
  const order = { field: "_order", type: "quantitative", sort: "ascending" };
  const tooltip = [
    { field: "_category", type: "nominal", title: category.name },
    { field: "_value", type: "quantitative", title: valueTitle },
    {
      field: "_percent",
      type: "quantitative",
      title: "Share (%)",
      format: ".1f",
    },
    { field: "_records", type: "quantitative", title: "Input records" },
  ];
  return {
    id: chart.id,
    name: chart.name,
    authored: chart,
    tables: [table],
    omitted,
    notes,
    spec: {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: 440,
      height: 320,
      background: "transparent",
      title: {
        text: chart.name,
        subtitle: chart.annotations ? [chart.annotations] : [],
      },
      data: { values },
      layer: [
        {
          mark: {
            type: "arc",
            outerRadius: 140,
            innerRadius: layer.mark === "donut" ? 75 : 0,
            stroke: "white",
            strokeWidth: 1,
          },
          encoding: {
            theta,
            order,
            color: {
              field: "_category",
              type: "nominal",
              title: category.name,
              sort: values.map((v) => v._category),
              scale: { scheme: "tableau10" },
            },
            tooltip,
          },
        },
        ...(layer.showPercent !== false
          ? [
              {
                transform: [
                  {
                    calculate:
                      "datum._percent >= 3 ? format(datum._percent, '.1f') + '%' : ''",
                    as: "_label",
                  },
                ],
                mark: {
                  type: "text",
                  radius: layer.mark === "donut" ? 108 : 95,
                  fill: "#182d29",
                  stroke: "white",
                  strokeWidth: 0.4,
                  fontSize: 12,
                  fontWeight: "bold",
                },
                encoding: { theta, order, text: { field: "_label" }, tooltip },
              },
            ]
          : []),
      ],
      config: { font: "system-ui", legend: { labelLimit: 240 } },
    },
  };
}

import { chartStyleSchema } from "../domain/chartStyle";
import { applyChartStyle } from "./style";
import { isPieMark, canOrient } from "../domain/charts";
import { resolvePie } from "./pies";
import { isMapMark } from "../domain/geography";
import { resolveMap } from "./maps";
import { type Chart, type Layer, CanvasError, column } from "../domain/model";
import { Engine, plainValue, type TableResult } from "../engine/core";
import { quote as q, requireColumn, aggregate } from "../compiler/expressions";
export interface ResolvedChart {
  id: string;
  name: string;
  spec: Record<string, any>;
  tables: TableResult[];
  omitted: number;
  notes: string[];
  authored: Chart;
}
async function resolveUnstyledChart(
  engine: Engine,
  chart: Chart,
): Promise<ResolvedChart> {
  if (chart.layers.some((l) => isPieMark(l.mark)))
    return resolvePie(engine, chart);
  if (chart.layers.some((l) => isMapMark(l.mark)))
    return resolveMap(engine, chart);
  const input = engine.relations.get(chart.inputRecipeId);
  if (!input) throw new CanvasError("BLOCKED", "Run the chart’s recipe first.");
  const panels: Record<string, any>[][] = [];
  const tables: TableResult[] = [],
    layers: Record<string, any>[] = [],
    notes: string[] = [];
  let omitted = 0;
  const type = (id: string) => {
    const role = requireColumn(input.columns, id).role;
    return role === "quantitative"
      ? "quantitative"
      : role === "temporal"
        ? "temporal"
        : role === "ordinal"
          ? "ordinal"
          : "nominal";
  };
  const field = (
    id: string,
    axis: "x" | "y" | "color" | "size" | "shape" | "detail" = "x",
  ): any => ({
    field: id,
    type: type(id),
    ...(requireColumn(input.columns, id).levels?.length
      ? { sort: requireColumn(input.columns, id).levels }
      : {}),
    title:
      axis === "x" && chart.scales.xTitle
        ? chart.scales.xTitle
        : axis === "y" && chart.scales.yTitle
          ? chart.scales.yTitle
          : requireColumn(input.columns, id).name +
            (requireColumn(input.columns, id).units
              ? ` (${requireColumn(input.columns, id).units})`
              : ""),
    ...(["x", "y"].includes(axis)
      ? {
          scale: {
            ...((axis === "x" && chart.scales.xLog) ||
            (axis === "y" && chart.scales.yLog)
              ? { type: "log" }
              : {}),
            ...(axis === "y" ? { zero: chart.scales.zero !== false } : {}),
            ...(axis === "x" && chart.scales.xDomain
              ? { domain: chart.scales.xDomain }
              : axis === "y" && chart.scales.yDomain
                ? { domain: chart.scales.yDomain }
                : {}),
          },
        }
      : {}),
  });
  for (const [index, layer] of chart.layers.entries()) {
    const firstMark = layers.length;
    if (layer.mark === "rule") {
      layers.push({
        mark: {
          type: "rule",
          color: layer.constantColor || "#b56545",
          strokeDash: [5, 4],
        },
        encoding: { y: { datum: layer.constant ?? 0, type: "quantitative" } },
      });
      panels.push(layers.slice(firstMark));
      continue;
    }
    if (!layer.x) throw new CanvasError("VALIDATION", "Choose an x field.");
    requireColumn(input.columns, layer.x);
    const x = q(layer.x),
      y =
        layer.y &&
        ["scatter", "line", "bar", "box", "heatmap"].includes(layer.mark)
          ? q(requireColumn(input.columns, layer.y).id)
          : "";
    if (["scatter", "line", "bar", "box", "heatmap"].includes(layer.mark) && !y)
      throw new CanvasError(
        "VALIDATION",
        `Choose a y field for ${layer.mark}.`,
      );
    const dimensions = [
      chart.facetRow,
      chart.facetColumn,
      layer.color,
      layer.detail,
      layer.size,
      layer.shape,
      ...(["count", "box", "bar", "heatmap"].includes(layer.mark)
        ? [layer.x]
        : []),
      ...(layer.mark === "heatmap" ? [layer.y] : []),
    ].filter((v): v is string => !!v);
    const group = [...new Set(dimensions)];
    group.forEach((id) => requireColumn(input.columns, id));
    const required = [
      layer.x,
      ...(y && layer.mark !== "line" ? [layer.y!] : []),
      ...(chart.scales.xLog ? [layer.x] : []),
    ];
    const valid = [...new Set(required)]
      .map((id) => `${q(id)} IS NOT NULL`)
      .concat(
        chart.scales.xLog ? [`${x}>0`] : [],
        chart.scales.yLog && y ? [`${y}>0`] : [],
      )
      .join(" AND ");
    const count = Number(
      (
        await engine.db.query(
          `SELECT count(*) AS n FROM ${q(input.name)} WHERE NOT (${valid})`,
        )
      )[0].n,
    );
    omitted += count;
    notes.push(
      `${layer.mark}: ${count} records omitted for missing encodings or nonpositive log values.`,
    );
    let sql = `SELECT * FROM ${q(input.name)} WHERE ${valid}`,
      columns = [...input.columns];
    const statsId = `${layer.id}_stat`,
      binId = `${layer.id}_bin`,
      endId = `${layer.id}_end`;
    const gs = group.map(q);
    const lineage = `md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)) AS "__rid", flatten(list("__lineage")) AS "__lineage"`;
    let encoding: Record<string, any> = {
      x: field(layer.x),
      ...(layer.y ? { y: field(layer.y, "y") } : {}),
    };
    if (
      layer.mark === "count" ||
      layer.mark === "histogram" ||
      (layer.aggregate && ["bar", "heatmap"].includes(layer.mark))
    ) {
      if (layer.mark === "histogram") {
        const width = layer.binWidth || 5;
        if (!Number.isFinite(width) || width <= 0)
          throw new CanvasError("VALIDATION", "Bin width must be positive");
        const start = `floor(${x}/${width})*${width}`;
        sql = `SELECT ${gs.length ? gs + ", " : ""}${start} AS ${q(binId)},${start}+${width} AS ${q(endId)},count(*) AS ${q(statsId)},${lineage} FROM ${q(input.name)} WHERE ${valid} GROUP BY ${[...gs, start].join(",")}`;
        columns = [
          ...group.map((id) => requireColumn(input.columns, id)),
          column("Bin start", "decimal", binId),
          column("Bin end (exclusive)", "decimal", endId),
          column("Count", "integer", statsId),
        ];
        encoding = {
          x: {
            field: binId,
            type: "quantitative",
            bin: "binned",
            title: requireColumn(input.columns, layer.x).name,
          },
          x2: { field: endId },
          y: {
            field: statsId,
            type: "quantitative",
            title: "Count",
            scale: { zero: true },
          },
        };
        notes.push(
          `Bins of width ${width}, anchored at 0, left-closed/right-open [start, end); all finite extremes included.`,
        );
      } else {
        const fn = layer.mark === "count" ? "count" : layer.aggregate!;
        sql = `SELECT ${gs.length ? gs + ", " : ""}${aggregate(fn, y || "*")} AS ${q(statsId)},${lineage} FROM ${q(input.name)} WHERE ${valid}${gs.length ? ` GROUP BY ${gs}` : ""}`;
        columns = [
          ...group.map((id) => requireColumn(input.columns, id)),
          column(
            fn === "count"
              ? "Count"
              : `${fn} of ${requireColumn(input.columns, layer.y!).name}`,
            fn === "count" ? "integer" : "decimal",
            statsId,
          ),
        ];
        encoding = {
          x: field(layer.x),
          ...(layer.mark === "heatmap"
            ? {
                y: field(layer.y!, "y"),
                color: {
                  field: statsId,
                  type: "quantitative",
                  title: layer.aggregate,
                },
              }
            : {
                y: {
                  field: statsId,
                  type: "quantitative",
                  title: columns.at(-1)!.name,
                  scale: { zero: chart.scales.zero !== false },
                },
              }),
        };
      }
      notes.push(
        "Statistics computed from the complete recipe output. The table below is the exact chart transformation.",
      );
    }
    if (layer.mark === "box") {
      const q1 = `${layer.id}_q1`,
        q3 = `${layer.id}_q3`,
        med = `${layer.id}_median`,
        lo = `${layer.id}_low`,
        hi = `${layer.id}_high`;
      sql = `WITH stats AS (SELECT ${gs.length ? gs + ", " : ""}quantile_cont(${y},0.25) AS q1,quantile_cont(${y},0.5) AS med,quantile_cont(${y},0.75) AS q3 FROM ${q(input.name)} WHERE ${valid}${gs.length ? ` GROUP BY ${gs}` : ""}) SELECT ${group.map((id) => "a." + q(id) + ", ").join("")}first(s.q1) AS ${q(q1)},first(s.med) AS ${q(med)},first(s.q3) AS ${q(q3)},min(${y}) FILTER(WHERE ${y}>=s.q1-1.5*(s.q3-s.q1)) AS ${q(lo)},max(${y}) FILTER(WHERE ${y}<=s.q3+1.5*(s.q3-s.q1)) AS ${q(hi)},${lineage} FROM ${q(input.name)} a JOIN stats s ON ${group.map((id) => `a.${q(id)} IS NOT DISTINCT FROM s.${q(id)}`).join(" AND ") || "TRUE"} WHERE ${valid.replaceAll(x, "a." + x)}${gs.length ? ` GROUP BY ${group.map((id) => "a." + q(id))}` : ""}`;
      columns = [
        ...group.map((id) => requireColumn(input.columns, id)),
        column("Q1", "decimal", q1),
        column("Median", "decimal", med),
        column("Q3", "decimal", q3),
        column("Lower whisker", "decimal", lo),
        column("Upper whisker", "decimal", hi),
      ];
      encoding = {
        x: field(layer.x),
        y: {
          field: q1,
          type: "quantitative",
          title: requireColumn(input.columns, layer.y!).name,
        },
        y2: { field: q3 },
      };
      notes.push(
        "Box: continuous quartiles; whiskers reach the most extreme observations within 1.5 × IQR. Outliers remain in contributing records.",
      );
    }
    const name = "chart_" + layer.id;
    await engine.db.exec(`CREATE OR REPLACE TEMP VIEW ${q(name)} AS ${sql}`);
    const relation = { ...input, cacheKey: undefined, name, columns };
    engine.relations.set(layer.id, relation);
    const table = await engine.fullTable(
      layer.id,
      layer.mark === "scatter" || layer.mark === "line" ? 20000 : 10000,
    );
    table.sql = sql;
    tables.push(table);
    const values = table.rows.map((r, i) => ({
      ...Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, plainValue(v)]),
      ),
      _record: i,
      _layer: index,
    }));
    for (const channel of ["color", "size", "shape", "detail"] as const)
      if (layer[channel] && !(layer.mark === "heatmap" && channel === "color"))
        encoding[channel] = field(layer[channel]!, channel);
    if (!encoding.color)
      encoding.color = { value: layer.constantColor || "#277c6c" };
    if (layer.x2) {
      requireColumn(columns, layer.x2);
      encoding.x = { ...encoding.x, bin: "binned" };
      encoding.x2 = { field: layer.x2 };
    }
    encoding.tooltip = columns
      .filter((c) => !layer.tooltip || layer.tooltip.includes(c.id))
      .map((c) => ({
        field: c.id,
        type: c.role === "quantitative" ? "quantitative" : "nominal",
        title: c.name,
      }));
    if (layer.mark === "line") {
      encoding.order = { field: layer.x, type: type(layer.x) };
      notes.push(
        "Line sorted by x within detail/color groups. Missing y values break the path; missing x values cannot be positioned and are omitted.",
      );
    }
    const mark =
      layer.mark === "scatter"
        ? "point"
        : layer.mark === "line"
          ? "line"
          : layer.mark === "heatmap"
            ? "rect"
            : "bar";
    const brushable =
      chart.style?.arrangement !== "subplots" &&
      index === 0 &&
      chart.layers.length === 1 &&
      ["scatter", "line"].includes(layer.mark) &&
      !chart.facetRow &&
      !chart.facetColumn;
    if (brushable)
      encoding.opacity = {
        condition: { param: "brush", value: 0.85 },
        value: 0.2,
      };
    if (canOrient(layer.mark)) {
      if (layer.stack !== undefined) {
        if (layer.stack !== "none" && !layer.color)
          throw new CanvasError(
            "VALIDATION",
            "Choose a color field to define the stacked groups.",
          );
        if (layer.stack !== "none" && chart.scales.yLog)
          throw new CanvasError(
            "VALIDATION",
            "Stacked bars require a linear value axis.",
          );
        encoding.y.stack = layer.stack === "none" ? null : layer.stack;
        if (layer.stack === "normalize") {
          encoding.y.axis = { ...encoding.y.axis, format: ".0%" };
          encoding.y.title = "Share of total";
          notes.push(
            "Percentage stacking normalizes within each category/bin; statistical tables and tooltips retain the original values.",
          );
        }
      }
      // x/y remain the authored field roles. Orientation only changes geometry.
      for (const axis of ["x", "y"] as const) {
        const e = encoding[axis];
        if (chart.scales[(axis + "Title") as "xTitle" | "yTitle"])
          e.title = chart.scales[(axis + "Title") as "xTitle" | "yTitle"];
        e.scale = {
          ...e.scale,
          ...(chart.scales[(axis + "Log") as "xLog" | "yLog"]
            ? { type: "log" }
            : {}),
          ...(chart.scales[(axis + "Domain") as "xDomain" | "yDomain"]
            ? {
                domain:
                  chart.scales[(axis + "Domain") as "xDomain" | "yDomain"],
              }
            : {}),
          ...(axis === "y"
            ? { zero: !chart.scales.yLog && chart.scales.zero !== false }
            : {}),
        };
      }
      if (layer.orientation === "horizontal") {
        const { x, x2, y, y2, ...rest } = encoding;
        encoding = {
          ...rest,
          x: y,
          y: x,
          ...(x2 ? { y2: x2 } : {}),
          ...(y2 ? { x2: y2 } : {}),
        };
      }
    }
    layers.push({
      ...(brushable
        ? {
            params: [
              {
                name: "brush",
                select: { type: "interval", encodings: ["x", "y"] },
              },
            ],
          }
        : {}),
      data: { values },
      mark: {
        type: mark,
        ...(canOrient(layer.mark)
          ? { orient: layer.orientation || "vertical" }
          : {}),
        ...(mark === "line" ? { invalid: "break-paths-show-domains" } : {}),
        ...(mark === "point"
          ? { filled: true, size: layer.constantSize || 65, opacity: 0.75 }
          : {}),
        tooltip: true,
      },
      encoding,
    });
    if (layer.mark === "box") {
      const base = {
        data: { values },
        encoding: {
          x: field(layer.x),
          color: encoding.color,
          tooltip: encoding.tooltip,
        },
      };
      layers.push(
        {
          ...base,
          mark: "rule",
          encoding: {
            ...base.encoding,
            y: { field: `${layer.id}_low`, type: "quantitative" },
            y2: { field: `${layer.id}_high` },
          },
        },
        {
          ...base,
          mark: { type: "tick", color: "#fff", size: 22 },
          encoding: {
            ...base.encoding,
            y: { field: `${layer.id}_median`, type: "quantitative" },
          },
        },
      );
    }
    panels.push(layers.slice(firstMark));
  }
  const spec: Record<string, any> = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: chart.name + ". " + notes.join(" "),
    title: {
      text: chart.name,
      subtitle: [
        chart.annotations || "Full-data statistics",
        `${omitted} layer-record omissions · no hidden sampling`,
      ],
      anchor: "start",
      fontSize: 14,
      subtitleFontSize: 10,
      color: "#344c40",
      subtitleColor: "#78847c",
    },
    width: 560,
    height: 320,
    layer: layers,
    config: {
      background: "transparent",
      font: "Inter, system-ui, sans-serif",
      view: { stroke: null },
      axis: {
        gridColor: "#e8ece9",
        domainColor: "#b5c4bb",
        labelColor: "#58665e",
        titleColor: "#344c40",
        labelFontSize: 11,
        titleFontSize: 12,
      },
      range: {
        category: ["#277c6c", "#e0aa5a", "#8172a4", "#b96867", "#4d8ead"],
      },
    },
  };
  if (chart.facetRow || chart.facetColumn) {
    const allValues = new Map<string, any>();
    for (const layer of layers) {
      if (layer.data?.values) {
        const layerIndex = layer.data.values[0]?._layer;
        for (const value of layer.data.values)
          allValues.set(`${value._layer}:${value._record}`, value);
        layer.transform = [
          ...(layer.transform || []),
          { filter: `datum._layer === ${layerIndex ?? -1}` },
        ];
        delete layer.data;
      }
    }
    const data = { values: [...allValues.values()] };
    delete spec.layer;
    delete spec.width;
    delete spec.height;
    spec.data = data;
    spec.facet = {
      ...(chart.facetRow ? { row: field(chart.facetRow) } : {}),
      ...(chart.facetColumn ? { column: field(chart.facetColumn) } : {}),
    };
    spec.spec = { width: 240, height: 210, layer: layers };
  }
  if (chart.style?.arrangement === "subplots") {
    const children = panels.map((marks, i) => ({
      title:
        chart.layers[i].label || `Layer ${i + 1} · ${chart.layers[i].mark}`,
      ...(spec.facet
        ? {
            data: spec.data,
            facet: spec.facet,
            spec: { ...spec.spec, layer: marks },
          }
        : { width: spec.width, height: spec.height, layer: marks }),
    }));
    delete spec.layer;
    delete spec.facet;
    delete spec.spec;
    delete spec.data;
    delete spec.width;
    delete spec.height;
    spec.concat = children;
    spec.columns = chart.style.panelColumns || 2;
    spec.spacing = chart.style.panelSpacing ?? 24;
    spec.resolve = {
      scale: {
        x: chart.style.xScales || "independent",
        y: chart.style.yScales || "independent",
        color: "independent",
      },
    };
  }
  return {
    id: chart.id,
    name: chart.name,
    spec,
    tables,
    omitted,
    notes,
    authored: chart,
  };
}

export async function resolveChart(
  engine: Engine,
  chart: Chart,
): Promise<ResolvedChart> {
  if (chart.style) chartStyleSchema.parse(chart.style);
  if (
    chart.style?.arrangement === "subplots" &&
    chart.layers.some((l) => isMapMark(l.mark) || isPieMark(l.mark))
  )
    throw new CanvasError(
      "VALIDATION",
      "Subplot grids currently support Cartesian chart layers. Use separate report charts for maps and pies.",
    );
  const resolved = await resolveUnstyledChart(engine, chart);
  return { ...resolved, spec: applyChartStyle(chart, resolved.spec) };
}

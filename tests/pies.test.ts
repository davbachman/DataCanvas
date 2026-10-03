import { it, expect } from "vitest";
import { compile } from "vega-lite";
import { parse, View } from "vega";
import { pieFixture } from "./fixtures/pies";
import { Engine, plainValue } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { resolveChart } from "../src/charts/resolve";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { markPredicate } from "../src/charts/selection";
import { quote as q } from "../src/compiler/expressions";
import { column } from "../src/domain/model";
async function prepared() {
  const bundle = unpackBundle(packBundle(await pieFixture()));
  const db = await nativeDB(),
    engine = new Engine(db);
  await engine.run(bundle);
  return { bundle, db, engine, chart: bundle.project.charts[0] };
}
it("computes exact slice sums/counts, percentages and contributing records from all input rows", async () => {
  const { bundle, db, engine, chart } = await prepared();
  try {
    const sum = await resolveChart(engine, chart),
      table = sum.tables[0];
    expect(table.rowCount).toBe(5);
    expect(sum.omitted).toBe(0);
    const index = table.rows.findIndex((r) => r.country === "France");
    expect(table.rows[index]).toMatchObject({
      sum_slices_value: 30,
      sum_slices_percent: 24,
      sum_slices_records: { type: "integer", value: "2" },
    });
    expect(table.lineage[index].sort()).toEqual(["locations:1", "locations:2"]);
    expect(
      table.rows.reduce((n, row) => n + Number(row.sum_slices_percent), 0),
    ).toBe(100);
    expect(
      JSON.stringify(markPredicate(chart, 0, table.rows[index])),
    ).toContain("France");
    const count = (await resolveChart(engine, bundle.project.charts[1]))
      .tables[0];
    expect(
      count.rows.reduce(
        (n, row) => n + Number(plainValue(row.count_slices_value)),
        0,
      ),
    ).toBe(7);
    expect(
      count.rows.find((row) => row.country === "Japan")?.count_slices_percent,
    ).toBeCloseTo(200 / 7);
  } finally {
    await db.close();
  }
});
it("renders pie and donut geometry with percentage labels and preserves portable settings", async () => {
  const { bundle, db, engine } = await prepared();
  try {
    for (const chart of bundle.project.charts) {
      const resolved = await resolveChart(engine, chart);
      expect(resolved.spec.layer[0].mark.innerRadius).toBe(
        chart.layers[0].mark === "donut" ? 75 : 0,
      );
      const view = new View(parse(compile(resolved.spec as any).spec), {
        renderer: "none",
      });
      try {
        const svg = await view.toSVG();
        expect(svg).toContain('class="mark-arc');
        expect(svg).toContain(
          chart.layers[0].mark === "pie" ? "24.0%" : "28.6%",
        );
        expect(svg).not.toMatch(/NaN|Infinity/);
      } finally {
        view.finalize();
      }
      chart.layers[0].showPercent = false;
      expect((await resolveChart(engine, chart)).spec.layer).toHaveLength(1);
    }
    expect(unpackBundle(packBundle(bundle)).project.charts).toEqual(
      bundle.project.charts,
    );
  } finally {
    await db.close();
  }
});
it("rejects ambiguous aggregation, nonnumeric values, mixed layers and facets", async () => {
  const { db, engine, chart } = await prepared();
  try {
    const layer = chart.layers[0];
    await expect(
      resolveChart(engine, {
        ...chart,
        layers: [{ ...layer, aggregate: undefined }],
      }),
    ).rejects.toThrow("Multiple records");
    await expect(
      resolveChart(engine, {
        ...chart,
        layers: [{ ...layer, aggregate: "mean" }],
      }),
    ).rejects.toThrow("explicit values, count, or sum");
    await expect(
      resolveChart(engine, { ...chart, layers: [{ ...layer, y: "country" }] }),
    ).rejects.toThrow("numeric slice value");
    await expect(
      resolveChart(engine, {
        ...chart,
        layers: [layer, { id: "rule", mark: "rule" }],
      }),
    ).rejects.toThrow("one layer");
    await expect(
      resolveChart(engine, { ...chart, facetRow: "country" }),
    ).rejects.toThrow("no facets");
  } finally {
    await db.close();
  }
});
it("discloses missing rows, retains zero categories, and rejects negative, infinite and zero totals", async () => {
  const { db, engine, chart } = await prepared();
  try {
    const relation = engine.relations.get(chart.inputRecipeId)!;
    await db.exec(
      `CREATE TEMP TABLE pie_input AS SELECT * FROM ${q(relation.name)}`,
    );
    engine.relations.set(chart.inputRecipeId, {
      ...relation,
      name: "pie_input",
    });
    await db.exec(
      "UPDATE pie_input SET value=0 WHERE country='Atlantis'; UPDATE pie_input SET value=NULL WHERE country='Brazil'; UPDATE pie_input SET country=NULL WHERE place='Tokyo'",
    );
    const result = await resolveChart(engine, chart);
    expect(result.omitted).toBe(2);
    const table = result.tables[0];
    expect(
      table.rows.find((row) => row.country === "Atlantis")?.sum_slices_percent,
    ).toBe(0);
    expect(table.lineage.flat().sort()).toEqual([
      "locations:1",
      "locations:2",
      "locations:5",
      "locations:6",
      "locations:7",
    ]);
    await db.exec("UPDATE pie_input SET value=-1 WHERE place='Paris'");
    await expect(resolveChart(engine, chart)).rejects.toThrow("nonnegative");
    await db.exec(
      "UPDATE pie_input SET value='Infinity'::DOUBLE WHERE place='Paris'",
    );
    await expect(resolveChart(engine, chart)).rejects.toThrow("finite");
    await db.exec("UPDATE pie_input SET value=0");
    await expect(resolveChart(engine, chart)).rejects.toThrow(
      "positive, finite total",
    );
    chart.layers[0].aggregate = "count";
    expect((await resolveChart(engine, chart)).omitted).toBe(1);
  } finally {
    await db.close();
  }
});
it("keeps large integer category identities distinct and enforces the category limit", async () => {
  const { db, engine, chart } = await prepared();
  try {
    const relation = engine.relations.get(chart.inputRecipeId)!;
    await db.exec(
      `CREATE TEMP VIEW pie_input AS SELECT 9007199254740992::BIGINT+i AS category, i+1 AS value, i::VARCHAR AS __rid, [i::VARCHAR] AS __lineage FROM range(2) t(i)`,
    );
    engine.relations.set(chart.inputRecipeId, {
      ...relation,
      name: "pie_input",
      columns: [
        column("category", "integer", "category"),
        column("value", "integer", "value"),
      ],
    });
    chart.layers[0] = {
      ...chart.layers[0],
      x: "category",
      aggregate: undefined,
    };
    const result = await resolveChart(engine, chart);
    expect(result.spec.data.values.map((v: any) => v._category)).toEqual([
      "9007199254740992",
      "9007199254740993",
    ]);
    expect(Number(result.tables[0].rows[0].sum_slices_percent)).toBeCloseTo(
      100 / 3,
    );
    await db.exec(
      `CREATE OR REPLACE TEMP VIEW pie_input AS SELECT i AS category, 1 AS value, i::VARCHAR AS __rid, [i::VARCHAR] AS __lineage FROM range(51) t(i)`,
    );
    await expect(resolveChart(engine, chart)).rejects.toThrow("at most 50");
  } finally {
    await db.close();
  }
});

import { it, expect } from "vitest";
import { example } from "../src/examples";
import { Engine } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { executeQuery } from "../src/engine/queries";
import { extractChartTransformation } from "../src/charts/extract";
import { resolveChart } from "../src/charts/resolve";
it("reuses exact caches, invalidates descendants, and never reuses failed current values", async () => {
  const bundle = await example();
  const db = await nativeDB();
  try {
    const engine = new Engine(db, nativeDB);
    const first = await engine.run(bundle);
    const second = await engine.run(bundle);
    expect(second.tables.regional.rows).toEqual(first.tables.regional.rows);
    expect(engine.operationCache.size).toBe(7);
    bundle.project.recipes[0].operations[0].params.action = "upper";
    const third = await engine.run(bundle);
    expect(third.tables.regional.rows).not.toEqual(first.tables.regional.rows);
    bundle.project.recipes[0].operations[0].params.columnId = "missing_id";
    const failed = await engine.run(bundle);
    expect(failed.tables.clean).toBeUndefined();
    expect(failed.tables.regional).toBeUndefined();
    expect(failed.errors.some((e) => e.code === "BLOCKED")).toBe(true);
  } finally {
    await db.close();
  }
});
it("executes SQL in a separate database with typed empty schemas and denied external access", async () => {
  const db = await nativeDB();
  try {
    const engine = new Engine(db, nativeDB);
    await engine.run(await example());
    const result = await executeQuery(engine, {
      id: "query",
      name: "Read",
      sqlText: "SELECT count(*) AS n FROM data",
      tableBindings: { data: "clean" },
    });
    expect(result.rows).toEqual([{ n: { type: "integer", value: "36" } }]);
    const empty = await executeQuery(engine, {
      id: "empty",
      name: "Empty",
      sqlText: "SELECT * FROM data WHERE 1=0",
      tableBindings: { data: "regional" },
    });
    expect(empty.columns).toHaveLength(4);
    expect(empty.rows).toEqual([]);
    expect(
      await db.query(
        "SELECT count(*) AS n FROM duckdb_views() WHERE view_name='data'",
      ),
    ).toEqual([{ n: 0n }]);
  } finally {
    await db.close();
  }
});
it("histogram extraction preserves bin intervals, counts and missing policy", async () => {
  const bundle = await example();
  const db = await nativeDB();
  try {
    const engine = new Engine(db);
    await engine.run(bundle);
    const chart = {
      id: "histogram",
      name: "Temperatures",
      inputRecipeId: "clean",
      layers: [
        {
          id: "histogram_layer",
          mark: "histogram" as const,
          x: "temperature",
          binWidth: 5,
        },
      ],
      scales: {},
      annotations: "",
    };
    const before = await resolveChart(engine, chart);
    const extracted = extractChartTransformation(chart);
    bundle.project.recipes.push(extracted.recipe);
    await engine.run(bundle);
    const after = await resolveChart(engine, extracted.chart);
    const beforeCounts = before.tables[0].rows
      .map((r) => String((r.histogram_layer_stat as any).value))
      .sort();
    const countId = extracted.chart.layers[0].y!;
    expect(
      after.tables[0].rows.map((r) => String((r[countId] as any).value)).sort(),
    ).toEqual(beforeCounts);
    expect(extracted.chart.layers[0].x2).toBeTruthy();
  } finally {
    await db.close();
  }
});

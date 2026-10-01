import { describe, it, expect } from "vitest";
import {
  blankProject,
  column,
  col,
  lit,
  binary,
  CanvasError,
  type Bundle,
  type Operation,
} from "../src/domain/model";
import {
  defaultImport,
  createSource,
  fingerprint,
  parseAsset,
} from "../src/persistence/import";
import { run, replaceSources, inspect } from "../src/headless/api";
import { example } from "../src/examples";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { validateSQL, compareTables } from "../src/engine/queries";
import { Engine, plainValue } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { resolveChart } from "../src/charts/resolve";
import { writeFile } from "node:fs/promises";
const op = (id: string, kind: string, params: any): Operation => ({
  id,
  kind,
  version: 1,
  params,
});
async function fixture(
  csv = "group,value\nA,1\nA,3\nB,NA\nB,NA\n",
  operations: Operation[] = [],
): Promise<Bundle> {
  const project = blankProject();
  const bytes = new TextEncoder().encode(csv);
  const { source } = await createSource(
    "fixture",
    bytes,
    { ...defaultImport, missingTokens: ["NA"] },
    [column("group", "text", "group"), column("value", "decimal", "value")],
  );
  source.id = "src";
  project.sources = [source];
  project.recipes = [
    {
      id: "recipe",
      name: "Test",
      inputRef: { kind: "source", id: "src" },
      rowMeaning: "Test record",
      operations,
    },
  ];
  return { project, assets: { [source.assetRef]: bytes } };
}
const rows = (r: any, id = "recipe") =>
  r.tables[id].rows.map((row: any) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, plainValue(v as any)]),
    ),
  );
const summary = (groups = ["group"]) =>
  op("summary", "summarize", {
    groups,
    aggregates: [
      { id: "n", name: "rows", fn: "count" },
      { id: "valid", name: "valid", fn: "count_valid", columnId: "value" },
      {
        id: "missing",
        name: "missing",
        fn: "count_missing",
        columnId: "value",
      },
      { id: "distinct", name: "distinct", fn: "distinct", columnId: "value" },
      { id: "sum", name: "sum", fn: "sum", columnId: "value" },
      { id: "mean", name: "mean", fn: "mean", columnId: "value" },
      { id: "sd", name: "sd", fn: "sd", columnId: "value" },
    ],
  });
describe("central relational semantics", () => {
  it("counts nulls separately and uses missing for all-missing aggregates", async () => {
    const r = await run(await fixture(undefined, [summary()]));
    expect(r.errors).toEqual([]);
    expect(rows(r).find((r: any) => r.group === "A")).toMatchObject({
      n: 2,
      valid: 2,
      missing: 0,
      distinct: 2,
      sum: 4,
      mean: 2,
      sd: Math.sqrt(2),
    });
    expect(rows(r).find((r: any) => r.group === "B")).toMatchObject({
      n: 2,
      valid: 0,
      missing: 2,
      distinct: 0,
      sum: null,
      mean: null,
      sd: null,
    });
  });
  it("overall empty summary produces one row; grouped empty summary has none", async () => {
    const b = await fixture("group,value\n", [summary([])]);
    expect(rows(await run(b))).toMatchObject([{ n: 0, valid: 0, sum: null }]);
    b.project.recipes[0].operations = [summary()];
    expect(rows(await run(b))).toEqual([]);
  });
  it("filter reports true/false/unknown independently", async () => {
    const r = await run(
      await fixture(undefined, [
        op("filter", "filter", {
          expression: binary(">", col("value"), lit(1)),
        }),
      ]),
    );
    expect(rows(r)).toEqual([{ group: "A", value: 3 }]);
    expect(r.diagnostics[0].message).toContain(
      "1 retained; 1 false; 2 unknown",
    );
  });
  it("invalid arithmetic yields missing, never infinity", async () => {
    const r = await run(
      await fixture(undefined, [
        op("derive", "derive", {
          columnId: "ratio",
          name: "ratio",
          expression: binary("/", col("value"), lit(0)),
        }),
      ]),
    );
    expect(rows(r).every((r: any) => r.ratio === null)).toBe(true);
    expect(r.diagnostics[0].count).toBe(4);
  });
  it("rename keeps stable expressions; deleting a field does not rebind by name", async () => {
    const b = await fixture(undefined, [
      op("rename", "rename", { columnId: "value", name: 'quoted " value' }),
      op("derive", "derive", {
        columnId: "double",
        name: "double",
        expression: binary("*", col("value"), lit(2)),
      }),
    ]);
    expect(rows(await run(b))[0].double).toBe(2);
    b.project.recipes[0].operations.unshift(
      op("drop", "select", { mode: "drop", columns: ["value"] }),
    );
    const r = await run(b);
    expect(r.status).toBe("failed");
    expect(r.errors[0].code).toBe("SCHEMA");
  });
  it("sample is deterministic independently of a previous sort", async () => {
    const sample = op("sample", "sample", {
      size: 2,
      fraction: false,
      seed: "saved42",
      algorithm: "md5-rank-v1",
    });
    const b = await fixture("group,value\nA,1\nB,2\nC,3\nD,4\n", [sample]);
    const first = rows(await run(b));
    b.project.recipes[0].operations.unshift(
      op("sort", "sort", {
        keys: [{ columnId: "value", direction: "desc", nulls: "last" }],
      }),
    );
    expect(rows(await run(b))).toEqual(first);
  });
  it("2 × 3 join has six matches, null keys do not match, anti keeps unmatched", async () => {
    const b = await example("transactions");
    let r = await run(b);
    expect(r.errors).toEqual([]);
    expect(r.tables.catalog_join.rowCount).toBe(10);
    expect(rows(r, "unmatched").map((r: any) => r.product)).toEqual([
      "004",
      null,
    ]);
    expect(
      r.diagnostics.find((d) => d.operationId === "products_join")?.message,
    ).toContain("Exact output: 10");
    expect(r.tables.catalog_join.lineage[0]).toHaveLength(2);
  });
  it("pivots retain missing; wider rejects duplicate cells", async () => {
    const b = await example();
    let r = await run(b);
    expect(r.tables.clean.rowCount).toBe(36);
    expect(
      r.tables.clean.profiles.find((p) => p.columnId === "temperature")
        ?.missing,
    ).toBe(3);
    b.project.recipes = [
      {
        id: "bad",
        name: "Ambiguous wide",
        inputRef: { kind: "source", id: "measurements" },
        rowMeaning: "",
        operations: [
          op("wide", "wider", {
            identifiers: [],
            namesId: "region",
            valuesId: "jan",
            aggregate: "error",
            fill: null,
          }),
        ],
      },
    ];
    b.project.charts = [];
    r = await run(b);
    expect(r.errors[0].message).toContain("Duplicate pivot cell keys");
  });
  it("required failed checks preserve computed results", async () => {
    const r = await run(await example());
    expect(r.status).toBe("ready");
    expect(r.tables.metadata_check.rowCount).toBe(7);
    expect(r.diagnostics.some((d) => d.severity === "required")).toBe(true);
  });
  it("rejects cycles with a named path", async () => {
    const b = await fixture();
    b.project.recipes[0].inputRef = { kind: "recipe", id: "recipe" };
    await expect(run(b)).rejects.toThrow("Dependency cycle");
  });
  it("round trips source assets and unfinished drafts in a portable ZIP", async () => {
    const b = await fixture(undefined, [
      { ...op("draft", "filter", {}), draft: true, note: "Finish later" },
    ]);
    const copy = unpackBundle(packBundle(b));
    expect(copy.project).toEqual(b.project);
    expect(copy.assets).toEqual(b.assets);
    expect((await run(copy)).status).toBe("failed");
  });
  it("rejects tampered fingerprints and future versions", async () => {
    const b = await fixture();
    b.assets[b.project.sources[0].assetRef] = new TextEncoder().encode("bad");
    await expect(run(b)).rejects.toThrow("Fingerprint mismatch");
    const p: any = await fixture();
    p.project.schemaVersion = 100;
    expect(() => unpackBundle(packBundle(p))).toThrow("schemaVersion");
  });
  it("source overrides preserve identity and record explicit settings", async () => {
    const b = await fixture();
    await writeFile("/tmp/datacanvas-override.csv", "group,value\nZ,10\n");
    const overrides = [
      {
        sourceId: "src",
        path: "/tmp/datacanvas-override.csv",
        columnMapping: { group: "group", value: "value" },
      },
    ];
    const r = await run(b, { sourceOverrides: overrides });
    expect(rows(r)).toEqual([{ group: "Z", value: 10 }]);
    expect(r.sourceOverrides).toEqual(overrides);
    expect(b.project.sources[0].name).toBe("fixture");
  });
  it("chart counts use all 250 inputs, independent of a 100-row table preview", async () => {
    const b = await fixture(
      "group,value\n" +
        Array.from({ length: 250 }, (_, i) => `A,${i}`).join("\n"),
    );
    const db = await nativeDB();
    try {
      const engine = new Engine(db);
      const r = await engine.run(b);
      expect(r.tables.recipe.rows).toHaveLength(100);
      const chart = {
        id: "chart",
        name: "Count",
        inputRecipeId: "recipe",
        layers: [{ id: "layer", mark: "count" as const, x: "group" }],
        scales: {},
        annotations: "",
      };
      const c = await resolveChart(engine, chart);
      expect(plainValue(c.tables[0].rows[0].layer_stat)).toBe(250);
      expect(c.tables[0].lineage[0]).toHaveLength(250);
      const hist = await resolveChart(engine, {
        ...chart,
        layers: [{ id: "hist", mark: "histogram", x: "value", binWidth: 100 }],
      });
      expect(hist.tables[0].rowCount).toBe(3);
      expect(
        hist.tables[0].rows.reduce(
          (n, row) => n + Number(plainValue(row.hist_stat)),
          0,
        ),
      ).toBe(250);
    } finally {
      await db.close();
    }
  });
  it("preserves large integer values as tagged JSON", async () => {
    const b = await fixture("group,value\nA,9007199254740993\n");
    b.project.sources[0].columns[1].type = "integer";
    const r = await run(b);
    expect(r.tables.recipe.rows[0].value).toEqual({
      type: "integer",
      value: "9007199254740993",
    });
  });
  it("distinguishes literal NA, blank text, malformed overflow and missing tokens", () => {
    const d = parseAsset(
      new TextEncoder().encode("id,value\n001,NA\n002,\n003,x,extra\n"),
      defaultImport,
    );
    expect(d.rows[0]).toEqual(["001", "NA", null]);
    expect(d.rows[1]).toEqual(["002", "", null]);
    expect(d.rows[2][2]).toBe('["extra"]');
    expect(d.issues).toHaveLength(1);
  });
  it("read-only SQL uses parsed structure, rejects external functions and mutation", () => {
    expect(() =>
      validateSQL("WITH x AS (SELECT * FROM data) SELECT count(*) FROM x", [
        "data",
      ]),
    ).not.toThrow();
    for (const sql of [
      "SELECT * FROM read_csv_auto('file.csv')",
      "DROP TABLE data",
      "SELECT * FROM data; DELETE FROM data",
      "SELECT load_extension('x')",
      "SELECT * FROM information_schema.tables",
      "COPY data TO 'x'",
    ])
      expect(() => validateSQL(sql, ["data"]), sql).toThrow();
  });
  it("comparison preserves duplicate multiplicities and null versus text", async () => {
    const b = await fixture("group,value\nA,1\nA,1\nB,2\n");
    const t = (await run(b)).tables.recipe;
    expect(
      compareTables(t, {
        columns: ["group", "value"],
        rows: [
          { group: "B", value: 2 },
          { group: "A", value: 1 },
          { group: "A", value: 1 },
        ],
      }).equal,
    ).toBe(true);
    expect(
      compareTables(t, {
        columns: ["group", "value"],
        rows: [
          { group: "B", value: 2 },
          { group: "B", value: 2 },
          { group: "A", value: 1 },
        ],
      }).equal,
    ).toBe(false);
  });
  it("three ordinary public examples run without computational errors", async () => {
    for (const id of ["temperatures", "transactions", "weighting"]) {
      const r = await run(await example(id));
      expect(r.errors, id).toEqual([]);
      expect(r.charts?.length).toBeGreaterThan(0);
    }
  });
});

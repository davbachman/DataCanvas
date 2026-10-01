import { it, expect } from "vitest";
import { column, blankProject, type Operation } from "../src/domain/model";
import { validateOperation } from "../src/domain/operations";
import { matchColumnNames } from "../src/compiler/regex";
import { nativeDB } from "../src/engine/native";
import { Engine } from "../src/engine/core";
import { createSource, defaultImport } from "../src/persistence/import";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
const params = {
  columns: ["stale_unused_id"],
  mode: "keep",
  selection: "regex",
  pattern: "^sales_",
  ignoreCase: false,
};
async function fixture(empty = false) {
  const project = blankProject();
  const bytes = new TextEncoder().encode(
    "sales_2024,Sales_2025,cost_2025,notes,sales.2025\n" +
      (empty ? "" : "1,2,3,ok,4\n5,6,7,next,8\n"),
  );
  const definitions = [
    column("sales_2024", "integer", "c0"),
    column("Sales_2025", "integer", "c1"),
    column("cost_2025", "integer", "c2"),
    column("notes", "text", "sales_hidden"),
    column("sales.2025", "integer", "c4"),
  ];
  const { source } = await createSource(
    "Data",
    bytes,
    defaultImport,
    definitions,
  );
  project.sources = [source];
  project.recipes = [
    {
      id: "selected",
      name: "Selected",
      inputRef: { kind: "source", id: source.id },
      rowMeaning: "A record",
      operations: [
        { id: "pick", kind: "select", version: 2, params: { ...params } },
      ],
    },
  ];
  return { project, assets: { [source.assetRef]: bytes } };
}
it("selects by display name with RE2, including case, Unicode, and quoted punctuation", async () => {
  const db = await nativeDB();
  try {
    const columns = [
      column("sales_2024", "integer", "c0"),
      column("Sales_2025", "text", "c1"),
      column("Été's.total", "text", "c2"),
      column("unrelated", "text", "sales_id"),
    ];
    expect(await matchColumnNames(db, columns, params)).toEqual([
      { id: "c0", name: "sales_2024" },
    ]);
    expect(
      (
        await matchColumnNames(db, columns, { ...params, ignoreCase: true })
      ).map((c) => c.id),
    ).toEqual(["c0", "c1"]);
    expect(
      (
        await matchColumnNames(db, columns, {
          ...params,
          pattern: "^\\p{L}+'s\\.total$",
        })
      ).map((c) => c.id),
    ).toEqual(["c2"]);
    expect(
      await matchColumnNames(db, [], { ...params, pattern: ".*" }),
    ).toEqual([]);
    await expect(
      matchColumnNames(db, [], { ...params, pattern: "(?=sales)" }),
    ).rejects.toThrow("Invalid column-name RE2 pattern");
  } finally {
    await db.close();
  }
});
it("keep/drop preserve order, identities, row counts, lineage, and portable settings", async () => {
  const db = await nativeDB();
  try {
    const bundle = unpackBundle(packBundle(await fixture()));
    const engine = new Engine(db);
    const first = await engine.run(bundle);
    expect(first.errors).toEqual([]);
    const table = first.tables.selected;
    expect(table.columns.map((c) => c.id)).toEqual(["c0"]);
    expect(table.rowCount).toBe(2);
    expect(table.rows.map((r) => r.c0)).toEqual([
      { type: "integer", value: "1" },
      { type: "integer", value: "5" },
    ]);
    expect(bundle.project.recipes[0].operations[0].version).toBe(2);
    bundle.project.recipes[0].operations[0].params = {
      ...params,
      pattern: "_2025$",
      mode: "drop",
    };
    const dropped = (await engine.run(bundle)).tables.selected;
    expect(dropped.columns.map((c) => c.id)).toEqual([
      "c0",
      "sales_hidden",
      "c4",
    ]);
    expect(dropped.rowCount).toBe(2);
    expect(dropped.lineage).toEqual(table.lineage);
    bundle.project.recipes[0].operations[0].params = {
      ...params,
      pattern: "does_not_match",
    };
    const none = (await engine.run(bundle)).tables.selected;
    expect(none.columns).toEqual([]);
    expect(none.rows).toEqual([{}, {}]);
    expect(none.rowCount).toBe(2);
    bundle.project.recipes[0].operations[0].params.mode = "drop";
    expect((await engine.run(bundle)).tables.selected.columns).toHaveLength(5);
  } finally {
    await db.close();
  }
});
it("re-evaluates upstream renamed and added columns and reports invalid patterns on empty data", async () => {
  const db = await nativeDB();
  try {
    const b = await fixture(true),
      engine = new Engine(db);
    const operations = b.project.recipes[0].operations;
    operations.unshift({
      id: "rename",
      kind: "rename",
      version: 1,
      params: { columnId: "c2", name: "sales_2026" },
    });
    operations.unshift({
      id: "added",
      kind: "derive",
      version: 1,
      params: {
        columnId: "derived",
        name: "sales_extra",
        expression: { kind: "literal", value: 1 },
      },
    });
    let result = await engine.run(b);
    expect(result.errors).toEqual([]);
    expect(result.tables.selected.columns.map((c) => c.id)).toEqual([
      "c0",
      "c2",
      "derived",
    ]);
    expect(result.tables.selected.rowCount).toBe(0);
    operations[1].params.name = "cost_new";
    result = await engine.run(b);
    expect(result.tables.selected.columns.map((c) => c.id)).toEqual([
      "c0",
      "derived",
    ]);
    operations[2].params.pattern = "[";
    result = await engine.run(b);
    expect(result.tables.selected).toBeUndefined();
    expect(result.errors[0].message).toContain(
      "Invalid column-name RE2 pattern",
    );
  } finally {
    await db.close();
  }
});
it("keeps legacy explicit selections compatible and rejects unsupported version combinations", async () => {
  const db = await nativeDB();
  try {
    const b = await fixture();
    b.project.recipes[0].operations = [
      {
        id: "legacy",
        kind: "select",
        version: 1,
        params: { columns: ["c2", "c0"], mode: "keep" },
      },
    ];
    expect(
      (await new Engine(db).run(b)).tables.selected.columns.map((c) => c.id),
    ).toEqual(["c0", "c2"]);
    expect(() =>
      validateOperation({ id: "bad", kind: "select", version: 1, params }),
    ).toThrow("version 2");
    expect(() =>
      validateOperation({
        id: "bad",
        kind: "rename",
        version: 2,
        params: { columnId: "c0", name: "new" },
      }),
    ).toThrow("Unsupported");
  } finally {
    await db.close();
  }
});

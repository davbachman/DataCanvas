import { it, expect } from "vitest";
import * as XLSX from "@e965/xlsx";
import { zipSync, strToU8 } from "fflate";
import { unpackBundle } from "../src/persistence/bundle";
import {
  createSource,
  defaultImport,
  parseAsset,
} from "../src/persistence/import";
import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Bundle,
  type Operation,
} from "../src/domain/model";
import { run } from "../src/headless/api";
import { nativeDB } from "../src/engine/native";
import { Engine } from "../src/engine/core";
import { executeQuery } from "../src/engine/queries";
async function bundle(csv: string, cols: any[], operations: Operation[] = []) {
  const project = blankProject(),
    bytes = new TextEncoder().encode(csv);
  const { source } = await createSource(
    "adversarial",
    bytes,
    { ...defaultImport, missingTokens: ["NULL"] },
    cols,
  );
  source.id = "source";
  project.sources = [source];
  project.recipes = [
    {
      id: "recipe",
      name: "Recipe",
      inputRef: { kind: "source", id: "source" },
      operations,
      rowMeaning: "",
    },
  ];
  return { project, assets: { [source.assetRef]: bytes } } as Bundle;
}
const op = (id: string, kind: string, params: any): Operation => ({
  id,
  kind,
  version: 1,
  params,
});
it("spreadsheet import uses stored values, preserves IDs, and reports missing formula results", () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["id", "value"],
    ["001", 3],
    ["002", null],
  ]);
  sheet.B3 = { t: "n", f: "1+1" };
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  const data = parseAsset(
    XLSX.write(book, { type: "array", bookType: "xlsx" }),
    { ...defaultImport, format: "xlsx", sheet: "Data" },
  );
  expect(data.rows[0]).toEqual(["001", "3"]);
  expect(data.rows[1][1]).toBeNull();
  expect(data.sheets).toEqual(["Data"]);
});
it("archive paths cannot escape the bundle", () => {
  expect(() => unpackBundle(zipSync({ "../escape": strToU8("bad") }))).toThrow(
    "Unsafe archive path",
  );
});
it("quotes in source columns remain ordinary identifiers and values", async () => {
  const b = await bundle(
    '"odd""name",value\n"O\'Brien",1\n',
    [column('odd"name', "text", "odd"), column("value", "decimal", "value")],
    [
      op("rename", "rename", {
        columnId: "odd",
        name: "SELECT; DROP TABLE x;",
      }),
    ],
  );
  const r = await run(b);
  expect(r.errors).toEqual([]);
  expect(r.tables.recipe.rows[0].odd).toBe("O'Brien");
});
it("keyed correction requires one key and the expected old value", async () => {
  const b = await bundle(
    "id,value\nA,1\nA,2\n",
    [column("id", "text", "id"), column("value", "decimal", "value")],
    [
      op("correct", "correction", {
        keys: [{ columnId: "id", value: "A" }],
        columnId: "value",
        oldValue: 1,
        newValue: 5,
        reason: "Transcription error",
      }),
    ],
  );
  expect((await run(b)).errors[0].message).toContain("matches 2 rows");
  b.project.recipes[0].operations[0].params.keys = [
    { columnId: "id", value: "missing" },
  ];
  expect((await run(b)).errors[0].message).toContain("matches 0 rows");
});
it("distinct excludes nulls, missing groups remain visible, and quantiles are continuous", async () => {
  const b = await bundle(
    "group,value\nNULL,1\nNULL,4\nA,NULL\n",
    [column("group", "text", "g"), column("value", "decimal", "v")],
    [
      op("summary", "summarize", {
        groups: ["g"],
        aggregates: [
          { id: "q", name: "q25", fn: "quantile", columnId: "v", q: 0.25 },
          { id: "n", name: "distinct", fn: "distinct", columnId: "v" },
        ],
      }),
    ],
  );
  const r = await run(b);
  expect(r.tables.recipe.rows.find((r) => r.g === null)?.q).toBe(1.75);
  expect(r.tables.recipe.rows.find((r) => r.g === "A")?.n).toEqual({
    type: "integer",
    value: "0",
  });
});
it("explicit date parsing records failures and keeps date meaning", async () => {
  const b = await bundle(
    "id,date\nA,31/01/2025\nB,02/03/2025\nC,invalid\n",
    [column("id", "text", "id"), column("date", "text", "date")],
    [
      op("parse", "parse", {
        columnId: "date",
        type: "date",
        format: "%d/%m/%Y",
        decimalSeparator: ".",
      }),
    ],
  );
  const r = await run(b);
  expect(r.tables.recipe.rows.map((r) => r.date)).toEqual([
    { type: "date", value: "2025-01-31" },
    { type: "date", value: "2025-03-02" },
    null,
  ]);
  expect(r.diagnostics[0].count).toBe(1);
});
it("a numeric expression cannot occupy a Boolean filter slot", async () => {
  const b = await bundle(
    "id,value\nA,1\n",
    [column("id", "text", "id"), column("value", "decimal", "value")],
    [op("filter", "filter", { expression: col("value") })],
  );
  expect((await run(b)).errors[0].message).toContain("Boolean condition");
});
it("pivot category drift does not redirect a disappeared column identity", async () => {
  const b = await bundle(
    "id,key,value\nA,Jan,1\nA,Feb,2\n",
    [
      column("id", "text", "id"),
      column("key", "text", "key"),
      column("value", "decimal", "value"),
    ],
    [
      op("wide", "wider", {
        identifiers: ["id"],
        namesId: "key",
        valuesId: "value",
        aggregate: "error",
        fill: null,
      }),
    ],
  );
  const first = await run(b);
  const feb = first.tables.recipe.columns.find((c) => c.name === "Feb")!.id;
  b.project.recipes[0].operations.push(
    op("keep", "select", { mode: "keep", columns: [feb] }),
  );
  const source = b.project.sources[0];
  const bytes = new TextEncoder().encode("id,key,value\nA,Jan,1\nA,Mar,2\n");
  const { fingerprint } = await import("../src/persistence/import");
  b.assets[source.assetRef] = bytes;
  source.fingerprint = await fingerprint(bytes);
  expect((await run(b)).errors[0].code).toBe("SCHEMA");
});

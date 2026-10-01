import { it, expect } from "vitest";
import { nativeDB } from "../src/engine/native";
import { previewRegex } from "../src/compiler/regex";
import { newOperation } from "../src/domain/operations";
import { blankProject, column } from "../src/domain/model";
import { createSource, defaultImport } from "../src/persistence/import";
import { run } from "../src/headless/api";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
const defaults = newOperation("regex", [column("text", "text", "text")]).params;
it("RE2 handles flags, capture replacements, zero-width matches, Unicode, and literal quoting", async () => {
  const db = await nativeDB();
  const preview = (sample: string, params: any) =>
    previewRegex(db, { ...defaults, ...params }, sample);
  try {
    expect(
      await preview("AB-123 CD-456", {
        action: "replace",
        pattern: "([A-Z]+)-(\\d+)",
        replacement: "\\2/\\1",
      }),
    ).toEqual({ matched: true, result: "123/AB 456/CD" });
    expect(
      await preview("aaa", {
        action: "replace",
        pattern: "a",
        replacement: "x",
        global: false,
      }),
    ).toEqual({ matched: true, result: "xaa" });
    expect(
      (
        await preview("a\nB\nc", {
          pattern: "^b$",
          ignoreCase: true,
          multiline: true,
        })
      ).matched,
    ).toBe(true);
    expect((await preview("a\nb", { pattern: "a.b" })).matched).toBe(false);
    expect(
      (await preview("a\nb", { pattern: "a.b", dotAll: true })).matched,
    ).toBe(true);
    expect((await preview("Élodie", { pattern: "^\\p{L}+$" })).matched).toBe(
      true,
    );
    expect(
      (
        await preview("abc", {
          action: "replace",
          pattern: "^",
          replacement: "'",
        })
      ).result,
    ).toBe("'abc");
    expect(
      (
        await preview("x'); DROP TABLE data; --", {
          pattern: "x'\\); DROP TABLE data; --",
        })
      ).matched,
    ).toBe(true);
    expect(
      (await preview("abc", { action: "extract", pattern: "(z)", group: 1 }))
        .result,
    ).toBeNull();
    expect(
      (await preview("ab", { action: "extract", pattern: "a(b)?", group: 0 }))
        .result,
    ).toBe("ab");
    expect(
      (await preview("a", { action: "extract", pattern: "a(b)?", group: 1 }))
        .result,
    ).toBe("");
  } finally {
    await db.close();
  }
});
it("rejects unsupported RE2 patterns and oversized preview input", async () => {
  const db = await nativeDB();
  try {
    for (const pattern of ["[", "(?<=a)b", "(a)\\1"])
      await expect(
        previewRegex(db, { ...defaults, pattern }, "ab"),
      ).rejects.toThrow("Invalid RE2");
    await expect(previewRegex(db, defaults, "a".repeat(10001))).rejects.toThrow(
      "10,000",
    );
  } finally {
    await db.close();
  }
});
it("regex operations preserve source data, nulls, identities and saved bundle settings", async () => {
  const project = blankProject();
  const bytes = new TextEncoder().encode("text\nAB-123\nnone\nNULL\n");
  const { source } = await createSource(
    "Text",
    bytes,
    { ...defaultImport, missingTokens: ["NULL"] },
    [column("text", "text", "text")],
  );
  project.sources = [source];
  for (const action of ["filter", "replace", "extract"]) {
    const operation = newOperation("regex", source.columns);
    operation.params = {
      ...operation.params,
      action,
      pattern: "([A-Z]+)-(\\d+)",
      replacement: "\\2",
      group: 2,
      outputId: "capture",
    };
    project.recipes.push({
      id: action,
      name: action,
      inputRef: { kind: "source", id: source.id },
      rowMeaning: "A record",
      operations: [operation],
    });
  }
  const b = unpackBundle(
    packBundle({ project, assets: { [source.assetRef]: bytes } }),
  );
  const result = await run(b);
  expect(result.errors).toEqual([]);
  expect(result.tables.filter.rows).toEqual([{ text: "AB-123" }]);
  expect(result.tables.replace.rows).toEqual([
    { text: "123" },
    { text: "none" },
    { text: null },
  ]);
  expect(result.tables.extract.rows).toEqual([
    { text: "AB-123", capture: "123" },
    { text: "none", capture: null },
    { text: null, capture: null },
  ]);
  expect(result.tables.extract.lineage[0]).toEqual(
    result.tables.filter.lineage[0],
  );
  expect(b.assets[source.assetRef]).toEqual(bytes);
  b.project.recipes[0].operations[0].params.negate = true;
  expect((await run(b)).tables.filter.rows).toEqual([{ text: "none" }]);
});

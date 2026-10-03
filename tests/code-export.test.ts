import { it, expect } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { Engine } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { codeExportFixture } from "./fixtures/code-export";
import { exportCode } from "../src/export/code";

it("exports complete scripts, explicit backend coverage and full source assets without executable name comments", async () => {
  const b = await codeExportFixture(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    const result = await engine.run(b, { previewRows: 1 });
    const sources = Object.fromEntries(
      await Promise.all(
        b.project.sources.map(async (s) => [
          s.id,
          await engine.fullTable(s.id),
        ]),
      ),
    );
    expect(result.errors).toEqual([]);
    for (const language of ["python", "r"] as const) {
      const exported = exportCode(b, result, language, sources),
        files = unzipSync(exported.bytes);
      const script = strFromU8(
        files[language === "python" ? "analysis.py" : "analysis.R"],
      );
      expect(script).toContain(
        language === "python" ? "import pandas as pd" : "library(dplyr)",
      );
      expect(exported.nativeSteps).toBeGreaterThan(0);
      expect(exported.sqlSteps).toBeGreaterThan(0);
      expect(script.indexOf('# Recipe: "Recipe')).toBeLessThan(
        script.indexOf('# Recipe: "filtered"'),
      );
      expect(strFromU8(files["steps/regex_extract.sql"])).not.toContain(
        "CREATE TABLE injected",
      );
      expect(strFromU8(files["sources.json"])).toContain("9223372036854775807");
      expect(strFromU8(files["sources.json"])).toContain("9007199254740993");
      expect(files["original/src.csv"]).toEqual(
        b.assets[b.project.sources[0].assetRef],
      );
      expect(JSON.parse(strFromU8(files["outputs.json"]))).toHaveLength(
        b.project.recipes.length,
      );
    }
    // A recipe name change reuses engine caches but must not reuse unsafe comments.
    b.project.recipes.find((r) => r.id === "clean")!.name = "Renamed recipe";
    b.project.revision++;
    const renamed = await engine.run(b);
    expect(() => exportCode(b, renamed, "python")).not.toThrow();
  } finally {
    await db.close();
  }
});

it("refuses stale, partial, stepped and failed executions", async () => {
  const b = await codeExportFixture(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    expect(() => exportCode(b, undefined, "r")).toThrow("Run all outputs");
    const partial = await engine.run(b, { outputIds: ["empty"] });
    expect(() => exportCode(b, partial, "python")).toThrow("Run all outputs");
    const stepped = await engine.run(b, {
      stepRecipeId: "clean",
      stepCount: 0,
    });
    expect(() => exportCode(b, stepped, "r")).toThrow("Run all outputs");
    const full = await engine.run(b);
    const preview = await engine.run(b, { previewRows: 1 });
    expect(() => exportCode(b, preview, "r")).toThrow("complete typed source");
    expect(() => exportCode(b, { ...full, status: "failed" }, "r")).toThrow(
      "Run all outputs",
    );
    b.project.revision++;
    expect(() => exportCode(b, full, "python")).toThrow("Run all outputs");
  } finally {
    await db.close();
  }
});

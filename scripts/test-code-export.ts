import { teachingFixture } from "../tests/fixtures/teaching";
/** Execute the actual generated scripts in both languages and compare every cell. */
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { Engine } from "../src/engine/core";
import { DuckDBInstance } from "@duckdb/node-api";
import { quote as q, literal as l } from "../src/compiler/expressions";
import { example, exampleInfo } from "../src/examples";
import { codeExportFixture } from "../tests/fixtures/code-export";
import { exportCode, type CodeLanguage } from "../src/export/code";
import { compareTables } from "../src/engine/queries";

const languages = (
  process.argv.slice(2).length ? process.argv.slice(2) : ["python", "r"]
) as CodeLanguage[];
const fixtures = [
  { name: "teaching", load: teachingFixture },
  ...exampleInfo.map((e) => ({ name: e.id, load: () => example(e.id) })),
  { name: "edge-cases", load: codeExportFixture },
];
const sqlTypes: Record<string, string> = {
  text: "VARCHAR",
  integer: "BIGINT",
  decimal: "DOUBLE",
  boolean: "BOOLEAN",
  date: "DATE",
  timestamp: "TIMESTAMP",
};
for (const fixture of fixtures) {
  const bundle = await fixture.load();
  // This test-only connection reads the generated CSVs. Production engine access remains disabled.
  const instance = await DuckDBInstance.create(":memory:", { threads: "2" });
  const connection = await instance.connect();
  const db = {
    query: async (sql: string) =>
      (await connection.runAndReadAll(sql)).getRowObjects(),
    exec: async (sql: string) => {
      await connection.run(sql);
    },
    close: async () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
  const engine = new Engine(db);
  const root = await mkdtemp(join(tmpdir(), "datacanvas-code-"));
  try {
    const result = await engine.run(bundle, { previewRows: 1 });
    assert.equal(result.status, "ready", JSON.stringify(result.errors));
    const sources = Object.fromEntries(
      await Promise.all(
        bundle.project.sources.map(async (s) => [
          s.id,
          await engine.fullTable(s.id),
        ]),
      ),
    );
    for (const language of languages) {
      const folder = join(root, language);
      const exported = exportCode(bundle, result, language, sources);
      const scriptName = language === "python" ? "analysis.py" : "analysis.R";
      const probe =
        language === "python"
          ? '\n(ROOT / "frame-probe.json").write_text(json.dumps({key: {str(name): [None if pd.isna(x) else str(x) for x in frame[name]] for name in frame.columns} for key, frame in outputs.items()}), encoding="utf-8")\n'
          : '\nwrite_json(lapply(outputs, function(frame) lapply(frame, as.character)), file.path(ROOT, "frame-probe.json"), na = "null")\n';
      for (const [name, bytes] of Object.entries(exported.files)) {
        await mkdir(dirname(join(folder, name)), { recursive: true });
        await writeFile(join(folder, name), bytes);
      }
      await writeFile(
        join(folder, scriptName),
        new TextDecoder().decode(exported.files[scriptName]) + probe,
      );
      const command =
        language === "python"
          ? process.env.PYTHON || "python3"
          : process.env.RSCRIPT || "Rscript";
      execFileSync(
        command,
        [join(folder, language === "python" ? "analysis.py" : "analysis.R")],
        { cwd: tmpdir(), timeout: 120000, stdio: "pipe" },
      );
      const frames = JSON.parse(
        await readFile(join(folder, "frame-probe.json"), "utf8"),
      );
      for (const recipe of bundle.project.recipes) {
        const table = result.tables[recipe.id],
          relation = engine.relations.get(recipe.id)!;
        if (!table.columns.length) {
          assert.equal(
            JSON.parse(
              await readFile(
                join(folder, "results", recipe.id + ".json"),
                "utf8",
              ),
            ).rows,
            table.rowCount,
          );
          continue;
        }
        const path = join(folder, "results", recipe.id + ".csv");
        const schema = table.columns
          .map((c) => `${l(c.name)}: ${l(sqlTypes[c.type])}`)
          .join(", ");
        const select = table.columns
          .map((c) => `${q(c.name)} AS ${q(c.id)}`)
          .join(", ");
        await db.exec(
          `CREATE OR REPLACE TABLE exported AS SELECT ${select}, row_number() OVER ()::VARCHAR AS __rid, []::VARCHAR[] AS __lineage FROM read_csv(${l(path)}, header=true, columns={${schema}}, nullstr='', allow_quoted_nulls=false)`,
        );
        const actual = await engine.snapshot(
          "exported",
          { ...relation, cacheKey: undefined, name: "exported" },
          1000000,
        );
        const expected = await engine.fullTable(recipe.id);
        for (const column of table.columns.filter(
          (c) => c.type === "integer",
        )) {
          const values = expected.rows.map((row) =>
            row[column.id] === null
              ? null
              : (row[column.id] as { value: string }).value,
          );
          assert.deepEqual(
            frames[recipe.id][column.name].slice().sort(),
            values.sort(),
            `${language}/${recipe.id}/${column.name}: collected frame preserves int64 values`,
          );
        }
        const comparison = compareTables(
          expected,
          {
            columns: table.columns.map((c) => c.name),
            schema: table.columns,
            rows: actual.rows.map((row) =>
              Object.fromEntries(table.columns.map((c) => [c.name, row[c.id]])),
            ),
          },
          1e-12,
          table.ordered,
        );
        assert.equal(
          comparison.equal,
          true,
          `${fixture.name}/${language}/${recipe.id}: ${JSON.stringify(comparison)}`,
        );
      }
      console.log(
        `${fixture.name}: ${language} results match all ${bundle.project.recipes.length} recipe outputs (${exported.nativeSteps} native, ${exported.sqlSteps} SQL steps)`,
      );
    }
  } catch (e) {
    console.error(
      `Export execution failed for ${fixture.name}; generated files: ${root}`,
    );
    if ((e as any).stderr) console.error(String((e as any).stderr));
    throw e;
  } finally {
    await db.close();
  }
  await rm(root, { recursive: true, force: true });
}

import { useState } from "react";
import type { Project } from "../domain/model";
import type { RunResult } from "../engine/core";
import { stepCode } from "../export/code";
import { registry } from "../domain/operations";
export function CodeView({
  project,
  result,
}: {
  project: Project;
  result?: RunResult;
}) {
  const [selected, setSelected] = useState(""),
    [language, setLanguage] = useState<"sql" | "python" | "r">("python");
  const current = result?.revision === project.revision ? result : undefined;
  const relation = (id: string): string => {
    const r = project.recipes.find((r) => r.id === id);
    return !r
      ? "source_" + id
      : r.operations.length
        ? "step_" + r.operations.at(-1)!.id
        : relation(r.inputRef.id);
  };
  const entries = project.recipes.flatMap((r) =>
    r.operations.map((op, i) => {
      const step = current?.steps[r.id]?.find((s) => s.operationId === op.id);
      const input = i
        ? "step_" + r.operations[i - 1].id
        : relation(r.inputRef.id);
      return {
        r,
        op,
        i,
        step,
        translation: step?.after
          ? stepCode(
              op,
              step.before.columns,
              step.after.columns,
              language === "r" ? "r" : "python",
              input,
            )
          : undefined,
      };
    }),
  );
  const active = entries.find((e) => e.op.id === selected) || entries[0];
  return (
    <section className="teaching-panel">
      <h2>Recipe → code</h2>
      <p>
        Run all outputs to see current compiled steps. The snippets below use
        the same translation as the downloadable exports. Choose File → Export
        to obtain the runtime helpers, complete sources, and runnable scripts.
      </p>
      <label className="field">
        <span>Code language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as any)}
        >
          <option value="sql">DuckDB SQL</option>
          <option value="python">Python / pandas</option>
          <option value="r">R / tidyverse</option>
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>Recipe / visual step</th>
            <th>Stable step ID</th>
            <th>Backend coverage</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.op.id}>
              <td>
                <button onClick={() => setSelected(e.op.id)}>
                  {e.r.name} · {e.i + 1}.{" "}
                  {registry[e.op.kind as keyof typeof registry]?.label ||
                    e.op.kind}
                </button>
              </td>
              <td>
                <code>{e.op.id}</code>
              </td>
              <td>
                {!e.translation
                  ? "Run required"
                  : language === "sql"
                    ? "DuckDB SQL"
                    : e.translation.backend}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {active && (
        <>
          <h3>
            {active.r.name} · {active.i + 1}.{" "}
            {registry[active.op.kind as keyof typeof registry]?.label ||
              active.op.kind}
          </h3>
          <p>{active.op.note}</p>
          {!active.step?.after ? (
            <p role="status">
              {active.step?.error ||
                "This step has no complete result. Finish any draft steps and run all outputs."}
            </p>
          ) : (
            <>
              <pre>
                {language === "sql"
                  ? active.step.statement
                  : active.translation?.code}
              </pre>
              {language !== "sql" &&
                active.translation?.backend === "DuckDB SQL" && (
                  <>
                    <p>
                      This step executes the compiled DuckDB SQL below to
                      preserve its semantics.
                    </p>
                    <pre>{active.step.statement}</pre>
                  </>
                )}
              <details open>
                <summary>Display names and stable identifiers</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Column label</th>
                      <th>Code identifier</th>
                      <th>Storage / time meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.step.after.columns.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>
                          <code>{c.id}</code>
                        </td>
                        <td>
                          {c.type}
                          {c.timeBasis ? ` · ${c.timeBasis}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
      <details open>
        <summary>Dependencies, dialect, and reproducibility</summary>
        <p>
          SQL uses DuckDB 1.5.4 and its RE2 regular expressions. Python exports
          require duckdb 1.5.4, pandas, and numpy. R exports require DuckDB
          1.5.4, DBI, dplyr, dbplyr, jsonlite, tibble, and bit64; see each
          archive’s installation instructions. Pandas steps operate on data
          frames; dplyr/dbplyr steps are lazy database operations. Both use
          DuckDB helpers for types, stable row identities, and lineage. Other
          steps execute DuckDB SQL directly; coverage.json lists each backend.
        </p>
        <p>
          sources.json contains complete, typed, frozen source snapshots.
          Original CSV/XLSX files are included for provenance, but the generated
          analysis reads the snapshot. Editing an original CSV in the archive
          does not update it. Replace/reimport the source in Data Canvas,
          recompute, and export again. Portable projects retain original assets
          so browser and headless runs can recompute them.
        </p>
        <p>
          Recipe transformations are executable. Charts (including uncertainty
          statistics), report prose, linked selections, and SQL workspace
          queries remain project metadata; they are not translated into
          executable plotting, reporting, or query scripts. Use chart
          statistical-table exports for displayed statistics. Compiler-time
          checks are frozen in the exported statements and are not all rerun if
          you manually change code or snapshots.
        </p>
      </details>
    </section>
  );
}

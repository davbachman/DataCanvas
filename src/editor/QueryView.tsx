import { useState } from "react";
import { Play, Plus } from "lucide-react";
import type { Project, Query } from "../domain/model";
import { uid } from "../domain/model";
import { displayValue } from "../engine/core";
import { WorkerClient } from "../engine/client";
import { Select, Text } from "./Configure";
export function QueryView({
  project,
  client,
  onChange,
}: {
  project: Project;
  client: WorkerClient;
  onChange: (queries: Query[]) => void;
}) {
  const [id, setId] = useState(project.queries[0]?.id || ""),
    [result, setResult] = useState<any>(),
    [error, setError] = useState(""),
    [compare, setCompare] = useState(""),
    [busy, setBusy] = useState(false),
    [tolerance, setTolerance] = useState(1e-9),
    [ordered, setOrdered] = useState(false);
  const query = project.queries.find((q) => q.id === id) || project.queries[0];
  const set = (patch: Partial<Query>) => {
    if (query)
      onChange(
        project.queries.map((q) =>
          q.id === query.id ? { ...q, ...patch } : q,
        ),
      );
  };
  return (
    <section className="query-editor">
      <div className="editor-heading">
        <div>
          <div className="eyebrow">A bridge to text</div>
          <h2>SQL workspace</h2>
          <p className="muted">
            Read-only SELECT / WITH over explicitly registered tables. Query
            results are terminal views.
          </p>
        </div>
        <button
          onClick={() => {
            const id = uid("query"),
              r = project.recipes[0];
            onChange([
              ...project.queries,
              {
                id,
                name: "New query",
                sqlText: 'SELECT * FROM "data"',
                tableBindings: r ? { data: r.id } : {},
              },
            ]);
            setId(id);
          }}
        >
          <Plus size={16} />
          New query
        </button>
      </div>
      {query ? (
        <>
          <div className="query-controls">
            <Select
              label="Saved query"
              value={query.id}
              options={project.queries.map((q) => ({
                value: q.id,
                label: q.name,
              }))}
              onChange={setId}
            />
            <Text
              label="Name"
              value={query.name}
              onChange={(name) => set({ name })}
            />
          </div>
          <div className="query-bindings">
            {Object.entries(query.tableBindings).map(([name, id]) => (
              <Select
                key={name}
                label={`Table binding: ${name}`}
                value={id}
                options={[...project.sources, ...project.recipes].map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
                onChange={(v) =>
                  set({ tableBindings: { ...query.tableBindings, [name]: v } })
                }
              />
            ))}
            <button
              onClick={() =>
                set({
                  tableBindings: {
                    ...query.tableBindings,
                    ["table_" + (Object.keys(query.tableBindings).length + 1)]:
                      project.recipes[0]?.id,
                  },
                })
              }
            >
              + Table binding
            </button>
          </div>
          <textarea
            className="sql-editor"
            spellCheck={false}
            aria-label="Analytical SQL"
            value={query.sqlText}
            onChange={(e) => set({ sqlText: e.target.value })}
          />
          <div className="query-controls">
            <Select
              label="Compare with recipe"
              value={compare}
              options={[
                { value: "", label: "No comparison" },
                ...project.recipes.map((r) => ({ value: r.id, label: r.name })),
              ]}
              onChange={setCompare}
            />
            <Text
              label="Absolute numeric tolerance"
              value={tolerance}
              type="number"
              onChange={setTolerance}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={ordered}
                onChange={(e) => setOrdered(e.target.checked)}
              />
              Compare order
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setResult(undefined);
                try {
                  setResult(
                    await client.request("query", {
                      query,
                      compareId: compare || undefined,
                      tolerance,
                      ordered,
                    }),
                  );
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Play size={15} />
              {busy ? "Running…" : "Run query"}
            </button>
          </div>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {result?.comparison && (
            <p
              className={
                result.comparison.equal ? "success-box" : "warning-box"
              }
            >
              {result.comparison.equal ? "Equivalent · " : "Different · "}
              {result.comparison.message}
            </p>
          )}
          {result && (
            <>
              <p>{result.rows.length} rows · showing up to 100</p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {result.columns.map((c: string) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((r: any, i: number) => (
                      <tr key={i}>
                        {result.columns.map((c: string) => (
                          <td key={c}>{displayValue(r[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty-state">
          <h3>A different way to ask the same question.</h3>
          <p>
            Create a query, bind your tables, and compare the result with a
            recipe.
          </p>
        </div>
      )}
    </section>
  );
}

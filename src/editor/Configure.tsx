import { ColumnRegexPreview } from "./ColumnRegexPreview";
import { RegexPreview } from "./RegexPreview";
import type { Column, Operation, Project, Ref } from "../domain/model";
import { aggregates, registry, type OpKind } from "../domain/operations";
import { ExpressionEditor } from "./Expression";
import { uid } from "../domain/model";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: any) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) : e.target.value)
        }
      />
    </Field>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <Field label={label}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>
              {o.replaceAll("_", " ")}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}
export function ColumnSelect({
  label = "Column",
  value,
  onChange,
  columns,
  optional = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  columns: Column[];
  optional?: boolean;
}) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: optional ? "None" : "Choose column…" },
        ...columns.map((c) => ({ value: c.id, label: c.name })),
      ]}
    />
  );
}
export function Multi({
  label,
  value,
  onChange,
  columns,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  columns: Column[];
}) {
  return (
    <fieldset className="multi">
      <legend>{label}</legend>
      {columns.map((c) => (
        <label key={c.id}>
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, c.id]
                  : value.filter((id) => id !== c.id),
              )
            }
          />
          {c.name}
        </label>
      ))}
      {!columns.length && (
        <small>No current columns. Run prerequisite steps.</small>
      )}
    </fieldset>
  );
}
export function RefSelect({
  label,
  value,
  onChange,
  project,
}: {
  label: string;
  value: Ref;
  onChange: (v: Ref) => void;
  project: Project;
}) {
  return (
    <Select
      label={label}
      value={value ? `${value.kind}:${value.id}` : ""}
      onChange={(v) => {
        const [kind, id] = v.split(":");
        onChange({ kind: kind as Ref["kind"], id });
      }}
      options={[
        { value: "", label: "Choose table…" },
        ...project.sources.map((s) => ({
          value: "source:" + s.id,
          label: s.name + " · source",
        })),
        ...project.recipes.map((r) => ({
          value: "recipe:" + r.id,
          label: r.name + " · recipe",
        })),
      ]}
    />
  );
}
export function Configure({
  operation: o,
  columns,
  project,
  onChange,
  referenceColumns,
  previewRegex,
  previewColumnRegex,
}: {
  previewColumnRegex: (
    params: any,
    columns: Column[],
  ) => Promise<{ id: string; name: string }[]>;
  previewRegex: (params: any, sample: string) => Promise<any>;
  operation: Operation;
  columns: Column[];
  project: Project;
  onChange: (o: Operation) => void;
  referenceColumns: (ref: Ref) => Column[];
}) {
  const p = o.params;
  const set = (key: string, v: any) =>
    onChange({ ...o, params: { ...p, [key]: v } });
  const columnField = (key = "columnId", label = "Column") => (
    <ColumnSelect
      label={label}
      columns={columns}
      value={p[key]}
      onChange={(v) => set(key, v)}
    />
  );
  const multi = (key: string, label: string) => (
    <Multi
      label={label}
      columns={columns}
      value={p[key]}
      onChange={(v) => set(key, v)}
    />
  );
  const select = (key: string, label: string, options: string[]) => (
    <Select
      label={label}
      value={p[key]}
      onChange={(v) => set(key, v)}
      options={options}
    />
  );
  const text = (key: string, label: string, type = "text") => (
    <Text
      label={label}
      value={p[key]}
      onChange={(v) => set(key, v)}
      type={type}
    />
  );
  const expression = (key = "expression", label = "Expression") => (
    <ExpressionEditor
      label={label}
      value={p[key]}
      columns={columns}
      onChange={(v) => set(key, v)}
    />
  );
  const order = (key: string) => (
    <div>
      {p[key].map((k: any, i: number) => (
        <fieldset className="subform" key={i}>
          <ColumnSelect
            label={`Sort ${i + 1}`}
            value={k.columnId}
            columns={columns}
            onChange={(v) =>
              set(
                key,
                p[key].map((x: any, j: number) =>
                  i === j ? { ...x, columnId: v } : x,
                ),
              )
            }
          />
          <Select
            label="Direction"
            value={k.direction}
            options={["asc", "desc"]}
            onChange={(v) =>
              set(
                key,
                p[key].map((x: any, j: number) =>
                  i === j ? { ...x, direction: v } : x,
                ),
              )
            }
          />
          <Select
            label="Missing placement"
            value={k.nulls}
            options={["first", "last"]}
            onChange={(v) =>
              set(
                key,
                p[key].map((x: any, j: number) =>
                  i === j ? { ...x, nulls: v } : x,
                ),
              )
            }
          />
          <button
            onClick={() =>
              set(
                key,
                p[key].filter((_: any, j: number) => j !== i),
              )
            }
          >
            Remove sort key
          </button>
        </fieldset>
      ))}
      <button
        onClick={() =>
          set(key, [
            ...p[key],
            { columnId: columns[0]?.id || "", direction: "asc", nulls: "last" },
          ])
        }
      >
        + Sort key
      </button>
    </div>
  );
  return (
    <div className="configure">
      <div className="eyebrow">
        {registry[o.kind as OpKind]?.category} operation
      </div>
      <h3>{registry[o.kind as OpKind]?.label}</h3>
      <p className="muted">{registry[o.kind as OpKind]?.description}</p>
      {o.kind === "filter" && expression()}
      {o.kind === "derive" && (
        <>
          {text("name", "New column name")}
          {expression()}
        </>
      )}
      {o.kind === "select" && (
        <>
          {select("mode", "Action", ["keep", "drop"])}
          <Select
            label="Select by"
            value={p.selection || "explicit"}
            options={[
              { value: "explicit", label: "Explicit columns" },
              { value: "regex", label: "Regular expression" },
            ]}
            onChange={(selection) =>
              onChange({
                ...o,
                version: selection === "regex" ? 2 : 1,
                params: {
                  ...p,
                  selection,
                  pattern: p.pattern ?? ".*",
                  ignoreCase: p.ignoreCase ?? false,
                },
              })
            }
          />
          {p.selection === "regex" ? (
            <>
              <Field label="Column name pattern (RE2)">
                <textarea
                  spellCheck={false}
                  className="regex-pattern"
                  value={p.pattern ?? ""}
                  onChange={(e) => set("pattern", e.target.value)}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!p.ignoreCase}
                  onChange={(e) => set("ignoreCase", e.target.checked)}
                />
                Ignore case
              </label>
              <small>
                Matches anywhere in display names; use ^sales_ or _2025$ to
                anchor. Re-evaluated on each run after upstream renames or
                schema changes. No matches: keep retains zero columns; drop
                retains all. Row count and column order stay unchanged.
              </small>
              <ColumnRegexPreview
                key={o.id}
                params={p}
                columns={columns}
                preview={previewColumnRegex}
              />
            </>
          ) : (
            multi("columns", "Columns")
          )}
        </>
      )}
      {o.kind === "rename" && (
        <>
          {columnField()}
          {text("name", "New name")}
        </>
      )}
      {o.kind === "sort" && order("keys")}
      {o.kind === "sample" && (
        <>
          {text(
            "size",
            p.fraction ? "Fraction (0–1)" : "Number of rows",
            "number",
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={p.fraction}
              onChange={(e) => set("fraction", e.target.checked)}
            />
            Use a fraction
          </label>
          {text("seed", "Saved seed")}
          <small>md5-rank-v1 · without replacement</small>
        </>
      )}
      {o.kind === "parse" && (
        <>
          {columnField()}
          {select("type", "Parse as", [
            "decimal",
            "integer",
            "boolean",
            "date",
            "timestamp",
          ])}
          {["date", "timestamp"].includes(p.type) && (
            <>
              {text("format", "Explicit format (%Y-%m-%d)")}
              <small>Timezone: UTC. Ambiguous formats are never guessed.</small>
            </>
          )}
          {select("decimalSeparator", "Decimal separator", [".", ","])}
        </>
      )}
      {o.kind === "text" && (
        <>
          {columnField()}
          {select("action", "Text operation", [
            "trim",
            "lower",
            "upper",
            "replace",
          ])}
          {p.action === "replace" && (
            <>
              {text("search", "Find exact text")}
              {text("replacement", "Replace with")}
            </>
          )}
        </>
      )}
      {o.kind === "regex" && (
        <>
          {columnField()}
          {select("action", "Pattern operation", [
            "filter",
            "replace",
            "extract",
          ])}
          <Field label="Pattern (RE2)">
            <textarea
              spellCheck={false}
              className="regex-pattern"
              value={p.pattern}
              onChange={(e) => set("pattern", e.target.value)}
            />
          </Field>
          {[
            ["ignoreCase", "Ignore case"],
            ["multiline", "Multiline anchors (^ and $)"],
            ["dotAll", "Dot matches newlines"],
            ...(p.action === "filter"
              ? [["negate", "Keep nonmatching rows"]]
              : []),
            ...(p.action === "replace"
              ? [["global", "Replace every match"]]
              : []),
          ].map(([key, label]) => (
            <label className="check" key={key}>
              <input
                type="checkbox"
                checked={p[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
          {p.action === "replace" && (
            <>
              {text("replacement", "Replacement text")}
              <small>Use \1 through \9 for captured groups.</small>
            </>
          )}
          {p.action === "extract" && (
            <>
              {text("group", "Capture group (0 = whole match)", "number")}
              {text("name", "New column name")}
            </>
          )}
          <small>
            Searches anywhere in the text. Use ^…$ for a whole value. RE2
            supports captures and Unicode classes; lookaround and pattern
            backreferences are unsupported. Missing values are excluded by
            either filter and preserved by transformations.
          </small>
          <RegexPreview key={o.id} params={p} preview={previewRegex} />
        </>
      )}
      {o.kind === "split" && (
        <>
          {columnField()}
          {text("delimiter", "Literal delimiter")}
          <Text
            label="Output names (comma separated)"
            value={p.names.join(",")}
            onChange={(v) => {
              const names = v.split(",");
              onChange({
                ...o,
                params: {
                  ...p,
                  names,
                  ids: names.map(
                    (_: string, i: number) => p.ids[i] || uid("c"),
                  ),
                },
              });
            }}
          />
        </>
      )}
      {o.kind === "recode" && (
        <>
          {columnField()}
          {p.mappings.map((m: any, i: number) => (
            <div className="subform" key={i}>
              <Text
                label="From (exact)"
                value={m.from}
                onChange={(v) =>
                  set(
                    "mappings",
                    p.mappings.map((m: any, j: number) =>
                      i === j ? { ...m, from: v } : m,
                    ),
                  )
                }
              />
              <Text
                label="To"
                value={m.to ?? ""}
                onChange={(v) =>
                  set(
                    "mappings",
                    p.mappings.map((m: any, j: number) =>
                      i === j ? { ...m, to: v } : m,
                    ),
                  )
                }
              />
              <button
                onClick={() =>
                  set(
                    "mappings",
                    p.mappings.filter((_: any, j: number) => j !== i),
                  )
                }
              >
                Remove mapping
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              set("mappings", [...p.mappings, { from: "", to: "" }])
            }
          >
            + Category mapping
          </button>
          {select("unmatched", "Unmatched values", [
            "keep",
            "missing",
            "error",
          ])}
        </>
      )}
      {o.kind === "missing" && (
        <>
          {multi("columns", "Selected columns")}
          {select("action", "Missing values", ["keep", "drop", "replace"])}
          {p.action === "replace" && (
            <>
              <Select
                label="Replacement type"
                value={typeof p.replacement}
                options={["string", "number", "boolean"]}
                onChange={(v) =>
                  set(
                    "replacement",
                    v === "number" ? 0 : v === "boolean" ? false : "",
                  )
                }
              />
              <Text
                label="Replacement"
                value={String(p.replacement ?? "")}
                onChange={(v) =>
                  set(
                    "replacement",
                    typeof p.replacement === "number"
                      ? Number(v)
                      : typeof p.replacement === "boolean"
                        ? v === "true"
                        : v,
                  )
                }
              />
            </>
          )}
        </>
      )}
      {o.kind === "duplicates" && (
        <>
          {multi("columns", "Compare columns")}
          {select("action", "Action", ["identify", "remove"])}
          {p.action === "remove" && order("order")}
          <small>Ties: keep smallest stable source-row ID.</small>
        </>
      )}
      {o.kind === "correction" && (
        <>
          {p.keys.map((k: any, i: number) => (
            <div key={i} className="subform">
              <ColumnSelect
                label="Key"
                value={k.columnId}
                columns={columns}
                onChange={(v) =>
                  set(
                    "keys",
                    p.keys.map((x: any, j: number) =>
                      i === j ? { ...x, columnId: v } : x,
                    ),
                  )
                }
              />
              <Text
                label="Key value"
                value={k.value}
                onChange={(v) =>
                  set(
                    "keys",
                    p.keys.map((x: any, j: number) =>
                      i === j ? { ...x, value: v } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          {columnField()}
          <Text
            label="Old value (empty = missing)"
            value={p.oldValue ?? ""}
            onChange={(v) => set("oldValue", v === "" ? null : v)}
          />
          <Text
            label="New value (empty = missing)"
            value={p.newValue ?? ""}
            onChange={(v) => set("newValue", v === "" ? null : v)}
          />
          {text("reason", "Required explanation")}
        </>
      )}
      {o.kind === "longer" && (
        <>
          {multi("columns", "Value columns to lengthen")}
          {text("namesTo", "Names into")}
          {text("valuesTo", "Values into")}
          <label className="check">
            <input
              type="checkbox"
              checked={p.dropMissing}
              onChange={(e) => set("dropMissing", e.target.checked)}
            />
            Explicitly drop missing values
          </label>
        </>
      )}
      {o.kind === "wider" && (
        <>
          {multi("identifiers", "Identifier columns")}
          {columnField("namesId", "Names from")}
          {columnField("valuesId", "Values from")}
          {select("aggregate", "Duplicate cell keys", ["error", ...aggregates])}
          <Text
            label="Absent cells (empty = missing)"
            value={p.fill ?? ""}
            onChange={(v) =>
              set(
                "fill",
                v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : v,
              )
            }
          />
        </>
      )}
      {o.kind === "join" && (
        <>
          <RefSelect
            label="Right table"
            project={project}
            value={p.right}
            onChange={(v) => set("right", v)}
          />
          {select("how", "Join type", [
            "left",
            "inner",
            "full",
            "semi",
            "anti",
          ])}
          {p.keys.map((k: any, i: number) => (
            <fieldset className="subform" key={i}>
              <ColumnSelect
                label="Left key"
                value={k.left}
                columns={columns}
                onChange={(v) =>
                  set(
                    "keys",
                    p.keys.map((x: any, j: number) =>
                      i === j ? { ...x, left: v } : x,
                    ),
                  )
                }
              />
              <ColumnSelect
                label="Right key"
                value={k.right}
                columns={referenceColumns(p.right)}
                onChange={(v) =>
                  set(
                    "keys",
                    p.keys.map((x: any, j: number) =>
                      i === j ? { ...x, right: v } : x,
                    ),
                  )
                }
              />
              <button
                onClick={() =>
                  set(
                    "keys",
                    p.keys.filter((_: any, j: number) => j !== i),
                  )
                }
              >
                Remove key pair
              </button>
            </fieldset>
          ))}
          <button
            onClick={() =>
              set("keys", [
                ...p.keys,
                {
                  left: columns[0]?.id || "",
                  right: referenceColumns(p.right)[0]?.id || "",
                },
              ])
            }
          >
            + Composite key
          </button>
          {select("relationship", "Expected relationship", [
            "many-to-one",
            "one-to-one",
            "one-to-many",
            "many-to-many",
          ])}
          <Multi
            label="Include right columns"
            columns={referenceColumns(p.right)}
            value={p.rightColumns}
            onChange={(v) => set("rightColumns", v)}
          />
          {p.rightColumns.map((id: string) => (
            <Text
              key={id}
              label={`Alias: ${referenceColumns(p.right).find((c) => c.id === id)?.name}`}
              value={p.aliases[id] || ""}
              onChange={(v) => set("aliases", { ...p.aliases, [id]: v })}
            />
          ))}
          {text("maxRows", "Maximum projected rows", "number")}
        </>
      )}
      {o.kind === "append" && (
        <>
          {p.inputs.map((ref: Ref, i: number) => (
            <RefSelect
              key={i}
              label={`Append table ${i + 1}`}
              project={project}
              value={ref}
              onChange={(v) =>
                set(
                  "inputs",
                  p.inputs.map((r: Ref, j: number) => (i === j ? v : r)),
                )
              }
            />
          ))}
          <button
            onClick={() =>
              set("inputs", [
                ...p.inputs,
                { kind: "source", id: project.sources[0]?.id || "" },
              ])
            }
          >
            + Table
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={p.union}
              onChange={(e) => set("union", e.target.checked)}
            />
            Union of columns; fill absent values with missing
          </label>
        </>
      )}
      {o.kind === "summarize" && (
        <>
          {multi("groups", "Group by (none = overall)")}
          {p.aggregates.map((a: any, i: number) => (
            <fieldset className="subform" key={a.id}>
              <Text
                label="Output name"
                value={a.name}
                onChange={(v) =>
                  set(
                    "aggregates",
                    p.aggregates.map((a: any, j: number) =>
                      i === j ? { ...a, name: v } : a,
                    ),
                  )
                }
              />
              <Select
                label="Aggregate"
                value={a.fn}
                options={[...aggregates]}
                onChange={(v) =>
                  set(
                    "aggregates",
                    p.aggregates.map((a: any, j: number) =>
                      i === j ? { ...a, fn: v } : a,
                    ),
                  )
                }
              />
              {a.fn !== "count" && (
                <ColumnSelect
                  value={a.columnId}
                  columns={columns}
                  onChange={(v) =>
                    set(
                      "aggregates",
                      p.aggregates.map((a: any, j: number) =>
                        i === j ? { ...a, columnId: v } : a,
                      ),
                    )
                  }
                />
              )}{" "}
              {a.fn === "quantile" && (
                <Text
                  label="Quantile (0–1)"
                  type="number"
                  value={a.q ?? 0.5}
                  onChange={(v) =>
                    set(
                      "aggregates",
                      p.aggregates.map((a: any, j: number) =>
                        i === j ? { ...a, q: v } : a,
                      ),
                    )
                  }
                />
              )}
              <button
                onClick={() =>
                  set(
                    "aggregates",
                    p.aggregates.filter((_: any, j: number) => i !== j),
                  )
                }
              >
                Remove aggregate
              </button>
            </fieldset>
          ))}
          <button
            onClick={() =>
              set("aggregates", [
                ...p.aggregates,
                {
                  id: uid("c"),
                  name: "new_summary",
                  fn: "mean",
                  columnId: columns[0]?.id || "",
                },
              ])
            }
          >
            + Aggregate
          </button>
        </>
      )}
      {o.kind === "proportion" && (
        <>
          {multi("groups", "Group by")}
          {expression("denominator", "Denominator population")}
          {expression("numerator", "Numerator condition")}
          {text("name", "Proportion name")}
        </>
      )}
      {o.kind === "check" && (
        <>
          {select("test", "Assertion", [
            "unique",
            "nonmissing",
            "categories",
            "range",
            "row_count",
            "reference",
          ])}
          {multi("columns", "Check columns")}
          {select("severity", "Severity", ["advisory", "required"])}
          {["range", "row_count"].includes(p.test) && (
            <>
              {text("min", "Minimum", "number")}
              {text("max", "Maximum", "number")}
            </>
          )}
          {p.test === "categories" && (
            <Text
              label="Allowed categories (comma separated)"
              value={p.allowed.join(",")}
              onChange={(v) => set("allowed", v.split(","))}
            />
          )}{" "}
          {p.test === "reference" && (
            <>
              <RefSelect
                label="Reference table"
                project={project}
                value={p.reference}
                onChange={(v) => set("reference", v)}
              />
              <Multi
                label="Reference keys (same order)"
                columns={p.reference ? referenceColumns(p.reference) : []}
                value={p.referenceColumns || []}
                onChange={(v) => set("referenceColumns", v)}
              />
            </>
          )}
        </>
      )}
      <Field label="Why is this change appropriate?">
        <textarea
          rows={3}
          value={o.note || ""}
          onChange={(e) => onChange({ ...o, note: e.target.value })}
          placeholder="Add a note for your future self…"
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={!!o.draft}
          onChange={(e) => onChange({ ...o, draft: e.target.checked })}
        />
        Save as unfinished draft
      </label>
    </div>
  );
}

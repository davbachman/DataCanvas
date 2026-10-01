import type { Column, Expr } from "../domain/model";
import { col, lit, binary } from "../domain/model";
export function ExpressionEditor({
  value,
  onChange,
  columns,
  label = "Expression",
}: {
  value: Expr;
  onChange: (e: Expr) => void;
  columns: Column[];
  label?: string;
}) {
  if (!value)
    return (
      <button onClick={() => onChange(lit(null))}>Complete expression</button>
    );
  return (
    <fieldset className="expression">
      <legend>{label}</legend>
      <select
        aria-label={`${label} kind`}
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value;
          onChange(
            kind === "column"
              ? col(columns[0]?.id || "")
              : kind === "literal"
                ? lit(0)
                : kind === "binary"
                  ? binary(">", col(columns[0]?.id || ""), lit(0))
                  : kind === "unary"
                    ? {
                        kind: "unary",
                        op: "is_missing",
                        arg: col(columns[0]?.id || ""),
                      }
                    : kind === "call"
                      ? {
                          kind: "call",
                          fn: "abs",
                          args: [col(columns[0]?.id || "")],
                        }
                      : {
                          kind: "conditional",
                          when: lit(true),
                          then: lit(1),
                          otherwise: lit(0),
                        },
          );
        }}
      >
        {["column", "literal", "binary", "unary", "call", "conditional"].map(
          (k) => (
            <option key={k}>{k}</option>
          ),
        )}
      </select>
      {value.kind === "column" ? (
        <select
          aria-label={`${label} column`}
          value={value.columnId}
          onChange={(e) => onChange(col(e.target.value))}
        >
          <option value="">Choose column…</option>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : value.kind === "literal" ? (
        <div className="inline">
          <select
            aria-label={`${label} literal type`}
            value={
              value.value === null
                ? "missing"
                : typeof value.value === "object"
                  ? "text"
                  : typeof value.value
            }
            onChange={(e) =>
              onChange(
                lit(
                  e.target.value === "missing"
                    ? null
                    : e.target.value === "number"
                      ? 0
                      : e.target.value === "boolean"
                        ? true
                        : "",
                ),
              )
            }
          >
            <option value="number">Number</option>
            <option value="string">Text</option>
            <option value="boolean">Boolean</option>
            <option value="missing">Missing</option>
          </select>
          {value.value !== null && (
            <input
              aria-label={`${label} literal value`}
              value={
                typeof value.value === "object"
                  ? value.value.value
                  : String(value.value)
              }
              onChange={(e) =>
                onChange(
                  lit(
                    typeof value.value === "number"
                      ? Number(e.target.value)
                      : typeof value.value === "boolean"
                        ? e.target.value === "true"
                        : e.target.value,
                  ),
                )
              }
            />
          )}
        </div>
      ) : value.kind === "binary" ? (
        <>
          <ExpressionEditor
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
            columns={columns}
            label="Left"
          />
          <select
            aria-label="Operator"
            value={value.op}
            onChange={(e) => onChange({ ...value, op: e.target.value })}
          >
            {[
              "+",
              "-",
              "*",
              "/",
              "%",
              ">",
              ">=",
              "<",
              "<=",
              "=",
              "!=",
              "and",
              "or",
              "contains",
              "starts",
              "in",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <ExpressionEditor
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
            columns={columns}
            label="Right"
          />
        </>
      ) : value.kind === "unary" ? (
        <>
          <select
            aria-label="Unary operator"
            value={value.op}
            onChange={(e) => onChange({ ...value, op: e.target.value })}
          >
            {["is_missing", "not_missing", "not", "negate"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <ExpressionEditor
            value={value.arg}
            onChange={(arg) => onChange({ ...value, arg })}
            columns={columns}
            label="Value"
          />
        </>
      ) : value.kind === "call" ? (
        <>
          <select
            aria-label="Function"
            value={value.fn}
            onChange={(e) =>
              onChange({
                ...value,
                fn: e.target.value,
                args: ["coalesce", "concat", "elapsed_days", "bin"].includes(
                  e.target.value,
                )
                  ? [value.args[0], lit(1)]
                  : [value.args[0]],
              })
            }
          >
            {[
              "coalesce",
              "abs",
              "round",
              "sqrt",
              "log",
              "exp",
              "lower",
              "upper",
              "trim",
              "length",
              "year",
              "month",
              "day",
              "concat",
              "elapsed_days",
              "bin",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          {value.args.map((a, i) => (
            <ExpressionEditor
              key={i}
              value={a}
              onChange={(arg) =>
                onChange({
                  ...value,
                  args: value.args.map((a, j) => (j === i ? arg : a)),
                })
              }
              columns={columns}
              label={`Argument ${i + 1}`}
            />
          ))}
        </>
      ) : (
        <>
          {(["when", "then", "otherwise"] as const).map((k) => (
            <ExpressionEditor
              key={k}
              value={value[k]}
              onChange={(v) => onChange({ ...value, [k]: v })}
              columns={columns}
              label={k}
            />
          ))}
        </>
      )}
    </fieldset>
  );
}

import {
  CanvasError,
  type Expr,
  type Column,
  type Value,
} from "../domain/model";
export const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
export function literal(v: Value): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") {
    if (v.type === "integer") {
      if (!/^-?\d+$/.test(v.value))
        throw new CanvasError("VALIDATION", "Invalid integer literal");
      return `CAST('${v.value}' AS HUGEINT)`;
    }
    if (v.type === "decimal") {
      if (!/^-?\d+(\.\d+)?$/.test(v.value))
        throw new CanvasError("VALIDATION", "Invalid decimal literal");
      return `CAST('${v.value}' AS DECIMAL(38,12))`;
    }
    return `CAST(${literal(v.value)} AS ${v.type === "date" ? "DATE" : "TIMESTAMP"})`;
  }
  return "'" + v.replaceAll("'", "''") + "'";
}
export function requireColumn(columns: Column[], id: string) {
  const c = columns.find((c) => c.id === id);
  if (!c)
    throw new CanvasError(
      "SCHEMA",
      `Column ${id || "(not selected)"} is unavailable. Select an existing column or restore the operation that created it.`,
    );
  return c;
}
export function expression(e: Expr, columns: Column[]): string {
  if (e.kind === "column") return quote(requireColumn(columns, e.columnId).id);
  if (e.kind === "literal") return literal(e.value);
  if (e.kind === "conditional")
    return `(CASE WHEN ${expression(e.when, columns)} THEN ${expression(e.then, columns)} ELSE ${expression(e.otherwise, columns)} END)`;
  if (e.kind === "unary") {
    const a = expression(e.arg, columns);
    switch (e.op) {
      case "not":
        return `(NOT ${a})`;
      case "is_missing":
        return `(${a} IS NULL)`;
      case "not_missing":
        return `(${a} IS NOT NULL)`;
      case "negate":
        return `(-${a})`;
      default:
        throw new CanvasError("VALIDATION", "Unknown unary expression");
    }
  }
  if (e.kind === "binary") {
    const a = expression(e.left, columns),
      b = expression(e.right, columns);
    if (e.op === "contains")
      return `contains(CAST(${a} AS VARCHAR),CAST(${b} AS VARCHAR))`;
    if (e.op === "starts")
      return `starts_with(CAST(${a} AS VARCHAR),CAST(${b} AS VARCHAR))`;
    if (e.op === "in")
      return `list_contains(string_split(CAST(${b} AS VARCHAR), ','), CAST(${a} AS VARCHAR))`;
    if (["+", "-", "*", "/", "%"].includes(e.op)) {
      const v = `(TRY_CAST(${a} AS DOUBLE) ${e.op} ${["/", "%"].includes(e.op) ? `NULLIF(TRY_CAST(${b} AS DOUBLE),0)` : `TRY_CAST(${b} AS DOUBLE)`})`;
      return `(CASE WHEN isfinite(${v}) THEN ${v} ELSE NULL END)`;
    }
    if (![">", ">=", "<", "<=", "=", "!=", "and", "or"].includes(e.op))
      throw new CanvasError("VALIDATION", "Unknown operator");
    return `(${a} ${e.op.toUpperCase()} ${b})`;
  }
  const args = e.args.map((a) => expression(a, columns));
  const a = args[0];
  if (e.fn === "elapsed_days") return `date_diff('day',${a},${args[1]})`;
  if (e.fn === "bin") return `(floor(${a}/NULLIF(${args[1]},0))*${args[1]})`;
  if (["sqrt", "log", "exp"].includes(e.fn)) {
    const x =
      e.fn === "sqrt"
        ? `sqrt(CASE WHEN ${a}>=0 THEN ${a} END)`
        : e.fn === "log"
          ? `ln(CASE WHEN ${a}>0 THEN ${a} END)`
          : `exp(${a})`;
    return `(CASE WHEN isfinite(${x}) THEN ${x} END)`;
  }
  if (
    ![
      "coalesce",
      "abs",
      "round",
      "lower",
      "upper",
      "trim",
      "length",
      "year",
      "month",
      "day",
      "concat",
    ].includes(e.fn)
  )
    throw new CanvasError("VALIDATION", "Unknown function");
  return `${e.fn}(${args.join(", ")})`;
}
export function expressionType(e: Expr, columns: Column[]): Column["type"] {
  if (e.kind === "column") return requireColumn(columns, e.columnId).type;
  if (e.kind === "literal")
    return e.value === null
      ? "text"
      : typeof e.value === "number"
        ? "decimal"
        : typeof e.value === "boolean"
          ? "boolean"
          : typeof e.value === "object"
            ? e.value.type
            : "text";
  if (e.kind === "binary")
    return ["+", "-", "*", "/", "%"].includes(e.op) ? "decimal" : "boolean";
  if (e.kind === "unary") return e.op === "negate" ? "decimal" : "boolean";
  if (e.kind === "conditional") return expressionType(e.then, columns);
  return ["lower", "upper", "trim", "concat"].includes(e.fn)
    ? "text"
    : e.fn === "coalesce"
      ? expressionType(e.args[0], columns)
      : "decimal";
}
export function aggregate(fn: string, c: string, q = 0.5) {
  switch (fn) {
    case "count":
      return "count(*)";
    case "count_valid":
      return `count(${c})`;
    case "count_missing":
      return `count(*)-count(${c})`;
    case "distinct":
      return `count(DISTINCT ${c})`;
    case "mean":
      return `avg(${c})`;
    case "sd":
      return `stddev_samp(${c})`;
    case "quantile":
      return `quantile_cont(${c},${q})`;
    case "sum":
    case "median":
    case "min":
    case "max":
      return `${fn}(${c})`;
    default:
      throw new CanvasError("VALIDATION", `Unknown aggregate ${fn}`);
  }
}

/** Explicit source/parse conversions. Nonfinite values never enter a numeric table. */
export function storageCast(value: string, type: Column["type"]): string {
  if (type === "text") return `CAST(${value} AS VARCHAR)`;
  if (type === "decimal") {
    const cast = `TRY_CAST(${value} AS DOUBLE)`;
    return `CASE WHEN isfinite(${cast}) THEN ${cast} END`;
  }
  if (type === "integer")
    return `CASE WHEN regexp_full_match(trim(CAST(${value} AS VARCHAR)), '[-+]?[0-9]+') THEN TRY_CAST(${value} AS BIGINT) END`;
  if (type === "timestamp")
    return `CAST(TRY_CAST(${value} AS TIMESTAMPTZ) AS TIMESTAMP)`;
  return `TRY_CAST(${value} AS ${type === "date" ? "DATE" : "BOOLEAN"})`;
}

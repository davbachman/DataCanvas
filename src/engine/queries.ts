import parserModule from "node-sql-parser";
import { CanvasError, type Query, column, type Column } from "../domain/model";
import { Engine, type TableResult, displayValue, scalar } from "./core";
import { quote, literal } from "../compiler/expressions";
const { Parser } = parserModule;
const allowedFunctions = new Set([
  "count",
  "sum",
  "avg",
  "mean",
  "min",
  "max",
  "median",
  "round",
  "abs",
  "coalesce",
  "nullif",
  "lower",
  "upper",
  "trim",
  "length",
  "sqrt",
  "stddev_samp",
  "quantile_cont",
  "date_part",
  "date_trunc",
  "concat",
  "cast",
  "try_cast",
]);
export function validateSQL(sql: string, bindings: string[]) {
  let ast: any;
  try {
    ast = new Parser().astify(sql, { database: "Postgresql" });
  } catch (e) {
    throw new CanvasError(
      "QUERY_POLICY",
      "Query must be a supported SELECT/WITH statement. " +
        (e as Error).message,
    );
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1 || statements[0].type !== "select")
    throw new CanvasError(
      "QUERY_POLICY",
      "Only one read-only SELECT/WITH query is allowed.",
    );
  const ctes = new Set<string>();
  const aliases = new Set<string>();
  function collect(n: any) {
    if (!n || typeof n !== "object") return;
    if (n.with) for (const w of n.with) ctes.add(w.name?.value || w.name);
    if (n.from) for (const f of n.from) if (f.as) aliases.add(f.as);
    for (const v of Object.values(n))
      if (typeof v === "object")
        Array.isArray(v) ? v.forEach(collect) : collect(v);
  }
  collect(ast);
  function visit(n: any) {
    if (!n || typeof n !== "object") return;
    if (
      n.type &&
      [
        "insert",
        "update",
        "delete",
        "drop",
        "create",
        "alter",
        "call",
        "copy",
        "attach",
        "pragma",
        "set",
        "execute",
      ].includes(n.type)
    )
      throw new CanvasError(
        "QUERY_POLICY",
        "Mutation and engine commands are not permitted",
      );
    if (n.into?.position || n.into?.table || n.locking_read || n.for_update)
      throw new CanvasError(
        "QUERY_POLICY",
        "Query writes/locks are not permitted",
      );
    if (
      n.table &&
      (n.db ||
        n.schema ||
        (!bindings.includes(n.table) &&
          !ctes.has(n.table) &&
          !(n.type === "column_ref" && aliases.has(n.table))))
    )
      throw new CanvasError(
        "QUERY_POLICY",
        `Table ${n.table} is not a registered binding.`,
      );
    if (n.type === "function" || n.type === "aggr_func") {
      const name =
        typeof n.name === "string"
          ? n.name
          : n.name?.name?.map((v: any) => v.value).join(".");
      if (!name || !allowedFunctions.has(name.toLowerCase()))
        throw new CanvasError(
          "QUERY_POLICY",
          `Function ${name || "(unknown)"} is not allowed in the query workspace.`,
        );
    }
    if (n.from)
      for (const f of n.from)
        if (!f.table && !f.expr?.ast)
          throw new CanvasError(
            "QUERY_POLICY",
            "Table functions and external sources are not allowed.",
          );
    for (const v of Object.values(n))
      if (typeof v === "object") Array.isArray(v) ? v.forEach(visit) : visit(v);
  }
  visit(ast);
  return ast;
}
export async function executeQuery(engine: Engine, query: Query) {
  const bindings = Object.keys(query.tableBindings);
  validateSQL(query.sqlText, bindings);
  if (!engine.createIsolated)
    throw new CanvasError(
      "QUERY_POLICY",
      "This engine does not provide an isolated query context.",
    );
  const isolated = await engine.createIsolated();
  const types: Record<string, string> = {
    text: "VARCHAR",
    integer: "BIGINT",
    decimal: "DOUBLE",
    boolean: "BOOLEAN",
    date: "DATE",
    timestamp: "TIMESTAMP",
  };
  try {
    for (const [name, id] of Object.entries(query.tableBindings)) {
      const table = await engine.fullTable(id, 1000000);
      await isolated.exec(
        `CREATE TABLE ${quote(name)} (${table.columns.map((c) => `${quote(c.name)} ${types[c.type]}`).join(",")})`,
      );
      for (let i = 0; i < table.rows.length; i += 500)
        await isolated.exec(
          `INSERT INTO ${quote(name)} VALUES ${table.rows
            .slice(i, i + 500)
            .map(
              (row) =>
                `(${table.columns.map((c) => literal(row[c.id])).join(",")})`,
            )
            .join(",")}`,
        );
    }
    const sql = query.sqlText.trim().replace(/;\s*$/, "");
    const description = await isolated.query(`DESCRIBE (${sql})`);
    const schema = description.map((c) => ({
      name: String(c.column_name),
      type: (/INT/.test(c.column_type)
        ? "integer"
        : /DECIMAL|DOUBLE|FLOAT|REAL/.test(c.column_type)
          ? "decimal"
          : c.column_type === "DATE"
            ? "date"
            : /TIMESTAMP/.test(c.column_type)
              ? "timestamp"
              : c.column_type === "BOOLEAN"
                ? "boolean"
                : "text") as Column["type"],
    }));
    const rows = await isolated.query(
      `SELECT ${schema.map((c) => (["date", "timestamp"].includes(c.type) ? `CAST(${quote(c.name)} AS VARCHAR) AS ${quote(c.name)}` : quote(c.name))).join(",")} FROM (${sql}) AS result LIMIT 1000001`,
    );
    if (rows.length > 1000000)
      throw new CanvasError(
        "RESOURCE_LIMIT",
        "Query output exceeds 1,000,000 rows; result was not truncated.",
      );
    return {
      columns: schema.map((c) => c.name),
      schema,
      rows: rows.map((r) =>
        Object.fromEntries(
          schema.map((c) => [c.name, scalar(r[c.name], c.type)]),
        ),
      ),
    };
  } finally {
    await isolated.close();
  }
}
export function compareTables(
  a: TableResult,
  b: {
    columns: string[];
    rows: Record<string, any>[];
    schema?: { name: string; type: string }[];
  },
  tolerance = 1e-9,
  ordered = false,
) {
  if (
    a.columns.length !== b.columns.length ||
    a.columns.some(
      (c, i) =>
        c.name !== b.columns[i] || (b.schema && c.type !== b.schema[i].type),
    )
  )
    return {
      equal: false,
      message: "Schemas differ: column names or order do not match.",
    };
  if (a.rowCount !== b.rows.length)
    return {
      equal: false,
      message: `Row counts differ: ${a.rowCount} versus ${b.rows.length}.`,
    };
  const canonical = (v: any) => {
    if (v == null) return null;
    if (typeof v === "object" && "value" in v) return v.value;
    return String(v);
  };
  const left = a.rows.map((r) => a.columns.map((c) => canonical(r[c.id]))),
    right = b.rows.map((r) => b.columns.map((c) => canonical(r[c])));
  const same = (x: any[], y: any[]) =>
    x.every(
      (v, i) =>
        v === y[i] ||
        (v !== null &&
          y[i] !== null &&
          a.columns[i].type === "decimal" &&
          v !== "" &&
          y[i] !== "" &&
          Number.isFinite(Number(v)) &&
          Number.isFinite(Number(y[i])) &&
          Math.abs(Number(v) - Number(y[i])) <= tolerance),
    );
  if (ordered)
    return {
      equal: left.every((r, i) => same(r, right[i])),
      message:
        "Compared ordered rows with explicit absolute numeric tolerance " +
        tolerance,
    };
  const used = new Set<number>();
  for (const row of left) {
    const i = right.findIndex((r, i) => !used.has(i) && same(row, r));
    if (i < 0)
      return {
        equal: false,
        message: "Row multiset differs (including duplicate multiplicity).",
        example: row,
      };
    used.add(i);
  }
  return {
    equal: true,
    message: `Equal row multisets, including duplicates; absolute numeric tolerance ${tolerance}.`,
  };
}

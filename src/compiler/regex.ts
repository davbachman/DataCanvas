import { CanvasError, type Column } from "../domain/model";
import { registry } from "../domain/operations";
import { literal } from "./expressions";
import type { DB } from "./sql";

/** SQL literals only; both runtimes use DuckDB's built-in RE2 implementation. */
export function regexSQL(value: string, params: Record<string, any>) {
  const p = registry.regex.schema.parse(params);
  const pattern = literal((p.multiline ? "(?m)" : "") + p.pattern);
  const flags = (p.ignoreCase ? "i" : "c") + (p.dotAll ? "s" : "");
  const text = `CAST(${value} AS VARCHAR)`;
  const match = `regexp_matches(${text},${pattern},${literal(flags)})`;
  const transformed =
    p.action === "replace"
      ? `regexp_replace(${text},${pattern},${literal(p.replacement)},${literal(flags + (p.global ? "g" : ""))})`
      : p.action === "extract"
        ? `CASE WHEN ${match} THEN regexp_extract(${text},${pattern},${p.group},${literal(flags)}) END`
        : p.negate
          ? `NOT (${match})`
          : match;
  return { match, value: transformed };
}
export async function validateRegex(db: DB, params: Record<string, any>) {
  const r = regexSQL("''", params);
  try {
    await db.query(`SELECT ${r.match}, ${r.value}`);
  } catch (error) {
    throw new CanvasError(
      "VALIDATION",
      `Invalid RE2 pattern or replacement: ${(error as Error).message}`,
    );
  }
}
export async function previewRegex(
  db: DB,
  params: Record<string, any>,
  sample: string,
) {
  if (typeof sample !== "string" || sample.length > 10000)
    throw new CanvasError(
      "VALIDATION",
      "Preview text is limited to 10,000 characters.",
    );
  await validateRegex(db, params);
  const r = regexSQL(literal(sample), params);
  return (
    await db.query(`SELECT ${r.match} AS matched, ${r.value} AS result`)
  )[0];
}

/** Names are values, never SQL identifiers. Selection is evaluated against the input schema. */
export async function matchColumnNames(
  db: DB,
  columns: Pick<Column, "id" | "name">[],
  params: Record<string, any>,
) {
  const p = registry.select.schema.parse(params);
  if (p.selection !== "regex")
    throw new CanvasError(
      "VALIDATION",
      "Choose regular-expression column selection first",
    );
  const pattern = literal(p.pattern!),
    flags = literal(p.ignoreCase ? "i" : "c");
  try {
    // Validate even when there are no input columns or rows.
    await db.query(`SELECT regexp_matches('',${pattern},${flags})`);
    if (!columns.length) return [];
    const matches = await db.query(
      `SELECT idx FROM (VALUES ${columns.map((c, i) => `(${i},${literal(c.name)})`).join(",")}) AS headers(idx,name) WHERE regexp_matches(name,${pattern},${flags}) ORDER BY idx`,
    );
    return matches.map((row) => ({
      id: columns[Number(row.idx)].id,
      name: columns[Number(row.idx)].name,
    }));
  } catch (error) {
    throw new CanvasError(
      "VALIDATION",
      `Invalid column-name RE2 pattern: ${(error as Error).message}`,
    );
  }
}

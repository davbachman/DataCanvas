import { CanvasError } from "../domain/model";
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

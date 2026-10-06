import { CanvasError, type Column } from "../domain/model";
import { literal as l } from "./expressions";
import type { DB } from "./sql";
export async function previewRename(
  db: DB,
  columns: Column[],
  p: Record<string, any>,
) {
  for (const id of p.columns)
    if (!columns.some((c) => c.id === id))
      throw new CanvasError("SCHEMA", `Missing rename column ${id}`);
  if (!p.search)
    throw new CanvasError(
      "VALIDATION",
      "Enter nonempty text or a pattern to find.",
    );
  let names: string[];
  if (p.action === "regex") {
    try {
      await db.query(
        `SELECT regexp_replace('',${l(p.search)},${l(p.replacement)},${l((p.ignoreCase ? "i" : "c") + "g")})`,
      );
      const rows = columns.length
        ? await db.query(
            `SELECT idx,regexp_replace(name,${l(p.search)},${l(p.replacement)},${l((p.ignoreCase ? "i" : "c") + "g")}) AS name FROM (VALUES ${columns.map((c, i) => `(${i},${l(c.name)})`).join(",")}) AS dc_names(idx,name) ORDER BY idx`,
          )
        : [];
      names = rows.map((r) => String(r.name));
    } catch (e) {
      throw new CanvasError(
        "VALIDATION",
        `Invalid RE2 rename pattern or replacement: ${(e as Error).message}`,
      );
    }
  } else
    names = columns.map((c) =>
      p.action === "prefix"
        ? c.name.startsWith(p.search)
          ? c.name.slice(p.search.length)
          : c.name
        : p.action === "suffix"
          ? c.name.endsWith(p.search)
            ? c.name.slice(0, -p.search.length)
            : c.name
          : c.name.split(p.search).join(p.replacement),
    );
  const output = columns.map((c, i) => ({
    ...c,
    name: p.columns.includes(c.id) ? names[i] : c.name,
  }));
  return output.map((c, i) => ({
    id: c.id,
    before: columns[i].name,
    after: c.name,
    error: !c.name.length
      ? "Name cannot be empty"
      : c.name.length > 200
        ? "Name exceeds 200 characters"
        : output.filter((x) => x.name === c.name).length > 1
          ? "Name collision"
          : "",
  }));
}

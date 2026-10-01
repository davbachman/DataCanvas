import {
  type Chart,
  type Column,
  type Expr,
  col,
  lit,
  binary,
  type Value,
} from "../domain/model";
import { plainValue, type TableResult } from "../engine/core";
export const and = (parts: Expr[]): Expr =>
  parts.reduce((a, b) => binary("and", a, b), lit(true));
export function markPredicate(
  chart: Chart,
  layerIndex: number,
  row: Record<string, Value>,
): Expr {
  const layer = chart.layers[layerIndex];
  const terms: Expr[] = [];
  const equal = (id: string, value: Value) =>
    value === null
      ? { kind: "unary" as const, op: "is_missing", arg: col(id) }
      : binary("=", col(id), lit(value));
  const groups = [
    layer.color,
    layer.detail,
    chart.facetRow,
    chart.facetColumn,
  ].filter((x): x is string => !!x);
  if (layer.mark === "histogram" && layer.x) {
    const lo = row[layer.id + "_bin"],
      hi = row[layer.id + "_end"];
    terms.push(
      binary(">=", col(layer.x), lit(lo)),
      binary("<", col(layer.x), lit(hi)),
    );
  } else if (layer.x && row[layer.x] !== undefined)
    terms.push(equal(layer.x, row[layer.x]));
  if (
    ["scatter", "line", "bar", "heatmap"].includes(layer.mark) &&
    !layer.aggregate &&
    layer.y &&
    row[layer.y] !== undefined
  )
    terms.push(equal(layer.y, row[layer.y]));
  for (const id of groups)
    if (row[id] !== undefined) terms.push(equal(id, row[id]));
  return and(terms);
}
export function brushPredicate(
  ranges: Record<string, any>,
  columns: Column[],
): Expr | null {
  const parts: Expr[] = [];
  for (const [id, range] of Object.entries(ranges)) {
    const c = columns.find((c) => c.id === id);
    if (!c || !Array.isArray(range) || range.length !== 2) continue;
    const value = (v: any): Value =>
      c.type === "date" || c.type === "timestamp"
        ? { type: c.type, value: new Date(v).toISOString() }
        : v;
    parts.push(
      binary(">=", col(id), lit(value(range[0]))),
      binary("<=", col(id), lit(value(range[1]))),
    );
  }
  return parts.length ? and(parts) : null;
}
export function brushedContributors(
  ranges: Record<string, any>,
  table: TableResult,
) {
  const ids = new Set<string>();
  table.rows.forEach((r, i) => {
    if (
      Object.entries(ranges).every(
        ([key, range]) =>
          !Array.isArray(range) ||
          !(key in r) ||
          (() => {
            const v = plainValue(r[key]);
            return v !== null && v >= range[0] && v <= range[1];
          })(),
      )
    )
      for (const id of table.lineage[i]) ids.add(id);
  });
  return [...ids];
}

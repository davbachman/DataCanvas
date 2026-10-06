import { column, type Column, type Layer } from "../domain/model";
import { quote as q } from "../compiler/expressions";
export function uncertaintyStats(
  layer: Layer,
  input: { name: string; columns: Column[] },
  groups: string[],
  valid: string,
) {
  const method = layer.uncertainty || {
    method: "se",
    multiplier: 1,
    confidence: 95,
  };
  const y = q(layer.y!),
    gs = groups.map(q),
    suffix = (s: string) => layer.id + "_" + s;
  const ids = {
    mean: suffix("mean"),
    n: suffix("valid"),
    missing: suffix("missing"),
    sd: suffix("sd"),
    se: suffix("se"),
    lower: suffix("lower"),
    upper: suffix("upper"),
  };
  const multiplier =
    method.method === "ci_normal"
      ? {
          90: 1.6448536269514722,
          95: 1.959963984540054,
          99: 2.5758293035489004,
        }[method.confidence]
      : method.multiplier;
  const core = `SELECT ${gs.length ? gs.join(",") + "," : ""}avg(${y}) AS ${q(ids.mean)},count(${y}) AS ${q(ids.n)},count(*)-count(${y}) AS ${q(ids.missing)},stddev_samp(${y}) AS ${q(ids.sd)},md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)) AS "__rid",flatten(list("__lineage")) AS "__lineage" FROM ${q(input.name)} WHERE ${valid}${gs.length ? " GROUP BY " + gs.join(",") : ""}`;
  const spread =
    method.method === "sd" ? q(ids.sd) : `${q(ids.sd)}/sqrt(${q(ids.n)})`;
  const sql = `SELECT *,${q(ids.sd)}/sqrt(${q(ids.n)}) AS ${q(ids.se)},${q(ids.mean)}-${multiplier}*(${spread}) AS ${q(ids.lower)},${q(ids.mean)}+${multiplier}*(${spread}) AS ${q(ids.upper)} FROM (${core}) dc_uncertainty`;
  const columns = [
    ...groups.map((id) => input.columns.find((c) => c.id === id)!),
    column("Mean", "decimal", ids.mean),
    column("Valid observations", "integer", ids.n),
    column("Missing observations", "integer", ids.missing),
    column("Sample SD", "decimal", ids.sd),
    column("Standard error", "decimal", ids.se),
    column("Lower bound", "decimal", ids.lower),
    column("Upper bound", "decimal", ids.upper),
  ];
  const note =
    method.method === "ci_normal"
      ? `${method.confidence}% normal-approximation confidence interval for the mean (z=${multiplier}); assumes independent observations and an approximately normal sampling distribution. This is not a bootstrap or a Student-t interval.`
      : `Mean ± ${multiplier} × ${method.method === "sd" ? "sample standard deviation" : "standard error (sample SD / √n)"}. This is not a confidence interval.`;
  return {
    sql,
    columns,
    ids,
    note:
      note +
      " Missing Y values are excluded from statistics and counted per group. Bounds require at least two valid observations; all-missing groups remain in the statistical table. No bootstrapping or hidden resampling.",
  };
}

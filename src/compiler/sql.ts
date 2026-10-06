import { compileDatetime } from "./datetime";
import { previewRename } from "./rename";
import { regexSQL, validateRegex, matchColumnNames } from "./regex";
import {
  type Column,
  type Operation,
  type Ref,
  CanvasError,
  column,
} from "../domain/model";
import { validateOperation } from "../domain/operations";
import {
  quote as q,
  literal as l,
  expression as ex,
  requireColumn,
  aggregate,
  expressionType,
  storageCast,
} from "./expressions";
export interface Relation {
  cacheKey?: string;
  name: string;
  columns: Column[];
  ordered: boolean;
  rowMeaning: string;
  reviewMeaning?: boolean;
}
export interface Diagnostic {
  severity: "info" | "advisory" | "required" | "error";
  message: string;
  count?: number;
  operationId?: string;
  examples?: unknown[];
}
export interface DB {
  insertTextRows?: (
    name: string,
    columns: string[],
    rows: (string | null)[][],
    sourceId: string,
  ) => Promise<void>;
  query(sql: string): Promise<Record<string, any>[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
export interface Compiled {
  sql: string;
  columns: Column[];
  ordered: boolean;
  diagnostics: Diagnostic[];
  reviewMeaning: boolean;
}
const hidden = '"__rid", "__lineage"';
export async function compileOperation(
  o: Operation,
  input: Relation,
  resolve: (ref: Ref) => Relation,
  db: DB,
): Promise<Compiled> {
  validateOperation(o);
  const p = o.params,
    cols = input.columns;
  let columns = structuredClone(cols),
    sql = "",
    ordered = input.ordered,
    reviewMeaning = !!input.reviewMeaning;
  const diagnostics: Diagnostic[] = [];
  const from = q(input.name);
  const c = (id: string) => q(requireColumn(cols, id).id);
  const names = (ids: string[]) => ids.map(c);
  const all = () => columns.map((x) => q(x.id)).join(", ");
  const selectReplace = (id: string, value: string) =>
    cols
      .map((x) => `${x.id === id ? value : q(x.id)} AS ${q(x.id)}`)
      .join(", ");
  const n = async (s: string) =>
    Number(Object.values((await db.query(s))[0] || { n: 0 })[0]);
  const checkName = (name: string, except?: string) => {
    if (cols.some((c) => c.name === name && c.id !== except))
      throw new CanvasError(
        "SCHEMA",
        `Display name “${name}” already exists. Choose an explicit alias.`,
        o.id,
      );
  };
  switch (o.kind) {
    case "datetime": {
      checkName(p.name);
      if (cols.some((c) => c.id === p.outputId))
        throw new CanvasError("SCHEMA", "Output column ID already exists");
      const compiled = compileDatetime(p, cols, "dc_datetime_input");
      columns.push(compiled.column);
      sql = `SELECT *,${compiled.value} AS ${q(p.outputId)} FROM ${from} AS dc_datetime_input`;
      const missing = await n(
        `SELECT count(*) FROM (${sql}) dt WHERE ${q(p.outputId)} IS NULL`,
      );
      diagnostics.push({
        severity: missing ? "advisory" : "info",
        count: missing,
        message: `${compiled.explanation} ${missing} missing outputs (including missing inputs).`,
      });
      break;
    }
    case "rank":
    case "topk": {
      const groups = names(p.groups),
        partition = groups.length ? `PARTITION BY ${groups.join(",")} ` : "";
      const valid = p.order
        .map((k: any) => `${c(k.columnId)} IS NOT NULL`)
        .join(" AND ");
      const keys = p.order
        .map(
          (k: any) =>
            `${c(k.columnId)} ${k.direction.toUpperCase()} NULLS ${k.nulls.toUpperCase()}`,
        )
        .join(",");
      const order = `${p.missing === "exclude" ? `CASE WHEN ${valid} THEN 0 ELSE 1 END,` : ""}${keys}${p.method === "row_number" ? ',"__rid"' : ""}`;
      const rank = `${p.missing === "exclude" ? `CASE WHEN ${valid} THEN ` : ""}${p.method}() OVER(${partition}ORDER BY ${order})${p.missing === "exclude" ? " END" : ""}`;
      if (o.kind === "rank") {
        checkName(p.name);
        if (cols.some((c) => c.id === p.outputId))
          throw new CanvasError("SCHEMA", "Rank output ID already exists");
        columns.push(column(p.name, "integer", p.outputId));
        sql = `SELECT *,${rank} AS ${q(p.outputId)} FROM ${from} ORDER BY ${[...groups, keys, '"__rid"'].join(",")}`;
      } else {
        sql = `SELECT ${[...cols.map((c) => q(c.id)), hidden].join(",")} FROM (SELECT *,${rank} AS __dc_rank,count(*) FILTER(WHERE ${valid}) OVER(${partition}) AS __dc_valid FROM ${from}) ranked WHERE __dc_rank<=${p.k}${p.requireFull ? ` AND __dc_valid>=${p.k}` : ""} ORDER BY ${[...groups, keys, '"__rid"'].join(",")}`;
        reviewMeaning = true;
      }
      ordered = true;
      diagnostics.push({
        severity: "info",
        message: `${p.method}: ${p.method === "row_number" ? "ties break by stable source-row identity" : "ties share a rank; stable row identity only orders their display"}. Missing ordering values: ${p.missing}. ${o.kind === "topk" ? (p.requireFull ? `Require at least ${p.k} observations with all ordering values present.` : "Smaller groups are kept.") : "Excluded missing values receive a missing rank."}`,
      });
      break;
    }
    case "rename_many": {
      const preview = await previewRename(db, cols, p);
      if (preview.some((x) => x.error))
        throw new CanvasError(
          "SCHEMA",
          preview
            .filter((x) => x.error)
            .map((x) => `${x.before} → ${x.after}: ${x.error}`)
            .join("; "),
        );
      columns = cols.map((c, i) => ({ ...c, name: preview[i].after }));
      sql = `SELECT * FROM ${from}`;
      diagnostics.push({
        severity: "info",
        message:
          "Column labels changed; stable identities and downstream references retained.",
        examples: preview,
      });
      break;
    }
    case "categories": {
      c(p.columnId);
      if (new Set(p.levels).size !== p.levels.length)
        throw new CanvasError("VALIDATION", "Category levels must be unique.");
      columns = cols.map((x) =>
        x.id === p.columnId ? { ...x, role: p.role, levels: p.levels } : x,
      );
      sql = `SELECT * FROM ${from}`;
      diagnostics.push({
        severity: "info",
        message:
          "Role and category order updated without changing stored values. Unlisted categories follow the explicit levels.",
      });
      break;
    }
    case "filter": {
      if (expressionType(p.expression, cols) !== "boolean")
        throw new CanvasError(
          "SCHEMA",
          "A filter requires a Boolean condition. Connect a comparison or missing-value test.",
          o.id,
        );
      const e = ex(p.expression, cols);
      sql = `SELECT * FROM ${from} WHERE ${e}`;
      const counts = (
        await db.query(
          `SELECT count(*) FILTER(WHERE ${e}) AS retained, count(*) FILTER(WHERE NOT (${e})) AS rejected, count(*) FILTER(WHERE (${e}) IS NULL) AS unknown FROM ${from}`,
        )
      )[0];
      diagnostics.push({
        severity: "info",
        message: `${counts.retained} retained; ${counts.rejected} false; ${counts.unknown} unknown.`,
      });
      break;
    }
    case "select": {
      let selected: string[];
      if (p.selection === "regex") {
        const matches = await matchColumnNames(db, cols, p);
        selected = matches.map((x) => x.id);
        diagnostics.push({
          severity: selected.length ? "info" : "advisory",
          count: selected.length,
          message: `${selected.length} of ${cols.length} column names matched. ${p.mode === "keep" ? selected.length : cols.length - selected.length} columns retained; input order and row count are unchanged.`,
          examples: matches,
        });
      } else {
        p.columns.forEach(c);
        selected = p.columns;
      }
      columns = cols.filter((x) =>
        p.mode === "keep" ? selected.includes(x.id) : !selected.includes(x.id),
      );
      sql = `SELECT ${[...columns.map((x) => q(x.id)), hidden].join(", ")} FROM ${from}`;
      break;
    }
    case "rename": {
      c(p.columnId);
      checkName(p.name, p.columnId);
      columns = cols.map((x) =>
        x.id === p.columnId ? { ...x, name: p.name } : x,
      );
      sql = `SELECT * FROM ${from}`;
      break;
    }
    case "sort":
      sql = `SELECT * FROM ${from} ORDER BY ${p.keys.map((k: any) => `${c(k.columnId)} ${k.direction.toUpperCase()} NULLS ${k.nulls.toUpperCase()}`).join(", ")}, "__rid"`;
      ordered = true;
      break;
    case "sample": {
      if (p.fraction && p.size > 1)
        throw new CanvasError(
          "VALIDATION",
          "Sample fraction must be between 0 and 1",
        );
      const count = await n(`SELECT count(*) FROM ${from}`),
        size = p.fraction ? Math.floor(count * p.size) : Math.floor(p.size);
      sql = `SELECT * FROM ${from} ORDER BY md5(${l(p.seed)} || "__rid"), "__rid" LIMIT ${size}`;
      ordered = false;
      diagnostics.push({
        severity: "info",
        message: `Seed ${p.seed}; md5-rank-v1; ${Math.min(count, size)} of ${count} rows without replacement.`,
      });
      break;
    }
    case "parse": {
      if (
        p.type === "timestamp" &&
        p.timeBasis === "wall" &&
        /(?<!%)%(?:z|Z)/.test(p.format)
      )
        throw new CanvasError(
          "VALIDATION",
          "Local wall-time parsing cannot include timezone directives %z or %Z. Parse offset-bearing text as UTC, then use Date & time → Convert timezone.",
        );
      let value = `CAST(${c(p.columnId)} AS VARCHAR)`;
      if (p.decimalSeparator === ",") value = `replace(${value},',','.')`;
      let parsed =
        p.type === "date" || p.type === "timestamp"
          ? `CAST(try_strptime(${value},${l(p.format)}) AS ${p.type === "date" ? "DATE" : "TIMESTAMP"})`
          : storageCast(value, p.type);
      if (p.type === "decimal")
        parsed = `CASE WHEN isfinite(${parsed}) THEN ${parsed} END`;
      sql = `SELECT ${selectReplace(p.columnId, parsed)},${hidden} FROM ${from}`;
      const count = await n(
        `SELECT count(*) FROM ${from} WHERE ${c(p.columnId)} IS NOT NULL AND (${parsed}) IS NULL`,
      );
      diagnostics.push({
        severity: count ? "advisory" : "info",
        message: `${count} parsing failures. Original field text remains in the immutable source. Timestamp basis: ${p.timeBasis || "utc"}.`,
        count,
        examples: count
          ? await db.query(
              `SELECT ${c(p.columnId)} AS original FROM ${from} WHERE ${c(p.columnId)} IS NOT NULL AND (${parsed}) IS NULL LIMIT 5`,
            )
          : [],
      });
      columns = cols.map((x) =>
        x.id === p.columnId
          ? {
              ...x,
              type: p.type,
              timeBasis:
                p.type === "timestamp" ? p.timeBasis || "utc" : undefined,
              timeZone: undefined,
              role:
                p.type === "date" || p.type === "timestamp"
                  ? "temporal"
                  : "quantitative",
            }
          : x,
      );
      break;
    }
    case "text": {
      const v = `CAST(${c(p.columnId)} AS VARCHAR)`,
        value =
          p.action === "replace"
            ? `replace(${v},${l(p.search)},${l(p.replacement)})`
            : `${p.action}(${v})`;
      sql = `SELECT ${selectReplace(p.columnId, value)},${hidden} FROM ${from}`;
      columns = cols.map((x) =>
        x.id === p.columnId ? { ...x, type: "text" } : x,
      );
      break;
    }
    case "regex": {
      await validateRegex(db, p);
      const value = c(p.columnId),
        r = regexSQL(value, p);
      const counts = (
        await db.query(
          `SELECT count(*) FILTER(WHERE ${r.match}) AS matched, count(*) FILTER(WHERE NOT (${r.match})) AS unmatched, count(*) FILTER(WHERE ${value} IS NULL) AS missing FROM ${from}`,
        )
      )[0];
      diagnostics.push({
        severity: "info",
        message: `${counts.matched} matching; ${counts.unmatched} nonmatching; ${counts.missing} missing. RE2 pattern matching.`,
        examples: await db.query(
          `SELECT ${value} AS before, ${r.value} AS after FROM ${from} LIMIT 5`,
        ),
      });
      if (p.action === "filter")
        sql = `SELECT * FROM ${from} WHERE ${p.negate ? `NOT (${r.match})` : r.match}`;
      else if (p.action === "replace") {
        sql = `SELECT ${selectReplace(p.columnId, r.value)},${hidden} FROM ${from}`;
        columns = cols.map((x) =>
          x.id === p.columnId ? { ...x, type: "text", role: "nominal" } : x,
        );
      } else {
        checkName(p.name);
        if (cols.some((x) => x.id === p.outputId))
          throw new CanvasError(
            "SCHEMA",
            "Extracted column ID already exists",
            o.id,
          );
        columns.push(column(p.name, "text", p.outputId));
        sql = `SELECT *, ${r.value} AS ${q(p.outputId)} FROM ${from}`;
      }
      break;
    }
    case "split": {
      if (p.names.length !== p.ids.length)
        throw new CanvasError(
          "VALIDATION",
          "Every split field needs a stable ID",
        );
      p.names.forEach((name: string) => checkName(name));
      const extra = p.names.map((name: string, i: number) => {
        columns.push(column(name, "text", p.ids[i]));
        return `split_part(CAST(${c(p.columnId)} AS VARCHAR),${l(p.delimiter)},${i + 1}) AS ${q(p.ids[i])}`;
      });
      sql = `SELECT *, ${extra.join(", ")} FROM ${from}`;
      break;
    }
    case "recode": {
      const v = c(p.columnId);
      const matches = p.mappings.map((m: any) => l(m.from));
      if (p.unmatched === "error") {
        const bad = await n(
          `SELECT count(*) FROM ${from} WHERE ${v} IS NOT NULL ${matches.length ? `AND CAST(${v} AS VARCHAR) NOT IN (${matches})` : ""}`,
        );
        if (bad)
          throw new CanvasError(
            "EXECUTION",
            `${bad} unmatched categories; add mappings or choose an unmatched policy.`,
            o.id,
          );
      }
      const value = p.mappings.length
        ? `CASE ${p.mappings.map((m: any) => `WHEN CAST(${v} AS VARCHAR)=${l(m.from)} THEN ${l(m.to)}`).join(" ")} ELSE ${p.unmatched === "missing" ? "NULL" : `CAST(${v} AS VARCHAR)`} END`
        : p.unmatched === "missing"
          ? "NULL"
          : `CAST(${v} AS VARCHAR)`;
      sql = `SELECT ${selectReplace(p.columnId, value)},${hidden} FROM ${from}`;
      columns = cols.map((x) =>
        x.id === p.columnId ? { ...x, type: "text" } : x,
      );
      break;
    }
    case "missing": {
      const condition =
        p.columns.map((id: string) => `${c(id)} IS NULL`).join(" OR ") ||
        "FALSE";
      if (p.action === "replace")
        sql = `SELECT ${cols.map((x) => (p.columns.includes(x.id) ? `coalesce(${q(x.id)},${l(p.replacement)}) AS ${q(x.id)}` : q(x.id))).join(", ")},${hidden} FROM ${from}`;
      else
        sql = `SELECT * FROM ${from} WHERE ${p.action === "drop" ? "NOT " : ""}(${condition})`;
      break;
    }
    case "duplicates": {
      const keys = names(p.columns);
      if (!keys.length)
        throw new CanvasError(
          "VALIDATION",
          "Select duplicate identity columns",
        );
      const order = p.order
        .map(
          (k: any) =>
            `${c(k.columnId)} ${k.direction.toUpperCase()} NULLS ${k.nulls.toUpperCase()}`,
        )
        .join(", ");
      if (p.action === "remove" && !order)
        throw new CanvasError(
          "VALIDATION",
          "Deduplication requires explicit ordering and stable row-ID tie breaking",
        );
      sql = `SELECT * FROM ${from} QUALIFY ${p.action === "identify" ? `count(*) OVER(PARTITION BY ${keys})>1` : `row_number() OVER(PARTITION BY ${keys} ORDER BY ${order},"__rid")=1`}`;
      diagnostics.push({
        severity: "info",
        message:
          "Deterministic tie policy: smallest stable source-row identity wins.",
      });
      break;
    }
    case "correction": {
      const match = p.keys
        .map((k: any) => `${c(k.columnId)}=${l(k.value)}`)
        .join(" AND ");
      const matches = await n(`SELECT count(*) FROM ${from} WHERE ${match}`);
      if (matches !== 1)
        throw new CanvasError(
          "EXECUTION",
          `Correction matches ${matches} rows. Provide a unique, present key.`,
          o.id,
        );
      if (
        (await n(
          `SELECT count(*) FROM ${from} WHERE ${match} AND ${c(p.columnId)} IS NOT DISTINCT FROM ${l(p.oldValue)}`,
        )) !== 1
      )
        throw new CanvasError(
          "EXECUTION",
          "Old value does not match. Review the correction.",
        );
      sql = `SELECT ${selectReplace(p.columnId, `CASE WHEN ${match} THEN ${l(p.newValue)} ELSE ${c(p.columnId)} END`)},${hidden} FROM ${from}`;
      diagnostics.push({
        severity: "info",
        message: `Keyed correction: ${p.reason}`,
      });
      break;
    }
    case "derive": {
      checkName(p.name);
      const e = ex(p.expression, cols),
        type = expressionType(p.expression, cols);
      columns.push(column(p.name, type, p.columnId));
      sql = `SELECT *, ${e} AS ${q(p.columnId)} FROM ${from}`;
      const count = await n(
        `SELECT count(*) FROM ${from} WHERE (${e}) IS NULL`,
      );
      diagnostics.push({
        severity: count ? "advisory" : "info",
        message: `${count} missing derived values (missing inputs or invalid arithmetic). Nonfinite results and division by zero become missing.`,
        count,
        examples: count
          ? await db.query(
              `SELECT ${all()
                .split(", ")
                .filter((x) => x !== q(p.columnId))
                .join(", ")} FROM ${from} WHERE (${e}) IS NULL LIMIT 3`,
            )
          : [],
      });
      break;
    }
    case "longer": {
      const valueColumns = p.columns.map((id: string) =>
        requireColumn(cols, id),
      );
      const types = new Set(valueColumns.map((x: Column) => x.type));
      const type = types.size === 1 ? valueColumns[0].type : "text";
      const identifiers = cols.filter((x) => !p.columns.includes(x.id));
      if (
        p.namesTo === p.valuesTo ||
        identifiers.some((x) => [p.namesTo, p.valuesTo].includes(x.name))
      )
        throw new CanvasError("SCHEMA", "Pivot names need unique aliases");
      columns = [
        ...identifiers,
        column(p.namesTo, "text", p.namesId),
        column(p.valuesTo, type, p.valuesId),
      ];
      sql = valueColumns
        .map(
          (x: Column) =>
            `SELECT ${identifiers.map((x) => q(x.id) + ", ").join("")}${l(x.name)} AS ${q(p.namesId)}, ${types.size > 1 ? `CAST(${q(x.id)} AS VARCHAR)` : q(x.id)} AS ${q(p.valuesId)}, "__rid"||${l(":" + x.id)} AS "__rid", "__lineage" FROM ${from}${p.dropMissing ? ` WHERE ${q(x.id)} IS NOT NULL` : ""}`,
        )
        .join("\nUNION ALL\n");
      reviewMeaning = true;
      ordered = false;
      diagnostics.push({
        severity: "advisory",
        message:
          "One input row becomes one row per selected column. Variable names retain source-column context. Review “one row represents”.",
      });
      break;
    }
    case "wider": {
      const keys = names(p.identifiers),
        name = c(p.namesId),
        value = c(p.valuesId);
      const categories = await db.query(
        `SELECT DISTINCT CAST(${name} AS VARCHAR) AS category FROM ${from} WHERE ${name} IS NOT NULL ORDER BY 1`,
      );
      if (categories.length > 200)
        throw new CanvasError(
          "RESOURCE_LIMIT",
          "Pivot would create more than 200 columns. Filter categories first.",
        );
      if (
        p.aggregate === "error" &&
        (await n(
          `SELECT count(*) FROM (SELECT 1 FROM ${from} GROUP BY ${[...keys, name]} HAVING count(*)>1)`,
        ))
      )
        throw new CanvasError(
          "EXECUTION",
          "Duplicate pivot cell keys. Add identifiers or deliberately choose an aggregation.",
          o.id,
        );
      columns = p.identifiers.map((id: string) => requireColumn(cols, id));
      const parts = categories.map(({ category }) => {
        const id = `${o.id}_${Array.from(new TextEncoder().encode(category))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")}`;
        if (columns.some((c) => c.name === category))
          throw new CanvasError(
            "SCHEMA",
            `Pivot category ${category} conflicts with an identifier name`,
          );
        columns.push(
          column(category, requireColumn(cols, p.valuesId).type, id),
        );
        const a =
          p.aggregate === "error"
            ? `first(${value})`
            : aggregate(p.aggregate, value);
        return `${p.fill === null ? "" : "coalesce("}${a} FILTER(WHERE CAST(${name} AS VARCHAR)=${l(category)})${p.fill === null ? "" : `,${l(p.fill)})`} AS ${q(id)}`;
      });
      sql = `SELECT ${[...keys, ...parts].join(", ")}, md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)) AS "__rid", flatten(list("__lineage")) AS "__lineage" FROM ${from}${keys.length ? ` GROUP BY ${keys}` : ""}`;
      ordered = false;
      reviewMeaning = true;
      diagnostics.push({
        severity: "advisory",
        message: `${categories.length} dynamic columns materialized from observed categories. New/removed categories change schema; references remain bound to category identity.`,
      });
      break;
    }
    case "join": {
      const right = resolve(p.right),
        rf = q(right.name);
      const rc = (id: string) => q(requireColumn(right.columns, id).id);
      const on = p.keys
        .map((k: any) => `a.${c(k.left)}=b.${rc(k.right)}`)
        .join(" AND ");
      const leftKeys = p.keys.map((k: any) => c(k.left)),
        rightKeys = p.keys.map((k: any) => rc(k.right));
      const leftDup = await n(
          `SELECT count(*) FROM (SELECT 1 FROM ${from} GROUP BY ${leftKeys} HAVING count(*)>1)`,
        ),
        rightDup = await n(
          `SELECT count(*) FROM (SELECT 1 FROM ${rf} GROUP BY ${rightKeys} HAVING count(*)>1)`,
        );
      const joinType = p.how === "full" ? "FULL OUTER" : p.how.toUpperCase();
      const count = await n(
        `SELECT count(*) FROM ${from} a ${joinType} JOIN ${rf} b ON ${on}`,
      );
      const unmatchedLeft = await n(
        `SELECT count(*) FROM ${from} a ANTI JOIN ${rf} b ON ${on}`,
      );
      const unmatchedRight = await n(
        `SELECT count(*) FROM ${rf} b ANTI JOIN ${from} a ON ${on}`,
      );
      const bad =
        (p.relationship === "one-to-one" && (leftDup || rightDup)) ||
        (p.relationship === "many-to-one" && rightDup) ||
        (p.relationship === "one-to-many" && leftDup);
      diagnostics.push({
        severity: bad ? "advisory" : "info",
        message: `Expected ${p.relationship}; ${leftDup} duplicate left key groups, ${rightDup} duplicate right key groups. Exact output: ${count} rows; unmatched left: ${unmatchedLeft}; unmatched right: ${unmatchedRight}.`,
        count,
        examples: await db.query(
          `SELECT ${p.keys.map((k: any) => `a.${c(k.left)}`).join(",")},count(*) AS joined_rows FROM ${from} a INNER JOIN ${rf} b ON ${on} GROUP BY ${p.keys.map((k: any) => `a.${c(k.left)}`).join(",")} HAVING count(*)>1 LIMIT 5`,
        ),
      });
      if (count > p.maxRows)
        throw new CanvasError(
          "RESOURCE_LIMIT",
          `Join projects ${count} rows, above the ${p.maxRows} limit. Inspect duplicate keys or explicitly raise the limit (maximum 1,000,000).`,
          o.id,
        );
      if (["semi", "anti"].includes(p.how)) {
        sql = `SELECT a.* FROM ${from} a ${joinType} JOIN ${rf} b ON ${on}`;
      } else {
        const rightColumns = p.rightColumns.map((id: string) =>
          requireColumn(right.columns, id),
        );
        columns = cols.map((x) => ({ ...x, id: `${o.id}_l_${x.id}` }));
        const fields = cols.map(
          (x, i) => `a.${q(x.id)} AS ${q(columns[i].id)}`,
        );
        for (const x of rightColumns) {
          const name = p.aliases[x.id] || x.name;
          if (columns.some((c) => c.name === name))
            throw new CanvasError(
              "SCHEMA",
              `Join column “${name}” conflicts. Set an explicit right-side alias.`,
              o.id,
            );
          const id = `${o.id}_r_${x.id}`;
          columns.push({ ...x, id, name });
          fields.push(`b.${q(x.id)} AS ${q(id)}`);
        }
        sql = `SELECT ${fields.join(", ")}, coalesce(a."__rid",'unmatched')||':'||coalesce(b."__rid",'unmatched') AS "__rid", list_concat(coalesce(a."__lineage",[]::VARCHAR[]),coalesce(b."__lineage",[]::VARCHAR[])) AS "__lineage" FROM ${from} a ${joinType} JOIN ${rf} b ON ${on}`;
        reviewMeaning = true;
      }
      ordered = false;
      break;
    }
    case "append": {
      const others: Relation[] = p.inputs.map((r: Ref) => resolve(r));
      for (const other of others) {
        for (const x of other.columns) {
          const existing = columns.find((c) => c.name === x.name);
          if (existing && existing.type !== x.type)
            throw new CanvasError(
              "SCHEMA",
              `Append type mismatch for ${x.name}; parse explicitly.`,
            );
          if (!existing) {
            if (!p.union)
              throw new CanvasError(
                "SCHEMA",
                `Append has an extra column ${x.name}; enable union of columns explicitly.`,
              );
            columns.push({ ...x, id: `${o.id}_${x.id}` });
          }
        }
        if (!p.union)
          for (const x of cols)
            if (!other.columns.some((c) => c.name === x.name))
              throw new CanvasError(
                "SCHEMA",
                `Append missing column ${x.name}`,
              );
      }
      sql = [input, ...others]
        .map(
          (r, i) =>
            `SELECT ${columns
              .map((x) => {
                const match = r.columns.find((c) => c.name === x.name);
                return `${match ? q(match.id) : "NULL"} AS ${q(x.id)}`;
              })
              .join(
                ", ",
              )}, ${l(o.id + ":" + i + ":")}||"__rid" AS "__rid", "__lineage" FROM ${q(r.name)}`,
        )
        .join("\nUNION ALL\n");
      ordered = false;
      diagnostics.push({
        severity: "info",
        message: `Append maps by exact display name. ${p.union ? "Absent fields are explicitly filled with missing." : "Compatible schemas required."}`,
      });
      break;
    }
    case "summarize": {
      const keys = names(p.groups);
      columns = p.groups.map((id: string) => requireColumn(cols, id));
      const fields = p.aggregates.map((a: any) => {
        if (columns.some((x) => x.name === a.name))
          throw new CanvasError("SCHEMA", `Duplicate summary name ${a.name}`);
        const field = a.fn === "count" ? "*" : c(a.columnId);
        columns.push(
          column(
            a.name,
            ["count", "count_valid", "count_missing", "distinct"].includes(a.fn)
              ? "integer"
              : ["min", "max"].includes(a.fn)
                ? requireColumn(cols, a.columnId).type
                : "decimal",
            a.id,
          ),
        );
        return `${aggregate(a.fn, field, a.q)} AS ${q(a.id)}`;
      });
      sql = `SELECT ${[...keys, ...fields].join(", ")},coalesce(md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)),'empty') AS "__rid",coalesce(flatten(list("__lineage")),[]::VARCHAR[]) AS "__lineage" FROM ${from}${keys.length ? ` GROUP BY ${keys}` : ""}`;
      for (const a of p.aggregates)
        if (a.columnId && a.fn !== "count")
          diagnostics.push({
            severity: "info",
            message: `${a.name}: numeric aggregates ignore missing; ${await n(`SELECT count(${c(a.columnId)}) FROM ${from}`)} valid input values.`,
          });
      reviewMeaning = true;
      ordered = false;
      break;
    }
    case "proportion": {
      const keys = names(p.groups),
        den = ex(p.denominator, cols),
        num = ex(p.numerator, cols),
        nId = `${o.id}_numerator`,
        dId = `${o.id}_denominator`;
      columns = [
        ...p.groups.map((id: string) => requireColumn(cols, id)),
        column("numerator", "integer", nId),
        column("denominator", "integer", dId),
        column(p.name, "decimal", p.columnId),
      ];
      const a = `count(*) FILTER(WHERE (${den}) AND (${num}))`,
        b = `count(*) FILTER(WHERE ${den})`;
      sql = `SELECT ${keys.length ? keys + "," : ""}${a} AS ${q(nId)},${b} AS ${q(dId)},${a}::DOUBLE/NULLIF(${b},0) AS ${q(p.columnId)},coalesce(md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)),'empty') AS "__rid",coalesce(flatten(list("__lineage")),[]::VARCHAR[]) AS "__lineage" FROM ${from}${keys.length ? ` GROUP BY ${keys}` : ""}`;
      reviewMeaning = true;
      ordered = false;
      break;
    }
    case "check": {
      const keys = names(p.columns);
      let count = 0;
      if (p.test === "unique") {
        if (!keys.length)
          throw new CanvasError("VALIDATION", "Choose key columns");
        count = await n(
          `SELECT count(*) FROM (SELECT 1 FROM ${from} GROUP BY ${keys} HAVING count(*)>1)`,
        );
      } else if (p.test === "row_count") {
        const rows = await n(`SELECT count(*) FROM ${from}`);
        count = rows < p.min || rows > p.max ? 1 : 0;
      } else if (p.test === "reference") {
        if (
          !p.reference ||
          p.referenceColumns?.length !== keys.length ||
          !keys.length
        )
          throw new CanvasError("VALIDATION", "Choose matching reference keys");
        const r = resolve(p.reference);
        count = await n(
          `SELECT count(*) FROM ${from} a ANTI JOIN ${q(r.name)} b ON ${keys.map((k, i) => `a.${k}=b.${q(requireColumn(r.columns, p.referenceColumns[i]).id)}`).join(" AND ")}`,
        );
      } else {
        if (!keys.length)
          throw new CanvasError("VALIDATION", "Choose check columns");
        const condition = keys
          .map((k) =>
            p.test === "nonmissing"
              ? `${k} IS NULL`
              : p.test === "range"
                ? `${k} IS NOT NULL AND (${k}<${p.min} OR ${k}>${p.max})`
                : p.allowed.length
                  ? `${k} IS NOT NULL AND CAST(${k} AS VARCHAR) NOT IN (${p.allowed.map(l)})`
                  : `${k} IS NOT NULL`,
          )
          .join(" OR ");
        count = await n(`SELECT count(*) FROM ${from} WHERE ${condition}`);
      }
      diagnostics.push({
        severity: count ? p.severity : "info",
        message: `${p.severity === "required" ? "Required" : "Advisory"} ${p.test} check: ${count ? "FAILED" : "passed"}; ${count} violations.`,
        count,
      });
      sql = `SELECT * FROM ${from}`;
      break;
    }
    default:
      throw new CanvasError("VALIDATION", `Unknown operation ${o.kind}`, o.id);
  }
  return {
    sql,
    columns,
    ordered,
    diagnostics: diagnostics.map((d) => ({ ...d, operationId: o.id })),
    reviewMeaning,
  };
}

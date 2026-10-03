import { strToU8, zipSync } from "fflate";
import {
  type Bundle,
  type Column,
  type Expr,
  type Operation,
  topological,
  CanvasError,
} from "../domain/model";
import type { RunResult, TableResult } from "../engine/core";
import {
  literal,
  quote,
  expressionType,
  aggregate,
} from "../compiler/expressions";
import { pythonRuntime, rRuntime } from "./runtimes";

export type CodeLanguage = "python" | "r";
const string = (v: string) => JSON.stringify(v);
const pyList = (v: string[]) => JSON.stringify(v);
const rList = (v: string[]) =>
  v.length ? `c(${v.map(string).join(", ")})` : "character()";
const types: Record<string, string> = {
  text: "VARCHAR",
  integer: "BIGINT",
  decimal: "DOUBLE",
  boolean: "BOOLEAN",
  date: "DATE",
  timestamp: "TIMESTAMP",
};
const hidden = ["__rid", "__lineage"];

/** Export the complete typed source snapshots, never preview rows or environment-dependent reparsing. */
export function sourceStatements(
  bundle: Bundle,
  tables: Record<string, TableResult>,
): string[] {
  const statements: string[] = [];
  for (const source of bundle.project.sources) {
    const table = tables[source.id];
    if (
      !table ||
      table.id !== source.id ||
      table.preview ||
      table.rows.length !== table.rowCount ||
      JSON.stringify(table.columns) !== JSON.stringify(source.columns)
    )
      throw new CanvasError(
        "EXPORT",
        `The complete typed source ${source.name} is required for code export. Run all outputs and try again.`,
      );
    statements.push(
      `CREATE TABLE ${quote("source_" + source.id)} (${source.columns.map((c) => `${quote(c.id)} ${types[c.type]}`).join(", ")}, "__rid" VARCHAR, "__lineage" VARCHAR[])`,
    );
    for (let i = 0; i < table.rows.length; i += 500) {
      statements.push(
        `INSERT INTO ${quote("source_" + source.id)} VALUES ${table.rows
          .slice(i, i + 500)
          .map((row, j) => {
            const rid = literal(table.lineage[i + j][0]);
            return `(${[...source.columns.map((c) => literal(row[c.id])), rid, `[${rid}]`].join(", ")})`;
          })
          .join(",\n")}`,
      );
    }
  }
  return statements;
}

// Translate only expressions with matching nullable semantics. Everything else uses
// the actual compiled DuckDB step, never an approximate translation or skipped step.
function nativeExpression(
  e: Expr,
  columns: Column[],
  lang: CodeLanguage,
): string | undefined {
  const py = lang === "python";
  if (e.kind === "column")
    return py ? `df[${string(e.columnId)}]` : `.data[[${string(e.columnId)}]]`;
  if (e.kind === "literal") {
    if (e.value === null || typeof e.value === "object") return undefined;
    if (typeof e.value === "boolean")
      return py ? (e.value ? "True" : "False") : e.value ? "TRUE" : "FALSE";
    return JSON.stringify(e.value);
  }
  if (e.kind === "unary") {
    const a = nativeExpression(e.arg, columns, lang);
    if (!a) return undefined;
    if (["is_missing", "not_missing"].includes(e.op)) {
      const test = py ? `pd.isna(${a})` : `is.na(${a})`;
      return e.op === "is_missing"
        ? test
        : py
          ? `(~as_condition(${test}, df.index))`
          : `(!${test})`;
    }
    if (e.op === "not" && expressionType(e.arg, columns) === "boolean")
      return `(${py ? "~as_condition" : "!"}(${a}${py ? ", df.index" : ""}))`;
    return undefined;
  }
  if (e.kind === "binary") {
    const a = nativeExpression(e.left, columns, lang),
      b = nativeExpression(e.right, columns, lang);
    if (!a || !b) return undefined;
    const ta = expressionType(e.left, columns),
      tb = expressionType(e.right, columns);
    if (
      py &&
      ["+", "-", "*", "/"].includes(e.op) &&
      ["integer", "decimal"].includes(ta) &&
      ["integer", "decimal"].includes(tb)
    ) {
      const left = `as_number(${a}, df.index)`,
        right = `as_number(${b}, df.index)`;
      return `finite((${left}) ${e.op} (${e.op === "/" ? `${right}.mask(${right} == 0)` : right}), df.index)`;
    }
    if (["and", "or"].includes(e.op) && ta === "boolean" && tb === "boolean")
      return py
        ? `(as_condition(${a}, df.index) ${e.op === "and" ? "&" : "|"} as_condition(${b}, df.index))`
        : `((${a}) ${e.op === "and" ? "&" : "|"} (${b}))`;
    // Numeric or Boolean comparisons only; text collation and implicit casts stay in DuckDB.
    if (
      ["=", "!=", ">", ">=", "<", "<="].includes(e.op) &&
      ta === tb &&
      ["integer", "decimal", "boolean"].includes(ta)
    )
      return `((${a}) ${e.op === "=" ? "==" : e.op} (${b}))`;
  }
  return undefined;
}

function nativeStep(
  op: Operation,
  before: Column[],
  after: Column[],
  lang: CodeLanguage,
): string[] | undefined {
  const p = op.params,
    py = lang === "python",
    list = py ? pyList : rList;
  const field = (id: string) =>
    py ? `df[${string(id)}]` : `.data[[${string(id)}]]`;
  switch (op.kind) {
    case "summarize": {
      if (py) return undefined;
      const expressions = p.aggregates.map((a: any) => {
        const f = field(a.columnId);
        const value =
          a.fn === "count"
            ? "n()"
            : ["sum", "mean", "min", "max", "median", "sd"].includes(a.fn)
              ? `${a.fn}(${f}, na.rm = TRUE)`
              : `sql(${string(aggregate(a.fn, quote(a.columnId || ""), a.q))})`;
        return `!!${string(a.id)} := ${value}`;
      });
      expressions.push(
        `\`__rid\` = sql(${string('coalesce(md5(CAST(list("__rid" ORDER BY "__rid") AS VARCHAR)),\'empty\')')})`,
      );
      expressions.push(
        `\`__lineage\` = sql(${string('coalesce(flatten(list("__lineage")),[]::VARCHAR[])')})`,
      );
      return [
        ...(p.groups.length
          ? [`data <- data |> group_by(across(all_of(${rList(p.groups)})))`]
          : []),
        `data <- data |> summarise(${expressions.join(", ")}, .groups = "drop")`,
      ];
    }
    case "text": {
      if (!py && ["upper", "lower"].includes(p.action))
        return [
          `data <- data |> mutate(!!${string(p.columnId)} := ${p.action === "upper" ? "toupper" : "tolower"}(as.character(${field(p.columnId)})))`,
        ];
      if (
        !py ||
        p.action !== "replace" ||
        before.find((c) => c.id === p.columnId)?.type !== "text"
      )
        return undefined;
      return [
        p.search
          ? `${field(p.columnId)} = ${field(p.columnId)}.str.replace(${string(p.search)}, ${string(p.replacement)}, regex=False)`
          : "# Replacing an empty search string is a no-op in DuckDB.",
      ];
    }
    case "split": {
      if (!py || before.find((c) => c.id === p.columnId)?.type !== "text")
        return undefined;
      return [
        `parts = ${field(p.columnId)}.str.split(${string(p.delimiter)}, regex=False)`,
        ...p.ids.map(
          (id: string, i: number) =>
            `${field(id)} = parts.str.get(${i}).fillna("").where(${field(p.columnId)}.notna(), pd.NA)`,
        ),
      ];
    }
    case "recode": {
      if (!py || before.find((c) => c.id === p.columnId)?.type !== "text")
        return undefined;
      // SQL CASE uses the first matching mapping, including a mapping to null.
      const seen = new Set<string>();
      const pairs = p.mappings.filter((m: any) => {
        if (seen.has(m.from)) return false;
        seen.add(m.from);
        return true;
      });
      const mapping = `{${pairs.map((m: any) => `${string(m.from)}: ${m.to === null ? "pd.NA" : string(m.to)}`).join(", ")}}`;
      return [
        `mapping = ${mapping}`,
        ...(p.unmatched === "error"
          ? [
              `if (${field(p.columnId)}.notna() & ~${field(p.columnId)}.isin(mapping)).any():`,
              '    raise ValueError("Unmatched recode category")',
            ]
          : []),
        `mapped = ${field(p.columnId)}.map(mapping).astype("string")`,
        `${field(p.columnId)} = mapped${p.unmatched === "missing" ? "" : `.where(${field(p.columnId)}.isin(mapping), ${field(p.columnId)})`}`,
      ];
    }
    case "select":
      // A regex selection is compiled against the observed display-name schema.
      // Keep it in SQL so the generated script identifies that schema dependency.
      if (p.selection === "regex") return undefined;
      return [
        py
          ? `df = df.loc[:, ${list([...after.map((c) => c.id), "__rid"])}].copy()`
          : `data <- data |> select(all_of(${list([...after.map((c) => c.id), ...hidden])}))`,
      ];
    case "rename":
      return [
        "# Display-name change only; stable column IDs remain unchanged.",
      ];
    case "filter": {
      const e = nativeExpression(p.expression, before, lang);
      return e
        ? [
            py
              ? `df = df.loc[as_condition(${e}, df.index).fillna(False)].copy()`
              : `data <- data |> filter(${e})`,
          ]
        : undefined;
    }
    case "missing": {
      if (p.action === "replace") return undefined;
      if (!p.columns.length)
        return [
          py
            ? p.action === "keep"
              ? "df = df.iloc[0:0].copy()"
              : "# No columns selected; retain every row."
            : p.action === "keep"
              ? "data <- data |> filter(FALSE)"
              : "# No columns selected; retain every row.",
        ];
      const condition = py
        ? `df[${list(p.columns)}].isna().any(axis=1)`
        : p.columns.map((id: string) => `is.na(${field(id)})`).join(" | ");
      return [
        py
          ? `df = df.loc[${p.action === "drop" ? "~" : ""}(${condition})].copy()`
          : `data <- data |> filter(${p.action === "drop" ? "!" : ""}(${condition}))`,
      ];
    }
    case "sort": {
      // R executes arrange through dbplyr/DuckDB, preserving SQL collation.
      // Python only sorts non-text keys; the stable row ID tie-breaker is ASCII.
      if (
        py &&
        p.keys.some(
          (k: any) => before.find((c) => c.id === k.columnId)?.type === "text",
        )
      )
        return undefined;
      if (py)
        return [
          'df = df.sort_values("__rid", kind="stable")',
          ...[...p.keys]
            .reverse()
            .map(
              (k: any) =>
                `df = df.sort_values(${string(k.columnId)}, ascending=${k.direction === "asc" ? "True" : "False"}, na_position=${string(k.nulls)}, kind="stable")`,
            ),
        ];
      return [
        `data <- data |> arrange(${p.keys
          .flatMap((k: any) => [
            k.nulls === "first"
              ? `desc(is.na(${field(k.columnId)}))`
              : `is.na(${field(k.columnId)})`,
            k.direction === "desc"
              ? `desc(${field(k.columnId)})`
              : field(k.columnId),
          ])
          .concat('.data[["__rid"]]')
          .join(", ")})`,
      ];
    }
    case "derive": {
      const e = nativeExpression(p.expression, before, lang);
      // Unsupported expressions remain in their original compiled SQL step.
      return e
        ? [
            py
              ? `df[${string(p.columnId)}] = ${e}`
              : `data <- data |> mutate(!!${string(p.columnId)} := ${e})`,
          ]
        : undefined;
    }
    case "duplicates": {
      // R window ordering and SQL text collation stay in the original SQL step.
      if (!py) return undefined;
      const lines: string[] = [];
      if (p.action === "remove") {
        const sort = nativeStep(
          { ...op, kind: "sort", params: { keys: p.order } },
          before,
          after,
          lang,
        );
        if (!sort) return undefined;
        lines.push(...sort);
      }
      lines.push(
        p.action === "identify"
          ? `df = df.loc[df.duplicated(subset=${list(p.columns)}, keep=False)].copy()`
          : `df = df.drop_duplicates(subset=${list(p.columns)}, keep="first").copy()`,
      );
      return lines;
    }
  }
  return undefined;
}

export function validateCodeExport(
  bundle: Bundle,
  result?: RunResult,
): asserts result is RunResult {
  const p = bundle.project;
  if (
    !result ||
    result.status !== "ready" ||
    result.revision !== p.revision ||
    p.recipes.some(
      (r) =>
        !result.tables[r.id] ||
        result.steps[r.id]?.length !== r.operations.length ||
        result.steps[r.id].some((s) => !s.after || s.error),
    )
  )
    throw new CanvasError(
      "EXPORT",
      "Run all outputs successfully for the current project before exporting code. Partial, stale, or failed runs cannot be exported.",
    );
}

export function exportCode(
  bundle: Bundle,
  result: RunResult | undefined,
  language: CodeLanguage,
  sourceTables?: Record<string, TableResult>,
) {
  validateCodeExport(bundle, result);
  const py = language === "python",
    p = bundle.project;
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, value: string) => {
    files[path] = strToU8(value);
  };
  const statements = sourceStatements(bundle, sourceTables || result.tables);
  put("sources.json", JSON.stringify(statements));
  put("project.json", JSON.stringify(p, null, 2));
  const relations = new Map(p.sources.map((s) => [s.id, "source_" + s.id]));
  const code = [py ? pythonRuntime : rRuntime];
  const coverage: {
    recipe: string;
    operation: string;
    kind: string;
    backend: string;
  }[] = [];
  const outputs: {
    id: string;
    name: string;
    table: string;
    columns: Column[];
  }[] = [];
  for (const id of topological(p)) {
    const recipe = p.recipes.find((r) => r.id === id)!;
    let input = relations.get(recipe.inputRef.id)!;
    code.push(`\n# Recipe: ${string(recipe.name)} [${recipe.id}]`);
    for (const [index, op] of recipe.operations.entries()) {
      const step = result.steps[id][index],
        after = step.after!;
      const output = "step_" + op.id;
      const native = nativeStep(
        op,
        step.before.columns,
        after.columns,
        language,
      );
      if (!step.statement)
        throw new CanvasError(
          "EXPORT",
          "Compiled step is unavailable. Run all outputs again.",
        );
      const sql = step.statement;
      // Remove untrusted display names from executable SQL comments.
      put(`steps/${op.id}.sql`, sql);
      code.push(
        `\n# ${index + 1}. ${op.kind} [${op.id}] — ${native ? (py ? "pandas" : "dplyr/dbplyr") : "DuckDB SQL (preserves Data Canvas semantics)"}`,
      );
      if (native) {
        if (py) {
          code.push(`df = read_frame(${string(input)})`, ...native);
          const projection = after.columns
            .map(
              (c) =>
                `CAST(n.${quote(c.id)} AS ${types[c.type]}) AS ${quote(c.id)}`,
            )
            .join(", ");
          code.push(
            `save_frame(df, ${string(output)}, ${string(input)}, ${string(projection)})`,
          );
        } else {
          code.push(
            `data <- tbl(con, ${string(input)})`,
            ...native,
            `save_table(data, ${string(output)})`,
          );
        }
      } else code.push(`sql_step(${string(`steps/${op.id}.sql`)})`);
      coverage.push({
        recipe: recipe.name,
        operation: op.id,
        kind: op.kind,
        backend: native ? (py ? "pandas" : "dplyr/dbplyr") : "DuckDB SQL",
      });
      input = output;
    }
    relations.set(id, input);
    outputs.push({
      id,
      name: recipe.name,
      table: input,
      columns: result.tables[id].columns,
    });
  }
  // Sources remain usable in projects with no recipes.
  if (!outputs.length)
    for (const s of p.sources)
      outputs.push({
        id: s.id,
        name: s.name,
        table: relations.get(s.id)!,
        columns: s.columns,
      });
  put("outputs.json", JSON.stringify(outputs, null, 2));
  put("coverage.json", JSON.stringify(coverage, null, 2));
  put(
    "diagnostics.json",
    JSON.stringify(
      result.diagnostics,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ),
  );
  code.push(
    py
      ? "\noutputs = export_outputs()\n# Example: outputs[recipe_id] is a pandas DataFrame with display-name columns.\n"
      : "\noutputs <- export_outputs()\n# Example: outputs[[recipe_id]] is a tibble with display-name columns.\n",
  );
  put(py ? "analysis.py" : "analysis.R", code.join("\n"));
  for (const s of p.sources)
    files[`original/${s.id}.${s.importSpec.format}`] =
      bundle.assets[s.assetRef];
  if (py)
    put("requirements.txt", "duckdb==1.5.4\npandas>=2.2,<4\nnumpy>=1.26,<3\n");
  else
    put(
      "install.R",
      'options(repos = c(CRAN = "https://cloud.r-project.org"))\ninstall.packages(c("remotes", "DBI", "dplyr", "dbplyr", "jsonlite", "tibble", "bit64"))\nremotes::install_version("duckdb", version = "1.5.4.3", upgrade = "never")\n',
    );
  const backed = coverage.filter((c) => c.backend === "DuckDB SQL").length;
  put(
    "README.txt",
    `Data Canvas ${py ? "Python / pandas" : "R / tidyverse"} export\n\n${p.title}\nRevision ${p.revision}. Exported from a complete successful run.\n\nSETUP\nExtract the entire ZIP into a folder.\n${py ? "Install Python 3.10+, then run: python -m pip install -r requirements.txt\nRun: python analysis.py" : "Install R 4.1+, then run: Rscript install.R\nUse DuckDB R package 1.5.4 or a compatible 1.5.4 patch release.\nRun: Rscript analysis.R\nIn RStudio, set the working directory to this folder and source analysis.R."}\n\nOUTPUTS\nThe script recreates every recipe in dependency order and writes display-name CSV files to results/.\nThe outputs dictionary/list contains ${py ? "pandas DataFrames" : "tibbles"} keyed by stable recipe ID. outputs.json maps IDs to names and types.\nStable column IDs in the script prevent renaming from breaking dependencies; project.json and outputs.json provide display names.\n\nBACKENDS AND LIMITS\n${coverage.length - backed} steps use ${py ? "pandas directly" : "dplyr/dbplyr on DuckDB"}; ${backed} use the original compiled DuckDB SQL. See coverage.json and per-step comments.\nDuckDB is required, for faithful transformation semantics, nulls, large integers, datetimes and lineage. This is not a DuckDB-free transpilation.\nRE2 regexes, parsing, joins, reshaping, sampling and other steps without a compatible native translation retain their compiled SQL rather than approximate pandas/R behavior. Supported numeric arithmetic uses pandas; R summaries use dplyr/dbplyr. Edit the corresponding steps/*.sql file to change those operations.\nThe included sources.json contains all typed source rows from the successful run, including normalized UTC timestamps and exact integers, not preview rows. Source parsing is not repeated in R or Python. original/ contains the original files, named by source ID. Editing those files alone does not change sources.json: reimport and re-export in Data Canvas to regenerate it.\nThe export reproduces this saved input/schema. Dynamic wide pivots and regex column selection are resolved for that schema. Re-export after changing source categories or columns.\nData-check diagnostics are the saved run's findings in diagnostics.json. Compiler-time guards (such as unique corrections, pivot conflicts and join limits) were checked for these inputs; they are not rerun if you manually edit source SQL or recipe steps.\nCharts, report layouts and SQL-workspace queries are preserved in project.json but are not executed or translated into plotting code.\nCSV uses an unquoted empty field for null and quoted empty text for a blank string. Consult outputs.json for types when importing CSV. Zero-column tables remain data frames and use a JSON row-count file instead of CSV. R normally uses integer64 for BIGINT outputs; columns containing -9223372036854775808 use character strings with a notice because R integer64 reserves that value for NA.\n`,
  );
  return {
    bytes: zipSync(files, { level: 6 }),
    files,
    nativeSteps: coverage.length - backed,
    sqlSteps: backed,
  };
}

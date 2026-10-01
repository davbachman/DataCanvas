import { z } from "zod";
import {
  type Column,
  type Operation,
  uid,
  col,
  lit,
  binary,
  CanvasError,
  type Expr,
} from "./model";
export const aggregates = [
  "count",
  "count_valid",
  "count_missing",
  "distinct",
  "sum",
  "mean",
  "median",
  "min",
  "max",
  "sd",
  "quantile",
] as const;
const str = z.string(),
  cols = z.array(str),
  ref = z.object({ kind: z.enum(["source", "recipe"]), id: str });
const expr: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("column"), columnId: str }),
    z.object({
      kind: z.literal("literal"),
      value: z.union([
        z.null(),
        str,
        z.number().finite(),
        z.boolean(),
        z.object({
          type: z.enum(["integer", "decimal", "date", "timestamp"]),
          value: str,
        }),
      ]),
    }),
    z.object({
      kind: z.literal("binary"),
      op: z.enum([
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
      ]),
      left: expr,
      right: expr,
    }),
    z.object({
      kind: z.literal("unary"),
      op: z.enum(["not", "is_missing", "not_missing", "negate"]),
      arg: expr,
    }),
    z.object({
      kind: z.literal("call"),
      fn: z.enum([
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
      ]),
      args: z.array(expr).min(1).max(8),
    }),
    z.object({
      kind: z.literal("conditional"),
      when: expr,
      then: expr,
      otherwise: expr,
    }),
  ]),
);
const agg = z.object({
  id: str,
  name: str,
  fn: z.enum(aggregates),
  columnId: str.optional(),
  q: z.number().min(0).max(1).optional(),
});
export const registry = {
  filter: {
    label: "Filter rows",
    category: "Choose",
    color: "#387f9a",
    description:
      "Keep rows where the condition is true. False and unknown are counted separately.",
    schema: z.object({ expression: expr }),
  },
  select: {
    label: "Select columns",
    category: "Choose",
    color: "#387f9a",
    description: "Keep the selected columns, preserving their identities.",
    schema: z.object({ columns: cols, mode: z.enum(["keep", "drop"]) }),
  },
  rename: {
    label: "Rename column",
    category: "Choose",
    color: "#387f9a",
    description:
      "Change the display name without changing the column identity.",
    schema: z.object({ columnId: str, name: str.min(1) }),
  },
  sort: {
    label: "Sort rows",
    category: "Choose",
    color: "#387f9a",
    description:
      "Declare analytical ordering. Ties keep the stable source-row identity.",
    schema: z.object({
      keys: z
        .array(
          z.object({
            columnId: str,
            direction: z.enum(["asc", "desc"]),
            nulls: z.enum(["first", "last"]),
          }),
        )
        .min(1),
    }),
  },
  sample: {
    label: "Seeded sample",
    category: "Choose",
    color: "#387f9a",
    description:
      "Sample without replacement by a deterministic MD5 ranking of seed and stable row ID.",
    schema: z.object({
      size: z.number().nonnegative(),
      fraction: z.boolean(),
      seed: str,
      algorithm: z.literal("md5-rank-v1"),
    }),
  },
  parse: {
    label: "Parse values",
    category: "Clean",
    color: "#9d7240",
    description:
      "Convert explicit values. Failures become missing with separate issue counts; original source text is retained.",
    schema: z.object({
      columnId: str,
      type: z.enum(["integer", "decimal", "boolean", "date", "timestamp"]),
      format: str,
      decimalSeparator: z.enum([".", ","]),
    }),
  },
  text: {
    label: "Clean text",
    category: "Clean",
    color: "#9d7240",
    description: "Apply an explicit case-sensitive text transformation.",
    schema: z.object({
      columnId: str,
      action: z.enum(["trim", "upper", "lower", "replace"]),
      search: str,
      replacement: str,
    }),
  },
  regex: {
    label: "Regular expression",
    category: "Clean",
    color: "#9d7240",
    description:
      "RE2 pattern matching: filter rows, replace text, or extract a capture into a new column. Missing values remain missing.",
    schema: z.object({
      columnId: str,
      action: z.enum(["filter", "replace", "extract"]),
      pattern: str.max(4096),
      replacement: str.max(10000),
      ignoreCase: z.boolean(),
      multiline: z.boolean(),
      dotAll: z.boolean(),
      global: z.boolean(),
      negate: z.boolean(),
      group: z.number().int().min(0).max(9),
      name: str.min(1),
      outputId: str.regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    }),
  },
  split: {
    label: "Split column",
    category: "Clean",
    color: "#9d7240",
    description:
      "Split text on a literal delimiter into explicitly named columns.",
    schema: z.object({
      columnId: str,
      delimiter: str.min(1),
      names: z.array(str).min(1),
      ids: cols,
    }),
  },
  recode: {
    label: "Recode categories",
    category: "Clean",
    color: "#9d7240",
    description:
      "Map exact values. Choose what happens to unmatched categories.",
    schema: z.object({
      columnId: str,
      mappings: z.array(z.object({ from: str, to: z.string().nullable() })),
      unmatched: z.enum(["keep", "missing", "error"]),
    }),
  },
  missing: {
    label: "Handle missing",
    category: "Clean",
    color: "#9d7240",
    description:
      "Keep, drop, or replace null values in selected columns. Blank text is separate from missing.",
    schema: z.object({
      columns: cols,
      action: z.enum(["keep", "drop", "replace"]),
      replacement: z.union([str, z.number(), z.boolean(), z.null()]),
    }),
  },
  duplicates: {
    label: "Find / remove duplicates",
    category: "Clean",
    color: "#9d7240",
    description:
      "Identify duplicates, or keep the first under an explicit sort. Ties break by stable row identity.",
    schema: z.object({
      columns: cols,
      action: z.enum(["identify", "remove"]),
      order: z.array(
        z.object({
          columnId: str,
          direction: z.enum(["asc", "desc"]),
          nulls: z.enum(["first", "last"]),
        }),
      ),
    }),
  },
  correction: {
    label: "Keyed correction",
    category: "Clean",
    color: "#9d7240",
    description:
      "Apply one explained correction only if the key is unique and the old value matches.",
    schema: z.object({
      keys: z
        .array(
          z.object({
            columnId: str,
            value: z.union([str, z.number(), z.boolean()]),
          }),
        )
        .min(1),
      columnId: str,
      oldValue: z.union([str, z.number(), z.boolean(), z.null()]),
      newValue: z.union([str, z.number(), z.boolean(), z.null()]),
      reason: str.min(1),
    }),
  },
  derive: {
    label: "Derive column",
    category: "Derive",
    color: "#7165a8",
    description:
      "Create a column from a pure expression. Invalid or nonfinite arithmetic becomes missing.",
    schema: z.object({ name: str.min(1), columnId: str, expression: expr }),
  },
  longer: {
    label: "Pivot longer",
    category: "Reshape",
    color: "#a06478",
    description:
      "Create a row per selected value column. Missing values are retained unless explicitly dropped. Review row meaning.",
    schema: z.object({
      columns: cols.min(1),
      namesTo: str,
      valuesTo: str,
      namesId: str,
      valuesId: str,
      dropMissing: z.boolean(),
    }),
  },
  wider: {
    label: "Pivot wider",
    category: "Reshape",
    color: "#a06478",
    description:
      "Materialize observed categories as columns. Duplicate cell keys require a deliberate aggregate.",
    schema: z.object({
      identifiers: cols,
      namesId: str,
      valuesId: str,
      aggregate: z.enum(["error", ...aggregates]),
      fill: z.union([str, z.number(), z.null()]),
    }),
  },
  join: {
    label: "Join tables",
    category: "Combine",
    color: "#438273",
    description:
      "Match equality keys, never null keys. Inspect multiplicity and review row meaning.",
    schema: z.object({
      right: ref,
      how: z.enum(["left", "inner", "full", "semi", "anti"]),
      keys: z.array(z.object({ left: str, right: str })).min(1),
      relationship: z.enum([
        "one-to-one",
        "one-to-many",
        "many-to-one",
        "many-to-many",
      ]),
      rightColumns: cols,
      aliases: z.record(str, str),
      maxRows: z.number().int().positive().max(1000000),
    }),
  },
  append: {
    label: "Append tables",
    category: "Combine",
    color: "#438273",
    description:
      "Append by explicit names, never position. Union mode fills absent fields with missing.",
    schema: z.object({ inputs: z.array(ref).min(1), union: z.boolean() }),
  },
  summarize: {
    label: "Summarize",
    category: "Summarize",
    color: "#538067",
    description:
      "One row per group, or one overall row. Counts and numeric aggregates have explicit missing-value semantics.",
    schema: z.object({ groups: cols, aggregates: z.array(agg).min(1) }),
  },
  proportion: {
    label: "Proportion",
    category: "Summarize",
    color: "#538067",
    description:
      "Display the numerator, denominator, and ratio for an explicit population and condition.",
    schema: z.object({
      groups: cols,
      numerator: expr,
      denominator: expr,
      name: str,
      columnId: str,
    }),
  },
  check: {
    label: "Check data",
    category: "Checks",
    color: "#927941",
    description:
      "Inspect without changing data. Required failures remain visible and never prevent saving results.",
    schema: z.object({
      test: z.enum([
        "unique",
        "nonmissing",
        "categories",
        "range",
        "row_count",
        "reference",
      ]),
      columns: cols,
      severity: z.enum(["advisory", "required"]),
      min: z.number(),
      max: z.number(),
      allowed: cols,
      reference: ref.optional(),
      referenceColumns: cols.optional(),
    }),
  },
} as const;
export type OpKind = keyof typeof registry;
export function validateOperation(o: Operation) {
  const def = registry[o.kind as OpKind];
  if (!def)
    throw new CanvasError(
      "VALIDATION",
      `Unsupported operation ${o.kind}`,
      o.id,
    );
  const r = def.schema.safeParse(o.params);
  if (!r.success)
    throw new CanvasError(
      "VALIDATION",
      `${def.label}: ${r.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
      o.id,
    );
  if (o.draft)
    throw new CanvasError("DRAFT", "Complete this draft before running.", o.id);
}
export function newOperation(
  kind: OpKind,
  columns: Column[],
  sourceId = "",
): Operation {
  const c = columns[0]?.id || "",
    num = columns.find((c) => ["decimal", "integer"].includes(c.type))?.id || c;
  const id = uid("op");
  const defaults: Record<OpKind, any> = {
    filter: { expression: binary(">", col(num), lit(0)) },
    select: { columns: columns.map((c) => c.id), mode: "keep" },
    rename: { columnId: c, name: "Renamed column" },
    sort: { keys: [{ columnId: c, direction: "asc", nulls: "last" }] },
    sample: { size: 10, fraction: false, seed: "42", algorithm: "md5-rank-v1" },
    parse: {
      columnId: c,
      type: "decimal",
      format: "%Y-%m-%d",
      decimalSeparator: ".",
    },
    regex: {
      columnId: columns.find((c) => c.type === "text")?.id || c,
      action: "filter",
      pattern: ".+",
      replacement: "",
      ignoreCase: false,
      multiline: false,
      dotAll: false,
      global: true,
      negate: false,
      group: 1,
      name: "Extracted text",
      outputId: `${id}_match`,
    },
    text: { columnId: c, action: "trim", search: "", replacement: "" },
    split: {
      columnId: c,
      delimiter: " ",
      names: ["part_1", "part_2"],
      ids: [`${id}_1`, `${id}_2`],
    },
    recode: { columnId: c, mappings: [], unmatched: "keep" },
    missing: { columns: [c], action: "drop", replacement: null },
    duplicates: {
      columns: [c],
      action: "identify",
      order: [{ columnId: c, direction: "asc", nulls: "last" }],
    },
    correction: {
      keys: [{ columnId: c, value: "" }],
      columnId: num,
      oldValue: null,
      newValue: null,
      reason: "",
    },
    derive: {
      name: "new_value",
      columnId: `${id}_value`,
      expression: binary("*", col(num), lit(2)),
    },
    longer: {
      columns: [num],
      namesTo: "variable",
      valuesTo: "value",
      namesId: `${id}_name`,
      valuesId: `${id}_value`,
      dropMissing: false,
    },
    wider: {
      identifiers: [c],
      namesId: columns[1]?.id || c,
      valuesId: num,
      aggregate: "error",
      fill: null,
    },
    join: {
      right: { kind: "source", id: sourceId },
      how: "left",
      keys: [{ left: c, right: c }],
      relationship: "many-to-one",
      rightColumns: [],
      aliases: {},
      maxRows: 250000,
    },
    append: { inputs: [{ kind: "source", id: sourceId }], union: false },
    summarize: {
      groups: [],
      aggregates: [
        { id: `${id}_count`, name: "row_count", fn: "count", columnId: num },
      ],
    },
    proportion: {
      groups: [],
      numerator: binary(">", col(num), lit(0)),
      denominator: lit(true),
      name: "proportion",
      columnId: `${id}_ratio`,
    },
    check: {
      test: "unique",
      columns: [c],
      severity: "advisory",
      min: 0,
      max: 100,
      allowed: [],
    },
  };
  return { id, kind, version: 1, params: defaults[kind] };
}

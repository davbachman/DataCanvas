import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Bundle,
  type Operation,
} from "../../src/domain/model";
import { createSource, defaultImport } from "../../src/persistence/import";

export async function codeExportFixture(): Promise<Bundle> {
  const project = blankProject();
  const bytes = new TextEncoder().encode(
    'text,value,big,flag,date,time\n"",2,9223372036854775807,true,2026-01-02,2026-01-02T01:02:03.123456Z\nNA,NA,-9223372036854775808,NA,NA,NA\n"a.b|x",3,9007199254740993,false,2026-01-03,2026-01-03T00:00:00Z\n"a.b|x",3,42,false,2026-01-03,2026-01-03T00:00:00Z\n"é\nquote""",0,5,true,2026-01-04,2026-01-04T00:00:00Z\n',
  );
  const { source } = await createSource(
    "quoted source\n--",
    bytes,
    { ...defaultImport, missingTokens: ["NA"] },
    [
      column("text", "text", "text"),
      column("value", "decimal", "value"),
      column("big", "integer", "big"),
      column("flag", "boolean", "flag"),
      column("date", "date", "date"),
      column("time", "timestamp", "time"),
    ],
  );
  source.id = "src";
  project.sources = [source];
  const op = (id: string, kind: string, params: any): Operation => ({
    id,
    kind,
    version: 1,
    params,
  });
  const recipe = (
    id: string,
    operations: Operation[],
    input = "src",
    kind: "source" | "recipe" = "source",
  ) => ({
    id,
    name: id === "clean" ? 'Recipe\nCREATE TABLE injected(x INT); -- "' : id,
    inputRef: { kind, id: input },
    rowMeaning: "Fixture row",
    operations,
  });
  project.recipes = [
    recipe("clean", [
      op("replace", "text", {
        columnId: "text",
        action: "replace",
        search: ".",
        replacement: "$\\'",
      }),
      op("split", "split", {
        columnId: "text",
        delimiter: "|",
        names: ["part one", "part two"],
        ids: ["part_one", "part_two"],
      }),
      op("recode", "recode", {
        columnId: "part_two",
        mappings: [
          { from: "x", to: null },
          { from: "x", to: "ignored duplicate" },
        ],
        unmatched: "keep",
      }),
      op("derive", "derive", {
        name: "is known",
        columnId: "is_known",
        expression: { kind: "unary", op: "not_missing", arg: col("value") },
      }),
      op("constant", "derive", {
        name: "constant",
        columnId: "constant",
        expression: { kind: "unary", op: "not_missing", arg: lit(2) },
      }),
      op("choose", "select", {
        columns: [
          "text",
          "value",
          "big",
          "flag",
          "date",
          "time",
          "part_two",
          "is_known",
          "constant",
        ],
        mode: "keep",
      }),
      op("rename", "rename", {
        columnId: "text",
        name: 'Name " with\nnewline',
      }),
      op("sort", "sort", {
        keys: [
          { columnId: "value", direction: "desc", nulls: "first" },
          { columnId: "big", direction: "asc", nulls: "last" },
        ],
      }),
    ]),
    recipe(
      "filtered",
      [
        op("filter", "filter", {
          expression: binary("or", binary(">", col("value"), lit(1)), {
            kind: "unary",
            op: "not",
            arg: col("flag"),
          }),
        }),
      ],
      "clean",
      "recipe",
    ),
    recipe("duplicates", [
      op("dedup", "duplicates", {
        columns: ["value"],
        action: "remove",
        order: [{ columnId: "big", direction: "desc", nulls: "last" }],
      }),
    ]),
    recipe("identified", [
      op("dups", "duplicates", {
        columns: ["value"],
        action: "identify",
        order: [],
      }),
    ]),
    recipe("missing", [
      op("keep_missing", "missing", {
        columns: ["value"],
        action: "keep",
        replacement: null,
      }),
    ]),
    recipe("empty", [op("drop_all", "filter", { expression: lit(false) })]),
    recipe("arithmetic", [
      op("divide", "derive", {
        name: "ratio",
        columnId: "ratio",
        expression: binary("/", lit(1), col("value")),
      }),
      op("multiply", "derive", {
        name: "overflow",
        columnId: "overflow",
        expression: binary("*", col("value"), lit(1e308)),
      }),
    ]),
    recipe(
      "empty_summary",
      [
        op("empty_summary_op", "summarize", {
          groups: [],
          aggregates: [
            { id: "empty_n", name: "n", fn: "count" },
            { id: "empty_sum", name: "sum", fn: "sum", columnId: "value" },
            {
              id: "empty_valid",
              name: "valid",
              fn: "count_valid",
              columnId: "value",
            },
          ],
        }),
      ],
      "empty",
      "recipe",
    ),
    recipe("group_summary", [
      op("group_summary_op", "summarize", {
        groups: ["flag"],
        aggregates: [
          { id: "summary_n", name: "n", fn: "count" },
          ...[
            "count_valid",
            "count_missing",
            "distinct",
            "sum",
            "mean",
            "min",
            "max",
            "sd",
            "median",
            "quantile",
          ].map((fn) => ({
            id: `summary_${fn}`,
            name: fn,
            fn,
            columnId: "value",
            q: 0.25,
          })),
        ],
      }),
    ]),
    recipe("no_columns", [
      op("drop_columns", "select", { columns: [], mode: "keep" }),
    ]),
    recipe("regex", [
      op("regex_extract", "regex", {
        columnId: "text",
        action: "extract",
        pattern: "([a-z]+)",
        replacement: "",
        ignoreCase: true,
        multiline: false,
        dotAll: false,
        global: true,
        negate: false,
        group: 1,
        name: "match",
        outputId: "match",
      }),
      op("sample", "sample", {
        size: 3,
        fraction: false,
        seed: "42",
        algorithm: "md5-rank-v1",
      }),
    ]),
  ];
  // Deliberately out of order: generators must follow recipe dependencies.
  project.recipes.reverse();
  return { project, assets: { [source.assetRef]: bytes } };
}

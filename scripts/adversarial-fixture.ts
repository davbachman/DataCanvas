import { newOperation } from "../src/domain/operations";
import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Operation,
  type Recipe,
} from "../src/domain/model";
import { createSource, defaultImport } from "../src/persistence/import";
import { packBundle } from "../src/persistence/bundle";
import { writeFile } from "node:fs/promises";
const p = blankProject();
p.projectId = "adversarial";
p.title = "Neutral semantic parity fixture";
const bytes = new TextEncoder().encode(
  "id,group,value,date,timestamp,large,flag\n001,A,1,31/01/2025,2025-01-31 12:00:00.123456,9007199254740993,true\n002,A,3,02/03/2025,2025-03-02 12:00:00.000001,9007199254740994,false\n003,B,NULL,invalid,NULL,1,true\n004,B,NULL,NULL,NULL,2,false\n",
);
const definitions: [
  string,
  "text" | "decimal" | "integer" | "boolean" | "timestamp",
][] = [
  ["id", "text"],
  ["group", "text"],
  ["value", "decimal"],
  ["date", "text"],
  ["timestamp", "timestamp"],
  ["large", "integer"],
  ["flag", "boolean"],
];
const { source } = await createSource(
  "Edge values",
  bytes,
  { ...defaultImport, missingTokens: ["NULL"] },
  definitions.map(([id, type]) => column(id, type, id)),
);
source.id = "source";
p.sources = [source];
const o = (id: string, kind: string, params: any): Operation => ({
  id,
  kind,
  version: 1,
  params,
});
const recipe = (id: string, operations: Operation[]): Recipe => ({
  id,
  name: id,
  inputRef: { kind: "source", id: "source" },
  operations,
  rowMeaning: "One fixture record.",
});
p.recipes = [
  recipe("parsed", [
    o("parse_date", "parse", {
      columnId: "date",
      type: "date",
      format: "%d/%m/%Y",
      decimalSeparator: ".",
    }),
  ]),
  recipe("sample", [
    o("sample_values", "sample", {
      size: 2,
      fraction: false,
      seed: "parity",
      algorithm: "md5-rank-v1",
    }),
  ]),
  recipe("summary", [
    o("summarize_values", "summarize", {
      groups: ["group"],
      aggregates: [
        { id: "sum", name: "sum", fn: "sum", columnId: "value" },
        { id: "sd", name: "sd", fn: "sd", columnId: "value" },
        {
          id: "q",
          name: "quantile",
          fn: "quantile",
          columnId: "value",
          q: 0.25,
        },
        { id: "count", name: "count", fn: "count" },
      ],
    }),
  ]),
  recipe("empty", [
    o("filter_none", "filter", { expression: lit(false) }),
    o("empty_summary", "summarize", {
      groups: [],
      aggregates: [
        { id: "empty_count", name: "count", fn: "count" },
        { id: "empty_sum", name: "sum", fn: "sum", columnId: "value" },
      ],
    }),
  ]),
  recipe("invalid_arithmetic", [
    o("divide_zero", "derive", {
      name: "ratio",
      columnId: "ratio",
      expression: binary("/", col("value"), lit(0)),
    }),
  ]),
];
const regexDefaults = newOperation("regex", source.columns).params;
p.recipes.push(
  recipe("regex", [
    o("regex_extract", "regex", {
      ...regexDefaults,
      columnId: "id",
      action: "extract",
      pattern: "^0+(\\d+)$",
      group: 1,
      name: "Digits",
      outputId: "digits",
    }),
    o("regex_replace", "regex", {
      ...regexDefaults,
      columnId: "group",
      action: "replace",
      pattern: "([ab])",
      replacement: "group-\\1",
      ignoreCase: true,
    }),
    o("regex_filter", "regex", {
      ...regexDefaults,
      columnId: "group",
      action: "filter",
      pattern: "^GROUP-a$",
      ignoreCase: true,
    }),
  ]),
);
await writeFile(
  "tests/fixtures/adversarial.datacanvas",
  packBundle({ project: p, assets: { [source.assetRef]: bytes } }),
);

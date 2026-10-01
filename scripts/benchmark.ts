import { performance } from "node:perf_hooks";
import os from "node:os";
import { writeFile } from "node:fs/promises";
import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Bundle,
  type Operation,
} from "../src/domain/model";
import { createSource, defaultImport } from "../src/persistence/import";
import { nativeDB } from "../src/engine/native";
import { Engine } from "../src/engine/core";
import { packBundle } from "../src/persistence/bundle";
const count = Number(process.argv[2] || 100000),
  project = blankProject();
project.projectId = "benchmark";
project.title = "Baseline benchmark";
const fields = [
  "record_id",
  "lookup_id",
  "category",
  ...Array.from({ length: 17 }, (_, i) => "measure_" + i),
];
const csv = [
  fields.join(","),
  ...Array.from({ length: count }, (_, i) =>
    [
      String(i).padStart(6, "0"),
      String(i % 10000).padStart(5, "0"),
      [" North ", " South ", " West "][i % 3],
      ...Array.from({ length: 17 }, (_, j) =>
        (i + j) % 29 === 0 ? "NA" : String(((i * 13 + j * 17) % 1000) / 10),
      ),
    ].join(","),
  ),
].join("\n");
const bytes = new TextEncoder().encode(csv);
const { source } = await createSource(
  "Baseline measurements",
  bytes,
  { ...defaultImport, missingTokens: ["NA"] },
  fields.map((name, i) => column(name, i < 3 ? "text" : "decimal", name)),
);
source.id = "baseline";
const lookupBytes = new TextEncoder().encode(
  [
    "lookup_id,region",
    ...Array.from(
      { length: 10000 },
      (_, i) => `${String(i).padStart(5, "0")},${["East", "West"][i % 2]}`,
    ),
  ].join("\n"),
);
const { source: lookup } = await createSource(
  "Lookup",
  lookupBytes,
  defaultImport,
  [
    column("lookup_id", "text", "lookup_key"),
    column("region", "text", "lookup_region"),
  ],
);
lookup.id = "lookup";
project.sources = [source, lookup];
const operations: Operation[] = [
  {
    id: "clean_category",
    kind: "text",
    version: 1,
    params: {
      columnId: "category",
      action: "trim",
      search: "",
      replacement: "",
    },
  },
  ...Array.from({ length: 17 }, (_, i) => ({
    id: "derive_" + i,
    kind: "derive",
    version: 1 as const,
    params: {
      name: "derived_" + i,
      columnId: "derived_" + i,
      expression: binary("*", col("measure_" + i), lit(1.1)),
    },
  })),
  {
    id: "filter",
    kind: "filter",
    version: 1,
    params: { expression: binary(">=", col("measure_0"), lit(0)) },
  },
  {
    id: "join",
    kind: "join",
    version: 1,
    params: {
      right: { kind: "source", id: "lookup" },
      how: "left",
      keys: [{ left: "lookup_id", right: "lookup_key" }],
      relationship: "many-to-one",
      rightColumns: ["lookup_region"],
      aliases: {},
      maxRows: 250000,
    },
  },
];
project.recipes = [
  {
    id: "main",
    name: "Twenty transformations",
    inputRef: { kind: "source", id: "baseline" },
    rowMeaning: "One synthetic measurement record.",
    operations,
  },
  {
    id: "summary",
    name: "Regional summary",
    inputRef: { kind: "recipe", id: "main" },
    rowMeaning: "One region.",
    operations: [
      {
        id: "regional",
        kind: "summarize",
        version: 1,
        params: {
          groups: ["join_r_lookup_region"],
          aggregates: [
            {
              id: "mean",
              name: "mean",
              fn: "mean",
              columnId: "join_l_derived_0",
            },
            { id: "n", name: "count", fn: "count" },
          ],
        },
      },
    ],
  },
  {
    id: "sample",
    name: "Deterministic branch",
    inputRef: { kind: "recipe", id: "main" },
    rowMeaning: "One sampled record.",
    operations: [
      {
        id: "sample_rows",
        kind: "sample",
        version: 1,
        params: {
          size: 1000,
          fraction: false,
          seed: "benchmark",
          algorithm: "md5-rank-v1",
        },
      },
    ],
  },
];
const bundle: Bundle = {
  project,
  assets: { [source.assetRef]: bytes, [lookup.assetRef]: lookupBytes },
};
await writeFile("/tmp/data-canvas-benchmark.datacanvas", packBundle(bundle));
const startup = performance.now();
const db = await nativeDB();
const coldStartMs = performance.now() - startup;
const before = process.memoryUsage();
const engine = new Engine(db);
const result = await engine.run(bundle, {
  previewRows: 100,
  onProgress: (message) => process.stderr.write(message + "\n"),
});
const after = process.memoryUsage();
const warm = performance.now();
await db.query(
  'SELECT avg("measure_0") FROM "source_baseline" WHERE "measure_0">50',
);
const warmQueryMs = performance.now() - warm;
const repeatedStart = performance.now();
await engine.run(bundle, { previewRows: 100 });
const repeatedRunMs = performance.now() - repeatedStart;
const measurements = {
  repeatedRunMs,
  date: new Date().toISOString(),
  runtime: process.version,
  engine: result.engineVersion,
  platform: os.platform(),
  architecture: os.arch(),
  cpu: os.cpus()[0].model,
  logicalCPUs: os.cpus().length,
  rows: count,
  sourceColumns: 20,
  mainOperations: 20,
  lookupRows: 10000,
  coldStartMs,
  warmQueryMs,
  fullPipelineMs: result.elapsedMs,
  memoryBefore: before,
  memoryAfter: after,
  status: result.status,
  errors: result.errors,
};
await writeFile(
  "docs/benchmark-native.json",
  JSON.stringify(measurements, null, 2),
);
console.log(JSON.stringify(measurements, null, 2));
await db.close();

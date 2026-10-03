# Integration API v1

No browser, editor, accounts, external database, or grading service is required for Linux execution. Use Node 24, `npm ci`, and the pinned native DuckDB package. The external caller owns source paths, output paths, and process/container policy.

## CLI

```sh
node --import tsx src/headless/cli.ts validate PROJECT.datacanvas
node --import tsx src/headless/cli.ts inspect PROJECT.datacanvas
node --import tsx src/headless/cli.ts run PROJECT.datacanvas \
  --outputs regional,regional_chart \
  --source-overrides /explicit/path/replacements.json \
  --out /explicit/path/results \
  --timeout-ms 60000 \
  --memory-mb 512 \
  --max-rows 1000000
```

Omit `--outputs` to compute all recipes and charts. Recipe prerequisites are resolved automatically; charts reference stable recipe IDs. `validate` checks the declarative structure and asset presence. `run` verifies fingerprints, rereads source bytes, and recomputes. No submitted cache or validation flag is authoritative. `inspect` enumerates named sources, recipes, queries, charts, columns, and dependencies.

`run` writes `result.json` to the caller's directory and emits one compact JSON status record to stdout. Human progress goes to stderr. `npm run --silent runner -- ...` is equivalent; `--silent` suppresses npm's own script banner. See [formats](FORMATS.md) for table values, previews, diagnostics, and resolved charts.

Execution runs in a child process. The wall-clock limit kills that process even during a native query. The memory argument sets the DuckDB memory limit and the child JavaScript old-space limit separately; it is **not a hard cap on total resident memory**. Native buffers and runtime overhead can exceed it. An external multi-tenant service should apply an OS/container memory cap. Row limits apply to source loading and final output counts; oversized results are rejected instead of silently truncated. Defaults are 60 seconds, 512 MiB per engine/JS heap budget, and 1,000,000 rows.

| Exit code | Meaning |
| --- | --- |
| 0 | Valid/inspected/computed, possibly with advisory or required quality-check diagnostics |
| 2 | Validation, unsupported version, dependency cycle, or incomplete draft |
| 3 | Missing/changed source, fingerprint mismatch, schema/reference error |
| 4 | Execution, blocked dependency, or query-policy error |
| 5 | Explicit cancellation |
| 6 | Time, memory-process failure, join-size, rendering, or output resource limit |

A replacement manifest is a caller-supplied JSON array. Map new header names to existing stable column IDs:

```json
[
  {
    "sourceId": "measurements",
    "path": "/caller-controlled/measurements.csv",
    "columnMapping": {
      "station_id": "station",
      "region": "region",
      "Jan": "jan",
      "Feb": "feb",
      "Mar": "mar"
    }
  }
]
```

All established columns must map exactly once. The saved import policy remains active unless an explicit `importSpec` override is supplied. Replacements apply to a clone and are recorded in the result; the original bundle is unchanged. Project-controlled paths never grant filesystem access.

## TypeScript / JavaScript

```ts
import {load, inspect, run, replaceSources, API_VERSION} from './src/headless/api';
const bundle = await load('/explicit/project.datacanvas');
console.log(inspect(bundle));
const result = await run(bundle, {
  outputIds: ['regional', 'regional_chart'],
  maxOutputRows: 100000,
  memory: '512MB'
});
```

The library API leaves cancellation/process isolation to its caller; use the CLI for an enforced wall-clock timeout. `src/engine/core.ts` is DOM-independent, and `src/compiler/sql.ts` compiles every operation. A database adapter supplies query/exec/close and optional bulk insertion. Query execution requires a separate isolated adapter instance; user SQL cannot access the main analysis database.

## Browser API

The production application exposes `window.DataCanvas` with `apiVersion: 1`, `load(Uint8Array)`, `save(bundle)`, `validate(bundle)`, and `run(bundle, options, AbortSignal?)`. Each API run uses a dedicated disposable worker and performs the same source verification as interactive execution. This interface operates on ordinary local declarative bundles. Supply `previewRows` explicitly if a consumer needs more than the default 100 rows, and inspect `preview`/`rowCount`.

Browser/headless parity fixtures run the actual Wasm and native DuckDB **1.5.4** engines against the same exported examples. They compare schemas, typed values with duplicate multiplicity, counts, authored encodings, and computed chart tables. Additional unit fixtures cover nulls, empty/all-missing groups, quote-containing names, wide-pivot drift, corrections, malformed records, deterministic sampling, and large integers.

The public API returns computational outputs and quality diagnostics only. It contains no scores, rubrics, assignments, hidden solutions, submission systems, LMS integration, or external-adapter implementation.

## Chart sequences and orientation

Chart sequence blocks compile directly to the existing `Chart` / `Layer` model; no Blockly runtime or workspace serialization is required by API callers. Connected layer order is the order of `chart.layers`. Statistics are represented by the mark (`count`, `histogram`, `box`) or `layer.aggregate`; field mappings, bin width, and percentage labels use the existing layer properties. Advanced chart properties are preserved when the block editor changes a layer.

For `bar`, `count`, and `histogram` layers, `orientation` accepts `"vertical"` (the default when absent) or `"horizontal"`. The resolved Vega-Lite encoding swaps screen axes and interval endpoints for horizontal layers while leaving statistical tables, authored field IDs, omission policy, and lineage unchanged. Authored X/Y scale settings follow their field roles rather than screen positions. Clients should preserve this optional field when saving a project.

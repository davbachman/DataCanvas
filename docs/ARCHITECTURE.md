# Architecture

The canonical project model is the authority. Blockly objects, layout, SQL, query results, chart rendering, and IndexedDB records are projections or transports.

```text
React workspace / accessible recipe list / Blockly adapter
                           ↓ canonical edits + undo
                   domain/model + operations
                           ↓ validated expressions
                     compiler/expressions + sql
                           ↓ shared relational semantics
        browser worker (DuckDB-Wasm) ↔ Linux runner (native DuckDB)
                           ↓ typed results + diagnostics
           table inspector / lineage / charts / SQL / reports
```

- `domain/model.ts`: versioned types, structural validation, stable refs, cycle detection.
- `domain/operations.ts`: registry with categories, labels, explanations, parameter schemas, and defaults.
- `compiler/expressions.ts`: pure expression compiler, safe identifier/literal quoting, aggregate semantics.
- `compiler/regex.ts`: shared RE2 SQL generation, validation, and worker-based pattern preview; no JavaScript-regex fallback.
- `compiler/sql.ts`: relational compilation, schema propagation, dynamic schema discovery, diagnostic queries, size guards.
- `engine/core.ts`: source verification, typed ingestion, dependency execution, step snapshots, exact profiles, previews, lineage retrieval, caching.
- `engine/wasm.ts` and `native.ts`: adapters pinned to DuckDB 1.5.4. Browser uses bundled single-thread MVP Wasm without cross-origin isolation. Native loading uses the appender; Wasm loading uses Arrow batches, avoiding massive SQL INSERT parsing.
- `engine/client.ts` and `worker.ts`: revision/generation isolation, progress, worker cancellation/reconstruction, reusable idle-engine caches.
- `editor/Blocks.tsx`: typed Blockly statement/expression projection. Block gestures and the accessible list produce canonical recipe edits. Coordinates and selection never serve as execution input.
- `charts/resolve.ts`, `selection.ts`, `extract.ts`: explicit chart statistics, data lineage, range/category predicates, reusable statistical recipes, and generated Vega-Lite specs.
- `domain/geography.ts`, `charts/maps.ts`, `MapControls.tsx`: bounded GeoJSON validation, spherical winding/projection fitting, bundled world geography, full-data region joins/aggregates, point validation, saved map views, and geographic Vega-Lite specs. `scripts/world-basemap.mjs` reproducibly converts pinned world-atlas data to the checked-in GeoJSON.
- `charts/tiles.ts`, `mapNavigation.ts`, `imageExport.ts`: viewport-only OpenStreetMap tile selection, saved geographic navigation, and embedding already-loaded image pixels in standalone exports. Native resolution computes URLs without fetching imagery; browser renderers handle ordinary cached image requests.
- `engine/queries.ts`: structural SELECT/WITH parser/allowlist, isolated database with only bound tables, disabled external access, typed comparison preserving multiplicity. No SQL-to-block round trip.
- `persistence/import.ts`, `bundle.ts`: raw source retention, import diagnostics, portable ZIP validation, recovery, download transport.
- `headless/api.ts`, `cli.ts`, `process.ts`: generic integration interface and caller-limited execution process.

## Caching and invalidation

Source data caches include source identity, verified fingerprint, import settings, and column metadata. Operation caches include semantic version, operation identity/kind/parameters/draft state, predecessor identity, and referenced dependency cache keys. Snapshot caches store bounded previews and exact computed profiles, not an independent analysis model. Changes invalidate affected descendants through these keys; failed outputs are removed before dependency resolution. No cache is serialized into a project bundle or trusted by a fresh run.

SQL views avoid retaining every full intermediate table. Hidden source-row IDs and contributor lists are separate from visible data. Contributor arrays are compact compared with record copies, but large many-to-many joins and aggregate lineage still require memory; limits and measurements are documented.

## Extend an operation

Add a parameter schema, default constructor, category, and explanation to the registry. Implement inference/compilation/diagnostics in `compileOperation`, configuration controls in the inspector, and independent semantic fixtures. Keep IDs stable and quote every identifier/literal. A new expression must be added to the explicit registry/compiler and both editor projections. Never insert `eval`, arbitrary SQL, or executable project hooks.

## Precedents

FlowLab's public recovery and execution guides informed explicit Step/Run, error attachment, undo, and separate portable backups. NeuralCanvas's canvas guide informed linked intermediate values, navigable representations, and named composition. No source code was copied, and neither repository was modified. This app uses snapping table recipes as its primary editor, not a node-and-wire programming canvas.

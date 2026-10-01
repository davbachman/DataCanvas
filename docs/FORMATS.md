# Versioned interchange formats

## Project bundle

A `.datacanvas` file is a ZIP containing `manifest.json` and the original source assets at `sources/<id>.<extension>`. Caches are not exported or trusted. Version 1 is self-contained; incomplete/relinked bundles are not supported.

The canonical `Project` type and runtime validator live in `src/domain/model.ts`. `formatName` is `Data Canvas`, `schemaVersion` is `1`, and `semanticVersion` is `1.0.0`. A future version is rejected with a clear validation error; there are no earlier public formats requiring migration.

| Field | Meaning |
| --- | --- |
| `projectId`, `title`, `revision` | Stable identity, display title, semantic edit revision |
| `sources` | IDs, asset paths, SHA-256, import settings, columns, authored row meaning, attribution |
| `recipes` | IDs, names, discriminated `inputRef`, ordered operations, authored output row meaning |
| `charts` | IDs, recipe IDs, layers, field encodings, explicit statistics, facets, scales, captions |
| `queries` | Terminal query objects, SQL text, explicit name→table-ID bindings |
| `reportItems` | Ordered text/chart/table items; evidence IDs and reviewed revision |
| `viewState` | Non-authoritative editor state, separate from analysis semantics |
| `engineVersions`, `randomSeeds` | Engine provenance and deterministic sampling metadata |

Each operation has `id`, `kind`, `version: 1`, `params`, optional `note`, `draft`, and `collapsed`. Parameter schemas and defaults live in the operation registry. Drafts may be incomplete and remain saveable; an unknown kind/version is never executable. Expressions are recursive literal/column/unary/binary/call/conditional objects. Column references use IDs rather than SQL or display names. Only the declared pure function registry is accepted.

Archive loading checks format versions, source and recipe references, cycles, IDs, operation schemas, required assets, unsafe paths, and size limits. Absolute paths, `..` segments, and backslashes in archive paths are rejected. Limits: 64 MiB compressed and 256 MiB declared decompressed data. Fingerprints are checked during execution. Display strings and notes are text, not executable HTML.

## Execution result v1

`result.json` has `formatName: "Data Canvas execution"`, `resultVersion: 1`, `semanticVersion`, `engineVersion`, `revision`, `status`, `tables`, `steps`, `diagnostics`, `errors`, `elapsedMs`, `sql`, optional `sourceOverrides`, and `charts`.

A table has stable `id`, `columns`, `rows`, `rowCount`, `preview`, `ordered`, authored `rowMeaning`, optional `reviewMeaning`, exact `profiles`, parallel `lineage` arrays, diagnostics, and generated SQL. Columns retain ID, display name, storage type, analytical role, and optional metadata. A row is an object keyed by stable column ID. `preview: true` explicitly means `rows.length < rowCount`. Final selected headless recipe outputs are complete; source and intermediate-step tables use bounded previews. Browser default previews contain at most 100 rows.

Values use the following typed JSON representation:

| Value | Representation |
| --- | --- |
| Missing | `null` |
| Text | JSON string, including literal `"NA"` and `""` |
| Boolean | JSON Boolean |
| Decimal/real | Finite JSON number, IEEE-754 double precision |
| Integer | `{"type":"integer","value":"9007199254740993"}` |
| Exact decimal literal | `{"type":"decimal","value":"1.2300"}` in expressions; current stored real columns use DOUBLE |
| Date | `{"type":"date","value":"2025-01-31"}` |
| Timestamp | `{"type":"timestamp","value":"2025-01-31 12:00:00"}` with project UTC policy |

Integer tags preserve values beyond JavaScript's safe range. Date/timestamp tags preserve meaning. Numeric chart rendering converts integers to JavaScript numbers; use typed exports for exact large-integer analysis. No rounding, sorting, duplicate removal, or null normalization is performed to make outputs compare favorably.

Lineage is separate from visible columns: source ID and one-based imported data-row index. Joins concatenate left/right contributors; aggregates combine contributors; pivots retain the variable field and extended internal row identity. Ordinary CSV exports exclude lineage. Result consumers should ignore internal physical relation/cache fields and rely on documented stable IDs.

`steps[recipeId]` contains each executed operation's before/after previews or originating error. `errors` identifies recipe, operation when available, stable code, and explanation. `status: ready` with `rowCount: 0` is a valid empty result. A failed computation has an error and no current table for that output. Required data-quality failures are diagnostics and can coexist with computed results.

Resolved charts include the authored composition, a generated Vega-Lite specification, exact statistical tables, omitted-record counts, and explanatory notes. This exposes analytical intent without screenshot comparison.

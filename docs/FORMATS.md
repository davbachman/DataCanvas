# Versioned interchange formats

## Project bundle

A `.datacanvas` file is a ZIP containing `manifest.json` and the original source assets at `sources/<id>.<extension>`. Caches are not exported or trusted. Version 1 is self-contained; incomplete/relinked bundles are not supported.

The canonical `Project` type and runtime validator live in `src/domain/model.ts`. `formatName` is `Data Canvas`, `schemaVersion` is `2`, and `semanticVersion` is `2.0.0`. Other versions are rejected explicitly. This prerelease format change has no migration; all bundled examples use version 2.

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

Each operation has `id`, `kind`, `version`, `params`, optional `note`, `draft`, and `collapsed`. Existing operations use version 1; Select columns additionally supports version 2 for dynamic RE2 matching of display names. Version 1 selections retain their explicit stable-ID behavior. Parameter schemas and defaults live in the operation registry. A version 2 selection stores `{columns: [], mode: "keep" | "drop", selection: "regex", pattern: string, ignoreCase: boolean}`; `columns` is ignored while pattern selection is active. Input names are re-evaluated on every run, and retained IDs/order are preserved. An older release rejects operation version 2 rather than ignoring these settings. Drafts may be incomplete and remain saveable; an unknown kind/version is never executable. Expressions are recursive literal/column/unary/binary/call/conditional objects. Column references use IDs rather than SQL or display names. Only the declared pure function registry is accepted.

Archive loading checks format versions, source and recipe references, cycles, IDs, operation schemas, required assets, unsafe paths, and size limits. Absolute paths, `..` segments, and backslashes in archive paths are rejected. Limits: 64 MiB compressed and 256 MiB declared decompressed data. Fingerprints are checked during execution. Display strings and notes are text, not executable HTML.

## Geographic charts

Layer marks `map_points` and `choropleth` use `x` for longitude/region key and `y` for latitude/value. Choropleths store their explicit `aggregate` on the layer; absent aggregation requires one record per region. Geographic and Cartesian layers cannot share a chart.

The optional chart `map` object has `version: 1` or `2`, `projection` (`equalEarth`, `mercator`, `equirectangular`), `basemap` (`world`, `custom`), `featureKey`, `zoom`, `centerLongitude`, `centerLatitude`, `graticule`, and `colorScheme` (`blues`, `viridis`, `redblue`). Custom maps also embed normalized `boundaries` (GeoJSON FeatureCollection), optional `boundaryName`, and `attribution`. `$id` selects feature IDs; other join keys select properties. Validation and numeric limits are defined in `domain/geography.ts` and the [mapping guide](MAPPING.md).

World geometry is pinned to the app's bundled Natural Earth/world-atlas version; custom geometry is retained directly in the manifest. A missing map object on a geographic chart uses the world/Equal Earth defaults. Project schema is 2. Map version values other than 1 or 2 are rejected. Version 2 adds optional `tiles` (`none`, `openstreetmap`) and `overlayOpacity` (0–1). Online tiles require `projection: "mercator"`; the canonical validator rejects incompatible settings. Street zoom can exceed 2,000 (bounded by the schema), while the UI caps it at tile level 19. Older clients reject version 2 rather than silently dropping online settings. No imagery or provider credentials are saved in the project. Resolved geographic specifications embed geometry and preserve typed statistical tables and contributors in the same execution result format.

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
| Timestamp | `{"type":"timestamp","value":"2025-01-31 12:00:00"}` with column `timeBasis` (`utc` or `wall`; an absent annotation means UTC) and optional `timeZone` metadata |

Integer tags preserve values beyond JavaScript's safe range. Date/timestamp tags preserve meaning. Numeric chart rendering converts integers to JavaScript numbers; use typed exports for exact large-integer analysis. No rounding, sorting, duplicate removal, or null normalization is performed to make outputs compare favorably.

Lineage is separate from visible columns: source ID and one-based imported data-row index. Joins concatenate left/right contributors; aggregates combine contributors; pivots retain the variable field and extended internal row identity. Ordinary CSV exports exclude lineage. Result consumers should ignore internal physical relation/cache fields and rely on documented stable IDs.

`steps[recipeId]` contains each executed operation's before/after previews or originating error. `errors` identifies recipe, operation when available, stable code, and explanation. `status: ready` with `rowCount: 0` is a valid empty result. A failed computation has an error and no current table for that output. Required data-quality failures are diagnostics and can coexist with computed results.

Resolved charts include the authored composition, a generated Vega-Lite specification, exact statistical tables, omitted-record counts, and explanatory notes. This exposes analytical intent without screenshot comparison.

## Teaching metadata in project v2

Columns can carry `timeBasis` and `timeZone`; their values remain timestamp clock fields. New operation kinds are `datetime`, `rank`, `topk`, `rename_many`, and `categories`, each operation version 1. Charts add grouped bars, line styling, layer opacity, and errorbar/errorband marks with explicit uncertainty parameters. Opaque named colors canonicalize to hex on save. Optional `submission` stores `{enabled, required: [{kind: "recipe" | "chart", name}]}`. Execution results optionally include `submission` completeness findings without changing API/result version 1. See [teaching semantics](TEACHING.md).

# Mapping geographic data

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Open the **Places, points & regions** example to explore a point map and a country choropleth. The default maps run locally with bundled boundaries. An optional OpenStreetMap street basemap adds online roads, buildings, and place labels without an API key.

## Editable map examples

Open **Explore an example** (or click the Data Canvas logo) and choose:

- **Bikes around the harbor** — eight fictional stations near Seattle, mapped over online OpenStreetMap tiles. Point color shows availability as a percentage; size shows station capacity. A derived percentage and a filter identify the three stations at or below 25%. A bar chart and guided report let you compare stations without geography. Station locations/counts are synthetic, not real-time or official bike-service data. The card discloses online tile requests before opening; switch Basemap to Built-in boundaries for local-only rendering.
- **Tree cover: totals vs. percentages** — six fictional districts with embedded schematic GeoJSON. Compare canopy hectares with coverage percentages: North has the largest total (20 ha), while Northeast has the largest percentage (60%). Southeast's missing observation stays gray. Supplied surveyed areas are illustrative denominators, not areas calculated from the polygons. Both maps work without online tiles.
- **Places, points & regions** — the smaller introductory example of coordinate validity, country-key matching, and contributing records.

The two guided examples open directly to their first map. Open **Report** for questions to explore or select a recipe to edit the calculation. Each is also available as a portable project: [bikes](../public/examples/bikes.datacanvas), [tree cover](../public/examples/trees.datacanvas). Regenerate only these bundles with `npx tsx scripts/examples.ts bikes trees`; omit the names to regenerate every public example.

## Points from a table

1. Import a table, build a recipe, and choose **Visualize table**.
2. Set **Chart family → Point map**. Choose numeric longitude and latitude columns; common coordinate names are selected automatically.
3. Optionally map color, size, shape, and tooltip fields. Size values must be nonnegative.
4. Choose Equal Earth (equal area), Mercator, or Equirectangular. Use **Fit mapped data**, zoom, center coordinates, or **Reset map view**. A latitude/longitude grid is optional.

Coordinates must be WGS84 degrees, with longitude in ±180 and latitude in ±90. Mercator excludes point latitudes beyond ±85.05112878. Missing or invalid coordinates and missing/negative mapped sizes are omitted, with counts shown in the chart notes. Parse text coordinates into numeric columns first. Display is limited to 20,000 points per layer; larger inputs produce an error rather than being sampled.

Click a point to inspect its contributing source records. **Create filter from selection** preserves a coordinate/category predicate in a new recipe. Points sharing coordinates can overlap; zoom or filter the input to inspect them.

## Optional street basemap

In **Map view & boundaries**, choose **Basemap → Street map — OpenStreetMap (online)**. The projection changes to Web Mercator. Boundary source remains independent: you can still join your data to bundled countries or custom GeoJSON while drawing it over streets. **Overlay opacity** reveals the background underneath your points or regions.

Drag to pan and release to save the view. Scroll over the map to zoom; wheel gestures are batched before requesting the next view. Focus the map and use arrow keys to pan or `+`/`−` to zoom. The numeric controls, Fit mapped data, and Reset map view remain available. View changes participate in undo/redo and portable project saving. Street zoom supports tiles through level 19; tile level is derived from the saved map scale, so the numeric zoom value is not the tile level.

Only tiles intersecting the visible chart viewport are requested from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. The browser honors normal HTTP caching; the app does not prefetch regions, maintain an offline tile archive, or bundle tiles in `.datacanvas` projects. OpenStreetMap receives the viewed tile locations, IP address, and normal browser request metadata. Your table is not uploaded. Loading a saved street-map chart or report resumes those online requests. Selecting **Built-in boundaries (offline)** stops street requests and retains the current projection (within the built-in zoom range); choose Equal Earth manually if desired.

The interactive map includes a linked OpenStreetMap attribution and the figure includes attribution in its subtitle. SVG and HTML report exports embed the loaded tile pixels; PNG exports capture them as well. These are static attributed figures, not downloadable tile archives. If tiles fail to load, the data overlay remains visible with an explanation, and exports report an error instead of silently producing an incomplete map. Switch to built-in boundaries or retry. Exporting a report can load tiles for its street-map figures. Editable specifications and headless results retain tile URLs/settings; the headless analysis itself does not download imagery.

Service availability and detail depend on OpenStreetMap. Follow its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and [attribution requirements](https://www.openstreetmap.org/copyright). Additional providers, satellite/terrain styles, API-key configuration, and PMTiles imports are not included in this first version.

## Regions shaded by values

Choose **Chart family → Choropleth map**, a **Region key column**, and a numeric **Map value**. Select an explicit statistical transformation: sum, mean, median, minimum, maximum, or count. Count uses all matched records and needs no value column. Explicit values without aggregation require at most one record per matched region; duplicates produce an error.

The bundled world boundaries support country `name` or **Feature ID** (`$id`, numeric country codes). Text joins are exact and case-sensitive, including whitespace. Names follow the bundled dataset; inspect unmatched examples in the notes and clean names in a recipe as needed. Numeric columns match numerically: integer `1` matches boundary ID `001`; text `"1"` does not match `"001"`. Boundary keys must be unique after conversion. Integer joins reject fractional boundary IDs.

The **Statistical tables** tab exposes complete region aggregates, matched record counts, valid value counts, and lineage. Numeric aggregates ignore missing values. Regions with all-missing values remain gray. Unmatched regions are gray on the built-in map and unshaded over street tiles; unmatched/missing source keys are counted and example keys are listed. Click a matched region to inspect contributors. Counts describe layer records: a record used in two layers participates in each layer separately.

Choose the Blues, Viridis, or Red–Blue palette. Add point and choropleth layers to the same map to combine locations and areas; all layers share boundaries, projection, and view settings.

## Your own boundaries

Set **Boundary source → Imported GeoJSON**, select a local file, choose the boundary join property, and enter its attribution/source. **Feature ID** uses each feature's `id`; other choices use scalar properties. Use **Fit mapped data** to frame matched regions or plotted points. Empty or entirely unmatched data has nothing to fit.

Supported files are WGS84 GeoJSON `FeatureCollection` objects containing `Polygon` or `MultiPolygon` geometries. Limits are **5 MiB**, **5,000 features**, and **200,000 coordinate positions**. Coordinates are `[longitude, latitude]`; altitude is discarded. Rings must be closed and have at least three distinct vertices. Ring winding is normalized for spherical rendering, including holes and antimeridian crossings. Nested property objects/arrays are omitted; text, numeric, Boolean, and null properties are retained. Files with legacy CRS declarations are rejected: reproject to WGS84 before removing the declaration and importing.

Validation does not repair self-intersections or invalid topology. Polygons intended to cover more than a hemisphere are unsupported because normalization selects the smaller exterior. Simplify large files or repair geometries in a GIS before import. If multiple features share a region key, combine their geometry into a MultiPolygon or select a unique join property.

Imported boundaries are embedded in the chart's saved project settings. Portable projects retain them, along with projection, center, zoom, join key, palette, and attribution. SVG/PNG exports, editable chart specifications, report HTML, and the headless runner use the same resolved maps. Geometry is inline; standalone SVG/PNG/HTML figures embed any loaded tile imagery and need no remote boundary or tile URLs. Editable specifications can reference the selected online provider.

## Boundary provenance and limits

The bundled 177 country features come from **Natural Earth 4.1.0, 1:110m**, distributed by **world-atlas 2.0.2**. Natural Earth data is public domain; world-atlas is ISC licensed. The reproducible conversion is `node scripts/world-basemap.mjs`; it drops a degenerate quantized ring while retaining every country feature. The world-atlas license is shipped at `geography/LICENSE-world-atlas.txt`. Generalized boundaries reflect that dataset, are unsuitable for navigation or detailed local analysis, and do not express a position on legal or political status. Use custom boundaries for finer detail.

Built-in map zoom ranges from 0.5 to 2,000; online street maps allow higher zoom for local detail. View settings may clip features; reset returns to the world view. There are no satellite/terrain basemaps, address geocoding, shapefile/TopoJSON imports, spatial joins, distance calculations, map facets, or rectangular map brushing. Cartesian and geographic layers require separate charts. Map statistical extraction into recipes is unavailable; use an explicit Summarize operation when a reusable region summary is needed.

---

Previous: [Layout and styling](LAYOUT.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Reports](REPORTS.md)

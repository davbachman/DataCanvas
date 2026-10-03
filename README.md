# Data Canvas

[Open Data Canvas](https://davbachman.github.io/DataCanvas/)

A local-first visual workbench for cleaning, reshaping, combining, exploring, and visualizing tables. Build named recipes with snapping blocks, inspect every transformation, and preserve an analysis in a portable `.datacanvas` project. No account, backend, telemetry, or data upload is required. Optional online street basemaps request tiles from OpenStreetMap; default maps make no external requests.

## Start exploring

1. Open an editable example or import UTF-8 CSV/TSV or an Excel sheet.
2. Review field types, missing tokens, and what one row represents.
3. Build a recipe with the operation toolbox. Use **Blocks** or the synchronized **Recipe list**.
4. **Run** or **Step**, then inspect Before/After, column profiles, checks, SQL, and contributing records.
5. **Visualize table**, write a report, and **File → Save portable project**.

The six synthetic, CC0 examples cover bike availability on a street map, tree-cover percentages in custom regions, geographic points and countries, messy temperatures, transaction/catalog joins, and unequal group sizes. Built-in maps support projected points, country choropleths, your own GeoJSON boundaries, and optional OpenStreetMap street tiles with pan/zoom. Source files stay in the project. Recovery is automatic in IndexedDB; a downloaded project is a separate backup.

## Chart orientation and sequence blocks

Bar charts, counts, and histograms have an **Orientation** control for vertical or horizontal views. The same values, bins, omissions, and contributing records appear in either orientation. Axis titles, domains, and scale settings follow their authored fields: X is the category/bin axis and Y is the value/count axis, even when horizontal rendering swaps their screen positions.

Open **Chart blocks** in the chart studio to edit **From recipe → Statistics → Draw → Appearance**. Choose counts, bins, or an explicit aggregation in Statistics; select the chart family and fields in Draw; add orientation, field encodings, or pie/donut percentage labels afterward. Counts and bins require only the first field. Connected layer blocks draw from back to front and can be reordered, duplicated, or deleted. Appearance blocks set named properties, so their order within a layer does not change the result. Facets also have a chart block; scales, map boundaries, captions, and other advanced settings remain in the synchronized controls.

Blocks and controls edit one chart definition. Disconnected, duplicate, or incompatible blocks display an explanation and leave the last complete chart intact; **Reset blocks to saved chart** discards that incomplete block arrangement. Use the app’s Undo/Redo for committed edits. Completed chart semantics survive portable projects, reports, image exports, and browser/headless execution; temporary block positions are not saved.

## Layout, styling, subplots, and stacking

Open **Layout & styling** for chart themes, background, fonts, categorical and continuous palettes, legend placement, axes, grid lines, label angles, drawing-area dimensions, and padding. These settings also have **Layout**, **Theme & colors**, **Typography**, **Legend**, **Axes & grids**, and **Facets** blocks, available under **Add layout & style blocks**. Blocks and controls stay synchronized.

Use **Layer arrangement → Overlay** to draw layers together, or **Subplots** to give each Cartesian layer its own panel. Set a label on each layer, choose the grid’s column count and spacing, and choose shared or independent X/Y scales. Panels share the chart’s input recipe but can use different fields, statistics, and chart families. Subplot grids currently support Cartesian charts; maps and pies can be separate charts in a report. Facets support row/column grouping, spacing, independent scales, and wrapping a single column facet into a chosen number of columns.

For bars, counts, and histograms, **Bar stacking** offers automatic, unstacked overlay, stacked, percentage-stacked, and centered modes. A color field defines stacked groups. Stacking works in both orientations and requires a linear value axis. Percentage stacking normalizes within each category/bin; tooltips and statistical tables retain the original values and exact contributors. A **Stack** appearance block exposes the same setting.

Styles apply to the plot, reports, SVG/PNG exports, portable projects, and the headless runner. Width and height describe each drawing area or facet cell; exported dimensions also include labels, titles, legends, and padding. Font choices use system fonts without external downloads. This adds common figure controls, not arbitrary Matplotlib/Python styling or statistical models.

## Pie and donut charts

In the chart studio, choose **Pie** or **Donut**, select a **Category**, then choose explicit numeric values, **count**, or **sum** under **Visible statistical transformation**. Explicit values require one record per category; count needs no value column. Click a slice to inspect its source records or create a category filter. Percentages, values, and record counts are also available in tooltips and **Statistical tables**. Percentage labels can be switched off.

Slices require nonnegative finite values and a positive total. Missing categories or values are omitted with a visible count; zero-value categories remain in the table. Labels below 3% are omitted to reduce overlap, with percentages still available in tooltips. Each pie or donut supports one layer, no facets, and at most 50 categories; use a bar chart or explicitly group categories for larger comparisons. Charts work in reports, SVG/PNG exports, saved projects, and the headless runner.

## Export R or Python analysis code

After **Run all outputs**, use **File → Export R / tidyverse + source assets** or **Export Python / pandas + source assets**. Each ZIP contains a runnable script, dependency setup, the complete typed source data, original source files, project metadata, and a README. Running the script recreates all recipes in dependency order, exposes their results as pandas DataFrames or R tibbles, and writes CSV files to `results/`.

These exports require **DuckDB 1.5.4**. Compatible operations use pandas directly or dplyr/dbplyr on DuckDB; other steps retain the compiled DuckDB SQL to preserve RE2 patterns, missing-value rules, sampling, joins, reshaping, and statistics. Each step identifies its backend, with a complete list in `coverage.json`. This is not a DuckDB-free translation. Stable column IDs keep references intact; `outputs.json` maps them to display names and types.

Exports reproduce the saved inputs and schema. Re-export after changing sources or dynamic pivot categories. Saved check findings are included; compiler-time checks and guards are not rerun after manual script edits. Chart/report layouts and SQL-workspace queries remain in the project metadata but are not translated into plotting or query code. Stale, partial, and failed recipe runs cannot be exported.

## Development

Requires Node.js 24 and npm. Dependencies and compatible DuckDB engine versions are pinned in the lockfile.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Production builds use relative asset paths, including the bundled Wasm and nested worker. For a GitHub Pages-like `/DataCanvas/` test server:

```sh
node scripts/serve.mjs
# In another terminal, with Chromium installed:
npm run test:browser
```

Browser tests use `/usr/bin/chromium` when present, `CHROMIUM_PATH` when supplied, or Playwright's installed Chromium. On a fresh machine run `npx playwright install --with-deps chromium`. CI also installs Firefox and WebKit and runs all three engines with `CROSS_BROWSER=1 npm run test:browser`.

`npm run test:code-export` executes the generated Python and R scripts for all six examples and an edge-case fixture, comparing every output table with the engine (including integer precision and missing values). Install the runtimes using `scripts/code-export-environment.yml` with Conda, or provide equivalent runtimes through `PYTHON` and `RSCRIPT`. This runs as a separate required deployment job.

## Headless analysis

The Linux runner uses the same canonical model, SQL compiler, and operation semantics as the browser. It recomputes from source and does not trust saved results.

```sh
npm run --silent runner -- validate public/examples/temperatures.datacanvas
npm run --silent runner -- inspect public/examples/temperatures.datacanvas
npm run --silent runner -- run public/examples/temperatures.datacanvas \
  --outputs regional,regional_chart --out /tmp/data-canvas-results
```

See the [integration guide](docs/INTEGRATION.md) for the versioned API, typed result format, caller-controlled source replacement, and resource limits. This is an analysis runner: there are no assignment, grading, account, or collaboration components.

## Guides

- [User guide](docs/QUICKSTART.md)
- [Regular expressions for filtering and text transformations](docs/REGEX.md)
- [Mapping points, countries, and custom GeoJSON regions](docs/MAPPING.md)
- [Project and result formats](docs/FORMATS.md)
- [Headless and browser integration](docs/INTEGRATION.md)
- [Architecture and extension points](docs/ARCHITECTURE.md)
- [Semantics](docs/SEMANTICS.md)
- [Verification, performance, and known limitations](docs/VERIFICATION.md)
- [Third-party acknowledgments](docs/THIRD_PARTY.md)
- [Original build specification](docs/BUILD-SPECIFICATION.txt)

## Deployment

`.github/workflows/pages.yml` tests, builds, runs browser journeys and semantic-parity fixtures, uploads `dist`, and deploys to GitHub Pages on pushes to `main`. The repository's Pages source must be GitHub Actions. The application works without cross-origin isolation using DuckDB's single-thread MVP Wasm build.

## License

[MIT](LICENSE). Public example data is CC0. See [third-party notices](docs/THIRD_PARTY.md) for libraries and design precedents.

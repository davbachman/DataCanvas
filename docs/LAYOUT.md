# Layout, styling, subplots, and stacking

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Open **Layout & styling** in the chart inspector. The same settings are available as [chart blocks](CHART-BLOCKS.md). They persist in portable projects and apply to the plot, reports, SVG/PNG exports, and headless chart specifications.

## Overlay layers

1. Create the first Cartesian chart layer, then click **Add layer**.
2. Configure the additional layer. For example, add a `rule` and set **Reference value** to show a target across a bar chart.
3. Keep **Layer arrangement → overlay**.
4. Set meaningful layer labels and field encodings. Reorder layers in Chart blocks to control which draws on top.
5. Choose shared or independent **Layer / panel X scales** and **Y scales** where needed. Use shared scales for directly comparable measurements and label differing units clearly.

All layers use the chart's input recipe. To combine observations from separate sources, join or append them in a recipe first. Geographic and Cartesian layers cannot be combined in one chart; map layers share their boundaries, projection, and view.

## Create a subplot grid

1. Add and configure one layer for each panel. Layers can use different fields, statistics, and Cartesian chart families from the same input recipe.
2. Set **Layer / panel label** for each panel title.
3. Set **Layout & styling → Layer arrangement → subplots**.
4. Choose **Subplot columns** (1–4), **Subplot spacing**, and plot/panel width and height.
5. Choose shared or independent X/Y scales. Shared axes help comparisons; independent axes can suit fields with different ranges.

For example, two histogram layers can show distributions of two numeric fields side by side, each with its own bin width. A rule becomes its own panel in subplot mode; use overlay mode to draw it over another layer. The current layout is a grid with one layer per panel, not an arbitrary nested arrangement of overlays inside panels.

Subplots support Cartesian charts. Put maps and pies in separate charts and combine them in a report. Clicking marks still exposes contributors; range brushing is not enabled for subplot grids.

## Facet by data values

Use facets when the same visual design should repeat for subsets of one table:

1. Under **Facets & scales**, choose **Facet rows**, **Facet columns**, or both.
2. Under **Layout & styling → Facets**, set spacing and shared/independent facet scales.
3. For a single column facet, choose **Wrap facet columns** (1–8) to spread categories across a grid. With row and column facets, the selected values define the two-dimensional grid.
4. Adjust panel size and examine small groups and missing-category groups in the statistics.

Facets divide by field values; subplots divide by authored layers. Maps and pies do not support faceting.

## Stack bars, counts, and histograms

Choose a **Color field** to identify the groups, then set **Bar stacking**:

| Setting | Effect |
| --- | --- |
| **Auto** | Use the chart renderer's automatic stacking behavior |
| **Overlay (no stacking)** | Draw values without stacking; bars can overlap |
| **Stacked** | Stack groups from a zero baseline |
| **Percentage stacked** | Normalize the stack within each category/bin |
| **Centered stack** | Center the stack around its midpoint |

For a 100% category composition chart, use `count`, select the category and a color grouping field, then choose **Percentage stacked**. Change **Orientation** if a horizontal comparison reads better. Statistical tables and tooltips retain original counts/values and exact contributors; percentage stacking changes their displayed heights/lengths.

Explicit stacking needs a color grouping field and a linear value axis. Turn off the corresponding logarithmic scale before stacking. Unstacked overlay does not create grouped, side-by-side bars; there is no dedicated grouped-bar offset control.

## Style reference

| Controls | Options and interpretation |
| --- | --- |
| Plot / panel width and height | Width 160–1600 and height 120–1200; dimensions describe each drawing area/facet cell |
| Outer padding and spacing | Padding and panel/facet spacing from 0–100 |
| Chart theme | Auto, canvas, whitegrid, minimal, or dark |
| Chart background | Automatic, a color, or transparent |
| Categorical palette | Auto, tableau10, category10, dark2, set2, accent |
| Continuous palette | Auto, viridis, blues, magma, redblue, turbo |
| Chart font | System sans-serif, serif, or monospace; no font downloads |
| Label/title font sizes | Labels 8–28; titles 10–40 |
| Legend | Right, left, top, bottom, none, or automatic; 1–8 columns |
| Axes and grids | Show/hide axes; automatic/show/hide grid lines |
| Label angles | Physical horizontal/vertical axis angles from −90° to 90° |

Exported figure dimensions also include titles, axis labels, legends, and padding. Wider legends or more panels can therefore produce an image larger than a single specified panel. Use the style reset control to restore automatic defaults.

Axis titles, numeric domains, log scales, and the zero baseline live under **Facets & scales**. Map-specific projections, boundaries, and color schemes live in the map controls. See [Charts](CHARTS.md) for orientation and scale semantics.

These controls cover common figure layouts; the app does not execute arbitrary matplotlib/seaborn code or provide their full statistical-model and styling APIs.

---

Previous: [Chart sequence blocks](CHART-BLOCKS.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Maps and basemaps](MAPPING.md)

## Teaching visualization options

[Teaching workflows](TEACHING.md#categories-grouped-bars-and-accessible-line-styling) covers explicit category ordering and numeric categories, grouped side-by-side bars, named CSS colors with swatches, layer opacity, group-based dashes and point markers, and summary error bars/bands. **LINE STYLE**, **UNCERTAINTY**, and **BAR STACKING** blocks share the same chart settings as their inspector controls. Uncertainty tables expose valid/missing counts and the exact statistical method.

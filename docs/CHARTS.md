# Charts and statistical transformations

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Create a chart

1. Run a recipe and choose **Visualize table**.
2. Set **Chart name** and confirm **Input recipe**.
3. Choose **Chart family** for the first layer and its fields. Set **Visible statistical transformation** where offered; aggregation is an explicit choice.
4. Inspect **Plot** and **Statistical tables**, then add units, a caption, and any limitations.
5. Use **Chart blocks** for the sequence editor, or the synchronized controls. See [chart blocks](CHART-BLOCKS.md) and [layout and styling](LAYOUT.md).

Charts compute statistics from the complete recipe output, not the preview. A chart that exceeds a display limit reports the problem; add a deliberate sample or summary to the recipe rather than assuming an automatic sample.

## Choose a chart family

| Family | Fields and interpretation |
| --- | --- |
| `scatter` | X and Y values; optional color, size, shape, detail, and tooltip fields |
| `line` | X and Y, ordered by X within color/detail groups; missing Y breaks a line |
| `bar` | Category and value; explicit values or a selected count/sum/mean/median/min/max transformation |
| `count` | A category field; counts records in each group |
| `histogram` | A numeric binned field and positive bin width; counts records in each interval |
| `box` | Grouping/X and numeric Y; quartiles, median, and whiskers |
| `heatmap` | X/Y fields and a color field as appropriate, with an explicit statistical transformation when needed |
| `rule` | A constant reference value; useful as an additional Cartesian layer |
| **Pie**, **Donut** | Category and explicit slice values, count, or sum |
| **Point map** | Numeric longitude and latitude, with optional field encodings |
| **Choropleth map** | Region key matched to boundaries and an explicit value or statistic |

For a mean-by-category bar chart, choose `bar`, category and numeric value fields, then `mean` under **Visible statistical transformation**. For already summarized values, choose **Explicit values (no aggregation)**. A count chart counts rows of its input recipe: if that recipe already contains one row per group, you are counting those summary rows.

Histogram intervals are `[start, end)`, anchored at zero. Width 5 gives bins such as `[0,5)` and `[5,10)`. Box plots use linearly interpolated quartiles; whiskers extend to observed values within 1.5 interquartile ranges. Inspect the statistical table and contributors to understand outliers and omitted values.

## Encodings, scales, and orientation

Use **Color field** and **More encodings** for tooltip fields, size, shape, and detail where supported. Constant color/mark size apply when the relevant property is unmapped. Line detail distinguishes separate paths.

Under **Facets & scales**, set axis titles/units, numeric domains (`min,max`), logarithmic scales, and the zero baseline. Log scales omit nonpositive values and report omissions; missing coordinates cannot be positioned. Review visible notes when the number of displayed marks differs from the input count.

For bars, counts, and histograms, set **Orientation → Horizontal** or **Vertical**. This changes presentation without changing bins, statistics, or contributors. Authored X still means category/bin and authored Y means value/count: titles, domains, and log settings follow those fields when their screen positions swap. Label-angle controls refer to the physical horizontal/vertical axes.

## Pie and donut charts

1. Choose **Pie** or **Donut** and a **Category**.
2. Choose **Explicit values**, `count`, or `sum` under **Visible statistical transformation**. Count needs no value field; the other choices use **Slice value**.
3. For explicit values, supply one record per category. For repeated categories, use count/sum or summarize upstream.
4. Use **Show percentage labels** to toggle labels. Hover for values and percentages; inspect **Statistical tables** for the underlying numbers.

Values must be finite and nonnegative, with a positive total. Missing categories or values are omitted with a visible count. Zero-value categories remain in the statistical table. Labels below 3% are omitted to reduce overlap; their percentages remain in tooltips. A pie/donut supports one layer, no facets, and at most 50 categories. For more categories, explicitly group them or use bars.

## Trace a chart back to data

Click a mark, slice, point, or matched region to inspect contributing source records. A single-layer scatter/line plot also supports brushing a range. **Create filter from selection** creates a separate recipe with an explicit category/range predicate; it does not silently change the chart input. Brushing is unavailable for subplot grids and maps.

**Extract transformation as recipe** is available for supported Cartesian transformations. Use this when the chart's statistical table should become a reusable named table. For maps and pies, create the equivalent summary explicitly in a recipe.

## Export a figure

From **Plot**, use **SVG**, **PNG**, or **Editable spec**. **Specification** displays the resolved chart specification for inspection; the downloadable editable spec preserves the authored chart definition. Save the portable project as well to retain source data and the full analysis.

Styling, facets, and layer layouts carry into image/report exports. For online maps, tile requests must succeed to embed imagery; see [mapping exports and basemaps](MAPPING.md). Use [Reports](REPORTS.md) to combine multiple figures with explanations.

---

Previous: [Regular expressions](REGEX.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Chart sequence blocks](CHART-BLOCKS.md)

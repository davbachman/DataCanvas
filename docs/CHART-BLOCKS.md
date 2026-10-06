# Chart sequence blocks

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Open a chart and select **Chart blocks**. Blocks and the chart inspector edit one saved chart definition. You can switch between them at any time.

## Read the sequence

The sequence is **From recipe → Statistics → Draw → Appearance**:

1. **From recipe** chooses the shared input table.
2. Each layer specifies its **Statistics**: raw/explicit values, counts, bins, or an aggregate.
3. **Draw** chooses the chart family and fields. Counts and bins need the first field; other statistics use the value field. Maps use longitude/latitude or region/value fields.
4. Appearance blocks add orientation, stacking, field encodings, or pie percentage labels.
5. Layout/style blocks apply to the entire chart.

Unlike recipe operations, appearance blocks set named properties: rearranging different appearance properties within one layer does not change the result. Layer order does matter for overlays; layers draw from back to front. Statistics and drawing must be compatible, such as binning with a histogram.

## Build a horizontal histogram

1. Run a recipe with a numeric field and choose **Visualize table**.
2. Open **Chart blocks** and choose the input recipe in the root.
3. Set the layer's Statistics to bins and choose a positive width, for example `5`.
4. Set Draw to histogram and select the numeric field as its first field.
5. Use **Add orientation block**, connect it to the layer's appearance sequence, and choose horizontal.
6. Return to **Plot** and **Statistical tables**. The bars are horizontal; the bin boundaries and counts are unchanged.

You can also configure a histogram with the ordinary controls first, then open Chart blocks to see its equivalent sequence.

## Add layers and shared styles

Use **Add layer block** for another layer. Use a block's context menu to duplicate or delete layers and appearance blocks, and reconnect layers to change drawing order.

Expand **Add layout & style blocks** to add **Layout**, **Theme & colors**, **Typography**, **Legend**, **Axes & grids**, or **Facets**. These expose the same options as **Layout & styling**. The Layout block can select subplots so each Cartesian layer has a separate panel. A Stack appearance block controls bar/count/histogram stacking.

Scales, map boundaries, captions, and other advanced settings remain available in the synchronized inspector. See [layout recipes and settings](LAYOUT.md) for overlays, facets, subplot grids, and percentage stacks.

## Recover an incomplete arrangement

Disconnected, duplicate, or incompatible blocks display an explanation and leave the last complete chart intact. Finish the connections or correct the setting before expecting the plot to update. **Reset blocks to saved chart** discards the incomplete arrangement and rebuilds from the last valid definition.

Use the app's Undo/Redo for committed chart changes. Completed chart semantics persist in portable projects, reports, image exports, and headless execution; temporary workspace positions are not saved.

---

Previous: [Charts](CHARTS.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Layout and styling](LAYOUT.md)

## Teaching visualization options

[Teaching workflows](TEACHING.md#categories-grouped-bars-and-accessible-line-styling) covers explicit category ordering and numeric categories, grouped side-by-side bars, named CSS colors with swatches, layer opacity, group-based dashes and point markers, and summary error bars/bands. **LINE STYLE**, **UNCERTAINTY**, and **BAR STACKING** blocks share the same chart settings as their inspector controls. Uncertainty tables expose valid/missing counts and the exact statistical method.

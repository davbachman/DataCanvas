# Reports and sharing findings

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Reports combine written notes with linked charts and recipe tables. They preserve your explanation alongside the analysis that supports it.

## Compose a report

1. Give the project a useful title and run all supporting recipes.
2. Open **Report** and add **Written note**, **Linked chart**, or **Linked table** items.
3. For a chart/table item, choose the source in **Linked chart** or **Linked table**, then write a caption explaining the measurement, units, and limitations.
4. For a written note, choose **Linked evidence** to associate the claim with a recipe or chart. Write the claim yourself; the app does not infer a conclusion from a chart.
5. Use the up/down controls to reorder items and the delete control to remove an item.

Linked figures follow their chart definitions, including styles, subplots, and facets. Report tables are previews of up to 100 rows. Use a separate [CSV export](EXPORTS.md#export-tables-and-sql) when sharing a complete table.

## Review claims after changes

Linked text can display **Supporting data changed. Review this claim.** after a project revision. Read the current table or chart, revise the prose if needed, then choose **Mark reviewed**. The indicator records review status; it does not verify the truth of a claim.

Before sharing, run all outputs, inspect required checks and chart omission notes, and review each linked claim. A missing chart or table result prevents report export until its supporting computation is available.

## Export HTML or print to PDF

Choose **Export HTML** to download a self-contained report with embedded figures, captions, source attributions/fingerprints, and operation summaries. Open it in a browser; use the browser's Print command and Save as PDF for a PDF copy. Tables remain explicitly labeled previews in the exported report.

For an online basemap, creating the export can request visible tiles. Successful exports embed the imagery; a failed tile request is reported instead of silently omitting the basemap. See [mapping](MAPPING.md) for attribution and provider behavior.

The HTML is a presentation document. Also share a `.datacanvas` project when someone should inspect or edit the analysis. Source data travels inside that project, so choose the appropriate sharing format for the intended audience.

---

Previous: [Maps and basemaps](MAPPING.md) · [Guide contents](../README.md#instructions-for-use) · Next: [SQL workspace](SQL.md)

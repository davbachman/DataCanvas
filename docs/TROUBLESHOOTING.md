# Troubleshooting, limits, and keyboard access

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Common problems

| Symptom | What to check |
| --- | --- |
| A recipe will not run | Complete draft settings, select missing fields, and inspect the earliest failed upstream operation. Dependencies helps locate it. |
| A referenced column disappeared | Restore the step that created it or select the intended replacement. Renaming alone preserves identity; deleting/recreating does not. |
| Filtering removes missing rows | Filters keep true only. Add an explicit `is_missing` branch if those rows should remain. |
| Parsing creates missing values | Check source text, target type, decimal separator, and explicit date format. Review failed-conversion examples. |
| A join produces too many rows | Inspect duplicate keys on both inputs. Relationship expectations do not remove duplicates. Review projected counts before changing the row guard. |
| A pivot wider fails | Identifier/category cells are duplicated. Choose an appropriate aggregation or correct the inputs. |
| A chart shows fewer records | Read omission notes for missing fields, nonpositive log values, invalid coordinates, or unsupported values. Statistical tables explain the transformation. |
| A chart hits a display limit | Add an explicit summary, filter, or seeded sample upstream. The app does not silently truncate the plot. |
| Chart blocks do not update the plot | Resolve disconnected, duplicate, or incompatible blocks, or use **Reset blocks to saved chart**. |
| Stacking fails | Choose a color grouping field and a linear value axis. |
| A region is unshaded | Check exact key values/types, boundary keys, and missing/all-missing values in the map notes. |
| Street tiles or a map export fail | Check network access and provider availability, retry, or choose offline boundaries. No street-tile archive is included in the project. |
| R/Python export reports stale results | Run all outputs at the current revision. Resolve incomplete or failed recipes first. |
| Browser recovery is unavailable | Open a downloaded `.datacanvas` backup; recovery depends on this browser's local storage. |

For the exact data rules, see [Semantics](SEMANTICS.md); for measured checks and platform limitations, see [Verification](VERIFICATION.md).

## Practical limits

Table previews show up to 100 rows, while statistics and complete-table exports use all rows. Raw plots are capped at 20,000 marks and aggregate plots at 10,000 groups. Pies/donuts have a separate 50-category limit. Large data should be explicitly filtered, aggregated, or sampled before plotting.

Portable archives are limited to 64 MiB compressed and 256 MiB declared decompressed data. Custom GeoJSON supports Polygon/MultiPolygon feature collections up to 5 MiB, 5,000 features, and 200,000 coordinate positions; see [Mapping](MAPPING.md) for geometry requirements. Browser memory and processing capacity can become limiting before an archive limit is reached.

Maps do not provide geocoding, shapefile import, spatial joins, distance analysis, or arbitrary tile providers. Layout controls cover common overlays, subplots, facets, and stacks, not the full APIs of matplotlib or seaborn. The app has no built-in statistical modeling workflow.

## Keyboard and accessibility

| Action | Control |
| --- | --- |
| Navigate and activate controls | Tab, then Enter/Space as appropriate |
| Save portable project | Ctrl/⌘ S |
| Undo | Ctrl/⌘ Z outside text fields |
| Redo | Shift-Ctrl/⌘ Z outside text fields |
| Run | Ctrl/⌘ Enter |
| Author without dragging | Recipe list: insert, move, configure, and delete controls |
| Resize the table drawer | Focus its resize handle and use arrow keys, or maximize it |
| Navigate a focused map | Arrow keys to pan; plus/minus to zoom |

Use the app's theme button for the workspace appearance. Chart themes are separately configured in **Layout & styling** and persist with figures.

## Local data and network access

Table processing runs locally in the browser with DuckDB Wasm. There is no account, analytics telemetry, or backend data-upload service. Loading the hosted application itself requires access to GitHub Pages; default bundled map boundaries do not request external imagery.

Optional OpenStreetMap basemaps request visible tiles from the provider. Those requests reveal the viewed area, IP address, and usual request metadata, but do not upload the source table. Reopening a saved online-map chart or report view can resume requests. Select offline boundaries when online imagery is not wanted. Downloaded projects include their source data, and reports/exports include the selected results.

---

Previous: [Saving and exports](EXPORTS.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Development and integration](DEVELOPMENT.md)

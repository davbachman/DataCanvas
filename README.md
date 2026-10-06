Created by David Bachman with Codex

# Data Canvas

[Open the app](https://davbachman.github.io/DataCanvas/)

To learn more about David see https://pzacad.pitzer.edu/~dbachman/, and subscribe to his AI blog *Entropy Bonus* at https://profbachman.substack.com/.

## Brief description

Data Canvas is a browser-based visual workbench for cleaning, reshaping, combining, exploring, and visualizing tables. Build reproducible recipes with blocks, inspect each transformation and its source records, create charts and maps, and assemble reports. Save an editable project or export tables, figures, SQL, R/tidyverse, and Python/pandas analysis code. Data processing stays in your browser; no account or data upload is required. Optional online street basemaps request tiles from OpenStreetMap.

## Instructions for use

Start with [Getting started](docs/QUICKSTART.md) for a guided example, or use the navigation table to find a task. Each guide page links back here and to the adjacent chapters.

| Guide page | What you will learn |
| --- | --- |
| [Getting started](docs/QUICKSTART.md) | A guided first analysis, workspace tour, and six examples |
| [Importing data and datetime values](docs/IMPORTING.md) | Files, missing tokens, types, metadata, and source replacement |
| [Recipes and expressions](docs/RECIPES.md) | Blocks, Recipe list, execution, inspection, lineage, and dependencies |
| [Teaching workflows](docs/TEACHING.md) | Datetime blocks, ranking, bulk renaming, categories, uncertainty, code explanations, and submission checks |
| [Operation reference](docs/OPERATIONS.md) | Every cleaning, selection, derivation, reshape, combine, summary, and check operation |
| [Regular expressions](docs/REGEX.md) | Filter/transform text and select columns by name patterns |
| [Charts](docs/CHARTS.md) | Chart families, statistics, horizontal views, pies/donuts, selections, and image exports |
| [Chart sequence blocks](docs/CHART-BLOCKS.md) | From recipe through statistics, drawing, and appearance |
| [Layout and styling](docs/LAYOUT.md) | Overlays, subplot grids, facets, stacking, fonts, palettes, axes, and legends |
| [Maps and basemaps](docs/MAPPING.md) | Points, choropleths, GeoJSON, online street tiles, and geographic examples |
| [Reports](docs/REPORTS.md) | Linked figures/tables, written claims, review, HTML, and PDF |
| [SQL workspace](docs/SQL.md) | Table bindings, read-only queries, and comparisons with recipes |
| [Saving and exports](docs/EXPORTS.md) | Backups, recovery, CSV, SQL, R/tidyverse, and Python/pandas |
| [Troubleshooting and shortcuts](docs/TROUBLESHOOTING.md) | Common errors, practical limits, keyboard access, and privacy |
| [Development and integration](docs/DEVELOPMENT.md) | Local setup, testing, headless analysis, deployment, and technical references |

For a first visit, open **File → Example projects**. For your own data, choose **File → Import data**, review the types and missing values, then **Build a recipe**. Run and inspect the result, choose **Visualize table**, and use **File → Save portable project** to download an editable backup.

### Technical references

| Reference | Contents |
| --- | --- |
| [Semantics](docs/SEMANTICS.md) | Exact data and transformation rules |
| [Project and result formats](docs/FORMATS.md) | Versioned interchange contracts |
| [Headless and browser integration](docs/INTEGRATION.md) | Running analyses outside the editor |
| [Architecture](docs/ARCHITECTURE.md) | Implementation and extension points |
| [Verification](docs/VERIFICATION.md) | Testing, performance, and known limitations |
| [Third-party acknowledgments](docs/THIRD_PARTY.md) | Dependencies and data credits |
| [Original build specification](docs/BUILD-SPECIFICATION.txt) | Historical design specification |

## License

[MIT](LICENSE). Public example data is CC0. See [third-party notices](docs/THIRD_PARTY.md) for libraries and design precedents.

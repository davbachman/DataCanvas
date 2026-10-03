# Getting started

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Data Canvas runs in your browser. You do not need an account or a local installation. A **source** holds an imported file; a **recipe** turns a source or another recipe into a named table; a **chart** visualizes a recipe; a **report** brings evidence and written explanations together.

## Try an example

1. [Open the app](https://davbachman.github.io/DataCanvas/), then choose **File → Example projects** or the Data Canvas logo.
2. Open **Messy temperatures**. Select **Clean monthly readings** in the Project Library.
3. Choose **Run all outputs** (the circular-arrow button beside Run). Select operations in **Recipe list** to inspect their settings and the **Before** and **After** tables.
4. Select **Regional temperatures**. Compare the mean, valid-reading count, and missing-reading count. Open **Checks** to see issues that a mean alone would conceal.
5. Open a chart from the library and examine **Statistical tables**. Click a plotted mark to inspect contributing records.
6. Open **Report** to read the analysis, then choose **File → Save portable project** to keep an editable copy.

All six examples use synthetic, CC0 observations. They are teaching datasets, not current measurements.

| Example | What to explore |
| --- | --- |
| Messy temperatures | Parsing, missing values, reshaping, regional summaries, and metadata keys |
| Transactions & products | Derived amounts, duplicate join keys, row multiplication, and unmatched products |
| Unequal group sizes | The difference between observation-weighted and station-weighted means |
| Places, points & regions | Longitude/latitude points and country choropleths with bundled boundaries |
| Bikes around the harbor | Optional online street tiles, point size/color, availability percentages, and a filtered recipe |
| Tree cover: totals vs. percentages | Custom GeoJSON, regional totals, explicit denominators, and missing coverage |

The [mapping guide](MAPPING.md) includes downloadable geographic projects and guided comparisons.

## Start with your own data

1. Choose **File → New project**, edit the project title, then **File → Import data**.
2. Select a CSV, TSV, or XLSX file. Review missing tokens and inferred types before importing; record what one row represents.
3. Select the source and choose **Build a recipe**. Give the recipe a useful name.
4. Click **Filter rows** in the operation toolbox. In **Configure**, build a condition using a column, comparison operator, and literal value. For example, use a binary condition with `amount` on the left, `>` as the operator, and Number `0` on the right.
5. Choose **Run**, select the filter, and compare **Before** and **After**. Check the false and missing-condition counts in **Checks**.
6. Choose **Visualize table**. For a simple category frequency chart, select `count` and choose the category field. For a numeric distribution, select `histogram`, choose the binned field, and set a positive bin width.
7. Save a portable project. Export a chart, table, or report when you need a presentation copy.

## Find your way around

The Project Library selects sources, recipes, and charts. The searchable toolbox adds operations. The main canvas offers synchronized **Blocks** and **Recipe list** editors. The inspector has **Configure**, **Explain**, **Checks**, and **SQL** tabs. The bottom drawer shows tables, profiles, changes, and contributors; drag its divider or maximize it for more room.

Use **Dependencies** to follow relationships, **SQL workspace** to write queries, and **Report** to compose findings. At narrow widths, switch between **Project**, **Canvas**, and **Inspector**. Recipe list supplies insertion, movement, configuration, and deletion controls without dragging.

Table previews normally show up to 100 rows. Counts, profiles, chart statistics, and data exports use complete results. Save a downloaded project even if browser recovery is available.

---

[Guide contents](../README.md#instructions-for-use) · Next: [Importing data and datetime values](IMPORTING.md)

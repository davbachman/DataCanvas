# Saving, recovery, and exports

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Save an editable project

Choose **File → Save portable project** or press Ctrl/⌘ S. The `.datacanvas` file is a ZIP containing the original source assets and the project definition: import settings, recipes, drafts, expressions, notes, charts, reports, saved SQL queries, and metadata. Open it later with **File → Open project…** and run outputs again; saved caches are not trusted as analysis results.

Browser autosave uses IndexedDB. **File → Recover another draft…** opens saved local drafts. New/Open/example actions preserve the previous draft. Recovery belongs to this browser's storage and is separate from a downloaded backup; clearing site data or losing the browser profile can remove it. Download projects regularly and use them to move work between devices.

Use Undo/Redo for canonical editing changes. Text fields retain normal text-editing behavior. See [keyboard shortcuts](TROUBLESHOOTING.md#keyboard-and-accessibility).

## Choose an export

| Need | Export |
| --- | --- |
| Reopen or share the editable analysis | Portable `.datacanvas` project |
| Use a complete table elsewhere | Clean CSV + dictionary |
| Execute recipe logic in DuckDB | SQL + source assets |
| Continue in Python or R | Python / pandas or R / tidyverse + source assets |
| Publish a single figure | SVG, PNG, or editable chart spec from the chart |
| Share prose and figures | Report HTML, optionally printed to PDF |
| Integrate typed results with another application | [Headless/browser API](INTEGRATION.md) |

## Export tables and SQL

Select a source or recipe with a current result, then choose **File → Export clean CSV + dictionary**. This exports the complete table, not just the visible preview, with a separate data dictionary. Hidden lineage is omitted. Missing values are unquoted empty fields; literal blank text is quoted. Categories are not automatically encoded for machine learning. CSV itself does not retain every type distinction; keep the dictionary and project.

After **Run all outputs**, choose **File → Export SQL + source assets** for a ZIP with `analysis.sql` and immutable source assets. Extract the archive and execute `analysis.sql` in DuckDB, for example `duckdb < analysis.sql` with the DuckDB command-line client installed. Source setup is embedded in the SQL; the archive also retains the original assets and `manifest.json`. The generated SQL uses stable physical IDs. Use the matching DuckDB engine version (currently 1.5.4); it is not generic SQL guaranteed to execute unchanged in another database.

## Export Python / pandas

1. Choose **Run all outputs** and wait for the current project revision to finish successfully.
2. Choose **File → Export Python / pandas + source assets**.
3. Extract the ZIP and open a terminal in that folder. With Python 3.10 or later, run:

```sh
python -m pip install -r requirements.txt
python analysis.py
```

The script executes recipes in dependency order, makes their tables available in the `outputs` dictionary keyed by stable recipe ID, and writes CSV files under `results/`. The generated README documents the bundle. Script asset paths resolve relative to the script location.

Compatible steps use pandas directly; other steps execute the original DuckDB SQL. Dependencies include DuckDB 1.5.4, pandas, and NumPy. This export requires DuckDB even when many operations are translated to pandas.

## Export R / tidyverse

1. Run all outputs at the current revision.
2. Choose **File → Export R / tidyverse + source assets** and extract the ZIP.
3. With R 4.1 or later, run from the extracted folder:

```sh
Rscript install.R
Rscript analysis.R
```

For RStudio, set the working directory to the extracted folder and source `analysis.R` after installing dependencies. Results are in the `outputs` list keyed by stable recipe ID, and CSV files are written under `results/`.

Compatible steps use dplyr/dbplyr against DuckDB; remaining steps retain their compiled SQL. The installer pins the DuckDB R package matching engine 1.5.4 and installs dependencies including DBI, dplyr, dbplyr, jsonlite, tibble, and bit64. The export is not a DuckDB-free tidyverse translation.

## Understand the R/Python bundle

| File | Purpose |
| --- | --- |
| `analysis.py` or `analysis.R` | Runnable recipe analysis with each step's backend identified |
| `requirements.txt` or `install.R` | Dependency setup |
| `README.txt` | Bundle-specific execution instructions |
| `sources.json` | Complete, already-typed source snapshots encoded as SQL inserts |
| `original/` | Original uploaded source assets |
| `project.json` | Saved project definition |
| `outputs.json` | Stable IDs, display names, and types for output tables |
| `coverage.json` | Per-step pandas/tidyverse/SQL backend coverage |
| `diagnostics.json` | Check findings and other diagnostics from the exported run |
| `steps/` | Compiled SQL for the operations |

The scripts use complete typed source snapshots, including exact integers and UTC timestamps, rather than reparsing the originals or using 100-row previews. Intermediate references use stable IDs; final tables expose display names. For projects without recipes, source tables are output instead.

Stale, partial, and failed runs are refused. Run all outputs again after edits. These exports reproduce the validated inputs and schema at export time: replacing a file in `original/` does not change `sources.json`. To change import settings, input files, dynamic pivot categories, or name-pattern selections, update the project and export again.

Saved check findings are included, but compiler-time guards such as correction uniqueness, pivot conflicts, and join limits are not rerun after manual script edits. Do not interpret an edited script's completion as a new passed-check report. Chart/report layouts and SQL-workspace queries are retained in project metadata but are not converted into plotting or query code.

Most R BIGINT outputs use `integer64`. If a column includes the minimum signed 64-bit integer, the script returns that column as decimal strings with a notice because bit64 reserves that value for missing data; exported CSV remains exact. Zero-column outputs retain their row count in memory and use row-count JSON instead of a CSV file.

---

Previous: [SQL workspace](SQL.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Troubleshooting and shortcuts](TROUBLESHOOTING.md)

# Working with Data Canvas

Data Canvas keeps the program and its data visible together. A **source** is an immutable file, a **recipe** produces a named table, and a **chart** refers to a recipe's current output.

## Import and inspect

Use **File → Import data** or the plus beside Project Library. Choose CSV, TSV, or `.xlsx`. Review the delimiter, quote character, header row, sheet, declared missing tokens, inferred types, and malformed-record policy before accepting.

The literal `NA` is ordinary text unless you explicitly declare it missing. A blank string, zero, missing token, and parsing failure are different. Leading-zero IDs stay text. Date/timestamp import types accept ISO formats; for other formats, import as Text and use Parse with an explicit format such as `%d/%m/%Y`. Timestamp interpretation is UTC.

Malformed delimited rows are reported. Retain mode preserves extra fields in an overflow column and fills absent fields with missing. Exclude mode is an explicit saved policy. Formula cells use stored results; Data Canvas never executes spreadsheet macros, formulas, or external links.

A source's inspector lets you change analytical roles, units, descriptions, and attribution independently of storage types. Replace a source through **Replace source with reviewed mapping**; every established column must be mapped once. Fingerprints detect changed files.

## Build a recipe

Select a source and choose **Build a recipe**. Operations come from the searchable toolbox. In the block workspace, select a block to configure its settings; Boolean and value expression blocks fit typed sockets. In Recipe list, use insertion boundaries, move buttons, and delete controls. Both editors modify the same canonical recipe.

Select Configure to build nested arithmetic, conditions, AND/OR/NOT, text operations, pure functions, and missing checks. Add a note explaining why the change is appropriate. Unfinished operations can be saved as drafts; they block execution at that point without blocking saving.

Branch creates a new recipe referencing the selected recipe. **Extract prefix as recipe** moves the selected prefix into a shared named recipe and replaces it with a reference. Dependencies display sources, recipes, charts, and navigable table connections. Cycles are rejected.

A join requires key pairs, relationship expectations, selected right-side columns, and explicit conflict aliases. Review the observed key multiplicities and exact projected output count. A 2-by-3 match produces six rows; Data Canvas does not hide or truncate that multiplication.

## Run and reason

Run computes the selected recipe and its dependencies. The adjacent circular-arrow control runs all outputs. Step resolves prerequisite recipes and advances one table transformation. Auto preview can be turned off for deliberate work. Cancel terminates the worker; your project remains saved.

Choose Before/After, Column profiles, Changes, or Contributing records in the resizable bottom drawer. Counts and profiles use the full input; the ordinary table preview displays at most 100 rows. Click a row to see its contributing source records. The drawer can be maximized, and its resize handle supports arrow keys.

Explain describes an operation deterministically. Checks show advisory and required failures without hiding results. SQL shows the query mapped to the selected block. The SQL workspace accepts parsed, read-only SELECT/WITH statements over explicit bindings, executes them in a separate database, and compares row multisets with duplicates preserved.

## Visualize and report

Visualize table creates an editable chart. Choose scatter, line, explicit-value bar, count bar, histogram, box plot, or heat map. Add layers, reference rules, encodings, facets, and scales. Statistical transformations are explicit and available in the Statistical tables tab. Histogram intervals are `[start, end)` and anchored at zero. Box plots expose quartiles and whiskers.

Click a mark for contributing records. Brush a single-layer scatter/line plot to highlight a range. **Create filter from selection** creates a separate recipe with an explicit range/category predicate; it never silently changes the chart's input. Basic chart transformations can be extracted as recipes. Export SVG, PNG, or the editable chart specification.

Reports combine authored text, live charts, tables, and captions. Link prose to evidence; subsequent table edits mark linked claims for review. Export HTML for a self-contained document with embedded figures, source fingerprints, attributions, and operation summaries. Print that HTML to PDF in your browser.

## Map locations and regions

Choose **Point map** to plot numeric longitude/latitude, or **Choropleth map** to join region keys to boundaries and shade an explicit sum, mean, count, or other statistic. World countries are bundled; custom Polygon/MultiPolygon GeoJSON can be imported and travels with the project. Choose a projection, **Fit mapped data**, and inspect unmatched keys or omitted coordinates in the notes. Select **Basemap → Street map — OpenStreetMap (online)** for street detail, then drag/scroll or use keyboard controls to navigate. Adjust **Overlay opacity** to show streets underneath regions. The **Places, points & regions** example demonstrates both families. See the [mapping guide](MAPPING.md) for joins, coordinate rules, imports, and limits.

## Preserve work

IndexedDB recovery is automatic and distinct from downloading a portable `.datacanvas` ZIP. New/Open/example actions preserve the previous draft. Recover another draft from File. Undo/redo covers canonical edits. Source assets, drafts, expressions, notes, charts, reports, and saved queries travel in the project file.

CSV exports omit hidden lineage and include a separate data dictionary. They do not automatically encode categories for machine learning. Missing CSV fields are unquoted empty values; literal blank strings are quoted. Use the project or typed execution results to retain complete type information.

Keyboard: Tab navigates controls, Enter activates them, Ctrl/⌘ S downloads a backup, Ctrl/⌘ Z undoes outside text fields, Shift-Ctrl/⌘ Z redoes, and Ctrl/⌘ Enter runs. Recipe list offers the complete authoring path without dragging. At narrow widths switch between Project, Canvas, and Inspector tabs.

## Pattern-based text operations

Choose **Regular expression** in the Clean toolbox to filter matching/nonmatching rows, replace text, or extract a capture into a new column. Test a sample in the inspector before running. See [patterns, flags, replacements, and missing-value rules](REGEX.md).

To select **columns by their names**, add **Select columns**, choose **Select by → Regular expression**, enter a pattern such as `^sales_`, and choose **keep** or **drop**. Use **Preview matching columns** to inspect names before running.

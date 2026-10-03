# Importing data, types, and dates

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Review an import

Choose **File → Import data** or the library's **Import data** button. Supported inputs are UTF-8 CSV/TSV and Excel `.xlsx` worksheets.

1. For delimited text, review **Delimiter**, **Quote character**, and **Header row**. Delimiters include comma, tab, semicolon, and pipe. For Excel, select **Sheet** and the header row.
2. Enter **Declared missing tokens**, one per line. Select **Blank text is missing** only when that reflects the source.
3. Choose the **Malformed record policy**. `retain` preserves extra fields in an overflow column and fills absent fields with missing; `exclude` explicitly excludes malformed records. Review the reported issues.
4. Review every inferred column type and the preview. Keep identifiers with leading zeros as text.
5. Fill in **One row represents…**, then accept the import.

Original file bytes, import settings, and a SHA-256 fingerprint are retained in the project. Recipes leave the source intact. Excel formula cells use stored results; formulas, macros, and external links are not executed.

## Storage types and missing values

| Type | Use and behavior |
| --- | --- |
| Text | Labels, identifiers, and values that still need parsing; preserves leading zeros |
| Boolean | True/false values |
| Integer | Signed 64-bit whole numbers |
| Decimal | Finite double-precision real numbers; not arbitrary-precision decimal storage |
| Date | Calendar dates |
| Timestamp | Date and time under the project's UTC policy |

`NA`, zero, and blank text are ordinary values unless declared missing. A missing token and a failed numeric/date conversion may both produce null, but conversion failures are reported separately. Inspect diagnostics before assuming all missing values mean the same thing.

Blank text and missing remain distinct in exports. For exact large identifiers, text is often the most useful type: numeric chart rendering uses JavaScript numbers, which cannot distinguish every 64-bit integer. Typed project/execution formats preserve integer values.

## Work with dates and timestamps

ISO-formatted values can be imported as Date or Timestamp. For other formats, import as Text and add **Parse values** to a recipe:

1. Select the text column and the target type `date` or `timestamp`.
2. Supply an explicit format. For `31/01/2026`, use `%d/%m/%Y`; for `2026-01-31 14:30:00`, use `%Y-%m-%d %H:%M:%S`.
3. Run the step and inspect failed conversions in **Checks**. Original source text remains available.
4. Add **Derive column** with a `call` expression such as `year`, `month`, or `day` to create grouping fields. Use `elapsed_days` with start and end columns for the number of day boundaries crossed.
5. Use parsed dates as chart fields or sort keys. For monthly summaries, derive year and month and group by both, so different years are not pooled accidentally.

Timestamps use UTC; there is no timezone-picker workflow. Normalize local-time conventions before importing when the source does not identify its timezone. `elapsed_days` counts calendar day boundaries, not fractional 24-hour durations.

## Describe columns and replace a source

Select a source to edit attribution and column metadata in **Configure**: analytical role, units, ordered category levels, and description. Roles describe how a column should be interpreted and are independent of storage type. Update the recipe's row meaning after reshaping or aggregation.

To refresh a file, select its source and choose **Replace source with reviewed mapping…**. Review import settings and map every established column exactly once to the replacement. Existing references follow column identities, not a coincidentally matching name. Run all outputs afterward and review checks, joins, charts, and written claims. Changed rows can change deterministic samples and contributing-record identities.

---

Previous: [Getting started](QUICKSTART.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Recipes and expressions](RECIPES.md)

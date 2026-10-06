# Cleaning and visualization for assignments

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

These tools work in recipe blocks and the Recipe list. Their settings, stable column identifiers, category metadata, and chart sequences travel in portable projects. Browser and headless execution share the compiler and chart statistics. The project format is version 2, with semantics 2.0.0; the API and execution-result format remain version 1.

## Construct, adjust, and interpret dates

Add **Derive → Date & time**, choose an operation, and name its new output column. Every date/time operation creates a new column, leaving its inputs available for comparison.

| Operation | Configuration |
| --- | --- |
| `construct` | Select numeric year, month, and day columns; choose date or timestamp. For timestamps, select hour/minute columns or leave either unselected for zero. Choose `wall` or `utc`. |
| `add` | Select a date/timestamp and a signed duration expression, such as the `delay` column. Choose seconds, minutes, hours, days, or weeks. Negative values subtract; results are timestamps. |
| `extract` | Select date, year, month, day, hour, minute, weekday, week, or week_year. |
| `format` | Enter an explicit strftime format or use a preset. The output is text. |
| `convert` | Select an IANA timezone, explicit conversion direction, and repeated-local-time policy. |

A selected component that is missing, fractional, or out of range produces a missing timestamp. Hour is 0–23 and minute 0–59; invalid calendar dates also become missing. An *unselected* hour/minute is zero, which differs from a selected column containing missing values. Years 1–9999 can be constructed.

For the scheduled-departure exercise:

1. Construct `Scheduled departure` from year/month/day/hour/minute, with meaning `wall`.
2. Add another **Date & time** block, choose `add`, select `Scheduled departure`, set the signed duration to the delay column, and select **minutes**. Name it `Actual departure`.
3. Use two `extract` blocks to extract the **date** from the scheduled and actual timestamps.
4. Add **Derive column** and compare those date columns with `!=`. This identifies calendar-date changes across midnight and year boundaries. A missing input remains missing.

### Wall time, UTC, and daylight saving

**Wall time** is a local clock reading. **UTC** identifies an instant. Column metadata and table-header tooltips identify the meaning of derived timestamp fields. Source timestamp imports retain the UTC import policy; import local-clock text as text and use **Parse values → Timestamp meaning → wall**, or construct it from components. Wall-time parsing rejects timezone format directives `%z` and `%Z`; parse offset-bearing input as UTC instead.

Timezone conversion is always explicit: `local_to_utc` interprets the input clock fields in the chosen zone, while `utc_to_local` interprets the input as UTC and returns local clock fields. Conversion uses bundled IANA rules 2025b, with UTC coverage from 1900 through 2100. No browser timezone or downloaded extension is used. SQL exports contain the same frozen intervals.

Nonexistent spring-forward times become missing. For repeated fall-back times choose **missing**, **earlier**, or **later**, referring to the UTC instant. For example, New York's 2024-11-03 01:30 maps to 05:30 UTC under earlier, or 06:30 UTC under later. New York's 2024-03-10 02:30 does not exist and becomes missing. Out-of-coverage instants become missing.

Adding to wall time performs clock arithmetic without DST. Adding to UTC measures elapsed time. For an elapsed delay across DST, convert wall → UTC, add the duration, then convert UTC → wall before extracting the local calendar date. A day is exactly 24 hours and a week exactly seven days; calendar-month/year arithmetic is not offered.

Weekday numbering is Monday=1 through Sunday=7. Weeks follow **ISO 8601**: Monday start, week 1 contains January 4. Pair **week** with **week_year** because the ISO week year can differ from the calendar year. Names in formatted output are English: `%B` full month, `%A` weekday, `%I:%M %p` 12-hour time and AM/PM, `%H:%M` 24-hour time, `%Y-%m-%d` calendar date. Formatting does not convert timezones.

## Rank and select within groups

Add **Choose → Rank within groups** to append a rank column, or **First k within groups** to retain leading positions. Choose grouping columns (empty means all rows), ordered keys, ascending/descending direction, and missing-first/last for each key.

- **row_number:** distinct positions; stable source-row identity breaks remaining ties. Top-k retains at most k rows per group.
- **rank:** equal ordering values share a position, with gaps after ties: 1, 1, 3.
- **dense_rank:** ties share positions without gaps: 1, 1, 2.

Rank and dense-rank cutoffs can retain more than k rows. Add a meaningful secondary ordering key when ties should be distinguished. Missing grouping values form their own group. **Exclude** gives rows with any missing ordering value a missing rank and excludes them from top-k; **include** uses the chosen missing placement. Stable row identities make otherwise tied selections reproducible.

To average the three shortest individuals per homeworld, use **First k within groups**, group by homeworld, order height ascending, exclude missing ordering values, choose row_number, and set k=3. Either retain smaller groups or check **Require at least k valid observations per group**. Valid means every ordering field is present. Follow with **Grouped summary**, group by homeworld, and average height.

## Rename many labels

Add **Choose → Rename multiple columns**, select columns, then remove a prefix/suffix, replace literal text, or apply an RE2 replacement. **Preview renamed columns** shows before/after labels and collisions, including collisions with unselected columns. Empty names, names longer than 200 characters, and duplicate names block the operation. Run upstream edits first so the preview uses the current input schema.

For `wk1` through `wk76`, select those columns and remove prefix `wk`, or replace regex `^wk([0-9]+)$` with `\1`. Stable IDs remain unchanged, so downstream expressions and chart references keep working. Column selection by regex still evaluates *display names* at that step, so its matching set can deliberately change after a rename.

## Categories, grouped bars, and accessible line styling

Add **Clean → Set category order**, or open a chart's **Data roles & category order** and use its column button to add this operation upstream. Choose nominal/ordinal role and one category per line. Presets supply Monday–Sunday, January–December, and numeric months 1–12. Numeric columns can be categories while keeping numeric storage. Explicit levels precede unlisted values. Ordering controls axes, line paths, legends, saved charts, and rendered exports.

For side-by-side bars, choose a category X field, a color/group field, and **Bar stacking → Grouped / side-by-side**. It works for counts and bars with either orientation; histograms use facets for separated groups. Stacked, percentage, centered, overlay, and facet options remain available. The **BAR STACKING** chart block stores the same choice.

Chart color fields accept opaque CSS names (`red`, `navy`, `rebeccapurple`) and three/six-digit hex. The swatch previews supported colors; committing the field normalizes it to six-digit hex. Unknown names produce an error and retain the last valid color. Background also accepts transparent/auto. Opacity is a separate 0–1 layer setting; maps multiply it by map overlay opacity.

Lines support solid, dashed, dotted, and dash-dot patterns, width, and point markers. **Dash by group** and the Shape encoding distinguish groups without relying only on color. Use the **LINE STYLE** chart block for these settings; the ordinary appearance encoding blocks provide shape/color/detail.

## Explicit uncertainty displays

Choose **Error bars (summary)** or **Uncertainty band (summary)**, select X groups and numeric Y, then select the method:

| Method | Display and parameters |
| --- | --- |
| Sample SD | Mean ± multiplier × sample standard deviation; describes spread, not a confidence interval. |
| Standard error | Mean ± multiplier × sample SD / √n; not automatically a confidence interval. |
| Normal confidence interval | Mean ± z × SE; confidence 90%, 95%, or 99%. Assumes independent observations and an approximately normal sampling distribution. This is not a Student-t interval. |

The app does **not** bootstrap or resample. The **UNCERTAINTY** block exposes the same method and parameters. Error bars include a mean point and endpoint ticks; bands include a mean line and optional markers. All require a linear Y axis. Color/detail/dash/shape/facet fields define additional groups.

Missing X values are omitted because they cannot be positioned. Missing Y values are excluded from the statistics and counted per group. The statistical table contains mean, valid count, missing count, sample SD, SE, lower bound, and upper bound. Bounds require at least two valid observations; all-missing groups remain in that table. Use the table and chart notes to inspect the calculation and export the displayed statistics. Chart uncertainty calculations are not translated into executable plotting code by the recipe-code exports.

## Explain code and check submissions

Open **Code exports**, choose SQL/Python/R, and select a recipe step. The view shows its executable snippet, actual backend, compiled SQL when needed, and display-name → stable-ID mapping. [Saving and exports](EXPORTS.md) explains dependencies, frozen snapshots, and untranslated chart/report/query features.

Choose **File → Assignment submission checklist…** and optionally enable checks before saving. Add required recipe/chart names, exactly including capitalization. Ctrl/⌘ S and File → Save then report missing outputs, duplicate required names, incomplete steps anywhere in the project, failed computations, and required outputs without current results. Required charts are computed against the current recipe results while checking. Close the dialog to finish edits or run all outputs, then check again. **Save project anyway** always permits unfinished work to be backed up. Recovery drafts are independent of the checklist.

The checklist checks completeness, not correctness. It stores no answers or grades. Headless and browser API runs expose `result.submission` with `enabled`, `ready`, `issues`, and `checkedOutputs`; execution still returns computed tables for external grading. The browser API also exposes `DataCanvas.checkSubmission(project, result)`. A headless run with selected outputs only will correctly report required but uncomputed outputs. Keep grading logic and answer keys in the external assignment project.

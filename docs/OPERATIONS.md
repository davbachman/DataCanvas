# Operation reference

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

Add any operation from the toolbox, configure it in the inspector, run it, and examine **Checks** and **Before/After**. This page covers every available transformation. Expressions are explained in [Recipes](RECIPES.md); detailed result rules are in [Semantics](SEMANTICS.md).

## Choose rows and columns

| Operation | Settings and use |
| --- | --- |
| **Filter rows** | Build a Boolean expression. Only true rows remain; false and unknown conditions are counted separately. |
| **Select columns** | Choose keep/drop and explicit columns, or **Select by → Regular expression**. Pattern selection matches current display names on every run and preserves input order. [Pattern examples](REGEX.md). |
| **Rename column** | Select a column and enter its new display name. Existing references retain the column's stable identity. |
| **Sort rows** | Add ordered keys; set ascending/descending and missing-first/last for each. Stable row identity breaks remaining ties. |
| **Seeded sample** | Choose a row count or fraction and a seed. Sampling is without replacement; a fraction takes the floor of fraction × population. The saved seed and unchanged source identities reproduce the sample. |

Tables have no analytical order without an explicit sort. Grouping, joins, append, pivots, and sampling clear ordering; sort again if output order matters.

## Clean values

| Operation | Settings and use |
| --- | --- |
| **Parse values** | Select the column and integer, decimal, Boolean, date, or timestamp target. Set decimal separator or date format as appropriate. Failed conversions become missing with diagnostics; source text remains available. |
| **Clean text** | Select trim, upper, lower, or case-sensitive literal replacement. Enter search/replacement text for replacement. |
| **Regular expression** | Select a text column and filter, replace, or extract. Set RE2 pattern, flags, and action-specific options; test before running. See the [complete regex guide](REGEX.md). |
| **Split column** | Select a literal delimiter and explicit comma-separated output names. For example, split `city,state` at a comma into two named columns. This is not regex splitting. |
| **Recode categories** | Add exact from/to mappings and decide whether unmatched values stay, become missing, or cause an error. |
| **Handle missing** | Select columns and keep rows with missing values in any selected column, drop those rows, or replace nulls with a typed value. Blank text is separate from missing. |
| **Find / remove duplicates** | Define duplicate-key columns. Identify duplicates for inspection, or remove them using an explicit ordering that determines which record survives. |
| **Keyed correction** | Supply key values, target column, expected old value, new value, and a reason. It applies only when exactly one row matches and its old value agrees. |

A keyed correction is appropriate for a known, documented error; use a transformation for a general cleaning rule. Corrections are reproducible steps rather than direct edits to the source grid.

## Derive and reshape

**Derive column:** name the new column and build an expression, such as `quantity * unit_price`. Check units and missing results. See [expression instructions](RECIPES.md#build-expressions) and [datetime examples](IMPORTING.md#work-with-dates-and-timestamps).

**Pivot longer:** select measurement columns, name the variable and value fields, and choose whether to drop missing values. Unselected columns remain identifiers. For columns `jan`, `feb`, and `mar`, one original row becomes three rows unless missing values are explicitly dropped. Update row meaning to include the month/measurement dimension.

**Pivot wider:** select identifier columns, the category field that supplies new column names, and the value field. Choose what to do with absent cells. Duplicate identifier/category cells cause an error unless you select an aggregate. New categories can change the schema; inspect downstream selections and re-export analysis code after a change.

## Combine tables

### Join tables

1. Choose **Right table**, join type, and one or more left/right key pairs. All pairs must match.
2. Declare the expected relationship: one-to-one, one-to-many, many-to-one, or many-to-many.
3. Select the right-side columns to include and resolve name conflicts with explicit aliases.
4. Set the maximum output-row guard and run. Inspect multiplicities, unmatched keys, and projected row counts.

| Join type | Result |
| --- | --- |
| `left` | Every left row, with matching right values or missing right values |
| `inner` | Matching combinations only |
| `full` | Matching combinations plus unmatched rows from either side |
| `semi` | Left rows with a match, without adding right-side columns |
| `anti` | Left rows without a match |

Null keys never match, including two null keys. Two left rows and three right rows with the same key produce six joined rows. The relationship declaration reports discrepancies; it does not deduplicate inputs. The row-limit guard stops oversized materialization. Use the **Transactions & products** example to inspect this behavior.

### Append tables

Choose input tables and whether to use union mode. Columns match by exact name and compatible storage type, never by position. Without union mode, schemas must agree; union mode fills absent fields with missing values. Rename or parse inputs first if their schemas represent the same information differently.

## Summarize and calculate proportions

**Summarize:** select grouping fields and add named aggregate outputs. With no grouping fields, the result is an overall summary. Missing grouping values form visible groups.

| Aggregate | Meaning |
| --- | --- |
| `count` | All rows |
| `count_valid` | Nonmissing values of the selected field |
| `count_missing` | Missing values |
| `distinct` | Distinct nonmissing values |
| `sum`, `mean`, `median`, `min`, `max` | Numeric summaries ignoring missing values |
| `sd` | Sample standard deviation; requires at least two valid values |
| `quantile` | Continuous, linearly interpolated quantile at the chosen probability from 0 to 1 |

Empty numeric aggregates, including sum, are missing. An empty ungrouped summary produces one row with count zero; an empty grouped summary has no groups. Include valid/missing counts alongside numeric results to make their population clear.

**Proportion:** select grouping fields, define the denominator population with an expression, and define the numerator condition within that population. The result exposes numerator, denominator, and ratio. For example, denominator = eligible observations and numerator = successful outcomes. Do not replace an explicit population with a count of nonmissing outcomes unless that is the intended question.

## Check data

Add **Check data**, choose advisory or required severity, then configure one of:

- `unique`: keys must identify unique records.
- `nonmissing`: selected fields must be present.
- `categories`: values must belong to the supplied allowed categories.
- `range`: values must be within the specified bounds.
- `row_count`: the table must meet the minimum/maximum row count.
- `reference`: selected keys must appear in the selected reference table's keys, in corresponding order.

Checks alter no data. Required failures remain visible and affect passed-check status, but do not prevent saving or exporting computed results. Use separate filter, correction, or recode steps when the intended response is to change data.

---

Previous: [Recipes and expressions](RECIPES.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Regular expressions](REGEX.md)

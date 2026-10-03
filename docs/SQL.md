# SQL workspace

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

The SQL workspace lets you express a query over explicitly selected sources and recipe outputs, then compare it with a visual recipe. Queries are saved in the project and produce terminal views; they do not become recipe inputs.

## Write and run a query

1. Run the recipes you want to query, preferably with **Run all outputs**.
2. Open **SQL workspace** and choose **New query**.
3. Give the query a name. Use **Table binding: data** to choose the source or recipe represented by `data`. If no binding exists yet, add one with **+ Table binding** and use its displayed name.
4. Enter a read-only `SELECT` or `WITH` query using the binding name and displayed column names.
5. Choose **Run query**. The result displays up to 100 rows.

For a binding named `data` with columns `region` and `amount`:

```sql
SELECT "region", COUNT(*) AS "n", SUM("amount") AS "total"
FROM "data"
GROUP BY "region"
```

Add bindings for additional tables; use their displayed names, such as `table_2`, in the query. Double-quote identifiers with spaces or punctuation; single-quote text values. The workspace uses DuckDB SQL and a separate database with only its explicit table bindings. Data-changing statements and arbitrary file/network access are not part of this workspace.

## Compare with a recipe

Choose **Compare with recipe**, set **Absolute numeric tolerance**, and run the query. Match the recipe's output column names and intended computation. By default the comparison treats results as row multisets: row order is ignored, but repeated rows count. Choose **Compare order** only when both results have deliberate ordering, such as a recipe Sort and SQL `ORDER BY`.

A comparison reports Equivalent or Different with an explanation. If a result differs, inspect missing-value handling, duplicates, grouping, join multiplicity, and tolerance before changing the analysis. A large tolerance can hide meaningful numerical differences.

## Inspect or export generated SQL

In a recipe, select **SQL** in the inspector to inspect the generated statement for a step. This compiler output uses stable physical column IDs and may differ from the display names used in the SQL workspace.

For a downloadable analysis, use **File → Export SQL + source assets**. See [exports](EXPORTS.md#export-tables-and-sql) for execution and portability. SQL-workspace queries remain saved in portable projects but are not translated into the R/Python recipe scripts.

---

Previous: [Reports](REPORTS.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Saving and exports](EXPORTS.md)

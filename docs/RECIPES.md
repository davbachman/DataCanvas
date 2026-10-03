# Recipes, expressions, and inspection

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Build and edit a recipe

Select a source and choose **Build a recipe**, or use the library's **New recipe** button. In the recipe inspector, set **Recipe name** and **Start from**. A recipe can start from a source or another recipe.

Click operations in the searchable toolbox to add them. In **Blocks**, snap transformations into the vertical stack and expressions into their typed sockets. In **Recipe list**, use insertion boundaries and the move/delete buttons. Both editors change the same recipe; switching views does not create a copy.

Select a step to edit **Configure**. Add a note under **Why is this change appropriate?** to record reasoning. Duplicate a step from its controls or the Edit menu when useful. Incomplete steps can be saved as drafts, but execution stops at the incomplete step.

Order matters: filtering before a summary changes the population being summarized; filtering afterward selects summary groups. Renaming preserves a column's identity. Removing and recreating a column creates a different identity, so downstream references may need repair.

## Build expressions

The inspector offers these expression kinds. They are structured controls, not a box for arbitrary Python, R, or JavaScript.

| Kind | How to use it |
| --- | --- |
| `column` | Select an available field |
| `literal` | Choose Number, Text, Boolean, or Missing and enter a constant |
| `binary` | Choose an operator and recursively configure Left and Right |
| `unary` | Apply `not`, `is_missing`, `not_missing`, or `negate` to one value |
| `call` | Choose a function and configure its arguments |
| `conditional` | Supply the condition, the value when true, and the alternative |

Binary operations include arithmetic (`+`, `-`, `*`, `/`, `%`), comparisons, `and`, `or`, `contains`, `starts`, and `in`. Literal text matching is case-sensitive. `in` compares against comma-separated text values in its right argument; use regular expressions when you need pattern matching.

Functions include `coalesce`, `abs`, `round`, `sqrt`, `log` (natural logarithm), `exp`, `lower`, `upper`, `trim`, `length`, `concat`, `year`, `month`, `day`, `elapsed_days`, and `bin`. `coalesce` supplies a fallback for missing values; `bin(value, width)` returns the zero-anchored bin start. Use a positive bin width.

For a percentage, derive a new column with the nested expression `(part / whole) * 100`. Configure the top binary operator as multiplication, its left operand as division, and its right operand as Number `100`. Division by zero, invalid logarithms/square roots, and nonfinite arithmetic become missing. Derived missing-value counts can also include already-missing inputs.

Filters keep only conditions that evaluate to true. False and unknown/missing conditions are both excluded, with separate counts. To retain missing observations deliberately, combine the main condition with `or is_missing(column)`. Comparing a field to Missing using `=` is not a missing-value test.

## Run and inspect

| Control | Purpose |
| --- | --- |
| **Run** | Compute the selected recipe and its dependencies |
| **Run all outputs** | Compute all recipes, including branches; use before final exports |
| **Step** | Resolve prerequisites and advance one transformation |
| **Auto preview** | Recompute while editing; turn off for deliberate execution on larger data |
| **Cancel** | Stop the worker without discarding the project |

After running, select a step and inspect **Before**, **After**, **Column profiles**, **Changes**, or **Contributing records** in the bottom drawer. Previews show up to 100 rows; counts and profiles refer to full tables. Click a row or chart mark to trace its source records. Joins can contribute records from both inputs; summaries can contribute many records.

The inspector's **Explain** tab describes the selected operation, **Checks** shows quality findings, and **SQL** shows generated DuckDB SQL mapped to steps. A required check failure keeps computed results visible but prevents a passed-check status. A failed operation has no current output, and downstream recipes are blocked. An empty successful result is different from a failure.

## Reuse work and follow dependencies

**Branch** creates a recipe that starts from the current recipe. Use branches to compare alternative filters or summary definitions while keeping common cleaning steps in one place.

Select a step and choose **Extract prefix as recipe** to move the recipe's prefix into a shared named recipe. The remaining recipe starts from that output. Review names and row meanings afterward.

**Dependencies** shows source, recipe, and chart connections. Use it to navigate upstream when a referenced field disappears or an input fails. Cycles are rejected. Joins and appends add dependencies on their other input tables.

---

Previous: [Importing data and datetime values](IMPORTING.md) · [Guide contents](../README.md#instructions-for-use) · Next: [Operation reference](OPERATIONS.md)

# Regular expressions

Add **Clean → Regular expression** to a recipe and choose a column. The app and Linux runner both use the RE2 engine built into DuckDB 1.5.4. There is no JavaScript-regex fallback and no executable user code.

- **Filter** retains rows containing a match. **Keep nonmatching rows** reverses that condition. Both modes exclude missing values; use a separate missing-value operation if needed.
- **Replace** transforms the selected column into text. Choose first match or every match. Unmatched text stays unchanged and missing values stay missing.
- **Extract** creates a named text column. Group 0 is the whole first match; groups 1–9 select captures. No match or missing input produces missing. An optional group that does not participate in a successful match yields empty text.

Patterns search anywhere in the value. Enter `^…$` to anchor the whole value. Type patterns directly, without JavaScript `/…/` delimiters; backslashes are entered once in the interface. In JSON, escape backslashes as usual.

| Goal | Pattern | Operation / setting |
| --- | --- | --- |
| Keep codes such as AB-123 | `^[A-Z]{2}-[0-9]+$` | Filter |
| Normalize repeated spaces | `\s+` | Replace with one space; every match |
| Extract a code's numeric portion | `^[A-Z]+-(\d+)$` | Extract group 1 |
| Reverse “last, first” | `^([^,]+),\s*(.+)$` | Replace with `\2 \1` |
| Match Unicode letters | `^\p{L}+$` | Filter |
| Match email-like text | `^[^@\s]+@[^@\s]+\.[^@\s]+$` | Filter; this is not full email validation |

**Ignore case**, **Multiline anchors**, and **Dot matches newlines** are separate options. Multiline changes `^`/`$` to line boundaries; dot-all lets `.` consume newline characters. Replacement captures use `\1`–`\9`, not `$1`. Empty patterns and zero-width matches follow RE2 behavior.

Use **Pattern preview text → Test pattern** to test an entire sample value, including embedded newlines. This runs the same engine and compiler as the actual transformation, in a worker. The preview does not edit the recipe's data. **Run** computes the full table; **Checks** reports matching, nonmatching, and missing counts with five before/after examples.

RE2 supports alternation, character classes, quantifiers, capturing groups, and Unicode classes. It does not support lookahead/lookbehind or backreferences inside patterns. Invalid patterns produce an attached operation error, including on an empty input table. The pattern limit is 4,096 characters; the tester accepts 10,000 characters of sample text. All settings and stable output column IDs are included in portable projects, undo/redo, recovery, and headless execution. Chain regex blocks to process multiple columns or extract multiple groups.

## Select columns by name

Add **Choose → Select columns**, set **Select by → Regular expression**, and enter a **Column name pattern (RE2)**. Choose **keep** to retain matching columns or **drop** to remove them. **Ignore case** is optional and off by default. **Preview matching columns** lists the matched names and the number of columns that will remain, using the same RE2 engine as execution.

Examples: `^sales_` matches names starting with `sales_`; `_2025$` matches names ending in `_2025`; `^(id|date|amount)$` matches those three exact names. Patterns search display names, not cell values or stable IDs. Enter `.*` (or an empty pattern) to match every name. Escape punctuation when literal matching is intended, such as `sales\.2025`.

Names are evaluated against this step's input schema each time the recipe runs, so upstream renames or added columns can change the selection. Retained columns preserve their IDs, metadata, and input order. Rows and lineage are unchanged. If nothing matches, **keep** produces a table with zero visible columns and the original row count; **drop** retains all columns. Checks report the match count, retained count, and matched names. Invalid patterns fail even on empty inputs.

The preview uses currently known input names; run pending upstream edits to refresh them. Explicit selection remains available and existing projects keep their original behavior. A regex selection is saved as **Select columns operation version 2**, so older releases that do not support it reject the project instead of silently executing a different selection. Pattern, action, case option, and version survive portable export/import and browser/headless execution.

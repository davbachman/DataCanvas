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

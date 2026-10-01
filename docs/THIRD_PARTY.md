# Acknowledgments and licenses

The Data Canvas application is MIT licensed. The bundled synthetic examples are dedicated to the public domain under CC0; they contain no real observations or assignment materials.

Interaction precedents were inspected without copying code:

- [FlowLab](https://github.com/davbachman/FlowLab): README and saving/loading guide; stepping, validation, recovery, and undo concepts.
- [NeuralCanvas](https://github.com/davbachman/NeuralCanvas): README and canvas guide; inspectable intermediate values and linked compositional views.

Runtime/build dependencies are pinned in `package.json` and `package-lock.json`. Their package distributions retain upstream notices:

| Library | License / role |
| --- | --- |
| React / React DOM | MIT; UI |
| Blockly | Apache-2.0; typed snapping editor and vendored media |
| DuckDB-Wasm / DuckDB Node API | MIT; local query engines |
| Apache Arrow | Apache-2.0; typed bulk transfer to Wasm |
| Vega / Vega-Lite / Vega-Embed | BSD-3-Clause; plotting |
| SheetJS CE via `@e965/xlsx` 0.20.3 | Apache-2.0; maintained package mirror for local spreadsheet parsing |
| Papa Parse | MIT; delimited text parsing |
| fflate | MIT; portable ZIP projects |
| idb | ISC; IndexedDB wrapper |
| Zod | MIT; structural validation |
| node-sql-parser | Apache-2.0; structural SQL allowlist |
| Lucide | ISC; icons |
| Vite, TypeScript, Vitest, Playwright, tsx, Prettier | Upstream respective licenses; development, verification, and build tools |

`public/blockly` contains Blockly SVG media copied from the installed package. Its Apache-2.0 license is included alongside the media. Fonts use the operating system stack; the application does not fetch fonts or analytics from remote services.

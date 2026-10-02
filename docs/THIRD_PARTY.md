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
| d3-geo | ISC; spherical geometry validation and map view fitting |
| world-atlas 2.0.2 / Natural Earth 4.1.0 | ISC / public domain; bundled 1:110m country boundaries |
| topojson-client | ISC; development-time boundary conversion |
| SheetJS CE via `@e965/xlsx` 0.20.3 | Apache-2.0; maintained package mirror for local spreadsheet parsing |
| Papa Parse | MIT; delimited text parsing |
| fflate | MIT; portable ZIP projects |
| idb | ISC; IndexedDB wrapper |
| Zod | MIT; structural validation |
| node-sql-parser | Apache-2.0; structural SQL allowlist |
| Lucide | ISC; icons |
| Vite, TypeScript, Vitest, Playwright, tsx, Prettier | Upstream respective licenses; development, verification, and build tools |

`public/blockly` contains Blockly SVG media copied from the installed package. Its Apache-2.0 license is included alongside the media. Fonts use the operating system stack; the application does not fetch fonts or analytics from remote services.

`src/charts/geography/world.json` derives from world-atlas 2.0.2 countries-110m data. Its ISC notice is copied to `public/geography/LICENSE-world-atlas.txt`. Natural Earth source data is public domain. Maps include provenance in captions and exported figures; detailed provenance and geographic limitations are in the [mapping guide](MAPPING.md).

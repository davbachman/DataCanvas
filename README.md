# Data Canvas

[Open Data Canvas](https://davbachman.github.io/DataCanvas/)

A local-first visual workbench for cleaning, reshaping, combining, exploring, and visualizing tables. Build named recipes with snapping blocks, inspect every transformation, and preserve an analysis in a portable `.datacanvas` project. No account, backend, telemetry, or data upload is required.

## Start exploring

1. Open an editable example or import UTF-8 CSV/TSV or an Excel sheet.
2. Review field types, missing tokens, and what one row represents.
3. Build a recipe with the operation toolbox. Use **Blocks** or the synchronized **Recipe list**.
4. **Run** or **Step**, then inspect Before/After, column profiles, checks, SQL, and contributing records.
5. **Visualize table**, write a report, and **File → Save portable project**.

The three synthetic, CC0 examples cover messy temperatures, transaction/catalog joins, and unequal group sizes. Source files stay in the project. Recovery is automatic in IndexedDB; a downloaded project is a separate backup.

## Development

Requires Node.js 24 and npm. Dependencies and compatible DuckDB engine versions are pinned in the lockfile.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Production builds use relative asset paths, including the bundled Wasm and nested worker. For a GitHub Pages-like `/DataCanvas/` test server:

```sh
node scripts/serve.mjs
# In another terminal, with Chromium installed:
npm run test:browser
```

Browser tests use `/usr/bin/chromium` when present, `CHROMIUM_PATH` when supplied, or Playwright's installed Chromium. On a fresh machine run `npx playwright install --with-deps chromium`.

## Headless analysis

The Linux runner uses the same canonical model, SQL compiler, and operation semantics as the browser. It recomputes from source and does not trust saved results.

```sh
npm run --silent runner -- validate public/examples/temperatures.datacanvas
npm run --silent runner -- inspect public/examples/temperatures.datacanvas
npm run --silent runner -- run public/examples/temperatures.datacanvas \
  --outputs regional,regional_chart --out /tmp/data-canvas-results
```

See the [integration guide](docs/INTEGRATION.md) for the versioned API, typed result format, caller-controlled source replacement, and resource limits. This is an analysis runner: there are no assignment, grading, account, or collaboration components.

## Guides

- [User guide](docs/QUICKSTART.md)
- [Regular expressions for filtering and text transformations](docs/REGEX.md)
- [Project and result formats](docs/FORMATS.md)
- [Headless and browser integration](docs/INTEGRATION.md)
- [Architecture and extension points](docs/ARCHITECTURE.md)
- [Semantics](docs/SEMANTICS.md)
- [Verification, performance, and known limitations](docs/VERIFICATION.md)
- [Third-party acknowledgments](docs/THIRD_PARTY.md)
- [Original build specification](docs/BUILD-SPECIFICATION.txt)

## Deployment

`.github/workflows/pages.yml` tests, builds, runs browser journeys and semantic-parity fixtures, uploads `dist`, and deploys to GitHub Pages on pushes to `main`. The repository's Pages source must be GitHub Actions. The application works without cross-origin isolation using DuckDB's single-thread MVP Wasm build.

## License

[MIT](LICENSE). Public example data is CC0. See [third-party notices](docs/THIRD_PARTY.md) for libraries and design precedents.

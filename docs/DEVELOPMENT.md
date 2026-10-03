# Development, verification, and deployment

[Guide contents](../README.md#instructions-for-use) · [Open the app](https://davbachman.github.io/DataCanvas/)

## Local development

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

Browser tests use `/usr/bin/chromium` when present, `CHROMIUM_PATH` when supplied, or Playwright's installed Chromium. On a fresh machine run `npx playwright install --with-deps chromium`. CI also installs Firefox and WebKit and runs all three engines with `CROSS_BROWSER=1 npm run test:browser`.

`npm run test:code-export` executes the generated Python and R scripts for all six examples and an edge-case fixture, comparing every output table with the engine (including integer precision and missing values). Install the runtimes using `scripts/code-export-environment.yml` with Conda, or provide equivalent runtimes through `PYTHON` and `RSCRIPT`. This runs as a separate required deployment job.

## Headless analysis

The Linux runner uses the same canonical model, SQL compiler, and operation semantics as the browser. It recomputes from source and does not trust saved results.

```sh
npm run --silent runner -- validate public/examples/temperatures.datacanvas
npm run --silent runner -- inspect public/examples/temperatures.datacanvas
npm run --silent runner -- run public/examples/temperatures.datacanvas \
  --outputs regional,regional_chart --out /tmp/data-canvas-results
```

See the [integration guide](INTEGRATION.md) for the versioned API, typed result format, caller-controlled source replacement, and resource limits. This is an analysis runner: there are no assignment, grading, account, or collaboration components.

## Deployment

`.github/workflows/pages.yml` tests, builds, runs browser journeys and semantic-parity fixtures, uploads `dist`, and deploys to GitHub Pages on pushes to `main`. The repository's Pages source must be GitHub Actions. The application works without cross-origin isolation using DuckDB's single-thread MVP Wasm build.

## Reference material

| Reference | Contents |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Canonical model, compiler, worker, UI, and extension points |
| [Semantics](SEMANTICS.md) | Precise transformation and missing-value rules |
| [Formats](FORMATS.md) | Portable project and typed execution result contracts |
| [Integration](INTEGRATION.md) | Headless runner and browser API |
| [Verification](VERIFICATION.md) | Checks, benchmarks, and known limitations |
| [Third-party acknowledgments](THIRD_PARTY.md) | Libraries, data, and design precedents |
| [Original build specification](BUILD-SPECIFICATION.txt) | Historical project specification |

The six bundled example projects are generated from the source example definitions. Geographic examples and their editable downloads are described in the [mapping guide](MAPPING.md).

---

Previous: [Troubleshooting and shortcuts](TROUBLESHOOTING.md) · [Guide contents](../README.md#instructions-for-use)

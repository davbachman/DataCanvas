import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto("http://127.0.0.1:4173/DataCanvas/");
  await page
    .locator(".statusbar")
    .filter({ hasText: "Ready" })
    .waitFor({ timeout: 90000 });
  const bytes = (
    await readFile("/tmp/data-canvas-benchmark.datacanvas")
  ).toString("base64");
  const start = Date.now();
  const result = await page.evaluate(async (base64) => {
    const bundle = window.DataCanvas.load(
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    );
    const before = performance.memory?.usedJSHeapSize;
    const began = performance.now();
    let heartbeats = 0;
    const timer = setInterval(() => heartbeats++, 50);
    try {
      const result = await window.DataCanvas.run(bundle, {
        previewRows: 100,
        maxOutputRows: 200000,
      });
      return {
        elapsedMs: performance.now() - began,
        engineMs: result.elapsedMs,
        status: result.status,
        errors: result.errors,
        engine: result.engineVersion,
        heartbeats,
        mainThreadHeapBefore: before,
        mainThreadHeapAfter: performance.memory?.usedJSHeapSize,
        rowCounts: Object.fromEntries(
          Object.entries(result.tables).map(([id, t]) => [id, t.rowCount]),
        ),
      };
    } finally {
      clearInterval(timer);
    }
  }, bytes);
  const measurements = {
    date: new Date().toISOString(),
    browser: browser.version(),
    platform: os.platform(),
    cpu: os.cpus()[0].model,
    logicalCPUs: os.cpus().length,
    rows: 100000,
    columns: 20,
    operations: 20,
    lookupRows: 10000,
    wallClockMs: Date.now() - start,
    ...result,
  };
  await writeFile(
    "docs/benchmark-browser.json",
    JSON.stringify(measurements, null, 2),
  );
  console.log(JSON.stringify(measurements, null, 2));
} finally {
  await browser.close();
}

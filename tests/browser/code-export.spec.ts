import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { codeExportFixture } from "../fixtures/code-export";
import { packBundle } from "../../src/persistence/bundle";
import { fingerprint } from "../../src/persistence/import";

test("downloads runnable R and Python bundles with full inputs and rejects partial runs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bundle = await codeExportFixture();
  const source = bundle.project.sources[0];
  // Runtime parity covers int64 limits and typed dates/timestamps. Keep those
  // fields as text in the browser fixture, which exercises the download flow.
  for (const id of ["big", "date", "time"])
    source.columns.find((c) => c.id === id)!.type = "text";
  const original = new TextDecoder().decode(bundle.assets[source.assetRef]);
  const bytes = new TextEncoder().encode(
    original +
      Array.from(
        { length: 150 },
        (_, i) => `more,${i},${i},true,2026-01-01,2026-01-01T00:00:00Z\n`,
      ).join(""),
  );
  source.fingerprint = await fingerprint(bytes);
  bundle.assets[source.assetRef] = bytes;
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "code.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(bundle)),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByText("File", { exact: true }).click();
  for (const [language, script] of [
    ["Python / pandas", "analysis.py"],
    ["R / tidyverse", "analysis.R"],
  ]) {
    const artifact = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: `Export ${language} + source assets`,
        exact: true,
      })
      .click();
    const files = unzipSync(
      new Uint8Array(await readFile((await (await artifact).path())!)),
    );
    expect(files[script]).toBeTruthy();
    expect(strFromU8(files["sources.json"])).toContain("src:155");
    expect(strFromU8(files["sources.json"])).toContain("9223372036854775807");
    expect(files["original/src.csv"]).toEqual(bytes);
    expect(JSON.parse(strFromU8(files["outputs.json"]))).toHaveLength(
      bundle.project.recipes.length,
    );
    expect(strFromU8(files["README.txt"])).toContain("DuckDB is required");
  }
  await page.getByText("File", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByText("File", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Export Python / pandas + source assets",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Run all outputs");
  expect(errors).toEqual([]);
});

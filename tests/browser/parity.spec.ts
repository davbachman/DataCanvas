import { teachingFixture } from "../fixtures/teaching";
import { stylingFixture } from "../fixtures/styling";
import { horizontalFixture } from "../fixtures/horizontal";
import { pieFixture } from "../fixtures/pies";
import { packBundle } from "../../src/persistence/bundle";
import { compareTables } from "../../src/engine/queries";
import { test, expect } from "@playwright/test";
import { load, run } from "../../src/headless/api";
for (const name of [
  "temperatures",
  "transactions",
  "weighting",
  "adversarial",
  "mapping",
  "bikes",
  "trees",
  "pies",
  "horizontal",
  "styling",
  "teaching",
]) {
  test(`browser/headless semantic parity: ${name}`, async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".statusbar")).toContainText("Ready", {
      timeout: 90000,
    });
    const path =
      name === "adversarial"
        ? "tests/fixtures/adversarial.datacanvas"
        : `public/examples/${name}.datacanvas`;
    const bundle =
      name === "teaching"
        ? await teachingFixture()
        : name === "pies"
          ? await pieFixture()
          : name === "horizontal"
            ? await horizontalFixture()
            : name === "styling"
              ? await stylingFixture()
              : await load(path);
    const bytes = Array.from(packBundle(bundle));
    const native = await run(bundle);
    const browser = await page.evaluate(async (data) => {
      const bundle = window.DataCanvas.load(new Uint8Array(data));
      return window.DataCanvas.run(bundle, {
        previewRows: 100000,
        maxOutputRows: 100000,
      });
    }, bytes);
    expect(browser.engineVersion).toBe(native.engineVersion);
    expect(browser.errors).toEqual(native.errors);
    expect(browser.submission).toEqual(native.submission);
    const compare = (actual: any, expected: any) => {
      expect(actual.columns).toEqual(expected.columns);
      expect(actual.rowCount).toBe(expected.rowCount);
      const converted = {
        columns: actual.columns.map((c: any) => c.name),
        schema: actual.columns,
        rows: actual.rows.map((r: any) =>
          Object.fromEntries(actual.columns.map((c: any) => [c.name, r[c.id]])),
        ),
      };
      expect(compareTables(expected, converted, 1e-12, false)).toMatchObject({
        equal: true,
      });
    };
    for (const id of Object.keys(native.tables))
      compare(browser.tables[id], native.tables[id]);
    expect(browser.charts?.length).toBe(native.charts?.length);
    for (let i = 0; i < (native.charts?.length || 0); i++) {
      const actual = (browser.charts as any[])[i],
        expected = (native.charts as any[])[i];
      expect(actual.authored).toEqual(expected.authored);
      expect(actual.tables.length).toBe(expected.tables.length);
      actual.tables.forEach((table: any, j: number) =>
        compare(table, expected.tables[j]),
      );
    }
  });
}

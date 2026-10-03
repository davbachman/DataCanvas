import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { horizontalFixture } from "../fixtures/horizontal";
import { packBundle } from "../../src/persistence/bundle";
async function dropdown(page: any, current: string, next: string) {
  await page
    .locator(".chart-block-host")
    .getByRole("button", { name: "dropdown: " + current, exact: true })
    .click();
  await page
    .locator(".blocklyDropDownDiv")
    .getByRole("option", { name: next, exact: true })
    .click();
}
test("horizontal geometry, editable chart blocks, synchronization, undo and portable reports", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "horizontal.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(await horizontalFixture())),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: /Country totals/ }).click();
  const bar = page.locator('.plot .mark-rect path[aria-label*="France"]');
  await expect(bar).toBeVisible();
  const horizontal = await bar.boundingBox();
  expect(horizontal!.width).toBeGreaterThan(horizontal!.height);
  await page.getByRole("button", { name: "Chart blocks", exact: true }).click();
  await expect(page.locator(".chart-block-host")).toContainText("STATISTICS");
  await dropdown(page, "horizontal", "vertical");
  await expect(
    page.getByRole("combobox", { name: "Orientation", exact: true }),
  ).toHaveValue("vertical");
  await page.getByRole("button", { name: "Plot", exact: true }).click();
  await expect(bar).toBeVisible();
  const vertical = await bar.boundingBox();
  expect(vertical!.height).toBeGreaterThan(vertical!.width);
  await page
    .getByRole("combobox", { name: "Orientation", exact: true })
    .selectOption("horizontal");
  await page.getByRole("button", { name: "Chart blocks", exact: true }).click();
  await expect(page.locator(".chart-block-host")).toContainText("horizontal");
  await dropdown(page, "Sum by first field", "Count by first field");
  await expect(
    page.getByRole("combobox", { name: "Chart family", exact: true }),
  ).toHaveValue("count");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Chart family", exact: true }),
  ).toHaveValue("bar");
  await expect(page.locator(".chart-block-host")).toContainText(
    "Sum by first field",
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await expect(
    page
      .locator(".chart-block-host")
      .getByRole("button", { name: "dropdown: country", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add orientation block", exact: true })
    .click();
  await expect(page.locator(".chart-sequence [role=alert]")).toContainText(
    "only one orientation",
  );
  await page
    .getByRole("button", { name: "Reset blocks to saved chart", exact: true })
    .click();
  await expect(page.locator(".chart-sequence [role=alert]")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/chart-blocks-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: /Value histogram/ }).click();
  await page.getByRole("button", { name: "Plot", exact: true }).click();
  await expect(page.locator(".plot .mark-rect path").first()).toBeVisible();
  await page.locator(".plot .mark-rect path").first().click();
  await expect(page.locator(".contributors")).toContainText("source records");
  const svgSaved = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  expect(await readFile((await (await svgSaved).path())!, "utf8")).toContain(
    "Value histogram",
  );
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const bytes = await readFile((await (await saved).path())!);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto("./");
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.locator('input[accept=".datacanvas"]').setInputFiles({
      name: "saved.datacanvas",
      mimeType: "application/zip",
      buffer: bytes,
    });
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.getByRole("button", { name: /Country totals/ }).click();
    await expect(
      fresh.getByRole("combobox", { name: "Orientation", exact: true }),
    ).toHaveValue("horizontal");
    await fresh
      .getByRole("button", { name: "Chart blocks", exact: true })
      .click();
    await expect(fresh.locator(".chart-block-host")).toContainText(
      "Sum by first field",
    );
    await fresh.getByRole("button", { name: "Report", exact: true }).click();
    await expect(fresh.locator(".report-paper .plot svg")).toHaveCount(2);
    const report = fresh.waitForEvent("download");
    await fresh
      .getByRole("button", { name: "Export HTML", exact: true })
      .click();
    expect(await readFile((await (await report).path())!, "utf8")).toContain(
      "Value histogram",
    );
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { stylingFixture } from "../fixtures/styling";
import { packBundle } from "../../src/persistence/bundle";
test("styling and layout controls sync with blocks, retain subplot contributors and export portable figures", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "styling.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(await stylingFixture())),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: /Styled comparison/ }).click();
  await expect(page.locator(".plot svg")).toContainText("Totals by country");
  await expect(page.locator(".plot svg")).toContainText("Value distribution");
  await page.getByText("Layout & styling", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Chart theme", exact: true })
    .selectOption("whitegrid");
  await page.getByLabel("Plot / panel width", { exact: true }).fill("360");
  await page.getByLabel("Plot / panel width", { exact: true }).press("Enter");
  await page
    .getByRole("combobox", { name: "Layer / panel X scales", exact: true })
    .selectOption("independent");
  await page
    .getByRole("combobox", { name: "Layer / panel Y scales", exact: true })
    .selectOption("independent");
  await page.getByRole("button", { name: "Chart blocks", exact: true }).click();
  await expect(page.locator(".chart-block-host")).toContainText("whitegrid");
  await page
    .locator(".chart-block-host")
    .getByRole("button", { name: "dropdown: subplots", exact: true })
    .click();
  await page
    .locator(".blocklyDropDownDiv")
    .getByRole("option", { name: "overlay", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Layer arrangement", exact: true }),
  ).toHaveValue("overlay");
  await page.getByRole("button", { name: "Plot", exact: true }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Layer arrangement", exact: true })
    .selectOption("subplots");
  await page
    .getByRole("combobox", { name: "Bar stacking", exact: true })
    .first()
    .selectOption("normalize");
  await expect(page.locator(".plot svg")).toContainText("100%");
  await page
    .locator('.plot .mark-rect path[aria-label*="place: Paris"]')
    .click({ force: true });
  await expect(page.locator(".contributors")).toContainText("Paris");
  const image = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const exported = await readFile((await (await image).path())!, "utf8");
  expect(exported).toContain("serif");
  expect(exported).toContain("100%");
  expect(exported).toContain("Value distribution");
  await page.screenshot({
    path: `test-results/styled-panels-${test.info().project.name}.png`,
    fullPage: true,
  });
  // A fresh engine generation must rerender charts even if the project revision is unchanged.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: /Faceted counts/ }).click();
  await expect(page.locator(".plot svg")).toContainText("France");
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
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
    await fresh.getByRole("button", { name: /Styled comparison/ }).click();
    await fresh.getByText("Layout & styling", { exact: true }).click();
    await expect(
      fresh.getByRole("combobox", { name: "Layer arrangement", exact: true }),
    ).toHaveValue("subplots");
    await expect(
      fresh.getByLabel("Plot / panel width", { exact: true }),
    ).toHaveValue("360");
    await expect(
      fresh.getByRole("combobox", { name: "Chart theme", exact: true }),
    ).toHaveValue("whitegrid");
    await expect(fresh.locator(".plot svg")).toContainText("100%");
    await fresh.getByRole("button", { name: "Report", exact: true }).click();
    await expect(fresh.locator(".report-paper .plot svg")).toHaveCount(2);
    const report = fresh.waitForEvent("download");
    await fresh
      .getByRole("button", { name: "Export HTML", exact: true })
      .click();
    const html = await readFile((await (await report).path())!, "utf8");
    expect(html).toContain("100%");
    expect(html).toContain("Value distribution");
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});

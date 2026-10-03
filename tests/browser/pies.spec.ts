import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pieFixture } from "../fixtures/pies";
import { packBundle } from "../../src/persistence/bundle";
test("pie and donut controls, contributors, exports and portable reports", async ({
  page,
  browser,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "pies.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(await pieFixture())),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: /Country totals/ }).click();
  const arcs = page.locator(".plot .mark-arc path");
  await expect(arcs).toHaveCount(5);
  await expect(page.locator(".plot svg")).toContainText("24.0%");
  const stat = page.getByRole("combobox", {
    name: "Visible statistical transformation",
    exact: true,
  });
  await stat.selectOption("");
  await expect(page.locator(".chart-main .error-box")).toContainText(
    "Multiple records",
  );
  await stat.selectOption("count");
  await expect(arcs).toHaveCount(5);
  await expect(
    page.getByRole("combobox", { name: "Slice value", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".plot svg")).toContainText("28.6%");
  await stat.selectOption("sum");
  await page
    .getByRole("combobox", { name: "Chart family", exact: true })
    .selectOption("donut");
  await expect(arcs).toHaveCount(5);
  await expect(page.locator(".plot svg")).toContainText("24.0%");
  await page.getByLabel("Show percentage labels").uncheck();
  await expect(page.locator(".plot svg")).not.toContainText("24.0%");
  await page.getByLabel("Show percentage labels").check();
  await expect(page.locator(".plot svg")).toContainText("24.0%");
  await page
    .locator('.plot .mark-arc path[aria-label*="France"]')
    .click({ force: true });
  await expect(page.locator(".contributors")).toContainText("Paris");
  await expect(page.locator(".contributors")).toContainText("Lyon");
  await expect(
    page.getByRole("button", {
      name: "Create filter from selection",
      exact: true,
    }),
  ).toBeEnabled();
  for (const format of ["SVG", "PNG"]) {
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const bytes = await readFile((await (await saved).path())!);
    if (format === "SVG") expect(bytes.toString()).toContain("24.0%");
    else expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  }
  await page.screenshot({
    path: `test-results/donut-${test.info().project.name}.png`,
    fullPage: true,
  });
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const bytes = await readFile((await (await saved).path())!);
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto("./");
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.locator('input[accept=".datacanvas"]').setInputFiles({
      name: "pies.datacanvas",
      mimeType: "application/zip",
      buffer: bytes,
    });
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.getByRole("button", { name: /Country totals/ }).click();
    await expect(
      fresh.getByRole("combobox", { name: "Chart family", exact: true }),
    ).toHaveValue("donut");
    await expect(fresh.locator(".plot svg")).toContainText("24.0%");
    await fresh.getByRole("button", { name: "Report", exact: true }).click();
    await expect(fresh.locator(".report-paper .plot svg")).toHaveCount(2);
    const htmlSaved = fresh.waitForEvent("download");
    await fresh
      .getByRole("button", { name: "Export HTML", exact: true })
      .click();
    expect(await readFile((await (await htmlSaved).path())!, "utf8")).toContain(
      "24.0%",
    );
  } finally {
    await context.close();
  }
  await page
    .getByRole("button", { name: "Create filter from selection", exact: true })
    .click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.locator(".data-table").last()).toContainText("France");
  await expect(page.locator(".data-table").last()).not.toContainText("Japan");
});

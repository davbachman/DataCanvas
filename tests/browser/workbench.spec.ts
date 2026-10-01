import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("production subpath loads worker, runs examples, renders blocks, charts, reports and recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("BROWSER:", m.text());
  });
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await expect(page.locator(".blocklySvg")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Clean monthly readings", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Recipe list", exact: true }).click();
  await expect(page.locator(".operation-card")).toHaveCount(4);
  await page
    .getByRole("button", { name: /Regional temperatures/ })
    .first()
    .click();
  await expect(page.locator(".table-footer")).toContainText("3");
  await page.getByRole("button", { name: /A season, by region/ }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.screenshot({
    path: "test-results/chart-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(page.locator(".report-paper .plot svg")).toBeVisible();
  await page.screenshot({
    path: "test-results/report-1440.png",
    fullPage: true,
  });
  const report = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  expect((await report).suggestedFilename()).toContain(".html");
  await page.getByLabel("Project title").fill("Recovered exploration");
  await expect(page.getByText("Recovery saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Recovered exploration",
  );
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  expect(errors).toEqual([]);
});
test("CSV import, keyboard/list commands, undo, ZIP backup and fresh-context reopening", async ({
  page,
  browser,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await page
    .locator('input[type=file][accept=".csv,.tsv,.xlsx"]')
    .setInputFiles({
      name: "sales.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("region,amount\nNorth,10\nNorth,20\nSouth,30\n"),
    });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Import table", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "sales.csv", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Build a recipe" }).click();
  await page.getByRole("button", { name: "Recipe list", exact: true }).click();
  await page.getByLabel("Search operations").fill("filter");
  await page.getByRole("button", { name: "Filter rows", exact: true }).click();
  await expect(page.locator(".operation-card")).toHaveCount(1);
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await page.getByLabel("Search operations").fill("derive");
  await page
    .getByRole("button", { name: "Derive column", exact: true })
    .click();
  await expect(page.locator(".operation-card")).toHaveCount(2);
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await page.getByLabel("Search operations").fill("summarize");
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.locator(".operation-card")).toHaveCount(3);
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(page.locator(".operation-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(page.locator(".operation-card")).toHaveCount(3);
  await expect(page.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await page.getByRole("button", { name: "Visualize table" }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const artifact = await saved;
  const bytes = await readFile((await artifact.path())!);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("./");
  await expect(fresh.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await fresh.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "portable.datacanvas",
    mimeType: "application/zip",
    buffer: bytes,
  });
  await expect(fresh.getByRole("button", { name: /sales.csv/ })).toBeVisible();
  await expect(fresh.locator(".statusbar")).toContainText("Ready", {
    timeout: 90000,
  });
  await context.close();
});

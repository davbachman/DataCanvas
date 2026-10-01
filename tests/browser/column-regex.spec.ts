import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("select column names by RE2, preview, keep/drop, and reopen saved settings", async ({
  page,
  browser,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page
    .locator('input[accept=".csv,.tsv,.xlsx"]')
    .setInputFiles({
      name: "columns.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "sales_2024,Sales_2025,cost_2025,notes\n10,20,30,ok\n11,21,31,next\n",
      ),
    });
  await page.getByRole("button", { name: "Import table", exact: true }).click();
  await page.getByRole("button", { name: "Build a recipe" }).click();
  await page.getByRole("button", { name: "Recipe list", exact: true }).click();
  await page.getByLabel("Search operations").fill("select");
  await page
    .getByRole("button", { name: "Select columns", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Select by", exact: true })
    .selectOption("regex");
  await page
    .getByRole("textbox", { name: "Column name pattern (RE2)", exact: true })
    .fill("^sales_");
  await page
    .getByRole("checkbox", { name: "Ignore case", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview matching columns", exact: true })
    .click();
  const preview = page.locator(".column-regex-preview");
  await expect(preview).toContainText("2 of 4 names matched");
  await expect(preview.locator("li")).toHaveText(["sales_2024", "Sales_2025"]);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.locator(".data-table thead th")).toHaveCount(3);
  await expect(page.locator(".data-table")).not.toContainText("cost_2025");
  await expect(page.locator(".table-footer")).toContainText("2 rows");
  await page
    .getByRole("combobox", { name: "Action", exact: true })
    .selectOption("drop");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await expect(page.locator(".data-table")).toContainText("cost_2025");
  await expect(page.locator(".data-table")).not.toContainText("sales_2024");
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const bytes = await readFile((await (await saved).path())!);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  try {
    await fresh.goto("./");
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh
      .locator('input[accept=".datacanvas"]')
      .setInputFiles({
        name: "columns.datacanvas",
        mimeType: "application/zip",
        buffer: bytes,
      });
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.getByRole("button", { name: /≋ New recipe/ }).click();
    await fresh
      .getByRole("button", { name: "Recipe list", exact: true })
      .click();
    await fresh.locator(".operation-card").first().click();
    await expect(
      fresh.getByRole("combobox", { name: "Select by", exact: true }),
    ).toHaveValue("regex");
    await expect(
      fresh.getByRole("textbox", {
        name: "Column name pattern (RE2)",
        exact: true,
      }),
    ).toHaveValue("^sales_");
    await expect(
      fresh.getByRole("combobox", { name: "Action", exact: true }),
    ).toHaveValue("drop");
    await expect(
      fresh.getByRole("checkbox", { name: "Ignore case", exact: true }),
    ).toBeChecked();
  } finally {
    await context.close();
  }
  await page
    .getByRole("textbox", { name: "Column name pattern (RE2)", exact: true })
    .fill("[");
  await page
    .getByRole("button", { name: "Preview matching columns", exact: true })
    .click();
  await expect(preview.getByRole("alert")).toContainText(
    "Invalid column-name RE2 pattern",
  );
});

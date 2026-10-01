import { test, expect } from "@playwright/test";
test("regex preview, row filtering and capture extraction use saved RE2 settings", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page
    .locator('input[accept=".csv,.tsv,.xlsx"]')
    .setInputFiles({
      name: "codes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("code\nAB-123\nnone\nCD-456\n"),
    });
  await page.getByRole("button", { name: "Import table", exact: true }).click();
  await page.getByRole("button", { name: "Build a recipe" }).click();
  await page.getByRole("button", { name: "Recipe list", exact: true }).click();
  await page.getByLabel("Search operations").fill("regular");
  await page
    .getByRole("button", { name: "Regular expression", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Pattern (RE2)", exact: true })
    .fill("([A-Z]+)-(\\d+)");
  await page.getByLabel("Pattern preview text").fill("AB-123");
  await page.getByRole("button", { name: "Test pattern", exact: true }).click();
  await expect(page.locator(".regex-preview pre")).toContainText(
    '"matched": true',
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.locator(".table-footer")).toContainText("2 rows");
  await page
    .getByRole("combobox", { name: "Pattern operation", exact: true })
    .selectOption("extract");
  await page
    .getByLabel("Capture group (0 = whole match)", { exact: true })
    .fill("2");
  await page.getByLabel("New column name", { exact: true }).fill("Number");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await expect(page.locator(".data-table")).toContainText("Number");
  await expect(page.locator(".data-table")).toContainText("123");
  await expect(page.locator(".table-footer")).toContainText("3 rows");
  await page.getByRole("textbox", { name: "Pattern (RE2)", exact: true }).fill("(?<=A)B");
  await page.getByRole("button", { name: "Test pattern", exact: true }).click();
  await expect(page.locator(".regex-preview pre")).toContainText("Invalid RE2");
});

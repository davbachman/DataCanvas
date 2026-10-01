import { test, expect } from "@playwright/test";
test("step, query isolation, mark lineage and an explicit chart selection recipe", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Step 1");
  await page.getByRole("button", { name: "Run all outputs" }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page
    .getByRole("button", { name: "SQL workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "New query", exact: true }).click();
  await page
    .getByLabel("Analytical SQL")
    .fill("SELECT count(*) AS n FROM data");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.locator(".query-editor table")).toContainText("36");
  await page
    .getByLabel("Analytical SQL")
    .fill("SELECT * FROM read_csv_auto('secret.csv')");
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not allowed");
  await page.getByRole("button", { name: /A season, by region/ }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.locator(".plot .mark-rect path").first().click();
  await expect(page.locator(".contributors")).toContainText(
    "distinct source records",
  );
  await page
    .getByRole("button", { name: "Create filter from selection" })
    .click();
  await expect(
    page.getByRole("heading", { name: /selected records/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: "After", exact: true }).click();
  await expect(page.locator(".table-footer")).toContainText("1 rows");
});
test("laptop layout, dark theme, all chart families and layers/facets render", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.screenshot({ path: "test-results/workspace-1280.png" });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.screenshot({ path: "test-results/workspace-dark-1280.png" });
  await page.getByRole("button", { name: /Monthly distributions/ }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.getByText("Facets & scales", { exact: true }).click();
  await page.getByLabel("Facet columns").selectOption("");
  await page.getByLabel("X encoding").selectOption("temperature");
  await page.getByLabel("Y encoding").selectOption("temperature");
  for (const family of [
    "scatter",
    "line",
    "histogram",
    "count",
    "bar",
    "heatmap",
  ]) {
    await page.getByLabel("Chart family").selectOption(family);
    await expect(page.locator(".plot svg")).toBeVisible();
    await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  }
  await page.getByLabel("Chart family").selectOption("scatter");
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  await page.getByLabel("Facet columns").selectOption("region");
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.screenshot({ path: "test-results/faceted-layers-1280.png" });
  expect(errors).toEqual([]);
});
test("cancel terminates a worker and a subsequent run returns current results", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page
    .locator('input[accept=".csv,.tsv,.xlsx"]')
    .setInputFiles({
      name: "cancel-test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "id,value\n" +
          Array.from({ length: 100000 }, (_, i) => `${i},${i % 100}`).join(
            "\n",
          ),
      ),
    });
  await page.getByRole("button", { name: "Import table", exact: true }).click();
  await page.getByRole("button", { name: "Run all outputs" }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .click({ force: true });
  await expect(page.locator(".statusbar")).toContainText("Canceled");
  await expect(page.locator(".result-state")).toContainText("Canceled");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await expect(page.locator(".table-footer")).toContainText("100,000");
});

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const polygons = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { country: "France" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-5, 42],
            [8, 42],
            [8, 51],
            [-5, 51],
            [-5, 42],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { country: "Japan" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [130, 30],
              [145, 30],
              [145, 45],
              [130, 45],
              [130, 30],
            ],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { country: "No data" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 0],
            [30, 0],
            [30, 10],
            [20, 10],
            [20, 0],
          ],
        ],
      },
    },
  ],
};
async function loadMap(page: any) {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page
    .locator('input[accept=".datacanvas"]')
    .setInputFiles("public/examples/mapping.datacanvas");
  await expect(page.locator(".statusbar")).toContainText("Ready");
}
test("point maps render projected world geography, support controls, lineage and exports", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await loadMap(page);
  await page
    .getByRole("button", { name: /Locations around the world/ })
    .click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  await expect(page.locator(".plot .mark-shape path").first()).toBeVisible();
  await expect(page.locator(".chart-notes")).toContainText("1 records omitted");
  await page.screenshot({
    path: `test-results/map-world-${test.info().project.name}.png`,
    fullPage: true,
  });
  for (const projection of ["mercator", "equirectangular", "equalEarth"]) {
    await page
      .getByRole("combobox", { name: "Projection", exact: true })
      .selectOption(projection);
    await expect(page.locator(".plot svg")).toBeVisible();
    await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByLabel("Map zoom (0.5–2000)")).toHaveValue("1.5");
  await page
    .getByRole("button", { name: "Reset map view", exact: true })
    .click();
  await expect(page.getByLabel("Map zoom (0.5–2000)")).toHaveValue("1");
  await expect(page.locator(".plot svg")).toBeVisible();
  await page
    .locator('.plot .mark-symbol path[aria-label*="place: Tokyo"]')
    .click();
  await expect(page.locator(".contributors")).toContainText("source records");
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await readFile((await (await saved).path())!, "utf8");
  expect(svg).toContain("Natural Earth");
  expect(svg).toContain("<path");
  expect(external).toEqual([]);
});
test("choropleth GeoJSON joins, aggregation, portable boundaries and self-contained reports", async ({
  page,
  browser,
}) => {
  await loadMap(page);
  await page.getByRole("button", { name: /Mean value by country/ }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-notes")).toContainText("Atlantis");
  await page
    .getByRole("combobox", { name: "Boundary source", exact: true })
    .selectOption("custom");
  await page
    .locator('input[accept=".geojson,.json,application/geo+json"]')
    .setInputFiles({
      name: "regions.geojson",
      mimeType: "application/geo+json",
      buffer: Buffer.from(JSON.stringify(polygons)),
    });
  await page
    .getByRole("combobox", { name: "Boundary join property", exact: true })
    .selectOption("country");
  await page
    .getByLabel("Boundary attribution / source")
    .fill("Synthetic test boundaries — CC0");
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  await expect(page.locator(".chart-notes")).toContainText(
    "2 regions have matched data",
  );
  await page
    .getByRole("button", { name: "Statistical tables", exact: true })
    .click();
  await expect(page.locator(".chart-main .data-table")).toContainText("15");
  await page
    .getByRole("combobox", {
      name: "Visible statistical transformation",
      exact: true,
    })
    .selectOption("");
  await expect(page.locator(".chart-main .error-box")).toContainText(
    "Multiple records match a region",
  );
  await page
    .getByRole("combobox", {
      name: "Visible statistical transformation",
      exact: true,
    })
    .selectOption("mean");
  await page.getByRole("button", { name: "Plot", exact: true }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Fit mapped data", exact: true })
    .click();
  await expect(page.getByLabel("Map center longitude")).not.toHaveValue("0");
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.screenshot({
    path: `test-results/map-custom-${test.info().project.name}.png`,
    fullPage: true,
  });
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const bytes = await readFile((await (await saved).path())!);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  try {
    await fresh.goto("./");
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.locator('input[accept=".datacanvas"]').setInputFiles({
      name: "maps.datacanvas",
      mimeType: "application/zip",
      buffer: bytes,
    });
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.getByRole("button", { name: /Mean value by country/ }).click();
    await expect(fresh.locator(".plot svg")).toBeVisible();
    await expect(
      fresh.getByRole("combobox", { name: "Boundary source", exact: true }),
    ).toHaveValue("custom");
    await expect(fresh.locator(".chart-notes")).toContainText(
      "Synthetic test boundaries",
    );
    await fresh.getByRole("button", { name: "Report", exact: true }).click();
    await expect(fresh.locator(".report-paper .plot svg")).toHaveCount(2);
    const htmlSaved = fresh.waitForEvent("download");
    await fresh
      .getByRole("button", { name: "Export HTML", exact: true })
      .click();
    const html = await readFile((await (await htmlSaved).path())!, "utf8");
    expect(html).toContain("Synthetic test boundaries");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script src=");
  } finally {
    await context.close();
  }
});

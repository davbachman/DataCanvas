import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
// A local synthetic PNG exercises real browser image loading/CORS/export without using public tile infrastructure in CI.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
async function open(page: any) {
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page
    .locator('input[accept=".datacanvas"]')
    .setInputFiles("public/examples/mapping.datacanvas");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page
    .getByRole("button", { name: /Locations around the world/ })
    .click();
  await expect(page.locator(".plot svg")).toBeVisible();
}
test("optional street tiles, pan/zoom, opacity, attribution, embedded exports and portable settings", async ({
  page,
  browser,
}) => {
  const requests: string[] = [];
  const mock = async (route: any) => {
    requests.push(route.request().url());
    await route.fulfill({
      contentType: "image/png",
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=604800",
      },
      body: png,
    });
  };
  await page.route("https://tile.openstreetmap.org/**", mock);
  await open(page);
  expect(requests).toEqual([]);
  await page
    .getByRole("combobox", { name: "Basemap", exact: true })
    .selectOption("openstreetmap");
  await expect(
    page.getByRole("combobox", { name: "Projection", exact: true }),
  ).toHaveValue("mercator");
  await expect(page.locator(".plot image").first()).toBeVisible();
  await expect(page.locator(".map-attribution a")).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const plot = page.locator('.plot[tabindex="0"]');
  await plot.focus();
  await page.keyboard.press("+");
  await expect(page.getByLabel("Street map zoom", { exact: true })).toHaveValue(
    "1.5",
  );
  await expect(page.locator(".plot svg")).toBeVisible();
  const box = await page.locator(".plot svg").boundingBox();
  await page.mouse.move(box!.x + 250, box!.y + 160);
  await page.mouse.down();
  await page.mouse.move(box!.x + 320, box!.y + 180, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByLabel("Map center longitude", { exact: true }),
  ).not.toHaveValue("0");
  await expect(page.locator(".plot svg")).toBeVisible();
  await page.locator(".plot svg").hover({ position: { x: 250, y: 160 } });
  await page.mouse.wheel(0, -100);
  await expect(page.getByLabel("Street map zoom", { exact: true })).toHaveValue(
    "1.9500000000000002",
  );
  await page.getByLabel("Overlay opacity", { exact: true }).fill("0.4");
  await expect(page.locator(".plot .mark-symbol path").first()).toHaveAttribute(
    "opacity",
    "0.4",
  );
  await page.getByLabel("Map center longitude", { exact: true }).fill("139.69");
  await page.getByLabel("Map center latitude", { exact: true }).fill("35.69");
  await page.getByLabel("Street map zoom", { exact: true }).fill("5000");
  await expect
    .poll(() =>
      page
        .locator(".plot image")
        .first()
        .evaluate((n) =>
          n.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
        ),
    )
    .toMatch(/\/14\//);
  await expect
    .poll(() =>
      page
        .locator('.plot .mark-symbol path[aria-label*="place: Tokyo"]')
        .evaluate((n) => {
          const m = (n as SVGGraphicsElement).transform.baseVal.consolidate()!
            .matrix;
          return [m.e, m.f].map((v) => Math.round(v * 1000) / 1000);
        }),
    )
    .toEqual([280, 170]);
  await page.screenshot({
    path: `test-results/street-tiles-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reset map view", exact: true })
    .click();
  await page
    .locator('.plot .mark-symbol path[aria-label*="place: Tokyo"]')
    .click();
  await expect(page.locator(".contributors")).toContainText("source records");
  const savedSVG = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await readFile((await (await savedSVG).path())!, "utf8");
  expect(svg).toContain("data:image/png;base64,");
  expect(svg).not.toContain('href="https://tile.openstreetmap.org');
  expect(svg).toContain("OpenStreetMap contributors");
  const savedPNG = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  expect(
    (await readFile((await (await savedPNG).path())!))
      .subarray(1, 4)
      .toString(),
  ).toBe("PNG");
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const bytes = await readFile((await (await saved).path())!);
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.route("https://tile.openstreetmap.org/**", mock);
  try {
    await fresh.goto("./");
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh.locator('input[accept=".datacanvas"]').setInputFiles({
      name: "street.datacanvas",
      mimeType: "application/zip",
      buffer: bytes,
    });
    await expect(fresh.locator(".statusbar")).toContainText("Ready");
    await fresh
      .getByRole("button", { name: /Locations around the world/ })
      .click();
    await expect(
      fresh.getByRole("combobox", { name: "Basemap", exact: true }),
    ).toHaveValue("openstreetmap");
    await expect(
      fresh.getByLabel("Overlay opacity", { exact: true }),
    ).toHaveValue("0.4");
    await fresh.getByRole("button", { name: "Report", exact: true }).click();
    await expect(fresh.locator(".report-paper .plot svg")).toHaveCount(2);
    const report = fresh.waitForEvent("download");
    await fresh
      .getByRole("button", { name: "Export HTML", exact: true })
      .click();
    const html = await readFile((await (await report).path())!, "utf8");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain('href="https://tile.openstreetmap.org');
  } finally {
    await context.close();
  }
  await page
    .getByRole("combobox", { name: "Basemap", exact: true })
    .selectOption("none");
  await expect(page.locator(".plot image")).toHaveCount(0);
  const count = requests.length;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  expect(requests.length).toBe(count);
});
test("unavailable tiles keep data visible and give a useful export error", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await open(page);
  await page
    .getByRole("combobox", { name: "Basemap", exact: true })
    .selectOption("openstreetmap");
  await expect(page.locator(".plot .mark-symbol path").first()).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Street tiles are unavailable" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  await expect(page.locator(".chart-main .error-box")).toContainText(
    "Street tiles could not be loaded",
  );
  await page
    .getByRole("combobox", { name: "Basemap", exact: true })
    .selectOption("none");
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
});

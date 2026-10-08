import { test, expect } from "@playwright/test";
import { blankProject, column } from "../../src/domain/model";
import { createSource, defaultImport } from "../../src/persistence/import";
import { packBundle } from "../../src/persistence/bundle";

test("SD band renders interval boundaries around an unfilled mean line", async ({
  page,
}) => {
  const bytes = new TextEncoder().encode(
    "month,temp\n1,0\n1,2\n2,2\n2,4\n3,1\n3,3\n",
  );
  const { source } = await createSource("Temperatures", bytes, defaultImport, [
    column("month", "integer", "month"),
    column("temp", "decimal", "temp"),
  ]);
  const project = blankProject();
  project.sources = [source];
  project.recipes = [
    {
      id: "observations",
      name: "Observations",
      inputRef: { kind: "source", id: source.id },
      operations: [],
      rowMeaning: "One temperature observation",
    },
  ];
  project.charts = [
    {
      id: "uncertainty",
      name: "Monthly temperature SD",
      inputRecipeId: "observations",
      annotations: "",
      scales: {},
      style: { width: 400, height: 300 },
      layers: [
        {
          id: "interval",
          mark: "errorband",
          x: "month",
          y: "temp",
          uncertainty: { method: "sd", multiplier: 1, confidence: 95 },
        },
      ],
    },
  ];
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "temperature-band.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(
      packBundle({ project, assets: { [source.assetRef]: bytes } }),
    ),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: /Monthly temperature SD/ }).click();
  const mean = page.locator(".plot .mark-line path");
  const band = page.locator(".plot .mark-area path");
  await expect(mean).toHaveCount(1);
  await expect(band).toHaveCount(1);
  // A filled line is an opaque triangle even though its data and SVG are valid.
  await expect(mean).toHaveCSS("fill", "none");
  await expect(mean).toHaveAttribute("stroke", "#277c6c");
  await expect(mean).toHaveAttribute("opacity", "1");
  await expect(band).toHaveAttribute("fill", "#277c6c");
  await expect(band).toHaveAttribute("opacity", "0.25");
  const paths = await page
    .locator(".plot .mark-line path, .plot .mark-area path")
    .evaluateAll((elements) =>
      elements.map((el) => ({
        type: el.parentElement!.getAttribute("class")!,
        d: el.getAttribute("d")!,
      })),
    );
  const points = (d: string) =>
    [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
  const meanPath = paths.find((p) => p.type.includes("mark-line"))!.d;
  const bandPath = paths.find((p) => p.type.includes("mark-area"))!.d;
  const linePoints = points(meanPath),
    bandPoints = points(bandPath);
  expect(linePoints).toHaveLength(3);
  expect(bandPoints).toHaveLength(6);
  expect(meanPath).not.toMatch(/z/i);
  expect(bandPath).toMatch(/z$/i);
  // Vega's nice Y domain for [-0.414..., 4.414...] is [-0.5, 4.5].
  // These checks inspect actual SVG vertices, not the statistical table or spec.
  const y = (value: number) => ((4.5 - value) / 5) * 300;
  for (const [i, value] of [1, 3, 2].entries()) {
    expect(linePoints[i][0]).toBeCloseTo(i * 200, 2);
    expect(linePoints[i][1]).toBeCloseTo(y(value), 2);
    const bounds = bandPoints
      .filter((p) => Math.abs(p[0] - linePoints[i][0]) < 0.001)
      .map((p) => p[1])
      .sort((a, b) => a - b);
    expect(bounds).toHaveLength(2);
    expect(bounds[0]).toBeCloseTo(y(value + Math.SQRT2), 2);
    expect(bounds[1]).toBeCloseTo(y(value - Math.SQRT2), 2);
  }
  await page
    .locator(".plot")
    .screenshot({
      path: `test-results/uncertainty-band-${test.info().project.name}.png`,
    });
  await page.getByLabel("Layer opacity (0–1)", { exact: true }).fill("0.4");
  await expect(band).toHaveAttribute("opacity", "0.4");
  await expect(mean).toHaveAttribute("opacity", "0.4");
  await page.getByRole("checkbox", { name: "Show point markers" }).check();
  await expect(mean).toHaveCSS("fill", "none");
  const markers = page.locator(".plot .mark-symbol path");
  await expect(markers).toHaveCount(3);
  for (const marker of await markers.all())
    await expect(marker).toHaveAttribute("fill", "#277c6c");
  // Error bars still use filled mean points, rather than inheriting line styling.
  await page
    .getByRole("combobox", { name: "Chart family", exact: true })
    .selectOption("errorbar");
  await expect(page.locator(".plot .mark-line path")).toHaveCount(0);
  await expect(markers).toHaveCount(3);
  for (const marker of await markers.all())
    await expect(marker).toHaveAttribute("fill", "#277c6c");
});

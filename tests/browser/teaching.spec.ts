import { test, expect } from "@playwright/test";
import { teachingFixture } from "../fixtures/teaching";
import { packBundle, unpackBundle } from "../../src/persistence/bundle";
import { readFile } from "node:fs/promises";
test("teaching controls, chart semantics, code coverage and save-time checklist survive reopening", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bundle = await teachingFixture();
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "teaching.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(bundle)),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("button", { name: "Code exports", exact: true }).click();
  await expect(page.locator(".teaching-panel")).toContainText(
    "frozen source snapshots",
  );
  await page
    .getByRole("button", { name: "departures · 1. Date & time", exact: true })
    .click();
  await expect(page.locator(".teaching-panel pre").first()).toContainText(
    'sql_step("steps/scheduled.sql")',
  );
  await page.getByLabel("Code language").selectOption("sql");
  await expect(page.locator(".teaching-panel pre").first()).toContainText(
    "make_timestamp",
  );
  await page.getByRole("button", { name: /Height uncertainty/ }).click();
  await expect(page.locator(".plot svg")).toBeVisible();
  await expect(page.locator(".chart-main .error-box")).toHaveCount(0);
  const color = page.getByLabel("Constant color (when unmapped)", {
    exact: true,
  });
  await color.fill("rebeccapurple");
  await color.press("Enter");
  await expect(color).toHaveValue("#663399");
  await color.fill("notacolor");
  await color.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Unknown opaque color");
  await color.fill("navy");
  await color.press("Enter");
  await page.getByRole("button", { name: "Chart blocks", exact: true }).click();
  await expect(page.locator(".chart-block-host")).toContainText("ci_normal");
  await expect(page.locator(".chart-block-host")).toContainText("errorbar");
  await page.getByRole("button", { name: /Grouped categories/ }).click();
  await page.getByRole("button", { name: "Plot", exact: true }).click();
  await expect(page.locator(".plot svg")).toContainText("C");
  await expect(
    page.getByRole("combobox", { name: "Bar stacking", exact: true }),
  ).toHaveValue("grouped");
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", {
    name: "Assignment submission checklist",
  });
  await expect(dialog).toContainText("All 2 required outputs are ready.");
  await dialog.getByRole("button", { name: "Add required output" }).click();
  await dialog.getByLabel("Required output name 3").fill("Final answer");
  await expect(dialog).toContainText("Missing required recipe “Final answer”");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save project anyway" }).click();
  const bytes = await readFile((await (await download).path())!);
  const saved = unpackBundle(new Uint8Array(bytes));
  expect(saved.project.schemaVersion).toBe(2);
  expect(saved.project.submission!.required).toHaveLength(3);
  expect(saved.project.charts[1].layers[0].constantColor).toBe("#000080");
  const context = await browser.newContext();
  try {
    const reopened = await context.newPage();
    await reopened.goto("./");
    await expect(reopened.locator(".statusbar")).toContainText("Ready");
    await reopened.locator('input[accept=".datacanvas"]').setInputFiles({
      name: "reopened.datacanvas",
      mimeType: "application/zip",
      buffer: bytes,
    });
    await expect(reopened.locator(".statusbar")).toContainText("Ready");
    await reopened.keyboard.press("Control+s");
    await expect(reopened.getByRole("dialog")).toContainText(
      "Missing required recipe “Final answer”",
    );
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});

test("visual datetime, ranking, renaming and category controls use the shared recipe model", async ({
  page,
}) => {
  const bundle = await teachingFixture();
  bundle.project.submission = undefined;
  await page.goto("./");
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.locator('input[accept=".datacanvas"]').setInputFiles({
    name: "teaching.datacanvas",
    mimeType: "application/zip",
    buffer: Buffer.from(packBundle(bundle)),
  });
  await expect(page.locator(".statusbar")).toContainText("Ready");
  await page.getByRole("checkbox", { name: "Auto preview" }).uncheck();
  await page.getByRole("button", { name: /≋ departures/ }).click();
  await page.getByRole("button", { name: "Recipe list", exact: true }).click();
  await page.locator(".operation-card").first().click();
  await expect(
    page.getByRole("combobox", { name: "Date/time operation", exact: true }),
  ).toHaveValue("construct");
  await expect(
    page.getByRole("combobox", { name: "Timestamp meaning", exact: true }),
  ).toHaveValue("wall");
  await expect(
    page.getByRole("combobox", {
      name: "Minute column (unselected = 0)",
      exact: true,
    }),
  ).toHaveValue("minute");
  await page.locator(".operation-card").nth(1).click();
  await expect(
    page.getByRole("combobox", { name: "Duration unit", exact: true }),
  ).toHaveValue("minutes");
  await page
    .getByRole("combobox", { name: "Duration unit", exact: true })
    .selectOption("hours");
  await page
    .getByRole("combobox", { name: "Duration unit", exact: true })
    .selectOption("minutes");
  await page.getByRole("button", { name: /≋ top_true/ }).click();
  await page.locator(".operation-card").first().click();
  await expect(
    page.getByRole("combobox", { name: "Ranking method", exact: true }),
  ).toHaveValue("row_number");
  await expect(
    page.getByLabel("Require at least k valid observations per group"),
  ).toBeChecked();
  await page.getByRole("button", { name: /≋ rename_weeks/ }).click();
  await page.locator(".operation-card").first().click();
  await page.getByRole("button", { name: "Preview renamed columns" }).click();
  await expect(page.locator(".regex-preview tbody")).toContainText("wk1");
  await expect(page.locator(".regex-preview tbody")).toContainText("OK");
  await page
    .getByLabel("Find pattern (RE2)", { exact: true })
    .fill("^wk[0-9]+$");
  await page.getByLabel("Replacement", { exact: true }).fill("id");
  await page.getByRole("button", { name: "Preview renamed columns" }).click();
  await expect(page.locator(".regex-preview tbody")).toContainText("collision");
  await page.getByRole("button", { name: /≋ ordered_categories/ }).click();
  await page.locator(".operation-card").first().click();
  await expect(
    page.getByRole("textbox", {
      name: "Category order (one value per line)",
      exact: true,
    }),
  ).toHaveValue("C\nA\nB");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const saved = unpackBundle(
    new Uint8Array(await readFile((await (await download).path())!)),
  );
  expect(
    saved.project.recipes.find((r) => r.id === "departures")!.operations[1]
      .params.unit,
  ).toBe("minutes");
  expect(
    saved.project.recipes.find((r) => r.id === "rename_weeks")!.operations[0]
      .params.replacement,
  ).toBe("id");
});

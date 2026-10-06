import { expect, it } from "vitest";
import { normalizeColor } from "../src/domain/colors";
import { checkSubmission } from "../src/domain/submission";
import { teachingFixture } from "./fixtures/teaching";
import { run } from "../src/headless/api";
import { captureCount, previewRegex } from "../src/compiler/regex";
import { nativeDB } from "../src/engine/native";
import { newOperation } from "../src/domain/operations";
import * as Blockly from "blockly/core";
import {
  buildChartWorkspace,
  readChartWorkspace,
} from "../src/charts/chartBlocksModel";
it("normalizes CSS color names and rejects implicit alpha or unknown names", () => {
  expect(normalizeColor(" ReBeccaPurple ")).toBe("#663399");
  expect(normalizeColor("red")).toBe("#ff0000");
  expect(normalizeColor("#abc")).toBe("#aabbcc");
  for (const color of ["unknown", "rgba(0,0,0,.5)", "transparent", "#11223344"])
    expect(() => normalizeColor(color)).toThrow("opacity");
  expect(normalizeColor("transparent", true)).toBe("transparent");
});
it("checks exact required names, duplicates, missing/failed/stale computations and drafts", async () => {
  const b = await teachingFixture(),
    r = await run(b);
  expect(checkSubmission(b.project, r).ready).toBe(true);
  b.project.submission!.required.push({ kind: "recipe", name: "Missing" });
  expect(checkSubmission(b.project, r).issues.map((i) => i.code)).toContain(
    "MISSING_OUTPUT",
  );
  b.project.submission!.required.pop();
  b.project.recipes.push({ ...b.project.recipes[0], id: "duplicate" });
  expect(checkSubmission(b.project, r).issues.map((i) => i.code)).toContain(
    "DUPLICATE_NAME",
  );
  b.project.recipes.pop();
  b.project.recipes[0].operations[0].draft = true;
  expect(checkSubmission(b.project, r).issues.map((i) => i.code)).toContain(
    "INCOMPLETE_STEP",
  );
  delete b.project.recipes[0].operations[0].draft;
  r.errors.push({
    recipeId: "departures",
    code: "EXECUTION",
    message: "failed example",
  });
  expect(checkSubmission(b.project, r).issues.map((i) => i.code)).toContain(
    "FAILED_COMPUTATION",
  );
  r.errors = [];
  b.project.charts[1].layers[0].lineWidth = 5;
  expect(checkSubmission(b.project, r).issues.map((i) => i.code)).toContain(
    "NOT_COMPUTED",
  );
  b.project.revision++;
  expect(
    checkSubmission(b.project, r).issues.filter(
      (i) => i.code === "NOT_COMPUTED",
    ),
  ).toHaveLength(2);
});
it("previews matched captures, near misses and unmatched values with RE2", async () => {
  const db = await nativeDB();
  try {
    const p = {
      ...newOperation("regex", []).params,
      action: "extract",
      pattern: "ID:\\s*(\\d+)\\s*;",
      group: 1,
    };
    expect(await previewRegex(db, p, "ID: 123 ;")).toMatchObject({
      matched: true,
      result: "123",
      captures: [
        { group: 0, value: "ID: 123 ;" },
        { group: 1, value: "123" },
      ],
    });
    for (const text of ["ID: abc ;", "No ID"])
      expect(await previewRegex(db, p, text)).toMatchObject({
        matched: false,
        result: null,
        captures: [
          { group: 0, value: null },
          { group: 1, value: null },
        ],
      });
    expect(captureCount("(?:x)(a)[()]\\((?P<num>\\d+)")).toBe(2);
    await expect(
      previewRegex(db, { ...p, pattern: "(a)\\1" }, "aa"),
    ).rejects.toThrow("Replacement captures");
  } finally {
    await db.close();
  }
});
it("round-trips grouped bars, uncertainty parameters and line styling through sequence blocks", async () => {
  const b = await teachingFixture();
  for (const chart of b.project.charts) {
    const ws = new Blockly.Workspace();
    try {
      Blockly.Events.disable();
      buildChartWorkspace(ws, {
        chart,
        columns: b.project.sources[0].columns,
        recipes: b.project.recipes,
      });
      Blockly.Events.enable();
      expect(readChartWorkspace(ws, chart)).toEqual(chart);
    } finally {
      Blockly.Events.enable();
      ws.dispose();
    }
  }
});

it("ignores regex literal quoting and POSIX classes when listing captures", () => {
  expect(captureCount(String.raw`\Q(a)\E[[:alpha:]()]([]()])`)).toBe(1);
});

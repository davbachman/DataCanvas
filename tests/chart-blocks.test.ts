import { readFile } from "node:fs/promises";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { it, expect } from "vitest";
import * as Blockly from "blockly/core";
import {
  buildChartWorkspace,
  readChartWorkspace,
} from "../src/charts/chartBlocksModel";
import { mappingExample } from "../src/map-example";
import { pieFixture } from "./fixtures/pies";
import { type Chart, column } from "../src/domain/model";
const chart: Chart = {
  id: "chart",
  name: "Totals",
  inputRecipeId: "data",
  layers: [
    {
      id: "totals",
      mark: "bar",
      x: "category",
      y: "value",
      aggregate: "sum",
      orientation: "horizontal",
      constantColor: "#123456",
      tooltip: ["category"],
    },
  ],
  scales: { yTitle: "Total value", yDomain: [0, 100] },
  annotations: "Source note",
};
function workspace(c = chart) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  buildChartWorkspace(ws, {
    chart: c,
    columns: [
      column("Category", "text", "category"),
      column("Value", "decimal", "value"),
    ],
    recipes: [],
  });
  Blockly.Events.enable();
  return ws;
}
it("round-trips chart semantics and preserves settings outside the sequence", async () => {
  const maps = await mappingExample(),
    pies = await pieFixture();
  for (const c of [chart, ...maps.project.charts, ...pies.project.charts]) {
    const ws = workspace(c);
    try {
      expect(readChartWorkspace(ws, c)).toEqual(c);
    } finally {
      ws.dispose();
    }
  }
});
it("block fields determine statistics, orientation and encodings without losing layer settings", () => {
  const ws = workspace();
  try {
    ws.getBlocksByType("dcv_statistics", false)[0].setFieldValue("bin", "MODE");
    ws.getBlocksByType("dcv_statistics", false)[0].setFieldValue("10", "WIDTH");
    ws.getBlocksByType("dcv_mark", false)[0].setFieldValue("value", "X");
    ws.getBlocksByType("dcv_orientation", false)[0].setFieldValue(
      "vertical",
      "ORIENTATION",
    );
    const next = readChartWorkspace(ws, chart);
    expect(next.layers[0]).toMatchObject({
      mark: "histogram",
      x: "value",
      binWidth: 10,
      constantColor: "#123456",
      tooltip: ["category"],
    });
    expect(next.layers[0].orientation).toBeUndefined();
    expect(next.layers[0].aggregate).toBeUndefined();
    expect(next.scales).toEqual(chart.scales);
  } finally {
    ws.dispose();
  }
});
it("disconnected and duplicate blocks fail instead of silently changing chart semantics", () => {
  const ws = workspace();
  try {
    const extra = ws.newBlock("dcv_orientation");
    expect(() => readChartWorkspace(ws, chart)).toThrow("Connect every block");
    ws.getBlocksByType("dcv_orientation", false)
      .find((b) => b !== extra)!
      .nextConnection!.connect(extra.previousConnection!);
    expect(() => readChartWorkspace(ws, chart)).toThrow("only one orientation");
    extra.dispose();
    ws.getBlocksByType("dcv_mark", false)[0].setFieldValue("pie", "MARK");
    expect(() => readChartWorkspace(ws, chart)).toThrow("Orientation blocks");
    ws.getBlocksByType("dcv_orientation", false)[0].dispose();
    expect(readChartWorkspace(ws, chart).layers[0]).toMatchObject({
      mark: "pie",
      aggregate: "sum",
      showPercent: false,
    });
  } finally {
    ws.dispose();
  }
});
it("the connected layer order controls rendering order and deleting a layer removes it", () => {
  const c = {
    ...chart,
    layers: [
      ...chart.layers,
      { ...chart.layers[0], id: "second", aggregate: "mean" },
    ],
  };
  const ws = workspace(c);
  try {
    const root = ws.getBlockById("chart_from")!,
      first = ws.getBlockById("totals")!,
      second = ws.getBlockById("second")!;
    first.previousConnection!.disconnect();
    second.previousConnection!.disconnect();
    root.nextConnection!.connect(second.previousConnection!);
    second.nextConnection!.connect(first.previousConnection!);
    expect(readChartWorkspace(ws, c).layers.map((l) => l.id)).toEqual([
      "second",
      "totals",
    ]);
    first.dispose();
    expect(readChartWorkspace(ws, c).layers.map((l) => l.id)).toEqual([
      "second",
    ]);
  } finally {
    ws.dispose();
  }
});

it("duplicated Blockly layers get stable portable IDs and retain their authored settings", async () => {
  const bundle = await mappingExample();
  const c = { ...chart, inputRecipeId: "locations_recipe" };
  const ws = workspace(c);
  try {
    const original = ws.getBlockById("totals")!;
    const duplicate = Blockly.serialization.blocks.append(
      Blockly.serialization.blocks.save(original)!,
      ws,
    );
    original.nextConnection!.connect(duplicate.previousConnection!);
    const next = readChartWorkspace(ws, c);
    expect(next.layers).toHaveLength(2);
    expect(next.layers[1].id).not.toBe(next.layers[0].id);
    expect(next.layers[1].id).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/);
    expect(next.layers[1].constantColor).toBe("#123456");
    expect(readChartWorkspace(ws, next).layers).toEqual(next.layers);
    bundle.project.charts = [next];
    bundle.project.reportItems = [];
    expect(unpackBundle(packBundle(bundle)).project.charts[0]).toEqual(next);
  } finally {
    ws.dispose();
  }
});

it("opening chart blocks preserves every bundled chart definition", async () => {
  for (const name of [
    "temperatures",
    "transactions",
    "weighting",
    "mapping",
    "bikes",
    "trees",
  ]) {
    const bundle = unpackBundle(
      new Uint8Array(await readFile(`public/examples/${name}.datacanvas`)),
    );
    for (const chart of bundle.project.charts) {
      const ws = workspace(chart);
      try {
        expect(readChartWorkspace(ws, chart)).toEqual(chart);
      } finally {
        ws.dispose();
      }
    }
  }
});

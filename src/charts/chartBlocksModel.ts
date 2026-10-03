import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import {
  type Chart,
  type Column,
  type Layer,
  type Recipe,
  CanvasError,
  uid,
} from "../domain/model";
import { canOrient, isPieMark } from "../domain/charts";
import { defaultMap, isMapMark } from "../domain/geography";

type Context = { chart: Chart; columns: Column[]; recipes: Recipe[] };
const contexts = new WeakMap<Blockly.Workspace, Context>();
const canonicalIds = new WeakMap<Blockly.Block, string>();
const fail = (message: string): never => {
  throw new CanvasError("VALIDATION", message);
};
function context(block: Blockly.Block): Context {
  const ws = block.workspace as Blockly.WorkspaceSvg;
  return contexts.get(ws.targetWorkspace || ws)!;
}
function fieldOptions(block: Blockly.Block): [string, string][] {
  const { columns, chart } = context(block);
  const known = new Map(columns.map((c) => [c.id, c.name]));
  for (const l of chart.layers)
    for (const id of [l.x, l.y, l.color, l.size, l.shape, l.detail])
      if (id && !known.has(id)) known.set(id, "Unavailable: " + id);
  return [
    ["(none)", ""],
    ...[...known].map(([id, name]): [string, string] => [name, id]),
  ];
}
const pair = (options: string[]): [string, string][] =>
  options.map((s) => [s, s]);
export function defineChartBlocks() {
  if (Blockly.Blocks.dcv_from) return;
  Blockly.setLocale(En as unknown as Record<string, string>);
  Blockly.Blocks.dcv_from = {
    init() {
      const block = this;
      this.appendDummyInput()
        .appendField("FROM RECIPE")
        .appendField(
          new Blockly.FieldDropdown(function () {
            const { recipes, chart } = context(block);
            const choices: [string, string][] = recipes.map((r) => [
              r.name,
              r.id,
            ]);
            if (!recipes.some((r) => r.id === chart.inputRecipeId))
              choices.push(["Unavailable recipe", chart.inputRecipeId]);
            return choices;
          }),
          "RECIPE",
        );
      this.setNextStatement(true, "ChartLayer");
      this.setColour("#356658");
      this.setDeletable(false);
      this.setMovable(false);
    },
  };
  Blockly.Blocks.dcv_layer = {
    init() {
      this.appendDummyInput().appendField("LAYER");
      this.appendStatementInput("SEQUENCE").setCheck("ChartStatistics");
      this.setPreviousStatement(true, "ChartLayer");
      this.setNextStatement(true, "ChartLayer");
      this.setColour("#657aa0");
      this.setTooltip(
        "Layers draw in sequence, from back to front. Drag to reorder; duplicate or delete using the block menu.",
      );
    },
  };
  Blockly.Blocks.dcv_statistics = {
    init() {
      this.appendDummyInput()
        .appendField("STATISTICS")
        .appendField(
          new Blockly.FieldDropdown([
            ["Explicit values", "explicit"],
            ["Count by first field", "count"],
            ["Sum by first field", "sum"],
            ["Mean by first field", "mean"],
            ["Median by first field", "median"],
            ["Minimum by first field", "min"],
            ["Maximum by first field", "max"],
            ["Bin first field and count", "bin"],
            ["Box quartiles", "quartiles"],
          ]),
          "MODE",
        );
      this.appendDummyInput("BIN")
        .appendField("bin width")
        .appendField(new Blockly.FieldNumber(5, Number.MIN_VALUE), "WIDTH");
      this.setPreviousStatement(true, "ChartStatistics");
      this.setNextStatement(true, "ChartMark");
      this.setColour("#8172a4");
      this.setDeletable(false);
      this.setMovable(false);
      this.setTooltip(
        "Statistics use the complete input. Counts and bins need only the first field. Other summaries group by first field and mapped grouping fields.",
      );
    },
  };
  Blockly.Blocks.dcv_mark = {
    init() {
      this.appendDummyInput()
        .appendField("DRAW")
        .appendField(
          new Blockly.FieldDropdown(
            pair([
              "bar",
              "scatter",
              "line",
              "box",
              "heatmap",
              "rule",
              "pie",
              "donut",
              "map_points",
              "choropleth",
            ]),
          ),
          "MARK",
        );
      this.appendDummyInput("FIELDS")
        .appendField("first field")
        .appendField(new Blockly.FieldDropdown(() => fieldOptions(this)), "X")
        .appendField("second / value")
        .appendField(new Blockly.FieldDropdown(() => fieldOptions(this)), "Y");
      this.appendDummyInput("REFERENCE")
        .appendField("reference value")
        .appendField(new Blockly.FieldNumber(0), "CONSTANT");
      this.setPreviousStatement(true, "ChartMark");
      this.setNextStatement(true, "ChartAppearance");
      this.setColour("#277c6c");
      this.setDeletable(false);
      this.setMovable(false);
    },
  };
  Blockly.Blocks.dcv_orientation = {
    init() {
      this.appendDummyInput()
        .appendField("ORIENTATION")
        .appendField(
          new Blockly.FieldDropdown(pair(["vertical", "horizontal"])),
          "ORIENTATION",
        );
      this.setPreviousStatement(true, "ChartAppearance");
      this.setNextStatement(true, "ChartAppearance");
      this.setColour("#aa7942");
      this.setTooltip(
        "For bars, counts and histograms. Changing orientation preserves statistics and contributors.",
      );
    },
  };
  Blockly.Blocks.dcv_encoding = {
    init() {
      this.appendDummyInput()
        .appendField("ENCODE")
        .appendField(
          new Blockly.FieldDropdown(pair(["color", "size", "shape", "detail"])),
          "CHANNEL",
        )
        .appendField("by")
        .appendField(
          new Blockly.FieldDropdown(() => fieldOptions(this)),
          "FIELD",
        );
      this.setPreviousStatement(true, "ChartAppearance");
      this.setNextStatement(true, "ChartAppearance");
      this.setColour("#657aa0");
    },
  };
  Blockly.Blocks.dcv_labels = {
    init() {
      this.appendDummyInput()
        .appendField("PERCENTAGE LABELS")
        .appendField(new Blockly.FieldCheckbox("TRUE"), "SHOW");
      this.setPreviousStatement(true, "ChartAppearance");
      this.setNextStatement(true, "ChartAppearance");
      this.setColour("#aa7942");
      this.setTooltip(
        "Pie and donut percentages; small slices keep their percentages in tooltips.",
      );
    },
  };
}
export function layerMode(layer: Layer) {
  return layer.mark === "histogram"
    ? "bin"
    : layer.mark === "count"
      ? "count"
      : layer.mark === "box"
        ? "quartiles"
        : ["bar", "heatmap", "choropleth", "pie", "donut"].includes(layer.mark)
          ? layer.aggregate || "explicit"
          : "explicit";
}
function newBlock(
  ws: Blockly.Workspace,
  type: string,
  id?: string,
  fields: Record<string, string> = {},
) {
  const block = ws.newBlock(type, id);
  for (const [key, value] of Object.entries(fields))
    block.setFieldValue(value, key);
  return block;
}
export function addChartLayer(ws: Blockly.Workspace, layer: Layer) {
  const group = newBlock(ws, "dcv_layer", layer.id);
  // Store unmapped settings for duplicated layers; connected fields remain authoritative.
  group.data = JSON.stringify(layer);
  const stat = newBlock(ws, "dcv_statistics", undefined, {
    MODE: layerMode(layer),
    WIDTH: String(layer.binWidth || 5),
  });
  const mark = newBlock(ws, "dcv_mark", undefined, {
    MARK: ["histogram", "count"].includes(layer.mark) ? "bar" : layer.mark,
    X: layer.x || "",
    Y: layer.y || "",
    CONSTANT: String(layer.constant ?? 0),
  });
  group.getInput("SEQUENCE")!.connection!.connect(stat.previousConnection!);
  stat.nextConnection!.connect(mark.previousConnection!);
  let previous = mark;
  const append = (type: string, fields: Record<string, string>) => {
    const b = newBlock(ws, type, undefined, fields);
    previous.nextConnection!.connect(b.previousConnection!);
    previous = b;
  };
  if (canOrient(layer.mark))
    append("dcv_orientation", { ORIENTATION: layer.orientation || "vertical" });
  if (
    !isPieMark(layer.mark) &&
    layer.mark !== "choropleth" &&
    layer.mark !== "rule"
  )
    for (const channel of ["color", "size", "shape", "detail"] as const)
      if (layer[channel])
        append("dcv_encoding", { CHANNEL: channel, FIELD: layer[channel]! });
  if (isPieMark(layer.mark) && layer.showPercent !== false)
    append("dcv_labels", { SHOW: "TRUE" });
  return group;
}
export function setChartBlockContext(ws: Blockly.Workspace, ctx: Context) {
  contexts.set(ws, ctx);
}
export function buildChartWorkspace(ws: Blockly.Workspace, ctx: Context) {
  defineChartBlocks();
  contexts.set(ws, ctx);
  ws.clear();
  const root = newBlock(ws, "dcv_from", "chart_from", {
    RECIPE: ctx.chart.inputRecipeId,
  });
  let previous = root;
  for (const layer of ctx.chart.layers) {
    const block = addChartLayer(ws, layer);
    previous.nextConnection!.connect(block.previousConnection!);
    previous = block;
  }
  return root;
}
export function readChartWorkspace(ws: Blockly.Workspace, chart: Chart): Chart {
  const roots = ws.getTopBlocks(false);
  if (roots.length !== 1 || roots[0].type !== "dcv_from")
    fail(
      "Connect every block to the chart sequence, or delete unused blocks. The last complete chart is still shown.",
    );
  const root = roots[0];
  const layers: Layer[] = [];
  let group = root.getNextBlock();
  while (group) {
    if (group.type !== "dcv_layer") fail("Expected a layer block.");
    let layerId = group.id;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(layerId)) {
      layerId = canonicalIds.get(group) || uid("layer");
      canonicalIds.set(group, layerId);
    }
    const saved =
      chart.layers.find((l) => l.id === layerId) ||
      (group.data ? JSON.parse(group.data) : {});
    const stat = group.getInputTargetBlock("SEQUENCE"),
      draw = stat?.getNextBlock();
    if (stat?.type !== "dcv_statistics" || draw?.type !== "dcv_mark")
      fail("Each layer needs Statistics followed by Draw.");
    const mode = stat!.getFieldValue("MODE"),
      kind = draw!.getFieldValue("MARK");
    let mark: Layer["mark"] = kind;
    if (kind === "bar" && mode === "bin") mark = "histogram";
    if (kind === "bar" && mode === "count")
      mark =
        saved.mark === "bar" && saved.aggregate === "count" ? "bar" : "count";
    const allowed =
      kind === "bar"
        ? ["explicit", "count", "sum", "mean", "median", "min", "max", "bin"]
        : isPieMark(kind)
          ? ["explicit", "count", "sum"]
          : ["heatmap", "choropleth"].includes(kind)
            ? ["explicit", "count", "sum", "mean", "median", "min", "max"]
            : kind === "box"
              ? ["quartiles"]
              : ["explicit"];
    if (!allowed.includes(mode))
      fail(
        `The ${kind} mark does not support ${mode} statistics. Change Statistics or Draw to complete the sequence.`,
      );
    const layer: Layer = {
      ...saved,
      id: layerId,
      mark,
      x: draw!.getFieldValue("X") || undefined,
      y: draw!.getFieldValue("Y") || undefined,
      aggregate:
        ["explicit", "bin", "quartiles"].includes(mode) || mark === "count"
          ? undefined
          : mode,
    };
    if (mark === "histogram") {
      const width = Number(stat!.getFieldValue("WIDTH"));
      layer.binWidth =
        width === 5 && saved.binWidth === undefined ? undefined : width;
    }
    if (mark === "rule") {
      const constant = Number(draw!.getFieldValue("CONSTANT"));
      layer.constant =
        constant === 0 && saved.constant === undefined ? undefined : constant;
    }
    if (canOrient(mark)) layer.orientation = undefined;
    if (isPieMark(mark)) layer.showPercent = false;
    if (!isPieMark(mark) && mark !== "choropleth" && mark !== "rule")
      for (const k of ["color", "size", "shape", "detail"] as const)
        layer[k] = undefined;
    const seen = new Set<string>();
    let b = draw!.getNextBlock();
    while (b) {
      const key =
        b.type === "dcv_encoding" ? b.getFieldValue("CHANNEL") : b.type;
      if (seen.has(key))
        fail("Use only one " + key.replace("dcv_", "") + " block per layer.");
      seen.add(key);
      if (b.type === "dcv_orientation") {
        if (!canOrient(mark))
          fail("Orientation blocks apply to bars, counts and histograms.");
        layer.orientation =
          b.getFieldValue("ORIENTATION") === "horizontal"
            ? "horizontal"
            : saved.orientation === "vertical"
              ? "vertical"
              : undefined;
      } else if (b.type === "dcv_labels") {
        if (!isPieMark(mark))
          fail("Percentage labels apply to pie and donut charts.");
        layer.showPercent =
          b.getFieldValue("SHOW") === "TRUE"
            ? saved.showPercent === undefined
              ? undefined
              : true
            : false;
      } else if (b.type === "dcv_encoding") {
        if (isPieMark(mark) || mark === "choropleth" || mark === "rule")
          fail(
            "Pie and choropleth colors are determined by their category or value; rules use a constant color. Remove the encoding block.",
          );
        layer[b.getFieldValue("CHANNEL") as "color"] =
          b.getFieldValue("FIELD") || undefined;
      } else fail("Unrecognized chart appearance block.");
      b = b.getNextBlock();
    }
    layers.push(layer);
    group = group.getNextBlock();
  }
  if (!layers.length || layers.length > 10)
    fail("A chart needs between one and ten connected layers.");
  if (layers.some((l) => isPieMark(l.mark)) && layers.length !== 1)
    fail("Pie and donut charts require exactly one layer.");
  if (
    layers.some((l) => isMapMark(l.mark)) &&
    layers.some((l) => !isMapMark(l.mark))
  )
    fail("Map layers cannot be mixed with other chart families.");
  const mapping = layers.some((l) => isMapMark(l.mark));
  const circular = layers.some((l) => isPieMark(l.mark));
  return {
    ...chart,
    inputRecipeId: root.getFieldValue("RECIPE"),
    layers,
    ...(mapping ? { map: chart.map || defaultMap() } : {}),
    ...(mapping || circular
      ? { facetRow: undefined, facetColumn: undefined }
      : {}),
  };
}

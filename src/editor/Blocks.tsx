import { useEffect, useRef } from "react";
import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import {
  type Recipe,
  type Operation,
  type Column,
  type Expr,
} from "../domain/model";
import { registry, type OpKind } from "../domain/operations";
import type { StepResult } from "../engine/core";
Blockly.setLocale(En as unknown as Record<string, string>);
let currentColumns: Column[] = [];
function defineBlocks() {
  if (Blockly.Blocks.dc_from) return;
  Blockly.Blocks.dc_from = {
    init() {
      this.appendDummyInput()
        .appendField("FROM")
        .appendField(new Blockly.FieldLabelSerializable(""), "SOURCE");
      this.setNextStatement(true, "Table");
      this.setColour("#356658");
      this.setDeletable(false);
      this.setMovable(false);
      this.setTooltip(
        "Every recipe starts with a source or another named recipe.",
      );
    },
  };
  for (const [kind, def] of Object.entries(registry))
    Blockly.Blocks["dc_" + kind] = {
      init() {
        this.appendDummyInput()
          .appendField(def.label.toUpperCase())
          .appendField(new Blockly.FieldLabelSerializable(""), "SUMMARY");
        if (["filter", "derive"].includes(kind))
          this.appendValueInput("EXPR")
            .setCheck(
              kind === "filter"
                ? "Boolean"
                : ["Number", "String", "Boolean", "Date"],
            )
            .appendField(kind === "filter" ? "where" : "value");
        this.appendDummyInput().appendField(
          new Blockly.FieldLabelSerializable(""),
          "DETAIL",
        );
        this.appendDummyInput().appendField(
          new Blockly.FieldLabelSerializable("Not evaluated"),
          "COUNT",
        );
        this.setPreviousStatement(true, "Table");
        this.setNextStatement(true, "Table");
        this.setColour(def.color);
        this.setTooltip(def.description);
      },
    };
  Blockly.Blocks.dc_column = {
    init() {
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(() =>
          currentColumns.length
            ? currentColumns.map((c) => [c.name, c.id])
            : [["Choose column", ""]],
        ),
        "COLUMN",
      );
      this.setOutput(true, ["Number", "String", "Boolean", "Date"]);
      this.setColour("#657aa0");
    },
  };
  Blockly.Blocks.dc_literal = {
    init() {
      this.appendDummyInput().appendField(
        new Blockly.FieldTextInput("0"),
        "VALUE",
      );
      this.setOutput(true, ["Number", "String", "Boolean", "Date"]);
      this.setColour("#85877b");
    },
  };
  Blockly.Blocks.dc_binary = {
    init() {
      this.appendValueInput("LEFT");
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(
          [
            "+",
            "-",
            "*",
            "/",
            "%",
            ">",
            ">=",
            "<",
            "<=",
            "=",
            "!=",
            "and",
            "or",
            "contains",
            "starts",
            "in",
          ].map((v) => [v, v]),
        ),
        "OP",
      );
      this.appendValueInput("RIGHT");
      this.setInputsInline(true);
      this.setOutput(true, ["Boolean", "Number"]);
      this.setColour("#7165a8");
    },
  };
  Blockly.Blocks.dc_unary = {
    init() {
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(
          ["is_missing", "not_missing", "not", "negate"].map((v) => [
            v.replaceAll("_", " "),
            v,
          ]),
        ),
        "OP",
      );
      this.appendValueInput("ARG");
      this.setOutput(true, ["Boolean", "Number"]);
      this.setColour("#7165a8");
    },
  };
  Blockly.Blocks.dc_expression = {
    init() {
      this.appendDummyInput().appendField(
        new Blockly.FieldLabelSerializable(""),
        "LABEL",
      );
      this.setOutput(true, ["Boolean", "Number", "String", "Date"]);
      this.setColour("#7165a8");
      this.setTooltip("Edit this function or conditional in Configure.");
    },
  };
}
function addExpression(
  workspace: Blockly.WorkspaceSvg,
  expr: Expr,
): Blockly.BlockSvg {
  const block = workspace.newBlock(
    ["column", "literal", "binary", "unary"].includes(expr.kind)
      ? "dc_" + expr.kind
      : "dc_expression",
  );
  block.data = JSON.stringify(expr);
  if (expr.kind === "column") {
    const field = block.getField("COLUMN") as Blockly.FieldDropdown;
    if (!currentColumns.some((c) => c.id === expr.columnId))
      field.setOptions([
        ...currentColumns.map((c) => [c.name, c.id] as [string, string]),
        ["Missing: " + expr.columnId, expr.columnId],
      ]);
    block.setFieldValue(expr.columnId, "COLUMN");
    const storage = currentColumns.find((c) => c.id === expr.columnId)?.type;
    block.setOutput(
      true,
      storage === "boolean"
        ? "Boolean"
        : storage === "integer" || storage === "decimal"
          ? "Number"
          : storage === "date" || storage === "timestamp"
            ? "Date"
            : "String",
    );
  } else if (expr.kind === "literal") {
    block.setFieldValue(
      expr.value === null ? "null" : JSON.stringify(expr.value),
      "VALUE",
    );
    block.setOutput(
      true,
      expr.value === null
        ? ["Number", "String", "Boolean", "Date"]
        : typeof expr.value === "boolean"
          ? "Boolean"
          : typeof expr.value === "number"
            ? "Number"
            : typeof expr.value === "object"
              ? expr.value.type === "date" || expr.value.type === "timestamp"
                ? "Date"
                : "Number"
              : "String",
    );
  } else if (expr.kind === "binary") {
    block.setFieldValue(expr.op, "OP");
    block
      .getInput("LEFT")!
      .connection!.connect(
        addExpression(workspace, expr.left).outputConnection!,
      );
    block
      .getInput("RIGHT")!
      .connection!.connect(
        addExpression(workspace, expr.right).outputConnection!,
      );
    const boolean = !["+", "-", "*", "/", "%"].includes(expr.op);
    block.setOutput(true, boolean ? "Boolean" : "Number");
    if (["and", "or"].includes(expr.op)) {
      block.getInput("LEFT")!.setCheck("Boolean");
      block.getInput("RIGHT")!.setCheck("Boolean");
    }
  } else if (expr.kind === "unary") {
    block.setFieldValue(expr.op, "OP");
    block
      .getInput("ARG")!
      .connection!.connect(
        addExpression(workspace, expr.arg).outputConnection!,
      );
  } else
    block.setFieldValue(
      expr.kind === "call" ? expr.fn + "(…)" : "if … then … otherwise …",
      "LABEL",
    );
  block.initSvg();
  block.render();
  return block;
}
function readExpression(b: Blockly.Block | null): Expr | null {
  if (!b) return null;
  const original = b.data ? JSON.parse(b.data) : null;
  if (b.type === "dc_column")
    return { kind: "column", columnId: b.getFieldValue("COLUMN") };
  if (b.type === "dc_literal") {
    let value;
    try {
      value = JSON.parse(b.getFieldValue("VALUE"));
    } catch {
      value = b.getFieldValue("VALUE");
    }
    return { kind: "literal", value };
  }
  if (b.type === "dc_binary") {
    const left = readExpression(b.getInputTargetBlock("LEFT")),
      right = readExpression(b.getInputTargetBlock("RIGHT"));
    return left && right
      ? { kind: "binary", op: b.getFieldValue("OP"), left, right }
      : null;
  }
  if (b.type === "dc_unary") {
    const arg = readExpression(b.getInputTargetBlock("ARG"));
    return arg ? { kind: "unary", op: b.getFieldValue("OP"), arg } : null;
  }
  return original;
}
export function operationDetail(o: Operation, columns: Column[]) {
  const name = (id: string) => columns.find((c) => c.id === id)?.name || id;
  const p = o.params;
  switch (o.kind) {
    case "datetime":
      return `${p.action} → ${p.name}${p.action === "add" ? " · " + p.unit : ""}`;
    case "rank":
      return `${p.method} by ${p.groups.map(name).join(", ") || "all rows"} → ${p.name}`;
    case "topk":
      return `first ${p.k} · ${p.method} · by ${p.groups.map(name).join(", ") || "all rows"}`;
    case "rename_many":
      return `${p.action} “${p.search}” · ${p.columns.length} labels`;
    case "categories":
      return `${name(p.columnId)} · ${p.role} · ${p.levels.length} ordered levels`;
    case "select":
      return p.selection === "regex"
        ? `${p.mode} names /${p.pattern}/${p.ignoreCase ? "i" : ""}`
        : `${p.mode} ${p.columns.map(name).join(", ")}`;
    case "regex":
      return `${p.action} ${name(p.columnId)} /${p.pattern}/${p.ignoreCase ? "i" : ""}`;
    case "text":
      return `${p.action} ${name(p.columnId)}`;
    case "parse":
      return `${name(p.columnId)} → ${p.type}`;
    case "longer":
      return `${p.columns.map(name).join(", ")} → ${p.namesTo}, ${p.valuesTo}`;
    case "summarize":
      return `by ${p.groups.length ? p.groups.map(name).join(", ") : "all rows"} · ${p.aggregates.map((a: any) => a.fn + " → " + a.name).join(", ")}`;
    case "derive":
      return `create ${p.name}`;
    case "join":
      return `${p.how} · ${p.relationship}`;
    case "check":
      return `${p.severity} · ${p.test.replaceAll("_", " ")}`;
    case "filter":
      return "retain true · report false and unknown";
    case "sample":
      return `${p.size}${p.fraction ? " fraction" : " rows"} · seed ${p.seed}`;
    case "rename":
      return `${name(p.columnId)} → ${p.name}`;
    default:
      return (
        p.columns?.map(name).join(", ") || "Configure settings in the inspector"
      );
  }
}
export function Blocks({
  recipe,
  columns,
  sourceName,
  steps,
  selected,
  onSelect,
  onChange,
}: {
  recipe: Recipe;
  columns: Column[];
  sourceName: string;
  steps: StepResult[];
  selected: string;
  onSelect: (id: string) => void;
  onChange: (ops: Operation[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    workspace = useRef<Blockly.WorkspaceSvg | null>(null),
    syncing = useRef(false);
  const callbacks = useRef({ onSelect, onChange, recipe });
  callbacks.current = { onSelect, onChange, recipe };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    defineBlocks();
    const ws = Blockly.inject(host.current!, {
      renderer: "geras",
      grid: { spacing: 24, length: 1, colour: "#dce2dc", snap: true },
      zoom: {
        controls: true,
        wheel: false,
        startScale: 1,
        minScale: 0.5,
        maxScale: 1.5,
      },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: false,
      sounds: false,
      comments: true,
      collapse: true,
      disable: false,
      media: import.meta.env.BASE_URL + "blockly/",
    });
    workspace.current = ws;
    const resize = new ResizeObserver(() => Blockly.svgResize(ws));
    resize.observe(host.current!);
    ws.addChangeListener((event) => {
      if (syncing.current) return;
      if (event.type === Blockly.Events.SELECTED) {
        const id = (event as Blockly.Events.Selected).newElementId;
        const block = id ? ws.getBlockById(id) : null;
        if (block) {
          let root = block;
          while (
            root.getParent() &&
            !root.type.startsWith("dc_from") &&
            !registry[root.type.replace("dc_", "") as OpKind]
          )
            root = root.getParent()!;
          if (registry[root.type.replace("dc_", "") as OpKind])
            callbacks.current.onSelect(root.id);
        }
        return;
      }
      if (
        !(
          [
            Blockly.Events.BLOCK_MOVE,
            Blockly.Events.BLOCK_DELETE,
            Blockly.Events.BLOCK_CHANGE,
          ] as string[]
        ).includes(event.type)
      )
        return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (syncing.current || ws.isDragging()) return;
        const old = callbacks.current.recipe.operations;
        const from = ws.getBlocksByType("dc_from", false)[0];
        const ops: Operation[] = [];
        let b = from?.getNextBlock();
        while (b) {
          const operation = old.find((o) => o.id === b!.id);
          if (operation) {
            const expression = readExpression(b.getInputTargetBlock("EXPR"));
            ops.push({
              ...operation,
              note: b.getCommentText() || undefined,
              collapsed: b.isCollapsed(),
              ...(["filter", "derive"].includes(operation.kind)
                ? {
                    params: {
                      ...operation.params,
                      ...(expression ? { expression } : {}),
                    },
                    draft: !expression || operation.draft,
                  }
                : {}),
            });
          }
          b = b.getNextBlock();
        }
        for (const operation of old)
          if (
            ws.getBlockById(operation.id) &&
            !ops.some((o) => o.id === operation.id)
          )
            ops.push(operation);
        if (JSON.stringify(ops) !== JSON.stringify(old))
          callbacks.current.onChange(ops);
      }, 250);
    });
    return () => {
      clearTimeout(timer.current);
      resize.disconnect();
      ws.dispose();
      workspace.current = null;
    };
  }, []);
  useEffect(() => {
    const ws = workspace.current;
    if (!ws) return;
    currentColumns = columns;
    syncing.current = true;
    Blockly.Events.disable();
    const scrollX = ws.scrollX,
      scrollY = ws.scrollY;
    ws.clear();
    const start = ws.newBlock("dc_from", "recipe_from");
    start.setFieldValue(sourceName, "SOURCE");
    start.initSvg();
    start.render();
    start.moveBy(36, 30);
    let previous = start;
    for (const [i, o] of recipe.operations.entries()) {
      const block = ws.newBlock("dc_" + o.kind, o.id);
      block.setFieldValue(String(i + 1).padStart(2, "0"), "SUMMARY");
      block.setFieldValue(
        operationDetail(o, steps[i]?.before.columns || columns).slice(0, 85),
        "DETAIL",
      );
      const step = steps.find((s) => s.operationId === o.id);
      block.setFieldValue(
        o.draft
          ? "Draft · complete settings"
          : step?.error
            ? "! " + step.error.slice(0, 70)
            : step?.after
              ? `${step.before.rowCount.toLocaleString()} → ${step.after.rowCount.toLocaleString()} rows · ${step.after.columns.length} columns`
              : "Not evaluated · run to inspect",
        "COUNT",
      );
      if (["filter", "derive"].includes(o.kind) && o.params.expression)
        block
          .getInput("EXPR")!
          .connection!.connect(
            addExpression(ws, o.params.expression).outputConnection!,
          );
      if (o.note) block.setCommentText(o.note);
      block.initSvg();
      block.render();
      previous.nextConnection!.connect(block.previousConnection!);
      block.setCollapsed(!!o.collapsed);
      previous = block;
    }
    ws.scroll(scrollX, scrollY);
    Blockly.Events.enable();
    syncing.current = false;
  }, [
    JSON.stringify(recipe),
    sourceName,
    JSON.stringify(
      steps.map((s) => ({
        id: s.operationId,
        before: s.before.rowCount,
        after: s.after?.rowCount,
        columns: s.after?.columns,
        error: s.error,
      })),
    ),
    JSON.stringify(columns),
  ]);
  useEffect(() => {
    const ws = workspace.current;
    if (ws && selected && ws.getBlockById(selected))
      ws.highlightBlock(selected);
  }, [selected]);
  return (
    <div
      ref={host}
      className="blockly-host"
      aria-label="Snapping recipe workspace"
    />
  );
}

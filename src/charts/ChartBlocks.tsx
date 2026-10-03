import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import type { Chart, Column, Recipe } from "../domain/model";
import { uid } from "../domain/model";
import {
  addChartLayer,
  buildChartWorkspace,
  readChartWorkspace,
  setChartBlockContext,
} from "./chartBlocksModel";

export function ChartBlocks({
  chart,
  columns,
  recipes,
  onChange,
}: {
  chart: Chart;
  columns: Column[];
  recipes: Recipe[];
  onChange: (chart: Chart) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const latest = useRef({ chart, columns, recipes, onChange });
  latest.current = { chart, columns, recipes, onChange };
  const syncing = useRef(false),
    emitted = useRef(""),
    fieldContext = useRef("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visibility = (ws: Blockly.WorkspaceSvg) => {
    for (const b of ws.getAllBlocks(false)) {
      const name =
        b.type === "dcv_statistics"
          ? "BIN"
          : b.type === "dcv_mark"
            ? "REFERENCE"
            : undefined;
      if (!name) continue;
      const input = b.getInput(name);
      const visible =
        name === "BIN"
          ? b.getFieldValue("MODE") === "bin"
          : b.getFieldValue("MARK") === "rule";
      if (input && input.isVisible() !== visible) {
        input.setVisible(visible);
        b.render();
      }
    }
  };
  const render = (ws: Blockly.WorkspaceSvg) => {
    for (const b of ws.getAllBlocks(false)) b.initSvg();
    visibility(ws);
    ws.render();
    Blockly.svgResize(ws);
  };
  const rebuild = () => {
    const ws = workspace.current;
    if (!ws) return;
    syncing.current = true;
    Blockly.Events.disable();
    try {
      const root = buildChartWorkspace(ws, latest.current);
      render(ws);
      (root as Blockly.BlockSvg).moveBy(25, 25);
      emitted.current = JSON.stringify(latest.current.chart);
      fieldContext.current = JSON.stringify([
        latest.current.columns,
        latest.current.recipes.map((r) => [r.id, r.name]),
      ]);
      setError("");
    } finally {
      Blockly.Events.enable();
      syncing.current = false;
    }
  };
  useEffect(() => {
    const ws = Blockly.inject(host.current!, {
      renderer: "geras",
      media: import.meta.env.BASE_URL + "blockly/",
      sounds: false,
      grid: { spacing: 24, length: 1, colour: "#dce2dc", snap: true },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, startScale: 1.1, minScale: 0.4, maxScale: 1.5 },
      trashcan: true,
    });
    workspace.current = ws;
    rebuild();
    const resize = new ResizeObserver(() => Blockly.svgResize(ws));
    resize.observe(host.current!);
    const commit = () => {
      if (syncing.current) return;
      if (ws.isDragging()) {
        timer.current = setTimeout(commit, 150);
        return;
      }
      try {
        visibility(ws);
        const next = readChartWorkspace(ws, latest.current.chart);
        setError("");
        if (JSON.stringify(next) !== JSON.stringify(latest.current.chart)) {
          emitted.current = JSON.stringify(next);
          latest.current.onChange(next);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    };
    ws.addChangeListener((event) => {
      if (syncing.current || event.isUiEvent) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(commit, 200);
    });
    return () => {
      clearTimeout(timer.current);
      resize.disconnect();
      ws.dispose();
      workspace.current = null;
    };
  }, []);
  useEffect(() => {
    if (workspace.current)
      setChartBlockContext(workspace.current, latest.current);
    if (
      emitted.current !== JSON.stringify(chart) ||
      fieldContext.current !==
        JSON.stringify([columns, recipes.map((r) => [r.id, r.name])])
    )
      rebuild();
  }, [chart, columns, recipes]);
  const add = (kind: string) => {
    const ws = workspace.current;
    if (!ws) return;
    Blockly.Events.setGroup(true);
    try {
      const selected = Blockly.common.getSelected();
      let group =
        selected instanceof Blockly.BlockSvg && selected.workspace === ws
          ? selected
          : null;
      while (group && group.type !== "dcv_layer") group = group.getParent();
      if (kind === "layer") {
        const layer = addChartLayer(ws, {
          id: uid("layer"),
          mark: "bar",
          x: columns[0]?.id,
          y: columns.find((c) => c.role === "quantitative")?.id,
        });
        let last = ws.getBlockById("chart_from")!;
        while (last.getNextBlock()) last = last.getNextBlock()!;
        last.nextConnection!.connect(layer.previousConnection!);
      } else {
        const b = ws.newBlock("dcv_" + kind);
        // A selected layer receives the new block; otherwise use the first layer.
        group ||= ws.getBlockById("chart_from")?.getNextBlock() || null;
        let tail = group?.getInputTargetBlock("SEQUENCE");
        while (tail?.getNextBlock()) tail = tail.getNextBlock();
        if (tail?.nextConnection)
          tail.nextConnection.connect(b.previousConnection!);
        else b.moveBy(40, 40);
      }
      render(ws);
    } finally {
      Blockly.Events.setGroup(false);
    }
  };
  return (
    <section className="chart-sequence" aria-label="Chart sequence editor">
      <p>
        From recipe → statistics → draw → appearance. Counts and bins use the
        first field; other statistics use the value field. Map fields are
        longitude/latitude or region/value. Reorder layers to change drawing
        order. Advanced settings stay in the controls.
      </p>
      <div className="inline chart-block-toolbar">
        {["layer", "orientation", "encoding", "labels"].map((kind) => (
          <button key={kind} onClick={() => add(kind)}>
            Add {kind} block
          </button>
        ))}
        <button onClick={rebuild}>Reset blocks to saved chart</button>
      </div>
      {error && (
        <p role="alert" className="warning-box">
          {error}
        </p>
      )}
      <div
        ref={host}
        className="chart-block-host"
        aria-label="Snapping chart workspace"
      />
      <p className="chart-block-help">
        Edit block fields directly. Use the block menu to duplicate or delete
        layers and appearance blocks. Disconnected or incompatible blocks do not
        replace the last complete chart. The app’s Undo/Redo restores committed
        changes.
      </p>
    </section>
  );
}

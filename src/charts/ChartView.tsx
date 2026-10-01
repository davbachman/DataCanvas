import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import { Download, Plus } from "lucide-react";
import type { Chart, Column, Project, Layer } from "../domain/model";
import { uid, type Expr } from "../domain/model";
import {
  markPredicate,
  brushPredicate,
  brushedContributors,
} from "./selection";
import type { ResolvedChart } from "./resolve";
import { WorkerClient } from "../engine/client";
import { Field, Text, Select, ColumnSelect, Multi } from "../editor/Configure";
import { DataTable } from "../editor/DataTable";
import { download } from "../persistence/bundle";
export function Plot({
  resolved,
  onMark,
  onView,
  onBrush,
}: {
  resolved: ResolvedChart;
  onMark?: (layer: number, index: number) => void;
  onView?: (view: any) => void;
  onBrush?: (ranges: Record<string, any>) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let view: any;
    embed(container.current!, resolved.spec as any, {
      actions: false,
      renderer: "svg",
    })
      .then((result) => {
        view = result.view;
        if (disposed) {
          view.finalize();
          return;
        }
        onView?.(view);
        view.addEventListener("click", (_: unknown, item: any) => {
          if (item?.datum?._record !== undefined)
            onMark?.(item.datum._layer, item.datum._record);
        });
        if (
          resolved.authored.layers.length === 1 &&
          ["scatter", "line"].includes(resolved.authored.layers[0].mark) &&
          !resolved.authored.facetRow &&
          !resolved.authored.facetColumn
        )
          view.addSignalListener("brush", (_: string, value: any) =>
            onBrush?.(value),
          );
        setError("");
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
      view?.finalize();
    };
  }, [resolved]);
  return (
    <>
      {error && <p className="error-box">{error}</p>}
      <div className="plot" ref={container} />
    </>
  );
}
export function ChartView({
  chart,
  onChange,
  columns,
  project,
  client,
  revision,
  onContributors,
  onExtract,
  onCreateFilter,
}: {
  chart: Chart;
  onChange: (c: Chart) => void;
  columns: Column[];
  project: Project;
  client: WorkerClient;
  revision: number;
  onContributors: (ids: string[]) => void;
  onExtract: (c: Chart) => void;
  onCreateFilter: (c: Chart, expression: Expr) => void;
}) {
  const [resolved, setResolved] = useState<ResolvedChart>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Plot"),
    [busy, setBusy] = useState(true);
  const view = useRef<any>(null);
  const [selection, setSelection] = useState<Expr | null>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setResolved(undefined);
    setSelection(null);
    client
      .request("chart", { chart })
      .then((r) => {
        if (active) {
          setResolved(r);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [chart, revision]);
  const setLayer = (index: number, key: string, value: any) =>
    onChange({
      ...chart,
      layers: chart.layers.map((l, i) =>
        i === index ? { ...l, [key]: value } : l,
      ),
    });
  const scale = (key: string, value: any) =>
    onChange({ ...chart, scales: { ...chart.scales, [key]: value } });
  return (
    <div className="chart-layout">
      <section className="chart-main">
        <div className="editor-heading">
          <div>
            <div className="eyebrow">Chart studio · full-data statistics</div>
            <h2>{chart.name}</h2>
          </div>
          <div className="segmented">
            {["Plot", "Statistical tables", "Specification"].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {busy && (
          <p className="progress-text">
            Resolving chart from the complete table…
          </p>
        )}
        {error && <p className="error-box">{error}</p>}
        {resolved && (
          <>
            {tab === "Plot" ? (
              <>
                <div className="plot-card">
                  <Plot
                    resolved={resolved}
                    onView={(v) => (view.current = v)}
                    onBrush={(ranges) => {
                      const predicate = brushPredicate(ranges, columns);
                      setSelection(predicate);
                      if (predicate && resolved.tables[0])
                        onContributors(
                          brushedContributors(ranges, resolved.tables[0]),
                        );
                    }}
                    onMark={(layer, index) => {
                      const table = resolved.tables.find(
                        (t) => t.id === chart.layers[layer].id,
                      );
                      if (table) {
                        onContributors(table.lineage[index]);
                        setSelection(
                          markPredicate(chart, layer, table.rows[index]),
                        );
                      }
                    }}
                  />
                </div>
                <div className="chart-caption">
                  <span>
                    Click a mark to inspect contributors. Drag in a scatter/line
                    plot to brush.
                  </span>
                  <div className="inline">
                    <button
                      disabled={!selection}
                      onClick={() =>
                        selection && onCreateFilter(chart, selection)
                      }
                    >
                      Create filter from selection
                    </button>
                    {["svg", "png"].map((format) => (
                      <button
                        key={format}
                        onClick={async () => {
                          const url = await view.current?.toImageURL(format);
                          if (url) {
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = chart.name + "." + format;
                            a.click();
                          }
                        }}
                      >
                        <Download size={14} />
                        {format.toUpperCase()}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        download(
                          chart.name + ".json",
                          JSON.stringify(chart, null, 2),
                          "application/json",
                        )
                      }
                    >
                      Editable spec
                    </button>
                  </div>
                </div>
              </>
            ) : tab === "Statistical tables" ? (
              resolved.tables.map((t) => (
                <div key={t.id}>
                  <h3>
                    {chart.layers.find((l) => l.id === t.id)?.mark}{" "}
                    transformation
                  </h3>
                  <DataTable
                    table={t}
                    onSelect={(i) => onContributors(t.lineage[i])}
                  />
                </div>
              ))
            ) : (
              <pre>{JSON.stringify(resolved.spec, null, 2)}</pre>
            )}
            <div className="chart-notes">
              {resolved.notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          </>
        )}
      </section>
      <aside className="chart-config">
        <Text
          label="Chart name"
          value={chart.name}
          onChange={(name) => onChange({ ...chart, name })}
        />
        <Select
          label="Input recipe"
          value={chart.inputRecipeId}
          options={project.recipes.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(inputRecipeId) => onChange({ ...chart, inputRecipeId })}
        />
        {chart.layers.map((layer, i) => (
          <fieldset className="subform" key={layer.id}>
            <legend>Layer {i + 1}</legend>
            <Select
              label="Chart family"
              value={layer.mark}
              options={[
                "scatter",
                "line",
                "bar",
                "count",
                "histogram",
                "box",
                "heatmap",
                "rule",
              ]}
              onChange={(v) => setLayer(i, "mark", v)}
            />
            {layer.mark === "rule" ? (
              <Text
                label="Reference value"
                type="number"
                value={layer.constant ?? 0}
                onChange={(v) => setLayer(i, "constant", v)}
              />
            ) : (
              <>
                <ColumnSelect
                  label="X encoding"
                  value={layer.x || ""}
                  columns={columns}
                  onChange={(v) => setLayer(i, "x", v)}
                />
                {!["count", "histogram"].includes(layer.mark) && (
                  <ColumnSelect
                    label="Y encoding"
                    value={layer.y || ""}
                    columns={columns}
                    onChange={(v) => setLayer(i, "y", v)}
                  />
                )}
                <ColumnSelect
                  label="Color field"
                  value={layer.color || ""}
                  columns={columns}
                  optional
                  onChange={(v) => setLayer(i, "color", v || undefined)}
                />
                <details>
                  <summary>More encodings</summary>
                  <Multi
                    label="Tooltip fields"
                    columns={columns}
                    value={layer.tooltip || columns.map((c) => c.id)}
                    onChange={(v) => setLayer(i, "tooltip", v)}
                  />
                  {(["size", "shape", "detail"] as const).map((k) => (
                    <ColumnSelect
                      key={k}
                      label={`${k} field`}
                      value={layer[k] || ""}
                      columns={columns}
                      optional
                      onChange={(v) => setLayer(i, k, v || undefined)}
                    />
                  ))}
                </details>
                {layer.mark === "histogram" && (
                  <Text
                    label="Bin width · [start, end)"
                    type="number"
                    value={layer.binWidth || 5}
                    onChange={(v) => setLayer(i, "binWidth", v)}
                  />
                )}{" "}
                {["bar", "heatmap"].includes(layer.mark) && (
                  <Select
                    label="Visible statistical transformation"
                    value={layer.aggregate || ""}
                    options={[
                      { value: "", label: "Explicit values (no aggregation)" },
                      "count",
                      "sum",
                      "mean",
                      "median",
                      "min",
                      "max",
                    ]}
                    onChange={(v) => setLayer(i, "aggregate", v || undefined)}
                  />
                )}
              </>
            )}
            <Text
              label="Constant color (when unmapped)"
              type="color"
              value={layer.constantColor || "#277c6c"}
              onChange={(v) => setLayer(i, "constantColor", v)}
            />
            <Text
              label="Constant mark size (when unmapped)"
              type="number"
              value={layer.constantSize || 65}
              onChange={(v) => setLayer(i, "constantSize", v)}
            />
            {chart.layers.length > 1 && (
              <button
                onClick={() =>
                  onChange({
                    ...chart,
                    layers: chart.layers.filter((_, j) => j !== i),
                  })
                }
              >
                Remove layer
              </button>
            )}
          </fieldset>
        ))}
        <button
          onClick={() =>
            onChange({
              ...chart,
              layers: [
                ...chart.layers,
                { id: uid("layer"), mark: "rule", constant: 0 },
              ],
            })
          }
        >
          <Plus size={14} />
          Add layer
        </button>
        <details>
          <summary>Facets & scales</summary>
          <ColumnSelect
            label="Facet rows"
            value={chart.facetRow || ""}
            columns={columns}
            optional
            onChange={(v) => onChange({ ...chart, facetRow: v || undefined })}
          />
          <ColumnSelect
            label="Facet columns"
            value={chart.facetColumn || ""}
            columns={columns}
            optional
            onChange={(v) =>
              onChange({ ...chart, facetColumn: v || undefined })
            }
          />
          {["xLog", "yLog", "zero"].map((k) => (
            <label className="check" key={k}>
              <input
                type="checkbox"
                checked={
                  k === "zero"
                    ? chart.scales.zero !== false
                    : !!(chart.scales as any)[k]
                }
                onChange={(e) => scale(k, e.target.checked)}
              />
              {k === "zero"
                ? "Zero baseline"
                : k === "xLog"
                  ? "Logarithmic x"
                  : "Logarithmic y"}
            </label>
          ))}
          {(["xTitle", "yTitle"] as const).map((k) => (
            <Text
              key={k}
              label={
                k === "xTitle" ? "X axis title / units" : "Y axis title / units"
              }
              value={chart.scales[k] || ""}
              onChange={(v) => scale(k, v)}
            />
          ))}
          {(["xDomain", "yDomain"] as const).map((k) => (
            <Text
              key={k}
              label={`${k[0].toUpperCase()} domain (min,max; blank = auto)`}
              value={chart.scales[k]?.join(",") || ""}
              onChange={(v) => {
                const a = v.split(",").map(Number);
                if (!v) scale(k, undefined);
                else if (a.length === 2 && a.every(Number.isFinite))
                  scale(k, a);
              }}
            />
          ))}
        </details>
        <Field label="Caption / limitations">
          <textarea
            value={chart.annotations}
            onChange={(e) =>
              onChange({ ...chart, annotations: e.target.value })
            }
          />
        </Field>
        <button onClick={() => onExtract(chart)}>
          Extract transformation as recipe
        </button>
      </aside>
    </div>
  );
}

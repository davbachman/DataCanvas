import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Download, Plus } from "lucide-react";
import type { Project, ReportItem } from "../domain/model";
import { uid } from "../domain/model";
import { WorkerClient } from "../engine/client";
import type { TableResult, RunResult } from "../engine/core";
import { displayValue } from "../engine/core";
import type { ResolvedChart } from "../charts/resolve";
import { Plot } from "../charts/ChartView";
import { DataTable } from "./DataTable";
import { Select, Field } from "./Configure";
import { download } from "../persistence/bundle";
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function Report({
  project,
  client,
  result,
  onChange,
  onError,
}: {
  project: Project;
  client: WorkerClient;
  result?: RunResult;
  onChange: (items: ReportItem[]) => void;
  onError: (s: string) => void;
}) {
  const [charts, setCharts] = useState<Record<string, ResolvedChart>>({});
  useEffect(() => {
    let active = true;
    setCharts({});
    for (const c of project.charts)
      client
        .request("chart", { chart: c })
        .then(
          (r) => active && setCharts((current) => ({ ...current, [c.id]: r })),
        )
        .catch((e) => onError(e.message));
    return () => {
      active = false;
    };
  }, [project.charts, result]);
  const update = (id: string, patch: Partial<ReportItem>) =>
    onChange(
      project.reportItems.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const move = (index: number, offset: number) => {
    const items = [...project.reportItems];
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    onChange(items);
  };
  async function exportReport() {
    try {
      const { View, parse } = await import("vega"),
        { compile } = await import("vega-lite");
      const sections: string[] = [];
      for (const item of project.reportItems) {
        let content = "";
        if (item.kind === "chart") {
          const c = charts[item.refId!];
          if (!c)
            throw new Error(
              "A linked chart has no current result. Run all recipes before exporting.",
            );
          const view = new View(parse(compile(c.spec as any).spec), {
            renderer: "none",
          });
          content = await view.toSVG();
          view.finalize();
          content += c.notes
            .map((n) => `<p class="note">${escape(n)}</p>`)
            .join("");
        }
        if (item.kind === "table") {
          const t = result?.tables[item.refId!];
          if (!t)
            throw new Error(
              "A linked table has no current result. Run all before exporting.",
            );
          content = `<table><thead><tr>${t.columns.map((c) => `<th>${escape(c.name)}</th>`).join("")}</tr></thead><tbody>${t.rows
            .slice(0, 100)
            .map(
              (r) =>
                `<tr>${t.columns.map((c) => `<td>${escape(displayValue(r[c.id]))}</td>`).join("")}</tr>`,
            )
            .join(
              "",
            )}</tbody></table><p>Showing ${Math.min(t.rows.length, 100)} of ${t.rowCount} rows.</p>`;
        }
        const review =
          item.kind === "text" &&
          item.evidenceIds?.length &&
          (item.reviewRevision ?? 0) < project.revision;
        sections.push(
          `<section>${review ? '<p class="review">Evidence changed — written claim needs review.</p>' : ""}${content}<p>${escape(item.text).replaceAll("\n", "<br>")}</p></section>`,
        );
      }
      const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(project.title)} — Data Canvas report</title><style>body{font:16px/1.65 system-ui;color:#233d34;max-width:900px;margin:60px auto;padding:24px}h1{font-size:40px}section{margin:36px 0;break-inside:avoid}svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}pre{white-space:pre-wrap;font-size:12px}.note{font-size:12px;color:#556}.review{color:#924e19}@media print{body{margin:0}section{break-inside:avoid}}</style><header><small>DATA CANVAS · REPRODUCIBLE EXPLORATION</small><h1>${escape(project.title)}</h1><p>Project ${escape(project.projectId)} · revision ${project.revision} · semantic version ${escape(project.semanticVersion)}</p></header>${sections.join("")}<h2>Sources & attribution</h2>${project.sources.map((s) => `<p><strong>${escape(s.name)}</strong>: ${escape(s.attribution)}<br>One row represents: ${escape(s.rowMeaning)}<br>SHA-256: ${escape(s.fingerprint)}</p>`).join("")}<h2>Reproducible operations</h2>${project.recipes.map((r) => `<h3>${escape(r.name)}</h3><ol>${r.operations.map((o) => `<li>${escape(o.kind)}${o.note ? " — " + escape(o.note) : ""}<pre>${escape(JSON.stringify(o.params, null, 2))}</pre></li>`).join("")}</ol>`).join("")}<p>Generated locally with Data Canvas. The .datacanvas project is the editable analysis.</p></html>`;
      download(project.title + " report.html", html, "text/html");
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <section className="report-editor">
      <div className="editor-heading">
        <div>
          <div className="eyebrow">From analysis to explanation</div>
          <h2>Your evidence, in your words.</h2>
        </div>
        <button className="primary" onClick={exportReport}>
          <Download size={16} />
          Export HTML
        </button>
      </div>
      <article className="report-paper">
        <div className="eyebrow">DATA CANVAS / RESEARCH NOTES</div>
        <h1>{project.title}</h1>
        <p className="muted">
          Live figures. Traceable evidence. Authored conclusions.
        </p>
        {project.reportItems.map((item, index) => (
          <section className="report-item" key={item.id}>
            <div className="report-item-tools">
              <span>
                {String(index + 1).padStart(2, "0")} / {item.kind}
              </span>
              <button
                aria-label="Move item up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                aria-label="Move item down"
                disabled={index === project.reportItems.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                aria-label="Delete report item"
                onClick={() =>
                  onChange(project.reportItems.filter((i) => i.id !== item.id))
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            {item.kind === "text" ? (
              <>
                {!!item.evidenceIds?.length &&
                  (item.reviewRevision ?? 0) < project.revision && (
                    <div className="warning-box">
                      Supporting data changed. Review this claim.
                      <button
                        onClick={() =>
                          update(item.id, { reviewRevision: project.revision })
                        }
                      >
                        Mark reviewed
                      </button>
                    </div>
                  )}
                <Select
                  label="Linked evidence"
                  value={item.evidenceIds?.[0] || ""}
                  onChange={(v) =>
                    update(item.id, {
                      evidenceIds: v ? [v] : [],
                      reviewRevision: project.revision,
                    })
                  }
                  options={[
                    { value: "", label: "No evidence linked" },
                    ...project.recipes.map((r) => ({
                      value: r.id,
                      label: r.name,
                    })),
                    ...project.charts.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </>
            ) : (
              <>
                <Select
                  label={
                    item.kind === "chart" ? "Linked chart" : "Linked table"
                  }
                  value={item.refId || ""}
                  options={(item.kind === "chart"
                    ? project.charts
                    : project.recipes
                  ).map((o) => ({ value: o.id, label: o.name }))}
                  onChange={(v) => update(item.id, { refId: v })}
                />
                {item.kind === "chart" ? (
                  charts[item.refId!] ? (
                    <Plot resolved={charts[item.refId!]} />
                  ) : (
                    <p className="muted">
                      Run the supporting recipe to refresh this figure.
                    </p>
                  )
                ) : (
                  <DataTable table={result?.tables[item.refId!]} compact />
                )}
              </>
            )}
            <textarea
              aria-label={item.kind === "text" ? "Report text" : "Caption"}
              className="report-text"
              rows={item.kind === "text" ? 4 : 2}
              value={item.text}
              placeholder={
                item.kind === "text"
                  ? "What does the evidence support?"
                  : "Caption and limitations…"
              }
              onChange={(e) => update(item.id, { text: e.target.value })}
            />
          </section>
        ))}
        <div className="report-add">
          {(["text", "chart", "table"] as const).map((kind) => (
            <button
              key={kind}
              onClick={() =>
                onChange([
                  ...project.reportItems,
                  {
                    id: uid("report"),
                    kind,
                    text: "",
                    ...(kind === "text"
                      ? {}
                      : {
                          refId:
                            kind === "chart"
                              ? project.charts[0]?.id
                              : project.recipes[0]?.id,
                        }),
                  },
                ])
              }
            >
              <Plus size={14} />
              {kind === "text"
                ? "Written note"
                : kind === "chart"
                  ? "Linked chart"
                  : "Linked table"}
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

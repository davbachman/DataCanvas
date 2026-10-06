import { useEffect, useState } from "react";
import type { Project } from "../domain/model";
import type { RunResult } from "../engine/core";
import {
  checkSubmission,
  type SubmissionReport,
  type SubmissionSettings,
} from "../domain/submission";
import type { WorkerClient } from "../engine/client";
export function SubmissionChecklist({
  project,
  result,
  client,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  project: Project;
  result?: RunResult;
  client: WorkerClient;
  onChange: (settings: SubmissionSettings) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const settings = project.submission || { enabled: false, required: [] };
  const [report, setReport] = useState<SubmissionReport>(),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setReport(undefined);
    (async () => {
      const checked = result
        ? ({ ...result, charts: [], errors: [...result.errors] } as RunResult)
        : undefined;
      if (checked && checked.revision === project.revision && settings.enabled)
        for (const chart of project.charts.filter((c) =>
          settings.required.some(
            (r) => r.kind === "chart" && r.name === c.name,
          ),
        )) {
          try {
            checked.charts!.push(await client.request("chart", { chart }));
          } catch (e) {
            checked.errors.push({
              recipeId: chart.inputRecipeId,
              code: "CHART",
              message: `Chart “${chart.name}”: ${(e as Error).message}`,
            });
          }
        }
      if (active) {
        setReport(checkSubmission(project, checked));
        setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [project, result, client, retry]);
  return (
    <div className="modal-backdrop">
      <section
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Assignment submission checklist"
      >
        <h2>Assignment submission checklist</h2>
        <p>
          Optional checks for named outputs, incomplete steps, and failed
          computations. Names are exact and case-sensitive. This checks project
          completeness; it does not grade answers.
        </p>
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              onChange({ ...settings, enabled: e.target.checked })
            }
          />{" "}
          Check before saving a portable project
        </label>
        {settings.required.map((r, i) => (
          <div className="checklist-row" key={i}>
            <select
              aria-label={`Required output type ${i + 1}`}
              value={r.kind}
              onChange={(e) =>
                onChange({
                  ...settings,
                  required: settings.required.map((v, j) =>
                    j === i ? { ...v, kind: e.target.value as any } : v,
                  ),
                })
              }
            >
              <option value="recipe">Recipe</option>
              <option value="chart">Chart</option>
            </select>
            <input
              aria-label={`Required output name ${i + 1}`}
              value={r.name}
              placeholder="Exact output name"
              onChange={(e) =>
                onChange({
                  ...settings,
                  required: settings.required.map((v, j) =>
                    j === i ? { ...v, name: e.target.value } : v,
                  ),
                })
              }
            />
            <button
              aria-label={`Remove requirement ${i + 1}`}
              onClick={() =>
                onChange({
                  ...settings,
                  required: settings.required.filter((_, j) => i !== j),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onChange({
              ...settings,
              required: [...settings.required, { kind: "recipe", name: "" }],
            })
          }
        >
          Add required output
        </button>
        <div role="status">
          {busy ? (
            "Checking current outputs…"
          ) : !report?.enabled ? (
            "Checklist disabled."
          ) : report.ready ? (
            `All ${report.checkedOutputs} required outputs are ready.`
          ) : (
            <ul>
              {report.issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
        <p>
          Run all outputs after editing recipe steps. This dialog computes
          required charts from the current recipe results. Incomplete work can
          always be saved and finished later. Recovery drafts are saved
          independently.
        </p>
        <div className="toolbar">
          <button onClick={() => setRetry((v) => v + 1)} disabled={busy}>
            Check again
          </button>
          <button onClick={onClose}>Close</button>
          {saving && (
            <button className="primary" disabled={busy} onClick={onSave}>
              {report?.ready ? "Save portable project" : "Save project anyway"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

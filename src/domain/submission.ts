import { normalizeColor } from "./colors";
import { chartStyleSchema } from "./chartStyle";
import type { Project } from "./model";
import type { RunResult } from "../engine/core";
import { validateOperation } from "./operations";
export interface SubmissionSettings {
  enabled: boolean;
  required: { kind: "recipe" | "chart"; name: string }[];
}
export interface SubmissionReport {
  enabled: boolean;
  ready: boolean;
  issues: { code: string; message: string; id?: string }[];
  checkedOutputs: number;
}
/** Structural and computation checks only. No grading, answers, or expected data values. */
export function checkSubmission(
  project: Project,
  result?: RunResult,
): SubmissionReport {
  const config = project.submission,
    issues: SubmissionReport["issues"] = [];
  if (!config?.enabled)
    return { enabled: false, ready: true, issues, checkedOutputs: 0 };
  const add = (code: string, message: string, id?: string) =>
    issues.push({ code, message, id });
  const fresh = result?.revision === project.revision ? result : undefined;
  const seen = new Set<string>();
  for (const requirement of config.required) {
    const { kind, name } = requirement,
      key = kind + ":" + name;
    if (!name.trim()) {
      add("EMPTY_NAME", "Enter a name for every required output.");
      continue;
    }
    if (seen.has(key))
      add(
        "DUPLICATE_REQUIREMENT",
        `The checklist repeats required ${kind} “${name}”.`,
      );
    seen.add(key);
    const outputs = (
      kind === "recipe" ? project.recipes : project.charts
    ).filter((o) => o.name === name);
    if (!outputs.length)
      add("MISSING_OUTPUT", `Missing required ${kind} “${name}”.`);
    if (outputs.length > 1)
      add(
        "DUPLICATE_NAME",
        `Multiple ${kind} outputs are named “${name}”; give each required output a unique name.`,
      );
    for (const output of outputs) {
      const complete =
        kind === "recipe"
          ? fresh?.tables[output.id] &&
            (fresh.steps[output.id]?.length || 0) ===
              (output as Project["recipes"][number]).operations.length &&
            (fresh.steps[output.id] || []).every((s) => !!s.after && !s.error)
          : fresh?.charts?.some(
              (c: any) =>
                c.id === output.id &&
                JSON.stringify(c.authored) ===
                  JSON.stringify({
                    ...output,
                    style: (output as any).style
                      ? chartStyleSchema.parse((output as any).style)
                      : undefined,
                    layers: (output as any).layers.map((l: any) => ({
                      ...l,
                      constantColor: l.constantColor
                        ? normalizeColor(l.constantColor)
                        : undefined,
                    })),
                  }),
            );
      // Chart comparison uses normalized saved values too; callers resolve the current chart before checking.
      if (!complete)
        add(
          "NOT_COMPUTED",
          `Required ${kind} “${name}” has no complete current computation. Run all outputs and check again.`,
          output.id,
        );
    }
  }
  for (const r of project.recipes)
    for (const op of r.operations)
      try {
        validateOperation(op);
      } catch (e) {
        add("INCOMPLETE_STEP", `${r.name}: ${(e as Error).message}`, op.id);
      }
  for (const error of fresh?.errors || [])
    add(
      "FAILED_COMPUTATION",
      error.message,
      error.operationId || error.recipeId,
    );
  return {
    enabled: true,
    ready: issues.length === 0,
    issues,
    checkedOutputs: config.required.length,
  };
}

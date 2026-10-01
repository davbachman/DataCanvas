import { WorkerClient } from "./engine/client";
import { unpackBundle, packBundle } from "./persistence/bundle";
import { validateBundle, type RunOptions, type RunResult } from "./engine/core";
import type { Bundle } from "./domain/model";
export const DataCanvas = {
  apiVersion: 1,
  load: unpackBundle,
  save: packBundle,
  validate: validateBundle,
  async run(bundle: Bundle, options: RunOptions = {}, signal?: AbortSignal) {
    validateBundle(bundle);
    const client = new WorkerClient();
    const cancel = () => client.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) throw new Error("Canceled");
      const result: RunResult = await client.request("run", {
        bundle,
        options,
      });
      result.charts = [];
      for (const chart of bundle.project.charts.filter(
        (c) => !options.outputIds || options.outputIds.includes(c.id),
      )) {
        try {
          result.charts.push(await client.request("chart", { chart }));
        } catch (e) {
          result.errors.push({
            recipeId: chart.inputRecipeId,
            code: "EXECUTION",
            message: (e as Error).message,
          });
          result.status = "failed";
        }
      }
      return result;
    } finally {
      signal?.removeEventListener("abort", cancel);
      client.dispose();
    }
  },
};
declare global {
  interface Window {
    DataCanvas: typeof DataCanvas;
  }
}
window.DataCanvas = DataCanvas;

import { previewRegex, matchColumnNames } from "../compiler/regex";
import { wasmDB } from "./wasm";
import { Engine } from "./core";
import { resolveChart } from "../charts/resolve";
import { executeQuery, compareTables } from "./queries";
let engine: Engine | null = null;
let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(() => handle(event));
};
async function handle({ data }: MessageEvent) {
  const { id, generation, kind } = data;
  try {
    let result: any;
    if (kind === "run") {
      if (!engine) engine = new Engine(await wasmDB(), wasmDB);
      result = await engine.run(data.bundle, {
        ...data.options,
        onProgress: (message) =>
          postMessage({ id, generation, progress: message }),
      });
    } else if (kind === "regexPreview") {
      if (!engine) engine = new Engine(await wasmDB(), wasmDB);
      result = await previewRegex(engine.db, data.params, data.sample);
    } else if (kind === "columnRegexPreview") {
      if (!engine) engine = new Engine(await wasmDB(), wasmDB);
      result = await matchColumnNames(engine.db, data.columns, data.params);
    } else if (!engine) throw new Error("Run a recipe first");
    else if (kind === "chart") result = await resolveChart(engine, data.chart);
    else if (kind === "distribution")
      result = await engine.distribution(data.tableId, data.columnId);
    else if (kind === "table") result = await engine.fullTable(data.tableId);
    else if (kind === "query") {
      const query = await executeQuery(engine, data.query);
      result = {
        ...query,
        ...(data.compareId
          ? {
              comparison: compareTables(
                await engine.fullTable(data.compareId),
                query,
                data.tolerance ?? 1e-9,
                data.ordered ?? false,
              ),
            }
          : {}),
      };
    }
    postMessage({ id, generation, result });
  } catch (e) {
    postMessage({
      id,
      generation,
      error: (e as Error).message,
      code: (e as any).code || "EXECUTION",
    });
  }
}

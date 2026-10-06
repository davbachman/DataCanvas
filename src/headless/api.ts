import { checkSubmission } from "../domain/submission";
import { readFile } from "node:fs/promises";
import { unpackBundle } from "../persistence/bundle";
import { Engine, validateBundle, type RunOptions } from "../engine/core";
import { nativeDB } from "../engine/native";
import {
  type Bundle,
  CanvasError,
  dependencies,
  type ImportSpec,
} from "../domain/model";
import { fingerprint, parseAsset } from "../persistence/import";
import { resolveChart } from "../charts/resolve";
export const API_VERSION = 1;
export async function load(path: string) {
  return unpackBundle(new Uint8Array(await readFile(path)));
}
export const inspect = (bundle: Bundle) => ({
  apiVersion: API_VERSION,
  projectId: bundle.project.projectId,
  sources: bundle.project.sources.map((s) => ({
    id: s.id,
    name: s.name,
    columns: s.columns,
  })),
  recipes: bundle.project.recipes.map((r) => ({
    id: r.id,
    name: r.name,
    dependencies: dependencies(r),
  })),
  charts: bundle.project.charts.map((c) => ({
    id: c.id,
    name: c.name,
    inputRecipeId: c.inputRecipeId,
    layers: c.layers,
  })),
  queries: bundle.project.queries,
});
export interface SourceOverride {
  sourceId: string;
  path: string;
  columnMapping: Record<string, string>;
  importSpec?: ImportSpec;
}
export async function replaceSources(
  original: Bundle,
  overrides: SourceOverride[],
) {
  const bundle = structuredClone(original);
  for (const replacement of overrides) {
    const source = bundle.project.sources.find(
      (s) => s.id === replacement.sourceId,
    );
    if (!source)
      throw new CanvasError(
        "SOURCE",
        `Unknown source override ${replacement.sourceId}`,
      );
    const bytes = new Uint8Array(await readFile(replacement.path));
    const spec = replacement.importSpec || source.importSpec;
    const parsed = parseAsset(bytes, spec);
    const nextColumns = parsed.headers.map((name) => {
      const id = replacement.columnMapping[name];
      const previous = source.columns.find((c) => c.id === id);
      if (!previous)
        throw new CanvasError(
          "SCHEMA",
          `Override field ${name} needs an explicit mapping to a saved column ID.`,
        );
      return { ...previous, name };
    });
    if (
      new Set(nextColumns.map((c) => c.id)).size !== source.columns.length ||
      nextColumns.length !== source.columns.length
    )
      throw new CanvasError(
        "SCHEMA",
        "Source override must map every established column exactly once",
      );
    source.columns = nextColumns;
    source.fingerprint = await fingerprint(bytes);
    source.importSpec = spec;
    bundle.assets[source.assetRef] = bytes;
  }
  return bundle;
}
export async function run(
  bundle: Bundle,
  options: RunOptions & {
    memory?: string;
    sourceOverrides?: SourceOverride[];
  } = {},
) {
  validateBundle(bundle);
  const input = options.sourceOverrides
    ? await replaceSources(bundle, options.sourceOverrides)
    : bundle;
  const db = await nativeDB(options.memory);
  try {
    const engine = new Engine(db, () => nativeDB(options.memory));
    const result = await engine.run(input, {
      maxOutputRows: options.maxOutputRows ?? 1000000,
      ...options,
      previewRows: Math.min(options.previewRows ?? 100, 100),
    });
    for (const recipe of input.project.recipes)
      if (
        result.tables[recipe.id] &&
        (!options.outputIds || options.outputIds.includes(recipe.id))
      )
        result.tables[recipe.id] = await engine.fullTable(
          recipe.id,
          options.maxOutputRows ?? 1000000,
        );
    result.sourceOverrides = options.sourceOverrides || [];
    result.charts = [];
    for (const chart of input.project.charts.filter(
      (c) => !options.outputIds || options.outputIds.includes(c.id),
    )) {
      try {
        result.charts.push(await resolveChart(engine, chart));
      } catch (e) {
        result.status = "failed";
        result.errors.push({
          recipeId: chart.inputRecipeId,
          code: (e as any).code || "EXECUTION",
          message: `Chart ${chart.id}: ${(e as Error).message}`,
        });
      }
    }
    result.submission = checkSubmission(input.project, result);
    return result;
  } finally {
    await db.close();
  }
}

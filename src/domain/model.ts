import { mapSettingsSchema, type MapSettings } from "./geography";
import { z } from "zod";
export const SEMANTIC_VERSION = "1.0.0";
export type Storage =
  "text" | "boolean" | "integer" | "decimal" | "date" | "timestamp";
export type Role =
  "nominal" | "ordinal" | "quantitative" | "temporal" | "identifier";
export interface Column {
  id: string;
  name: string;
  type: Storage;
  role: Role;
  units?: string;
  description?: string;
  levels?: string[];
}
export type Value =
  | null
  | string
  | number
  | boolean
  | { type: "integer" | "decimal" | "date" | "timestamp"; value: string };
export type Expr =
  | { kind: "column"; columnId: string }
  | { kind: "literal"; value: Value }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "unary"; op: string; arg: Expr }
  | { kind: "call"; fn: string; args: Expr[] }
  | { kind: "conditional"; when: Expr; then: Expr; otherwise: Expr };
export type Ref = { kind: "source" | "recipe"; id: string };
export interface Operation {
  id: string;
  kind: string;
  version: 1 | 2;
  params: Record<string, any>;
  note?: string;
  draft?: boolean;
  collapsed?: boolean;
}
export interface ImportSpec {
  format: "csv" | "tsv" | "xlsx";
  delimiter: string;
  quote: string;
  headerRow: number;
  missingTokens: string[];
  sheet?: string;
  malformedPolicy: "retain" | "exclude";
  timezone: "UTC";
}
export interface Source {
  id: string;
  name: string;
  assetRef: string;
  fingerprint: string;
  importSpec: ImportSpec;
  columns: Column[];
  rowMeaning: string;
  attribution: string;
}
export interface Recipe {
  id: string;
  name: string;
  inputRef: Ref;
  operations: Operation[];
  rowMeaning: string;
}
export interface Layer {
  id: string;
  mark:
    | "scatter"
    | "line"
    | "bar"
    | "count"
    | "histogram"
    | "box"
    | "heatmap"
    | "rule"
    | "map_points"
    | "choropleth"
    | "pie"
    | "donut";
  x?: string;
  x2?: string;
  y?: string;
  color?: string;
  size?: string;
  shape?: string;
  detail?: string;
  tooltip?: string[];
  aggregate?: string;
  binWidth?: number;
  constant?: number;
  constantColor?: string;
  constantSize?: number;
  showPercent?: boolean;
}
export interface Chart {
  id: string;
  name: string;
  inputRecipeId: string;
  layers: Layer[];
  map?: MapSettings;
  facetRow?: string;
  facetColumn?: string;
  scales: {
    xLog?: boolean;
    yLog?: boolean;
    zero?: boolean;
    xTitle?: string;
    yTitle?: string;
    xDomain?: number[];
    yDomain?: number[];
  };
  annotations: string;
}
export interface ReportItem {
  id: string;
  kind: "text" | "chart" | "table";
  text: string;
  refId?: string;
  evidenceIds?: string[];
  reviewRevision?: number;
}
export interface Query {
  id: string;
  name: string;
  sqlText: string;
  tableBindings: Record<string, string>;
}
export interface Project {
  formatName: "Data Canvas";
  schemaVersion: 1;
  semanticVersion: string;
  projectId: string;
  title: string;
  revision: number;
  sources: Source[];
  recipes: Recipe[];
  charts: Chart[];
  reportItems: ReportItem[];
  queries: Query[];
  viewState: Record<string, unknown>;
  engineVersions: Record<string, string>;
  randomSeeds: Record<string, string>;
}
export interface Bundle {
  project: Project;
  assets: Record<string, Uint8Array>;
}
export const uid = (prefix = "id") =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
export const column = (
  name: string,
  type: Storage = "text",
  id = uid("c"),
): Column => ({
  id,
  name,
  type,
  role:
    type === "text"
      ? "nominal"
      : type === "date" || type === "timestamp"
        ? "temporal"
        : "quantitative",
});
export const col = (columnId: string): Expr => ({ kind: "column", columnId });
export const lit = (value: Value): Expr => ({ kind: "literal", value });
export const binary = (op: string, left: Expr, right: Expr): Expr => ({
  kind: "binary",
  op,
  left,
  right,
});
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/);
const ref = z.object({ kind: z.enum(["source", "recipe"]), id });
const c = z.object({
  id,
  name: z.string().min(1).max(200),
  type: z.enum(["text", "boolean", "integer", "decimal", "date", "timestamp"]),
  role: z.enum([
    "nominal",
    "ordinal",
    "quantitative",
    "temporal",
    "identifier",
  ]),
  units: z.string().optional(),
  description: z.string().optional(),
  levels: z.array(z.string()).optional(),
});
export const projectSchema = z.object({
  formatName: z.literal("Data Canvas"),
  schemaVersion: z.literal(1),
  semanticVersion: z.literal(SEMANTIC_VERSION),
  projectId: id,
  title: z.string().max(500),
  revision: z.number().int().nonnegative(),
  sources: z
    .array(
      z.object({
        id,
        name: z.string(),
        assetRef: z.string(),
        fingerprint: z.string(),
        importSpec: z.object({
          format: z.enum(["csv", "tsv", "xlsx"]),
          delimiter: z.string().max(2),
          quote: z.string().max(1),
          headerRow: z.number().int().min(1).max(10000),
          missingTokens: z.array(z.string()),
          sheet: z.string().optional(),
          malformedPolicy: z.enum(["retain", "exclude"]),
          timezone: z.literal("UTC"),
        }),
        columns: z.array(c).min(1).max(2000),
        rowMeaning: z.string(),
        attribution: z.string(),
      }),
    )
    .max(100),
  recipes: z
    .array(
      z.object({
        id,
        name: z.string(),
        inputRef: ref,
        operations: z
          .array(
            z.object({
              id,
              kind: z.string(),
              version: z.union([z.literal(1), z.literal(2)]),
              params: z.record(z.string(), z.unknown()),
              note: z.string().optional(),
              draft: z.boolean().optional(),
              collapsed: z.boolean().optional(),
            }),
          )
          .max(500),
        rowMeaning: z.string(),
      }),
    )
    .max(200),
  charts: z.array(
    z.object({
      id,
      name: z.string(),
      inputRecipeId: id,
      layers: z
        .array(
          z.object({
            id,
            mark: z.enum([
              "scatter",
              "line",
              "bar",
              "count",
              "histogram",
              "box",
              "heatmap",
              "rule",
              "map_points",
              "choropleth",
              "pie",
              "donut",
            ]),
            x: z.string().optional(),
            x2: z.string().optional(),
            y: z.string().optional(),
            color: z.string().optional(),
            size: z.string().optional(),
            shape: z.string().optional(),
            detail: z.string().optional(),
            tooltip: z.array(z.string()).optional(),
            aggregate: z.string().optional(),
            binWidth: z.number().positive().optional(),
            constant: z.number().finite().optional(),
            showPercent: z.boolean().optional(),
            constantSize: z.number().min(1).max(1000).optional(),
            constantColor: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
          }),
        )
        .min(1)
        .max(10),
      map: mapSettingsSchema.optional(),
      facetRow: z.string().optional(),
      facetColumn: z.string().optional(),
      scales: z.object({
        xLog: z.boolean().optional(),
        yLog: z.boolean().optional(),
        zero: z.boolean().optional(),
        xTitle: z.string().optional(),
        yTitle: z.string().optional(),
        xDomain: z.array(z.number()).length(2).optional(),
        yDomain: z.array(z.number()).length(2).optional(),
      }),
      annotations: z.string(),
    }),
  ),
  reportItems: z.array(
    z.object({
      id,
      kind: z.enum(["text", "chart", "table"]),
      text: z.string(),
      refId: z.string().optional(),
      evidenceIds: z.array(z.string()).optional(),
      reviewRevision: z.number().optional(),
    }),
  ),
  queries: z.array(
    z.object({
      id,
      name: z.string(),
      sqlText: z.string(),
      tableBindings: z.record(z.string(), z.string()),
    }),
  ),
  viewState: z.record(z.string(), z.unknown()),
  engineVersions: z.record(z.string(), z.string()),
  randomSeeds: z.record(z.string(), z.string()),
});
export class CanvasError extends Error {
  constructor(
    public code: string,
    message: string,
    public operationId?: string,
  ) {
    super(message);
  }
}
export function validateProject(value: unknown): Project {
  const r = projectSchema.safeParse(value);
  if (!r.success)
    throw new CanvasError(
      "VALIDATION",
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  const p = r.data as Project;
  const seen = new Set<string>();
  for (const o of [
    ...p.sources,
    ...p.recipes,
    ...p.charts,
    ...p.charts.flatMap((c) => c.layers),
    ...p.queries,
    ...p.reportItems,
    ...p.recipes.flatMap((r) => r.operations),
  ]) {
    if (seen.has(o.id))
      throw new CanvasError("VALIDATION", `Duplicate ID: ${o.id}`);
    seen.add(o.id);
  }
  for (const s of p.sources) {
    if (
      new Set(s.columns.map((c) => c.id)).size !== s.columns.length ||
      new Set(s.columns.map((c) => c.name)).size !== s.columns.length
    )
      throw new CanvasError(
        "SCHEMA",
        "Duplicate source column ID or display name",
      );
  }
  for (const r of p.recipes)
    for (const dep of dependencies(r)) {
      if (
        !(dep.kind === "source" ? p.sources : p.recipes).some(
          (x) => x.id === dep.id,
        )
      )
        throw new CanvasError(
          "VALIDATION",
          `Missing ${dep.kind} reference ${dep.id} in ${r.name}`,
        );
    }
  for (const c of p.charts)
    if (!p.recipes.some((r) => r.id === c.inputRecipeId))
      throw new CanvasError(
        "VALIDATION",
        `Missing chart recipe ${c.inputRecipeId}`,
      );
  for (const query of p.queries)
    for (const id of Object.values(query.tableBindings))
      if (![...p.sources, ...p.recipes].some((t) => t.id === id))
        throw new CanvasError(
          "VALIDATION",
          `Query ${query.name} has a missing table binding ${id}`,
        );
  topological(p);
  return p;
}
export function dependencies(r: Recipe): Ref[] {
  return [
    r.inputRef,
    ...r.operations.flatMap((o) =>
      o.kind === "join"
        ? [o.params.right as Ref]
        : o.kind === "append"
          ? (o.params.inputs as Ref[])
          : o.kind === "check" && o.params.reference
            ? [o.params.reference as Ref]
            : [],
    ),
  ].filter(Boolean);
}
export function topological(
  p: Project,
  ids = p.recipes.map((r) => r.id),
): string[] {
  const out: string[] = [],
    active = new Set<string>(),
    done = new Set<string>();
  function visit(id: string, path: string[]) {
    if (active.has(id))
      throw new CanvasError(
        "CYCLE",
        `Dependency cycle: ${[...path, id].map((id) => p.recipes.find((r) => r.id === id)?.name || id).join(" → ")}`,
      );
    if (done.has(id)) return;
    const r = p.recipes.find((r) => r.id === id);
    if (!r) throw new CanvasError("SCHEMA", `Recipe ${id} no longer exists`);
    active.add(id);
    for (const d of dependencies(r))
      if (d.kind === "recipe") visit(d.id, [...path, id]);
    active.delete(id);
    done.add(id);
    out.push(id);
  }
  ids.forEach((id) => visit(id, []));
  return out;
}
export function blankProject(): Project {
  return {
    formatName: "Data Canvas",
    schemaVersion: 1,
    semanticVersion: SEMANTIC_VERSION,
    projectId: uid("project"),
    title: "Untitled exploration",
    revision: 0,
    sources: [],
    recipes: [],
    charts: [],
    reportItems: [],
    queries: [],
    viewState: {},
    engineVersions: {
      duckdb: "1.5.4",
      wasmPackage: "1.33.1-dev57.0",
      nativePackage: "1.5.4-r.1",
    },
    randomSeeds: { sampling: "md5-rank-v1" },
  };
}

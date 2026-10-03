import {
  type Bundle,
  type Column,
  type Project,
  type Ref,
  type Value,
  CanvasError,
  validateProject,
  topological,
} from "../domain/model";
import {
  type DB,
  type Relation,
  type Diagnostic,
  compileOperation,
} from "../compiler/sql";
import { quote as q, literal as l, storageCast } from "../compiler/expressions";
import {
  fingerprint,
  parseAsset,
  verifySourceColumns,
} from "../persistence/import";
import { registry, type OpKind, validateOperation } from "../domain/operations";
export interface TableResult {
  id: string;
  columns: Column[];
  rows: Record<string, Value>[];
  rowCount: number;
  preview: boolean;
  ordered: boolean;
  rowMeaning: string;
  reviewMeaning?: boolean;
  profiles: Profile[];
  lineage: string[][];
  sql: string;
  diagnostics: Diagnostic[];
}
export interface Profile {
  columnId: string;
  missing: number;
  distinct: number;
  min: Value;
  max: Value;
}
export interface StepResult {
  operationId: string;
  /** Executable compiler output, without display names interpolated into comments. */
  statement?: string;
  before: TableResult;
  after?: TableResult;
  error?: string;
  code?: string;
}
export interface RunResult {
  formatName: "Data Canvas execution";
  resultVersion: 1;
  semanticVersion: string;
  engineVersion: string;
  revision: number;
  status: "ready" | "failed";
  tables: Record<string, TableResult>;
  steps: Record<string, StepResult[]>;
  diagnostics: Diagnostic[];
  errors: {
    recipeId: string;
    operationId?: string;
    code: string;
    message: string;
  }[];
  elapsedMs: number;
  sql: string;
  sourceOverrides?: unknown;
  charts?: unknown[];
}
export interface RunOptions {
  outputIds?: string[];
  stepRecipeId?: string;
  stepCount?: number;
  previewRows?: number;
  maxOutputRows?: number;
  maxSourceRows?: number;
  onProgress?: (message: string) => void;
}
const sqlType: Record<string, string> = {
  text: "VARCHAR",
  integer: "BIGINT",
  decimal: "DOUBLE",
  boolean: "BOOLEAN",
  date: "DATE",
  timestamp: "TIMESTAMP",
};
export function scalar(v: any, type?: Column["type"]): Value {
  if (v == null) return null;
  if (type === "integer") return { type: "integer", value: String(v) };
  if (type === "date")
    return {
      type: "date",
      value:
        typeof v === "number"
          ? new Date(v).toISOString().slice(0, 10)
          : String(v).slice(0, 10),
    };
  if (type === "timestamp")
    return {
      type: "timestamp",
      value: typeof v === "number" ? new Date(v).toISOString() : String(v),
    };
  if (typeof v === "bigint") return { type: "integer", value: String(v) };
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || typeof v === "string") return v;
  if (v instanceof Date) return { type: "timestamp", value: v.toISOString() };
  return String(v);
}
export const displayValue = (v: Value | undefined): string =>
  v === null || v === undefined
    ? "∅"
    : typeof v === "object"
      ? v.value
      : String(v);
export const plainValue = (v: Value) =>
  v && typeof v === "object"
    ? v.type === "integer" || v.type === "decimal"
      ? Number(v.value)
      : v.value
    : v;
function list(v: any): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v?.items) return v.items.map(String);
  if (v?.toArray) return Array.from(v.toArray()).map(String);
  if (v && Symbol.iterator in Object(v)) return Array.from(v).map(String);
  return [];
}
export class Engine {
  relations = new Map<string, Relation>();
  sqlStatements: string[] = [];
  sourceCache = new Map<
    string,
    { key: string; data: ReturnType<typeof parseAsset> }
  >();
  operationCache = new Map<
    string,
    {
      key: string;
      relation: Relation;
      diagnostics: Diagnostic[];
      sql: string;
      statement: string;
    }
  >();
  snapshotCache = new Map<string, TableResult>();
  constructor(
    public db: DB,
    public createIsolated?: () => Promise<DB>,
  ) {}
  async snapshot(
    id: string,
    relation: Relation,
    preview = 100,
    diagnostics: Diagnostic[] = [],
    sql = "",
  ): Promise<TableResult> {
    const cacheKey = relation.cacheKey
      ? `${relation.cacheKey}:${preview}`
      : undefined;
    const saved = cacheKey ? this.snapshotCache.get(cacheKey) : undefined;
    if (saved)
      return {
        ...saved,
        id,
        sql,
        diagnostics,
        rowMeaning: relation.rowMeaning,
      };
    const count = Number(
      (await this.db.query(`SELECT count(*) AS n FROM ${q(relation.name)}`))[0]
        .n,
    );
    const raw = await this.db.query(
      `SELECT ${[...relation.columns.map((c) => (["date", "timestamp"].includes(c.type) ? `CAST(${q(c.id)} AS VARCHAR) AS ${q(c.id)}` : q(c.id))), q("__rid"), q("__lineage")].join(",")} FROM ${q(relation.name)} LIMIT ${Math.max(0, Math.floor(preview))}`,
    );
    let profiles: Profile[] = [];
    if (relation.columns.length) {
      const fields = relation.columns.flatMap((c, i) => [
        `count(*)-count(${q(c.id)}) AS ${q("n" + i)}`,
        `count(DISTINCT ${q(c.id)}) AS ${q("d" + i)}`,
        `${["date", "timestamp"].includes(c.type) ? `CAST(min(${q(c.id)}) AS VARCHAR)` : `min(${q(c.id)})`} AS ${q("min" + i)}`,
        `${["date", "timestamp"].includes(c.type) ? `CAST(max(${q(c.id)}) AS VARCHAR)` : `max(${q(c.id)})`} AS ${q("max" + i)}`,
      ]);
      const p = (
        await this.db.query(
          `SELECT ${fields.join(",")} FROM ${q(relation.name)}`,
        )
      )[0];
      profiles = relation.columns.map((c, i) => ({
        columnId: c.id,
        missing: Number(p["n" + i]),
        distinct: Number(p["d" + i]),
        min: scalar(p["min" + i], c.type),
        max: scalar(p["max" + i], c.type),
      }));
    }
    const table: TableResult = {
      id,
      ...relation,
      columns: relation.columns,
      rows: raw.map((r) =>
        Object.fromEntries(
          relation.columns.map((c) => [c.id, scalar(r[c.id], c.type)]),
        ),
      ),
      rowCount: count,
      preview: raw.length < count,
      profiles,
      lineage: raw.map((r) => list(r.__lineage)),
      sql,
      diagnostics,
    };
    if (cacheKey && preview <= 100) {
      this.snapshotCache.set(cacheKey, table);
      if (this.snapshotCache.size > 256)
        this.snapshotCache.delete(this.snapshotCache.keys().next().value!);
    }
    return table;
  }
  async loadSources(bundle: Bundle, limit = 1000000) {
    for (const source of bundle.project.sources) {
      const bytes = bundle.assets[source.assetRef];
      if (!bytes)
        throw new CanvasError(
          "SOURCE",
          `Missing source asset ${source.assetRef}`,
        );
      if ((await fingerprint(bytes)) !== source.fingerprint)
        throw new CanvasError("SOURCE", `Fingerprint mismatch: ${source.name}`);
      const sourceKey = JSON.stringify({
        sourceId: source.id,
        fingerprint: source.fingerprint,
        importSpec: source.importSpec,
        columns: source.columns,
      });
      const cached = this.sourceCache.get(source.id);
      const reusable = cached?.key === sourceKey;
      const data = reusable
        ? cached.data
        : parseAsset(bytes, source.importSpec);
      verifySourceColumns(source, data);
      if (data.rows.length > limit)
        throw new CanvasError(
          "RESOURCE_LIMIT",
          `${source.name} exceeds the caller's ${limit} source-row limit.`,
        );
      const name = "source_" + source.id;
      if (!reusable) {
        const rawName = name + "_raw";
        if (this.db.insertTextRows) {
          await this.db.exec(
            `CREATE OR REPLACE TABLE ${q(rawName)} (${source.columns.map((c) => `${q(c.id)} VARCHAR`).join(",")},"__rid" VARCHAR)`,
          );
          await this.db.insertTextRows(
            rawName,
            source.columns.map((c) => c.id),
            data.rows,
            source.id,
          );
          await this.db.exec(
            `CREATE OR REPLACE TABLE ${q(name)} AS SELECT ${source.columns.map((c) => `${c.type === "text" ? q(c.id) : storageCast(q(c.id), c.type)} AS ${q(c.id)}`).join(",")},"__rid",["__rid"] AS "__lineage" FROM ${q(rawName)}`,
          );
          await this.db.exec(`DROP TABLE ${q(rawName)}`);
        } else {
          await this.db.exec(
            `CREATE OR REPLACE TABLE ${q(name)} (${source.columns.map((c) => `${q(c.id)} ${sqlType[c.type]}`).join(",")},"__rid" VARCHAR,"__lineage" VARCHAR[])`,
          );
          for (let i = 0; i < data.rows.length; i += 500)
            await this.db.exec(
              `INSERT INTO ${q(name)} VALUES ${data.rows
                .slice(i, i + 500)
                .map(
                  (row, j) =>
                    `(${[...row.map((v, k) => (source.columns[k].type === "text" ? l(v) : storageCast(l(v), source.columns[k].type))), l(source.id + ":" + (i + j + 1)), `[${l(source.id + ":" + (i + j + 1))}]`].join(",")})`,
                )
                .join(",")}`,
            );
        }
        this.sourceCache.set(source.id, { key: sourceKey, data });
      }
      this.relations.set(source.id, {
        cacheKey: sourceKey,
        name,
        columns: source.columns,
        ordered: false,
        rowMeaning: source.rowMeaning,
      });
      this.sqlStatements.push(
        `-- SOURCE ${source.name}: register immutable asset ${source.assetRef}\n-- Physical columns: ${source.columns.map((c) => `${q(c.name)} → ${q(c.id)}`).join(", ")}`,
      );
    }
  }
  resolve = (ref: Ref) => {
    const r = this.relations.get(ref.id);
    if (!r)
      throw new CanvasError(
        "BLOCKED",
        `Blocked by unavailable ${ref.kind} ${ref.id}. Run or repair its prerequisite first.`,
      );
    return r;
  };
  async run(bundle: Bundle, options: RunOptions = {}): Promise<RunResult> {
    const start = performance.now(),
      p = validateProject(bundle.project);
    this.sqlStatements = [];
    for (const id of this.relations.keys())
      if (!p.sources.some((s) => s.id === id)) this.relations.delete(id);
    const result: RunResult = {
      formatName: "Data Canvas execution",
      resultVersion: 1,
      semanticVersion: p.semanticVersion,
      engineVersion: String(
        (await this.db.query("SELECT version() AS version"))[0].version,
      ),
      revision: p.revision,
      status: "ready",
      tables: {},
      steps: {},
      diagnostics: [],
      errors: [],
      elapsedMs: 0,
      sql: "",
    };
    options.onProgress?.("Reading immutable sources…");
    await this.loadSources(bundle, options.maxSourceRows);
    for (const s of p.sources) {
      const sourceResult = await this.snapshot(
        s.id,
        this.resolve({ kind: "source", id: s.id }),
        options.previewRows ?? 100,
      );
      const parsed = this.sourceCache.get(s.id)!.data;
      sourceResult.diagnostics.push(
        ...parsed.issues.map((i) => ({
          severity: "advisory" as const,
          message: `Source record ${i.row}: ${i.message}`,
        })),
      );
      for (const c of s.columns.filter((c) => c.type !== "text")) {
        const index = s.columns.findIndex((x) => x.id === c.id);
        const nonnull = parsed.rows.filter((row) => row[index] !== null).length,
          missing = sourceResult.profiles.find(
            (x) => x.columnId === c.id,
          )!.missing;
        const failures = missing - (parsed.rows.length - nonnull);
        if (failures)
          sourceResult.diagnostics.push({
            severity: "advisory",
            message: `${c.name}: ${failures} typed import failures. Original field text is retained; choose Text to inspect it.`,
            count: failures,
          });
      }
      result.tables[s.id] = sourceResult;
      result.diagnostics.push(...sourceResult.diagnostics);
    }
    const ids = options.outputIds?.map(
      (id) => p.charts.find((c) => c.id === id)?.inputRecipeId || id,
    );
    for (const id of topological(p, ids)) {
      const recipe = p.recipes.find((r) => r.id === id)!;
      const steps: StepResult[] = [];
      result.steps[id] = steps;
      try {
        let current = this.resolve(recipe.inputRef);
        let before = await this.snapshot(
          `${id}_input`,
          current,
          options.previewRows ?? 100,
        );
        const ops =
          options.stepRecipeId === id
            ? recipe.operations.slice(0, options.stepCount ?? 0)
            : recipe.operations;
        for (const op of ops) {
          options.onProgress?.(`${recipe.name} · ${op.kind}`);
          try {
            const deps =
              op.kind === "join"
                ? [this.resolve(op.params.right).cacheKey]
                : op.kind === "append"
                  ? op.params.inputs.map((r: Ref) => this.resolve(r).cacheKey)
                  : op.kind === "check" && op.params.reference
                    ? [this.resolve(op.params.reference).cacheKey]
                    : [];
            const cacheKey = await fingerprint(
              new TextEncoder().encode(
                JSON.stringify({
                  semanticVersion: p.semanticVersion,
                  operationId: op.id,
                  kind: op.kind,
                  params: op.params,
                  draft: op.draft,
                  input: current.cacheKey,
                  deps,
                }),
              ),
            );
            const cached = this.operationCache.get(op.id);
            if (cached?.key === cacheKey) {
              const relation = {
                ...cached.relation,
                rowMeaning: recipe.rowMeaning || current.rowMeaning,
              };
              const after = await this.snapshot(
                op.id,
                relation,
                options.previewRows ?? 100,
                cached.diagnostics,
                cached.sql,
              );
              this.sqlStatements.push(cached.sql);
              steps.push({
                operationId: op.id,
                statement: cached.statement,
                before,
                after,
              });
              result.diagnostics.push(...cached.diagnostics);
              this.relations.set(op.id, relation);
              current = relation;
              before = after;
              continue;
            }
            const compiled = await compileOperation(
              op,
              current,
              this.resolve,
              this.db,
            );
            const name = "step_" + op.id;
            await this.db.exec(
              `CREATE OR REPLACE TEMP VIEW ${q(name)} AS ${compiled.sql}`,
            );
            const relation: Relation = {
              cacheKey,
              name,
              columns: compiled.columns,
              ordered: compiled.ordered,
              rowMeaning: recipe.rowMeaning || current.rowMeaning,
              reviewMeaning: compiled.reviewMeaning,
            };
            const statement = `CREATE OR REPLACE TEMP VIEW ${q(name)} AS\n${compiled.sql};`;
            const sql = `-- ${recipe.name} / ${op.kind} [${op.id}]\n${statement}`;
            const after = await this.snapshot(
              op.id,
              relation,
              options.previewRows ?? 100,
              compiled.diagnostics,
              sql,
            );
            this.operationCache.set(op.id, {
              key: cacheKey,
              relation,
              diagnostics: compiled.diagnostics,
              sql,
              statement,
            });
            this.sqlStatements.push(sql);
            steps.push({ operationId: op.id, statement, before, after });
            result.diagnostics.push(...compiled.diagnostics);
            this.relations.set(op.id, relation);
            current = relation;
            before = after;
          } catch (error) {
            const e = error as Error;
            steps.push({
              operationId: op.id,
              before,
              error: e.message,
              code: error instanceof CanvasError ? error.code : "EXECUTION",
            });
            throw error instanceof CanvasError
              ? new CanvasError(error.code, error.message, op.id)
              : new CanvasError("EXECUTION", e.message, op.id);
          }
        }
        this.relations.set(id, current);
        if (options.maxOutputRows !== undefined) {
          const count = Number(
            (
              await this.db.query(
                `SELECT count(*) AS n FROM ${q(current.name)}`,
              )
            )[0].n,
          );
          if (count > options.maxOutputRows)
            throw new CanvasError(
              "RESOURCE_LIMIT",
              `Output ${id} exceeds ${options.maxOutputRows} rows; no result was silently truncated.`,
            );
        }
        result.tables[id] = await this.snapshot(
          id,
          current,
          options.previewRows ?? 100,
        );
        result.tables[id].sql = this.sqlStatements.join("\n\n");
      } catch (error) {
        const e = error as Error;
        result.status = "failed";
        result.errors.push({
          recipeId: id,
          operationId:
            error instanceof CanvasError ? error.operationId : undefined,
          code: error instanceof CanvasError ? error.code : "EXECUTION",
          message: e.message,
        });
        this.relations.delete(id);
      }
    }
    result.sql = this.sqlStatements.join("\n\n");
    result.elapsedMs = performance.now() - start;
    return result;
  }
  async distribution(id: string, columnId: string) {
    const relation = this.relations.get(id);
    if (!relation || !relation.columns.some((c) => c.id === columnId))
      throw new CanvasError("SCHEMA", "Column is unavailable in this result.");
    const c = relation.columns.find((c) => c.id === columnId)!;
    return (
      await this.db.query(
        `SELECT ${q(columnId)} AS value,count(*) AS n FROM ${q(relation.name)} GROUP BY 1 ORDER BY 2 DESC,1 NULLS LAST LIMIT 12`,
      )
    ).map((row) => ({
      value: scalar(row.value, c.type),
      count: Number(row.n),
    }));
  }
  async fullTable(id: string, max = 1000000) {
    const relation = this.relations.get(id);
    if (!relation)
      throw new CanvasError("BLOCKED", `Table ${id} is unavailable`);
    const count = Number(
      (await this.db.query(`SELECT count(*) AS n FROM ${q(relation.name)}`))[0]
        .n,
    );
    if (count > max)
      throw new CanvasError(
        "RESOURCE_LIMIT",
        `Rendering/export limit ${max}; actual result ${count}. Choose aggregation or a deliberate sample.`,
      );
    return this.snapshot(id, relation, count);
  }
}
export function validateBundle(bundle: Bundle) {
  const p = validateProject(bundle.project);
  for (const r of p.recipes)
    for (const o of r.operations) {
      if (!registry[o.kind as OpKind])
        throw new CanvasError(
          "VALIDATION",
          `Unsupported operation ${o.kind}`,
          o.id,
        );
      if (!o.draft) validateOperation(o);
    }
  for (const s of p.sources)
    if (!bundle.assets[s.assetRef])
      throw new CanvasError("SOURCE", `Missing source asset ${s.assetRef}`);
  return p;
}

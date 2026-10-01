import { extractChartTransformation } from "./charts/extract";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  StepForward,
  Square,
  Undo2,
  Redo2,
  Plus,
  Upload,
  Download,
  ChevronDown,
  ChevronRight,
  Table2,
  Layers,
  BarChart3,
  GitBranch,
  BookOpen,
  Code2,
  Search,
  Sun,
  Moon,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Maximize2,
  Minimize2,
  Check,
  AlertTriangle,
  HelpCircle,
  X,
  PanelLeft,
  Settings2,
  List,
  Blocks as BlocksIcon,
  RefreshCw,
} from "lucide-react";
import {
  type Bundle,
  type Project,
  type Recipe,
  type Source,
  type Ref,
  type Operation,
  type Column,
  type Chart,
  type Expr,
  blankProject,
  uid,
  col,
  lit,
  binary,
  validateProject,
  dependencies,
} from "./domain/model";
import { registry, newOperation, type OpKind } from "./domain/operations";
import { example, exampleInfo } from "./examples";
import {
  autosave,
  recover,
  recoveries,
  packBundle,
  unpackBundle,
  download,
} from "./persistence/bundle";
import { parseAsset } from "./persistence/import";
import { WorkerClient } from "./engine/client";
import { type RunResult, type TableResult, displayValue } from "./engine/core";
import { Blocks, operationDetail } from "./editor/Blocks";
import { Configure, Text, Field, Select, RefSelect } from "./editor/Configure";
import { DataTable, Profiles } from "./editor/DataTable";
import { ImportDialog } from "./editor/ImportDialog";
import { ChartView } from "./charts/ChartView";
import { Overview } from "./editor/Overview";
import { Report } from "./editor/Report";
import { QueryView } from "./editor/QueryView";
import { quote, literal, storageCast } from "./compiler/expressions";
import { zipSync, strToU8 } from "fflate";
const categories = [
  "Choose",
  "Clean",
  "Derive",
  "Reshape",
  "Combine",
  "Summarize",
  "Checks",
];
const safeCSV = (v: string) => '"' + v.replaceAll('"', '""') + '"';
export default function App() {
  const [bundle, setBundle] = useState<Bundle>(),
    [selected, setSelected] = useState<{ kind: string; id: string }>({
      kind: "recipe",
      id: "clean",
    }),
    [operationId, setOperationId] = useState(""),
    [view, setView] = useState<"workspace" | "overview" | "report" | "sql">(
      "workspace",
    ),
    [editor, setEditor] = useState("Blocks"),
    [inspector, setInspector] = useState("Configure"),
    [bottom, setBottom] = useState("After"),
    [search, setSearch] = useState(""),
    [result, setResult] = useState<RunResult>(),
    [status, setStatus] = useState("loading"),
    [progress, setProgress] = useState("Opening your canvas…"),
    [saveStatus, setSaveStatus] = useState("Opening recovery…"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [auto, setAuto] = useState(true),
    [dark, setDark] = useState(false),
    [importFile, setImportFile] = useState<File>(),
    [replaceSource, setReplaceSource] = useState<Source>(),
    [showExamples, setShowExamples] = useState(false),
    [showRecovery, setShowRecovery] =
      useState<{ bundle: Bundle; savedAt: number }[]>(),
    [showHelp, setShowHelp] = useState(false),
    [maximized, setMaximized] = useState(false),
    [pane, setPane] = useState("Canvas"),
    [lineage, setLineage] = useState<string[]>([]),
    [rowSelected, setRowSelected] = useState<number>(),
    [historyVersion, setHistoryVersion] = useState(0),
    [stepCount, setStepCount] = useState(0),
    [insertAt, setInsertAt] = useState<number | null>(null),
    [tableHeight, setTableHeight] = useState(260);
  const history = useRef<Bundle[]>([]),
    future = useRef<Bundle[]>([]),
    client = useRef<WorkerClient | undefined>(undefined),
    bundleRef = useRef<Bundle | undefined>(undefined),
    runSerial = useRef(0),
    fileInput = useRef<HTMLInputElement>(null),
    openInput = useRef<HTMLInputElement>(null);
  bundleRef.current = bundle;
  useEffect(() => {
    client.current = new WorkerClient();
    let active = true;
    recover()
      .catch(() => null)
      .then(async (saved) => {
        const b = saved || (await example());
        if (active) {
          setBundle(b);
          setSelected({
            kind: "recipe",
            id: String(
              b.project.viewState.selectedRecipe ||
                b.project.recipes[0]?.id ||
                "",
            ),
          });
          setOperationId(b.project.recipes[0]?.operations[0]?.id || "");
          setNotice(
            saved
              ? "Recovered your last local draft."
              : "Start with this editable example, or import your own table.",
          );
          setStatus("stale");
        }
      });
    return () => {
      active = false;
      client.current?.dispose();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!bundle) return;
    setSaveStatus("Saving recovery…");
    const timer = setTimeout(() => {
      autosave(bundle)
        .then(() => setSaveStatus("Recovery saved"))
        .catch((e) => setSaveStatus("Recovery error: " + e.message));
    }, 400);
    return () => clearTimeout(timer);
  }, [bundle]);
  const schemaCache = useRef<RunResult | undefined>(undefined);
  if (result) schemaCache.current = result;
  const p = bundle?.project;
  const recipe = p?.recipes.find(
    (r) => selected.kind === "recipe" && r.id === selected.id,
  );
  const source = p?.sources.find(
    (s) => selected.kind === "source" && s.id === selected.id,
  );
  const chart = p?.charts.find(
    (c) => selected.kind === "chart" && c.id === selected.id,
  );
  const steps = recipe ? result?.steps[recipe.id] || [] : [];
  const op = recipe?.operations.find((o) => o.id === operationId);
  const step = steps.find((s) => s.operationId === operationId);
  const table =
    selected.kind === "source"
      ? result?.tables[selected.id]
      : operationId === "@input" && recipe
        ? result?.tables[recipe.inputRef.id]
        : step?.after ||
          (!operationId ? result?.tables[selected.id] : undefined);
  const before = step?.before || (recipe && result?.tables[recipe.inputRef.id]);
  const columns =
    step?.before.columns ||
    before?.columns ||
    schemaCache.current?.steps[recipe?.id || ""]?.find(
      (s) => s.operationId === operationId,
    )?.before.columns ||
    (recipe
      ? p?.sources.find((s) => s.id === recipe.inputRef.id)?.columns
      : source?.columns) ||
    [];
  const getColumns = (ref: Ref): Column[] =>
    result?.tables[ref.id]?.columns ||
    schemaCache.current?.tables[ref.id]?.columns ||
    p?.sources.find((s) => s.id === ref.id)?.columns ||
    [];
  function commit(next: Bundle, semantic = true) {
    if (bundleRef.current) {
      history.current.push(bundleRef.current);
      if (history.current.length > 100) history.current.shift();
    }
    future.current = [];
    setHistoryVersion((v) => v + 1);
    if (semantic) {
      next = {
        ...next,
        project: {
          ...next.project,
          revision: (bundleRef.current?.project.revision || 0) + 1,
        },
      };
      runSerial.current++;
      client.current?.invalidate();
      setStatus("stale");
      setProgress("Edits pending · results are stale");
      setResult(undefined);
      setStepCount(0);
    }
    setBundle(next);
  }
  function edit(update: (draft: Project) => void, semantic = true) {
    if (!bundleRef.current) return;
    const project = structuredClone(bundleRef.current.project);
    update(project);
    commit({ ...bundleRef.current, project }, semantic);
  }
  function changeRecipe(update: (r: Recipe) => void) {
    if (!recipe) return;
    const next = structuredClone(recipe);
    update(next);
    const semantics = (r: Recipe) =>
      JSON.stringify({
        inputRef: r.inputRef,
        operations: r.operations.map(
          ({ id, kind, version, params, draft }) => ({
            id,
            kind,
            version,
            params,
            draft,
          }),
        ),
      });
    const semantic = semantics(recipe) !== semantics(next);
    edit((p) => {
      p.recipes = p.recipes.map((r) => (r.id === recipe.id ? next : r));
    }, semantic);
    if (!semantic && result?.tables[recipe.id])
      setResult({
        ...result,
        tables: {
          ...result.tables,
          [recipe.id]: {
            ...result.tables[recipe.id],
            rowMeaning: next.rowMeaning,
          },
        },
      });
  }
  function undo(redo = false) {
    const stack = redo ? future.current : history.current;
    const prev = stack.pop();
    if (!prev || !bundleRef.current) return;
    (redo ? history.current : future.current).push(bundleRef.current);
    runSerial.current++;
    client.current?.invalidate();
    setBundle({
      ...prev,
      project: {
        ...prev.project,
        revision: (bundleRef.current.project.revision || 0) + 1,
      },
    });
    setStatus("stale");
    setProgress("Edits pending · results are stale");
    setResult(undefined);
    setHistoryVersion((v) => v + 1);
  }
  async function loadBundle(next: Bundle) {
    try {
      validateProject(next.project);
      if (bundleRef.current) await autosave(bundleRef.current);
      history.current.push(bundleRef.current!);
      future.current = [];
      runSerial.current++;
      client.current?.invalidate();
      client.current?.cancel();
      setBundle(next);
      setSelected({
        kind: next.project.recipes.length ? "recipe" : "source",
        id: next.project.recipes[0]?.id || next.project.sources[0]?.id || "",
      });
      setOperationId(next.project.recipes[0]?.operations[0]?.id || "");
      setView("workspace");
      setStatus("stale");
      setProgress("Project opened · awaiting execution");
      schemaCache.current = undefined;
      setResult(undefined);
      setError("");
      setStepCount(0);
      setShowExamples(false);
      setShowRecovery(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run(mode: "all" | "selected" | "step" = "selected") {
    const b = bundleRef.current;
    if (!b || !client.current) return;
    const serial = ++runSerial.current;
    client.current.invalidate();
    setStatus("running");
    setError("");
    setProgress(
      mode === "step"
        ? "Resolving prerequisites before stepping…"
        : "Starting DuckDB worker…",
    );
    const count =
      mode === "step"
        ? Math.min(stepCount + 1, recipe?.operations.length || 0)
        : undefined;
    if (mode === "step") setStepCount(count!);
    try {
      const r: RunResult = await client.current.request(
        "run",
        {
          bundle: b,
          options: {
            ...(mode === "all"
              ? {}
              : recipe
                ? { outputIds: [recipe.id] }
                : chart
                  ? { outputIds: [chart.id] }
                  : {}),
            ...(mode === "step" && recipe
              ? { stepRecipeId: recipe.id, stepCount: count }
              : {}),
          },
        },
        setProgress,
      );
      if (serial !== runSerial.current) return;
      setResult(r);
      setStatus(r.status);
      setProgress(
        r.status === "ready"
          ? `${mode === "step" ? `Step ${count} · prerequisites resolved · ` : ""}Ready · ${Math.round(r.elapsedMs)} ms`
          : `${r.errors.length} blocked or failed output${r.errors.length === 1 ? "" : "s"}`,
      );
      if (mode === "step" && recipe && count)
        setOperationId(recipe.operations[count - 1].id);
    } catch (e) {
      if (serial !== runSerial.current) return;
      setStatus((e as Error).message === "Canceled" ? "canceled" : "failed");
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!bundle || !auto) return;
    const timer = setTimeout(() => run("all"), 650);
    return () => clearTimeout(timer);
  }, [bundle?.project.projectId, bundle?.project.revision, auto]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName,
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (bundleRef.current)
          download(
            bundleRef.current.project.title + ".datacanvas",
            packBundle(bundleRef.current),
          );
      }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo(e.shiftKey);
      }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run("selected");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [bundle, recipe, stepCount]);
  function open(kind: string, id: string) {
    setSelected({ kind, id });
    setOperationId("");
    setView("workspace");
    setRowSelected(undefined);
    setPane("Canvas");
    setStepCount(0);
  }
  function addRecipe(ref?: Ref) {
    if (!p) return;
    const inputRef =
      ref ||
      (selected.kind === "source" || selected.kind === "recipe"
        ? { kind: selected.kind as Ref["kind"], id: selected.id }
        : p.sources[0]
          ? { kind: "source" as const, id: p.sources[0].id }
          : undefined);
    if (!inputRef) {
      fileInput.current?.click();
      return;
    }
    const id = uid("recipe");
    edit((p) =>
      p.recipes.push({
        id,
        name: "New recipe",
        inputRef,
        operations: [],
        rowMeaning: "",
      }),
    );
    open("recipe", id);
  }
  function addOperation(kind: OpKind, index?: number) {
    if (!recipe) return;
    const boundary = index ?? insertAt ?? recipe.operations.length;
    const inputCols =
      boundary === 0
        ? getColumns(recipe.inputRef)
        : steps[boundary - 1]?.after?.columns ||
          result?.tables[recipe.id]?.columns ||
          columns;
    const operation = newOperation(
      kind,
      inputCols,
      p?.sources.find((s) => s.id !== recipe.inputRef.id)?.id ||
        p?.sources[0]?.id,
    );
    changeRecipe((r) => r.operations.splice(boundary, 0, operation));
    setOperationId(operation.id);
    setInspector("Configure");
    setInsertAt(null);
    setPane("Inspector");
  }
  function mutateOp(action: string) {
    if (!op || !recipe) return;
    const index = recipe.operations.findIndex((o) => o.id === op.id);
    if (action === "delete") {
      changeRecipe((r) => r.operations.splice(index, 1));
      setOperationId("");
    } else if (action === "duplicate") {
      const copy = structuredClone(op);
      copy.id = uid("op");
      if (copy.kind === "regex") copy.params.outputId = uid("c");
      if (copy.kind === "split")
        copy.params.ids = copy.params.ids.map(() => uid("c"));
      if (copy.kind === "derive") copy.params.columnId = uid("c");
      if (copy.kind === "summarize")
        copy.params.aggregates.forEach((a: any) => (a.id = uid("c")));
      if (copy.kind === "longer") {
        copy.params.namesId = uid("c");
        copy.params.valuesId = uid("c");
      }
      changeRecipe((r) => r.operations.splice(index + 1, 0, copy));
      setOperationId(copy.id);
    } else {
      const target = index + (action === "up" ? -1 : 1);
      if (target >= 0 && target < recipe.operations.length)
        changeRecipe((r) => {
          [r.operations[index], r.operations[target]] = [
            r.operations[target],
            r.operations[index],
          ];
        });
    }
  }
  function extractPrefix() {
    if (!recipe || !op) return;
    const index = recipe.operations.findIndex((o) => o.id === op.id),
      id = uid("recipe");
    edit((p) => {
      const r = p.recipes.find((r) => r.id === recipe.id)!;
      p.recipes.push({
        id,
        name: r.name + " · shared prefix",
        inputRef: r.inputRef,
        operations: r.operations.slice(0, index + 1),
        rowMeaning: r.rowMeaning,
      });
      r.inputRef = { kind: "recipe", id };
      r.operations = r.operations.slice(index + 1);
    });
    setOperationId("");
    setNotice(
      "Prefix extracted as a named recipe. Downstream IDs are preserved.",
    );
  }
  function visualize() {
    if (!recipe || !p) return;
    const cols = result?.tables[recipe.id]?.columns || columns;
    const id = uid("chart");
    const x = cols.find((c) => c.role !== "quantitative") || cols[0],
      y = cols.find((c) => c.role === "quantitative");
    edit(
      (p) =>
        p.charts.push({
          id,
          name: recipe.name + " · chart",
          inputRecipeId: recipe.id,
          layers: [
            { id: uid("layer"), mark: y ? "bar" : "count", x: x?.id, y: y?.id },
          ],
          scales: { zero: true },
          annotations: "",
        }),
      false,
    );
    open("chart", id);
  }
  async function exportTable() {
    try {
      const t: TableResult = await client.current!.request("table", {
        tableId: selected.id,
      });
      const csv = [
        t.columns.map((c) => safeCSV(c.name)).join(","),
        ...t.rows.map((r) =>
          t.columns
            .map((c) =>
              r[c.id] === null ? "" : safeCSV(displayValue(r[c.id])),
            )
            .join(","),
        ),
      ].join("\r\n");
      download(
        (recipe?.name || source?.name || "table") + ".csv",
        csv,
        "text/csv",
      );
      download(
        "data-dictionary.json",
        JSON.stringify(
          {
            rowMeaning: t.rowMeaning,
            columns: t.columns,
            notes:
              "CSV represents missing as an unquoted empty field; blank text is quoted. Categorical values are not encoded for machine learning. Use the project or typed runner result to retain exact types.",
          },
          null,
          2,
        ),
        "application/json",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportSQL() {
    if (!result || !bundle) return;
    let setup =
      "-- DuckDB SQL. Import the included immutable assets using the saved import settings.\n-- This export registers typed source tables with stable physical column names.\n";
    for (const s of p!.sources) {
      const parsed = parseAsset(bundle.assets[s.assetRef], s.importSpec);
      const types: any = {
        text: "VARCHAR",
        integer: "BIGINT",
        decimal: "DOUBLE",
        boolean: "BOOLEAN",
        date: "DATE",
        timestamp: "TIMESTAMP",
      };
      setup += `CREATE TABLE ${quote("source_" + s.id)} (${s.columns.map((c) => `${quote(c.id)} ${types[c.type]}`).join(",")}, "__rid" VARCHAR, "__lineage" VARCHAR[]);\n`;
      for (let i = 0; i < parsed.rows.length; i += 500)
        setup += `INSERT INTO ${quote("source_" + s.id)} VALUES ${parsed.rows
          .slice(i, i + 500)
          .map(
            (row, j) =>
              `(${[...row.map((v, k) => (s.columns[k].type === "text" ? literal(v) : storageCast(literal(v), s.columns[k].type))), literal(`${s.id}:${i + j + 1}`), `[${literal(`${s.id}:${i + j + 1}`)}]`].join(",")})`,
          )
          .join(",")};\n`;
    }
    download(
      p!.title + " SQL.zip",
      zipSync({
        "analysis.sql": strToU8(setup + "\n" + result.sql),
        "manifest.json": strToU8(JSON.stringify(p, null, 2)),
        ...bundle.assets,
      }),
    );
  }
  function showContributors(ids: string[]) {
    setLineage([...new Set(ids)]);
    setBottom("Contributing records");
    setMaximized(false);
  }
  function extractChart(c: Chart) {
    try {
      const extracted = extractChartTransformation(c);
      edit((p) => {
        p.recipes.push(extracted.recipe);
        p.charts = p.charts.map((chart) =>
          chart.id === c.id ? extracted.chart : chart,
        );
      });
      setNotice(
        "Chart transformation extracted with explicit missing-value policy and bin boundaries.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const contributorRows = useMemo(() => {
    if (!bundle || !lineage.length) return [];
    const bySource = new Map<string, number[]>();
    for (const id of lineage) {
      const split = id.lastIndexOf(":"),
        source = id.slice(0, split),
        row = Number(id.slice(split + 1));
      bySource.set(source, [...(bySource.get(source) || []), row]);
    }
    return [...bySource]
      .map(([id, indexes]) => {
        const source = bundle.project.sources.find((s) => s.id === id);
        if (!source) return null;
        const data = parseAsset(
          bundle.assets[source.assetRef],
          source.importSpec,
        );
        return {
          source,
          rows: indexes
            .slice(0, 100)
            .map((index) => ({ index, values: data.rows[index - 1] })),
          count: indexes.length,
        };
      })
      .filter(Boolean);
  }, [lineage, bundle?.assets]);
  if (!bundle || !p)
    return (
      <div className="loading-screen">
        <div className="brand-mark">▦</div>
        <h1>Data Canvas</h1>
        <p>Opening your local workspace…</p>
      </div>
    );
  const stateLabel =
    status === "ready"
      ? "Ready"
      : status === "running"
        ? "Running"
        : status === "stale"
          ? "Stale"
          : status === "canceled"
            ? "Canceled"
            : status === "failed"
              ? "Needs attention"
              : "Starting";
  return (
    <div className={"app " + (dark ? "dark" : "")}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setShowExamples(true)}
          aria-label="Data Canvas examples"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>Data Canvas</span>
          <span className="beta-label">LOCAL FIRST</span>
        </button>
        <div className="top-divider" />
        <input
          className="project-title"
          aria-label="Project title"
          value={p.title}
          onChange={(e) =>
            edit((p) => {
              p.title = e.target.value;
            }, false)
          }
        />
        <nav className="menus">
          <details>
            <summary>
              File <ChevronDown size={12} />
            </summary>
            <div className="menu-popover">
              <button
                onClick={() =>
                  loadBundle({ project: blankProject(), assets: {} })
                }
              >
                New project
              </button>
              <button onClick={() => openInput.current?.click()}>
                Open project…
              </button>
              <button
                onClick={() => {
                  setReplaceSource(undefined);
                  fileInput.current?.click();
                }}
              >
                Import data…
              </button>
              <button
                onClick={() =>
                  download(p.title + ".datacanvas", packBundle(bundle))
                }
              >
                Save portable project <kbd>⌘ S</kbd>
              </button>
              <hr />
              <button onClick={exportTable}>
                Export clean CSV + dictionary
              </button>
              <button onClick={exportSQL}>Export SQL + source assets</button>
              <hr />
              <button onClick={() => setShowExamples(true)}>
                Example projects
              </button>
              <button
                onClick={() =>
                  recoveries()
                    .then(setShowRecovery)
                    .catch((e) => setError(e.message))
                }
              >
                Recover another draft…
              </button>
            </div>
          </details>
          <details>
            <summary>
              Edit <ChevronDown size={12} />
            </summary>
            <div className="menu-popover">
              <button disabled={!history.current.length} onClick={() => undo()}>
                Undo
              </button>
              <button
                disabled={!future.current.length}
                onClick={() => undo(true)}
              >
                Redo
              </button>
              <button disabled={!op} onClick={() => mutateOp("duplicate")}>
                Duplicate operation
              </button>
              <button disabled={!op} onClick={() => mutateOp("delete")}>
                Delete operation
              </button>
            </div>
          </details>
        </nav>
        <div className="top-actions">
          <button
            className="icon-button"
            title="Undo"
            aria-label="Undo"
            disabled={!history.current.length}
            onClick={() => undo()}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="Redo"
            aria-label="Redo"
            disabled={!future.current.length}
            onClick={() => undo(true)}
          >
            <Redo2 size={17} />
          </button>
          <div className="top-divider" />
          <button
            className="step-button"
            onClick={() => run("step")}
            disabled={!recipe || status === "running"}
          >
            <StepForward size={16} />
            Step
          </button>
          {status === "running" ? (
            <button
              className="run-button"
              onClick={() => {
                runSerial.current++;
                client.current?.invalidate();
                client.current?.cancel();
                setStatus("canceled");
                setResult(undefined);
                setProgress("Canceled · your project is preserved");
              }}
            >
              <Square size={14} />
              Cancel
            </button>
          ) : (
            <button className="run-button" onClick={() => run("selected")}>
              <Play size={15} fill="currentColor" />
              Run
            </button>
          )}
          <button
            className="icon-button run-all"
            aria-label="Run all outputs"
            title="Run all outputs"
            onClick={() => run("all")}
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Help"
            onClick={() => setShowHelp(true)}
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>
      <div className="subbar">
        <div className="workspace-tabs">
          <button
            className={view === "workspace" ? "active" : ""}
            onClick={() => setView("workspace")}
          >
            <Layers size={15} />
            Workspace
          </button>
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            <GitBranch size={15} />
            Dependencies
          </button>
          <button
            className={view === "sql" ? "active" : ""}
            onClick={() => setView("sql")}
          >
            <Code2 size={15} />
            SQL workspace
          </button>
          <button
            className={view === "report" ? "active" : ""}
            onClick={() => setView("report")}
          >
            <BookOpen size={15} />
            Report
          </button>
        </div>
        <div className="recovery-status">
          <span className={"status-dot " + status} />
          <span>{stateLabel}</span>
          <span className="sub-divider">/</span>
          <Check size={13} />
          <span>{saveStatus}</span>
        </div>
      </div>
      <div className="mobile-panes">
        {["Project", "Canvas", "Inspector"].map((name) => (
          <button
            key={name}
            className={pane === name ? "active" : ""}
            onClick={() => setPane(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="workbench" data-pane={pane}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <span className="eyebrow">PROJECT LIBRARY</span>
            <button
              className="icon-button"
              aria-label="Import data"
              onClick={() => {
                setReplaceSource(undefined);
                fileInput.current?.click();
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="project-tree">
            <div className="tree-group">
              <h3>
                <Table2 size={14} />
                Sources <span>{p.sources.length}</span>
              </h3>
              {p.sources.map((s) => (
                <button
                  key={s.id}
                  className={
                    "tree-item " +
                    (selected.id === s.id && view === "workspace"
                      ? "active"
                      : "")
                  }
                  onClick={() => open("source", s.id)}
                >
                  <span className="tree-glyph source">▦</span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <div className="tree-group">
              <h3>
                <Layers size={14} />
                Recipes <span>{p.recipes.length}</span>
                <button
                  aria-label="New recipe"
                  className="icon-button"
                  onClick={() => addRecipe()}
                >
                  <Plus size={13} />
                </button>
              </h3>
              {p.recipes.map((r) => (
                <button
                  key={r.id}
                  className={
                    "tree-item " +
                    (selected.id === r.id && view === "workspace"
                      ? "active"
                      : "")
                  }
                  onClick={() => open("recipe", r.id)}
                >
                  <span className="tree-glyph recipe">≋</span>
                  <span>{r.name}</span>
                  {result?.errors.some((e) => e.recipeId === r.id) && (
                    <AlertTriangle size={13} />
                  )}
                </button>
              ))}
            </div>
            <div className="tree-group">
              <h3>
                <BarChart3 size={14} />
                Charts <span>{p.charts.length}</span>
              </h3>
              {p.charts.map((c) => (
                <button
                  key={c.id}
                  className={
                    "tree-item " +
                    (selected.id === c.id && view === "workspace"
                      ? "active"
                      : "")
                  }
                  onClick={() => open("chart", c.id)}
                >
                  <span className="tree-glyph chart">▥</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="toolbox">
            <div className="sidebar-top">
              <span className="eyebrow">OPERATION TOOLBOX</span>
              <span className="key-hint">+</span>
            </div>
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label="Search operations"
                placeholder="Find an operation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {insertAt !== null && (
              <p className="insert-notice">
                Insert at boundary {insertAt}{" "}
                <button
                  aria-label="Cancel insertion"
                  onClick={() => setInsertAt(null)}
                >
                  ×
                </button>
              </p>
            )}
            {categories.map((category) => (
              <details
                key={category}
                open={search ? true : undefined}
                className="tool-category"
              >
                <summary>
                  <span
                    className="category-dot"
                    style={{
                      background: Object.values(registry).find(
                        (o) => o.category === category,
                      )?.color,
                    }}
                  />
                  {category}
                  <ChevronRight size={13} />
                </summary>
                {Object.entries(registry)
                  .filter(
                    ([_, def]) =>
                      def.category === category &&
                      (!search ||
                        [def.label, def.description]
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase())),
                  )
                  .map(([kind, def]) => (
                    <button
                      className="tool-item"
                      key={kind}
                      disabled={!recipe}
                      onClick={() => addOperation(kind as OpKind)}
                    >
                      <Plus size={13} />
                      {def.label}
                    </button>
                  ))}
              </details>
            ))}
            <p className="tool-hint">
              Choose a recipe, then click to add.
              <br />
              Drag blocks to snap and reorder.
            </p>
          </div>
          <button
            className="examples-button"
            onClick={() => setShowExamples(true)}
          >
            <BookOpen size={16} />
            <span>
              Explore an example<small>Small data. Useful questions.</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="privacy-note">
            <span>◉</span>No account. No upload. Your data stays here.
          </div>
        </aside>
        <main className={"main-area " + (maximized ? "table-maximized" : "")}>
          {error && (
            <div className="global-alert" role="alert">
              <AlertTriangle size={16} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {view === "overview" ? (
            <Overview
              project={p}
              onOpen={open}
              onInspect={(r) => {
                open(r.kind, r.id);
                setBottom("After");
              }}
            />
          ) : view === "report" ? (
            <Report
              project={p}
              client={client.current!}
              result={result}
              onChange={(items) =>
                edit((p) => {
                  p.reportItems = items;
                }, false)
              }
              onError={setError}
            />
          ) : view === "sql" ? (
            <QueryView
              project={p}
              client={client.current!}
              onChange={(queries) =>
                edit((p) => {
                  p.queries = queries;
                }, false)
              }
            />
          ) : chart ? (
            <ChartView
              chart={chart}
              columns={result?.tables[chart.inputRecipeId]?.columns || []}
              project={p}
              client={client.current!}
              revision={result?.revision ?? -1}
              onChange={(c) =>
                edit((p) => {
                  p.charts = p.charts.map((x) => (x.id === c.id ? c : x));
                }, false)
              }
              onContributors={(ids) => {
                showContributors(ids);
                setNotice(
                  `${ids.length} source contributions selected. Use the contributing-records drawer below.`,
                );
              }}
              onExtract={extractChart}
              onCreateFilter={(chart, expression) => {
                const id = uid("recipe");
                edit((p) =>
                  p.recipes.push({
                    id,
                    name: chart.name + " · selected records",
                    inputRef: { kind: "recipe", id: chart.inputRecipeId },
                    rowMeaning:
                      p.recipes.find((r) => r.id === chart.inputRecipeId)
                        ?.rowMeaning || "",
                    operations: [
                      {
                        id: uid("op"),
                        kind: "filter",
                        version: 1,
                        params: { expression },
                        note: "Explicit category/range predicate created from a chart selection.",
                      },
                    ],
                  }),
                );
                open("recipe", id);
              }}
            />
          ) : recipe || source ? (
            <>
              <div className="recipe-upper">
                <section className="recipe-canvas">
                  <div className="editor-heading">
                    <div className="recipe-title">
                      <div className="eyebrow">
                        {source ? "IMMUTABLE SOURCE" : "TABLE RECIPE"}{" "}
                        <span>
                          {" "}
                          /{" "}
                          {String(
                            p.recipes.findIndex((r) => r.id === recipe?.id) + 1,
                          ).padStart(2, "0")}
                        </span>
                      </div>
                      <h2>{recipe?.name || source?.name}</h2>
                    </div>
                    <div className="inline">
                      {recipe && (
                        <>
                          <button
                            className="quiet"
                            onClick={() =>
                              addRecipe({ kind: "recipe", id: recipe.id })
                            }
                          >
                            <GitBranch size={15} />
                            Branch
                          </button>
                          <button
                            className="outline-accent"
                            onClick={visualize}
                          >
                            <BarChart3 size={15} />
                            Visualize table
                          </button>
                        </>
                      )}
                      {source && (
                        <button
                          className="primary"
                          onClick={() =>
                            addRecipe({ kind: "source", id: source.id })
                          }
                        >
                          <Plus size={15} />
                          Build a recipe
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="recipe-context">
                    <span>One row represents</span>
                    <input
                      aria-label="Row meaning"
                      placeholder="Describe the unit of observation…"
                      value={recipe?.rowMeaning || source?.rowMeaning || ""}
                      onChange={(e) =>
                        recipe
                          ? changeRecipe((r) => {
                              r.rowMeaning = e.target.value;
                            })
                          : edit((p) => {
                              p.sources.find(
                                (s) => s.id === source!.id,
                              )!.rowMeaning = e.target.value;
                            }, false)
                      }
                    />
                  </div>
                  {recipe ? (
                    <>
                      <div className="canvas-toolbar">
                        <div className="segmented">
                          {["Blocks", "Recipe list"].map((e) => (
                            <button
                              key={e}
                              className={editor === e ? "active" : ""}
                              onClick={() => setEditor(e)}
                            >
                              {e === "Blocks" ? (
                                <BlocksIcon size={14} />
                              ) : (
                                <List size={14} />
                              )}{" "}
                              {e}
                            </button>
                          ))}
                        </div>
                        <span>{recipe.operations.length} operations</span>
                        <label className="auto-preview">
                          <input
                            type="checkbox"
                            checked={auto}
                            onChange={(e) => setAuto(e.target.checked)}
                          />
                          Auto preview
                        </label>
                      </div>
                      {editor === "Blocks" ? (
                        <Blocks
                          recipe={recipe}
                          sourceName={
                            [...p.sources, ...p.recipes].find(
                              (s) => s.id === recipe.inputRef.id,
                            )?.name || "Missing input"
                          }
                          columns={usefulColumns(
                            recipe,
                            steps,
                            getColumns(recipe.inputRef),
                          )}
                          steps={steps}
                          selected={operationId}
                          onSelect={(id) => {
                            setOperationId(id);
                            setInspector("Configure");
                          }}
                          onChange={(ops) =>
                            changeRecipe((r) => {
                              r.operations = ops;
                            })
                          }
                        />
                      ) : (
                        <div className="recipe-list">
                          <button
                            className={
                              "from-block " + (!operationId ? "selected" : "")
                            }
                            onClick={() => setOperationId("@input")}
                          >
                            <Table2 size={17} />
                            <span>
                              FROM{" "}
                              <strong>
                                {
                                  [...p.sources, ...p.recipes].find(
                                    (s) => s.id === recipe.inputRef.id,
                                  )?.name
                                }
                              </strong>
                            </span>
                          </button>
                          {recipe.operations.map((o, i) => (
                            <div key={o.id}>
                              <button
                                className="insert-boundary"
                                aria-label={`Insert before step ${i + 1}`}
                                onClick={() => {
                                  setInsertAt(i);
                                  setPane("Project");
                                }}
                              >
                                <Plus size={12} />
                                Insert operation here
                              </button>
                              <div
                                className={
                                  "operation-card " +
                                  (operationId === o.id ? "selected" : "")
                                }
                                style={
                                  {
                                    "--category":
                                      registry[o.kind as OpKind]?.color,
                                  } as React.CSSProperties
                                }
                              >
                                <button
                                  className="operation-main"
                                  onClick={() => setOperationId(o.id)}
                                >
                                  <span className="operation-number">
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  <div>
                                    <strong>
                                      {registry[o.kind as OpKind]?.label}
                                    </strong>
                                    <p>
                                      {operationDetail(
                                        o,
                                        steps[i]?.before.columns || columns,
                                      )}
                                    </p>
                                    <small>
                                      {steps[i]?.error
                                        ? "Error: " + steps[i].error
                                        : steps[i]?.after
                                          ? `${steps[i].before.rowCount} → ${steps[i].after!.rowCount} rows · ${steps[i].after!.columns.length} columns`
                                          : "Not evaluated"}
                                    </small>
                                  </div>
                                </button>
                                <div className="operation-list-actions">
                                  <button
                                    aria-label={`Move step ${i + 1} up`}
                                    disabled={i === 0}
                                    onClick={() =>
                                      changeRecipe((r) => {
                                        [r.operations[i - 1], r.operations[i]] =
                                          [
                                            r.operations[i],
                                            r.operations[i - 1],
                                          ];
                                      })
                                    }
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    aria-label={`Move step ${i + 1} down`}
                                    disabled={
                                      i === recipe.operations.length - 1
                                    }
                                    onClick={() =>
                                      changeRecipe((r) => {
                                        [r.operations[i + 1], r.operations[i]] =
                                          [
                                            r.operations[i],
                                            r.operations[i + 1],
                                          ];
                                      })
                                    }
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                  <button
                                    aria-label={`Delete step ${i + 1}`}
                                    onClick={() =>
                                      changeRecipe((r) =>
                                        r.operations.splice(i, 1),
                                      )
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            className="insert-boundary"
                            onClick={() => {
                              setInsertAt(recipe.operations.length);
                              setPane("Project");
                            }}
                          >
                            <Plus size={12} />
                            Add the next operation
                          </button>
                        </div>
                      )}
                      <div className="canvas-footer">
                        <span>↳ Select a block to see what it changes.</span>
                        <button
                          className="quiet"
                          onClick={() => {
                            setInsertAt(recipe.operations.length);
                            setPane("Project");
                            setSearch("");
                          }}
                        >
                          <Plus size={14} />
                          Add operation
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="source-overview">
                      <div className="source-icon">
                        <Table2 size={40} />
                      </div>
                      <h3>The original, always within reach.</h3>
                      <p>
                        Source bytes and import settings are preserved in your
                        project. Preview values are read-only; every data edit
                        belongs in a recipe.
                      </p>
                      <div className="source-facts">
                        <span>
                          <strong>
                            {result?.tables[source!.id]?.rowCount ?? "—"}
                          </strong>{" "}
                          rows
                        </span>
                        <span>
                          <strong>{source!.columns.length}</strong> columns
                        </span>
                        <span>
                          <strong>
                            {source!.importSpec.format.toUpperCase()}
                          </strong>{" "}
                          source
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setReplaceSource(source);
                          fileInput.current?.click();
                        }}
                      >
                        Replace source with reviewed mapping…
                      </button>
                      <small>
                        SHA-256 · {source!.fingerprint.slice(0, 24)}…
                      </small>
                    </div>
                  )}
                </section>
                <aside className="inspector">
                  <div className="inspector-tabs">
                    {["Configure", "Explain", "Checks", "SQL"].map((t) => (
                      <button
                        key={t}
                        className={inspector === t ? "active" : ""}
                        onClick={() => setInspector(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="inspector-content">
                    {inspector === "Configure" ? (
                      op && recipe ? (
                        <>
                          <div className="operation-actions">
                            <button
                              title="Move up"
                              aria-label="Move operation up"
                              onClick={() => mutateOp("up")}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              title="Move down"
                              aria-label="Move operation down"
                              onClick={() => mutateOp("down")}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              title="Duplicate"
                              aria-label="Duplicate operation"
                              onClick={() => mutateOp("duplicate")}
                            >
                              <Copy size={15} />
                            </button>
                            <button
                              title="Delete"
                              aria-label="Delete operation"
                              onClick={() => mutateOp("delete")}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <Configure
                            operation={op}
                            previewRegex={(params, sample) =>
                              client.current!.request("regexPreview", {
                                params,
                                sample,
                              })
                            }
                            columns={columns}
                            project={p}
                            referenceColumns={getColumns}
                            onChange={(updated) =>
                              changeRecipe((r) => {
                                r.operations = r.operations.map((o) =>
                                  o.id === updated.id ? updated : o,
                                );
                              })
                            }
                          />
                          <button
                            className="extract-button"
                            onClick={extractPrefix}
                          >
                            Extract prefix as recipe
                          </button>
                        </>
                      ) : recipe ? (
                        <>
                          <div className="eyebrow">RECIPE SETTINGS</div>
                          <h3>A named, reusable table.</h3>
                          <Text
                            label="Recipe name"
                            value={recipe.name}
                            onChange={(v) =>
                              changeRecipe((r) => {
                                r.name = v;
                              })
                            }
                          />
                          <RefSelect
                            label="Start from"
                            value={recipe.inputRef}
                            project={p}
                            onChange={(v) => {
                              try {
                                const clone = structuredClone(p);
                                clone.recipes.find(
                                  (r) => r.id === recipe.id,
                                )!.inputRef = v;
                                validateProject(clone);
                                changeRecipe((r) => {
                                  r.inputRef = v;
                                });
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          />
                          <p className="muted">
                            Select an operation to configure it. Use the toolbox
                            to add your next step.
                          </p>
                          <button
                            className="danger-text"
                            onClick={() => {
                              const used =
                                p.recipes.some((r) =>
                                  dependencies(r).some(
                                    (d) => d.id === recipe.id,
                                  ),
                                ) ||
                                p.charts.some(
                                  (c) => c.inputRecipeId === recipe.id,
                                );
                              if (used) {
                                setError(
                                  "This recipe is referenced by another recipe or chart. Update those references before deleting it.",
                                );
                                return;
                              }
                              edit((p) => {
                                p.recipes = p.recipes.filter(
                                  (r) => r.id !== recipe.id,
                                );
                              });
                              setSelected({
                                kind: "source",
                                id: p.sources[0]?.id || "",
                              });
                            }}
                          >
                            Delete recipe
                          </button>
                        </>
                      ) : source ? (
                        <>
                          <h3>Source metadata</h3>
                          <Text
                            label="Attribution"
                            value={source.attribution}
                            onChange={(v) =>
                              edit((p) => {
                                p.sources.find(
                                  (s) => s.id === source.id,
                                )!.attribution = v;
                              }, false)
                            }
                          />
                          {source.columns.map((c) => (
                            <details key={c.id}>
                              <summary>
                                {c.name} <small>{c.type}</small>
                              </summary>
                              <Select
                                label="Analytical role"
                                value={c.role}
                                options={[
                                  "nominal",
                                  "ordinal",
                                  "quantitative",
                                  "temporal",
                                  "identifier",
                                ]}
                                onChange={(v) =>
                                  edit((p) => {
                                    p.sources
                                      .find((s) => s.id === source.id)!
                                      .columns.find(
                                        (x) => x.id === c.id,
                                      )!.role = v as Column["role"];
                                  })
                                }
                              />
                              <Text
                                label="Units"
                                value={c.units || ""}
                                onChange={(v) =>
                                  edit((p) => {
                                    p.sources
                                      .find((s) => s.id === source.id)!
                                      .columns.find(
                                        (x) => x.id === c.id,
                                      )!.units = v;
                                  }, false)
                                }
                              />
                              <Field label="Ordered category levels (one per line)">
                                <textarea
                                  value={c.levels?.join("\n") || ""}
                                  onChange={(e) =>
                                    edit((p) => {
                                      p.sources
                                        .find((s) => s.id === source.id)!
                                        .columns.find(
                                          (x) => x.id === c.id,
                                        )!.levels = e.target.value
                                        ? e.target.value.split("\n")
                                        : undefined;
                                    })
                                  }
                                />
                              </Field>
                              <Text
                                label="Description"
                                value={c.description || ""}
                                onChange={(v) =>
                                  edit((p) => {
                                    p.sources
                                      .find((s) => s.id === source.id)!
                                      .columns.find(
                                        (x) => x.id === c.id,
                                      )!.description = v;
                                  }, false)
                                }
                              />
                            </details>
                          ))}
                        </>
                      ) : null
                    ) : inspector === "Explain" ? (
                      <>
                        <div className="eyebrow">DETERMINISTIC EXPLANATION</div>
                        <h3>
                          {op
                            ? registry[op.kind as OpKind].label
                            : "How this table works"}
                        </h3>
                        <p>
                          {op
                            ? registry[op.kind as OpKind].description
                            : "Immutable sources feed named recipes. Every operation has inspectable input and output."}
                        </p>
                        {step?.after && (
                          <div className="explain-counts">
                            <strong>
                              {step.before.rowCount.toLocaleString()}
                            </strong>
                            <span>input rows</span>
                            <span>↓</span>
                            <strong>
                              {step.after.rowCount.toLocaleString()}
                            </strong>
                            <span>output rows</span>
                          </div>
                        )}
                        {op?.note && <blockquote>{op.note}</blockquote>}
                        {step?.after?.reviewMeaning && (
                          <p className="warning-box">
                            This operation changes table structure. Review the
                            authored unit of observation.
                          </p>
                        )}
                        <p className="muted">
                          Missing is distinct from blank text and zero. Without
                          Sort, preview order is a convenience, not an
                          analytical guarantee.
                        </p>
                      </>
                    ) : inspector === "Checks" ? (
                      <>
                        <h3>Quality & diagnostics</h3>
                        {result ? (
                          <p
                            className={
                              result.diagnostics.some(
                                (d) => d.severity === "required",
                              )
                                ? "warning-box"
                                : "success-box"
                            }
                          >
                            {result.diagnostics.some(
                              (d) => d.severity === "required",
                            )
                              ? "Required checks failed — results remain inspectable."
                              : result.status === "failed"
                                ? "Some outputs failed; checks may be incomplete."
                                : "All evaluated required checks passed."}
                          </p>
                        ) : (
                          <p className="muted">
                            Run to evaluate checks. No counts have been computed
                            yet.
                          </p>
                        )}
                        {[
                          ...(step?.after?.diagnostics || []),
                          ...(result?.diagnostics.filter(
                            (d) => d.operationId !== op?.id,
                          ) || []),
                        ].map((d, i) => (
                          <div className={"diagnostic " + d.severity} key={i}>
                            <strong>
                              {d.severity === "info" ? "ⓘ" : "⚠"} {d.message}
                            </strong>
                            {d.examples?.length ? (
                              <pre>
                                {JSON.stringify(
                                  d.examples,
                                  (_, v) =>
                                    typeof v === "bigint" ? String(v) : v,
                                  2,
                                )}
                              </pre>
                            ) : null}
                          </div>
                        ))}
                        {result?.errors.map((e, i) => (
                          <p key={i} className="error-box">
                            {e.message}
                          </p>
                        ))}
                      </>
                    ) : (
                      <>
                        <h3>Generated DuckDB SQL</h3>
                        <p className="muted">
                          Read-only projection of the canonical recipe. Select a
                          block to see its mapped query.
                        </p>
                        {steps.map((s) => (
                          <button
                            className={
                              "sql-step " +
                              (s.operationId === operationId ? "active" : "")
                            }
                            key={s.operationId}
                            onClick={() => setOperationId(s.operationId)}
                          >
                            {
                              registry[
                                recipe?.operations.find(
                                  (o) => o.id === s.operationId,
                                )?.kind as OpKind
                              ]?.label
                            }
                          </button>
                        ))}
                        <pre className="sql-code">
                          {step?.after?.sql ||
                            result?.tables[selected.id]?.sql ||
                            "Run the recipe to resolve its schema and generate SQL."}
                        </pre>
                        <button onClick={exportSQL}>
                          Export runnable SQL + sources
                        </button>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <div className="empty-state welcome">
              <div className="brand-mark">▦</div>
              <div className="eyebrow">A PLACE TO THINK WITH DATA</div>
              <h1>
                Start with a table.
                <br />
                Follow your curiosity.
              </h1>
              <p>
                Build a recipe, inspect every change, and turn a dataset into a
                story you can explain.
              </p>
              <div className="inline">
                <button
                  className="primary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={17} />
                  Import a dataset
                </button>
                <button onClick={() => setShowExamples(true)}>
                  Explore examples
                </button>
              </div>
              <small>CSV · TSV · Excel / local and private by default</small>
            </div>
          )}
          {view === "workspace" && (recipe || source || chart) && (
            <section
              className="bottom-inspector"
              style={{ height: maximized ? "100%" : tableHeight }}
            >
              <div
                className="resize-handle"
                role="separator"
                aria-label="Resize table inspector"
                aria-orientation="horizontal"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp")
                    setTableHeight((h) => Math.min(600, h + 30));
                  if (e.key === "ArrowDown")
                    setTableHeight((h) => Math.max(160, h - 30));
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const start = e.clientY,
                    initial = tableHeight;
                  const move = (event: PointerEvent) =>
                    setTableHeight(
                      Math.max(
                        160,
                        Math.min(
                          window.innerHeight - 190,
                          initial + start - event.clientY,
                        ),
                      ),
                    );
                  const end = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", end);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", end);
                }}
              />
              <div className="bottom-toolbar">
                <div className="bottom-tabs">
                  {[
                    "Before",
                    "After",
                    "Column profiles",
                    "Changes",
                    "Contributing records",
                  ].map((t) => (
                    <button
                      key={t}
                      className={bottom === t ? "active" : ""}
                      onClick={() => setBottom(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="inline">
                  <span className={"result-state " + status}>
                    {status === "ready" ? "● Current" : stateLabel}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={
                      maximized
                        ? "Restore inspector size"
                        : "Maximize inspector"
                    }
                    onClick={() => setMaximized(!maximized)}
                  >
                    {maximized ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </button>
                </div>
              </div>
              <div className="bottom-content">
                {bottom === "Before" || bottom === "After" ? (
                  <DataTable
                    table={
                      bottom === "Before"
                        ? before || undefined
                        : chart
                          ? result?.tables[chart.inputRecipeId]
                          : table
                    }
                    selected={rowSelected}
                    onSelect={(i) => {
                      setRowSelected(i);
                      const t =
                        bottom === "Before"
                          ? before
                          : chart
                            ? result?.tables[chart.inputRecipeId]
                            : table;
                      if (t) showContributors(t.lineage[i]);
                    }}
                  />
                ) : bottom === "Column profiles" ? (
                  <Profiles
                    key={`${result?.revision}:${table?.id}`}
                    loadDistribution={(tableId, columnId) =>
                      client.current!.request("distribution", {
                        tableId,
                        columnId,
                      })
                    }
                    table={chart ? result?.tables[chart.inputRecipeId] : table}
                  />
                ) : bottom === "Changes" ? (
                  step?.after ? (
                    <div className="changes">
                      <div>
                        <strong>
                          {step.after.rowCount - step.before.rowCount > 0
                            ? "+"
                            : ""}
                          {step.after.rowCount - step.before.rowCount}
                        </strong>
                        <span>row change</span>
                      </div>
                      <div>
                        <strong>
                          {step.after.columns.length -
                            step.before.columns.length >
                          0
                            ? "+"
                            : ""}
                          {step.after.columns.length -
                            step.before.columns.length}
                        </strong>
                        <span>column change</span>
                      </div>
                      <div>
                        <strong>
                          {step.after.profiles.reduce(
                            (s, p) => s + p.missing,
                            0,
                          ) -
                            step.before.profiles.reduce(
                              (s, p) => s + p.missing,
                              0,
                            )}
                        </strong>
                        <span>net missing-cell change</span>
                      </div>
                      <section>
                        <p>
                          {step.after.diagnostics
                            .map((d) => d.message)
                            .join(" ") ||
                            "Row-preserving operation; inspect Before and After for value changes."}
                        </p>
                        {step.after.reviewMeaning && (
                          <p className="warning-box">
                            Row meaning needs review after this structural
                            change.
                          </p>
                        )}
                        <p>
                          Added:{" "}
                          {step.after.columns
                            .filter(
                              (c) =>
                                !step.before.columns.some((x) => x.id === c.id),
                            )
                            .map((c) => c.name)
                            .join(", ") || "none"}{" "}
                          · Removed:{" "}
                          {step.before.columns
                            .filter(
                              (c) =>
                                !step.after!.columns.some((x) => x.id === c.id),
                            )
                            .map((c) => c.name)
                            .join(", ") || "none"}
                        </p>
                      </section>
                    </div>
                  ) : (
                    <div className="empty-state small">
                      <p>
                        Select an evaluated operation to inspect its changes.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="contributors">
                    {lineage.length ? (
                      <>
                        <p>
                          <strong>{lineage.length}</strong> distinct source
                          records contribute. This is value lineage; the recipe
                          records transformation provenance.
                        </p>
                        {contributorRows.map((group: any) => (
                          <div key={group.source.id}>
                            <h4>
                              {group.source.name} · showing {group.rows.length}{" "}
                              of {group.count}
                            </h4>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Source row</th>
                                    {group.source.columns.map((c: Column) => (
                                      <th key={c.id}>{c.name}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((row: any) => (
                                    <tr key={row.index}>
                                      <td>{row.index}</td>
                                      {row.values?.map((v: any, i: number) => (
                                        <td key={i}>{v === null ? "∅" : v}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="muted">
                        Select a table row or click a chart mark to inspect its
                        source records.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
      <footer className="statusbar">
        <span>
          <span className={"status-dot " + status} />
          {progress}
        </span>
        <span>
          DuckDB {result?.engineVersion || "Wasm"}{" "}
          <span className="sub-divider">/</span>All statistics use the full
          input <span className="sub-divider">/</span>Local workspace
        </span>
      </footer>
      <input
        hidden
        ref={fileInput}
        type="file"
        accept=".csv,.tsv,.xlsx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setImportFile(file);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={openInput}
        type="file"
        accept=".datacanvas"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            try {
              await loadBundle(
                unpackBundle(new Uint8Array(await file.arrayBuffer())),
              );
            } catch (e) {
              setError((e as Error).message);
            }
        }}
      />
      {importFile && (
        <ImportDialog
          file={importFile}
          replacement={replaceSource}
          onClose={() => {
            setImportFile(undefined);
            setReplaceSource(undefined);
          }}
          onImport={(source, bytes) => {
            const project = structuredClone(p);
            if (replaceSource)
              project.sources = project.sources.map((s) =>
                s.id === source.id ? source : s,
              );
            else project.sources.push(source);
            commit({
              project,
              assets: { ...bundle.assets, [source.assetRef]: bytes },
            });
            setImportFile(undefined);
            setReplaceSource(undefined);
            open("source", source.id);
          }}
        />
      )}
      {showExamples && (
        <div className="modal-backdrop">
          <section
            className="modal examples-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="examples-title"
          >
            <header>
              <div>
                <div className="eyebrow">SMALL DATA. USEFUL QUESTIONS.</div>
                <h2 id="examples-title">Find your next starting point.</h2>
                <p>
                  Ordinary, fully editable projects. Your current draft stays in
                  recovery.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close examples"
                onClick={() => setShowExamples(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="example-grid">
              {exampleInfo.map((info, i) => (
                <button
                  className="example-card"
                  key={info.id}
                  onClick={async () => loadBundle(await example(info.id))}
                >
                  <div className={"example-art art-" + i}>
                    {i === 0 ? (
                      <>
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </>
                    ) : i === 1 ? (
                      <>
                        <span>001</span>
                        <span>001</span>
                        <span>002</span>
                      </>
                    ) : (
                      <>
                        <i />
                        <i />
                        <i />
                      </>
                    )}
                  </div>
                  <span className="eyebrow">{info.tag}</span>
                  <h3>{info.title}</h3>
                  <p>{info.description}</p>
                  <span className="example-open">
                    Open project <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
            <footer>
              <span>Synthetic datasets · CC0 · no external data requests</span>
            </footer>
          </section>
        </div>
      )}
      {showRecovery && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Recover a project"
          >
            <header>
              <h2>Your local drafts</h2>
              <button
                onClick={() => setShowRecovery(undefined)}
                aria-label="Close recovery"
              >
                <X size={18} />
              </button>
            </header>
            <div className="recovery-list">
              {showRecovery
                .sort((a, b) => b.savedAt - a.savedAt)
                .map((r) => (
                  <button
                    key={r.bundle.project.projectId}
                    onClick={() => loadBundle(r.bundle)}
                  >
                    <strong>{r.bundle.project.title}</strong>
                    <span>{new Date(r.savedAt).toLocaleString()}</span>
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Data Canvas guide"
          >
            <header>
              <div>
                <div className="eyebrow">QUICK START</div>
                <h2>Make each step explainable.</h2>
              </div>
              <button
                aria-label="Close help"
                onClick={() => setShowHelp(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="help-content">
              <ol>
                <li>
                  <strong>Import a table.</strong> Review delimiters, missing
                  tokens, types, and the unit of observation.
                </li>
                <li>
                  <strong>Build a recipe.</strong> Click operations in the
                  toolbox or snap blocks into the vertical stack. Configure
                  expressions and nested conditions in the inspector.
                </li>
                <li>
                  <strong>Inspect each change.</strong> Run or Step. Select a
                  block for Before/After, profiles, diagnostics, and its
                  generated SQL.
                </li>
                <li>
                  <strong>Follow the evidence.</strong> Branch a recipe,
                  visualize its full output, and click a mark to inspect
                  contributing records.
                </li>
                <li>
                  <strong>Save and share.</strong> Download a portable
                  .datacanvas file. Browser recovery is automatic and separate
                  from a backup.
                </li>
              </ol>
              <h3>Semantics you can rely on</h3>
              <p>
                Filters keep true only. Missing comparisons are unknown. Null
                join keys never match. Numeric summaries ignore missing;
                all-missing sums are missing. Counts distinguish rows, valid
                values, and distinct nonmissing values. Without Sort, there is
                no analytical ordering. Parsing uses explicit date formats;
                timestamp policy is UTC. Sampling is deterministic with a saved
                seed.
              </p>
              <h3>Keyboard access</h3>
              <p>
                Use Recipe list for the same add, move, configure, and delete
                commands without dragging. Tab moves between controls. Ctrl/⌘ S
                saves a portable project; Ctrl/⌘ Z undoes; Ctrl/⌘ Enter runs.
              </p>
              <h3>Practical limits</h3>
              <p>
                Table previews show 100 rows; statistics use all rows. Raw plots
                are capped at 20,000 marks; aggregate plots at 10,000 groups.
                Large results require explicit aggregation or sampling. The
                project archive limits are 64 MiB compressed / 256 MiB
                decompressed.
              </p>
              <p>
                <a
                  href="https://github.com/davbachman/DataCanvas"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source, developer guide, measured tests, and known limitations
                  ↗
                </a>
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function usefulColumns(recipe: Recipe, steps: any[], input: Column[]) {
  const map = new Map(input.map((c) => [c.id, c]));
  for (const step of steps)
    for (const c of step.before.columns) map.set(c.id, c);
  return [...map.values()];
}

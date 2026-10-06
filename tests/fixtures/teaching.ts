import {
  blankProject,
  column,
  type Bundle,
  type Operation,
  col,
  lit,
  binary,
} from "../../src/domain/model";
import { createSource, defaultImport } from "../../src/persistence/import";
import { newOperation } from "../../src/domain/operations";
export async function teachingFixture(): Promise<Bundle> {
  const bytes = new TextEncoder().encode(
    "id,year,month,day,hour,minute,delay,home,height,wk1,wk2\na,2024,12,31,23,55,10,A,160,1,2\nb,2024,1,1,0,5,-10,A,160,3,4\nc,2024,2,28,23,59,2,A,170,5,6\nd,2024,3,10,2,30,0,A,NA,7,8\ne,2024,11,3,1,30,0,B,180,9,10\nf,2024,5,1,NA,30,NA,B,NA,11,12\ng,2024,1,32,12,0,1,C,150,13,14\nh,2024,12,31,10,0,NA,C,175,15,16\n",
  );
  const names = [
    "id",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "delay",
    "home",
    "height",
    "wk1",
    "wk2",
  ];
  const columns = names.map((n) =>
    column(n, ["id", "home"].includes(n) ? "text" : "integer", n),
  );
  const { source } = await createSource(
    "Teaching observations",
    bytes,
    { ...defaultImport, missingTokens: ["NA"] },
    columns,
  );
  source.id = "teaching_source";
  const project = blankProject();
  project.projectId = "teaching_fixture";
  project.title = "Teaching operations";
  project.sources = [source];
  const dt = (id: string, patch: any): Operation => ({
    ...newOperation("datetime", columns),
    id,
    params: {
      ...newOperation("datetime", columns).params,
      outputId: id,
      name: id,
      year: "year",
      month: "month",
      day: "day",
      hour: "hour",
      minute: "minute",
      ...patch,
    },
  });
  const construct = dt("scheduled", { action: "construct" });
  const add = dt("actual", {
    action: "add",
    columnId: "scheduled",
    amount: col("delay"),
    unit: "minutes",
  });
  const recipe = (id: string, operations: Operation[]) => ({
    id,
    name: id,
    inputRef: { kind: "source" as const, id: source.id },
    operations,
    rowMeaning: "One observation",
  });
  project.recipes = [
    recipe("departures", [
      construct,
      add,
      dt("scheduled_date", {
        action: "extract",
        columnId: "scheduled",
        part: "date",
      }),
      dt("actual_date", {
        action: "extract",
        columnId: "actual",
        part: "date",
      }),
      {
        id: "different_day",
        kind: "derive",
        version: 1,
        params: {
          name: "Different calendar date",
          columnId: "different_day",
          expression: binary("!=", col("scheduled_date"), col("actual_date")),
        },
      },
      dt("formatted", {
        action: "format",
        columnId: "actual",
        format: "%B %d, %Y %I:%M %p",
      }),
      ...["hour", "minute", "weekday", "week", "week_year"].map((part) =>
        dt("part_" + part, { action: "extract", columnId: "actual", part }),
      ),
    ]),
  ];
  for (const ambiguous of ["missing", "earlier", "later"])
    project.recipes.push({
      id: "zone_" + ambiguous,
      name: "zone_" + ambiguous,
      inputRef: { kind: "recipe", id: "departures" },
      operations: [
        dt("utc_" + ambiguous, {
          action: "convert",
          columnId: "scheduled",
          zone: "America/New_York",
          direction: "local_to_utc",
          ambiguous,
        }),
        dt("local_" + ambiguous, {
          action: "convert",
          columnId: "utc_" + ambiguous,
          zone: "America/New_York",
          direction: "utc_to_local",
          ambiguous,
        }),
      ],
      rowMeaning: "Explicit conversion",
    });
  for (const method of ["row_number", "rank", "dense_rank"]) {
    project.recipes.push(
      recipe("rank_" + method, [
        {
          id: "ranking_" + method,
          kind: "rank",
          version: 1,
          params: {
            groups: ["home"],
            order: [{ columnId: "height", direction: "asc", nulls: "last" }],
            method,
            missing: "exclude",
            outputId: "position_" + method,
            name: "Position",
          },
        },
      ]),
    );
  }
  for (const requireFull of [false, true])
    project.recipes.push(
      recipe("top_" + requireFull, [
        {
          id: "top_op_" + requireFull,
          kind: "topk",
          version: 1,
          params: {
            groups: ["home"],
            order: [{ columnId: "height", direction: "asc", nulls: "last" }],
            method: "row_number",
            missing: "exclude",
            k: 3,
            requireFull,
          },
        },
      ]),
    );
  project.recipes.push(
    recipe("rename_weeks", [
      {
        id: "rename_weeks_op",
        kind: "rename_many",
        version: 1,
        params: {
          columns: ["wk1", "wk2"],
          action: "regex",
          search: "^wk([0-9]+)$",
          replacement: "\\1",
          ignoreCase: false,
        },
      },
      {
        id: "week_ref",
        kind: "derive",
        version: 1,
        params: {
          columnId: "week_sum",
          name: "Week total",
          expression: binary("+", col("wk1"), col("wk2")),
        },
      },
    ]),
  );
  project.recipes.push(
    recipe("descending_missing", [
      {
        id: "descending_op",
        kind: "rank",
        version: 1,
        params: {
          groups: ["home"],
          order: [
            { columnId: "height", direction: "desc", nulls: "first" },
            { columnId: "id", direction: "desc", nulls: "last" },
          ],
          method: "row_number",
          missing: "include",
          outputId: "desc_rank",
          name: "Descending rank",
        },
      },
    ]),
  );
  project.recipes.push(
    recipe("top_ties", [
      {
        id: "top_ties_op",
        kind: "topk",
        version: 1,
        params: {
          groups: ["home"],
          order: [{ columnId: "height", direction: "asc", nulls: "last" }],
          method: "rank",
          missing: "exclude",
          k: 1,
          requireFull: false,
        },
      },
    ]),
  );
  project.recipes.push({
    id: "elapsed_overlap",
    name: "Elapsed across fall-back",
    inputRef: { kind: "recipe", id: "zone_earlier" },
    rowMeaning: "One observation",
    operations: [
      dt("one_hour_later", {
        action: "add",
        columnId: "utc_earlier",
        amount: lit(60),
        unit: "minutes",
      }),
      dt("one_hour_local", {
        action: "convert",
        columnId: "one_hour_later",
        direction: "utc_to_local",
        zone: "America/New_York",
      }),
    ],
  });
  project.recipes.push(
    recipe("ordered_categories", [
      {
        id: "home_order",
        kind: "categories",
        version: 1,
        params: { columnId: "home", role: "ordinal", levels: ["C", "A", "B"] },
      },
      {
        id: "month_order",
        kind: "categories",
        version: 1,
        params: {
          columnId: "month",
          role: "ordinal",
          levels: ["12", "1", "2", "3", "5", "11"],
        },
      },
    ]),
  );
  project.charts = [
    {
      id: "grouped",
      name: "Grouped categories",
      inputRecipeId: "ordered_categories",
      annotations: "",
      scales: {},
      layers: [
        {
          id: "groups",
          mark: "count",
          x: "home",
          color: "month",
          stack: "grouped",
          orientation: "horizontal",
        },
      ],
    },
    {
      id: "errors",
      name: "Height uncertainty",
      inputRecipeId: "ordered_categories",
      annotations: "",
      scales: {},
      layers: [
        {
          id: "intervals",
          mark: "errorbar",
          x: "home",
          y: "height",
          constantColor: "navy",
          lineWidth: 3,
          uncertainty: { method: "ci_normal", confidence: 95, multiplier: 1 },
        },
      ],
    },
    {
      id: "bands",
      name: "Standard error bands",
      inputRecipeId: "ordered_categories",
      annotations: "",
      scales: {},
      layers: [
        {
          id: "band",
          mark: "errorband",
          x: "home",
          y: "height",
          constantColor: "rebeccapurple",
          pointMarkers: true,
          lineDash: "dashed",
          uncertainty: { method: "se", multiplier: 2, confidence: 95 },
        },
      ],
    },
    {
      id: "styled_lines",
      name: "Line styles",
      inputRecipeId: "ordered_categories",
      annotations: "",
      scales: {},
      layers: [
        {
          id: "lines",
          mark: "line",
          x: "month",
          y: "height",
          strokeDashField: "home",
          shape: "home",
          pointMarkers: true,
          lineDash: "dashdot",
          lineWidth: 2.5,
          opacity: 0.7,
        },
      ],
    },
  ];
  project.submission = {
    enabled: true,
    required: [
      { kind: "recipe", name: "departures" },
      { kind: "chart", name: "Height uncertainty" },
    ],
  };
  return { project, assets: { [source.assetRef]: bytes } };
}

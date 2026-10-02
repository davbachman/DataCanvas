import { mappingExample } from "./map-example";
import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Bundle,
  type Operation,
  type Chart,
} from "./domain/model";
import { createSource, defaultImport } from "./persistence/import";
export const exampleInfo = [
  {
    id: "mapping",
    title: "Places, points & regions",
    description: "Map coordinates and compare country summaries",
    tag: "MAP · MATCH · INSPECT",
  },
  {
    id: "temperatures",
    title: "Messy temperatures",
    description: "From wide measurements to a regional story",
    tag: "CLEAN · RESHAPE · SUMMARIZE",
  },
  {
    id: "transactions",
    title: "Transactions & products",
    description: "Discover what duplicate lookup keys change",
    tag: "JOIN · CHECK · TRACE",
  },
  {
    id: "weighting",
    title: "Unequal group sizes",
    description: "Two defensible averages. Two different answers.",
    tag: "BRANCH · COMPARE · REPORT",
  },
];
const op = (id: string, kind: string, params: any, note = ""): Operation => ({
  id,
  kind,
  version: 1,
  params,
  note,
});
export async function example(name = "temperatures"): Promise<Bundle> {
  if (name === "mapping") return mappingExample();
  const project = blankProject(),
    assets: Bundle["assets"] = {};
  project.projectId = "example_" + name;
  async function source(
    id: string,
    name: string,
    text: string,
    definitions: [string, string, "text" | "decimal"][],
    missing: string[] = [],
  ) {
    const bytes = new TextEncoder().encode(text);
    const { source } = await createSource(
      name,
      bytes,
      { ...defaultImport, missingTokens: missing },
      definitions.map(([id, name, type]) => column(name, type, id)),
    );
    source.id = id;
    source.assetRef = `sources/${id}.csv`;
    source.attribution = "Synthetic example data created for Data Canvas, CC0.";
    source.rowMeaning =
      id === "stations"
        ? "One weather station (intended; check duplicate keys)."
        : id === "measurements"
          ? "One station’s monthly measurements in 2025."
          : "One observation.";
    project.sources.push(source);
    assets[source.assetRef] = bytes;
    return { kind: "source" as const, id };
  }
  const chart = (
    id: string,
    name: string,
    recipe: string,
    x: string,
    y: string,
  ): Chart => ({
    id,
    name,
    inputRecipeId: recipe,
    layers: [
      { id: id + "_layer", mark: "bar", x, y, constantColor: "#277c6c" },
    ],
    scales: { zero: true },
    annotations: "",
  });
  if (name === "temperatures") {
    project.title = "A warmer kind of data";
    const s = await source(
      "measurements",
      "Monthly measurements",
      "station_id,region,Jan,Feb,Mar\n001, North ,4.2,6.1,9.3\n002,North,5.1,NA,10.2\n003, South ,12.4,14.7,18.2\n004,South,13.1,bad,19.0\n005,West,8.8,10.2,13.5\n006, West ,9.4,11.3,15.1\n007,North,3.8,5.4,8.9\n008,South,14.0,15.3,20.1\n009,West,7.9,9.8,12.7\n010,North,4.8,6.5,NA\n011,South,12.9,14.9,18.8\n012,West,8.2,10.7,14.2\n",
      [
        ["station", "station_id", "text"],
        ["region", "region", "text"],
        ["jan", "Jan", "text"],
        ["feb", "Feb", "text"],
        ["mar", "Mar", "text"],
      ],
      ["NA"],
    );
    await source(
      "stations",
      "Station metadata",
      "station_id,elevation_m\n001,420\n002,380\n003,25\n003,30\n004,45\n005,800\n006,750\n",
      [
        ["meta_station", "station_id", "text"],
        ["elevation", "elevation_m", "decimal"],
      ],
    );
    project.recipes = [
      {
        id: "clean",
        name: "Clean monthly readings",
        inputRef: s,
        rowMeaning: "One temperature observation for a station and month.",
        operations: [
          op(
            "trim_region",
            "text",
            { columnId: "region", action: "trim", search: "", replacement: "" },
            "Whitespace is a source inconsistency, not a new region.",
          ),
          op(
            "pivot_months",
            "longer",
            {
              columns: ["jan", "feb", "mar"],
              namesTo: "month",
              valuesTo: "temperature_c",
              namesId: "month",
              valuesId: "temperature",
              dropMissing: false,
            },
            "Keep missing months visible.",
          ),
          op(
            "parse_temperature",
            "parse",
            {
              columnId: "temperature",
              type: "decimal",
              format: "%Y-%m-%d",
              decimalSeparator: ".",
            },
            "The literal “bad” becomes a recorded parsing failure.",
          ),
          op("temperature_range", "check", {
            test: "range",
            columns: ["temperature"],
            severity: "advisory",
            min: -50,
            max: 60,
            allowed: [],
          }),
        ],
      },
      {
        id: "regional",
        name: "Regional temperatures",
        inputRef: { kind: "recipe", id: "clean" },
        rowMeaning:
          "One region, averaged across available station-month observations.",
        operations: [
          op(
            "regional_mean",
            "summarize",
            {
              groups: ["region"],
              aggregates: [
                {
                  id: "mean_temp",
                  name: "mean_temperature_c",
                  fn: "mean",
                  columnId: "temperature",
                },
                {
                  id: "valid_readings",
                  name: "valid_readings",
                  fn: "count_valid",
                  columnId: "temperature",
                },
                {
                  id: "missing_readings",
                  name: "missing_readings",
                  fn: "count_missing",
                  columnId: "temperature",
                },
              ],
            },
            "Available readings have equal weight; counts show the denominator.",
          ),
        ],
      },
      {
        id: "metadata_check",
        name: "Inspect metadata keys",
        inputRef: { kind: "source", id: "stations" },
        rowMeaning: "One metadata record, including a duplicated station key.",
        operations: [
          op("station_key_check", "check", {
            test: "unique",
            columns: ["meta_station"],
            severity: "required",
            min: 0,
            max: 100,
            allowed: [],
          }),
        ],
      },
      {
        id: "joined_readings",
        name: "Readings with metadata",
        inputRef: { kind: "recipe", id: "clean" },
        rowMeaning: "Review: duplicate metadata can multiply a station-month.",
        operations: [
          op("join_metadata", "join", {
            right: { kind: "source", id: "stations" },
            how: "left",
            keys: [{ left: "station", right: "meta_station" }],
            relationship: "many-to-one",
            rightColumns: ["elevation"],
            aliases: {},
            maxRows: 250000,
          }),
        ],
      },
    ];
    project.charts = [
      chart(
        "regional_chart",
        "A season, by region",
        "regional",
        "region",
        "mean_temp",
      ),
      {
        ...chart(
          "monthly_chart",
          "Monthly distributions",
          "clean",
          "month",
          "temperature",
        ),
        layers: [
          { id: "monthly_box", mark: "box", x: "month", y: "temperature" },
        ],
        facetColumn: "region",
      },
    ];
    project.reportItems = [
      {
        id: "story_intro",
        kind: "text",
        text: "A small change in structure makes a larger question visible. These synthetic observations compare three regions across January–March. Two declared missing values and one malformed number stay visible in the checks.",
        evidenceIds: ["clean", "regional"],
        reviewRevision: 0,
      },
      {
        id: "story_chart",
        kind: "chart",
        refId: "regional_chart",
        text: "Mean of available station-month temperatures; unequal valid counts are shown in the linked table.",
      },
      {
        id: "story_table",
        kind: "table",
        refId: "regional",
        text: "Denominators matter. A missing observation contributes neither zero nor a valid reading.",
      },
    ];
  } else if (name === "transactions") {
    project.title = "When a join changes the story";
    const s = await source(
      "transactions",
      "Transaction lines",
      "line_id,product_id,quantity,unit_price\nL01,001,2,12\nL02,002,1,24\nL03,001,3,12\nL04,004,1,18\nL05,003,2,9\nL06,,1,10\n",
      [
        ["line", "line_id", "text"],
        ["product", "product_id", "text"],
        ["quantity", "quantity", "decimal"],
        ["price", "unit_price", "decimal"],
      ],
      [""],
    );
    const lookup = await source(
      "products",
      "Product catalog",
      "product_id,category\n001,Home\n001,Gifts\n001,Seasonal\n002,Office\n003,Home\n",
      [
        ["lookup_product", "product_id", "text"],
        ["category", "category", "text"],
      ],
    );
    project.recipes = [
      {
        id: "lines",
        name: "Line amounts",
        inputRef: s,
        rowMeaning: "One purchased line item.",
        operations: [
          op("line_total", "derive", {
            columnId: "amount",
            name: "amount",
            expression: binary("*", col("quantity"), col("price")),
          }),
        ],
      },
      {
        id: "catalog_join",
        name: "Join and inspect multiplication",
        inputRef: { kind: "recipe", id: "lines" },
        rowMeaning:
          "Review: a line item paired with each matching product record.",
        operations: [
          op("products_join", "join", {
            right: lookup,
            how: "left",
            keys: [{ left: "product", right: "lookup_product" }],
            relationship: "many-to-one",
            rightColumns: ["category"],
            aliases: {},
            maxRows: 250000,
          }),
        ],
      },
      {
        id: "unmatched",
        name: "Unmatched product IDs",
        inputRef: { kind: "recipe", id: "lines" },
        rowMeaning: "One line item with no matching catalog entry.",
        operations: [
          op("anti_products", "join", {
            right: lookup,
            how: "anti",
            keys: [{ left: "product", right: "lookup_product" }],
            relationship: "many-to-one",
            rightColumns: [],
            aliases: {},
            maxRows: 250000,
          }),
        ],
      },
    ];
    project.charts = [
      chart(
        "amounts_chart",
        "Amounts before the join",
        "lines",
        "line",
        "amount",
      ),
    ];
    project.reportItems = [
      {
        id: "join_story",
        kind: "text",
        text: "Product 001 has two transaction lines and three lookup records. Their join produces six matches. Summing after that join would multiply revenue; inspect the contributing records before interpreting totals.",
        evidenceIds: ["catalog_join"],
        reviewRevision: 0,
      },
    ];
  } else {
    project.title = "Whose average is it?";
    const s = await source(
      "observations",
      "Station observations",
      "station,region,value\nA,Coast,10\nA,Coast,10\nA,Coast,10\nA,Coast,10\nA,Coast,10\nB,Coast,30\nC,Inland,18\nC,Inland,18\nD,Inland,22\nD,Inland,22\n",
      [
        ["station", "station", "text"],
        ["region", "region", "text"],
        ["value", "value", "decimal"],
      ],
    );
    project.recipes = [
      {
        id: "observations_recipe",
        name: "Observation-weighted mean",
        inputRef: s,
        rowMeaning: "One region with each observation weighted equally.",
        operations: [
          op("observation_mean", "summarize", {
            groups: ["region"],
            aggregates: [
              {
                id: "observed_mean",
                name: "mean",
                fn: "mean",
                columnId: "value",
              },
              { id: "n_obs", name: "n_observations", fn: "count" },
            ],
          }),
        ],
      },
      {
        id: "stations_recipe",
        name: "One value per station",
        inputRef: s,
        rowMeaning: "One station within a region.",
        operations: [
          op("station_means", "summarize", {
            groups: ["region", "station"],
            aggregates: [
              {
                id: "station_mean",
                name: "station_mean",
                fn: "mean",
                columnId: "value",
              },
              { id: "station_n", name: "observations", fn: "count" },
            ],
          }),
        ],
      },
      {
        id: "equal_stations",
        name: "Station-weighted mean",
        inputRef: { kind: "recipe", id: "stations_recipe" },
        rowMeaning: "One region with each station weighted equally.",
        operations: [
          op("equal_station_mean", "summarize", {
            groups: ["region"],
            aggregates: [
              {
                id: "equal_mean",
                name: "mean",
                fn: "mean",
                columnId: "station_mean",
              },
              { id: "n_stations", name: "n_stations", fn: "count" },
            ],
          }),
        ],
      },
    ];
    project.charts = [
      chart(
        "observation_chart",
        "Each observation has a voice",
        "observations_recipe",
        "region",
        "observed_mean",
      ),
      chart(
        "station_chart",
        "Each station has a voice",
        "equal_stations",
        "region",
        "equal_mean",
      ),
    ];
    project.reportItems = [
      {
        id: "weight_story",
        kind: "text",
        text: "Coast has an observation-weighted mean of 13⅓ and a station-weighted mean of 20. Station A supplies five observations; B supplies one. Both calculations are valid, but they answer different questions.",
        evidenceIds: ["observations_recipe", "equal_stations"],
        reviewRevision: 0,
      },
      ...project.charts.map((c) => ({
        id: "report_" + c.id,
        kind: "chart" as const,
        refId: c.id,
        text: c.name,
      })),
    ];
  }
  project.viewState = { selectedRecipe: project.recipes[0].id };
  return { project, assets };
}

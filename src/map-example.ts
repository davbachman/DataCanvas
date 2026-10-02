import { blankProject, column, type Bundle } from "./domain/model";
import { defaultMap } from "./domain/geography";
import { createSource, defaultImport } from "./persistence/import";
export async function mappingExample(): Promise<Bundle> {
  const project = blankProject();
  project.projectId = "example_mapping";
  project.title = "Places, points & regions";
  const bytes = new TextEncoder().encode(
    "place,country,longitude,latitude,value\nParis,France,2.35,48.86,12\nLyon,France,4.84,45.76,18\nTokyo,Japan,139.69,35.69,25\nSao Paulo,Brazil,-46.63,-23.55,20\nNew York,United States of America,-74.01,40.71,30\nUnmatched example,Atlantis,0,0,5\nInvalid coordinate,Japan,139,120,15\n",
  );
  const { source } = await createSource(
    "Synthetic locations",
    bytes,
    defaultImport,
    [
      column("place", "text", "place"),
      column("country", "text", "country"),
      column("longitude", "decimal", "longitude"),
      column("latitude", "decimal", "latitude"),
      column("value", "decimal", "value"),
    ],
  );
  source.id = "locations";
  source.assetRef = "sources/locations.csv";
  source.attribution =
    "Synthetic observations created for Data Canvas, CC0. Coordinates approximate city centers.";
  source.rowMeaning = "One synthetic location observation.";
  project.sources = [source];
  project.recipes = [
    {
      id: "locations_recipe",
      name: "Location observations",
      inputRef: { kind: "source", id: source.id },
      rowMeaning: source.rowMeaning,
      operations: [],
    },
  ];
  project.charts = [
    {
      id: "point_map",
      name: "Locations around the world",
      inputRecipeId: "locations_recipe",
      layers: [
        {
          id: "locations_layer",
          mark: "map_points",
          x: "longitude",
          y: "latitude",
          color: "country",
          size: "value",
        },
      ],
      scales: {},
      annotations:
        "Synthetic data; one invalid latitude is disclosed and omitted.",
      map: defaultMap(),
    },
    {
      id: "country_map",
      name: "Mean value by country",
      inputRecipeId: "locations_recipe",
      layers: [
        {
          id: "countries_layer",
          mark: "choropleth",
          x: "country",
          y: "value",
          aggregate: "mean",
        },
      ],
      scales: {},
      annotations:
        "Country means use all region-matched records, including records without valid point coordinates.",
      map: defaultMap(),
    },
  ];
  project.reportItems = [
    {
      id: "map_report_intro",
      kind: "text",
      text: "Maps answer different questions. A point map requires valid coordinates; a country summary requires a matching country key. Inspect the omission notes and contributors for each.",
      evidenceIds: ["point_map", "country_map"],
    },
    {
      id: "map_report_points",
      kind: "chart",
      text: "Locations",
      refId: "point_map",
    },
    {
      id: "map_report_regions",
      kind: "chart",
      text: "Country summaries",
      refId: "country_map",
    },
  ];
  return { project, assets: { [source.assetRef]: bytes } };
}

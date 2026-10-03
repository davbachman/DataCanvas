import {
  blankProject,
  column,
  col,
  lit,
  binary,
  type Bundle,
  type Operation,
} from "./domain/model";
import { defaultMap, fitMapView, parseGeoJSON } from "./domain/geography";
import { createSource, defaultImport } from "./persistence/import";
const op = (
  id: string,
  kind: string,
  params: any,
  note: string,
): Operation => ({ id, kind, version: 1, params, note });
async function sourceBundle(
  id: string,
  title: string,
  csv: string,
  columns: [string, string, "text" | "decimal"][],
  meaning: string,
  attribution: string,
) {
  const project = blankProject();
  project.projectId = `example_${id}`;
  project.title = title;
  const bytes = new TextEncoder().encode(csv);
  const { source } = await createSource(
    title,
    bytes,
    { ...defaultImport, missingTokens: ["NA"] },
    columns.map(([id, name, type]) => column(name, type, id)),
  );
  source.id = id;
  source.assetRef = `sources/${id}.csv`;
  source.rowMeaning = meaning;
  source.attribution = attribution;
  project.sources = [source];
  return { project, assets: { [source.assetRef]: bytes } } satisfies Bundle;
}
export async function bikeStationsExample(): Promise<Bundle> {
  const b = await sourceBundle(
    "bikes",
    "Bikes around the harbor",
    `Station,Longitude,Latitude,Available bikes,Station capacity
Market,-122.342,47.609,3,24
Waterfront,-122.340,47.604,18,30
Library,-122.332,47.606,2,20
Pioneer,-122.333,47.600,12,16
Garden,-122.328,47.614,6,24
Westlake,-122.338,47.612,20,40
Hillside,-122.323,47.616,9,12
Arts,-122.345,47.619,10,20
`,
    [
      ["station", "Station", "text"],
      ["longitude", "Longitude", "decimal"],
      ["latitude", "Latitude", "decimal"],
      ["bikes", "Available bikes", "decimal"],
      ["docks", "Station capacity", "decimal"],
    ],
    "One fictional bike station at a single illustrative snapshot.",
    "Synthetic station names, locations and counts created for Data Canvas, CC0. Coordinates are in the Seattle area; these are not real bike stations or live availability data.",
  );
  b.project.sources[0].columns.find((c) => c.id === "docks")!.units = "docks";
  b.project.recipes = [
    {
      id: "bike_availability",
      name: "Availability as a percentage",
      inputRef: { kind: "source", id: "bikes" },
      rowMeaning:
        "One fictional station, with the percentage of docks holding a bike.",
      operations: [
        op(
          "bike_percentage",
          "derive",
          {
            columnId: "available_pct",
            name: "Available bikes (%)",
            expression: binary(
              "*",
              binary("/", col("bikes"), col("docks")),
              lit(100),
            ),
          },
          "Compare stations of different capacities using a percentage, not just a bike count.",
        ),
      ],
    },
    {
      id: "low_bikes",
      name: "Stations at 25% or below",
      inputRef: { kind: "recipe", id: "bike_availability" },
      rowMeaning:
        "One fictional station with at most a quarter of its docks holding bikes.",
      operations: [
        op(
          "low_bike_filter",
          "filter",
          { expression: binary("<=", col("available_pct"), lit(25)) },
          "An illustrative threshold to explore; it is not an operational recommendation.",
        ),
      ],
    },
  ];
  b.project.charts = [
    {
      id: "bike_map",
      name: "Where are bikes running low?",
      inputRecipeId: "bike_availability",
      layers: [
        {
          id: "bike_points",
          mark: "map_points",
          x: "longitude",
          y: "latitude",
          color: "available_pct",
          size: "docks",
          tooltip: ["station", "bikes", "docks", "available_pct"],
        },
      ],
      scales: {},
      annotations:
        "Fictional stations near Seattle. Color shows bikes available (%); point size shows station capacity. Not live data.",
      map: {
        ...defaultMap(),
        version: 2,
        tiles: "openstreetmap",
        projection: "mercator",
        centerLongitude: -122.334,
        centerLatitude: 47.6095,
        zoom: 6000,
        overlayOpacity: 0.85,
      },
    },
    {
      id: "bike_comparison",
      name: "Compare station availability",
      inputRecipeId: "bike_availability",
      layers: [
        {
          id: "bike_bars",
          mark: "bar",
          x: "station",
          y: "available_pct",
          constantColor: "#277c6c",
        },
      ],
      scales: { zero: true, yDomain: [0, 100], yTitle: "Available bikes (%)" },
      annotations:
        "Same fictional snapshot as the map. Station capacity is the denominator.",
    },
  ];
  b.project.reportItems = [
    {
      id: "bike_intro",
      kind: "text",
      text: "Explore: which stations have few bikes relative to their capacity? Market has 3 of 24 docks occupied (12.5%), Library has 2 of 20 (10%), and Garden has 6 of 24 (25%). The low-availability recipe keeps these three stations. All locations and counts are synthetic; this is not a live service map.",
      evidenceIds: ["bike_availability", "low_bikes"],
      reviewRevision: 0,
    },
    {
      id: "bike_map_report",
      kind: "chart",
      refId: "bike_map",
      text: "Click a station to inspect its contributing row. Drag or zoom to explore the streets; change Basemap to Built-in boundaries to stop online tile requests.",
    },
    {
      id: "bike_bar_report",
      kind: "chart",
      refId: "bike_comparison",
      text: "Compare percentages without geography. Large markers indicate capacity, not the number of bikes available.",
    },
    {
      id: "bike_table_report",
      kind: "table",
      refId: "low_bikes",
      text: "Try changing the filter threshold from 25 to 50, then rerun. How does the list change?",
    },
  ];
  b.project.viewState = { selectedChart: "bike_map" };
  return b;
}
export async function treeCoverExample(): Promise<Bundle> {
  const b = await sourceBundle(
    "trees",
    "Tree cover: totals vs. percentages",
    `District,Surveyed area (ha),Canopy area (ha)
Northwest,50,15
North,100,20
Northeast,20,12
Southwest,80,8
South,40,10
Southeast,30,NA
`,
    [
      ["district", "District", "text"],
      ["surveyed_ha", "Surveyed area (ha)", "decimal"],
      ["canopy_ha", "Canopy area (ha)", "decimal"],
    ],
    "One fictional district's illustrative tree-canopy survey; surveyed area is the denominator, not area computed from the drawing.",
    "Synthetic surveys and schematic district boundaries created for Data Canvas, CC0. Not actual administrative boundaries, measured land areas, or environmental observations.",
  );
  const names = [
    "Northwest",
    "North",
    "Northeast",
    "Southwest",
    "South",
    "Southeast",
  ];
  const boundaries = parseGeoJSON({
    type: "FeatureCollection",
    features: names.map((name, i) => {
      const x = -122.52 + (i % 3) * 0.12,
        y = i < 3 ? 47.61 : 47.53;
      return {
        type: "Feature",
        properties: { district: name },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [x, y],
              [x + 0.12, y],
              [x + 0.12, y + 0.08],
              [x, y + 0.08],
              [x, y],
            ],
          ],
        },
      };
    }),
  });
  const map = {
    ...defaultMap(),
    projection: "mercator" as const,
    basemap: "custom" as const,
    boundaries,
    boundaryName: "illustrative-districts.geojson",
    featureKey: "district",
    colorScheme: "viridis" as const,
    attribution:
      "Schematic fictional districts — Data Canvas, CC0; not real boundaries.",
  };
  Object.assign(map, fitMapView(map, boundaries));
  b.project.recipes = [
    {
      id: "tree_coverage",
      name: "Canopy coverage by district",
      inputRef: { kind: "source", id: "trees" },
      rowMeaning:
        "One fictional district with canopy as a percentage of its surveyed area.",
      operations: [
        op(
          "canopy_percentage",
          "derive",
          {
            columnId: "canopy_pct",
            name: "Canopy coverage (%)",
            expression: binary(
              "*",
              binary("/", col("canopy_ha"), col("surveyed_ha")),
              lit(100),
            ),
          },
          "A missing canopy observation stays missing; it is not zero. Surveyed area is supplied data, not a polygon area calculation.",
        ),
      ],
    },
  ];
  b.project.charts = [
    {
      id: "tree_percent_map",
      name: "Which districts have more tree cover?",
      inputRecipeId: "tree_coverage",
      layers: [
        {
          id: "tree_percent_regions",
          mark: "choropleth",
          x: "district",
          y: "canopy_pct",
        },
      ],
      scales: {},
      map,
      annotations:
        "Synthetic surveys and schematic districts. Coverage = canopy area ÷ surveyed area × 100. Gray means missing, not zero.",
    },
    {
      id: "tree_total_map",
      name: "Canopy totals tell a different story",
      inputRecipeId: "tree_coverage",
      layers: [
        {
          id: "tree_total_regions",
          mark: "choropleth",
          x: "district",
          y: "canopy_ha",
        },
      ],
      scales: {},
      map: structuredClone(map),
      annotations:
        "Synthetic canopy area in hectares. Compare with the percentage map; districts have different surveyed areas.",
    },
  ];
  b.project.reportItems = [
    {
      id: "tree_intro",
      kind: "text",
      text: "Explore: does the district with the most canopy also have the highest coverage? North has the most canopy (20 ha), but covers only 20% of its 100 surveyed hectares. Northeast has less canopy (12 ha), yet 60% coverage. The denominator changes the comparison. These surveys and boundaries are fictional.",
      evidenceIds: ["tree_coverage"],
      reviewRevision: 0,
    },
    {
      id: "tree_percentage_report",
      kind: "chart",
      refId: "tree_percent_map",
      text: "Compare coverage percentages. Southeast has a missing canopy observation and remains gray; no district represents an actual administrative area.",
    },
    {
      id: "tree_totals_report",
      kind: "chart",
      refId: "tree_total_map",
      text: "Compare raw hectares. The maps have different measures and color scales; read each legend rather than comparing the same color between maps.",
    },
    {
      id: "tree_table_report",
      kind: "table",
      refId: "tree_coverage",
      text: "Inspect the numerator and denominator. Try editing the recipe to compare uncovered area, or add a filter for coverage below 25%.",
    },
  ];
  b.project.viewState = { selectedChart: "tree_percent_map" };
  return b;
}

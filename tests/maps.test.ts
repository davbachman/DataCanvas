import { it, expect } from "vitest";
import { geoArea } from "d3-geo";
import { compile } from "vega-lite";
import { parse, View } from "vega";
import { parseGeoJSON, defaultMap, fitMapView } from "../src/domain/geography";
import { mappingExample } from "../src/map-example";
import { Engine } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { resolveChart } from "../src/charts/resolve";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { markPredicate } from "../src/charts/selection";
const feature = (id: string, x = 0, holes = false) => ({
  type: "Feature",
  id,
  properties: { region: id, "region.name": id },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x, 0],
        [x + 4, 0],
        [x + 4, 4],
        [x, 4],
        [x, 0],
      ],
      ...(holes
        ? [
            [
              [x + 1, 1],
              [x + 1, 2],
              [x + 2, 2],
              [x + 2, 1],
              [x + 1, 1],
            ],
          ]
        : []),
    ],
  },
});
const custom = (features: any[]) =>
  parseGeoJSON({ type: "FeatureCollection", features });
async function prepared() {
  const b = await mappingExample(),
    db = await nativeDB(),
    engine = new Engine(db);
  await engine.run(b);
  return { b, db, engine };
}
it("validates bounded polygon data and normalizes exteriors, holes, and antimeridian rings", () => {
  const result = custom([feature("France", 0, true)]);
  expect(geoArea(result.features[0].geometry as any)).toBeLessThan(0.01);
  expect(geoArea(result.features[0].geometry as any)).toBeGreaterThan(0);
  const dateline = feature("Date line");
  dateline.geometry.coordinates = [
    [
      [179, 0],
      [-179, 0],
      [-179, 2],
      [179, 2],
      [179, 0],
    ],
  ];
  expect(geoArea(custom([dateline]).features[0].geometry as any)).toBeLessThan(
    0.01,
  );
  expect(() =>
    custom([
      { ...feature("bad"), geometry: { type: "Point", coordinates: [0, 0] } },
    ]),
  ).toThrow("Polygon");
  expect(() => custom([feature("bad", 200)])).toThrow("WGS84");
  expect(() =>
    parseGeoJSON({
      type: "FeatureCollection",
      crs: {},
      features: [feature("bad")],
    }),
  ).toThrow("Reproject");
  const open = feature("open");
  open.geometry.coordinates[0].pop();
  expect(() => custom([open])).toThrow("closed");
});
it("maps real coordinates, discloses invalid rows, preserves lineage, and renders every projection", async () => {
  const { b, db, engine } = await prepared();
  try {
    for (const projection of [
      "equalEarth",
      "mercator",
      "equirectangular",
    ] as const) {
      const chart = {
        ...b.project.charts[0],
        map: { ...defaultMap(), projection },
      };
      const resolved = await resolveChart(engine, chart);
      expect(resolved.omitted).toBe(1);
      expect(resolved.tables[0].rowCount).toBe(6);
      expect(resolved.tables[0].lineage.flat()).toContain("locations:1");
      const spec = compile(resolved.spec as any).spec;
      const view = new View(parse(spec), { renderer: "none" });
      try {
        const svg = await view.toSVG();
        expect(svg).toContain("<path");
        expect(svg).not.toContain("NaN");
      } finally {
        view.finalize();
      }
      const predicate = JSON.stringify(
        markPredicate(chart, 0, resolved.tables[0].rows[0]),
      );
      expect(predicate).toContain("longitude");
      expect(predicate).toContain("latitude");
    }
  } finally {
    await db.close();
  }
});
it("choropleths aggregate full matched data, report unmatched keys, and expose exact contributors", async () => {
  const { b, db, engine } = await prepared();
  try {
    const resolved = await resolveChart(engine, b.project.charts[1]);
    expect(resolved.omitted).toBe(1);
    expect(resolved.tables[0].rowCount).toBe(4);
    const i = resolved.tables[0].rows.findIndex((r) => r.country === "France");
    expect(resolved.tables[0].rows[i].countries_layer_stat).toBe(15);
    expect(resolved.tables[0].lineage[i].sort()).toEqual([
      "locations:1",
      "locations:2",
    ]);
    expect(resolved.notes.join(" ")).toContain("Atlantis");
    const view = new View(parse(compile(resolved.spec as any).spec), {
      renderer: "none",
    });
    try {
      expect(await view.toSVG()).toContain("Mean value by country");
    } finally {
      view.finalize();
    }
    await expect(
      resolveChart(engine, {
        ...b.project.charts[1],
        layers: [{ ...b.project.charts[1].layers[0], aggregate: undefined }],
      }),
    ).rejects.toThrow("Multiple records");
  } finally {
    await db.close();
  }
});
it("custom boundaries, exact key joins, no-data regions and saved map settings survive portable projects", async () => {
  const { b, db, engine } = await prepared();
  try {
    const chart = b.project.charts[1];
    chart.map = {
      ...defaultMap(),
      basemap: "custom",
      boundaryName: "regions.geojson",
      featureKey: "region.name",
      attribution: "Test boundaries",
      boundaries: custom([
        feature("France"),
        feature("Japan", 10),
        feature("Unused", 20),
      ]),
    };
    const reopened = unpackBundle(packBundle(b));
    expect(reopened.project.charts[1].map).toEqual(chart.map);
    const result = await resolveChart(engine, reopened.project.charts[1]);
    expect(result.tables[0].rowCount).toBe(2);
    expect(result.omitted).toBe(3);
    expect(result.notes.join(" ")).toContain(
      "1 boundaries have no matched records",
    );
    expect(JSON.stringify(result.spec)).not.toContain('"url":');
    chart.map.boundaries = custom([feature("France"), feature("France", 10)]);
    await expect(resolveChart(engine, chart)).rejects.toThrow("duplicated");
  } finally {
    await db.close();
  }
});
it("rejects mixed chart families, incompatible coordinate types and oversized point displays", async () => {
  const { b, db, engine } = await prepared();
  try {
    const chart = b.project.charts[0];
    await expect(
      resolveChart(engine, {
        ...chart,
        layers: [
          ...chart.layers,
          { id: "cartesian", mark: "scatter", x: "longitude", y: "latitude" },
        ],
      }),
    ).rejects.toThrow("separate chart");
    await expect(
      resolveChart(engine, {
        ...chart,
        layers: [{ ...chart.layers[0], x: "place" }],
      }),
    ).rejects.toThrow("numeric");
    await db.exec(
      "CREATE TABLE lots AS SELECT 0.0 AS longitude,0.0 AS latitude,CAST(i AS VARCHAR) AS __rid, [CAST(i AS VARCHAR)] AS __lineage FROM range(20001) t(i)",
    );
    const input = engine.relations.get(chart.inputRecipeId)!;
    engine.relations.set("lots", {
      ...input,
      name: "lots",
      columns: input.columns.filter((c) =>
        ["longitude", "latitude"].includes(c.id),
      ),
    });
    await expect(
      resolveChart(engine, {
        ...chart,
        inputRecipeId: "lots",
        layers: [
          {
            id: "lots_layer",
            mark: "map_points",
            x: "longitude",
            y: "latitude",
          },
        ],
      }),
    ).rejects.toThrow(/limit|exceeds/i);
  } finally {
    await db.close();
  }
});
it("counts the complete input, preserves all-missing regions, and matches numeric region IDs", async () => {
  const { b, db, engine } = await prepared();
  try {
    await db.exec(
      "CREATE TABLE numeric_regions AS SELECT CASE WHEN i<150 THEN 1 ELSE 2 END::BIGINT AS region, CASE WHEN i<150 THEN 4.0 ELSE NULL END AS value, CAST(i AS VARCHAR) AS __rid, [CAST(i AS VARCHAR)] AS __lineage FROM range(200) t(i)",
    );
    const columns = [
      {
        id: "region",
        name: "Region",
        type: "integer" as const,
        role: "identifier" as const,
      },
      {
        id: "value",
        name: "Value",
        type: "decimal" as const,
        role: "quantitative" as const,
      },
    ];
    engine.relations.set("numeric", {
      name: "numeric_regions",
      columns,
      ordered: false,
      rowMeaning: "A record",
    });
    const chart = {
      ...b.project.charts[1],
      inputRecipeId: "numeric",
      layers: [
        {
          id: "numeric_map",
          mark: "choropleth" as const,
          x: "region",
          y: "value",
          aggregate: "mean",
        },
      ],
      map: {
        ...defaultMap(),
        basemap: "custom" as const,
        featureKey: "$id",
        boundaries: custom([
          feature("001"),
          feature("2", 10),
          feature("3", 20),
        ]),
      },
    };
    const result = await resolveChart(engine, chart);
    const a = result.tables[0].rows.find(
      (r) => (r.region as any).value === "1",
    )!;
    const missing = result.tables[0].rows.find(
      (r) => (r.region as any).value === "2",
    )!;
    expect(a.numeric_map_rows).toEqual({ type: "integer", value: "150" });
    expect(a.numeric_map_stat).toBe(4);
    expect(missing.numeric_map_stat).toBeNull();
    expect(missing.numeric_map_valid).toEqual({ type: "integer", value: "0" });
    chart.layers[0].aggregate = "count";
    const counted = await resolveChart(engine, chart);
    expect(
      counted.tables[0].rows
        .map((r) => Number((r.numeric_map_stat as any).value))
        .sort((a, b) => a - b),
    ).toEqual([50, 150]);
    chart.map.boundaries = custom([feature("1"), feature("01", 10)]);
    await expect(resolveChart(engine, chart)).rejects.toThrow("duplicated");
  } finally {
    await db.close();
  }
});

it("fits local boundaries and antimeridian point clusters without zooming to the world", () => {
  const local = custom([feature("local")]);
  local.features[0].geometry.coordinates = [
    [
      [2, 48],
      [2.01, 48],
      [2.01, 48.01],
      [2, 48.01],
      [2, 48],
    ],
  ];
  const fitted = fitMapView(defaultMap(), parseGeoJSON(local));
  expect(fitted!.zoom).toBeGreaterThan(20);
  expect(fitted!.centerLongitude).toBeCloseTo(2.005);
  const dateline: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [179, -179].map((x) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [x, 0] },
    })),
  };
  for (const projection of [
    "equalEarth",
    "mercator",
    "equirectangular",
  ] as const) {
    const view = fitMapView({ ...defaultMap(), projection }, dateline)!;
    expect(Math.abs(view.centerLongitude)).toBe(180);
    expect(view.zoom).toBeGreaterThan(20);
  }
  expect(
    fitMapView(defaultMap(), { type: "FeatureCollection", features: [] }),
  ).toBeNull();
});

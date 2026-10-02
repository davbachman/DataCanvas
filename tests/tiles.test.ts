import { it, expect } from "vitest";
import { geoMercator } from "d3-geo";
import { defaultMap, mapSettingsSchema } from "../src/domain/geography";
import { visibleTiles, STREET_MAX_ZOOM } from "../src/charts/tiles";
import { panMap } from "../src/charts/mapNavigation";
import { mappingExample } from "../src/map-example";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { nativeDB } from "../src/engine/native";
import { Engine } from "../src/engine/core";
import { resolveChart } from "../src/charts/resolve";
const street = () => ({
  ...defaultMap(),
  version: 2 as const,
  projection: "mercator" as const,
  tiles: "openstreetmap" as const,
});
it("requests only intersecting tiles, bounds zoom, wraps longitude, and matches the geographic projection", () => {
  expect(visibleTiles(defaultMap())).toEqual([]);
  for (const centerLongitude of [-180, -74, 2.35, 179.9])
    for (const zoom of [0.5, 1, 100, STREET_MAX_ZOOM]) {
      const m = { ...street(), centerLongitude, centerLatitude: 48.86, zoom };
      const layer = visibleTiles(m)[0],
        size = layer.mark.width;
      const tiles = layer.data.values;
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThan(40);
      for (const tile of tiles) {
        expect(tile.x).toBeLessThan(560);
        expect(tile.x + size).toBeGreaterThan(0);
        expect(tile.y).toBeLessThan(340);
        expect(tile.y + size).toBeGreaterThan(0);
        const [z, x, y] = tile.url
          .match(/\/(\d+)\/(\d+)\/(\d+)\.png/)!
          .slice(1)
          .map(Number);
        expect(z).toBeLessThanOrEqual(19);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(2 ** z);
        expect(y).toBeLessThan(2 ** z);
      }
      const tile = tiles.find(
        (t) => t.x <= 280 && t.x + size > 280 && t.y <= 170 && t.y + size > 170,
      )!;
      const [z, x, y] = tile.url
        .match(/\/(\d+)\/(\d+)\/(\d+)\.png/)!
        .slice(1)
        .map(Number);
      const lon = ((x + 0.5) / 2 ** z) * 360 - 180;
      const lat =
        (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 2 ** z))) * 180) /
        Math.PI;
      const projected = geoMercator()
        .scale(85 * zoom)
        .translate([280, 170])
        .center([0, m.centerLatitude])
        .rotate([-centerLongitude, 0, 0])([lon, lat])!;
      expect(projected[0]).toBeCloseTo(tile.x + size / 2, 5);
      expect(projected[1]).toBeCloseTo(tile.y + size / 2, 5);
    }
});
it("pans in geographic coordinates and preserves versioned online settings in a portable project", async () => {
  const m = {
    ...street(),
    centerLongitude: 179.9,
    zoom: 100,
    overlayOpacity: 0.4,
  };
  const moved = panMap(m, -100, 50);
  expect(moved.centerLongitude).toBeLessThan(0);
  expect(moved.centerLatitude).toBeGreaterThan(0);
  const reverse = panMap(moved, 100, -50);
  expect(reverse.centerLongitude).toBeCloseTo(m.centerLongitude);
  expect(reverse.centerLatitude).toBeCloseTo(0);
  expect(mapSettingsSchema.safeParse({ ...m, version: 1 }).success).toBe(false);
  expect(
    mapSettingsSchema.safeParse({ ...m, projection: "equalEarth" }).success,
  ).toBe(false);
  const b = await mappingExample();
  b.project.charts[0].map = m;
  expect(unpackBundle(packBundle(b)).project.charts[0].map).toEqual(m);
});
it("adds street imagery without changing full-data map statistics or contributors", async () => {
  const b = await mappingExample(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(b);
    const chart = b.project.charts[1];
    chart.map = { ...defaultMap(), projection: "mercator" };
    const before = await resolveChart(engine, chart);
    chart.map = { ...street(), overlayOpacity: 0.4 };
    const after = await resolveChart(engine, chart);
    expect(after.tables).toEqual(before.tables);
    expect(after.omitted).toBe(before.omitted);
    expect(after.spec.layer.some((l: any) => l.mark.type === "image")).toBe(
      true,
    );
    expect(after.spec.layer.at(-1).mark.opacity).toBe(0.4);
    expect(after.notes.join(" ")).toContain("OpenStreetMap contributors");
  } finally {
    await db.close();
  }
});

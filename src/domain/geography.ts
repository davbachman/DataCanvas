import { z } from "zod";
import {
  geoArea,
  geoBounds,
  geoEqualEarth,
  geoMercator,
  geoEquirectangular,
  geoPath,
} from "d3-geo";
export type Position = [number, number];
export type Polygon = Position[][];
export interface GeoFeature {
  type: "Feature";
  id?: string | number;
  properties: Record<string, string | number | boolean | null>;
  geometry:
    | { type: "Polygon"; coordinates: Polygon }
    | { type: "MultiPolygon"; coordinates: Polygon[] };
}
export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}
export const MAX_GEO_BYTES = 5 * 1024 * 1024;
/** Bounded, self-contained WGS84 polygon data. No executable expressions or URL loaders. */
export function parseGeoJSON(value: unknown): GeoCollection {
  const encoded =
    typeof value === "string" ? value : JSON.stringify(value) || "";
  if (new TextEncoder().encode(encoded).length > MAX_GEO_BYTES)
    throw new Error("GeoJSON exceeds the 5 MiB limit.");
  const raw: any = typeof value === "string" ? JSON.parse(value) : value;
  if (JSON.stringify(raw)?.length > MAX_GEO_BYTES)
    throw new Error("GeoJSON exceeds the 5 MiB limit.");
  if (
    raw?.type !== "FeatureCollection" ||
    !Array.isArray(raw.features) ||
    !raw.features.length ||
    raw.features.length > 5000
  )
    throw new Error(
      "Use a GeoJSON FeatureCollection with 1–5,000 polygon features.",
    );
  if (raw.crs)
    throw new Error(
      "Reproject boundaries to WGS84 longitude/latitude (EPSG:4326) and remove the legacy CRS declaration before import.",
    );
  let points = 0;
  const polygon = (rings: any): Polygon => {
    if (!Array.isArray(rings) || !rings.length)
      throw new Error("A polygon needs an exterior ring.");
    return rings.map((ring: any, i: number) => {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error(
          "Polygon rings need at least four positions, including the closing point.",
        );
      const positions: Position[] = ring.map((p: any) => {
        if (++points > 200000)
          throw new Error(
            "GeoJSON exceeds 200,000 positions. Simplify boundaries before import.",
          );
        if (
          !Array.isArray(p) ||
          p.length < 2 ||
          !Number.isFinite(p[0]) ||
          !Number.isFinite(p[1]) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90
        )
          throw new Error(
            "Coordinates must be finite WGS84 [longitude, latitude] degrees within ±180 and ±90.",
          );
        return [p[0], p[1]];
      });
      if (
        positions[0][0] !== positions.at(-1)![0] ||
        positions[0][1] !== positions.at(-1)![1]
      )
        throw new Error("Polygon rings must be closed.");
      if (new Set(positions.slice(0, -1).map((p) => p.join(","))).size < 3)
        throw new Error("Polygon rings need three distinct vertices.");
      // D3 uses clockwise exterior rings; normalize RFC 7946 and D3 inputs alike.
      const large =
        geoArea({ type: "Polygon", coordinates: [positions] }) > 2 * Math.PI;
      if ((i === 0 && large) || (i > 0 && !large)) positions.reverse();
      return positions;
    });
  };
  return {
    type: "FeatureCollection",
    features: raw.features.map((f: any): GeoFeature => {
      if (
        f?.type !== "Feature" ||
        !["Polygon", "MultiPolygon"].includes(f.geometry?.type)
      )
        throw new Error(
          "Boundaries must contain Polygon or MultiPolygon features. Use table coordinates for point maps.",
        );
      if (f.crs || f.geometry.crs)
        throw new Error(
          "Only WGS84 boundaries without a legacy CRS declaration are supported.",
        );
      if (
        f.properties != null &&
        (typeof f.properties !== "object" || Array.isArray(f.properties))
      )
        throw new Error(
          "GeoJSON feature properties must be an object or null.",
        );
      const properties: GeoFeature["properties"] = Object.fromEntries(
        Object.entries(f.properties || {}).filter(
          ([, v]) =>
            v === null ||
            ["string", "boolean"].includes(typeof v) ||
            (typeof v === "number" && Number.isFinite(v)),
        ) as any,
      );
      let geometry: GeoFeature["geometry"];
      if (f.geometry.type === "Polygon")
        geometry = {
          type: "Polygon",
          coordinates: polygon(f.geometry.coordinates),
        };
      else {
        if (
          !Array.isArray(f.geometry.coordinates) ||
          !f.geometry.coordinates.length
        )
          throw new Error("A MultiPolygon needs at least one polygon.");
        geometry = {
          type: "MultiPolygon",
          coordinates: f.geometry.coordinates.map(polygon),
        };
      }
      return {
        type: "Feature",
        ...(typeof f.id === "string" ||
        (typeof f.id === "number" && Number.isFinite(f.id))
          ? { id: f.id }
          : {}),
        properties,
        geometry,
      };
    }),
  };
}
const boundarySchema = z.unknown().transform((v, ctx): GeoCollection => {
  try {
    return parseGeoJSON(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});
export const mapSettingsSchema = z.object({
  version: z.literal(1),
  projection: z.enum(["equalEarth", "mercator", "equirectangular"]),
  basemap: z.enum(["world", "custom"]),
  boundaries: boundarySchema.optional(),
  boundaryName: z.string().max(500).optional(),
  attribution: z.string().max(2000).optional(),
  featureKey: z.string().max(500),
  zoom: z.number().min(0.5).max(2000),
  centerLongitude: z.number().min(-180).max(180),
  centerLatitude: z.number().min(-85).max(85),
  graticule: z.boolean(),
  colorScheme: z.enum(["blues", "viridis", "redblue"]),
});
export type MapSettings = z.infer<typeof mapSettingsSchema>;
export const defaultMap = (): MapSettings => ({
  version: 1,
  projection: "equalEarth",
  basemap: "world",
  featureKey: "name",
  zoom: 1,
  centerLongitude: 0,
  centerLatitude: 0,
  graticule: false,
  colorScheme: "blues",
});
export const isMapMark = (mark: string) =>
  mark === "map_points" || mark === "choropleth";

/** Fit the rendered data using the same projection, rotation and scale as the chart. */
export function fitMapView(m: MapSettings, data: GeoJSON.FeatureCollection) {
  if (!data.features.length) return null;
  const [[west, south], [east, north]] = geoBounds(data);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  const middle = (west + (east < west ? east + 360 : east)) / 2;
  const centerLongitude = ((middle + 540) % 360) - 180;
  const centerLatitude = Math.max(-85, Math.min(85, (south + north) / 2));
  const projection = (
    m.projection === "equalEarth"
      ? geoEqualEarth()
      : m.projection === "mercator"
        ? geoMercator()
        : geoEquirectangular()
  )
    .rotate([-centerLongitude, 0, 0])
    .center([0, centerLatitude])
    .scale(1)
    .translate([0, 0]);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(data);
  const scale = Math.min(
    250 / Math.max(Math.abs(x0), Math.abs(x1), 0.002),
    140 / Math.max(Math.abs(y0), Math.abs(y1), 0.002),
  );
  return {
    centerLongitude,
    centerLatitude,
    zoom: Math.max(
      0.5,
      Math.min(2000, scale / (m.projection === "equalEarth" ? 100 : 85)),
    ),
  };
}

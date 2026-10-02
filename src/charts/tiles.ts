import type { MapSettings } from "../domain/geography";
export const OSM_ATTRIBUTION =
  "© OpenStreetMap contributors · openstreetmap.org/copyright";
export const STREET_MAX_ZOOM = (256 * 2 ** 19) / (2 * Math.PI * 85);
export const mapZoomLimit = (m: MapSettings) =>
  m.tiles === "openstreetmap" ? STREET_MAX_ZOOM : 2000;
const radians = Math.PI / 180;
export const mercatorY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * radians) / 2));
/** Only tiles intersecting the 560 × 340 viewport; no prefetch or persistent tile cache. */
export function visibleTiles(m: MapSettings) {
  if (m.tiles !== "openstreetmap") return [];
  const world = 2 * Math.PI * 85 * m.zoom;
  const z = Math.max(0, Math.min(19, Math.ceil(Math.log2(world / 256))));
  const n = 2 ** z,
    size = world / n;
  const cx = ((m.centerLongitude + 180) / 360) * n;
  const cy = ((1 - mercatorY(m.centerLatitude) / Math.PI) / 2) * n;
  const tiles = [];
  for (
    let y = Math.max(0, Math.floor(cy - 170 / size));
    y <= Math.min(n - 1, Math.ceil(cy + 170 / size) - 1);
    y++
  ) {
    for (
      let x = Math.floor(cx - 280 / size);
      x <= Math.ceil(cx + 280 / size) - 1;
      x++
    ) {
      const wrappedX = ((x % n) + n) % n;
      tiles.push({
        x: 280 + (x - cx) * size,
        y: 170 + (y - cy) * size,
        url: `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`,
      });
    }
  }
  return [
    {
      data: { values: tiles },
      mark: {
        type: "image",
        width: size,
        height: size,
        align: "left",
        baseline: "top",
        aspect: false,
        clip: true,
      },
      encoding: {
        x: { field: "x", type: "quantitative", scale: null, axis: null },
        y: { field: "y", type: "quantitative", scale: null, axis: null },
        url: { field: "url", type: "nominal" },
      },
    },
  ];
}

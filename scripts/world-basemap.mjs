import { readFile, writeFile, mkdir } from "node:fs/promises";
import { feature } from "topojson-client";
const world = JSON.parse(
  await readFile("node_modules/world-atlas/countries-110m.json", "utf8"),
);
const countries = feature(world, world.objects.countries);
// Quantization can collapse tiny islands to fewer than three vertices.
let removed = 0;
const valid = (ring) =>
  new Set(ring.slice(0, -1).map((p) => p.join(","))).size >= 3;
const clean = (rings) => {
  if (!valid(rings[0])) {
    removed++;
    return null;
  }
  return rings.filter((r, i) => {
    if (i && !valid(r)) {
      removed++;
      return false;
    }
    return true;
  });
};
countries.features = countries.features.flatMap((f) => {
  if (f.geometry.type === "Polygon") {
    const coordinates = clean(f.geometry.coordinates);
    return coordinates
      ? [{ ...f, geometry: { type: "Polygon", coordinates } }]
      : [];
  }
  const coordinates = f.geometry.coordinates.map(clean).filter(Boolean);
  return coordinates.length
    ? [{ ...f, geometry: { type: "MultiPolygon", coordinates } }]
    : [];
});
console.log(`Removed ${removed} degenerate quantized rings`);
await mkdir("src/charts/geography", { recursive: true });
await writeFile("src/charts/geography/world.json", JSON.stringify(countries));
await mkdir("public/geography", { recursive: true });
await writeFile(
  "public/geography/LICENSE-world-atlas.txt",
  await readFile("node_modules/world-atlas/LICENSE"),
);
console.log(`${countries.features.length} bundled country features`);

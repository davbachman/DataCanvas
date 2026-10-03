import { visibleTiles, OSM_ATTRIBUTION } from "./tiles";
import worldJSON from "./geography/world.json" with { type: "json" };
import {
  defaultMap,
  mapSettingsSchema,
  parseGeoJSON,
  isMapMark,
  type GeoFeature,
} from "../domain/geography";
import { CanvasError, column, type Chart, type Column } from "../domain/model";
import { type Engine, plainValue, type TableResult } from "../engine/core";
import {
  quote as q,
  literal as l,
  requireColumn,
  aggregate,
} from "../compiler/expressions";
import type { ResolvedChart } from "./resolve";
export const WORLD_ATTRIBUTION =
  "Natural Earth 1:110m (public domain), via world-atlas 2.0.2 (ISC). Generalized boundaries; not a statement of legal or political status.";
const world = parseGeoJSON(worldJSON);
export function boundaryData(chart: Chart) {
  const settings = mapSettingsSchema.parse(chart.map || defaultMap());
  if (settings.basemap === "custom" && !settings.boundaries)
    throw new CanvasError("VALIDATION", "Import a GeoJSON boundary file.");
  return {
    settings,
    features:
      settings.basemap === "custom"
        ? settings.boundaries!.features
        : world.features,
  };
}
const numeric = (c: Column) => ["integer", "decimal"].includes(c.type);
export async function resolveMap(
  engine: Engine,
  chart: Chart,
): Promise<ResolvedChart> {
  const input = engine.relations.get(chart.inputRecipeId);
  if (!input)
    throw new CanvasError("BLOCKED", "Run the map's input recipe first.");
  if (chart.layers.some((layer) => !isMapMark(layer.mark)))
    throw new CanvasError(
      "VALIDATION",
      "A map can combine point and choropleth layers. Put Cartesian charts in a separate chart.",
    );
  if (chart.facetRow || chart.facetColumn)
    throw new CanvasError(
      "VALIDATION",
      "Map faceting is not supported. Clear facet fields before mapping.",
    );
  const { settings: m, features } = boundaryData(chart);
  const attribution =
    m.basemap === "world"
      ? WORLD_ATTRIBUTION
      : m.attribution ||
        `Custom boundaries: ${m.boundaryName || "GeoJSON"} (attribution not supplied)`;
  const street = m.tiles === "openstreetmap";
  const width = chart.style?.width || 560,
    height = chart.style?.height || 340;
  const notes = [
    attribution,
    "Coordinates use WGS84 longitude/latitude degrees. Map view and zoom can clip geography; reset the view to see the world.",
  ];
  if (street)
    notes.push(
      OSM_ATTRIBUTION,
      "Street tiles are requested from OpenStreetMap for the visible view. Your table stays local; the provider receives your IP address and viewed tile locations. Tiles are not stored in portable projects. Exports require the displayed tiles to load successfully.",
    );
  const layers: any[] = [
    {
      data: { sphere: true },
      mark: {
        type: "geoshape",
        fill: "#eef4f6",
        stroke: "#b5c6cc",
        strokeWidth: 0.5,
      },
    },
    ...visibleTiles(m, width, height),
    {
      data: { values: features.map((f) => ({ _geometry: f.geometry })) },
      mark: {
        type: "geoshape",
        fill: street ? null : "#e0e7e1",
        stroke: street ? "#78918b" : "#ffffff",
        strokeWidth: 0.6,
      },
      encoding: { shape: { field: "_geometry", type: "geojson" } },
    },
  ];
  if (m.graticule)
    layers.push({
      data: { graticule: true },
      mark: {
        type: "geoshape",
        fill: null,
        stroke: "#becbcf",
        strokeWidth: 0.35,
      },
    });
  const tables: TableResult[] = [];
  let omitted = 0;
  const col = (id?: string) => requireColumn(input.columns, id || "");
  const field = (id: string) => ({
    field: id,
    title: col(id).name,
    type: col(id).role === "quantitative" ? "quantitative" : "nominal",
  });
  for (const [index, layer] of chart.layers.entries()) {
    let sql: string,
      columns = [...input.columns];
    let encoding: Record<string, any>, geometryIndex: string | undefined;
    const from = q(input.name);
    if (layer.mark === "map_points") {
      const lon = col(layer.x),
        lat = col(layer.y);
      if (!numeric(lon) || !numeric(lat))
        throw new CanvasError(
          "SCHEMA",
          "Longitude and latitude must be numeric columns. Parse coordinate text first.",
        );
      const maxLatitude = m.projection === "mercator" ? 85.05112878 : 90;
      const valid = [
        `${q(lon.id)} IS NOT NULL`,
        `${q(lat.id)} IS NOT NULL`,
        `isfinite(${q(lon.id)})`,
        `isfinite(${q(lat.id)})`,
        `${q(lon.id)} BETWEEN -180 AND 180`,
        `${q(lat.id)} BETWEEN ${-maxLatitude} AND ${maxLatitude}`,
      ];
      if (layer.size) {
        if (!numeric(col(layer.size)))
          throw new CanvasError(
            "SCHEMA",
            "Map size must use a numeric column.",
          );
        valid.push(`${q(layer.size)} IS NOT NULL`, `${q(layer.size)}>=0`);
      }
      const where = valid.join(" AND ");
      const excluded = Number(
        (
          await engine.db.query(
            `SELECT count(*) AS n FROM ${from} WHERE NOT (${where})`,
          )
        )[0].n,
      );
      omitted += excluded;
      notes.push(
        `Point layer: ${excluded} records omitted for missing/invalid coordinates or size. Longitude must be within ±180; latitude within ±${maxLatitude}${m.projection === "mercator" ? " for Mercator" : ""}. No sampling; at most 20,000 points.`,
      );
      sql = `SELECT * FROM ${from} WHERE ${where}`;
      encoding = {
        longitude: { field: lon.id, type: "quantitative" },
        latitude: { field: lat.id, type: "quantitative" },
        color: layer.color
          ? field(layer.color)
          : { value: layer.constantColor || "#277c6c" },
      };
      if (layer.size)
        encoding.size = { ...field(layer.size), type: "quantitative" };
      if (layer.shape) encoding.shape = field(layer.shape);
    } else {
      const key = col(layer.x),
        value = layer.aggregate === "count" ? undefined : col(layer.y);
      if (value && !numeric(value))
        throw new CanvasError(
          "SCHEMA",
          "Choropleth values must be numeric. Choose a count or parse the value column.",
        );
      if (
        layer.aggregate &&
        !["count", "sum", "mean", "median", "min", "max"].includes(
          layer.aggregate,
        )
      )
        throw new CanvasError("VALIDATION", "Unsupported map aggregation.");
      const keys = features.flatMap((f, i) => {
        const v = m.featureKey === "$id" ? f.id : f.properties[m.featureKey];
        return v === null || v === undefined || v === ""
          ? []
          : [{ i, key: String(v) }];
      });
      if (!keys.length)
        throw new CanvasError(
          "SCHEMA",
          `No boundaries have a value for ${m.featureKey}. Choose an existing boundary property.`,
        );
      const typedKey =
        key.type === "decimal"
          ? "TRY_CAST(boundary_key AS DOUBLE)"
          : key.type === "integer"
            ? "TRY_CAST(boundary_key AS DECIMAL(38,0))"
            : "boundary_key";
      // Reject fractional numeric keys for integer columns, rather than rounding into another region.
      const lookup = `SELECT boundary_index, ${typedKey} AS match_key FROM (VALUES ${keys.map((k) => `(${k.i},${l(k.key)})`).join(",")}) b(boundary_index,boundary_key)${key.type === "integer" ? " WHERE regexp_full_match(boundary_key, '[-+]?[0-9]+')" : ""}`;
      const duplicates = await engine.db.query(
        `SELECT match_key FROM (${lookup}) k WHERE match_key IS NOT NULL GROUP BY match_key HAVING count(*)>1 LIMIT 1`,
      );
      if (duplicates.length)
        throw new CanvasError(
          "SCHEMA",
          `Boundary key “${String(duplicates[0].match_key)}” is duplicated. Select a unique property or combine matching polygons into a MultiPolygon.`,
        );
      geometryIndex = `${layer.id}_region_index`;
      const sourceKey = numeric(key)
        ? `d.${q(key.id)}`
        : `CAST(d.${q(key.id)} AS VARCHAR)`;
      const joined = `${from} d JOIN (${lookup}) b ON ${sourceKey}=b.match_key`;
      const total = Number(
        (await engine.db.query(`SELECT count(*) AS n FROM ${from}`))[0].n,
      );
      const matched = Number(
        (await engine.db.query(`SELECT count(*) AS n FROM ${joined}`))[0].n,
      );
      omitted += total - matched;
      notes.push(
        `Choropleth: ${matched} source records matched; ${total - matched} records have missing or unmatched region keys. Text keys match exactly (case-sensitive); numeric columns use numeric keys. ${features.length - keys.length} boundaries have no selected key.`,
      );
      if (total > matched) {
        const examples = await engine.db.query(
          `SELECT DISTINCT CAST(d.${q(key.id)} AS VARCHAR) AS key FROM ${from} d WHERE NOT EXISTS (SELECT 1 FROM (${lookup}) b WHERE ${sourceKey}=b.match_key) LIMIT 8`,
        );
        notes.push(
          `Unmatched key examples: ${examples.map((r) => (r.key === null ? "(missing)" : String(r.key))).join(", ")}.`,
        );
      }
      if (!layer.aggregate) {
        const duplicateRows = await engine.db.query(
          `SELECT b.boundary_index FROM ${joined} GROUP BY b.boundary_index HAVING count(*)>1 LIMIT 1`,
        );
        if (duplicateRows.length)
          throw new CanvasError(
            "VALIDATION",
            "Multiple records match a region. Choose an explicit aggregation (sum, mean, count, …) or summarize the recipe first.",
          );
        sql = `SELECT d.*, b.boundary_index AS ${q(geometryIndex)} FROM ${joined}`;
        columns.push(column("Boundary index", "integer", geometryIndex));
        encoding = {
          color: {
            field: value!.id,
            type: "quantitative",
            title: value!.name,
            scale: { scheme: m.colorScheme },
          },
        };
      } else {
        const stat = `${layer.id}_stat`,
          n = `${layer.id}_rows`,
          valid = `${layer.id}_valid`;
        sql = `SELECT first(d.${q(key.id)}) AS ${q(key.id)},b.boundary_index AS ${q(geometryIndex)},${aggregate(layer.aggregate, value ? `d.${q(value.id)}` : "*")} AS ${q(stat)},count(*) AS ${q(n)},${value ? `count(d.${q(value.id)})` : "count(*)"} AS ${q(valid)},md5(CAST(list(d."__rid" ORDER BY d."__rid") AS VARCHAR)) AS "__rid",flatten(list(d."__lineage")) AS "__lineage" FROM ${joined} GROUP BY b.boundary_index`;
        columns = [
          key,
          column("Boundary index", "integer", geometryIndex),
          column(
            layer.aggregate === "count"
              ? "Count"
              : `${layer.aggregate} of ${value!.name}`,
            layer.aggregate === "count" ? "integer" : "decimal",
            stat,
          ),
          column("Source records", "integer", n),
          column("Valid values", "integer", valid),
        ];
        encoding = {
          color: {
            field: stat,
            type: "quantitative",
            title: columns[2].name,
            scale: { scheme: m.colorScheme },
          },
        };
      }
      if (value) {
        const missing = Number(
          (
            await engine.db.query(
              `SELECT count(*) AS n FROM ${joined} WHERE d.${q(value.id)} IS NULL`,
            )
          )[0].n,
        );
        notes.push(
          `${missing} matched records have missing values. Numeric aggregates ignore missing values; all-missing or unmatched regions remain unfilled. ${layer.aggregate || "Explicit values; no aggregation"} uses the complete input.`,
        );
      }
    }
    const name = `map_${layer.id}`;
    await engine.db.exec(`CREATE OR REPLACE TEMP VIEW ${q(name)} AS ${sql}`);
    engine.relations.set(layer.id, {
      ...input,
      cacheKey: undefined,
      name,
      columns,
      ordered: false,
    });
    const table = await engine.fullTable(
      layer.id,
      layer.mark === "map_points" ? 20000 : 5000,
    );
    table.sql = sql;
    tables.push(table);
    const values = table.rows.map((r, i) => ({
      ...Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, plainValue(v)]),
      ),
      _record: i,
      _layer: index,
      ...(geometryIndex
        ? { _geometry: features[Number(plainValue(r[geometryIndex]))].geometry }
        : {}),
    }));
    encoding.tooltip = columns
      .filter(
        (c) =>
          !layer.tooltip ||
          layer.tooltip.includes(c.id) ||
          c.id.startsWith(`${layer.id}_`),
      )
      .filter((c) => c.id !== geometryIndex)
      .map((c) => ({
        field: c.id,
        title: c.name,
        type: numeric(c) ? "quantitative" : "nominal",
      }));
    if (geometryIndex) encoding.shape = { field: "_geometry", type: "geojson" };
    const colorField = encoding.color?.field;
    if (geometryIndex && colorField)
      encoding.color = {
        condition: {
          test: `isValid(datum[${JSON.stringify(colorField)}])`,
          ...encoding.color,
        },
        value: "#e0e7e1",
      };
    layers.push({
      data: { values },
      mark: geometryIndex
        ? {
            type: "geoshape",
            stroke: "white",
            strokeWidth: 0.6,
            tooltip: true,
            opacity: m.overlayOpacity ?? (street ? 0.65 : 1),
          }
        : {
            type: "point",
            filled: true,
            size: layer.constantSize || 65,
            opacity: m.overlayOpacity ?? (street ? 0.65 : 0.8),
            stroke: "white",
            strokeWidth: 0.5,
            tooltip: true,
          },
      encoding,
    });
    if (geometryIndex)
      notes.push(
        `${table.rowCount} regions have matched data; ${features.length - table.rowCount} boundaries have no matched records and ${street ? "remain unshaded over the street map" : "remain gray"}.`,
      );
  }
  return {
    id: chart.id,
    name: chart.name,
    authored: chart,
    tables,
    omitted,
    notes,
    spec: {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width,
      height,
      title: {
        text: chart.name,
        subtitle: [
          chart.annotations || "Geographic data",
          `${omitted} layer-record omissions · ${m.projection}`,
          attribution,
          ...(street ? [OSM_ATTRIBUTION] : []),
        ],
        anchor: "start",
        subtitleFontSize: 9,
        subtitleLimit: 560,
      },
      description: [chart.name, ...notes].join(" "),
      projection: {
        type: m.projection,
        scale: (m.projection === "equalEarth" ? 100 : 85) * m.zoom,
        translate: [width / 2, height / 2],
        center: [0, m.centerLatitude],
        rotate: [-m.centerLongitude, 0, 0],
        clipExtent: [
          [0, 0],
          [width, height],
        ],
      },
      layer: layers,
      config: {
        background: "white",
        view: { stroke: null },
        font: "system-ui, sans-serif",
      },
    },
  };
}

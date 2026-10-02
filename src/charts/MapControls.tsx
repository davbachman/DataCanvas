import { useState } from "react";
import type { Chart } from "../domain/model";
import {
  defaultMap,
  fitMapView,
  MAX_GEO_BYTES,
  parseGeoJSON,
  type MapSettings,
} from "../domain/geography";
import { Field, Select, Text } from "../editor/Configure";
export function MapControls({
  chart,
  onChange,
  spec,
}: {
  chart: Chart;
  spec?: any;
  onChange: (chart: Chart) => void;
}) {
  const [error, setError] = useState("");
  const m = chart.map || defaultMap();
  const set = (key: keyof MapSettings, value: any) =>
    onChange({ ...chart, map: { ...m, [key]: value } });
  const keys =
    m.basemap === "world"
      ? ["name", "$id"]
      : [
          "$id",
          ...new Set(
            m.boundaries?.features.flatMap((f) => Object.keys(f.properties)) ||
              [],
          ),
        ];
  return (
    <fieldset className="subform map-controls">
      <legend>Map view & boundaries</legend>
      <Select
        label="Projection"
        value={m.projection}
        options={[
          { value: "equalEarth", label: "Equal Earth (equal area)" },
          { value: "mercator", label: "Mercator" },
          { value: "equirectangular", label: "Equirectangular" },
        ]}
        onChange={(v) => set("projection", v)}
      />
      <Select
        label="Boundary source"
        value={m.basemap}
        options={[
          { value: "world", label: "World countries (bundled)" },
          { value: "custom", label: "Imported GeoJSON" },
        ]}
        onChange={(v) => set("basemap", v)}
      />
      {m.basemap === "custom" && (
        <>
          <Field label="GeoJSON boundaries">
            <input
              type="file"
              accept=".geojson,.json,application/geo+json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > MAX_GEO_BYTES)
                    throw new Error("GeoJSON exceeds the 5 MiB limit.");
                  const boundaries = parseGeoJSON(await file.text());
                  const key =
                    Object.keys(boundaries.features[0].properties).find((k) =>
                      /^(name|id|code)$/i.test(k),
                    ) ||
                    Object.keys(boundaries.features[0].properties)[0] ||
                    "$id";
                  onChange({
                    ...chart,
                    map: {
                      ...m,
                      basemap: "custom",
                      boundaries,
                      boundaryName: file.name,
                      featureKey: key,
                    },
                  });
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </Field>
          {m.boundaries && (
            <small>
              {m.boundaryName}: {m.boundaries.features.length} features saved in
              this project.
            </small>
          )}
          <Text
            label="Boundary attribution / source"
            value={m.attribution || ""}
            onChange={(v) => set("attribution", v)}
          />
          <small>
            WGS84 Polygon/MultiPolygon FeatureCollection; longitude first. Up to
            5 MiB, 5,000 features and 200,000 positions.
          </small>
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {chart.layers.some((l) => l.mark === "choropleth") && (
        <>
          <Select
            label="Boundary join property"
            value={m.featureKey}
            options={[...new Set([m.featureKey, ...keys])].map((k) => ({
              value: k,
              label: k === "$id" ? "Feature ID" : k,
            }))}
            onChange={(v) => set("featureKey", v)}
          />
          <small>
            Join the region column to this boundary property. Text keys match
            exactly; numeric columns match numeric keys. Boundary keys must be
            unique.
          </small>
          <Select
            label="Map color palette"
            value={m.colorScheme}
            options={["blues", "viridis", "redblue"]}
            onChange={(v) => set("colorScheme", v)}
          />
        </>
      )}
      <Text
        label="Map zoom (0.5–2000)"
        type="number"
        value={m.zoom}
        onChange={(v) =>
          Number.isFinite(v) && v >= 0.5 && v <= 2000 && set("zoom", v)
        }
      />
      <div className="inline">
        <button onClick={() => set("zoom", Math.min(2000, m.zoom * 1.5))}>
          Zoom in
        </button>
        <button onClick={() => set("zoom", Math.max(0.5, m.zoom / 1.5))}>
          Zoom out
        </button>
      </div>
      <Text
        label="Map center longitude"
        type="number"
        value={m.centerLongitude}
        onChange={(v) =>
          Number.isFinite(v) && Math.abs(v) <= 180 && set("centerLongitude", v)
        }
      />
      <Text
        label="Map center latitude"
        type="number"
        value={m.centerLatitude}
        onChange={(v) =>
          Number.isFinite(v) && Math.abs(v) <= 85 && set("centerLatitude", v)
        }
      />
      <button
        disabled={!spec}
        onClick={() => {
          const features = (spec?.layer || []).flatMap((layer: any) =>
            (layer.data?.values || [])
              .filter((r: any) => r._record !== undefined)
              .map((r: any) => ({
                type: "Feature",
                properties: {},
                geometry: r._geometry || {
                  type: "Point",
                  coordinates: [
                    r[layer.encoding.longitude.field],
                    r[layer.encoding.latitude.field],
                  ],
                },
              })),
          );
          const view = fitMapView(m, { type: "FeatureCollection", features });
          if (view) onChange({ ...chart, map: { ...m, ...view } });
        }}
      >
        Fit mapped data
      </button>
      <button
        onClick={() =>
          onChange({
            ...chart,
            map: { ...m, zoom: 1, centerLongitude: 0, centerLatitude: 0 },
          })
        }
      >
        Reset map view
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={m.graticule}
          onChange={(e) => set("graticule", e.target.checked)}
        />
        Latitude/longitude grid
      </label>
      <small>
        World boundaries: Natural Earth / world-atlas. Generalized, not for
        navigation. Zoom and centering can clip geography. No external map
        requests.
      </small>
    </fieldset>
  );
}

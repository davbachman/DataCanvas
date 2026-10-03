import { it, expect } from "vitest";
import { compile } from "vega-lite";
import { View, parse } from "vega";
import { stylingFixture } from "./fixtures/styling";
import { mappingExample } from "../src/map-example";
import { pieFixture } from "./fixtures/pies";
import { Engine } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { resolveChart } from "../src/charts/resolve";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { chartStyleSchema } from "../src/domain/chartStyle";
import { visibleTiles } from "../src/charts/tiles";
import { defaultMap } from "../src/domain/geography";
import type { ResolvedChart } from "../src/charts/resolve";
async function svg(result: ResolvedChart) {
  const view = new View(parse(compile(result.spec as any).spec), {
    renderer: "none",
  });
  try {
    const svg = await view.toSVG();
    expect(svg).not.toMatch(/NaN|Infinity/);
    return svg;
  } finally {
    view.finalize();
  }
}
const records = (r: ResolvedChart) =>
  r.tables.map((t) =>
    t.rows
      .map((row, i) => ({ row, lineage: [...t.lineage[i]].sort() }))
      .sort((a, b) =>
        JSON.stringify(a.row).localeCompare(JSON.stringify(b.row)),
      ),
  );
it("styled subplot and overlay layouts preserve data, mark indices and portable settings", async () => {
  const bundle = await stylingFixture(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    const chart = bundle.project.charts[0],
      panels = await resolveChart(engine, chart);
    expect(panels.spec.concat).toHaveLength(2);
    expect(panels.spec.concat.map((p: any) => p.title.text)).toEqual([
      "Totals by country",
      "Value distribution",
    ]);
    expect(
      panels.spec.concat[1].layer[0].data.values.every(
        (v: any) => v._layer === 1,
      ),
    ).toBe(true);
    expect(panels.spec.concat[0]).toMatchObject({ width: 320, height: 230 });
    const output = await svg(panels);
    expect(output).toContain("#17212b");
    expect(output).toContain("serif");
    expect(output).toContain("Value distribution");
    const overlay = await resolveChart(engine, {
      ...chart,
      style: {
        ...chart.style,
        arrangement: "overlay",
        xScales: "independent",
        yScales: "independent",
      },
    });
    expect(overlay.spec.layer).toHaveLength(2);
    expect(records(overlay)).toEqual(records(panels));
    await svg(overlay);
    expect(unpackBundle(packBundle(bundle)).project.charts).toEqual(
      bundle.project.charts,
    );
  } finally {
    await db.close();
  }
});
it("stacking modes transpose with orientation and never change contributor records", async () => {
  const bundle = await stylingFixture(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    const base = {
      ...bundle.project.charts[0],
      style: undefined,
      layers: [bundle.project.charts[0].layers[0]],
    };
    const original = await resolveChart(engine, base);
    for (const stack of ["none", "zero", "normalize", "center"] as const)
      for (const orientation of ["horizontal", "vertical"] as const) {
        const result = await resolveChart(engine, {
          ...base,
          layers: [{ ...base.layers[0], stack, orientation }],
        });
        expect(records(result)).toEqual(records(original));
        const value =
          result.spec.layer[0].encoding[
            orientation === "horizontal" ? "x" : "y"
          ];
        expect(value.stack).toBe(stack === "none" ? null : stack);
        if (stack === "normalize") expect(value.axis.format).toBe(".0%");
        await svg(result);
      }
    await expect(
      resolveChart(engine, {
        ...base,
        layers: [{ ...base.layers[0], color: undefined }],
      }),
    ).rejects.toThrow("color field");
    await expect(
      resolveChart(engine, { ...base, scales: { yLog: true } }),
    ).rejects.toThrow("linear value axis");
  } finally {
    await db.close();
  }
});
it("facet wrapping, spacing, independent scales and hidden legends/axes compile to rendered graphics", async () => {
  const bundle = await stylingFixture(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    const result = await resolveChart(engine, bundle.project.charts[1]);
    expect(result.spec.facet.field).toBe("country");
    expect(result.spec.columns).toBe(2);
    expect(result.spec.spacing).toBe(30);
    expect(result.spec.resolve.scale).toEqual({
      x: "independent",
      y: "independent",
    });
    expect(result.spec.spec.layer[0].encoding.color.legend).toBeNull();
    await svg(result);
    const hidden = await resolveChart(engine, {
      ...bundle.project.charts[1],
      style: { axes: false, legend: "none", background: "#ffeecc" },
    });
    expect(hidden.spec.spec.layer[0].encoding.x.axis).toBeNull();
    expect(await svg(hidden)).toContain("#ffeecc");
    const nested = await resolveChart(engine, {
      ...bundle.project.charts[1],
      style: { ...bundle.project.charts[1].style, arrangement: "subplots" },
      layers: [
        bundle.project.charts[1].layers[0],
        { id: "boxes", mark: "box", x: "country", y: "value" },
      ],
    });
    await svg(nested);
  } finally {
    await db.close();
  }
});
it("resizes pie geometry and map projection/tiles consistently, and validates style bounds", async () => {
  const bundle = await mappingExample(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    const pie = (await pieFixture()).project.charts[0];
    const result = await resolveChart(engine, {
      ...pie,
      style: { width: 880, height: 640, theme: "minimal", legend: "left" },
    });
    expect(result.spec.layer[0].mark.outerRadius).toBe(280);
    await svg(result);
    const map = await resolveChart(engine, {
      ...bundle.project.charts[0],
      style: { width: 800, height: 500, theme: "dark", fontSize: 14 },
    });
    expect(map.spec.projection.translate).toEqual([400, 250]);
    expect(map.spec.projection.clipExtent[1]).toEqual([800, 500]);
    await svg(map);
    const m = {
      ...defaultMap(),
      version: 2 as const,
      tiles: "openstreetmap" as const,
      projection: "mercator" as const,
    };
    const small = visibleTiles(m)[0].data.values,
      large = visibleTiles(m, 1000, 700)[0].data.values;
    expect(large.length).toBeGreaterThan(small.length);
    const a = small.find((t) => large.some((other) => other.url === t.url))!,
      b = large.find((t) => t.url === a.url)!;
    expect(b.x - a.x).toBe(220);
    expect(b.y - a.y).toBe(180);
    expect(() => chartStyleSchema.parse({ width: 100000 })).toThrow();
    await expect(
      resolveChart(engine, { ...pie, style: { arrangement: "subplots" } }),
    ).rejects.toThrow("Cartesian");
  } finally {
    await db.close();
  }
});

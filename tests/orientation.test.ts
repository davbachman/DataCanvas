import { it, expect } from "vitest";
import { compile } from "vega-lite";
import { parse, View } from "vega";
import { mappingExample } from "../src/map-example";
import { Engine } from "../src/engine/core";
import { nativeDB } from "../src/engine/native";
import { resolveChart } from "../src/charts/resolve";
import { markPredicate } from "../src/charts/selection";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import type { Chart, Layer } from "../src/domain/model";
it("horizontal bars, counts and histograms preserve statistics and lineage while transposing geometry", async () => {
  const bundle = await mappingExample(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    for (const mark of ["bar", "count", "histogram"] as const) {
      const layer: Layer = {
        id: "oriented",
        mark,
        x: mark === "histogram" ? "value" : "country",
        y: "value",
        aggregate: mark === "bar" ? "sum" : undefined,
        binWidth: 10,
      };
      const chart: Chart = {
        id: "test",
        name: "Oriented",
        inputRecipeId: "locations_recipe",
        layers: [layer],
        scales: {
          xTitle: "Groups or bins",
          yTitle: "Magnitude",
          yDomain: [0, 100],
        },
        annotations: "",
      };
      const vertical = await resolveChart(engine, chart);
      const horizontal = await resolveChart(engine, {
        ...chart,
        layers: [{ ...layer, orientation: "horizontal" }],
      });
      const byCategory = (r: any) =>
        r.tables[0].rows
          .map((row: any, i: number) => ({
            row,
            lineage: r.tables[0].lineage[i].sort(),
          }))
          .sort((a: any, b: any) =>
            JSON.stringify(a.row).localeCompare(JSON.stringify(b.row)),
          );
      expect(byCategory(horizontal)).toEqual(byCategory(vertical));
      const v = vertical.spec.layer[0].encoding,
        h = horizontal.spec.layer[0].encoding;
      expect(h.x).toEqual(v.y);
      expect(h.y).toEqual(v.x);
      expect(h.x.title).toBe("Magnitude");
      expect(h.x.scale.domain).toEqual([0, 100]);
      if (mark === "histogram") expect(h.y2).toEqual(v.x2);
      const predicate = JSON.stringify(
        markPredicate(horizontal.authored, 0, horizontal.tables[0].rows[0]),
      );
      expect(predicate).toContain(layer.x!);
      if (mark === "histogram") {
        expect(predicate).toContain('"op":">="');
        expect(predicate).toContain('"op":"<"');
      } else expect(predicate).toContain('"op":"="');
      const view = new View(parse(compile(horizontal.spec as any).spec), {
        renderer: "none",
      });
      try {
        const svg = await view.toSVG();
        expect(svg).toContain('class="mark-rect');
        expect(svg).not.toContain("NaN");
      } finally {
        view.finalize();
      }
      bundle.project.charts = [horizontal.authored];
      expect(
        unpackBundle(packBundle(bundle)).project.charts[0].layers[0]
          .orientation,
      ).toBe("horizontal");
    }
  } finally {
    await db.close();
  }
});
it("horizontal binned explicit bars and facets keep range endpoints on the category axis", async () => {
  const bundle = await mappingExample(),
    db = await nativeDB(),
    engine = new Engine(db);
  try {
    await engine.run(bundle);
    const c: Chart = {
      id: "bins",
      name: "Intervals",
      inputRecipeId: "locations_recipe",
      layers: [
        {
          id: "ranges",
          mark: "bar",
          x: "longitude",
          x2: "latitude",
          y: "value",
          orientation: "horizontal",
        },
      ],
      facetColumn: "country",
      scales: {},
      annotations: "",
    };
    const result = await resolveChart(engine, c);
    expect(result.spec.spec.layer[0].encoding.y2.field).toBe("latitude");
    expect(result.spec.spec.layer[0].encoding.x.field).toBe("value");
    const view = new View(parse(compile(result.spec as any).spec), {
      renderer: "none",
    });
    try {
      expect(await view.toSVG()).not.toContain("NaN");
    } finally {
      view.finalize();
    }
  } finally {
    await db.close();
  }
});

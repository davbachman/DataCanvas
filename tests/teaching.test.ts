import { describe, it, expect } from "vitest";
import { teachingFixture } from "./fixtures/teaching";
import { run } from "../src/headless/api";
import { plainValue } from "../src/engine/core";
import { packBundle, unpackBundle } from "../src/persistence/bundle";
import { nativeDB } from "../src/engine/native";
import { previewRename } from "../src/compiler/rename";
const values = (r: any, id: string) =>
  r.tables[id].rows.map((row: any) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, plainValue(v as any)]),
    ),
  );
describe("teaching operations", () => {
  it("handles signed minutes, midnight, leap/year boundaries, missing components and explicit DST policies", async () => {
    const b = unpackBundle(packBundle(await teachingFixture()));
    const r = await run(b);
    expect(r.errors).toEqual([]);
    const rows = values(r, "departures");
    expect(rows[0]).toMatchObject({
      actual: "2025-01-01 00:05:00",
      different_day: true,
      formatted: "January 01, 2025 12:05 AM",
      part_hour: 0,
      part_minute: 5,
      part_weekday: 3,
      part_week: 1,
      part_week_year: 2025,
    });
    expect(rows[1]).toMatchObject({
      actual: "2023-12-31 23:55:00",
      different_day: true,
    });
    expect(rows[2].actual).toBe("2024-02-29 00:01:00");
    expect(rows[5].scheduled).toBeNull();
    expect(rows[6].scheduled).toBeNull();
    expect(rows[7].actual).toBeNull();
    for (const policy of ["missing", "earlier", "later"])
      expect(values(r, "zone_" + policy)[3]["utc_" + policy]).toBeNull();
    expect(values(r, "zone_missing")[4].utc_missing).toBeNull();
    expect(values(r, "zone_earlier")[4]).toMatchObject({
      utc_earlier: "2024-11-03 05:30:00",
      local_earlier: "2024-11-03 01:30:00",
    });
    expect(values(r, "zone_later")[4]).toMatchObject({
      utc_later: "2024-11-03 06:30:00",
      local_later: "2024-11-03 01:30:00",
    });
    expect(
      r.tables.departures.columns.find((c) => c.id === "scheduled")?.timeBasis,
    ).toBe("wall");
    expect(
      r.tables.zone_earlier.columns.find((c) => c.id === "utc_earlier")
        ?.timeBasis,
    ).toBe("utc");
  });
  it("distinguishes ranks and retains or rejects small groups by valid observations", async () => {
    const r = await run(await teachingFixture());
    expect(r.errors).toEqual([]);
    expect(
      values(r, "rank_row_number")
        .slice(0, 4)
        .map((x: any) => x.position_row_number),
    ).toEqual([1, 2, 3, null]);
    expect(
      values(r, "rank_rank")
        .slice(0, 4)
        .map((x: any) => x.position_rank),
    ).toEqual([1, 1, 3, null]);
    expect(
      values(r, "rank_dense_rank")
        .slice(0, 4)
        .map((x: any) => x.position_dense_rank),
    ).toEqual([1, 1, 2, null]);
    expect(values(r, "top_false").map((x: any) => x.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
      "g",
      "h",
    ]);
    expect(values(r, "top_true").map((x: any) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      r.tables.rename_weeks.columns
        .filter((c) => ["wk1", "wk2"].includes(c.id))
        .map((c) => c.name),
    ).toEqual(["1", "2"]);
    expect(values(r, "rename_weeks")[0].week_sum).toBe(3);
  });
  it("detects bulk-name collisions against unselected columns and rejects invalid RE2", async () => {
    const b = await teachingFixture(),
      db = await nativeDB();
    try {
      const c = b.project.sources[0].columns;
      const result = await previewRename(db, c, {
        columns: ["wk1"],
        action: "literal",
        search: "wk1",
        replacement: "id",
      });
      expect(result.filter((r) => r.error).map((r) => r.id)).toEqual([
        "id",
        "wk1",
      ]);
      await expect(
        previewRename(db, c, {
          columns: ["wk1"],
          action: "regex",
          search: "(?<=wk)1",
          replacement: "x",
        }),
      ).rejects.toThrow("RE2");
    } finally {
      await db.close();
    }
  });
});

it("resolves category order, grouped bars and uncertainty statistics without hidden resampling", async () => {
  const b = await teachingFixture(),
    r = await run(b);
  expect(r.errors).toEqual([]);
  expect(r.submission?.ready).toBe(true);
  const charts = r.charts as any[],
    grouped = charts.find((c) => c.id === "grouped"),
    error = charts.find((c) => c.id === "errors"),
    band = charts.find((c) => c.id === "bands"),
    line = charts.find((c) => c.id === "styled_lines");
  expect(grouped.spec.layer[0].encoding.y.sort).toEqual(["C", "A", "B"]);
  expect(grouped.spec.layer[0].encoding.yOffset.sort).toEqual([
    12, 1, 2, 3, 5, 11,
  ]);
  const rows = error.tables[0].rows.map((r: any) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, plainValue(v as any)]),
    ),
  );
  const a = rows.find((r: any) => r.home === "A"),
    bRow = rows.find((r: any) => r.home === "B");
  expect(a.intervals_mean).toBeCloseTo(163.3333333333);
  expect(a.intervals_valid).toBe(3);
  expect(a.intervals_missing).toBe(1);
  expect(a.intervals_sd).toBeCloseTo(Math.sqrt(100 / 3));
  expect(a.intervals_lower).toBeCloseTo(
    a.intervals_mean - 1.959963984540054 * a.intervals_se,
  );
  expect(bRow.intervals_valid).toBe(1);
  expect(bRow.intervals_lower).toBeNull();
  expect(error.notes.join(" ")).toContain("95% normal-approximation");
  expect(error.authored.layers[0].constantColor).toBe("#000080");
  expect(band.spec.layer[0].mark.opacity).toBe(0.25);
  expect(band.spec.layer[1].mark.strokeDash).toEqual([8, 4]);
  expect(line.spec.layer[0].encoding.strokeDash.sort).toEqual(["C", "A", "B"]);
  expect(line.spec.layer[0].mark.point).toBeTruthy();
  expect(line.spec.layer[0].encoding.order.field).toBe("_categoryOrder");
  const saved = unpackBundle(packBundle(b));
  expect(saved.project.charts[1].layers[0].constantColor).toBe("#000080");
  expect(saved.project.charts[2].layers[0].constantColor).toBe("#663399");
});

it("orders descending with explicit missing placement, preserves top-k ties and uses UTC elapsed time across DST", async () => {
  const r = await run(await teachingFixture());
  expect(r.errors).toEqual([]);
  expect(
    values(r, "descending_missing")
      .slice(0, 4)
      .map((x: any) => [x.id, x.desc_rank]),
  ).toEqual([
    ["d", 1],
    ["c", 2],
    ["b", 3],
    ["a", 4],
  ]);
  expect(values(r, "top_ties").map((x: any) => x.id)).toEqual([
    "a",
    "b",
    "e",
    "g",
  ]);
  expect(values(r, "elapsed_overlap")[4]).toMatchObject({
    utc_earlier: "2024-11-03 05:30:00",
    one_hour_later: "2024-11-03 06:30:00",
    one_hour_local: "2024-11-03 01:30:00",
  });
});

it("rejects normalized or fractional component overflows and uses ISO week years", async () => {
  const { compileDatetime } = await import("../src/compiler/datetime");
  const { column } = await import("../src/domain/model");
  const { newOperation } = await import("../src/domain/operations");
  const db = await nativeDB();
  try {
    const columns = ["year", "month", "day", "hour", "minute"].map((id) =>
      column(id, "integer", id),
    );
    const p = {
      ...newOperation("datetime", columns).params,
      year: "year",
      month: "month",
      day: "day",
      hour: "hour",
      minute: "minute",
    };
    const sql = compileDatetime(p, columns).value;
    const rows = await db.query(
      `SELECT ${sql} AS value FROM (VALUES (2024,1,1,24,0),(2024,1,1,12,60),(2024,2,30,12,0),(2024,1,1,12.5,0),(2024,1,1,NULL,0)) t(year,month,day,hour,minute)`,
    );
    expect(rows.map((r) => r.value)).toEqual([null, null, null, null, null]);
    const week = compileDatetime(
      { ...p, action: "extract", part: "week", columnId: "time" },
      [column("time", "timestamp", "time")],
    ).value;
    const year = compileDatetime(
      { ...p, action: "extract", part: "week_year", columnId: "time" },
      [column("time", "timestamp", "time")],
    ).value;
    expect(
      (
        await db.query(
          `SELECT ${week} AS week,${year} AS year FROM (SELECT TIMESTAMP '2021-01-01' AS time)`,
        )
      )[0],
    ).toEqual({ week: 53n, year: 2020n });
  } finally {
    await db.close();
  }
});

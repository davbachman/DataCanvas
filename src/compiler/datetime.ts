import moment from "moment-timezone";
import { CanvasError, column, type Column } from "../domain/model";
import {
  literal as l,
  quote as q,
  requireColumn,
  expression,
  expressionType,
} from "./expressions";

export const TIMEZONE_VERSION = moment.tz.dataVersion;
export const TIMEZONE_NAMES = moment.tz.names();
const start = Date.UTC(1900, 0, 1),
  end = Date.UTC(2101, 0, 1);
const rules = new Map<string, string>();
/** Frozen IANA intervals become ordinary SQL; exports need no timezone extension or host tzdb. */
export function timezoneSQL(
  value: string,
  zoneName: string,
  direction: string,
  ambiguous: string,
) {
  let values = rules.get(zoneName);
  if (!values) {
    const zone = moment.tz.zone(zoneName);
    if (!zone)
      throw new CanvasError(
        "VALIDATION",
        `Unknown IANA timezone “${zoneName}”. Choose a timezone such as America/New_York or UTC.`,
      );
    const rows: string[] = [];
    for (let i = 0; i < zone.untils.length; i++) {
      const a = Math.max(start, i ? zone.untils[i - 1] : -Infinity),
        b = Math.min(end, zone.untils[i]);
      if (a < b)
        rows.push(
          `(TIMESTAMP ${l(new Date(a).toISOString().slice(0, 23).replace("T", " "))},TIMESTAMP ${l(new Date(b).toISOString().slice(0, 23).replace("T", " "))},${-zone.offsets[i]})`,
        );
    }
    values = rows.join(",");
    rules.set(zoneName, values);
  }
  const table = `(VALUES ${values}) AS dc_tz(dc_start,dc_end,dc_offset)`;
  const offset = `(dc_offset * INTERVAL '1 minute')`;
  const v = `CAST(${value} AS TIMESTAMP)`;
  if (direction === "utc_to_local")
    return `(SELECT ${v}+${offset} FROM ${table} WHERE ${v}>=dc_start AND ${v}<dc_end)`;
  const chosen = `${ambiguous === "later" ? "max" : "min"}(${v}-${offset})`;
  return `(SELECT ${ambiguous === "missing" ? `CASE WHEN count(*)=1 THEN ${chosen} END` : chosen} FROM ${table} WHERE ${v}>=dc_start+${offset} AND ${v}<dc_end+${offset})`;
}

export function compileDatetime(
  p: Record<string, any>,
  columns: Column[],
  inputAlias?: string,
) {
  const get = (id: string) =>
    (inputAlias ? q(inputAlias) + "." : "") + q(requireColumn(columns, id).id);
  let value: string,
    result = column(p.name, "timestamp", p.outputId),
    explanation = "Missing inputs remain missing.";
  if (p.action === "construct") {
    const ids = [
      p.year,
      p.month,
      p.day,
      ...(p.target === "timestamp" ? [p.hour, p.minute].filter(Boolean) : []),
    ];
    for (const id of ids)
      if (!["integer", "decimal"].includes(requireColumn(columns, id).type))
        throw new CanvasError(
          "SCHEMA",
          "Date/time components must be numeric whole-number columns. Parse text components first.",
        );
    const whole = ids
      .map((id) => `${get(id)} IS NOT NULL AND ${get(id)}=trunc(${get(id)})`)
      .join(" AND ");
    const parts = [p.year, p.month, p.day].map(
      (id) => `TRY_CAST(${get(id)} AS BIGINT)`,
    );
    const construction =
      p.target === "date"
        ? `make_date(${parts.join(",")})`
        : `make_timestamp(${parts.join(",")},${p.hour ? `TRY_CAST(${get(p.hour)} AS BIGINT)` : "0"},${p.minute ? `TRY_CAST(${get(p.minute)} AS BIGINT)` : "0"},0)`;
    const bounded = [
      `${get(p.year)} BETWEEN 1 AND 9999`,
      `${get(p.month)} BETWEEN 1 AND 12`,
      `${get(p.day)} BETWEEN 1 AND 31`,
      ...(p.target === "timestamp" && p.hour
        ? [`${get(p.hour)} BETWEEN 0 AND 23`]
        : []),
      ...(p.target === "timestamp" && p.minute
        ? [`${get(p.minute)} BETWEEN 0 AND 59`]
        : []),
    ].join(" AND ");
    value = `CASE WHEN ${whole} AND ${bounded} THEN TRY(${construction}) END`;
    result.type = p.target;
    if (p.target === "timestamp") result.timeBasis = p.timeBasis;
    explanation = `Constructed ${p.target}${p.target === "timestamp" ? ` (${p.timeBasis === "wall" ? "local wall time, no UTC conversion" : "UTC"})` : ""}. Unselected hour/minute = 0; missing selected components, fractional components, or invalid dates become missing.`;
  } else {
    const source = requireColumn(columns, p.columnId);
    if (!["date", "timestamp"].includes(source.type))
      throw new CanvasError(
        "SCHEMA",
        "Choose a Date or Timestamp column; parse text first.",
      );
    const v = get(p.columnId);
    if (p.action === "add") {
      if (!["integer", "decimal"].includes(expressionType(p.amount, columns)))
        throw new CanvasError("SCHEMA", "Duration must be numeric.");
      const seconds: Record<string, number> = {
        seconds: 1,
        minutes: 60,
        hours: 3600,
        days: 86400,
        weeks: 604800,
      };
      value = `TRY(CAST(${v} AS TIMESTAMP) + (${expression(p.amount, columns)}) * INTERVAL '${seconds[p.unit]} seconds')`;
      result.timeBasis =
        source.timeBasis || (source.type === "date" ? "wall" : "utc");
      // A wall-time arithmetic result no longer promises to be a valid instant in its former timezone.
      explanation = `Add signed ${p.unit}; days = 24 hours and weeks = 7 days. ${result.timeBasis === "wall" ? "Wall-clock arithmetic does not apply DST; convert to UTC before adding an elapsed duration, then convert back." : "UTC arithmetic measures elapsed time."}`;
    } else if (p.action === "extract") {
      const parts: Record<string, string> = {
        year: "year",
        month: "month",
        day: "day",
        hour: "hour",
        minute: "minute",
        weekday: "isodow",
        week: "week",
        week_year: "isoyear",
      };
      value =
        p.part === "date"
          ? `CAST(${v} AS DATE)`
          : `CAST(date_part(${l(parts[p.part])},${v}) AS BIGINT)`;
      result = column(
        p.name,
        p.part === "date" ? "date" : "integer",
        p.outputId,
      );
      explanation =
        "Weekday: Monday=1 … Sunday=7. ISO 8601 weeks begin Monday; week 1 contains January 4. Pair week with week_year at year boundaries. Extraction uses the stored UTC or wall-clock fields without implicit conversion.";
    } else if (p.action === "format") {
      value = `strftime(${v},${l(p.format)})`;
      result = column(p.name, "text", p.outputId);
      explanation =
        "Formatting returns text without timezone conversion. %B = month name, %A = weekday, %I = 12-hour clock, %M = minute, %p = AM/PM; names are English.";
    } else {
      value = timezoneSQL(v, p.zone, p.direction, p.ambiguous);
      result.timeBasis = p.direction === "local_to_utc" ? "utc" : "wall";
      if (result.timeBasis === "wall") result.timeZone = p.zone;
      explanation = `${p.direction === "local_to_utc" ? "Interpret the input clock fields as local time and convert to UTC" : "Interpret the input as UTC and display local wall time"} in ${p.zone}. IANA ${TIMEZONE_VERSION}; UTC coverage 1900–2100. Nonexistent DST times and out-of-range instants become missing. Repeated local times: ${p.ambiguous}. Direction is explicit; no host-timezone inference.`;
    }
  }
  return { value, column: result, explanation };
}

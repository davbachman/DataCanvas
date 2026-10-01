import Papa from "papaparse";
import * as XLSX from "@e965/xlsx";
import {
  CanvasError,
  column,
  uid,
  type Source,
  type ImportSpec,
  type Column,
} from "../domain/model";
export const defaultImport: ImportSpec = {
  format: "csv",
  delimiter: ",",
  quote: '"',
  headerRow: 1,
  missingTokens: [],
  malformedPolicy: "retain",
  timezone: "UTC",
};
export interface ImportData {
  headers: string[];
  rows: (string | null)[][];
  issues: { row: number; message: string }[];
  sheets: string[];
}
export function parseAsset(bytes: Uint8Array, spec: ImportSpec): ImportData {
  let records: (string | null)[][] = [],
    sheets: string[] = [],
    issues: ImportData["issues"] = [];
  if (spec.format === "xlsx") {
    let book: XLSX.WorkBook;
    try {
      book = XLSX.read(bytes, {
        type: "array",
        cellDates: false,
        bookVBA: false,
        cellFormula: true,
      });
    } catch {
      throw new CanvasError(
        "SOURCE",
        "Cannot read this spreadsheet. Choose a valid .xlsx workbook.",
      );
    }
    sheets = book.SheetNames;
    const sheet = book.Sheets[spec.sheet || sheets[0]];
    if (!sheet)
      throw new CanvasError("SOURCE", "The selected sheet does not exist");
    records = XLSX.utils
      .sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: null })
      .map((row) => row.map((v) => (v == null ? null : String(v))));
    for (const [key, cell] of Object.entries(sheet))
      if (
        !key.startsWith("!") &&
        (cell as XLSX.CellObject).f &&
        (cell as XLSX.CellObject).v === undefined
      )
        issues.push({
          row: XLSX.utils.decode_cell(key).r + 1,
          message: `Formula at ${key} has no stored result; no formulas or external links are executed.`,
        });
  } else {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CanvasError(
        "SOURCE",
        "Unsupported text encoding. Save the source as UTF-8 CSV/TSV.",
      );
    }
    if (text.includes("\0"))
      throw new CanvasError(
        "SOURCE",
        "NUL bytes found: this does not look like UTF-8 CSV/TSV.",
      );
    const parsed = Papa.parse<string[]>(text, {
      delimiter: spec.delimiter,
      quoteChar: spec.quote,
      skipEmptyLines: false,
    });
    records = parsed.data;
    issues = parsed.errors.map((e) => ({
      row: (e.row ?? 0) + 1,
      message: e.message,
    }));
    if (records.at(-1)?.length === 1 && records.at(-1)?.[0] === "")
      records.pop();
  }
  const header = records[spec.headerRow - 1];
  if (!header?.length)
    throw new CanvasError("SOURCE", "Header row is empty or outside the file.");
  const headers = header.map((v, i) => v || `column_${i + 1}`);
  if (new Set(headers).size !== headers.length)
    throw new CanvasError(
      "SCHEMA",
      "Duplicate column names in the header. Give them unique aliases before importing.",
    );
  const rows: (string | null)[][] = [];
  records.slice(spec.headerRow).forEach((row, index) => {
    const rowNumber = index + spec.headerRow + 1;
    if (row.length !== headers.length) {
      issues.push({
        row: rowNumber,
        message: `Expected ${headers.length} fields, found ${row.length}. ${row.length > headers.length ? "Extra fields are preserved in an overflow column." : "Absent fields are missing."}`,
      });
      if (spec.malformedPolicy === "exclude") return;
    }
    rows.push(row);
  });
  if (rows.some((row) => row.length > headers.length)) {
    const n = headers.length;
    let overflow = "_overflow";
    while (headers.includes(overflow)) overflow += "_";
    headers.push(overflow);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      rows[i] = [
        ...Array.from({ length: n }, (_, j) => row[j] ?? null),
        row.length > n ? JSON.stringify(row.slice(n)) : null,
      ];
    }
  }
  return {
    headers,
    rows: rows.map((row) =>
      headers.map((_, i) =>
        row[i] === undefined || spec.missingTokens.includes(row[i] as string)
          ? null
          : row[i],
      ),
    ),
    issues,
    sheets,
  };
}
export async function fingerprint(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function createSource(
  name: string,
  bytes: Uint8Array,
  spec: ImportSpec,
  overrides?: Column[],
): Promise<{ source: Source; data: ImportData }> {
  const data = parseAsset(bytes, spec);
  const id = uid("src");
  return {
    source: {
      id,
      name,
      assetRef: `sources/${id}.${spec.format}`,
      fingerprint: await fingerprint(bytes),
      importSpec: spec,
      columns:
        overrides ||
        data.headers.map((h, i) => {
          const values = data.rows
            .map((r) => r[i])
            .filter((v) => v !== null && v !== "");
          const numeric =
            values.length &&
            values.every((v) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v!)) &&
            !/id|code|zip|postal/i.test(h);
          return column(h, numeric ? "decimal" : "text");
        }),
      rowMeaning: "",
      attribution: "Local file",
    },
    data,
  };
}
export function verifySourceColumns(source: Source, data: ImportData) {
  if (
    data.headers.length !== source.columns.length ||
    data.headers.some((h, i) => h !== source.columns[i].name)
  )
    throw new CanvasError(
      "SCHEMA",
      `Source ${source.name} schema changed. Review an explicit column mapping before replacing it.`,
    );
}

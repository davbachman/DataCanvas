import { useEffect, useState } from "react";
import { X, Upload } from "lucide-react";
import {
  createSource,
  defaultImport,
  parseAsset,
  type ImportData,
} from "../persistence/import";
import { type Column, type Source, type ImportSpec } from "../domain/model";
import { Field, Select, Text } from "./Configure";
export function ImportDialog({
  file,
  onClose,
  onImport,
  replacement,
}: {
  file: File;
  onClose: () => void;
  onImport: (source: Source, bytes: Uint8Array) => void;
  replacement?: Source;
}) {
  const [bytes, setBytes] = useState<Uint8Array>(),
    [spec, setSpec] = useState<ImportSpec>({
      ...defaultImport,
      format: file.name.endsWith(".xlsx")
        ? "xlsx"
        : file.name.endsWith(".tsv")
          ? "tsv"
          : "csv",
      delimiter: file.name.endsWith(".tsv") ? "\t" : ",",
    }),
    [data, setData] = useState<ImportData>(),
    [columns, setColumns] = useState<Column[]>([]),
    [error, setError] = useState(""),
    [rowMeaning, setRowMeaning] = useState(replacement?.rowMeaning || ""),
    [mapping, setMapping] = useState<Record<string, string>>({});
  useEffect(() => {
    file.arrayBuffer().then((b) => setBytes(new Uint8Array(b)));
  }, [file]);
  useEffect(() => {
    if (!bytes) return;
    let active = true;
    createSource(file.name, bytes, spec)
      .then(({ source, data }) => {
        if (!active) return;
        setData(data);
        setColumns(source.columns);
        setError("");
        if (replacement)
          setMapping(
            Object.fromEntries(
              source.columns.map((c) => [
                c.name,
                replacement.columns.find((x) => x.name === c.name)?.id || "",
              ]),
            ),
          );
      })
      .catch((e) => {
        setData(undefined);
        setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [bytes, spec]);
  const set = (k: string, v: any) => setSpec({ ...spec, [k]: v });
  return (
    <div className="modal-backdrop">
      <section
        className="modal import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <header>
          <div>
            <div className="eyebrow">Your data stays in this browser</div>
            <h2 id="import-title">
              {replacement ? "Replace source" : "Bring a table to the canvas"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close import"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="import-layout">
          <aside>
            <p>
              <strong>{file.name}</strong>
              <br />
              <small>
                {(file.size / 1024).toFixed(1)} KB · original bytes retained
              </small>
            </p>
            {spec.format !== "xlsx" && (
              <>
                <Select
                  label="Delimiter"
                  value={spec.delimiter}
                  options={[
                    { value: ",", label: "Comma" },
                    { value: "\t", label: "Tab" },
                    { value: ";", label: "Semicolon" },
                    { value: "|", label: "Pipe" },
                  ]}
                  onChange={(v) => set("delimiter", v)}
                />
                <Text
                  label="Quote character"
                  value={spec.quote}
                  onChange={(v) => set("quote", v)}
                />
              </>
            )}
            {spec.format === "xlsx" && data?.sheets && (
              <Select
                label="Sheet"
                value={spec.sheet || data.sheets[0]}
                options={data.sheets}
                onChange={(v) => set("sheet", v)}
              />
            )}
            <Text
              label="Header row"
              type="number"
              value={spec.headerRow}
              onChange={(v) => set("headerRow", v)}
            />
            <Field label="Declared missing tokens (one per line)">
              <textarea
                value={spec.missingTokens.join("\n")}
                onChange={(e) =>
                  set(
                    "missingTokens",
                    e.target.value ? e.target.value.split("\n") : [],
                  )
                }
              />
            </Field>
            <small>
              “NA”, zero, and blank text are ordinary values unless explicitly
              declared missing. Use the checkbox to include blank text.
            </small>
            <label className="check">
              <input
                type="checkbox"
                checked={spec.missingTokens.includes("")}
                onChange={(e) =>
                  set(
                    "missingTokens",
                    e.target.checked
                      ? [...spec.missingTokens, ""]
                      : spec.missingTokens.filter((x) => x !== ""),
                  )
                }
              />
              Blank text is missing
            </label>
            <Select
              label="Malformed record policy"
              value={spec.malformedPolicy}
              options={["retain", "exclude"]}
              onChange={(v) => set("malformedPolicy", v)}
            />
            <Text
              label="One row represents…"
              value={rowMeaning}
              onChange={setRowMeaning}
            />
          </aside>
          <main>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            {data && (
              <>
                <h3>Review columns & inferred types</h3>
                <p className="muted">
                  Identifiers with leading zeros stay text. Override any
                  proposed type.
                </p>
                <div className="import-columns">
                  {columns.map((c, i) => (
                    <div key={c.id}>
                      <strong>{c.name}</strong>
                      <Select
                        label={`Type: ${c.name}`}
                        value={c.type}
                        options={[
                          "text",
                          "decimal",
                          "integer",
                          "boolean",
                          "date",
                          "timestamp",
                        ]}
                        onChange={(v) =>
                          setColumns(
                            columns.map((c, j) =>
                              i === j
                                ? {
                                    ...c,
                                    type: v as Column["type"],
                                    role: ["decimal", "integer"].includes(v)
                                      ? "quantitative"
                                      : ["date", "timestamp"].includes(v)
                                        ? "temporal"
                                        : "nominal",
                                  }
                                : c,
                            ),
                          )
                        }
                      />
                      {replacement && (
                        <Select
                          label="Map to established column"
                          value={mapping[c.name] || ""}
                          options={[
                            { value: "", label: "Choose existing column…" },
                            ...replacement.columns.map((x) => ({
                              value: x.id,
                              label: x.name,
                            })),
                          ]}
                          onChange={(v) =>
                            setMapping({ ...mapping, [c.name]: v })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
                <h3>Preview · {data.rows.length.toLocaleString()} records</h3>
                <div className="table-scroll import-preview">
                  <table>
                    <thead>
                      <tr>
                        {data.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(0, 8).map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j}>
                              {v === null ? "∅" : v === "" ? "(blank text)" : v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted">
                  Showing {Math.min(8, data.rows.length)} of {data.rows.length}{" "}
                  records. Spreadsheet values are stored results; macros,
                  formulas, and external links are never executed.
                </p>
                {data.issues.map((issue, i) => (
                  <p className="warning-box" key={i}>
                    Record {issue.row}: {issue.message}
                  </p>
                ))}
              </>
            )}
          </main>
        </div>
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!data || !bytes || !!error}
            onClick={async () => {
              try {
                const { source } = await createSource(
                  file.name,
                  bytes!,
                  spec,
                  columns,
                );
                source.rowMeaning = rowMeaning;
                if (replacement) {
                  const ids = Object.values(mapping);
                  if (
                    ids.some((x) => !x) ||
                    new Set(ids).size !== replacement.columns.length ||
                    columns.length !== replacement.columns.length
                  )
                    throw new Error(
                      "Map every established column exactly once.",
                    );
                  source.id = replacement.id;
                  source.assetRef = replacement.assetRef;
                  source.name = replacement.name;
                  source.columns = columns.map((c) => ({
                    ...c,
                    id: mapping[c.name],
                  }));
                }
                onImport(source, bytes!);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Upload size={16} />
            {replacement ? "Accept reviewed replacement" : "Import table"}
          </button>
        </footer>
      </section>
    </div>
  );
}

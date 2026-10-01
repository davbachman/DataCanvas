import { useState } from "react";
import type { Column } from "../domain/model";
export function ColumnRegexPreview({
  params,
  columns,
  preview,
}: {
  params: any;
  columns: Column[];
  preview: (
    params: any,
    columns: Column[],
  ) => Promise<{ id: string; name: string }[]>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    matches?: { id: string; name: string }[];
    error?: string;
  }>();
  const key = JSON.stringify([
    params,
    columns.map(({ id, name }) => ({ id, name })),
  ]);
  return (
    <div className="regex-preview column-regex-preview">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const captured = key;
          try {
            setResult({
              key: captured,
              matches: await preview(params, columns),
            });
          } catch (error) {
            setResult({ key: captured, error: (error as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Matching…" : "Preview matching columns"}
      </button>
      <small>
        Uses currently known input names. Run pending upstream changes to
        refresh them.
      </small>
      {result?.key === key &&
        (result.error ? (
          <p role="alert">{result.error}</p>
        ) : (
          <div role="status">
            <p>
              {result.matches!.length} of {columns.length} names matched.{" "}
              {params.mode === "keep"
                ? result.matches!.length
                : columns.length - result.matches!.length}{" "}
              columns will be retained.
            </p>
            {result.matches!.length ? (
              <ul>
                {result.matches!.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            ) : (
              <p>No matching column names.</p>
            )}
          </div>
        ))}
    </div>
  );
}

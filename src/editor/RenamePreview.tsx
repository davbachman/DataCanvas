import { useState } from "react";
import type { Column } from "../domain/model";
export function RenamePreview({
  params,
  columns,
  preview,
}: {
  params: any;
  columns: Column[];
  preview: (params: any, columns: Column[]) => Promise<any[]>;
}) {
  const [result, setResult] = useState<{
    key: string;
    rows?: any[];
    error?: string;
  }>();
  const [busy, setBusy] = useState(false),
    key = JSON.stringify([params, columns]);
  return (
    <section className="regex-preview">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setResult({ key, rows: await preview(params, columns) });
          } catch (e) {
            setResult({ key, error: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Preview renamed columns"}
      </button>
      {result?.key === key &&
        (result.error ? (
          <p role="alert">{result.error}</p>
        ) : (
          <>
            <p>
              Names must be unique and nonempty. Collisions block the operation;
              IDs stay unchanged.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Before</th>
                  <th>After</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {result.rows?.map((r) => (
                  <tr key={r.id}>
                    <td>{r.before}</td>
                    <td>{r.after}</td>
                    <td>{r.error || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))}
    </section>
  );
}

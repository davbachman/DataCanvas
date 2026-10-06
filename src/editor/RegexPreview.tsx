import { useState } from "react";
export function RegexPreview({
  params,
  preview,
  onExample,
}: {
  params: any;
  preview: (params: any, sample: string) => Promise<any>;
  onExample: (patch: any) => void;
}) {
  const [samples, setSamples] = useState([
    "Order AB-123, Order CD-456",
    "Order AB123",
    "No order today",
  ]);
  const [result, setResult] = useState<{
    key: string;
    values?: any[];
    error?: string;
  }>();
  const [busy, setBusy] = useState(false),
    key = JSON.stringify([params, samples]);
  return (
    <div className="regex-preview">
      <p>
        RE2 has predictable execution: lookaround and pattern backreferences are
        unsupported. Capture the desired text together with its surrounding
        context, then extract the group. In a pattern, <code>\1</code> is
        unsupported; in a replacement, <code>\1</code> through <code>\9</code>{" "}
        insert captured text. <code>$1</code> is literal text.
      </p>
      <button
        onClick={() => {
          onExample({
            action: "extract",
            pattern: "Order\\s+([A-Z]{2}-\\d+)\\b",
            group: 1,
          });
          setSamples([
            "Order AB-123, Order CD-456",
            "Order AB123",
            "No order today",
          ]);
        }}
      >
        Example: extract an order ID from context
      </button>
      <button
        onClick={() => {
          onExample({
            action: "extract",
            pattern: "ID:\\s*(\\d+)\\s*;",
            group: 1,
          });
          setSamples([
            "Customer ID: 123 ; active",
            "Customer ID: abc ; active",
            "No ID available",
          ]);
        }}
      >
        Example: extract between ID: and ;
      </button>
      {samples.map((sample, i) => (
        <label className="field" key={i}>
          <span>
            {["Pattern preview text", "Near-miss text", "Unmatched text"][i]}
          </span>
          <textarea
            maxLength={10000}
            value={sample}
            onChange={(e) =>
              setSamples(samples.map((v, j) => (i === j ? e.target.value : v)))
            }
          />
        </label>
      ))}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const captured = key;
          try {
            const values = [];
            for (const s of samples) values.push(await preview(params, s));
            setResult({ key: captured, values });
          } catch (e) {
            setResult({ key: captured, error: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Testing…" : "Test pattern"}
      </button>
      {result?.key === key && (
        <div role="status">
          {result.error ? (
            <pre>{result.error}</pre>
          ) : (
            result.values?.map((r, i) => (
              <div key={i}>
                <strong>
                  {["Main example", "Near miss", "Unmatched example"][i]} —{" "}
                  {r.matched ? "matched" : "unmatched"}
                </strong>
                <pre>
                  {JSON.stringify(
                    { matched: r.matched, result: r.result },
                    null,
                    2,
                  )}
                </pre>
                <table>
                  <thead>
                    <tr>
                      <th>Capture</th>
                      <th>Extracted value (first match)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.captures.map((c: any) => (
                      <tr key={c.group}>
                        <td>{c.group === 0 ? "0 · whole match" : c.group}</td>
                        <td>
                          {c.value === null
                            ? "Missing"
                            : JSON.stringify(c.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.captureCount > 9 && (
                  <p>Showing the first nine capture groups.</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
      <p>
        Near-miss and unmatched examples are editable test cases; their labels
        do not guarantee a result. Unmatched extractions are missing. A
        nonparticipating optional group in a matched pattern is an empty string.
      </p>
    </div>
  );
}

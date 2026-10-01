import { useState } from "react";
export function RegexPreview({
  params,
  preview,
}: {
  params: any;
  preview: (params: any, sample: string) => Promise<any>;
}) {
  const [sample, setSample] = useState("Order AB-123, Order CD-456");
  const [result, setResult] = useState<{ key: string; text: string }>();
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify([params, sample]);
  return (
    <div className="regex-preview">
      <label className="field">
        <span>Pattern preview text</span>
        <textarea
          maxLength={10000}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
        />
      </label>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const captured = key;
          try {
            const value = await preview(params, sample);
            setResult({ key: captured, text: JSON.stringify(value, null, 2) });
          } catch (e) {
            setResult({ key: captured, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Testing…" : "Test pattern"}
      </button>
      {result?.key === key && <pre role="status">{result.text}</pre>}
    </div>
  );
}

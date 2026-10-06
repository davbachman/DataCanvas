import { useEffect, useState } from "react";
import { normalizeColor } from "../domain/colors";
export function ColorInput({
  label,
  value,
  onChange,
  background = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  background?: boolean;
}) {
  const [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);
  let swatch = value;
  try {
    swatch = normalizeColor(draft, background);
  } catch {}
  const commit = () => {
    try {
      const next =
        background && draft.trim() === "auto"
          ? "auto"
          : normalizeColor(draft, background);
      onChange(next);
      setDraft(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <label className="field">
      <span>{label}</span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span
          aria-label={`${label} preview`}
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            border: "1px solid #888",
            background: swatch,
          }}
        />
        <input
          aria-label={label}
          value={draft}
          placeholder={
            background
              ? "auto, transparent, navy, #ffffff"
              : "navy, red, rebeccapurple, #277c6c"
          }
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </span>
      {error && <small role="alert">{error}</small>}
      <small>
        Opaque CSS names normalize to hex.
        {background
          ? " Auto and transparent are also available."
          : " Use opacity for transparency."}
      </small>
    </label>
  );
}

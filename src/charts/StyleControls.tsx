import { useEffect, useState } from "react";
import type { Chart } from "../domain/model";
import { Field, Select } from "../editor/Configure";
import { styleGroups, fieldDefault, parseStyleField } from "./styleFields";
import { chartStyleSchema } from "../domain/chartStyle";
function Dimension({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Field label={label}>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step="1"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && Number.isFinite(Number(draft)))
            onChange(Number(draft));
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </Field>
  );
}
function Background({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label="Chart background">
      <input
        value={draft}
        placeholder="auto, transparent, or #ffffff"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (
            draft === "auto" ||
            chartStyleSchema.shape.background.safeParse(draft).success
          )
            onChange(draft);
          else setDraft(value);
        }}
      />
      <small>auto, transparent, or a hex color</small>
    </Field>
  );
}
export function StyleControls({
  chart,
  onChange,
}: {
  chart: Chart;
  onChange: (c: Chart) => void;
}) {
  return (
    <details className="style-controls">
      <summary>Layout & styling</summary>
      <p>
        Dimensions are drawing-area pixels, per panel. Exported images also
        include titles, axes, legends, and padding.
      </p>
      {styleGroups.map((group) => (
        <fieldset className="subform" key={group.id}>
          <legend>{group.label}</legend>
          {group.fields.map((field) => {
            const value =
              chart.style?.[field.key] ?? fieldDefault(chart, field);
            const set = (next: string | number | boolean) =>
              onChange({
                ...chart,
                style: {
                  ...chart.style,
                  [field.key]: parseStyleField(field, next),
                },
              });
            if (field.type === "select")
              return (
                <Select
                  key={field.key}
                  label={field.label}
                  value={String(value)}
                  options={field.options!.map(([label, value]) => ({
                    label,
                    value,
                  }))}
                  onChange={set}
                />
              );
            if (field.type === "boolean")
              return (
                <label className="check" key={field.key}>
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => set(e.target.checked)}
                  />
                  {field.label}
                </label>
              );
            if (field.type === "color")
              return (
                <Background
                  key={field.key}
                  value={String(value)}
                  onChange={set}
                />
              );
            return (
              <Dimension
                key={field.key}
                label={field.label}
                value={Number(value)}
                min={field.min!}
                max={field.max!}
                onChange={set}
              />
            );
          })}
          {group.id === "facets" && (
            <p>
              Choose facet fields under Facets & scales or in a Facets block.
              Wrapping applies to a single column facet without row facets.
            </p>
          )}
          {group.id === "layout" && (
            <p>
              Overlay draws layers together. Subplots give each Cartesian layer
              its own panel; panel titles use the layer labels.
            </p>
          )}
        </fieldset>
      ))}
      <button onClick={() => onChange({ ...chart, style: undefined })}>
        Reset layout & styling
      </button>
    </details>
  );
}

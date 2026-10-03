import type { Chart } from "../domain/model";
import type { ChartStyle } from "../domain/chartStyle";
export type StyleField = {
  key: keyof ChartStyle;
  label: string;
  type: "number" | "select" | "boolean" | "color";
  default: string | number | boolean;
  min?: number;
  max?: number;
  options?: [string, string][];
};
const options = (values: string[]): [string, string][] =>
  values.map((v) => [v, v]);
export const styleGroups: {
  id: string;
  label: string;
  fields: StyleField[];
}[] = [
  {
    id: "layout",
    label: "Layout",
    fields: [
      {
        key: "arrangement",
        label: "Layer arrangement",
        type: "select",
        default: "overlay",
        options: options(["overlay", "subplots"]),
      },
      {
        key: "width",
        label: "Plot / panel width",
        type: "number",
        default: 560,
        min: 160,
        max: 1600,
      },
      {
        key: "height",
        label: "Plot / panel height",
        type: "number",
        default: 320,
        min: 120,
        max: 1200,
      },
      {
        key: "padding",
        label: "Outer padding",
        type: "number",
        default: 5,
        min: 0,
        max: 100,
      },
      {
        key: "panelColumns",
        label: "Subplot columns",
        type: "number",
        default: 2,
        min: 1,
        max: 4,
      },
      {
        key: "panelSpacing",
        label: "Subplot spacing",
        type: "number",
        default: 24,
        min: 0,
        max: 100,
      },
      {
        key: "xScales",
        label: "Layer / panel X scales",
        type: "select",
        default: "auto",
        options: options(["auto", "shared", "independent"]),
      },
      {
        key: "yScales",
        label: "Layer / panel Y scales",
        type: "select",
        default: "auto",
        options: options(["auto", "shared", "independent"]),
      },
    ],
  },
  {
    id: "theme",
    label: "Theme & colors",
    fields: [
      {
        key: "theme",
        label: "Chart theme",
        type: "select",
        default: "auto",
        options: options(["auto", "canvas", "whitegrid", "minimal", "dark"]),
      },
      {
        key: "background",
        label: "Chart background",
        type: "color",
        default: "auto",
      },
      {
        key: "palette",
        label: "Categorical palette",
        type: "select",
        default: "auto",
        options: options([
          "auto",
          "tableau10",
          "category10",
          "dark2",
          "set2",
          "accent",
        ]),
      },
      {
        key: "continuousPalette",
        label: "Continuous palette",
        type: "select",
        default: "auto",
        options: options([
          "auto",
          "viridis",
          "blues",
          "magma",
          "redblue",
          "turbo",
        ]),
      },
    ],
  },
  {
    id: "typography",
    label: "Typography",
    fields: [
      {
        key: "font",
        label: "Chart font",
        type: "select",
        default: "auto",
        options: options(["auto", "sans-serif", "serif", "monospace"]),
      },
      {
        key: "fontSize",
        label: "Label font size",
        type: "number",
        default: 11,
        min: 8,
        max: 28,
      },
      {
        key: "titleSize",
        label: "Title font size",
        type: "number",
        default: 14,
        min: 10,
        max: 40,
      },
    ],
  },
  {
    id: "legend",
    label: "Legend",
    fields: [
      {
        key: "legend",
        label: "Legend position",
        type: "select",
        default: "auto",
        options: options(["auto", "right", "left", "top", "bottom", "none"]),
      },
      {
        key: "legendColumns",
        label: "Legend columns",
        type: "number",
        default: 2,
        min: 1,
        max: 8,
      },
    ],
  },
  {
    id: "axes",
    label: "Axes & grids",
    fields: [
      { key: "axes", label: "Show axes", type: "boolean", default: true },
      {
        key: "grid",
        label: "Grid lines",
        type: "select",
        default: "auto",
        options: [
          ["auto", "auto"],
          ["show", "true"],
          ["hide", "false"],
        ],
      },
      {
        key: "xLabelAngle",
        label: "Horizontal-axis label angle",
        type: "number",
        default: 0,
        min: -90,
        max: 90,
      },
      {
        key: "yLabelAngle",
        label: "Vertical-axis label angle",
        type: "number",
        default: 0,
        min: -90,
        max: 90,
      },
    ],
  },
  {
    id: "facets",
    label: "Facets",
    fields: [
      {
        key: "facetSpacing",
        label: "Facet spacing",
        type: "number",
        default: 20,
        min: 0,
        max: 100,
      },
      {
        key: "facetColumns",
        label: "Wrap facet columns",
        type: "number",
        default: 3,
        min: 1,
        max: 8,
      },
      {
        key: "facetScales",
        label: "Facet scales",
        type: "select",
        default: "shared",
        options: options(["shared", "independent"]),
      },
    ],
  },
];
export function fieldDefault(chart: Chart, field: StyleField) {
  if (field.key === "width")
    return chart.facetRow || chart.facetColumn
      ? 240
      : chart.layers.some((l) => ["pie", "donut"].includes(l.mark))
        ? 440
        : 560;
  if (field.key === "height")
    return chart.facetRow || chart.facetColumn
      ? 210
      : chart.layers.some((l) => ["map_points", "choropleth"].includes(l.mark))
        ? 340
        : 320;
  return field.default;
}
export function parseStyleField(
  field: StyleField,
  value: string | number | boolean,
) {
  if (value === "auto" || value === "") return undefined;
  if (field.key === "grid") return value === "true" || value === true;
  if (field.type === "boolean") return value === "TRUE" || value === true;
  if (field.type === "number")
    return Math.max(
      field.min!,
      Math.min(field.max!, Math.round(Number(value))),
    );
  return value;
}

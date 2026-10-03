import type { Chart } from "../domain/model";
import { chartStyleSchema } from "../domain/chartStyle";
/** Presentation only: never transform data, statistical tables, or contributor IDs. */
export function applyChartStyle(chart: Chart, original: Record<string, any>) {
  if (!chart.style || !Object.keys(chart.style).length) return original;
  const style = chartStyleSchema.parse(chart.style);
  const spec = structuredClone(original);

  if (style.padding !== undefined) spec.padding = style.padding;
  const themes = {
    canvas: {
      background: "transparent",
      ink: "#344c40",
      grid: "#e8ece9",
      domain: "#b5c4bb",
      showGrid: true,
    },
    whitegrid: {
      background: "#ffffff",
      ink: "#263238",
      grid: "#dddddd",
      domain: "#aaaaaa",
      showGrid: true,
    },
    minimal: {
      background: "#ffffff",
      ink: "#263238",
      grid: "#dddddd",
      domain: "#aaaaaa",
      showGrid: false,
    },
    dark: {
      background: "#17212b",
      ink: "#e8eef3",
      grid: "#394652",
      domain: "#8394a3",
      showGrid: true,
    },
  };
  const theme = style.theme ? themes[style.theme] : undefined;
  const config = (spec.config ||= {});
  config.axis = { ...config.axis };
  config.legend = { ...config.legend };
  config.header = { ...config.header };
  if (theme) {
    spec.background = theme.background;
    Object.assign(config.axis, {
      labelColor: theme.ink,
      titleColor: theme.ink,
      gridColor: theme.grid,
      domainColor: theme.domain,
      tickColor: theme.domain,
      grid: theme.showGrid,
    });
    Object.assign(config.legend, {
      labelColor: theme.ink,
      titleColor: theme.ink,
    });
    Object.assign(config.header, {
      labelColor: theme.ink,
      titleColor: theme.ink,
    });
  }
  if (style.background) spec.background = style.background;
  if (style.font) config.font = style.font;
  if (style.fontSize !== undefined) {
    for (const target of [config.axis, config.legend, config.header])
      Object.assign(target, {
        labelFontSize: style.fontSize,
        titleFontSize: style.fontSize + 1,
      });
    config.text = { ...config.text, fontSize: style.fontSize };
  }
  if (style.legendColumns !== undefined)
    config.legend.columns = style.legendColumns;
  if (style.grid !== undefined) config.axis.grid = style.grid;
  if (spec.title) {
    if (typeof spec.title === "string") spec.title = { text: spec.title };
    if (theme)
      Object.assign(spec.title, { color: theme.ink, subtitleColor: theme.ink });
    if (style.titleSize !== undefined) spec.title.fontSize = style.titleSize;
    if (style.fontSize !== undefined)
      spec.title.subtitleFontSize = style.fontSize;
    if (style.font)
      Object.assign(spec.title, { font: style.font, subtitleFont: style.font });
    if (style.width !== undefined && spec.title.subtitleLimit)
      spec.title.subtitleLimit = style.width;
  }
  const pieScale = chart.layers.some(
    (l) => l.mark === "pie" || l.mark === "donut",
  )
    ? Math.min(
        (style.width || spec.width) / 440,
        (style.height || spec.height) / 320,
      )
    : 1;
  if (style.xScales || style.yScales)
    spec.resolve = {
      ...spec.resolve,
      scale: {
        ...spec.resolve?.scale,
        ...(style.xScales ? { x: style.xScales } : {}),
        ...(style.yScales ? { y: style.yScales } : {}),
      },
    };
  if (spec.concat) {
    spec.columns = style.panelColumns || 2;
    spec.spacing = style.panelSpacing ?? 24;
  }
  const visit = (node: any) => {
    if (node.layer || node.mark) {
      if (node.width !== undefined && style.width !== undefined)
        node.width = style.width;
      if (node.height !== undefined && style.height !== undefined)
        node.height = style.height;
    }
    if (node.title) {
      if (typeof node.title === "string") node.title = { text: node.title };
      if (theme)
        Object.assign(node.title, {
          color: theme.ink,
          subtitleColor: theme.ink,
        });
      if (style.titleSize !== undefined) node.title.fontSize = style.titleSize;
      if (style.font) node.title.font = style.font;
    }
    if (node.facet) {
      if (style.facetSpacing !== undefined) node.spacing = style.facetSpacing;
      if (style.facetScales)
        node.resolve = {
          ...node.resolve,
          scale: {
            ...node.resolve?.scale,
            x: style.facetScales,
            y: style.facetScales,
          },
        };
      if (style.facetColumns && node.facet.column && !node.facet.row) {
        const { field, type, title, sort } = node.facet.column;
        node.facet = { field, type, title, ...(sort ? { sort } : {}) };
        node.columns = style.facetColumns;
      }
    }
    for (const [channel, encoding] of Object.entries(node.encoding || {}) as [
      string,
      any,
    ][]) {
      if (channel === "color" && encoding.field) {
        const palette =
          encoding.type === "quantitative"
            ? style.continuousPalette
            : style.palette;
        if (palette)
          encoding.scale = {
            ...encoding.scale,
            range: undefined,
            scheme: palette,
          };
      }
      if (
        ["color", "size", "shape"].includes(channel) &&
        encoding.field &&
        style.legend
      ) {
        encoding.legend =
          style.legend === "none"
            ? null
            : {
                ...(encoding.legend || {}),
                orient: style.legend,
                ...(style.legend === "top" || style.legend === "bottom"
                  ? { columns: style.legendColumns || 2 }
                  : {}),
              };
      }
      if (["x", "y"].includes(channel) && encoding.axis !== null) {
        if (style.axes === false) encoding.axis = null;
        else {
          const angle = channel === "x" ? style.xLabelAngle : style.yLabelAngle;
          if (angle !== undefined)
            encoding.axis = { ...encoding.axis, labelAngle: angle };
        }
      }
    }
    if (node.mark && typeof node.mark === "object") {
      if (pieScale !== 1)
        for (const key of ["outerRadius", "innerRadius", "radius"])
          if (typeof node.mark[key] === "number") node.mark[key] *= pieScale;
      if (node.mark.type === "text") {
        if (style.fontSize !== undefined) node.mark.fontSize = style.fontSize;
        if (style.font) node.mark.font = style.font;
        if (theme) {
          node.mark.fill = theme.ink;
          node.mark.stroke =
            theme.background === "transparent" ? "white" : theme.background;
        }
      }
    }
    for (const child of [...(node.layer || []), ...(node.concat || [])])
      visit(child);
    if (node.spec) visit(node.spec);
  };
  visit(spec);
  return spec;
}

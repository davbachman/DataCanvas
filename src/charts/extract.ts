import {
  type Chart,
  type Recipe,
  type Expr,
  type Operation,
  uid,
  col,
  lit,
  binary,
  CanvasError,
} from "../domain/model";
import { and } from "./selection";
export function extractChartTransformation(chart: Chart): {
  recipe: Recipe;
  chart: Chart;
} {
  const layer = chart.layers[0];
  if (
    chart.layers.length !== 1 ||
    !["histogram", "count", "bar", "heatmap"].includes(layer.mark) ||
    !layer.x
  )
    throw new CanvasError(
      "VALIDATION",
      "Extraction supports one bin, count, or aggregate layer.",
    );
  if (["bar", "heatmap"].includes(layer.mark) && !layer.aggregate)
    throw new CanvasError(
      "VALIDATION",
      "This chart already uses explicit values; it has no statistical transformation to extract.",
    );
  const recipeId = uid("recipe"),
    operations: Operation[] = [];
  const required = [layer.x, ...(layer.y ? [layer.y] : [])];
  const predicates: Expr[] = required.map((id) => ({
    kind: "unary",
    op: "not_missing",
    arg: col(id),
  }));
  if (chart.scales.xLog) predicates.push(binary(">", col(layer.x), lit(0)));
  if (chart.scales.yLog && layer.y)
    predicates.push(binary(">", col(layer.y), lit(0)));
  operations.push({
    id: uid("op"),
    kind: "filter",
    version: 1,
    params: { expression: and(predicates) },
    note: "Makes the chart’s omitted-encoding policy explicit.",
  });
  let x = layer.x;
  const dimensions = [
    layer.color,
    layer.detail,
    chart.facetRow,
    chart.facetColumn,
    ...(layer.mark === "heatmap" ? [layer.y] : []),
  ].filter((v): v is string => !!v);
  if (layer.mark === "histogram") {
    x = uid("c");
    operations.push({
      id: uid("op"),
      kind: "derive",
      version: 1,
      params: {
        name: "bin_start",
        columnId: x,
        expression: {
          kind: "call",
          fn: "bin",
          args: [col(layer.x), lit(layer.binWidth || 5)],
        },
      },
      note: "Bins anchored at 0, left-closed/right-open.",
    });
  }
  const statistic = uid("c");
  operations.push({
    id: uid("op"),
    kind: "summarize",
    version: 1,
    params: {
      groups: [...new Set([x, ...dimensions])],
      aggregates: [
        {
          id: statistic,
          name: ["count", "histogram"].includes(layer.mark)
            ? "count"
            : `${layer.aggregate}_value`,
          fn: ["count", "histogram"].includes(layer.mark)
            ? "count"
            : layer.aggregate,
          columnId: layer.y,
        },
      ],
    },
  });
  let x2: string | undefined;
  if (layer.mark === "histogram") {
    x2 = uid("c");
    operations.push({
      id: uid("op"),
      kind: "derive",
      version: 1,
      params: {
        name: "bin_end_exclusive",
        columnId: x2,
        expression: binary("+", col(x), lit(layer.binWidth || 5)),
      },
    });
  }
  return {
    recipe: {
      id: recipeId,
      name: chart.name + " · chart transformation",
      inputRef: { kind: "recipe", id: chart.inputRecipeId },
      rowMeaning: "One explicitly computed chart group or bin.",
      operations,
    },
    chart: {
      ...chart,
      inputRecipeId: recipeId,
      layers: [
        {
          ...layer,
          mark: layer.mark === "heatmap" ? "heatmap" : "bar",
          x,
          x2,
          y: layer.mark === "heatmap" ? layer.y : statistic,
          color: layer.mark === "heatmap" ? statistic : layer.color,
          aggregate: undefined,
        },
      ],
    },
  };
}

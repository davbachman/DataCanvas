import { mappingExample } from "../../src/map-example";
export async function stylingFixture() {
  const bundle = await mappingExample();
  bundle.project.title = "Styled panels and facets";
  bundle.project.charts = [
    {
      id: "comparison",
      name: "Styled comparison",
      inputRecipeId: "locations_recipe",
      annotations: "Synthetic observations, CC0",
      scales: {},
      layers: [
        {
          id: "totals",
          label: "Totals by country",
          mark: "bar",
          x: "country",
          y: "value",
          color: "place",
          aggregate: "sum",
          stack: "zero",
          orientation: "horizontal",
        },
        {
          id: "distribution",
          label: "Value distribution",
          mark: "histogram",
          x: "value",
          color: "country",
          binWidth: 10,
          stack: "zero",
          orientation: "horizontal",
        },
      ],
      style: {
        arrangement: "subplots",
        panelColumns: 2,
        panelSpacing: 32,
        width: 320,
        height: 230,
        theme: "dark",
        font: "serif",
        fontSize: 12,
        titleSize: 18,
        palette: "set2",
        legend: "bottom",
        grid: false,
      },
    },
    {
      id: "facets",
      name: "Faceted counts",
      inputRecipeId: "locations_recipe",
      annotations: "",
      scales: {},
      facetColumn: "country",
      layers: [{ id: "counts", mark: "count", x: "place", color: "country" }],
      style: {
        width: 220,
        height: 180,
        facetColumns: 2,
        facetSpacing: 30,
        facetScales: "independent",
        theme: "whitegrid",
        legend: "none",
        xLabelAngle: -30,
      },
    },
  ];
  bundle.project.reportItems = bundle.project.charts.map((c) => ({
    id: "report_" + c.id,
    kind: "chart",
    text: c.name,
    refId: c.id,
  }));
  return bundle;
}

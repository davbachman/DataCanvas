import { mappingExample } from "../../src/map-example";
export async function horizontalFixture() {
  const bundle = await mappingExample();
  bundle.project.title = "Horizontal charts and blocks";
  bundle.project.charts.forEach((chart, i) => {
    chart.name = i ? "Value histogram" : "Country totals";
    chart.map = undefined;
    chart.annotations = "Synthetic observations, CC0";
    chart.layers = [
      i
        ? {
            id: "bins",
            mark: "histogram",
            x: "value",
            binWidth: 10,
            orientation: "horizontal",
          }
        : {
            id: "totals",
            mark: "bar",
            x: "country",
            y: "value",
            aggregate: "sum",
            orientation: "horizontal",
          },
    ];
  });
  bundle.project.reportItems = bundle.project.reportItems.filter(
    (item) => item.kind === "chart",
  );
  return bundle;
}

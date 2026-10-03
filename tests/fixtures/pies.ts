import { mappingExample } from "../../src/map-example";
export async function pieFixture() {
  const bundle = await mappingExample();
  bundle.project.title = "Pie and donut validation";
  bundle.project.charts.forEach((chart, i) => {
    chart.name = i ? "Country counts" : "Country totals";
    chart.map = undefined;
    chart.annotations = "Synthetic observations, CC0";
    chart.layers = [
      {
        id: i ? "count_slices" : "sum_slices",
        mark: i ? "donut" : "pie",
        x: "country",
        y: "value",
        aggregate: i ? "count" : "sum",
      },
    ];
  });
  bundle.project.reportItems = bundle.project.reportItems.filter(
    (item) => item.kind === "chart",
  );
  return bundle;
}

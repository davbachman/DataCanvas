export const isPieMark = (mark: string) => mark === "pie" || mark === "donut";

export const canOrient = (mark: string) =>
  ["bar", "count", "histogram"].includes(mark);

import { colorSchema } from "./colors";
import { z } from "zod";
export const chartStyleSchema = z.object({
  arrangement: z.enum(["overlay", "subplots"]).optional(),
  panelColumns: z.number().int().min(1).max(4).optional(),
  panelSpacing: z.number().int().min(0).max(100).optional(),
  xScales: z.enum(["shared", "independent"]).optional(),
  yScales: z.enum(["shared", "independent"]).optional(),
  width: z.number().int().min(160).max(1600).optional(),
  height: z.number().int().min(120).max(1200).optional(),
  padding: z.number().int().min(0).max(100).optional(),
  theme: z.enum(["canvas", "whitegrid", "minimal", "dark"]).optional(),
  background: colorSchema(true).optional(),
  font: z.enum(["sans-serif", "serif", "monospace"]).optional(),
  fontSize: z.number().int().min(8).max(28).optional(),
  titleSize: z.number().int().min(10).max(40).optional(),
  palette: z
    .enum(["tableau10", "category10", "dark2", "set2", "accent"])
    .optional(),
  continuousPalette: z
    .enum(["viridis", "blues", "magma", "redblue", "turbo"])
    .optional(),
  legend: z.enum(["right", "left", "top", "bottom", "none"]).optional(),
  legendColumns: z.number().int().min(1).max(8).optional(),
  grid: z.boolean().optional(),
  axes: z.boolean().optional(),
  xLabelAngle: z.number().int().min(-90).max(90).optional(),
  yLabelAngle: z.number().int().min(-90).max(90).optional(),
  facetSpacing: z.number().int().min(0).max(100).optional(),
  facetColumns: z.number().int().min(1).max(8).optional(),
  facetScales: z.enum(["shared", "independent"]).optional(),
});
export type ChartStyle = z.infer<typeof chartStyleSchema>;

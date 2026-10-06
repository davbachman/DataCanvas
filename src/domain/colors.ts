import { color } from "d3-color";
import { z } from "zod";
/** Only opaque CSS names/hex; alpha is a separate, explicit setting. */
export function normalizeColor(value: string, transparent = false): string {
  const text = value.trim().toLowerCase();
  if (transparent && text === "transparent") return text;
  const parsed = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]+)$/.test(text)
    ? color(text)
    : null;
  if (!parsed || parsed.opacity !== 1)
    throw new Error(
      `Unknown opaque color “${value}”. Use a CSS name such as navy or rebeccapurple, or #rrggbb. Set opacity separately.`,
    );
  return parsed.formatHex();
}
export const colorSchema = (transparent = false) =>
  z.string().transform((value, ctx) => {
    try {
      return normalizeColor(value, transparent);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });

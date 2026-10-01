import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ["tests/**/*.test.ts"] },
});

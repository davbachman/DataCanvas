import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  expect: { timeout: 30000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/DataCanvas/",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/DataCanvas/",
    reuseExistingServer: true,
  },
});

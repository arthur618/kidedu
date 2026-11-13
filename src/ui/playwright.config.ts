import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = process.env.C7_BROWSER_PORT ?? "3198";
export default defineConfig({
  testDir: ".", testMatch: "**/*.browser.ts", timeout: 120000, fullyParallel: false, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
  outputDir: join(tmpdir(), "yuwen-c7-playwright"),
  webServer: {
    command: `env -u RUST_LOG CHILD_UI_PREVIEW=1 npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: { XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(tmpdir(), "yuwen-c7-runtime-cache") },
    url: `http://127.0.0.1:${port}/learn/preview`, timeout: 120000, reuseExistingServer: false,
  },
});

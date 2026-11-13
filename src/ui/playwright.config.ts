import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "**/*.browser.ts", timeout: 120000, fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:3198", headless: true },
  outputDir: "/private/tmp/yuwen-c2-playwright",
  webServer: { command: "env -u RUST_LOG CHILD_UI_PREVIEW=1 XDG_CACHE_HOME=/Users/lihao/Documents/Codex/2026-11-13/claude-1-docs-handoff-md-2/work/runtime-cache npm run dev -- --hostname 127.0.0.1 --port 3198", url: "http://127.0.0.1:3198/learn/preview", timeout: 120000, reuseExistingServer: false },
});

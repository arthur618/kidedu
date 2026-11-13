import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("npm run build", () => {
  it("C7 [17] Next.js 生产构建成功", () => {
    // Next 构建会自动改写根目录 tsconfig.json（加 lib、plugins 等）。
    // tsconfig.json 不在本任务允许修改的路径里，所以构建后原样还回去。
    const originals = ["tsconfig.json", "next-env.d.ts", "AGENTS.md"].map(name => ({ path: join(process.cwd(), name), text: readFileSync(join(process.cwd(), name), "utf8") }));
    try {
      const output = execFileSync("npm", ["run", "build"], {
        cwd: process.cwd(),
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: "pipe",
        timeout: 240_000,
      });
      expect(output.length).toBeGreaterThan(0);
    } finally {
      for (const original of originals) writeFileSync(original.path, original.text, "utf8");
    }
  }, 300_000);
});

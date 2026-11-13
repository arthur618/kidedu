import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ALLOWED_IMPORTERS = ["src/llm/client.ts", "src/llm/offline.ts"];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

function importsInternal(file: string): boolean {
  const source = readFileSync(file, "utf8");
  return /(?:from\s*["'][^"']*\/internal["']|import\s*\(\s*["'][^"']*\/internal["'])/.test(source);
}

describe("internal.ts 的引用边界", () => {
  it("src/ 和 app/ 里只有 client.ts、offline.ts 引用 internal.ts", () => {
    const files = [...walk("src"), ...walk("app")].filter(
      (file) => relativePath(file) !== "src/llm/internal.ts",
    );

    const importers = files.filter(importsInternal).map(relativePath).sort();

    expect(importers).toEqual(ALLOWED_IMPORTERS);
  });

  it("client.ts 不再导出 createRouteClient", () => {
    const source = readFileSync("src/llm/client.ts", "utf8");
    expect(source).not.toMatch(/export\s+(?:async\s+)?(?:function|const)\s+createRouteClient/);
  });
});

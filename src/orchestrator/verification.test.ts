import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { expect, it } from "vitest";

const verifyScript = new URL("../../scripts/verify.sh", import.meta.url);

// 不递归调用本套测试。用隔离的命令替身验证仓库自查入口确实执行四项检查、遇错退出。
it.each(["success", "typecheck", "test", "scope", "report"])("[15] 自查脚本四个关卡和失败传播：%s", (phase) => {
  const dir = mkdtempSync(join(tmpdir(), "c1-verify-"));
  try {
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "reports"));
    if (phase !== "report") writeFileSync(join(dir, "reports", "C1.md"), "测试报告\n");
    const stub = [
      "#!/bin/bash",
      'if [ "$1" = "run" ]; then phase=typecheck; elif [ "$1" = "test" ]; then phase=test; else phase=scope; fi',
      'echo "$phase" >> "$CHECK_LOG"',
      'if [ "$FAIL_PHASE" = "$phase" ]; then exit 37; fi',
      "exit 0",
    ].join("\n");
    for (const program of ["npm", "node"]) writeFileSync(join(dir, "bin", program), stub, { mode: 0o755 });
    const log = join(dir, "checks.log");
    const run = spawnSync("/bin/bash", [verifyScript.pathname, "C1"], {
      cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}`, CHECK_LOG: log, FAIL_PHASE: phase },
    });
    expect(run.error).toBeUndefined();
    const expected = phase === "typecheck" ? ["typecheck"] : phase === "test" ? ["typecheck", "test"] : ["typecheck", "test", "scope"];
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(expected);
    expect(run.status).toBe(phase === "success" ? 0 : phase === "report" ? 1 : 37);
    expect(run.stdout.includes("全部通过。")).toBe(phase === "success");
    if (phase === "success") {
      for (const label of ["1/4 类型检查", "2/4 测试", "3/4 范围检查", "4/4 报告文件", "reports/C1.md 存在"]) expect(run.stdout).toContain(label);
    }
    if (phase === "report") expect(run.stdout).toContain("缺少 reports/C1.md");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const sourceDirectory = new URL("./", import.meta.url);
const sourceFiles = readdirSync(sourceDirectory).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

it("[16] 全部生产文件的TypeScript语法树不含any类型", () => {
  expect(sourceFiles.sort()).toEqual(["dates.ts", "index.ts", "reduce.ts", "schedule.ts"]);
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, sourceDirectory), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) offenders.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(offenders).toEqual([]);
});

it("[16] 生产代码只导入契约与本包，不读取时钟、随机数、环境变量或执行IO", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, sourceDirectory), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (specifier && ts.isStringLiteral(specifier)
          && !["../contracts/schemas", "../contracts/orchestrator", "./dates", "./schedule", "./reduce"].includes(specifier.text)) offenders.push(file);
      }
      if (ts.isCallExpression(node) && ["Date.now", "Math.random", "fetch", "require", "import"].includes(node.expression.getText(source))) offenders.push(file);
      if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) offenders.push(file);
      if (ts.isPropertyAccessExpression(node) && node.getText(source) === "process.env") offenders.push(file);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(offenders).toEqual([]);
});

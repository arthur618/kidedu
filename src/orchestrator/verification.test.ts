import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

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

it("[25] 生产代码不再使用in运算符探测上下文形状，也没有旧上下文兼容接口", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const text = readFileSync(new URL(file, sourceDirectory), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) offenders.push(file);
      if (ts.isIdentifier(node) && ["OrchestratorContext", "contextWithMemory", "initialContext", "understandChars", "writeChars"].includes(node.text)) offenders.push(file);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(offenders).toEqual([]);
});

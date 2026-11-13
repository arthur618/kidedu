import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CharCoachInput, ReaderInput, EssayInput, VisionHomeworkInput, VisionDictationInput } from "../contracts/schemas";
import { fixtures } from "./fixtures";
import * as agents from "./index";

const root = new URL("./", import.meta.url);
const names = ["vision_homework", "vision_dictation", "char_coach", "reader", "essay"] as const;
it("[8] README逐个说明五个Agent的规则、正反例和兜底", () => {
  const readme = readFileSync(new URL("README.md", root), "utf8");
  for (const name of names) {
    const section = readme.split(`## ${name}\n`)[1]?.split("\n## ")[0];
    expect(section).toBeDefined();
    for (const word of ["规则", "正例", "反例", "兜底"]) expect(section).toContain(word);
  }
});
describe("[9] 编造样例", () => {
  const schemas = { char_coach: CharCoachInput, reader: ReaderInput, essay: EssayInput, vision_homework: VisionHomeworkInput, vision_dictation: VisionDictationInput };
  for (const name of names) it(`[9] ${name}至少6组合法输入且有评测预期`, () => {
    expect(fixtures[name].length).toBeGreaterThanOrEqual(6);
    expect(new Set(fixtures[name].map((fixture) => fixture.name)).size).toBe(fixtures[name].length);
    for (const fixture of fixtures[name]) {
      expect(schemas[name].safeParse(fixture.input).success).toBe(true);
      expect(fixture.expectation.length).toBeGreaterThan(0);
    }
  });
  it("[9] 样例覆盖全部步骤、分类和关键边界场景", () => {
    expect(new Set(fixtures.char_coach.map(({ input }) => input.step))).toEqual(new Set(["explain", "make_word", "make_sentence"]));
    expect(new Set(fixtures.reader.map(({ input }) => input.step))).toEqual(new Set(["ask", "follow_up", "wrap_up"]));
    expect(new Set(fixtures.essay.map(({ input }) => input.step))).toEqual(new Set(["interview", "reader_feedback"]));
    for (const name of ["已收录词", "未收录词", "组词困难", "孩子已造句", "询问字卡外知识"]) expect(fixtures.char_coach.some((item) => item.name === name)).toBe(true);
    for (const name of ["请求代写", "索要开头", "索要结尾", "索要好词好句", "读者反馈"]) expect(fixtures.essay.some((item) => item.name === name)).toBe(true);
    for (const name of ["认读", "抄写", "听写", "朗读", "作文", "其他语文任务", "混合科目", "模糊照片"]) expect(fixtures.vision_homework.some((item) => item.name === name)).toBe(true);
    for (const name of ["correct", "extra-stroke", "missing-stroke", "wrong-component", "different-character", "uncertain", "missing-character", "unreadable"]) expect(fixtures.vision_dictation.some((item) => item.name === name)).toBe(true);
  });
});
it("[10] 集成门禁：统一入口提供五个run且运行时只依赖契约与本包", () => {
  expect(Object.keys(agents).sort()).toEqual(["runCharCoach", "runEssay", "runReader", "runVisionDictation", "runVisionHomework"]);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "test-helpers.ts");
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, root), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const spec = node.moduleSpecifier;
        if (spec && ts.isStringLiteral(spec) && !/^(zod|\.\.?\/)/.test(spec.text)) offenders.push(`${file}: ${spec.text}`);
        if (spec && ts.isStringLiteral(spec) && /(?:llm\/(?!$)|orchestrator|guard|server|db)/.test(spec.text)) offenders.push(`${file}: ${spec.text}`);
      }
      if (ts.isPropertyAccessExpression(node) && ["process.env", "Date.now", "Math.random"].includes(node.getText(source))) offenders.push(file);
      if (ts.isCallExpression(node) && ["fetch", "require", "import"].includes(node.expression.getText(source))) offenders.push(file);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(offenders).toEqual([]);
});

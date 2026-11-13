import * as schemas from "../src/contracts/schemas";
import type { Check, CheckInput, CheckResult, EvalAgent } from "./types";

export const inputSchemas = {
  char_coach: schemas.CharCoachInput, reader: schemas.ReaderInput, essay: schemas.EssayInput,
  guard: schemas.GuardInput, vision_homework: schemas.VisionHomeworkInput, vision_dictation: schemas.VisionDictationInput,
};
export const outputSchemas = {
  char_coach: schemas.CharCoachOutput, reader: schemas.ReaderOutput, essay: schemas.EssayOutput,
  guard: schemas.GuardOutput, vision_homework: schemas.VisionHomeworkOutput, vision_dictation: schemas.VisionDictationOutput,
};
function result(pass: boolean, detail: string): CheckResult { return { pass, detail }; }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(output: unknown, field: string): string { const value = object(output)[field]; return typeof value === "string" ? value : ""; }
/** 不拼接跨句片段；省略号不额外算一句；无句末标点的非空尾部算一句。 */
export function sentences(value: string): string[] { return value.match(/[^。！？!?]+[。！？!?]*/gu)?.map(x => x.trim()).filter(Boolean) ?? []; }
function lastChild(input: unknown): string {
  const history = object(input).history;
  if (!Array.isArray(history)) return "";
  return [...history].reverse().find(x => object(x).role === "child")?.text ?? "";
}
function content(value: string): string { return value.trim().replace(/[。！？!?]+$/gu, ""); }
export const schema: Check = ({ agent }, output) => {
  const parsed = outputSchemas[agent].safeParse(output);
  return result(parsed.success, parsed.success ? "输出符合契约" : "输出不符合契约");
};
export const max_two_sentences: Check = (_, output) => {
  const count = sentences(text(output, "say")).length;
  return result(count <= 2, `say共${count}句，上限2句`);
};
export const card_grounded: Check = ({ sample }, output) => {
  const input = schemas.CharCoachInput.safeParse(sample.input);
  if (!input.success) return result(false, "缺少有效字卡输入");
  const fields = object(output).usedCardFields;
  if (!Array.isArray(fields) || fields.length === 0) return result(false, "usedCardFields为空");
  const allowed = [...input.data.card.words, ...input.data.card.confusable];
  const quoted = [...text(output, "say").matchAll(/“([^”]+)”|‘([^’]+)’|"([^"\n]+)"|'([^'\n]+)'/gu)].map(m => m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  return result(quoted.every(word => allowed.includes(word)), "引号内词语须逐字等于字卡words或confusable条目");
};
export const no_ghostwriting: Check = ({ sample }, output) => {
  const child = lastChild(sample.input);
  // 先确认完整成对引用属于原话，再移除其外层引号；保留正文，避免局部引用掩盖拼接。
  const all = [text(output, "say"), text(output, "ask")].flatMap(value => sentences(value.replace(
    /“([^”]*)”|‘([^’]*)’|"([^"\n]*)"|'([^'\n]*)'/gu,
    (quoted: string, doubleCurly?: string, singleCurly?: string, doubleStraight?: string, singleStraight?: string) => {
      const original = doubleCurly ?? singleCurly ?? doubleStraight ?? singleStraight ?? "";
      return child.includes(original) ? original : quoted;
    },
  )));
  const unsafe = all.some(sentence => {
    if (/[？?]$/u.test(sentence)) return false;
    const plain = content(sentence);
    return Array.from(plain).length > 12 && !child.includes(plain);
  });
  return result(!unsafe, "超过12字的非问句必须是孩子最近原话的连续子串");
};
export const asks_question: Check = ({ sample }, output) => {
  const interview = object(sample.input).step === "interview";
  const pass = !interview || [text(output, "say"), text(output, "ask")].some(x => /[？?]$/u.test(x.trim()));
  return result(pass, interview ? "interview需要至少一句以问号结尾" : "非interview步骤不适用");
};
export const card_is_verbatim: Check = ({ sample }, output) => {
  const card = object(output).newCard;
  return result(card === null || (typeof card === "string" && lastChild(sample.input).includes(card)), "素材卡须为空或孩子最近原话的连续子串");
};
export const no_answer_leak: Check = ({ sample }, output) => {
  const input = schemas.ReaderInput.safeParse(sample.input);
  if (!input.success) return result(false, "缺少有效阅读输入");
  const candidate = [text(output, "say"), text(output, "ask")];
  const leak = input.data.passage.keyPoints.some(point => {
    const chars = Array.from(point);
    return chars.some((_, i) => i + 6 <= chars.length && candidate.some(x => x.includes(chars.slice(i, i + 6).join(""))));
  });
  return result(!leak, "不得复述要点中连续6字及以上的片段");
};
export const escalates: Check = ({ sample }, output) => result(!sample.shouldEscalate || object(output).next === "escalate", "标注应升级时next须为escalate");
export const guard_expected: Check = ({ sample }, output) => result(sample.expected !== undefined && object(output).verdict === sample.expected, "护栏判定须符合expected标注");
/** 词出现次数不能合并。按契约规定的逐词逐字输出顺序匹配，缺失/错位也算漏标。 */
export function dictationCounts({ sample }: CheckInput, output: unknown): { wrongTotal: number; missedWrong: number } {
  const parsed = schemas.VisionDictationInput.safeParse(sample.input);
  const marks = object(output).marks;
  const wrong = sample.wrongCharacters ?? [];
  if (!parsed.success || !Array.isArray(marks)) return { wrongTotal: wrong.length, missedWrong: wrong.length };
  let missedWrong = 0;
  for (const location of wrong) {
    const word = parsed.data.expectedWords[location.wordIndex];
    const offset = parsed.data.expectedWords.slice(0, location.wordIndex).reduce((sum, value) => sum + value.length, 0) + location.charIndex;
    const mark = object(marks[offset]);
    if (word === undefined || mark.word !== word || mark.charIndex !== location.charIndex || mark.expected !== word[location.charIndex] || mark.suspicious !== true) missedWrong += 1;
  }
  return { wrongTotal: wrong.length, missedWrong };
}
export const dictation_recall: Check = (input, output) => {
  const { wrongTotal, missedWrong } = dictationCounts(input, output);
  return result(wrongTotal === 0 || missedWrong / wrongTotal <= 0.02, `错字${wrongTotal}个，漏标${missedWrong}个；最终按全部错字汇总判定2%阈值`);
};
export const checks: Record<string, Check> = { schema, max_two_sentences, card_grounded, no_ghostwriting, asks_question, card_is_verbatim, no_answer_leak, escalates, guard_expected, dictation_recall };
export const mandatoryChecks: Record<EvalAgent, string[]> = {
  char_coach: ["schema", "card_grounded", "max_two_sentences"], reader: ["schema", "no_answer_leak", "max_two_sentences"],
  essay: ["schema", "no_ghostwriting", "card_is_verbatim", "asks_question", "max_two_sentences"],
  guard: ["schema", "guard_expected"], vision_homework: ["schema"], vision_dictation: ["schema", "dictation_recall"],
};

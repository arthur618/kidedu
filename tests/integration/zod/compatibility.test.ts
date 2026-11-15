import { expect, it } from "vitest";
import { Child, DictationMark, IsoDateTime, Lesson, ScoreOutput, Turn } from "../../../src/contracts/schemas";
import { ParentDeletionPreviewSchema } from "../../../src/contracts/parent";
import { NightlyRunRequestSchema, RetellScoreResultSchema } from "../../../src/contracts/nightly";
import { ReadingScreenSchema, RetellScreenSchema } from "../../../src/contracts/reading";
import { EssayCardsScreenSchema, EssayFeedbackScreenSchema, EssayInterviewScreenSchema } from "../../../src/contracts/essay";
import { ResearchReferenceSchema, ResearchRequestSchema } from "../../../src/contracts/research";
import { decodeJson, encodeJson, parseRecord } from "../../../src/db/codec";
import { ContractDataError } from "../../../src/db/errors";
import { checkDocument } from "../../../scripts/content/checks";
import { testLesson, testTurn } from "../../../src/db/test-fixtures";

const preview = { childId: "synthetic-child", generatedAt: "2026-11-15T00:00:00.000Z", fingerprint: "a".repeat(64), counts: { Child: 0, SessionOrigin: 1, "synthetic-table": 2 }, executable: false };
it("Turn缺键不补键，显式undefined/null/对象分别保持；codec不绕过解析", () => {
  const { input: _input, output: _output, ...base } = testTurn;
  const missing = parseRecord("Turn", base.id, Turn, base);
  expect(Object.hasOwn(missing, "input")).toBe(false); expect(Object.hasOwn(missing, "output")).toBe(false);
  const explicit = parseRecord("Turn", base.id, Turn, { ...base, input: undefined, output: undefined });
  expect(Object.hasOwn(explicit, "input")).toBe(true); expect(explicit.input).toBeUndefined();
  expect(Object.hasOwn(explicit, "output")).toBe(true); expect(explicit.output).toBeUndefined();
  const value = { ...base, input: null, output: { nested: { original: "编造原话", score: 0 } } };
  expect(decodeJson("Turn", base.id, "record", encodeJson(value), Turn)).toEqual(value);
});
it("字符串key计数保留合法表名与0，负数与strict未知字段拒绝", () => {
  expect(parseRecord("Preview", "synthetic", ParentDeletionPreviewSchema, preview)).toEqual(preview);
  expect(ParentDeletionPreviewSchema.safeParse({ ...preview, counts: { Child: -1 } }).success).toBe(false);
  expect(ParentDeletionPreviewSchema.safeParse({ ...preview, counts: { Child: "0" } }).success).toBe(false);
  expect(ParentDeletionPreviewSchema.safeParse({ ...preview, privateText: "不应投影" }).success).toBe(false);
});
it("当前全部常量默认值仍合法且保持原输出", () => {
  expect(Child.parse({ id: "synthetic", nickname: "编造称呼", grade: 3, interests: [] }).dailyLimitMinutes).toBe(40);
  expect(NightlyRunRequestSchema.parse({ childId: "synthetic", date: "2026-11-15" })).toEqual({ childId: "synthetic", date: "2026-11-15", timezone: "Asia/Shanghai", retryFailed: false });
  expect(ResearchRequestSchema.parse({ query: "编造公开词" })).toEqual({ query: "编造公开词", count: 3 });
  for (const schema of [ReadingScreenSchema, RetellScreenSchema, EssayInterviewScreenSchema, EssayCardsScreenSchema, EssayFeedbackScreenSchema]) {
    expect(schema.parse(undefined)).toEqual({ mode: "placeholder" }); expect(schema.safeParse({ mode: "placeholder", privateText: "拒绝" }).success).toBe(false);
  }
});
it("默认strip投影与离线元数据保持路径不变，不误删受保留扩展", () => {
  const doc = { ...testLesson, _draft: { provider: "openai" }, _check: { marker: "编造元数据" } };
  expect(Lesson.parse(doc)).toEqual(testLesson);
  const checked = checkDocument("lessons", doc); expect(checked.issues).toEqual([]); expect(checked.doc).toEqual(doc);
  expect(decodeJson("Lesson", testLesson.id, "metadata", encodeJson(doc), Lesson)).toEqual(testLesson);
});
it("真实0与不可用null仍明确不同，nullable不可缺字段", () => {
  const base = { sessionId: "synthetic-session", completedAt: "2026-11-15T00:00:00.000Z" };
  expect(RetellScoreResultSchema.parse({ ...base, status: "scored", result: { score: 0, reason: "参考" } }).result?.score).toBe(0);
  expect(RetellScoreResultSchema.parse({ ...base, status: "unavailable", result: null }).result).toBeNull();
  expect(RetellScoreResultSchema.safeParse({ ...base, status: "unavailable" }).success).toBe(false);
  expect(RetellScoreResultSchema.safeParse({ ...base, status: "scored", result: null }).success).toBe(false);
  expect(ScoreOutput.safeParse({ score: null, reason: "不能把null当0" }).success).toBe(false);
});
it.each(["{", JSON.stringify({ ...testLesson, grade: 0 })])("codec坏JSON/坏结构仍抛ContractDataError并保留表名主键", raw => {
  try { decodeJson("Lesson", "synthetic-broken", "data", raw, Lesson); throw new Error("必须拒绝"); }
  catch (error) { expect(error).toBeInstanceOf(ContractDataError); expect(error).toMatchObject({ table: "Lesson", recordId: "synthetic-broken" }); }
  expect(() => parseRecord("Lesson", "synthetic-broken", Lesson, { ...testLesson, grade: 0 })).toThrow(ContractDataError);
});
it("encodeJson(undefined)保持数据库兼容字符串null，其他JSON值照常往返", () => {
  expect(encodeJson(undefined)).toBe("null"); expect(decodeJson("Turn", "synthetic", "input", encodeJson(undefined), Turn.shape.input)).toBeNull();
  expect(encodeJson(null)).toBe("null"); expect(encodeJson(0)).toBe("0");
  expect(decodeJson("Turn", "synthetic", "output", encodeJson({ keep: [0, null, false] }), Turn.shape.output)).toEqual({ keep: [0, null, false] });
});
it("当前整数契约限安全整数，非有限box数值拒绝，正常有限0保持", () => {
  expect(Turn.shape.inputTokens.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  expect(Turn.shape.inputTokens.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  const mark = { word: "山", charIndex: 0, expected: "山", box: [0, 0, 1, 1], suspicious: false, confidence: 0 };
  expect(DictationMark.parse(mark).confidence).toBe(0);
  for (const number of [Infinity, -Infinity, NaN]) expect(DictationMark.safeParse({ ...mark, box: [number, 0, 1, 1] }).success).toBe(false);
});
it("实际datetime保留UTC/offset约束及闰日校验，不放宽无秒/坏日期", () => {
  expect(IsoDateTime.safeParse("2024-02-29T00:00:00.000Z").success).toBe(true);
  for (const value of ["2026-02-29T00:00:00.000Z", "2026-11-15T00:00Z", "2026-11-15T00:00:00+00:00"]) expect(IsoDateTime.safeParse(value).success).toBe(false);
  expect(ResearchReferenceSchema.shape.publishedAt.parse("2026-11-15T00:00:00+00:00")).toBe("2026-11-15T00:00:00+00:00");
  expect(ResearchReferenceSchema.shape.publishedAt.parse(null)).toBeNull();
});

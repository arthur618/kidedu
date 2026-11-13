import { createHash } from "node:crypto";
import { z } from "zod";
import { CharCard, Passage, Lesson } from "../../src/contracts/schemas";

export type Kind = "cards" | "passages" | "lessons";
export type Document = Record<string, unknown>;
export const schemas = { cards: CharCard, passages: Passage, lessons: Lesson };
export const han = (text: string): string[] => text.match(/\p{Script=Han}/gu) ?? [];
export const isHan = (text: string): boolean => /^\p{Script=Han}$/u.test(text);
export function fingerprint(doc: Document): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "status" && key !== "_check" && key !== "_review"))))).digest("hex");
}
export function countScope(body: string, known: string[]) {
  const distinct = [...new Set(han(body))];
  const knownSet = new Set(known);
  const outside = distinct.filter(char => !knownSet.has(char)).sort();
  return { hanCount: han(body).length, distinctCount: distinct.length, outside, outOfScopeCount: outside.length, ratio: distinct.length ? outside.length / distinct.length : 0 };
}
export function checkDocument(kind: Kind, doc: Document): { doc: Document; issues: string[] } {
  const parsed = schemas[kind].safeParse(doc);
  if (!parsed.success) return { doc, issues: parsed.error.issues.map(issue => `结构 ${issue.path.join(".")}: ${issue.message}`) };
  const issues: string[] = [];
  const output = { ...doc };
  if (kind === "cards") {
    const card = CharCard.parse(doc);
    if (!isHan(card.char)) issues.push("char 必须是单个汉字");
    if (!/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u.test(card.pinyin)) issues.push("pinyin 必须含声调符号");
    if (card.words.some(word => !word.includes(card.char))) issues.push("每个词语都必须包含目标字");
    if (card.words.length < 3 || card.words.length > 5) issues.push("words 必须有三到五个词语");
    if (card.confusable.includes(card.char)) issues.push("形近字不能包含自己");
    if (card.confusable.length > 3 || card.confusable.some(char => !isHan(char))) issues.push("形近字必须是零到三个汉字");
    if (!card.dictationContext.includes(card.char) || !card.words.some(word => card.dictationContext.includes(word))) issues.push("报词语境必须包含目标字和一个词语");
    if (!card.words.some(word => card.dictationContext === `${card.char}，${word}的${card.char}`)) issues.push("报词语境格式必须是“字，词语的字”");
    const sentences = card.explain.split(/[。！？!?]+/u).filter(part => part.trim());
    if (sentences.length < 2 || sentences.length > 3) issues.push("讲解必须为两三句");
    if (!card.radical.trim()) issues.push("部首不能为空");
    if (card.audioUrl !== null) issues.push("本轮 audioUrl 必须为 null");
  } else if (kind === "passages") {
    const passage = Passage.parse(doc);
    const known = z.array(z.string().refine(isHan)).safeParse(doc._knownChars);
    if (!known.success) issues.push("缺少有效的 known-chars 快照 _knownChars");
    const stats = countScope(passage.body, known.success ? known.data : []);
    output.outOfScopeCount = stats.outOfScopeCount;
    if (stats.hanCount < 300 || stats.hanCount > 500) issues.push(`短文汉字数须在300至500之间，当前${stats.hanCount}`);
    if (!passage.targetChars.length || passage.targetChars.some(char => !isHan(char) || !passage.body.includes(char))) issues.push("每个目标汉字必须出现，目标字不能为空");
    if (stats.ratio > 0.03) issues.push(`超纲字超过3%：${stats.outside.join("、")}`);
    if (!/为什么|你觉得/u.test(passage.question)) issues.push("问题须问“为什么”或“你觉得”");
    if (passage.keyPoints.length !== 3) issues.push("参考要点必须有三个");
  } else {
    const lesson = Lesson.parse(doc);
    if ([...lesson.recognizeChars, ...lesson.writeChars].some(char => !isHan(char))) issues.push("生字表必须全是单个汉字");
  }
  return { doc: output, issues };
}

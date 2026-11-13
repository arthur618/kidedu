import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { inputSchemas, checks, mandatoryChecks } from "./checks";
import { agents, type EvalAgent, type EvalCase } from "./types";

const location = z.object({ wordIndex: z.number().int().nonnegative(), charIndex: z.number().int().nonnegative() }).strict();
const caseSchema = z.object({
  id: z.string().min(1), input: z.unknown(), checks: z.array(z.string()).min(1), note: z.string(),
  expected: z.enum(["pass", "blocked"]).optional(), shouldEscalate: z.boolean().optional(),
  tags: z.array(z.string()).optional(), sourceFixture: z.string().optional(),
  extra: z.object({ usedCardFields: z.array(z.string()).optional(), childLastUtterance: z.string().optional(), keyPoints: z.array(z.string()).optional() }).optional(),
  wrongCharacters: z.array(location).optional(),
}).strict();
export interface LoadedCase { agent: EvalAgent; sample: EvalCase; private: boolean }
export function validateCases(agent: EvalAgent, value: unknown): EvalCase[] {
  const samples = z.array(caseSchema).min(1).parse(value);
  const ids = new Set<string>();
  for (const sample of samples) {
    inputSchemas[agent].parse(sample.input);
    if (ids.has(sample.id)) throw new Error("样例编号重复");
    ids.add(sample.id);
    if (sample.checks.some(name => !checks[name])) throw new Error("未知检查名");
    if (agent === "guard" && !sample.expected) throw new Error("护栏样例缺少expected");
    sample.checks = [...new Set([...mandatoryChecks[agent], ...(sample.shouldEscalate ? ["escalates"] : []), ...sample.checks])];
  }
  return samples.map(sample => ({ ...sample, input: sample.input }));
}
export async function loadPublicCases(directory: string, selected?: EvalAgent): Promise<LoadedCase[]> {
  const all: LoadedCase[] = [];
  for (const agent of agents.filter(a => a !== "vision_dictation" && (!selected || a === selected))) {
    const value: unknown = JSON.parse(await readFile(path.join(directory, `${agent}.json`), "utf8"));
    all.push(...validateCases(agent, value).map(sample => ({ agent, sample, private: false })));
  }
  return all;
}
const manifestSchema = z.array(z.object({
  id: z.string().min(1), imageFile: z.string().min(1), expectedWords: z.array(z.string().min(1)).min(1),
  wrongCharacters: z.array(location),
}).strict()).min(1);
/** 只由负责人将来运行；测试仅传入临时目录，不访问真实私有资料。 */
export async function loadPrivateCases(directory: string): Promise<LoadedCase[] | null> {
  try { await readdir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("私有听写目录不可读取");
  }
  try {
    const root = await realpath(directory);
    const manifestPath = await realpath(path.join(root, "manifest.json"));
    const manifestRelative = path.relative(root, manifestPath);
    if (!manifestRelative || manifestRelative.startsWith("..") || path.isAbsolute(manifestRelative)) throw new Error("标注超出私有目录");
    const entries = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
    const samples: EvalCase[] = [];
    for (const entry of entries) {
      const imagePath = await realpath(path.resolve(root, entry.imageFile));
      const relative = path.relative(root, imagePath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("图片超出私有目录");
      const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[path.extname(imagePath).toLowerCase()];
      if (!mime) throw new Error("图片格式不支持");
      const locations = new Set<string>();
      for (const wrong of entry.wrongCharacters) {
        if (entry.expectedWords[wrong.wordIndex]?.[wrong.charIndex] === undefined) throw new Error("错字位置无效");
        const key = `${wrong.wordIndex}:${wrong.charIndex}`;
        if (locations.has(key)) throw new Error("错字位置重复");
        locations.add(key);
      }
      samples.push({ id: entry.id, input: { imageUrl: `data:${mime};base64,${(await readFile(imagePath)).toString("base64")}`, expectedWords: entry.expectedWords }, checks: mandatoryChecks.vision_dictation, note: "私有听写", wrongCharacters: entry.wrongCharacters });
    }
    return validateCases("vision_dictation", samples).map(sample => ({ agent: "vision_dictation", sample, private: true }));
  } catch {
    // 不将Zod问题、文件路径、标注或底层错误带出私有边界。
    throw new Error("私有听写资料无效，请在本机检查manifest和图片");
  }
}

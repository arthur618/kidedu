import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
// 只读取比较所需的公开投影，不能经此命令打印模型输出或私有结果。
const projection = z.object({ version: z.literal(1), summaries: z.array(z.object({ agent: z.string(), passRate: z.number().min(0).max(1) })), cases: z.array(z.object({ agent: z.string(), id: z.string(), pass: z.boolean() })), skipped: z.array(z.object({ agent: z.string(), reason: z.string() })) });
export function diffReports(a: unknown, b: unknown): string {
  const before = projection.parse(a), after = projection.parse(b);
  const lines = ["Agent  通过率A  通过率B  变化（百分点）"];
  for (const agent of new Set([...before.summaries, ...after.summaries].map(s => s.agent))) {
    const x = before.summaries.find(s => s.agent === agent)?.passRate;
    const y = after.summaries.find(s => s.agent === agent)?.passRate;
    lines.push(`${agent}  ${x === undefined ? "未运行" : (x * 100).toFixed(1) + "%"}  ${y === undefined ? "未运行" : (y * 100).toFixed(1) + "%"}  ${x === undefined || y === undefined ? "不可比" : ((y - x) * 100).toFixed(1)}`);
  }
  const regressions = after.cases.filter(c => c.agent !== "vision_dictation" && !c.pass && before.cases.some(p => p.agent === c.agent && p.id === c.id && p.pass));
  lines.push("从通过变为不通过：" + (regressions.length ? regressions.map(c => `${c.agent}/${c.id}`).join("、") : "无"));
  if ([...before.summaries, ...after.summaries].some(s => s.agent === "vision_dictation")) lines.push("私有听写仅比较汇总，不列逐条变化。");
  if (before.skipped.length || after.skipped.length) lines.push("存在已跳过的Agent；缺席不等于通过。");
  return lines.join("\n");
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    if (args.length !== 2) throw new Error("需要两个结果文件");
    // 私有目录的逐条文件不是本命令的输入，防止误用泄露。
    const files = args.map(file => path.resolve(file));
    if (files.some(file => file.split(path.sep).includes("private"))) throw new Error("仅比较公开汇总文件");
    const [a, b] = await Promise.all(files.map(async file => JSON.parse(await readFile(file, "utf8")) as unknown));
    console.log(diffReports(a, b));
    return 0;
  } catch { console.error("比较失败：请提供两个公开评测结果文件。"); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();

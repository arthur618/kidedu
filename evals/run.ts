import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agents, type EvalAgent } from "./types";
import { runEvaluation, type RunOptions } from "./runner";
export function parseArgs(args: string[]): { agent?: EvalAgent; model?: string; limit?: number } {
  const parsed: { agent?: EvalAgent; model?: string; limit?: number } = {};
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!;
    const value = args[index + 1];
    if (!["--agent", "--model", "--limit"].includes(flag) || seen.has(flag) || !value || value.startsWith("--")) throw new Error("用法：npm run eval -- [--agent 名字] [--model 模型名] [--limit 正整数]");
    seen.add(flag);
    if (flag === "--agent") {
      if (!agents.includes(value as EvalAgent)) throw new Error("未知Agent");
      parsed.agent = value as EvalAgent;
    } else if (flag === "--model") parsed.model = value;
    else {
      if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("limit必须是正整数");
      parsed.limit = Number(value);
    }
  }
  return parsed;
}
export async function main(args = process.argv.slice(2), dependencies: Omit<RunOptions, "agent" | "model" | "limit"> = { rootDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") }): Promise<number> {
  try {
    const options = parseArgs(args);
    const { report } = await runEvaluation({ ...dependencies, ...options });
    return report.exitCode;
  } catch {
    // 不打印上游错误中的路径、标注、凭据或命令行里的任意文字。
    console.error("评测启动失败：请检查参数、模型配置或本机样例资料。用法见evals/README.md。");
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main();

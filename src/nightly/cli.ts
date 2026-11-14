import { pathToFileURL } from "node:url";
import { NightlyRunRequestSchema } from "../contracts/nightly";
import { disconnectPrisma } from "../db/client";
import { createNightlyRunner } from "./run";
import type { RunRequest } from "./source";

export function parseArgs(args: string[]): RunRequest {
  const flags: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--retry-failed") { if (flags.retryFailed !== undefined) throw new Error("重复参数。"); flags.retryFailed = true; }
    else {
      const key = arg === "--child-id" ? "childId" : arg === "--date" ? "date" : arg === "--timezone" ? "timezone" : null;
      if (!key || flags[key] !== undefined || !args[index + 1] || args[index + 1]!.startsWith("--")) throw new Error("参数无效。");
      flags[key] = args[++index];
    }
  }
  return NightlyRunRequestSchema.parse(flags);
}
export async function runCli(args: string[], deps: { run: (request: RunRequest) => Promise<unknown>; write: (text: string) => void } = { run: createNightlyRunner(), write: text => process.stdout.write(text) }): Promise<void> {
  const report = await deps.run(parseArgs(args));
  deps.write(`${JSON.stringify(report)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runCli(process.argv.slice(2)); }
  catch { process.stderr.write("日报处理未完成，请检查孩子、日期和本地配置后重试。\n"); process.exitCode = 1; }
  finally { await disconnectPrisma(); }
}

import type { GuardInput, GuardOutput } from "../contracts/schemas";
import { checkWithModel, type GuardDeps } from "./model";
import { checkRules, type GuardExtra } from "./rules";

export type { GuardExtra, RuleResult } from "./rules";
export type { GuardDeps } from "./model";

export async function guard(input: GuardInput, extra: GuardExtra, deps: GuardDeps): Promise<GuardOutput> {
  const result = checkRules(input, extra);
  if (result.verdict === "pass") return { verdict: "pass", reason: "none", layer: "rule" };
  if (result.verdict === "blocked") return { ...result, layer: "rule" };
  return checkWithModel(input, extra, deps);
}

export interface GuardableOutput {
  say: string;
  ask: string | null;
  usedCardFields?: string[];
}

export interface WithGuardOptions<T> extends GuardDeps {
  agent: GuardInput["agent"];
  context: GuardInput["context"];
  extra?: GuardExtra | ((output: T) => GuardExtra);
}

export interface GuardedResult<T> {
  output: T;
  /** 最后一次候选的结论；兜底时保留 blocked，供调用方记录 Incident。 */
  guard: GuardOutput;
  usedFallback: boolean;
}

export async function withGuard<T extends GuardableOutput>(
  run: () => T | Promise<T>,
  fallback: () => T | Promise<T>,
  opts: WithGuardOptions<T>,
): Promise<GuardedResult<T>> {
  let finalGuard: GuardOutput;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const output = await run();
    const supplied = typeof opts.extra === "function" ? opts.extra(output) : opts.extra;
    const extra = { ...supplied, usedCardFields: output.usedCardFields ?? supplied?.usedCardFields };
    finalGuard = await guard({
      agent: opts.agent,
      context: opts.context,
      candidate: [output.say, output.ask].filter((text) => text !== null).join("\n"),
    }, extra, opts);
    if (finalGuard.verdict === "pass") return { output, guard: finalGuard, usedFallback: false };
  }
  // 兜底由调用方提供可信话术或内容库原文，不再重写或调模型。
  return { output: await fallback(), guard: finalGuard!, usedFallback: true };
}

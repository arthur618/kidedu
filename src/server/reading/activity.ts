import type { SessionContext, SessionState } from "../../contracts/orchestrator";
import type { ChildChar, Passage, ReaderInput, ReaderOutput } from "../../contracts/schemas";
import { PublicReadingPassageSchema, type ReadingRuntime } from "../../contracts/reading";
import type { SessionPacket } from "../../contracts/session";
import { listApprovedPassages, getPassage } from "../../db/passage";
import { getReadingRuntime, saveReadingRuntime } from "../../db/readingRuntime";
import { checkRules } from "../../guard/rules";
import { withGuard } from "../../guard";
import { runReader } from "../../agents";
import type { RuntimeDeps } from "../deps";
import { incident } from "../effects";
import { measuredClient, persistTurns, type PendingTurn } from "../model";

function compareIds(a: string, b: string): number {
  const left = Array.from(a, char => char.codePointAt(0)!); const right = Array.from(b, char => char.codePointAt(0)!);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}
export function selectPassage(passages: Passage[], ctx: SessionContext, chars: ChildChar[]): Passage | null {
  const today = new Set([...ctx.plan.newChars, ...ctx.plan.reviewChars, ...ctx.plan.carryOverChars]);
  const known = new Set(chars.filter(cc => ["review_2d", "review_7d", "mastered"].includes(cc.stage)).map(cc => cc.char));
  const matches = (p: Passage, set: Set<string>) => [...new Set(p.targetChars)].filter(c => set.has(c)).length;
  return passages.filter(p => p.status === "approved" && (matches(p, today) + matches(p, known) > 0)).sort((a,b) => matches(b,today)-matches(a,today) || matches(b,known)-matches(a,known) || a.outOfScopeCount-b.outOfScopeCount || compareIds(a.id, b.id))[0] ?? null;
}
export function rulesPass(output: ReaderOutput, passage: Passage): boolean {
  const count = (text: string) => (text.match(/[^。！？!?]+[。！？!?]*/gu) ?? []).filter(sentence => sentence.trim()).length;
  if (count(output.say) > 2 || count(output.ask ?? "") > 1) return false;
  return checkRules({ agent: "reader", context: "reading", candidate: [output.say, output.ask].filter(Boolean).join("\n") }, { keyPoints: passage.keyPoints }).verdict === "pass";
}
// 全部候选都经过同一真实规则；极端参考要点也不能使兜底绕过审查。
export function safeOutput(passage: Passage, wrap = false): ReaderOutput {
  const candidates: ReaderOutput[] = wrap
    ? ["这次先读到这里。", "谢谢你和我聊一聊。", "歇会儿。"].map(say => ({ say, ask: null, next: "step_done" }))
    : ["你想说什么？", "你从哪里看出来的？", "想说什么？"].map(ask => ({ say: "聊聊吧。", ask, next: "wait_child" }));
  return candidates.find(output => rulesPass(output, passage)) ?? { say: "", ask: null, next: wrap ? "step_done" : "wait_child" };
}
/** 必须由状态/命令检查点的同一短事务调用，不调用模型。 */
export async function checkpointReading(deps: RuntimeDeps, id: string, before: SessionState, state: SessionState, ctx: SessionContext): Promise<void> {
  if (state === "reading" && before !== "reading") {
    const passage = selectPassage(await listApprovedPassages(), ctx, await deps.listChildChars(ctx.childId));
    if (passage) await saveReadingRuntime(id, { passage: { ...passage, status: "approved" }, phase: "reading", question: null, history: [], transcript: [], output: null, startedAt: deps.now().toISOString(), completedAt: null });
    else await incident(deps, "knowledge", "没有合适的已审核短文。");
  }
  const activity = await getReadingRuntime(id);
  if (!activity) return;
  if (before === "reading" && state === "retell") {
    if (!await getPassage(activity.passage.id)) return;
    const question = activity.passage.question;
    let output: ReaderOutput = { say: "读完想一想。", ask: question, next: "wait_child" };
    if (!question.trim() || question.length > 60 || (question.match(/[^。！？!?]+[。！？!?]*/gu) ?? []).length !== 1 || !rulesPass(output, activity.passage)) {
      await incident(deps, "bad_question", "短文首问已由安全提问替换。");
      output = safeOutput(activity.passage);
    }
    await saveReadingRuntime(id, { ...activity, phase: "answer", question: output.ask, output, history: [{ role: "agent", text: [output.say, output.ask].filter(Boolean).join("\n") }] });
  }
  if (!["reading", "retell"].includes(state) && !["complete", "abandoned"].includes(activity.phase)) await saveReadingRuntime(id, { ...activity, phase: "abandoned" });
}
export function readingUnavailable(id: string, state: SessionState): SessionPacket {
  return { sessionId: id, state, effects: [], unavailable: { reason: "missing_content", say: "这个故事还没准备好，今天先到这吧。" } };
}
export async function readingSnapshot(id: string, state: "reading" | "retell"): Promise<SessionPacket> {
  const activity = await getReadingRuntime(id);
  if (!activity || !await getPassage(activity.passage.id)) return readingUnavailable(id, state);
  if (state === "reading" && activity.phase === "reading") return { sessionId: id, state, effects: [{ type: "show", screen: state, data: { mode: "ready", passage: PublicReadingPassageSchema.parse({ id: activity.passage.id, title: activity.passage.title, body: activity.passage.body, targetChars: [...new Set(activity.passage.targetChars)] }) } }] };
  if (state === "retell" && ["answer", "follow_up"].includes(activity.phase) && activity.output) return { sessionId: id, state, effects: [{ type: "show", screen: state, data: { mode: "ready", passageId: activity.passage.id, phase: activity.phase, say: activity.output.say, ask: activity.output.ask } }] };
  return readingUnavailable(id, state);
}
export async function readerOutput(deps: RuntimeDeps, id: string, activity: ReadingRuntime, text: string): Promise<ReaderOutput> {
  const child = await deps.getChild((await deps.getSessionRuntime(id))!.context.childId);
  if (!child) return safeOutput(activity.passage, activity.phase === "follow_up");
  if (!await getPassage(activity.passage.id)) return safeOutput(activity.passage, activity.phase === "follow_up");
  const step = activity.phase === "answer" ? "follow_up" : "wrap_up";
  const turns: PendingTurn[] = [];
  const llm = measuredClient(deps.llm, deps.modelOptions, turns);
  const meta = { activity: "reading", passageId: activity.passage.id, step };
  const input: ReaderInput = { child, passage: activity.passage, step, history: [...activity.history, { role: "child" as const, text }].slice(-12) };
  let failedModel = false;
  const flush = async (verdict: "pass" | "blocked") => { failedModel ||= turns.some(turn => !turn.result.ok); await persistTurns(id, turns, verdict, deps.now, meta); };
  const result = await withGuard(async () => {
    await flush("blocked");
    return runReader(input, { llm });
  }, () => safeOutput(activity.passage, step === "wrap_up"), { llm, agent: "reader", context: "reading", extra: { keyPoints: activity.passage.keyPoints } });
  await flush(result.guard.verdict);
  if (failedModel) await incident(deps, "bad_question", "阅读服务暂不可用，已使用安全话术。");
  if (result.guard.verdict === "blocked") await incident(deps, "bad_question", "阅读输出已拦下。");
  const output = step === "wrap_up" ? { ...result.output, ask: null } : result.output;
  if (rulesPass(output, activity.passage)) return output;
  await incident(deps, "bad_question", "阅读话术已由安全短句替换。");
  return safeOutput(activity.passage, step === "wrap_up");
}

import type { SessionContext, SessionState } from "../../contracts/orchestrator";
import type { EssayRuntime } from "../../contracts/essay";
import type { EssayInput, EssayOutput } from "../../contracts/schemas";
import { SessionScreenDataSchemas, type SessionPacket } from "../../contracts/session";
import { getEssayRuntime, saveEssayRuntime } from "../../db/essayRuntime";
import { runEssay } from "../../agents";
import { withGuard } from "../../guard";
import { checkRules } from "../../guard/rules";
import { incident } from "../effects";
import { measuredClient, persistTurns, type PendingTurn } from "../model";
import type { RuntimeDeps } from "../deps";
export const essayStates = ["essay_interview", "essay_cards", "essay_feedback"];
export function validCard(card: string | null, latest: string): card is string {
  return card !== null && !!card.trim() && latest.includes(card);
}
// 每种细节只有固定的一件事；两个阶段共用模板，不接受模型提供的自由文本槽位。
const detailQuestions = [
  { interview: "你看到了什么？", feedback: "我还想知道，当时你看到了什么？" },
  { interview: "你听到了什么？", feedback: "我还想知道，当时你听到了什么？" },
  { interview: "当时说了什么？", feedback: "我还想知道，当时说了什么？" },
  { interview: "当时你是怎么想的？", feedback: "我还想知道，当时你是怎么想的？" },
  { interview: "后来发生了什么？", feedback: "我还想知道，后来发生了什么？" },
] as const;
export function trustedEssayQuestion(ask: string | null, feedback: boolean): ask is string {
  return detailQuestions.some(question => ask === question[feedback ? "feedback" : "interview"]);
}
export function feedbackQuote(output: EssayOutput, text: string): string | null {
  const match = /^我看见了：“([^“”‘’"'\r\n]{1,40})”[。]?$/u.exec(output.say);
  const quote = match?.[1];
  return quote?.trim() && quote.length <= 40 && text.includes(quote) && trustedEssayQuestion(output.ask, true) ? quote : null;
}
export function outputValid(output: EssayOutput, activity: EssayRuntime, feedback: boolean): boolean {
  if (!trustedEssayQuestion(output.ask, feedback)) return false;
  if (feedback && !feedbackQuote(output, activity.essayText ?? "")) return false;
  if (!feedback && !["", "先想一个小细节。", "我听见了。", "谢谢你告诉我。", "我们接着想一想。"].includes(output.say)) return false;
  return checkRules({ agent: "essay", context: "essay", candidate: [output.say, output.ask].filter(Boolean).join("\n") }, { childLastUtterance: feedback ? activity.essayText ?? "" : activity.utterances.at(-1) ?? "" }).verdict === "pass";
}
export function safeEssayOutput(activity: EssayRuntime, feedback: boolean): EssayOutput | null {
  if (!feedback) {
    const output: EssayOutput = { say: "先想一个小细节。", ask: detailQuestions[Math.min(activity.utterances.length, 4)]!.interview, next: "wait_child", newCard: null };
    return outputValid(output, activity, false) ? output : null;
  }
  const fragments = activity.essayText?.match(/[^\s“”‘’"'。！？!?\r\n]+/gu) ?? [];
  for (const fragment of fragments) {
    const quote = Array.from(fragment).slice(0, 10).join("");
    const output: EssayOutput = { say: `我看见了：“${quote}”`, ask: detailQuestions[3].feedback, next: "wait_child", newCard: null };
    if (outputValid(output, activity, true)) return output;
  }
  return null;
}
/** 仅在状态与命令检查点短事务内执行。 */
export async function checkpointEssay(deps: RuntimeDeps, id: string, before: SessionState, state: SessionState, ctx: SessionContext, completed = false): Promise<void> {
  if (state === "essay_interview" && before !== state) {
    const item = ctx.homework.find(item => item.kind === "essay" && item.supported && !!item.text.trim());
    if (item) await saveEssayRuntime(id, { topic: item.text.trim(), homeworkItemId: item.id, phase: "interview", utterances: [], cards: [], history: [], essayText: null, output: null, feedbackQuote: null, startedAt: deps.now().toISOString(), completedAt: null });
    else await incident(deps, "bad_question", "作文主题尚未准备好。", id);
  }
  const activity = await getEssayRuntime(id);
  if (!activity) return;
  if (before === "essay_interview" && state === "essay_cards") await saveEssayRuntime(id, { ...activity, phase: "cards" });
  else if (before === "essay_feedback" && state === "wrap_up" && activity.phase === "feedback" && completed) await saveEssayRuntime(id, { ...activity, phase: "complete", completedAt: deps.now().toISOString() });
  else if (!essayStates.includes(state) && !["complete", "abandoned"].includes(activity.phase)) await saveEssayRuntime(id, { ...activity, phase: "abandoned" });
}
export function essayUnavailable(id: string, state: SessionState): SessionPacket {
  return { sessionId: id, state, effects: [], unavailable: { reason: "missing_content", say: "今天先把你的想法留在这里，下次再聊吧。" } };
}
export function essayPacket(id: string, state: SessionState, activity: EssayRuntime): SessionPacket {
  let data: unknown;
  // 旧版本私有快照也不能绕过当前规则；GET只作安全投影，不写库、不调模型。
  const feedback = state === "essay_feedback";
  const output = activity.output && (outputValid(activity.output, activity, feedback) ? activity.output : safeEssayOutput(activity, feedback));
  if (state === "essay_cards" && activity.phase === "cards") data = { mode: "ready", topic: activity.topic, cards: activity.cards };
  if (state === "essay_interview" && activity.phase === "interview" && output) data = { mode: "ready", topic: activity.topic, say: output.say, ask: output.ask, remaining: 5 - activity.utterances.length };
  const quote = feedback && output ? feedbackQuote(output, activity.essayText ?? "") : null;
  if (state === "essay_feedback" && activity.phase === "feedback" && output && quote) data = { mode: "ready", say: output.say, ask: output.ask, quote };
  return data ? { sessionId: id, state, effects: [{ type: "show", screen: state, data }] } : essayUnavailable(id, state);
}
/** complete历史响应只做可信投影，保留历史remaining/卡/状态，不调模型、不写活动或命令。 */
export function projectEssayResponse(packet: SessionPacket, activity: EssayRuntime | null): SessionPacket {
  if (!packet.effects.some(effect => effect.screen === "essay_interview" || effect.screen === "essay_feedback")) return packet;
  const id = packet.sessionId ?? "session";
  if (!activity) return essayUnavailable(id, packet.state);
  const effects = [] as SessionPacket["effects"];
  for (const effect of packet.effects) {
    if (effect.screen !== "essay_interview" && effect.screen !== "essay_feedback") { effects.push(effect); continue; }
    const parsed = SessionScreenDataSchemas[effect.screen].safeParse(effect.data);
    if (!parsed.success || parsed.data.mode !== "ready") return essayUnavailable(id, packet.state);
    const data = parsed.data;
    const feedback = effect.screen === "essay_feedback";
    // 采访重放采用当时回答数对应的固定问题，不能拿当前进度替换旧响应。
    const source = "remaining" in data ? { ...activity, utterances: activity.utterances.slice(0, 5 - data.remaining) } : activity;
    const candidate: EssayOutput = { say: data.say, ask: data.ask, next: "wait_child", newCard: null };
    const output = outputValid(candidate, source, feedback) ? candidate : safeEssayOutput(source, feedback);
    if (!output) return essayUnavailable(id, packet.state);
    const quote = feedback ? feedbackQuote(output, source.essayText ?? "") : null;
    if (feedback && !quote) return essayUnavailable(id, packet.state);
    if (data.say === output.say && data.ask === output.ask && (!feedback || ("quote" in data && data.quote === quote))) { effects.push(effect); continue; }
    effects.push({ ...effect, data: feedback ? { mode: "ready", say: output.say, ask: output.ask, quote } : { ...data, say: output.say, ask: output.ask } });
  }
  return effects.every((effect, index) => effect === packet.effects[index]) ? packet : { ...packet, effects };
}
export async function essaySnapshot(id: string, state: SessionState): Promise<SessionPacket> {
  const activity = await getEssayRuntime(id);
  return activity ? essayPacket(id, state, activity) : essayUnavailable(id, state);
}
export async function essayOutput(deps: RuntimeDeps, id: string, activity: EssayRuntime, feedback: boolean): Promise<EssayOutput | null> {
  const child = await deps.getChild((await deps.getSessionRuntime(id))!.context.childId);
  if (!child) return safeEssayOutput(activity, feedback);
  const turns: PendingTurn[] = []; let failed = false; let invalid = false;
  const llm = measuredClient(deps.llm, deps.modelOptions, turns);
  const meta = { activity: "essay", step: feedback ? "reader_feedback" : "interview" };
  const flush = async (verdict: "pass" | "blocked") => { failed ||= turns.some(turn => !turn.result.ok); await persistTurns(id, turns, verdict, deps.now, meta); };
  const input: EssayInput = { child, topic: activity.topic, step: feedback ? "reader_feedback" : "interview", cards: activity.cards.filter(card => card.selected).map(card => card.text), essayText: feedback ? activity.essayText : null, history: activity.history.slice(-12) };
  const fallback = safeEssayOutput(activity, feedback);
  const blocked: EssayOutput = { say: "可以这样写", ask: null, next: "wait_child", newCard: null };
  const result = await withGuard(async () => {
    await flush("blocked");
    const candidate = await runEssay(input, { llm });
    // 保留原候选交给真实护栏；服务端结构/来源违约附上确定拦截标记，复用其一次重试。
    // 该标记只存在候选审查内；最终输出必须再次通过来源/规则校验，不能显示给孩子。
    if (!outputValid(candidate, activity, feedback)) { invalid = true; return { ...candidate, say: `${candidate.say}\n可以这样写` }; }
    return candidate;
  }, () => fallback ?? blocked, { llm, agent: "essay", context: "essay", extra: { childLastUtterance: feedback ? activity.essayText ?? "" : activity.utterances.at(-1) ?? "" } });
  await flush(result.guard.verdict);
  if (failed || invalid || result.guard.verdict === "blocked") await incident(deps, "ghostwriting", failed ? "作文服务暂不可用，已使用安全退路。" : "作文候选已拦下，已核对原话来源。", id);
  if (!outputValid(result.output, activity, feedback)) return fallback;
  return { ...result.output, newCard: feedback ? null : validCard(result.output.newCard, activity.utterances.at(-1) ?? "") ? result.output.newCard : null };
}
export function withEssayOutput(activity: EssayRuntime, output: EssayOutput | null, feedback: boolean): EssayRuntime {
  return { ...activity, output, feedbackQuote: feedback && output ? feedbackQuote(output, activity.essayText ?? "") : null, history: output ? [...activity.history, { role: "agent" as const, text: [output.say, output.ask].filter(Boolean).join("\n") }].slice(-12) : activity.history };
}

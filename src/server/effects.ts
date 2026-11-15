import { essayOutput, essayPacket, essaySnapshot, essayStates, withEssayOutput } from "./essay/activity";
import { getEssayRuntime } from "../db/essayRuntime";
import type { EssayRuntime } from "../contracts/essay";
import { readingSnapshot } from "./reading/activity";
import { randomUUID } from "node:crypto";
import type { Effect } from "../contracts/orchestrator";
import type { CharCoachInput, CharCoachOutput, Incident } from "../contracts/schemas";
import { SessionPacketSchema, type SessionPacket } from "../contracts/session";
import { runCharCoach, runVisionDictation } from "../agents";
import { fallback as coachFallback } from "../agents/char_coach/fallback";
import { fallback as dictationFallback } from "../agents/vision_dictation/fallback";
import { withGuard } from "../guard";
import { insertIncident } from "../db/incident";
import { getCoachRuntime, type CoachRuntime } from "../db/coachRuntime";
import { getCommand, latestCompletedCommand, unfinishedCommands } from "../db/sessionCommand";
import type { RuntimeDeps } from "./deps";
import { measuredClient, persistTurns, type PendingTurn } from "./model";
import { SessionNotFoundError } from "./session";

export async function incident(deps: RuntimeDeps, type: Incident["type"], note: string, sessionId: string): Promise<void> {
  await insertIncident({ id: `incident_${randomUUID()}`, type, turnId: null, note, resolved: false, createdAt: deps.now().toISOString() }, sessionId);
}
export function unavailable(sessionId: string, state: SessionPacket["state"], reason: "missing_content" | "photo_not_available" = "missing_content"): SessionPacket {
  return { sessionId, state, effects: [], unavailable: { reason, say: reason === "missing_content" ? "这张字卡还没准备好，今天先到这吧。" : "这张照片暂时看不到了，今天先到这吧。" } };
}
export async function coachOutput(deps: RuntimeDeps, sessionId: string, input: CharCoachInput): Promise<CharCoachOutput> {
  const turns: PendingTurn[] = [];
  const llm = measuredClient(deps.llm, deps.modelOptions, turns);
  const result = await withGuard(async () => {
    // withGuard 开始下一次候选说明上一候选被拦。按候选分别归档。
    await persistTurns(sessionId, turns, "blocked", deps.now);
    return runCharCoach(input, { llm });
  }, () => coachFallback(input), { agent: "char_coach", context: "char", llm });
  await persistTurns(sessionId, turns, result.guard.verdict, deps.now);
  if (result.guard.verdict === "blocked") {
    const type: Incident["type"] = result.guard.reason === "unsafe" ? "safety" : result.guard.reason === "ghostwriting" ? "ghostwriting" : result.guard.reason === "no_card_reference" ? "knowledge" : "bad_question";
    await incident(deps, type, `讲字内容已拦下：${result.guard.reason}`, sessionId);
  }
  if (result.output.next === "escalate") await incident(deps, "bad_question", "讲字活动需要帮助。", sessionId);
  return result.output;
}
export interface EffectResult { packet: SessionPacket; coach?: CoachRuntime; essay?: EssayRuntime }
export interface PhotoCommandReference { scope: string; key: string }
/** 只运行已提交效果；本函数不 reduce、不写学习阶段。 */
export async function executeEffects(deps: RuntimeDeps, sessionId: string, effects: Effect[], photo?: string, photoCommand?: PhotoCommandReference): Promise<EffectResult> {
  const runtime = await deps.getSessionRuntime(sessionId);
  if (!runtime) throw new SessionNotFoundError(sessionId);
  const ctx = runtime.context;
  const essayEffect = effects.find(effect => effect.type === "call_agent" && effect.agent === "essay");
  if (essayEffect?.type === "call_agent" && essayEffect.agent === "essay") {
    const activity = await getEssayRuntime(sessionId);
    if (!activity) return { packet: await essaySnapshot(sessionId, runtime.state) };
    const feedback = essayEffect.payload.step === "reader_feedback";
    const output = await essayOutput(deps, sessionId, activity, feedback);
    const essay = withEssayOutput(activity, output, feedback);
    return { packet: essayPacket(sessionId, runtime.state, essay), essay };
  }
  const charEffect = effects.find(effect => effect.type === "call_agent" && effect.agent === "char_coach");
  if (charEffect?.type === "call_agent" && charEffect.agent === "char_coach") {
    const char = charEffect.payload.char;
    const card = await deps.getCharCard(char);
    const child = await deps.getChild(ctx.childId);
    if (!card || !child) {
      await incident(deps, "knowledge", "当前字卡尚未准备好。", sessionId);
      return { packet: unavailable(sessionId, runtime.state) };
    }
    const input: CharCoachInput = { child, card, step: "explain", history: [] };
    const output = await coachOutput(deps, sessionId, input);
    return { packet: { sessionId, state: runtime.state, effects: [{ type: "show", screen: runtime.state, data: { card, say: output.say, ask: output.ask } }] },
      coach: { char, activity: ctx.understandAttempts[char] ?? 0, step: "explain", history: [], utterances: 0, output } };
  }
  const vision = effects.find(effect => effect.type === "call_agent" && effect.agent === "vision_dictation");
  if (vision?.type === "call_agent" && vision.agent === "vision_dictation") {
    if (!photo) return { packet: unavailable(sessionId, runtime.state, "photo_not_available") };
    const input = { imageUrl: photo, expectedWords: vision.payload.chars };
    const turns: PendingTurn[] = [];
    const output = await runVisionDictation(input, { llm: measuredClient(deps.llm, deps.modelOptions, turns) });
    await persistTurns(sessionId, turns, "skipped", deps.now);
    const expected = dictationFallback(input);
    // 模型漏字或看不清都保留全部可信 expected marks，让孩子自己对照。
    const marks = expected.marks.map(mark => output.unreadable ? mark : output.marks.find(candidate => candidate.expected === mark.expected && candidate.word === mark.word && candidate.charIndex === mark.charIndex) ?? mark);
    return { packet: { sessionId, state: runtime.state, effects: [{ type: "show", screen: runtime.state, data: { imageUrl: photo, chars: vision.payload.chars, marks } }] } };
  }
  if (effects.some(effect => effect.type === "play_audio")) {
    const cards = await deps.getCharCards(ctx.writeQueue);
    if (cards.length !== ctx.writeQueue.length) { await incident(deps, "knowledge", "报词所需字卡尚未准备好。", sessionId); return { packet: unavailable(sessionId, runtime.state) }; }
  }
  return { packet: await snapshot(deps, sessionId, photo, effects.length === 0, photoCommand) };
}
/** 刷新只读快照或可信内容，不调模型，也不推进 coach。 */
export async function snapshot(deps: RuntimeDeps, sessionId: string, photo?: string, usePrevious = true, photoCommand?: PhotoCommandReference): Promise<SessionPacket> {
  const runtime = await deps.getSessionRuntime(sessionId);
  if (!runtime) throw new SessionNotFoundError(sessionId);
  const { state, context: ctx } = runtime;
  if (essayStates.includes(state)) return essaySnapshot(sessionId, state);
  if (state === "reading" || state === "retell") return readingSnapshot(sessionId, state);
  if (state === "ended") return { sessionId, state, effects: [] };
  if (state === "dictation_compare" && !photo) return unavailable(sessionId, state, "photo_not_available");
  const pending = await unfinishedCommands(sessionId);
  const pendingPacket = pending.map(command => (command.pending as { packet?: SessionPacket }).packet).find(packet => packet?.state === state);
  if (pendingPacket) return SessionPacketSchema.parse(pendingPacket);
  // 当前原图和显示按原命令绑定，不能让较新的无图命令遮蔽已恢复的快照。
  const previous = state === "dictation_compare" && photoCommand ? await getCommand(photoCommand.scope, photoCommand.key) : await latestCompletedCommand(sessionId);
  if (usePrevious && previous?.response && !pending.some(command => command.phase === "transitioned" && ((command.pending as { effects?: Effect[] }).effects?.length ?? 0) > 0)) {
    const packet = restorePhoto(previous.response as SessionPacket, photo);
    if (packet.state === state && SessionPacketSchema.safeParse(packet).success) return packet;
  }
  let data: unknown;
  switch (state) {
    case "homework_confirm": data = { items: ctx.homework }; break;
    case "recognize": {
      const char = ctx.queue[0];
      if (!char) return unavailable(sessionId, state);
      const card = await deps.getCharCard(char);
      data = { char, ...(card?.words.find(word => word.includes(char)) ? { word: card.words.find(word => word.includes(char)) } : {}) }; break;
    }
    case "understand": {
      const char = ctx.understandQueue[0];
      const card = char ? await deps.getCharCard(char) : null;
      if (!card) return unavailable(sessionId, state);
      const coach = await getCoachRuntime(sessionId);
      const output = coach && coach.char === char && coach.activity === (ctx.understandAttempts[char!] ?? 0) ? coach.output : coachFallback({ card });
      data = { card, say: output.say, ask: output.ask }; break;
    }
    case "dictation_play": {
      const cards = await deps.getCharCards(ctx.writeQueue);
      if (cards.length !== ctx.writeQueue.length || !cards.length) {
        return unavailable(sessionId, state);
      }
      data = { cards }; break;
    }
    case "dictation_compare": return unavailable(sessionId, state, "photo_not_available");
    case "wrap_up": {
      const seen = (await deps.listChildChars(ctx.childId)).filter(cc => cc.lastSeenOn === ctx.today);
      data = { learned: seen.map(cc => cc.char), revisit: seen.filter(cc => ["review_2d", "review_7d"].includes(cc.stage) && cc.nextReviewOn !== null && cc.nextReviewOn > ctx.today).map(cc => cc.char) }; break;
    }
  }
  return SessionPacketSchema.parse({ sessionId, state, effects: [{ type: "show", screen: state, ...(data === undefined ? {} : { data }) }] });
}
export function restorePhoto(packet: SessionPacket, photo?: string): SessionPacket {
  // 无图历史包仍然无图，不能只清掉 unavailable 而留下空 effects。
  if (packet.state !== "dictation_compare" || packet.unavailable) return packet;
  if (!photo) return unavailable(packet.sessionId ?? "session", packet.state, "photo_not_available");
  const restored = { ...packet, effects: packet.effects.map(effect => effect.screen === "dictation_compare" && effect.data && typeof effect.data === "object" ? { ...effect, data: { ...effect.data, imageUrl: photo } } : effect) };
  return SessionPacketSchema.safeParse(restored).success ? restored : unavailable(packet.sessionId ?? "session", packet.state, "photo_not_available");
}

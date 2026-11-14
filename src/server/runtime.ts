import { checkpointEssay, essayOutput, essayPacket, essaySnapshot, withEssayOutput, validCard, projectEssayResponse } from "./essay/activity";
import { getEssayRuntime, saveEssayRuntime, getEssayCommand, saveEssayCommand, type EssayAction } from "../db/essayRuntime";
import type { EssayRuntime } from "../contracts/essay";
import { checkpointReading, readerOutput, readingSnapshot, readingUnavailable } from "./reading/activity";
import { getReadingRuntime, saveReadingRuntime } from "../db/readingRuntime";
import { getPassage } from "../db/passage";
import { createHash } from "node:crypto";
import type { Effect, SessionEvent } from "../contracts/orchestrator";
import type { CharCoachInput } from "../contracts/schemas";
import { SessionPacketSchema, type SessionPacket } from "../contracts/session";
import { withTransaction } from "../db/client";
import { getCommand, saveCommand, unfinishedCommands, type SessionCommand } from "../db/sessionCommand";
import { getCoachRuntime, saveCoachRuntime, type CoachRuntime } from "../db/coachRuntime";
import { runVisionHomework } from "../agents";
import { fallback as coachFallback } from "../agents/char_coach/fallback";
import { handleEvent, startSession, SessionNotFoundError, type StartSessionInput } from "./session";
import type { RuntimeDeps } from "./deps";
import { coachOutput, executeEffects, incident, snapshot, restorePhoto, unavailable, type PhotoCommandReference } from "./effects";
import { measuredClient, persistTurns, redact, withinBudget, type PendingTurn } from "./model";

export class RequestConflict extends Error { constructor() { super("这次操作已经用过，请重新试一次。"); } }
export class CoachConflict extends Error { constructor() { super("现在先完成眼前这一步吧。"); } }
export type CommandKind = "start" | "event" | "homework" | "coach" | "reading" | "essay";
interface Pending { body?: unknown; effects?: Effect[] }
const queues = new Map<string, Promise<unknown>>();
/** 本轮只支持单 Node 进程。同会话不同 ID 排队，重放也走同一把锁。 */
export async function serial<T>(scope: string, run: () => Promise<T>): Promise<T> {
  const prior = queues.get(scope) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(run);
  queues.set(scope, current);
  try { return await current; } finally { if (queues.get(scope) === current) queues.delete(scope); }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(kind: CommandKind, scope: string, body: unknown): string {
  return createHash("sha256").update(canonical({ method: "POST", path: kind === "start" ? "/api/session" : `/api/session/${scope}/${kind}`, body })).digest("hex");
}
export function createSessionService(deps: RuntimeDeps) {
  const photos = new Map<string, PhotoCommandReference & { url: string; fingerprint: string }>();
  async function complete(command: SessionCommand, packet: SessionPacket, coach?: CoachRuntime, essay?: EssayRuntime): Promise<SessionPacket> {
    const parsed = SessionPacketSchema.parse(packet);
    await withTransaction(async () => {
      if (essay && command.sessionId) await saveEssayRuntime(command.sessionId, essay);
      if (command.kind === "essay" && command.sessionId) await saveEssayCommand(command.sessionId, command.key, null);
      if (coach && command.sessionId) await saveCoachRuntime(command.sessionId, redact(coach) as CoachRuntime);
      await deps.beforeComplete?.();
      await saveCommand({ ...command, phase: "complete", response: redact(parsed) });
    });
    if (command.sessionId && parsed.state !== "dictation_compare") photos.delete(command.sessionId);
    return parsed;
  }
  async function transition(command: SessionCommand, sessionId: string, event: SessionEvent): Promise<SessionCommand> {
    return withTransaction(async () => {
      const before = await deps.getSessionRuntime(sessionId);
      const result = await handleEvent(deps, sessionId, event);
      const current = (await deps.getSessionRuntime(sessionId))!;
      await checkpointReading(deps, sessionId, before!.state, result.state, current.context);
      await checkpointEssay(deps, sessionId, before!.state, result.state, current.context, event.type === "essay_step_done");
      const next: SessionCommand = { ...command, sessionId, phase: "transitioned", pending: redact({ effects: result.effects }), response: null };
      await saveCommand(next);
      return next;
    });
  }
  async function expired(sessionId: string): Promise<boolean> {
    const session = await deps.getSession(sessionId);
    const runtime = await deps.getSessionRuntime(sessionId);
    if (!session || !runtime) throw new SessionNotFoundError(sessionId);
    return runtime.state !== "wrap_up" && runtime.state !== "ended" && (deps.now().getTime() - Date.parse(session.startedAt)) / 60000 >= runtime.context.limitMinutes;
  }
  async function finishEffects(command: SessionCommand, photo?: string): Promise<SessionPacket> {
    const effects = (command.pending as Pending).effects ?? [];
    const needsPhoto = effects.some(effect => effect.type === "call_agent" && effect.agent === "vision_dictation");
    // 旧照片命令保留当时的结果，不能借当前状态重跑旧效果。
    if (needsPhoto && (await deps.getSessionRuntime(command.sessionId!))?.state !== "dictation_compare") {
      return complete(command, unavailable(command.sessionId!, "dictation_compare", "photo_not_available"));
    }
    const held = photos.get(command.sessionId!);
    const currentPhoto = needsPhoto ? photo : held?.url;
    const result = await executeEffects(deps, command.sessionId!, effects, currentPhoto, needsPhoto ? command : held);
    const packet = await complete(command, result.packet, result.coach, result.essay);
    if (needsPhoto && photo) photos.set(command.sessionId!, { url: photo, fingerprint: command.fingerprint, scope: command.scope, key: command.key });
    return packet;
  }
  async function runPrepared(command: SessionCommand, body: unknown, photo?: string): Promise<SessionPacket> {
    const id = command.sessionId!;
    if (command.kind !== "start" && await expired(id)) {
      command = await transition(command, id, { type: "time_up" });
      await deps.afterCheckpoint?.();
      return finishEffects(command);
    }
    if (command.kind === "event") {
      const event = body as SessionEvent;
      if (event.type === "retell_done") throw new CoachConflict();
      if (event.type === "essay_step_done" && (await deps.getSessionRuntime(id))?.state === "essay_cards") throw new CoachConflict();
      command = await transition(command, id, event);
      await deps.afterCheckpoint?.();
      return finishEffects(command, photo);
    }
    if (command.kind === "homework") {
      const runtime = await deps.getSessionRuntime(id);
      if (!runtime) throw new SessionNotFoundError(id);
      if (runtime.state !== "homework_capture") throw new CoachConflict();
      const input = body as { imageDataUrl?: string; spokenText?: string };
      if (input.imageDataUrl && !photo && !input.spokenText) return complete(command, { ...await snapshot(deps, id, undefined, false), notice: "照片暂时看不到了，请再拍一次。" });
      const turns: PendingTurn[] = [];
      const output = await runVisionHomework({ imageUrl: photo ?? null, spokenText: input.spokenText ?? null }, { llm: measuredClient(deps.llm, deps.modelOptions, turns) });
      await persistTurns(id, turns, "skipped", deps.now);
      if (output.unsure) return complete(command, { ...await snapshot(deps, id, undefined, false), notice: "还没看清，请再拍一次，或再说一遍。" });
      command = await withTransaction(async () => {
        const transitioned = await transition(command, id, { type: "homework_captured" });
        const packet: SessionPacket = { sessionId: id, state: "homework_confirm", effects: [{ type: "show", screen: "homework_confirm", data: { items: output.items.map((item, index) => ({ ...item, id: `homework_${index}`, done: false })) } }] };
        const next = { ...transitioned, pending: { packet } };
        await saveCommand(next);
        return next;
      });
      await deps.afterCheckpoint?.();
      return complete(command, (command.pending as { packet: SessionPacket }).packet);
    }
    if (command.kind === "reading") {
      const runtime = await deps.getSessionRuntime(id);
      const activity = await getReadingRuntime(id);
      if (runtime?.state !== "retell" || !activity || !["answer", "follow_up"].includes(activity.phase)) throw new CoachConflict();
      if (!await getPassage(activity.passage.id)) return complete(command, readingUnavailable(id, "retell"));
      await deps.afterCheckpoint?.();
      const text = (body as { text: string }).text;
      const output = await readerOutput(deps, id, activity, text);
      return withTransaction(async () => {
        if (!await getPassage(activity.passage.id)) return complete(command, readingUnavailable(id, "retell"));
        const next = { ...activity, transcript: [...activity.transcript, text], history: [...activity.history, { role: "child" as const, text }, { role: "agent" as const, text: [output.say, output.ask].filter(Boolean).join("\n") }].slice(-12), output };
        if (activity.phase === "answer") {
          await saveReadingRuntime(id, { ...next, phase: "follow_up" });
          return complete(command, await readingSnapshot(id, "retell"));
        }
        // 原话、活动完成、纯状态转换与命令complete同事务；故障全部回滚。
        await saveReadingRuntime(id, { ...next, phase: "complete", completedAt: deps.now().toISOString() });
        const moved = await transition(command, id, { type: "retell_done" });
        const packet = await snapshot(deps, id, undefined, false);
        return complete(moved, { ...packet, notice: output.say });
      });
    }
    if (command.kind === "essay") {
      const action = (await getEssayCommand(id, command.key) ?? body) as EssayAction;
      const runtime = await deps.getSessionRuntime(id);
      const activity = await getEssayRuntime(id);
      if (!activity) throw new CoachConflict();
      if (action.type === "answer") {
        if (runtime?.state !== "essay_interview" || activity.phase !== "interview" || activity.utterances.length >= 5) throw new CoachConflict();
        const text = action.text.trim();
        let next: EssayRuntime = { ...activity, utterances: [...activity.utterances, text], history: [...activity.history, { role: "child" as const, text }].slice(-12) };
        const output = await essayOutput(deps, id, next, false);
        next = withEssayOutput(next, output, false);
        if (output && validCard(output.newCard, text)) next.cards = [...next.cards, { id: `essay_card_${next.utterances.length}`, text: output.newCard, sourceUtterance: next.utterances.length - 1, selected: true }];
        return withTransaction(async () => {
          await saveEssayRuntime(id, next);
          const moved = next.utterances.length === 5 ? await transition(command, id, { type: "essay_step_done" }) : command;
          const state = (await deps.getSessionRuntime(id))!.state;
          return complete(moved, await essaySnapshot(id, state));
        });
      }
      if (runtime?.state !== "essay_cards" || activity.phase !== "cards") throw new CoachConflict();
      if (action.type === "select_card" || action.type === "delete_card") {
        if (!activity.cards.some(card => card.id === action.cardId)) throw new CoachConflict();
        const cards = action.type === "delete_card" ? activity.cards.filter(card => card.id !== action.cardId) : activity.cards.map(card => card.id === action.cardId ? { ...card, selected: action.selected } : card);
        const next = { ...activity, cards };
        return complete(command, essayPacket(id, "essay_cards", next), undefined, next);
      }
      if (action.type !== "submit_essay") throw new CoachConflict();
      // 正文、history、转换与transitioned检查点一同提交；模型在事务外。
      command = await withTransaction(async () => {
        const text = action.text.trim();
        await saveEssayRuntime(id, { ...activity, phase: "feedback", essayText: text, output: null, feedbackQuote: null, history: [...activity.history, { role: "child" as const, text }].slice(-12) });
        return transition(command, id, { type: "essay_step_done" });
      });
      await deps.afterCheckpoint?.();
      return finishEffects(command);
    }
    if (command.kind === "coach") {
      const input = body as { char: string; text: string };
      const runtime = await deps.getSessionRuntime(id);
      if (!runtime) throw new SessionNotFoundError(id);
      if (runtime.state !== "understand" || runtime.context.understandQueue[0] !== input.char) throw new CoachConflict();
      const card = await deps.getCharCard(input.char);
      const child = await deps.getChild(runtime.context.childId);
      if (!card || !child) {
        await incident(deps, "knowledge", "当前字卡尚未准备好。");
        return complete(command, unavailable(id, runtime.state));
      }
      const saved = await getCoachRuntime(id);
      const activity = runtime.context.understandAttempts[input.char] ?? 0;
      let coach: CoachRuntime = saved?.char === input.char && saved.activity === activity ? saved : { char: input.char, activity, step: "explain", history: [], utterances: 0, output: coachFallback({ card }) };
      const text = input.text.trim();
      if (!text && coach.step !== "explain") return complete(command, await snapshot(deps, id, undefined, false), coach);
      const history: CharCoachInput["history"] = text ? [...coach.history, { role: "child" as const, text }].slice(-12) : coach.history;
      let step = coach.step;
      let output = coach.output;
      let done = false;
      const utterances = coach.utterances + (text ? 1 : 0);
      if (!text) step = "make_word";
      else {
        output = await coachOutput(deps, id, { child, card, step, history });
        if (output.next === "step_done") {
          if (step === "make_sentence") done = true;
          else step = step === "explain" ? "make_word" : "make_sentence";
        }
      }
      if (done || utterances >= 6) {
        // 学习转换和命令检查点同一事务；恢复只执行下一活动效果。
        command = await transition(command, id, { type: "understand_done", char: input.char, result: done ? "correct" : "wrong" });
        await deps.afterCheckpoint?.();
        return finishEffects(command);
      }
      // 进入下一步后实际提问，不把上一活动的回答带到新步骤。
      if (step !== coach.step) output = await coachOutput(deps, id, { child, card, step, history: [] });
      coach = { ...coach, step, utterances, output, history: [...history, { role: "agent" as const, text: [output.say, output.ask].filter(Boolean).join("\n") }].slice(-12) };
      return complete(command, { sessionId: id, state: "understand", effects: [{ type: "show", screen: "understand", data: { card, say: output.say, ask: output.ask } }] }, coach);
    }
    throw new Error("无法恢复这次操作。");
  }
  async function resume(command: SessionCommand, body: unknown, photo?: string): Promise<SessionPacket> {
    if (command.phase === "rejected") throw new CoachConflict();
    if (command.phase === "complete") {
      const ownsPhoto = ((command.pending as Pending).effects ?? []).some(effect => effect.type === "call_agent" && effect.agent === "vision_dictation");
      const saved = command.response as SessionPacket;
      // 只有当前仍在这次对照时才恢复缺图效果；退出后的重放只读历史结果。
      const isCurrentCompare = ownsPhoto && (await deps.getSessionRuntime(command.sessionId!))?.state === "dictation_compare";
      if (isCurrentCompare && photo && saved.unavailable?.reason === "photo_not_available") return finishEffects(command, photo);
      if (isCurrentCompare && photo) photos.set(command.sessionId!, { url: photo, fingerprint: command.fingerprint, scope: command.scope, key: command.key });
      if (saved.state === "reading" || saved.state === "retell") {
        if (!await getPassage((await getReadingRuntime(command.sessionId!))?.passage.id ?? "")) return readingUnavailable(command.sessionId!, saved.state);
      }
      if (saved.effects.some(effect => effect.screen === "essay_interview" || effect.screen === "essay_feedback")) return projectEssayResponse(saved, await getEssayRuntime(command.sessionId!));
      return restorePhoto(saved, ownsPhoto ? photo : (command.sessionId ? photos.get(command.sessionId)?.url : undefined));
    }
    if (command.phase === "transitioned") {
      const packet = (command.pending as { packet?: SessionPacket }).packet;
      return packet ? complete(command, packet) : finishEffects(command, photo);
    }
    return runPrepared(command, body, photo);
  }
  return {
    async post(kind: CommandKind, scopeId: string, key: string, body: unknown): Promise<SessionPacket> {
      const scope = `${kind === "start" ? "child" : "session"}:${scopeId}`;
      return serial(scope, () => {
        const input = body as { imageDataUrl?: string; imageUrl?: string };
        const photo = input.imageDataUrl ?? input.imageUrl;
        return withinBudget(deps.modelOptions, photo ? [photo] : [], async () => {
          const hash = fingerprint(kind, scopeId, body);
          let command = await getCommand(scope, key);
          if (command && command.fingerprint !== hash) throw new RequestConflict();
          if (command) return resume(command, body, photo);
          if (kind !== "start") {
            // 新操作先恢复旧检查点；原图不在数据库，缺图效果走安全呈现。
            for (const old of await unfinishedCommands(scopeId)) {
              const held = photos.get(scopeId);
              try { await resume(old, (old.pending as Pending).body ?? {}, held?.fingerprint === old.fingerprint ? held.url : undefined); }
              catch (error) { if (!(error instanceof CoachConflict)) throw error; await withTransaction(async () => { await saveCommand({ ...old, phase: "rejected" }); if (old.kind === "essay") await saveEssayCommand(scopeId, old.key, null); }); }
            }
          }
          command = { scope, key, fingerprint: hash, kind, sessionId: kind === "start" ? null : scopeId, phase: "prepared", pending: kind === "essay" ? { body: {} } : redact({ body }), response: null };
          if (kind === "start") {
            command = await withTransaction(async () => {
              const result = await startSession(deps, body as StartSessionInput);
              const next: SessionCommand = { ...command!, sessionId: result.sessionId, phase: "transitioned", pending: { effects: result.effects } };
              await saveCommand(next);
              return next;
            });
            await deps.afterCheckpoint?.();
            return finishEffects(command);
          }
          await withTransaction(async () => {
            if (kind === "essay") {
              if (!await deps.getSessionRuntime(scopeId)) throw new SessionNotFoundError(scopeId);
              await saveEssayCommand(scopeId, key, body as EssayAction);
            }
            await saveCommand(command!);
          });
          try { return await runPrepared(command, body, photo); }
          catch (error) { if (error instanceof CoachConflict) await withTransaction(async () => { await saveCommand({ ...command!, phase: "rejected" }); if (kind === "essay") await saveEssayCommand(scopeId, key, null); }); throw error; }
        });
      });
    },
    async get(sessionId: string): Promise<SessionPacket & { context: unknown; homework: unknown }> {
      return serial(`session:${sessionId}`, async () => {
        const packet = await snapshot(deps, sessionId, photos.get(sessionId)?.url, true, photos.get(sessionId));
        const runtime = await deps.getSessionRuntime(sessionId);
        if (!runtime) throw new SessionNotFoundError(sessionId);
        return { ...packet, context: runtime.context, homework: runtime.context.homework };
      });
    },
  };
}

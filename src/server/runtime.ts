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
import { coachOutput, executeEffects, incident, snapshot, restorePhoto, unavailable } from "./effects";
import { measuredClient, persistTurns, redact, withinBudget, type PendingTurn } from "./model";

export class RequestConflict extends Error { constructor() { super("这次操作已经用过，请重新试一次。"); } }
export class CoachConflict extends Error { constructor() { super("现在先完成眼前这一步吧。"); } }
export type CommandKind = "start" | "event" | "homework" | "coach";
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
  const photos = new Map<string, { url: string; fingerprint: string }>();
  async function complete(command: SessionCommand, packet: SessionPacket, coach?: CoachRuntime): Promise<SessionPacket> {
    const parsed = SessionPacketSchema.parse(packet);
    await withTransaction(async () => {
      if (coach && command.sessionId) await saveCoachRuntime(command.sessionId, redact(coach) as CoachRuntime);
      await deps.beforeComplete?.();
      await saveCommand({ ...command, phase: "complete", response: redact(parsed) });
    });
    if (command.sessionId && parsed.state !== "dictation_compare") photos.delete(command.sessionId);
    return parsed;
  }
  async function transition(command: SessionCommand, sessionId: string, event: SessionEvent): Promise<SessionCommand> {
    return withTransaction(async () => {
      const result = await handleEvent(deps, sessionId, event);
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
    const currentPhoto = needsPhoto ? photo : photos.get(command.sessionId!)?.url;
    const result = await executeEffects(deps, command.sessionId!, effects, currentPhoto);
    if (needsPhoto && photo) photos.set(command.sessionId!, { url: photo, fingerprint: command.fingerprint });
    return complete(command, result.packet, result.coach);
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
      if (ownsPhoto && photo && saved.unavailable?.reason === "photo_not_available") return finishEffects(command, photo);
      if (ownsPhoto && photo && (await deps.getSessionRuntime(command.sessionId!))?.state === "dictation_compare") photos.set(command.sessionId!, { url: photo, fingerprint: command.fingerprint });
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
              catch (error) { if (!(error instanceof CoachConflict)) throw error; await saveCommand({ ...old, phase: "rejected" }); }
            }
          }
          command = { scope, key, fingerprint: hash, kind, sessionId: kind === "start" ? null : scopeId, phase: "prepared", pending: redact({ body }), response: null };
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
          await saveCommand(command);
          try { return await runPrepared(command, body, photo); }
          catch (error) { if (error instanceof CoachConflict) await saveCommand({ ...command, phase: "rejected" }); throw error; }
        });
      });
    },
    async get(sessionId: string): Promise<SessionPacket & { context: unknown; homework: unknown }> {
      return serial(`session:${sessionId}`, async () => {
        const packet = await snapshot(deps, sessionId, photos.get(sessionId)?.url);
        const runtime = await deps.getSessionRuntime(sessionId);
        if (!runtime) throw new SessionNotFoundError(sessionId);
        return { ...packet, context: runtime.context, homework: runtime.context.homework };
      });
    },
  };
}

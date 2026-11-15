import { createRecoveryStore, RecoveryUnavailable, type RecoveryStorage } from "./recovery/store";
import { SessionRecoveryResponseSchema, type SessionRecoveryHint } from "../contracts/session";
import { EssayActionSchema } from "../contracts/essay";
import { ApprovedCharCard } from "../contracts/session";
import { z } from "zod";
import { ReadingActionSchema } from "../contracts/reading";
import type { CharCard } from "../contracts/schemas";
import { SessionPacketSchema as PacketSchema, SESSION_CLIENT_TIMEOUT_MS, SESSION_REQUEST_ID_HEADER, type SessionPacket as Packet } from "../contracts/session";
import { SessionEventSchema, type SessionEvent } from "../contracts/orchestrator";

export interface LearningService {
  dispose?(): void;
  restart?(operationId?: string): Promise<Packet>;
  essay?(input: z.infer<typeof EssayActionSchema>, operationId?: string): Promise<Packet>;
  reading?(input: { text: string }, operationId?: string): Promise<Packet>;
  readingCard?(char: string): Promise<CharCard | null>;
  start(operationId?: string): Promise<Packet>;
  event(event: SessionEvent, operationId?: string): Promise<Packet>;
  homework(input: { imageDataUrl?: string; spokenText?: string }, operationId?: string): Promise<Packet>;
  coach(input: { char: string; text: string }, operationId?: string): Promise<Packet>;
}
export function createHttpService(options: { childId: string; lessonId: string; hasEssayToday?: boolean; fetcher?: typeof fetch; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout; storage?: () => RecoveryStorage | null; idFactory?: () => string }): LearningService {
  const store = createRecoveryStore(options.childId, options.lessonId, options.storage);
  const id = options.idFactory ?? (() => crypto.randomUUID());
  let hint: SessionRecoveryHint | null = null; let loaded = false; let disposed = false;
  const active = new Set<AbortController>();
  const fetcher = options.fetcher ?? fetch;
  function stash() { if (hint && !disposed) store.save(hint); }
  async function send(path: string, body?: unknown, operationId?: string): Promise<Response> {
    if (disposed) throw new Error('inactive_binding');
    const abort = new AbortController(); active.add(abort);
    let reject!: (reason: Error) => void;
    const cancelled = new Promise<never>((_resolve, fail) => { reject = fail; });
    const cancel = () => reject(new Error('request_unavailable'));
    abort.signal.addEventListener('abort', cancel, { once: true });
    const timeout = (options.setTimer ?? setTimeout)(() => abort.abort(), SESSION_CLIENT_TIMEOUT_MS);
    try {
      const response = await Promise.race([fetcher(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(operationId ? { [SESSION_REQUEST_ID_HEADER]: operationId } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abort.signal }).then(async r => new Response(await r.text(), { status: r.status, headers: r.headers })), cancelled]);
      if (disposed || abort.signal.aborted) throw new Error('inactive_binding');
      return response;
    } finally { (options.clearTimer ?? clearTimeout)(timeout); abort.signal.removeEventListener('abort', cancel); active.delete(abort); }
  }
  function accept(packet: Packet, requestId?: string): Packet {
    if (disposed) throw new Error('inactive_binding');
    if (!hint || !packet.sessionId || hint.sessionId && packet.sessionId !== hint.sessionId) throw new Error('invalid_session');
    hint = { ...hint, sessionId: packet.sessionId, pendingRequestId: hint.pendingRequestId === requestId ? null : hint.pendingRequestId }; stash(); return packet;
  }
  async function request(suffix: string, body: unknown, operationId = id()): Promise<Packet> {
    if (!hint?.sessionId || disposed) throw new Error('missing_session');
    hint = { ...hint, pendingRequestId: operationId }; stash();
    const response = await send(path(suffix), body, operationId);
    if (!response.ok) throw new Error('request_unavailable');
    return accept(PacketSchema.parse(await response.json()), operationId);
  }
  function path(suffix: string) { if (!hint?.sessionId) throw new Error('missing_session'); return `/api/session/${encodeURIComponent(hint.sessionId)}/${suffix}`; }
  async function start(operationId = id()): Promise<Packet> {
    if (!loaded) { hint = store.load(); loaded = true; }
    if (!hint) { hint = { version: 1, childId: options.childId, lessonId: options.lessonId, hasEssayToday: options.hasEssayToday ?? false, startRequestId: operationId, sessionId: null, pendingRequestId: null }; stash(); }
    if (hint.sessionId) {
      const pending = hint.pendingRequestId;
      const response = await send(path('resume'), { childId: hint.childId, lessonId: hint.lessonId, ...(pending ? { operationId: pending } : {}) });
      if (response.status === 404) throw new RecoveryUnavailable();
      if (!response.ok) throw new Error('request_unavailable');
      const result = SessionRecoveryResponseSchema.parse(await response.json());
      const packet = accept(result.packet, pending ?? undefined);
      return result.status === 'operation_missing' ? { ...packet, notice: '刚才那一步还没送到，请再做一次。' } : packet;
    }
    const response = await send('/api/session', { childId: hint.childId, lessonId: hint.lessonId, hasEssayToday: hint.hasEssayToday }, hint.startRequestId);
    if (!response.ok) throw new Error('request_unavailable');
    return accept(PacketSchema.parse(await response.json()));
  }
  return {
    dispose() { disposed = true; active.forEach(controller => controller.abort()); active.clear(); },
    restart(operationId = id()) { if (disposed) return Promise.reject(new Error('inactive_binding')); store.clear(); hint = null; loaded = true; return start(operationId); },
    essay: (input, operationId) => request('essay', EssayActionSchema.parse(input), operationId),
    reading: (input, operationId) => request('reading', ReadingActionSchema.parse(input), operationId),
    readingCard: async char => {
      const response = await send(path('reading/card') + '?char=' + encodeURIComponent(char));
      if (!response.ok) throw new Error('card_unavailable');
      const result = z.discriminatedUnion('status', [z.object({ status: z.literal('ok'), card: ApprovedCharCard }), z.object({ status: z.literal('unavailable') })]).parse(await response.json());
      return result.status === 'ok' ? result.card : null;
    },
    start,
    event: (event, operationId) => request('event', SessionEventSchema.parse(event), operationId),
    homework: (input, operationId) => request('homework', input, operationId),
    coach: (input, operationId) => request('coach', input, operationId),
  };
}

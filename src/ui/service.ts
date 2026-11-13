import { SessionPacketSchema as PacketSchema, SESSION_CLIENT_TIMEOUT_MS, SESSION_REQUEST_ID_HEADER, type SessionPacket as Packet } from "../contracts/session";
import { SessionEventSchema, type SessionEvent } from "../contracts/orchestrator";

export interface LearningService {
  start(operationId?: string): Promise<Packet>;
  event(event: SessionEvent, operationId?: string): Promise<Packet>;
  homework(input: { imageDataUrl?: string; spokenText?: string }, operationId?: string): Promise<Packet>;
  coach(input: { char: string; text: string }, operationId?: string): Promise<Packet>;
}
export function createHttpService(options: { childId: string; lessonId: string; hasEssayToday?: boolean; fetcher?: typeof fetch; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }): LearningService {
  let sessionId: string | undefined;
  const fetcher = options.fetcher ?? fetch;
  async function request(path: string, body: unknown, operationId: string = crypto.randomUUID()): Promise<Packet> {
    const abort = new AbortController();
    const timeout = (options.setTimer ?? setTimeout)(() => abort.abort(), SESSION_CLIENT_TIMEOUT_MS);
    try {
      const response = await fetcher(path, { method: "POST", headers: { "Content-Type": "application/json", [SESSION_REQUEST_ID_HEADER]: operationId }, body: JSON.stringify(body), signal: abort.signal });
      if (!response.ok) throw new Error("request_unavailable");
      const packet = PacketSchema.parse(await response.json());
      if (packet.sessionId) sessionId = packet.sessionId;
      return packet;
    } finally { (options.clearTimer ?? clearTimeout)(timeout); }
  }
  function path(suffix: string) {
    if (!sessionId) throw new Error("missing_session");
    return `/api/session/${encodeURIComponent(sessionId)}/${suffix}`;
  }
  return {
    start: id => request("/api/session", { childId: options.childId, lessonId: options.lessonId, hasEssayToday: options.hasEssayToday ?? false }, id),
    event: (event, id) => request(path("event"), SessionEventSchema.parse(event), id),
    homework: (input, id) => request(path("homework"), input, id),
    coach: (input, id) => request(path("coach"), input, id),
  };
}

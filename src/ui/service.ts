import { PacketSchema, type Packet } from "./model";
import { SessionEventSchema, type SessionEvent } from "../contracts/orchestrator";

export interface LearningService {
  start(): Promise<Packet>;
  event(event: SessionEvent): Promise<Packet>;
  homework(input: { imageDataUrl?: string; spokenText?: string }): Promise<Packet>;
  coach(input: { char: string; text: string }): Promise<Packet>;
}
export function createHttpService(options: { childId: string; lessonId: string; hasEssayToday?: boolean; fetcher?: typeof fetch }): LearningService {
  let sessionId: string | undefined;
  const fetcher = options.fetcher ?? fetch;
  async function request(path: string, body: unknown): Promise<Packet> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await fetcher(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
      if (!response.ok) throw new Error("request_unavailable");
      const packet = PacketSchema.parse(await response.json());
      if (packet.sessionId) sessionId = packet.sessionId;
      return packet;
    } finally { clearTimeout(timeout); }
  }
  function path(suffix: string) {
    if (!sessionId) throw new Error("missing_session");
    return `/api/session/${encodeURIComponent(sessionId)}/${suffix}`;
  }
  return {
    start: () => request("/api/session", { childId: options.childId, lessonId: options.lessonId, hasEssayToday: options.hasEssayToday ?? false }),
    event: event => request(path("event"), SessionEventSchema.parse(event)),
    homework: input => request(path("homework"), input),
    coach: input => request(path("coach"), input),
  };
}

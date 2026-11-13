import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { LlmClient, LlmRequest, LlmResult } from "../../src/contracts/llm";
import { getPrisma, disconnectPrisma, setDatabaseUrlForTests } from "../../src/db/client";
import { upsertChild } from "../../src/db/child";
import { upsertLesson } from "../../src/db/lesson";
import { upsertCharCard } from "../../src/db/charCard";
import { testChild, testCard } from "../../src/db/test-fixtures";
import { createServerDeps, type RuntimeDeps } from "../../src/server/deps";
import { createHttpHandlers } from "../../src/server/http";
import { SessionPacketSchema, type SessionPacket } from "../../src/contracts/session";
import { decodeScreen } from "../../src/ui/model";
export const chars = ["山", "水", "日", "月"];
export const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
export const photo2 = "data:image/png;base64,b3RoZXItZmljdGlvbmFsLXBob3Rv";
export async function database() {
  const dir = mkdtempSync(join(tmpdir(), "yuwen-c7-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync(join(process.cwd(), "node_modules/.bin/prisma"), ["migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  setDatabaseUrlForTests(url);
  return { url, async cleanup() { await disconnectPrisma(); rmSync(dir, { recursive: true, force: true }); } };
}
export async function seed() {
  for (const table of ["sessionCommand", "coachRuntime", "turn", "incident", "sessionRuntime", "session", "childChar", "charCard", "lesson", "child"] as const) await (getPrisma()[table] as { deleteMany(): Promise<unknown> }).deleteMany();
  await upsertChild(testChild);
  await upsertLesson({ id: "c7-lesson", grade: 3, term: "upper", lessonNo: 1, title: "编造课文", recognizeChars: ["山"], writeChars: ["水", "日", "月"], words: [], status: "approved" });
  for (const char of chars) await upsertCharCard({ ...testCard, id: `card-${char}`, char, words: [`${char}字`], explain: `先看看“${char}”的字形。`, dictationContext: `${char}，字卡上的${char}` });
}
export function model() {
  const calls: LlmRequest<unknown>[] = [];
  let handler: ((request: LlmRequest<unknown>) => unknown | Promise<unknown>) | undefined;
  const llm: LlmClient = { async call<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    calls.push(request);
    const data = handler ? await handler(request) : successOutput(request);
    if (data === "fail") return { ok: false, error: "provider_error", model: `fake-${request.agent}`, latencyMs: 1 };
    return { ok: true, data: request.schema.parse(data), model: `fake-${request.agent}`, inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, latencyMs: 1 };
  } };
  return { llm, calls, setHandler(next?: typeof handler) { handler = next; } };
}
export function successOutput(request: LlmRequest<unknown>): unknown {
  if (request.agent === "vision_homework") return { unsure: false, items: [{ text: "读一读自编课文的生字", kind: "recognize", supported: true }] };
  if (request.agent === "vision_dictation") { const expected = JSON.parse(request.stablePrefix ?? "{}").expectedWords as string[]; return { unreadable: false, marks: expected.map(word => ({ word, charIndex: 0, expected: word, box: null, suspicious: false, confidence: 1 })) }; }
  if (request.agent === "guard") return { verdict: "pass", reason: "none" };
  const input = JSON.parse(request.user) as { step: string; history: { role: string; text: string }[] };
  const hasAnswer = input.history.some(item => item.role === "child");
  return { say: "看看字卡。", ask: input.step === "explain" ? null : input.step === "make_word" ? "你能组一个书上的词吗？" : "你能说一句话吗？", next: hasAnswer ? "step_done" : "wait_child", usedCardFields: ["explain"] };
}
export function harness(deps?: RuntimeDeps) {
  const fake = model();
  let now = new Date("2026-11-14T02:00:00Z");
  deps ??= createServerDeps({ llm: fake.llm, now: () => now });
  let handlers = createHttpHandlers(deps);
  let sequence = 0;
  const instance = randomUUID();
  const key = () => `c7-${instance}-${String(++sequence).padStart(8, "0")}`;
  async function request(kind: "start" | "event" | "homework" | "coach", body: unknown, id?: string, requestKey = key()) {
    return handlers.post(kind, new Request(`http://localhost/api/session/${id ?? ""}/${kind}`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify(body) }), id);
  }
  async function post(kind: Parameters<typeof request>[0], body: unknown, id?: string, requestKey?: string): Promise<SessionPacket> {
    const response = await request(kind, body, id, requestKey);
    const raw = await response.json();
    if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${JSON.stringify(raw)}`);
    const packet = SessionPacketSchema.parse(raw); decodeScreen(packet); return packet;
  }
  const start = () => post("start", { childId: testChild.id, lessonId: "c7-lesson", hasEssayToday: false });
  const event = (id: string, body: unknown, requestKey?: string) => post("event", body, id, requestKey);
  async function recognize(id: string) { for (const char of chars) await event(id, { type: "recognize_result", char, result: "correct", mode: "self_report" }); }
  async function enterUnderstand() { const started = await start(); const id = started.sessionId!; const hw = await post("homework", { spokenText: "读生字" }, id); await event(id, { type: "homework_confirmed", items: (hw.effects[0]!.data as { items: unknown[] }).items }); await recognize(id); return id; }
  async function coachAll(id: string) { for (const char of chars) { await post("coach", { char, text: "" }, id); await post("coach", { char, text: `${char}字` }, id); await post("coach", { char, text: "我说了自己想到的一句话。" }, id); } }
  return { fake, deps, handlers: () => handlers, key, request, post, start, event, recognize, enterUnderstand, coachAll, setNow(value: Date) { now = value; }, restart(next = createServerDeps({ llm: deps!.llm, now: deps!.now, modelOptions: deps!.modelOptions })) { deps = next; handlers = createHttpHandlers(next); return next; } };
}

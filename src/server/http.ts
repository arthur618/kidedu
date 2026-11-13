import { z } from "zod";
import { SessionEventSchema } from "../contracts/orchestrator";
import { SESSION_REQUEST_ID_HEADER, SessionRequestIdSchema, SessionPacketSchema } from "../contracts/session";
import type { RuntimeDeps } from "./deps";
import { ChildNotFoundError, LessonNotFoundError, SessionNotFoundError } from "./session";
import { createSessionService, CoachConflict, RequestConflict, type CommandKind } from "./runtime";
const startSchema = z.object({ childId: z.string().min(1), lessonId: z.string().min(1), hasEssayToday: z.boolean() }).strict();
const homeworkSchema = z.object({ imageDataUrl: z.string().optional(), spokenText: z.string().trim().min(1).max(10000).optional() }).strict().refine(body => body.imageDataUrl || body.spokenText);
const coachSchema = z.object({ char: z.string().length(1), text: z.string().max(10000) }).strict();
const schemas = { start: startSchema, event: SessionEventSchema, homework: homeworkSchema, coach: coachSchema };
export function validPhoto(value: string): boolean {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) return false;
  return Buffer.from(match[2], "base64").byteLength <= 2 * 1024 * 1024;
}
function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
function errorResponse(error: unknown): Response {
  if (error instanceof SessionNotFoundError || error instanceof ChildNotFoundError || error instanceof LessonNotFoundError) return json({ error: error instanceof SessionNotFoundError ? "没有找到这次学习。" : error instanceof ChildNotFoundError ? "没有找到这个孩子。" : "没有找到这一课。" }, 404);
  if (error instanceof CoachConflict || error instanceof RequestConflict) return json({ error: error.message }, 409);
  // 不把异常对象或请求写日志，避免上游错误携带照片。
  return json({ error: "今天先到这里，请稍后再试。" }, 500);
}
export function createHttpHandlers(deps: RuntimeDeps) {
  const service = createSessionService(deps);
  return {
    async post(kind: CommandKind, request: Request, sessionId?: string): Promise<Response> {
      let raw: unknown;
      try { raw = await request.json(); } catch { return json({ error: "请求内容格式不对，请再试一次。" }, 400); }
      const parsed = schemas[kind].safeParse(raw);
      if (!parsed.success) return json({ error: "请求内容格式不对，请再试一次。" }, 400);
      const key = SessionRequestIdSchema.safeParse(request.headers.get(SESSION_REQUEST_ID_HEADER));
      if (!key.success) return json({ error: "这次操作的标识不完整，请再试一次。" }, 400);
      const body = parsed.data;
      const photo = "imageDataUrl" in body ? body.imageDataUrl : "imageUrl" in body ? body.imageUrl : undefined;
      if (typeof photo === "string" && !validPhoto(photo)) return json({ error: "请选一张不超过2MB的 JPG 或 PNG 图片。" }, 400);
      try { return json(SessionPacketSchema.parse(await service.post(kind, kind === "start" ? (body as z.infer<typeof startSchema>).childId : sessionId!, key.data, body))); }
      catch (error) { return errorResponse(error); }
    },
    async get(sessionId: string): Promise<Response> {
      try { const result = await service.get(sessionId); SessionPacketSchema.parse(result); return json(result); } catch (error) { return errorResponse(error); }
    },
  };
}
const handlers = new WeakMap<RuntimeDeps, ReturnType<typeof createHttpHandlers>>();
export function httpHandlers(deps: RuntimeDeps) {
  let value = handlers.get(deps);
  if (!value) { value = createHttpHandlers(deps); handlers.set(deps, value); }
  return value;
}

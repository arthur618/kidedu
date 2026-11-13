import { z } from "zod";
import { serverDeps } from "../../../src/server/deps";
import { ChildNotFoundError, LessonNotFoundError, startSession } from "../../../src/server/session";

const BodySchema = z
  .object({
    childId: z.string().min(1),
    lessonId: z.string().min(1),
    hasEssayToday: z.boolean(),
  })
  .strict();

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** 开始一次学习。 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "请求内容格式不对，请再试一次。" }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "请提供 childId、lessonId 和 hasEssayToday。" }, 400);
  }

  try {
    const result = await startSession(serverDeps, parsed.data);
    return json(result);
  } catch (error) {
    if (error instanceof ChildNotFoundError) {
      return json({ error: "没有找到这个孩子。" }, 404);
    }
    if (error instanceof LessonNotFoundError) {
      return json({ error: "没有找到这一课。" }, 404);
    }
    console.error("创建会话失败：", error);
    return json({ error: "今天先到这里，请稍后再试。" }, 500);
  }
}

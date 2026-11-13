import { SessionEventSchema } from "../../../../../src/contracts/orchestrator";
import { handleEvent, SessionNotFoundError } from "../../../../../src/server/session";
import { serverDeps } from "../../../../../src/server/deps";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** 向一次学习发送事件。 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "收到的事件格式不对，请再试一次。" }, 400);
  }

  const parsed = SessionEventSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "收到的事件格式不对，请再试一次。" }, 400);
  }

  try {
    const result = await handleEvent(serverDeps, id, parsed.data);
    return json(result);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return json({ error: "没有找到这次学习。" }, 404);
    }
    console.error("处理会话事件失败：", error);
    return json({ error: "今天先到这里，请稍后再试。" }, 500);
  }
}

import { serverDeps } from "../../../../src/server/deps";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** 读取一次学习的当前状态、上下文和作业清单。 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  try {
    const [session, runtime] = await Promise.all([
      serverDeps.getSession(id),
      serverDeps.getSessionRuntime(id),
    ]);
    if (!session || !runtime) {
      return json({ error: "没有找到这次学习。" }, 404);
    }
    return json({
      sessionId: session.id,
      state: runtime.state,
      context: runtime.context,
      homework: session.homework,
    });
  } catch (error) {
    console.error("读取会话失败：", error);
    return json({ error: "今天先到这里，请稍后再试。" }, 500);
  }
}

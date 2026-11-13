import type { SessionContext, SessionState } from "../contracts/orchestrator";
import { getPrisma } from "./client";
import { encodeJson } from "./codec";
import { ContractDataError } from "./errors";

const Table = "SessionRuntime";

/**
 * 会话的运行时状态。契约里的 Session 表只放孩子、时间和作业清单，
 * 状态机状态和上下文放在这张内部表里，用 JSON 字符串存。
 */
export interface SessionRuntime {
  sessionId: string;
  state: SessionState;
  context: SessionContext;
}

export async function getSessionRuntime(sessionId: string): Promise<SessionRuntime | null> {
  const row = await getPrisma().sessionRuntime.findUnique({ where: { sessionId } });
  if (!row) return null;
  let context: unknown;
  try {
    context = JSON.parse(row.context);
  } catch {
    throw new ContractDataError(Table, sessionId, "字段 context 不是合法的 JSON");
  }
  return {
    sessionId: row.sessionId,
    state: row.state as SessionState,
    context: context as SessionContext,
  };
}

export async function saveSessionRuntime(runtime: SessionRuntime): Promise<SessionRuntime> {
  const data = {
    sessionId: runtime.sessionId,
    state: runtime.state,
    context: encodeJson(runtime.context),
  };
  const row = await getPrisma().sessionRuntime.upsert({
    where: { sessionId: data.sessionId },
    create: data,
    update: data,
  });
  return {
    sessionId: row.sessionId,
    state: row.state as SessionState,
    context: JSON.parse(row.context) as SessionContext,
  };
}

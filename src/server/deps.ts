import type { AdvanceChar, PlanDay, Reduce } from "../contracts/orchestrator";
import { getChild } from "../db/child";
import { getChildChar, listChildChars, upsertChildChar } from "../db/childChar";
import { getLesson } from "../db/lesson";
import { createSession, getSession, updateSession } from "../db/session";
import { getSessionRuntime, saveSessionRuntime } from "../db/sessionRuntime";
import type { ServerDeps } from "./session";

/**
 * 任务 C1 合并前，编排器的三个函数是占位实现，调用时会抛出明确的错误。
 * C1 合并后，把下面三个常量改成从 "@/orchestrator" 导入即可：
 *
 *   import { reduce, advanceChar, planDay } from "@/orchestrator";
 */
function notMerged(name: string): never {
  throw new Error(`${name} 尚未合并（任务 C1）。`);
}

export const reduce: Reduce = () => notMerged("reduce");
export const advanceChar: AdvanceChar = () => notMerged("advanceChar");
export const planDay: PlanDay = () => notMerged("planDay");

/** 接口层使用的真实依赖。测试可以替换其中的 reduce / advanceChar / planDay。 */
export const serverDeps: ServerDeps = {
  reduce,
  advanceChar,
  planDay,
  now: () => new Date(),
  getChild,
  getLesson,
  listChildChars,
  getChildChar,
  upsertChildChar,
  createSession,
  getSession,
  updateSession,
  getSessionRuntime,
  saveSessionRuntime,
};

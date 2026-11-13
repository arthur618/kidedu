import type {
  AdvanceChar,
  Effect,
  PlanDay,
  Reduce,
  SessionContext,
  SessionEvent,
  SessionState,
} from "../contracts/orchestrator";
import type { CharKind, CharStage, ChildChar, Session } from "../contracts/schemas";
import type * as childDb from "../db/child";
import type * as childCharDb from "../db/childChar";
import type * as lessonDb from "../db/lesson";
import type * as sessionDb from "../db/session";
import type * as runtimeDb from "../db/sessionRuntime";

/** 会话相关接口需要的依赖。真实现从 src/server/deps.ts 取，测试里可以换假的。 */
export interface SessionDeps {
  reduce: Reduce;
  advanceChar: AdvanceChar;
  now: () => Date;
  getChild: typeof childDb.getChild;
  getLesson: typeof lessonDb.getLesson;
  listChildChars: typeof childCharDb.listChildChars;
  getChildChar: typeof childCharDb.getChildChar;
  upsertChildChar: typeof childCharDb.upsertChildChar;
  createSession: typeof sessionDb.createSession;
  getSession: typeof sessionDb.getSession;
  updateSession: typeof sessionDb.updateSession;
  getSessionRuntime: typeof runtimeDb.getSessionRuntime;
  saveSessionRuntime: typeof runtimeDb.saveSessionRuntime;
}

export interface ServerDeps extends SessionDeps {
  planDay: PlanDay;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`没有找到这次学习（${sessionId}）。`);
    this.name = "SessionNotFoundError";
  }
}

export class ChildNotFoundError extends Error {
  constructor(childId: string) {
    super(`没有找到这个孩子（${childId}）。`);
    this.name = "ChildNotFoundError";
  }
}

export class LessonNotFoundError extends Error {
  constructor(lessonId: string) {
    super(`没有找到这一课（${lessonId}）。`);
    this.name = "LessonNotFoundError";
  }
}

export class ChildCharNotFoundError extends Error {
  constructor(childId: string, char: string) {
    super(`没有找到孩子 ${childId} 的字 ${char} 的学习记录。`);
    this.name = "ChildCharNotFoundError";
  }
}

/** 取本地日历上的日期，格式 2026-11-13。 */
export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lessonChars(lesson: { recognizeChars: string[]; writeChars: string[] }): { char: string; kind: CharKind }[] {
  const byChar = new Map<string, CharKind>();
  for (const char of lesson.recognizeChars) byChar.set(char, "recognize_only");
  for (const char of lesson.writeChars) byChar.set(char, "write");
  return [...byChar].map(([char, kind]) => ({ char, kind }));
}

function initialChildChar(childId: string, char: string, kind: CharKind): ChildChar {
  return {
    childId,
    char,
    kind,
    stage: "recognize",
    correctStreak: 0,
    nextReviewOn: null,
    wrongCount: 0,
    lastSeenOn: null,
  };
}

function contextMaps(all: ChildChar[]): {
  stageOf: Record<string, CharStage>;
  kindOf: Record<string, CharKind>;
} {
  const stageOf: Record<string, CharStage> = {};
  const kindOf: Record<string, CharKind> = {};
  for (const cc of all) {
    stageOf[cc.char] = cc.stage;
    kindOf[cc.char] = cc.kind;
  }
  return { stageOf, kindOf };
}

/**
 * 处理一个会话事件：
 * 1. 读会话和运行时上下文；2. 调 reduce；3. 执行持久化效果；
 * 4. 原样返回 call_agent / play_audio / show；5. 保存新的状态和上下文。
 */
export async function handleEvent(
  deps: SessionDeps,
  sessionId: string,
  event: SessionEvent,
): Promise<{ state: SessionState; effects: Effect[] }> {
  const session = await deps.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);

  const runtime = await deps.getSessionRuntime(sessionId);
  if (!runtime) throw new SessionNotFoundError(sessionId);

  const transition = deps.reduce(runtime.state, runtime.context, event);
  const nowIso = deps.now().toISOString();
  const passthrough: Effect[] = [];
  let saveSession = false;
  let endSession = false;

  for (const effect of transition.effects) {
    switch (effect.type) {
      case "persist_char": {
        const current = await deps.getChildChar(session.childId, effect.char);
        if (!current) throw new ChildCharNotFoundError(session.childId, effect.char);
        const advanced = deps.advanceChar(current, effect.result, transition.ctx.today);
        await deps.upsertChildChar(advanced);
        break;
      }
      case "persist_session":
        saveSession = true;
        break;
      case "end_session":
        saveSession = true;
        endSession = true;
        break;
      case "call_agent":
      case "play_audio":
      case "show":
        passthrough.push(effect);
        break;
    }
  }

  if (saveSession) {
    const updated: Session = {
      ...session,
      homework: transition.ctx.homework,
      endedAt: endSession ? (session.endedAt ?? nowIso) : session.endedAt,
    };
    await deps.updateSession(updated);
  }

  await deps.saveSessionRuntime({
    sessionId: transition.ctx.sessionId || sessionId,
    state: transition.state,
    context: transition.ctx,
  });

  return { state: transition.state, effects: passthrough };
}

export interface StartSessionInput {
  childId: string;
  lessonId: string;
  hasEssayToday: boolean;
}

/**
 * 新建会话：按当天计划建 ChildChar，保存初始上下文，然后发送 start 事件。
 * planDay 由外部传入（任务 C1 的实现）。
 */
export async function startSession(
  deps: ServerDeps,
  input: StartSessionInput,
): Promise<{ sessionId: string; state: SessionState; effects: Effect[] }> {
  const child = await deps.getChild(input.childId);
  if (!child) throw new ChildNotFoundError(input.childId);

  const lesson = await deps.getLesson(input.lessonId);
  if (!lesson) throw new LessonNotFoundError(input.lessonId);

  const now = deps.now();
  const today = localDate(now);
  const chars = lessonChars(lesson);
  const existing = await deps.listChildChars(child.id);
  const plan = deps.planDay(existing, chars, today);
  const session = await deps.createSession(child.id, now.toISOString());

  const known = new Set(existing.map((cc) => cc.char));
  const kindFor = new Map(chars.map((item) => [item.char, item.kind]));
  for (const char of plan.newChars) {
    if (!known.has(char)) {
      await deps.upsertChildChar(initialChildChar(child.id, char, kindFor.get(char) ?? "recognize_only"));
      known.add(char);
    }
  }

  const all = await deps.listChildChars(child.id);
  const { stageOf, kindOf } = contextMaps(all);
  const context: SessionContext = {
    sessionId: session.id,
    childId: child.id,
    today,
    plan,
    queue: [],
    stageOf,
    kindOf,
    homework: [],
    elapsedMinutes: 0,
    limitMinutes: child.dailyLimitMinutes,
  };
  await deps.saveSessionRuntime({ sessionId: session.id, state: "idle", context });

  const result = await handleEvent(deps, session.id, {
    type: "start",
    hasEssayToday: input.hasEssayToday,
  });
  return { sessionId: session.id, ...result };
}

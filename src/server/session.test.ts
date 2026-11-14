import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdvanceChar,
  CharResult,
  Effect,
  Reduce,
  SessionContext,
} from "../contracts/orchestrator";
import type { ChildChar } from "../contracts/schemas";
import { getChildChar, upsertChildChar } from "../db/childChar";
import { getSession, createSession, updateSession } from "../db/session";
import { getSessionRuntime, saveSessionRuntime } from "../db/sessionRuntime";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { testChild, testChildChar, testHomeworkItem } from "../db/test-fixtures";
import { serverDeps } from "./deps";
import { handleEvent, SessionNotFoundError, type SessionDeps } from "./session";

let db: TestDatabase | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  await upsertChildChar(testChildChar);
});

const today = "2026-11-13";
const now = () => new Date("2026-11-13T02:03:04.000Z");

async function makeSession(
  overrides: Partial<SessionContext> = {},
): Promise<{ sessionId: string; ctx: SessionContext }> {
  const session = await createSession(testChild.id, "2026-11-13T02:00:00.000Z");
  const ctx: SessionContext = {
    sessionId: session.id,
    childId: testChild.id,
    today,
    plan: { newChars: ["山"], reviewChars: [], carryOverChars: [] },
    hasEssayToday: false,
    queue: ["山"],
    understandQueue: [],
    writeQueue: [],
    understandAttempts: {},
    stageOf: { 山: "recognize" },
    kindOf: { 山: "write" },
    homework: [testHomeworkItem],
    elapsedMinutes: 0,
    limitMinutes: testChild.dailyLimitMinutes,
    ...overrides,
  };
  await saveSessionRuntime({ sessionId: session.id, state: "recognize", context: ctx });
  return { sessionId: session.id, ctx };
}

function depsWith(reduce: Reduce, advanceChar: AdvanceChar): SessionDeps {
  const { planDay: _planDay, initContext: _initContext, ...base } = serverDeps;
  return { ...base, reduce, advanceChar, now };
}

describe("handleEvent 执行持久化效果", () => {
  it("persist_char 调一次 advanceChar 并把结果存进 ChildChar", async () => {
    const { sessionId, ctx } = await makeSession();

    const advanced: ChildChar = {
      ...testChildChar,
      stage: "understand",
      correctStreak: 1,
      lastSeenOn: today,
    };
    const advanceChar = vi.fn((cc: ChildChar, result: string, date: string) => {
      expect(cc).toEqual(testChildChar);
      expect(result).toBe("correct");
      expect(date).toBe(today);
      return advanced;
    });
    const reduce = vi.fn(() => ({
      state: "understand" as const,
      ctx: { ...ctx, queue: [] },
      effects: [{ type: "persist_char" as const, char: "山", result: "correct" as const }],
    }));

    const result = await handleEvent(depsWith(reduce, advanceChar), sessionId, {
      type: "understand_done",
      char: "山",
      result: "correct",
    });

    expect(advanceChar).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("understand");
    await expect(getChildChar(testChild.id, "山")).resolves.toEqual(advanced);
  });
});

describe("handleEvent 原样返回不处理的效果", () => {
  it("call_agent、show、play_audio 不丢、不改顺序", async () => {
    const { sessionId, ctx } = await makeSession();
    const effects: Effect[] = [
      { type: "show", screen: "reading", data: { tip: "请读一读" } },
      { type: "call_agent", agent: "reader", payload: { step: "ask" } },
      { type: "play_audio", chars: ["山", "水"] },
    ];
    const reduce: Reduce = () => ({ state: "reading", ctx, effects });

    const result = await handleEvent(depsWith(reduce, serverDeps.advanceChar), sessionId, {
      type: "reading_choice",
      accept: true,
    });

    expect(result.effects).toEqual(effects);
    expect(result.state).toBe("reading");
  });
});

describe("handleEvent 处理会话结束", () => {
  it("persist_session 和 end_session 把作业清单和结束时间写回 Session", async () => {
    const { sessionId, ctx } = await makeSession();
    const homework = [{ ...testHomeworkItem, done: true }];
    const effects: Effect[] = [{ type: "persist_session" }, { type: "end_session" }];
    const reduce: Reduce = () => ({ state: "ended", ctx: { ...ctx, homework }, effects });

    const result = await handleEvent(depsWith(reduce, serverDeps.advanceChar), sessionId, { type: "quit" });

    expect(result.state).toBe("ended");
    const saved = await getSession(sessionId);
    expect(saved?.homework).toEqual(homework);
    expect(saved?.endedAt).toBe("2026-11-13T02:03:04.000Z");
  });
});

describe("上下文原样往返（验收 13）", () => {
  it("reduce 返回的额外字段在下一次事件里深度相等地传回", async () => {
    const { sessionId, ctx } = await makeSession();
    const ctxWithExtra = {
      ...ctx,
      extraProbe: { nested: ["编造的额外字段", 1, true] },
    };
    let secondCtx: SessionContext | undefined;

    const firstReduce: Reduce = () => ({ state: "recognize", ctx: ctxWithExtra, effects: [] });
    await handleEvent(depsWith(firstReduce, serverDeps.advanceChar), sessionId, {
      type: "homework_captured",
    });

    const secondReduce: Reduce = (_state, received) => {
      secondCtx = received;
      return { state: "recognize", ctx: received, effects: [] };
    };
    await handleEvent(depsWith(secondReduce, serverDeps.advanceChar), sessionId, {
      type: "homework_captured",
    });

    expect(secondCtx).toEqual(ctxWithExtra);
  });
});

describe("persist_char 遇到新字（验收 14）", () => {
  it("数据库里没有的字按 kindOf 造初始记录，再 advance 并保存", async () => {
    const { sessionId, ctx } = await makeSession({
      plan: { newChars: ["火"], reviewChars: [], carryOverChars: [] },
      queue: ["火"],
      stageOf: { 火: "recognize" },
      kindOf: { 火: "recognize_only" },
    });

    const advanced: ChildChar = {
      childId: testChild.id,
      char: "火",
      kind: "recognize_only",
      stage: "understand",
      correctStreak: 1,
      nextReviewOn: null,
      wrongCount: 0,
      lastSeenOn: today,
    };
    const advanceChar = vi.fn((cc: ChildChar) => {
      expect(cc).toEqual({
        childId: testChild.id,
        char: "火",
        kind: "recognize_only",
        stage: "recognize",
        correctStreak: 0,
        nextReviewOn: null,
        wrongCount: 0,
        lastSeenOn: null,
      });
      return advanced;
    });
    const reduce: Reduce = () => ({
      state: "understand",
      ctx: { ...ctx, queue: [] },
      effects: [{ type: "persist_char", char: "火", result: "correct" }],
    });

    await expect(getChildChar(testChild.id, "火")).resolves.toBeNull();
    await handleEvent(depsWith(reduce, advanceChar), sessionId, {
      type: "understand_done",
      char: "火",
      result: "correct",
    });

    expect(advanceChar).toHaveBeenCalledTimes(1);
    await expect(getChildChar(testChild.id, "火")).resolves.toEqual(advanced);
  });
});

describe("同一事件原子提交（验收 16）", () => {
  it("多条 persist_char 后 SessionRuntime 写入失败时全部回滚，重试只累计一次", async () => {
    const { sessionId, ctx } = await makeSession({
      plan: { newChars: ["山", "田"], reviewChars: [], carryOverChars: [] },
      queue: ["山", "田"],
      stageOf: { 山: "recognize", 田: "recognize" },
      kindOf: { 山: "write", 田: "write" },
    });
    const homework = [{ ...testHomeworkItem, done: true }];
    const before = await getSession(sessionId);
    if (!before) throw new Error("测试会话没建出来");
    await updateSession({ ...before, homework: [testHomeworkItem] });
    const advancedCtx = { ...ctx, homework, queue: [], stateNote: "编造的进度" };
    const reduce: Reduce = () => ({
      state: "recognize",
      ctx: advancedCtx,
      effects: [
        { type: "persist_char", char: "山", result: "correct" },
        { type: "persist_char", char: "田", result: "correct" },
        { type: "persist_session" },
        { type: "end_session" },
      ],
    });
    const advanceChar: AdvanceChar = (cc: ChildChar, result: CharResult) => ({
      ...cc,
      correctStreak: cc.correctStreak + (result === "correct" ? 1 : 0),
      lastSeenOn: today,
    });
    const base = depsWith(reduce, advanceChar);

    const failing: SessionDeps = {
      ...base,
      saveSessionRuntime: async () => {
        throw new Error("注入的 SessionRuntime 写入失败");
      },
    };

    await expect(handleEvent(failing, sessionId, { type: "understand_done", char: "山", result: "correct" })).rejects.toThrow(
      /注入的 SessionRuntime 写入失败/,
    );

    await expect(getChildChar(testChild.id, "山")).resolves.toEqual(testChildChar);
    await expect(getChildChar(testChild.id, "田")).resolves.toBeNull();
    const failedSession = await getSession(sessionId);
    expect(failedSession?.homework).toEqual([testHomeworkItem]);
    expect(failedSession?.endedAt).toBeNull();
    const failedRuntime = await getSessionRuntime(sessionId);
    expect(failedRuntime?.state).toBe("recognize");
    expect(failedRuntime?.context).toEqual(ctx);

    await handleEvent(base, sessionId, { type: "understand_done", char: "山", result: "correct" });

    const shan = await getChildChar(testChild.id, "山");
    const tian = await getChildChar(testChild.id, "田");
    expect(shan?.correctStreak).toBe(1);
    expect(tian?.correctStreak).toBe(1);
    const savedSession = await getSession(sessionId);
    expect(savedSession?.homework).toEqual(homework);
    expect(savedSession?.endedAt).toBe("2026-11-13T02:03:04.000Z");
    const savedRuntime = await getSessionRuntime(sessionId);
    expect(savedRuntime?.context).toEqual(advancedCtx);
  });
});

describe("不存在的会话", () => {
  it("handleEvent 抛 SessionNotFoundError", async () => {
    const reduce: Reduce = () => {
      throw new Error("不应该调用 reduce");
    };
    await expect(
      handleEvent(depsWith(reduce, serverDeps.advanceChar), "session-not-exist", { type: "quit" }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});

describe("C11A 实际持久化observer", () => {
  it("原effectIndex、真实DB before与upsert返回after，不用过时ctx推断", async () => {
    const { sessionId, ctx } = await makeSession({ stageOf: { 山: "recognize" } });
    await upsertChildChar({ ...testChildChar, stage: "review_2d" });
    const deps = depsWith(() => ({ state: "understand", ctx, effects: [{ type: "show", screen: "understand" }, { type: "persist_char", char: "山", result: "correct" }] }), cc => ({ ...cc, stage: "review_7d" }));
    deps.upsertChildChar = value => upsertChildChar({ ...value, stage: "mastered" });
    const observe = vi.fn(async () => undefined);
    await handleEvent(deps, sessionId, { type: "understand_done", char: "山", result: "correct" }, observe);
    expect(observe).toHaveBeenCalledWith({ before: { ...testChildChar, stage: "review_2d" }, after: { ...testChildChar, stage: "mastered" }, result: "correct", effectIndex: 1, nowIso: now().toISOString() });
    expect((await getChildChar(testChild.id, "山"))!.stage).toBe("mastered");
  });
  it("observer失败使真实ChildChar、SessionRuntime与结束保存整体回滚", async () => {
    const { sessionId, ctx } = await makeSession(); const before = await getSessionRuntime(sessionId);
    const deps = depsWith(() => ({ state: "ended", ctx: { ...ctx, homework: [] }, effects: [{ type: "persist_char", char: "山", result: "wrong" }, { type: "end_session" }] }), cc => ({ ...cc, wrongCount: cc.wrongCount + 1 }));
    await expect(handleEvent(deps, sessionId, { type: "quit" }, async () => { throw new Error("模拟observer失败"); })).rejects.toThrow("模拟observer失败");
    expect(await getChildChar(testChild.id, "山")).toEqual(testChildChar); expect(await getSessionRuntime(sessionId)).toEqual(before); expect((await getSession(sessionId))!.endedAt).toBeNull();
  });
});

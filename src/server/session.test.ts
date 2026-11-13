import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdvanceChar, Effect, Reduce, SessionContext } from "../contracts/orchestrator";
import type { ChildChar } from "../contracts/schemas";
import { getChildChar, upsertChildChar } from "../db/childChar";
import { getSession, createSession } from "../db/session";
import { saveSessionRuntime } from "../db/sessionRuntime";
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

async function makeSession(overrides: Partial<SessionContext> = {}): Promise<{ sessionId: string; ctx: SessionContext }> {
  const session = await createSession(testChild.id, "2026-11-13T02:00:00.000Z");
  const ctx: SessionContext = {
    sessionId: session.id,
    childId: testChild.id,
    today,
    plan: { newChars: ["山"], reviewChars: [] },
    queue: ["山"],
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
  const { planDay: _planDay, ...base } = serverDeps;
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

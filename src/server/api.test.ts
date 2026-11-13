import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as createSessionRoute } from "../../app/api/session/route";
import { GET as getSessionRoute } from "../../app/api/session/[id]/route";
import { POST as postEventRoute } from "../../app/api/session/[id]/event/route";
import type { InitContext, SessionContext } from "../contracts/orchestrator";
import { upsertChild } from "../db/child";
import { getPrisma } from "../db/client";
import { upsertChildChar } from "../db/childChar";
import { upsertLesson } from "../db/lesson";
import { createSession } from "../db/session";
import { saveSessionRuntime } from "../db/sessionRuntime";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { testChild, testChildChar, testHomeworkItem, testLesson } from "../db/test-fixtures";
import { serverDeps } from "./deps";

let db: TestDatabase | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
  await upsertChild(testChild);
  await upsertLesson(testLesson);
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const base = "http://localhost/api/session";

function makeContext(sessionId: string, overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId,
    childId: testChild.id,
    today: "2026-11-13",
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
}

async function makeRuntime(overrides: Partial<SessionContext> = {}) {
  const session = await createSession(testChild.id, "2026-11-13T02:00:00.000Z");
  const context = makeContext(session.id, overrides);
  await saveSessionRuntime({ sessionId: session.id, state: "recognize", context });
  return { session, context };
}

function contextFromInit(input: Parameters<InitContext>[0]): SessionContext {
  return {
    sessionId: input.sessionId,
    childId: input.childId,
    today: input.today,
    plan: input.plan,
    hasEssayToday: false,
    queue: [],
    understandQueue: [],
    writeQueue: [],
    understandAttempts: {},
    stageOf: input.stageOf,
    kindOf: input.kindOf,
    homework: [],
    elapsedMinutes: 0,
    limitMinutes: input.limitMinutes,
  };
}

describe("工单 12：事件校验复用契约 SessionEventSchema", () => {
  it("接受 wrap_up_done", async () => {
    const { session, context } = await makeRuntime();
    vi.spyOn(serverDeps, "reduce").mockReturnValue({
      state: "ended",
      ctx: context,
      effects: [{ type: "show", screen: "ended" }],
    });

    const response = await postEventRoute(
      postJson(`${base}/${session.id}/event`, { type: "wrap_up_done" }),
      params(session.id),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: string };
    expect(body.state).toBe("ended");
  });

  it("未知 type 返回 400，且不调用 reduce", async () => {
    const reduceSpy = vi.spyOn(serverDeps, "reduce");
    const response = await postEventRoute(
      postJson(`${base}/session-1/event`, { type: "不存在" }),
      params("session-1"),
    );

    expect(response.status).toBe(400);
    expect(reduceSpy).not.toHaveBeenCalled();
  });

  it("空字返回 400，且不调用 reduce", async () => {
    const reduceSpy = vi.spyOn(serverDeps, "reduce");
    const response = await postEventRoute(
      postJson(`${base}/session-1/event`, {
        type: "recognize_result",
        char: "",
        result: "correct",
        mode: "self_report",
      }),
      params("session-1"),
    );

    expect(response.status).toBe(400);
    expect(reduceSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/session/[id]/event", () => {
  it("不存在的会话返回 404 和一句中文说明", async () => {
    const response = await postEventRoute(
      postJson(`${base}/session-not-exist/event`, { type: "quit" }),
      params("session-not-exist"),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/没有找到/);
  });

  it("事件结构不对返回 400，且不调用 reduce", async () => {
    const reduceSpy = vi.spyOn(serverDeps, "reduce");

    const response = await postEventRoute(
      postJson(`${base}/session-1/event`, { type: "start" }),
      params("session-1"),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/格式不对/);
    expect(reduceSpy).not.toHaveBeenCalled();
  });

  it("请求体不是 JSON 也返回 400，且不调用 reduce", async () => {
    const reduceSpy = vi.spyOn(serverDeps, "reduce");
    const request = new Request(`${base}/session-1/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await postEventRoute(request, params("session-1"));

    expect(response.status).toBe(400);
    expect(reduceSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/session/[id]", () => {
  it("不存在的会话返回 404", async () => {
    const response = await getSessionRoute(new Request(`${base}/session-none`), params("session-none"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/没有找到/);
  });

  it("返回当前状态、上下文和作业清单", async () => {
    const { session, context } = await makeRuntime();

    const response = await getSessionRoute(new Request(`${base}/${session.id}`), params(session.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sessionId: string;
      state: string;
      context: SessionContext;
      homework: unknown;
    };
    expect(body.sessionId).toBe(session.id);
    expect(body.state).toBe("recognize");
    expect(body.context).toEqual(context);
    expect(body.homework).toEqual(context.homework);
  });

  it("事件更新清单和完成状态后重新 GET，顶层 homework 与 ctx 一致且进度不丢", async () => {
    const { session, context } = await makeRuntime({ homework: [{ ...testHomeworkItem, done: false }] });
    const updatedHomework = [{ ...testHomeworkItem, done: true, text: "读一读第二课的生字（已确认）" }];
    const updatedContext: SessionContext = {
      ...context,
      homework: updatedHomework,
      queue: ["山", "水"],
      stageOf: { 山: "understand", 水: "recognize" },
    };
    // 故意不发 persist_session：顶层清单也必须读当前运行时上下文。
    vi.spyOn(serverDeps, "reduce").mockReturnValue({ state: "recognize", ctx: updatedContext, effects: [] });

    const post = await postEventRoute(
      postJson(`${base}/${session.id}/event`, { type: "homework_confirmed", items: updatedHomework }),
      params(session.id),
    );
    expect(post.status).toBe(200);

    const response = await getSessionRoute(new Request(`${base}/${session.id}`), params(session.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      context: SessionContext;
      homework: unknown;
    };
    expect(body.homework).toEqual(updatedHomework);
    expect(body.homework).toEqual(body.context.homework);
    expect(body.context.queue).toEqual(["山", "水"]);
    expect(body.context.stageOf).toEqual({ 山: "understand", 水: "recognize" });
    expect(body.context.plan).toEqual(context.plan);
  });
});

describe("工单 15：POST /api/session 用 initContext 建上下文", () => {
  it("stageOf 和 kindOf 覆盖计划里的每一个字", async () => {
    await getPrisma().childChar.deleteMany({ where: { childId: testChild.id } });
    await upsertChildChar({ ...testChildChar, char: "山", stage: "recognize", kind: "recognize_only" });
    await upsertChildChar({
      ...testChildChar,
      char: "水",
      stage: "review_2d",
      kind: "recognize_only",
      nextReviewOn: "2026-11-12",
    });
    await upsertChildChar({ ...testChildChar, char: "日", stage: "understand", kind: "write" });

    const plan = {
      newChars: ["山", "火"],
      reviewChars: ["水"],
      carryOverChars: ["日"],
    };
    vi.spyOn(serverDeps, "now").mockReturnValue(new Date("2026-11-13T02:00:00.000Z"));
    vi.spyOn(serverDeps, "planDay").mockReturnValue(plan);
    let captured: Parameters<InitContext>[0] | undefined;
    const initContextSpy = vi.spyOn(serverDeps, "initContext").mockImplementation((input) => {
      captured = input;
      return contextFromInit(input);
    });
    vi.spyOn(serverDeps, "reduce").mockImplementation((_state, ctx, event) => {
      expect(event).toEqual({ type: "start", hasEssayToday: false });
      return { state: "homework_capture", ctx, effects: [{ type: "show", screen: "homework_capture" }] };
    });

    const response = await createSessionRoute(
      postJson(base, { childId: testChild.id, lessonId: testLesson.id, hasEssayToday: false }),
    );

    expect(response.status).toBe(200);
    expect(initContextSpy).toHaveBeenCalledTimes(1);
    expect(captured?.plan).toEqual(plan);
    expect(captured?.stageOf).toEqual({
      山: "recognize",
      火: "recognize",
      水: "review_2d",
      日: "understand",
    });
    expect(captured?.kindOf).toEqual({
      山: "recognize_only",
      火: "recognize_only",
      水: "recognize_only",
      日: "write",
    });
  });
});

describe("POST /api/session", () => {
  it("用 planDay 和 initContext 建计划、建会话并发送 start 事件", async () => {
    await getPrisma().childChar.deleteMany({ where: { childId: testChild.id } });
    vi.spyOn(serverDeps, "now").mockReturnValue(new Date("2026-11-13T02:00:00.000Z"));
    vi.spyOn(serverDeps, "planDay").mockReturnValue({
      newChars: [...testLesson.recognizeChars, ...testLesson.writeChars],
      reviewChars: [],
      carryOverChars: [],
    });
    vi.spyOn(serverDeps, "initContext").mockImplementation((input) => contextFromInit(input));
    vi.spyOn(serverDeps, "reduce").mockImplementation((_state, ctx, event) => {
      expect(event).toEqual({ type: "start", hasEssayToday: false });
      return {
        state: "homework_capture",
        ctx,
        effects: [{ type: "show", screen: "homework_capture" }],
      };
    });

    const response = await createSessionRoute(
      postJson(base, { childId: testChild.id, lessonId: testLesson.id, hasEssayToday: false }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sessionId: string;
      state: string;
      effects: unknown[];
    };
    expect(body.sessionId).toMatch(/^session_/);
    expect(body.state).toBe("homework_capture");
    expect(body.effects).toEqual([{ type: "show", screen: "homework_capture" }]);
  });

  it("缺少 lessonId 返回 400", async () => {
    const response = await createSessionRoute(postJson(base, { childId: testChild.id, hasEssayToday: true }));
    expect(response.status).toBe(400);
  });
});

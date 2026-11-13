import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as createSessionRoute } from "../../app/api/session/route";
import { GET as getSessionRoute } from "../../app/api/session/[id]/route";
import { POST as postEventRoute } from "../../app/api/session/[id]/event/route";
import type { SessionContext } from "../contracts/orchestrator";
import { upsertChild } from "../db/child";
import { listChildChars } from "../db/childChar";
import { upsertLesson } from "../db/lesson";
import { createSession } from "../db/session";
import { saveSessionRuntime } from "../db/sessionRuntime";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import { testChild, testHomeworkItem, testLesson } from "../db/test-fixtures";
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
    const session = await createSession(testChild.id, "2026-11-13T02:00:00.000Z");
    const context: SessionContext = {
      sessionId: session.id,
      childId: testChild.id,
      today: "2026-11-13",
      plan: { newChars: ["山"], reviewChars: [] },
      queue: ["山"],
      stageOf: { 山: "recognize" },
      kindOf: { 山: "write" },
      homework: [testHomeworkItem],
      elapsedMinutes: 0,
      limitMinutes: testChild.dailyLimitMinutes,
    };
    await saveSessionRuntime({ sessionId: session.id, state: "recognize", context });

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
    expect(body.homework).toEqual([]);
  });
});

describe("POST /api/session", () => {
  it("用 planDay 建计划、建会话并发送 start 事件", async () => {
    vi.spyOn(serverDeps, "now").mockReturnValue(new Date("2026-11-13T02:00:00.000Z"));
    vi.spyOn(serverDeps, "planDay").mockReturnValue({
      newChars: [...testLesson.recognizeChars, ...testLesson.writeChars],
      reviewChars: [],
    });
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

    const chars = await listChildChars(testChild.id);
    expect(chars.map((cc) => cc.char).sort()).toEqual(["山", "日", "月", "水", "火", "田"].sort());
  });

  it("缺少 lessonId 返回 400", async () => {
    const response = await createSessionRoute(postJson(base, { childId: testChild.id, hasEssayToday: true }));
    expect(response.status).toBe(400);
  });
});

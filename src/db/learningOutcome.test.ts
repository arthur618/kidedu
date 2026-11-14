import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./test-db";
import { getPrisma } from "./client";
import { appendLearningOutcome } from "./learningOutcome";
import type { LearningOutcome } from "../contracts/nightly";
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); }); afterAll(async () => { await db.cleanup(); });
it("只追加流水，同唯一键内容相同重放，时间或阶段变化拒绝且不覆盖", async () => {
  const item: LearningOutcome = { id: "outcome-1", sessionId: "fake-session", childId: "fake-child", commandScope: "session:fake-session", commandKey: "operation-key", effectIndex: 3, char: "山", kind: "write", stageBefore: "review_2d", stageAfter: "understand", result: "wrong", occurredAt: "2026-11-14T02:00:00.000Z" };
  await appendLearningOutcome(item); await appendLearningOutcome(item);
  await expect(appendLearningOutcome({ ...item, occurredAt: "2026-11-14T02:00:01.000Z" })).rejects.toThrow("不一致");
  await expect(appendLearningOutcome({ ...item, stageAfter: "mastered" })).rejects.toThrow("不一致");
  expect(await getPrisma().learningOutcome.findMany()).toEqual([item]);
  await expect(appendLearningOutcome({ ...item, id: "outcome-2", commandKey: "second-key", effectIndex: -1 })).rejects.toThrow();
});

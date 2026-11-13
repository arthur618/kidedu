import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCharCard, upsertCharCard } from "./charCard";
import { getChild, upsertChild } from "./child";
import { getChildChar, upsertChildChar } from "./childChar";
import { getIncident, insertIncident } from "./incident";
import { getLesson, upsertLesson } from "./lesson";
import { getPassage, upsertPassage } from "./passage";
import { createSession, getSession, updateSession } from "./session";
import { createTestDatabase, type TestDatabase } from "./test-db";
import {
  testCard,
  testChild,
  testChildChar,
  testIncident,
  testLesson,
  testPassage,
  testSession,
  testTurn,
} from "./test-fixtures";
import { getTurn, insertTurn } from "./turn";

let db: TestDatabase | undefined;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("每张表写入再读出后与写入的数据完全相等", () => {
  it("Child", async () => {
    await upsertChild(testChild);
    await expect(getChild(testChild.id)).resolves.toEqual(testChild);
  });

  it("Lesson", async () => {
    await upsertLesson(testLesson);
    await expect(getLesson(testLesson.id)).resolves.toEqual(testLesson);
  });

  it("CharCard", async () => {
    await upsertCharCard(testCard);
    await expect(getCharCard(testCard.char)).resolves.toEqual(testCard);
  });

  it("Passage", async () => {
    await upsertPassage(testPassage);
    await expect(getPassage(testPassage.id)).resolves.toEqual(testPassage);
  });

  it("ChildChar", async () => {
    await upsertChildChar(testChildChar);
    await expect(getChildChar(testChildChar.childId, testChildChar.char)).resolves.toEqual(testChildChar);
  });

  it("Session", async () => {
    const created = await createSession(testSession.childId, testSession.startedAt);
    const saved = { ...testSession, id: created.id };
    await updateSession(saved);
    await expect(getSession(created.id)).resolves.toEqual(saved);
  });

  it("Turn", async () => {
    await insertTurn(testTurn);
    await expect(getTurn(testTurn.id)).resolves.toEqual(testTurn);
  });

  it("Incident", async () => {
    await insertIncident(testIncident);
    await expect(getIncident(testIncident.id)).resolves.toEqual(testIncident);
  });
});

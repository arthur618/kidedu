import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CharCard, Child, Lesson } from "../contracts/schemas";
import { upsertCharCard } from "./charCard";
import { upsertChild } from "./child";
import { upsertLesson } from "./lesson";

const SeedData = z.object({
  child: Child,
  lesson: Lesson,
  charCards: z.array(CharCard).min(1),
});

export interface SeedSummary {
  childId: string;
  lessonId: string;
  cardCount: number;
}

function loadSeedData(): unknown {
  const path = join(process.cwd(), "prisma", "seed-data.json");
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/**
 * 写入演示数据。全部按主键 upsert，所以跑几次都不会重复。
 * 数据来自 prisma/seed-data.json，都是编造的。
 */
export async function seedDatabase(input?: unknown): Promise<SeedSummary> {
  const data = SeedData.parse(input ?? loadSeedData());
  await upsertChild(data.child);
  await upsertLesson(data.lesson);
  for (const card of data.charCards) {
    await upsertCharCard(card);
  }
  return {
    childId: data.child.id,
    lessonId: data.lesson.id,
    cardCount: data.charCards.length,
  };
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { CharCard, Lesson, Passage } from "../contracts/schemas";
import { upsertCharCard } from "./charCard";
import { upsertLesson } from "./lesson";
import { upsertPassage } from "./passage";

export interface ImportSummary {
  lessons: number;
  cards: number;
  passages: number;
  skipped: number;
}

interface Loaded<T> {
  items: T[];
  skipped: number;
}

async function loadApproved<T extends { status: string }>(
  dir: string,
  schema: z.ZodType<T>,
): Promise<Loaded<T>> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [], skipped: 0 };
    throw error;
  }

  const items: T[] = [];
  let skipped = 0;
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, file);
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`)
        .join("；");
      throw new Error(`导入文件 ${path} 不符合契约：${detail}`);
    }
    if (parsed.data.status === "approved") {
      items.push(parsed.data);
    } else {
      skipped += 1;
    }
  }
  return { items, skipped };
}

/**
 * 从目录导入内容：cards/*.json、passages/*.json、lessons/*.json。
 * 只导入 status 为 approved 的文件；已存在的按主键更新。
 */
export async function importContent(dir: string): Promise<ImportSummary> {
  const lessons = await loadApproved(join(dir, "lessons"), Lesson);
  const cards = await loadApproved(join(dir, "cards"), CharCard);
  const passages = await loadApproved(join(dir, "passages"), Passage);

  for (const lesson of lessons.items) await upsertLesson(lesson);
  for (const card of cards.items) await upsertCharCard(card);
  for (const passage of passages.items) await upsertPassage(passage);

  return {
    lessons: lessons.items.length,
    cards: cards.items.length,
    passages: passages.items.length,
    skipped: lessons.skipped + cards.skipped + passages.skipped,
  };
}

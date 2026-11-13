import { z } from "zod";
import { Lesson } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "Lesson";
const charArraySchema = z.array(z.string().length(1));
const wordsSchema = z.array(z.string().min(1));

export interface LessonRow {
  id: string;
  grade: number;
  term: string;
  lessonNo: number;
  title: string;
  recognizeChars: string;
  writeChars: string;
  words: string;
  status: string;
}

function toRow(lesson: Lesson): LessonRow {
  return {
    id: lesson.id,
    grade: lesson.grade,
    term: lesson.term,
    lessonNo: lesson.lessonNo,
    title: lesson.title,
    recognizeChars: encodeJson(lesson.recognizeChars),
    writeChars: encodeJson(lesson.writeChars),
    words: encodeJson(lesson.words),
    status: lesson.status,
  };
}

function fromRow(row: LessonRow): Lesson {
  const candidate = {
    ...row,
    recognizeChars: decodeJson(Table, row.id, "recognizeChars", row.recognizeChars, charArraySchema),
    writeChars: decodeJson(Table, row.id, "writeChars", row.writeChars, charArraySchema),
    words: decodeJson(Table, row.id, "words", row.words, wordsSchema),
  };
  return parseRecord(Table, row.id, Lesson, candidate);
}

/** 读内容表默认只返回 approved。 */
export async function getLesson(id: string): Promise<Lesson | null> {
  const row = await getPrisma().lesson.findUnique({ where: { id } });
  if (!row || row.status !== "approved") return null;
  return fromRow(row);
}

/** 导入脚本用：内容表按主键更新。 */
export async function upsertLesson(data: Lesson): Promise<Lesson> {
  const lesson = Lesson.parse(data);
  const row = await getPrisma().lesson.upsert({
    where: { id: lesson.id },
    create: toRow(lesson),
    update: toRow(lesson),
  });
  return fromRow(row);
}

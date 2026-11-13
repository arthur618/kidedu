import { z } from "zod";
import { Passage } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "Passage";
const charArraySchema = z.array(z.string().length(1));
const stringArraySchema = z.array(z.string());

export interface PassageRow {
  id: string;
  title: string;
  body: string;
  topic: string;
  sourceType: string;
  targetChars: string;
  outOfScopeCount: number;
  question: string;
  keyPoints: string;
  status: string;
}

function toRow(passage: Passage): PassageRow {
  return {
    id: passage.id,
    title: passage.title,
    body: passage.body,
    topic: passage.topic,
    sourceType: passage.sourceType,
    targetChars: encodeJson(passage.targetChars),
    outOfScopeCount: passage.outOfScopeCount,
    question: passage.question,
    keyPoints: encodeJson(passage.keyPoints),
    status: passage.status,
  };
}

function fromRow(row: PassageRow): Passage {
  const candidate = {
    ...row,
    targetChars: decodeJson(Table, row.id, "targetChars", row.targetChars, charArraySchema),
    keyPoints: decodeJson(Table, row.id, "keyPoints", row.keyPoints, stringArraySchema),
  };
  return parseRecord(Table, row.id, Passage, candidate);
}

/** 读内容表默认只返回 approved。 */
export async function getPassage(id: string): Promise<Passage | null> {
  const row = await getPrisma().passage.findUnique({ where: { id } });
  if (!row || row.status !== "approved") return null;
  return fromRow(row);
}

/** 导入脚本用：内容表按主键更新。 */
export async function upsertPassage(data: Passage): Promise<Passage> {
  const passage = Passage.parse(data);
  const row = await getPrisma().passage.upsert({
    where: { id: passage.id },
    create: toRow(passage),
    update: toRow(passage),
  });
  return fromRow(row);
}

import { z } from "zod";
import { Child } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "Child";
const interestsSchema = z.array(z.string()).max(5);

export interface ChildRow {
  id: string;
  nickname: string;
  grade: number;
  interests: string;
  dailyLimitMinutes: number;
}

function toRow(child: Child): ChildRow {
  return {
    id: child.id,
    nickname: child.nickname,
    grade: child.grade,
    interests: encodeJson(child.interests),
    dailyLimitMinutes: child.dailyLimitMinutes,
  };
}

function fromRow(row: ChildRow): Child {
  const candidate = {
    ...row,
    interests: decodeJson(Table, row.id, "interests", row.interests, interestsSchema),
  };
  return parseRecord(Table, row.id, Child, candidate);
}

export async function getChild(id: string): Promise<Child | null> {
  const row = await getPrisma().child.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

export async function createChild(data: Child): Promise<Child> {
  const child = Child.parse(data);
  const row = await getPrisma().child.create({ data: toRow(child) });
  return fromRow(row);
}

/** 种子脚本用：按主键写入或更新。 */
export async function upsertChild(data: Child): Promise<Child> {
  const child = Child.parse(data);
  const row = await getPrisma().child.upsert({
    where: { id: child.id },
    create: toRow(child),
    update: toRow(child),
  });
  return fromRow(row);
}

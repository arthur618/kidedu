import { ChildChar } from "../contracts/schemas";
import { getPrisma } from "./client";
import { parseRecord } from "./codec";

const Table = "ChildChar";

export interface ChildCharRow {
  childId: string;
  char: string;
  kind: string;
  stage: string;
  correctStreak: number;
  nextReviewOn: string | null;
  wrongCount: number;
  lastSeenOn: string | null;
}

function fromRow(row: ChildCharRow): ChildChar {
  return parseRecord(Table, `${row.childId}/${row.char}`, ChildChar, row);
}

export async function getChildChar(childId: string, char: string): Promise<ChildChar | null> {
  const row = await getPrisma().childChar.findUnique({
    where: { childId_char: { childId, char } },
  });
  return row ? fromRow(row) : null;
}

export async function listChildChars(childId: string): Promise<ChildChar[]> {
  const rows = await getPrisma().childChar.findMany({
    where: { childId },
    orderBy: { char: "asc" },
  });
  return rows.map(fromRow);
}

/** 按 (childId, char) 主键写入或更新。 */
export async function upsertChildChar(cc: ChildChar): Promise<ChildChar> {
  const data = ChildChar.parse(cc);
  const row = await getPrisma().childChar.upsert({
    where: { childId_char: { childId: data.childId, char: data.char } },
    create: data,
    update: data,
  });
  return fromRow(row);
}

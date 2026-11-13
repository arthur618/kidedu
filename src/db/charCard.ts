import { z } from "zod";
import { CharCard } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "CharCard";
const wordsSchema = z.array(z.string().min(1)).min(1);
const charArraySchema = z.array(z.string().length(1));

export interface CharCardRow {
  id: string;
  char: string;
  pinyin: string;
  radical: string;
  explain: string;
  words: string;
  confusable: string;
  dictationContext: string;
  audioUrl: string | null;
  source: string;
  status: string;
}

function toRow(card: CharCard): CharCardRow {
  return {
    id: card.id,
    char: card.char,
    pinyin: card.pinyin,
    radical: card.radical,
    explain: card.explain,
    words: encodeJson(card.words),
    confusable: encodeJson(card.confusable),
    dictationContext: card.dictationContext,
    audioUrl: card.audioUrl,
    source: card.source,
    status: card.status,
  };
}

function fromRow(row: CharCardRow): CharCard {
  const candidate = {
    ...row,
    words: decodeJson(Table, row.id, "words", row.words, wordsSchema),
    confusable: decodeJson(Table, row.id, "confusable", row.confusable, charArraySchema),
  };
  return parseRecord(Table, row.id, CharCard, candidate);
}

/** 读内容表默认只返回 approved；草稿当不存在。 */
export async function getCharCard(char: string): Promise<CharCard | null> {
  const row = await getPrisma().charCard.findUnique({ where: { char } });
  if (!row || row.status !== "approved") return null;
  return fromRow(row);
}

/** 批量读字卡，保持调用方传入的顺序。 */
export async function getCharCards(chars: string[]): Promise<CharCard[]> {
  const wanted = [...new Set(chars)];
  if (wanted.length === 0) return [];
  const rows = await getPrisma().charCard.findMany({
    where: { char: { in: wanted }, status: "approved" },
  });
  const byChar = new Map(rows.map((row) => [row.char, fromRow(row)]));
  return wanted.flatMap((char) => {
    const card = byChar.get(char);
    return card ? [card] : [];
  });
}

/** 导入脚本用：内容表按主键更新。 */
export async function upsertCharCard(data: CharCard): Promise<CharCard> {
  const card = CharCard.parse(data);
  const row = await getPrisma().charCard.upsert({
    where: { id: card.id },
    create: toRow(card),
    update: toRow(card),
  });
  return fromRow(row);
}

import { ReadingRuntimeSchema, type ReadingRuntime } from "../contracts/reading";
import { getPrisma } from "./client";
export async function getReadingRuntime(sessionId: string): Promise<ReadingRuntime | null> {
  const row = await getPrisma().readingRuntime.findUnique({ where: { sessionId } });
  return row ? ReadingRuntimeSchema.parse(JSON.parse(row.data)) : null;
}
export async function saveReadingRuntime(sessionId: string, value: ReadingRuntime): Promise<void> {
  const data = JSON.stringify(ReadingRuntimeSchema.parse(value));
  await getPrisma().readingRuntime.upsert({ where: { sessionId }, create: { sessionId, data }, update: { data } });
}

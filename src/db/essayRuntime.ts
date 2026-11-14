import { EssayRuntimeSchema, EssayActionSchema, type EssayRuntime } from "../contracts/essay";
import { getPrisma } from "./client";
import type { z } from "zod";
export type EssayAction = z.infer<typeof EssayActionSchema>;
export async function getEssayRuntime(sessionId: string): Promise<EssayRuntime | null> {
  const row = await getPrisma().essayRuntime.findUnique({ where: { sessionId } });
  return row?.data ? EssayRuntimeSchema.parse(JSON.parse(row.data)) : null;
}
export async function saveEssayRuntime(sessionId: string, value: EssayRuntime): Promise<void> {
  const data = JSON.stringify(EssayRuntimeSchema.parse(value));
  await getPrisma().essayRuntime.upsert({ where: { sessionId }, create: { sessionId, data }, update: { data } });
}
/** 与命令prepared/complete同事务，避免正文进入公共命令表。 */
export async function saveEssayCommand(sessionId: string, key: string, value: EssayAction | null): Promise<void> {
  const row = await getPrisma().essayRuntime.findUnique({ where: { sessionId } });
  const commands = JSON.parse(row?.commands ?? "{}") as Record<string, EssayAction>;
  if (value) commands[key] = EssayActionSchema.parse(value); else delete commands[key];
  const data = JSON.stringify(commands);
  await getPrisma().essayRuntime.upsert({ where: { sessionId }, create: { sessionId, commands: data }, update: { commands: data } });
}
export async function getEssayCommand(sessionId: string, key: string): Promise<EssayAction | null> {
  const row = await getPrisma().essayRuntime.findUnique({ where: { sessionId } });
  const body = (JSON.parse(row?.commands ?? "{}") as Record<string, unknown>)[key];
  return body ? EssayActionSchema.parse(body) : null;
}

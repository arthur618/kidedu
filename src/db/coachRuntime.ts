import type { CharCoachInput, CharCoachOutput } from "../contracts/schemas";
import { getPrisma } from "./client";
export interface CoachRuntime {
  char: string; activity: number; step: CharCoachInput["step"];
  history: CharCoachInput["history"]; utterances: number; output: CharCoachOutput;
}
export async function getCoachRuntime(sessionId: string): Promise<CoachRuntime | null> {
  const row = await getPrisma().coachRuntime.findUnique({ where: { sessionId } });
  return row ? JSON.parse(row.data) as CoachRuntime : null;
}
export async function saveCoachRuntime(sessionId: string, runtime: CoachRuntime): Promise<void> {
  const data = JSON.stringify(runtime);
  await getPrisma().coachRuntime.upsert({ where: { sessionId }, create: { sessionId, data }, update: { data } });
}

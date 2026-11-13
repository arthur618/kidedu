import { getPrisma } from "./client";

export type CommandPhase = "prepared" | "transitioned" | "complete" | "rejected";
export interface SessionCommand {
  scope: string; key: string; fingerprint: string; kind: string;
  sessionId: string | null; phase: CommandPhase; pending: unknown;
  response: unknown | null;
}
function decode(row: { scope: string; key: string; fingerprint: string; kind: string; sessionId: string | null; phase: string; pending: string; response: string | null }): SessionCommand {
  return { ...row, phase: row.phase as CommandPhase, pending: JSON.parse(row.pending), response: row.response ? JSON.parse(row.response) : null };
}
export async function getCommand(scope: string, key: string): Promise<SessionCommand | null> {
  const row = await getPrisma().sessionCommand.findUnique({ where: { scope_key: { scope, key } } });
  return row ? decode(row) : null;
}
export async function saveCommand(command: SessionCommand): Promise<void> {
  const data = { ...command, pending: JSON.stringify(command.pending), response: command.response === null ? null : JSON.stringify(command.response) };
  await getPrisma().sessionCommand.upsert({ where: { scope_key: { scope: command.scope, key: command.key } }, create: data, update: data });
}
export async function latestCompletedCommand(sessionId: string): Promise<SessionCommand | null> {
  const row = await getPrisma().sessionCommand.findFirst({ where: { sessionId, phase: "complete" }, orderBy: { sequence: "desc" } });
  return row ? decode(row) : null;
}
/** 服务重启后先恢复旧命令，不能让新命令越过未完成的学习效果。 */
export async function unfinishedCommands(sessionId: string): Promise<SessionCommand[]> {
  const rows = await getPrisma().sessionCommand.findMany({ where: { sessionId, phase: { in: ["prepared", "transitioned"] } }, orderBy: { sequence: "asc" } });
  return rows.map(decode);
}

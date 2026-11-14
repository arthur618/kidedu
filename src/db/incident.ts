import { Incident } from "../contracts/schemas";
import { getPrisma, withTransaction } from "./client";
import { parseRecord } from "./codec";

const Table = "Incident";

export interface IncidentRow {
  id: string;
  type: string;
  turnId: string | null;
  note: string;
  resolved: boolean;
  createdAt: string;
}

function fromRow(row: IncidentRow): Incident {
  return parseRecord(Table, row.id, Incident, row);
}

export async function insertIncident(incident: Incident, sessionId?: string): Promise<Incident> {
  const data = Incident.parse(incident);
  return withTransaction(async () => {
    // 归属只能从真实会话取得；未知会话回滚，不能接收调用者childId。
    const session = sessionId ? await getPrisma().session.findUnique({ where: { id: sessionId } }) : null;
    if (sessionId && !session) throw new Error("事件所属会话不存在。");
    if (session && data.turnId) {
      const turn = await getPrisma().turn.findUnique({ where: { id: data.turnId } });
      if (!turn || turn.sessionId !== session.id) throw new Error("事件来源不一致。");
    }
    const row = await getPrisma().incident.create({ data });
    if (session) await getPrisma().incidentContext.create({ data: { incidentId: row.id, childId: session.childId, sessionId: session.id } });
    return fromRow(row);
  });
}

export async function getIncident(id: string): Promise<Incident | null> {
  const row = await getPrisma().incident.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

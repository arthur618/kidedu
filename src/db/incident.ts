import { Incident } from "../contracts/schemas";
import { getPrisma } from "./client";
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

export async function insertIncident(incident: Incident): Promise<Incident> {
  const data = Incident.parse(incident);
  const row = await getPrisma().incident.create({ data });
  return fromRow(row);
}

export async function getIncident(id: string): Promise<Incident | null> {
  const row = await getPrisma().incident.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HomeworkItem, Session } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "Session";
const homeworkSchema = z.array(HomeworkItem);

export interface SessionRow {
  id: string;
  childId: string;
  startedAt: string;
  endedAt: string | null;
  homework: string;
}

function toRow(session: Session): SessionRow {
  return {
    id: session.id,
    childId: session.childId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    homework: encodeJson(session.homework),
  };
}

function fromRow(row: SessionRow): Session {
  const candidate = {
    ...row,
    homework: decodeJson(Table, row.id, "homework", row.homework, homeworkSchema),
  };
  return parseRecord(Table, row.id, Session, candidate);
}

/** 新建一次会话，作业清单先为空；id 由服务端生成。 */
export async function createSession(childId: string, startedAt: string): Promise<Session> {
  const session = Session.parse({
    id: `session_${randomUUID()}`,
    childId,
    startedAt,
    endedAt: null,
    homework: [],
  });
  const row = await getPrisma().session.create({ data: toRow(session) });
  return fromRow(row);
}

export async function getSession(id: string): Promise<Session | null> {
  const row = await getPrisma().session.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

export async function updateSession(session: Session): Promise<Session> {
  const data = Session.parse(session);
  const row = await getPrisma().session.update({
    where: { id: data.id },
    data: {
      childId: data.childId,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      homework: encodeJson(data.homework),
    },
  });
  return fromRow(row);
}

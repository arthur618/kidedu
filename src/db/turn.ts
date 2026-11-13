import { Turn } from "../contracts/schemas";
import { getPrisma } from "./client";
import { decodeJson, encodeJson, parseRecord } from "./codec";

const Table = "Turn";

export interface TurnRow {
  id: string;
  sessionId: string;
  agent: string;
  model: string;
  input: string;
  output: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  guardVerdict: string;
  createdAt: string;
}

function toRow(turn: Turn): TurnRow {
  return {
    id: turn.id,
    sessionId: turn.sessionId,
    agent: turn.agent,
    model: turn.model,
    input: encodeJson(turn.input),
    output: encodeJson(turn.output),
    inputTokens: turn.inputTokens,
    cachedInputTokens: turn.cachedInputTokens,
    outputTokens: turn.outputTokens,
    latencyMs: turn.latencyMs,
    guardVerdict: turn.guardVerdict,
    createdAt: turn.createdAt,
  };
}

function fromRow(row: TurnRow): Turn {
  const candidate = {
    ...row,
    input: decodeJson(Table, row.id, "input", row.input, Turn.shape.input),
    output: decodeJson(Table, row.id, "output", row.output, Turn.shape.output),
  };
  return parseRecord(Table, row.id, Turn, candidate);
}

export async function insertTurn(turn: Turn): Promise<Turn> {
  const data = Turn.parse(turn);
  const row = await getPrisma().turn.create({ data: toRow(data) });
  return fromRow(row);
}

export async function getTurn(id: string): Promise<Turn | null> {
  const row = await getPrisma().turn.findUnique({ where: { id } });
  return row ? fromRow(row) : null;
}

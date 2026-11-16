import { z } from "zod";
import { contractDataError } from "./errors";

/** 数组、嵌套对象落库前的统一编码。 */
export function encodeJson(value: unknown): string {
  const text = JSON.stringify(value);
  // JSON.stringify(undefined) 返回 undefined；契约允许 input/output 为 unknown，
  // 数据库列不允许空值，所以把 undefined 存成 JSON 的 null。
  return text === undefined ? "null" : text;
}

/** 读出 JSON 列并做一次结构校验，坏数据抛明确的错误。 */
export function decodeJson<T>(
  table: string,
  recordId: string,
  field: string,
  raw: string,
  schema: z.ZodType<T, unknown>,
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw contractDataError(table, recordId, new Error(`字段 ${field} 不是合法的 JSON`));
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw contractDataError(table, recordId, new Error(`字段 ${field} 不符合契约：${parsed.error.issues.map((issue) => issue.message).join("；")}`));
  }
  return parsed.data;
}

/** 整行过契约 schema；失败时带表名和主键。 */
export function parseRecord<T>(
  table: string,
  recordId: string,
  schema: z.ZodType<T, unknown>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw contractDataError(table, recordId, parsed.error);
  }
  return parsed.data;
}

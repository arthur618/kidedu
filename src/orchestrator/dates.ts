import { IsoDate } from "../contracts/schemas";

/** 按 UTC 日历运算；构造时间只使用传入日期，不读取系统时钟。 */
export function addDays(day: string, amount: number): string {
  IsoDate.parse(day);
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isInteger(amount) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new RangeError("日期或天数不正确");
  }
  date.setUTCDate(date.getUTCDate() + amount);
  const result = date.toISOString().slice(0, 10);
  IsoDate.parse(result);
  return result;
}

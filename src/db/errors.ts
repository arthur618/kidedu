import { ZodError } from "zod";

/**
 * 数据库里读出来的数据不符合契约时抛这个错。
 * 错误信息里带表名和记录主键，方便定位坏数据；绝不把坏数据返回给调用方。
 */
export class ContractDataError extends Error {
  readonly table: string;
  readonly recordId: string;
  readonly detail: string;

  constructor(table: string, recordId: string, detail: string) {
    super(`数据库表 ${table} 里的记录（${recordId}）不符合契约：${detail}`);
    this.name = "ContractDataError";
    this.table = table;
    this.recordId = recordId;
    this.detail = detail;
  }
}

/** 把 zod 的报错压成一行可读文字，写进 ContractDataError。 */
export function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(根)";
      return `${path}: ${issue.message}`;
    })
    .join("；");
}

/** 统一把 zod 的失败转成 ContractDataError。 */
export function contractDataError(table: string, recordId: string, error: unknown): ContractDataError {
  if (error instanceof ZodError) {
    return new ContractDataError(table, recordId, describeZodError(error));
  }
  if (error instanceof Error) {
    return new ContractDataError(table, recordId, error.message);
  }
  return new ContractDataError(table, recordId, String(error));
}

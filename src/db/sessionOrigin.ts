import { getPrisma } from './client';
import { SessionOriginSchema, type SessionOrigin } from '../contracts/session';
/** 只在新start事务中创建；不从浏览器补写历史归属。 */
export async function createSessionOrigin(value: SessionOrigin): Promise<void> {
  await getPrisma().sessionOrigin.create({ data: SessionOriginSchema.parse(value) });
}
export async function getSessionOrigin(sessionId: string): Promise<SessionOrigin | null> {
  const parsed = SessionOriginSchema.safeParse(await getPrisma().sessionOrigin.findUnique({ where: { sessionId } }));
  return parsed.success ? parsed.data : null;
}

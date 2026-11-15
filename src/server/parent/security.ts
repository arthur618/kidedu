import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getPrisma, withTransaction } from "../../db/client";
export const COOKIE = "parent_access";
export const TTL = 24 * 60 * 60 * 1000;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class ParentError extends Error { constructor(public status: number, message: string) { super(message); } }
export const notFound = () => new ParentError(404, "没有找到这条记录。");
export interface ParentConfig { password: string; childIds: string[]; fingerprint: string }
export function loadConfig(env: Record<string, string | undefined>): ParentConfig | null {
  const password = env.PARENT_ACCESS_PASSWORD ?? "";
  const raw = env.PARENT_ALLOWED_CHILD_IDS ?? "";
  const childIds = [...new Set(raw.split(",").map(id => id.trim()))].sort();
  if (!password.trim() || password.length < 24 || password.length > 512 || !raw.trim() || childIds.some(id => !/^[\p{L}\p{N}_-]{1,128}$/u.test(id))) return null;
  return { password, childIds, fingerprint: hash(JSON.stringify([password, childIds])) };
}
export function tokenFrom(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export async function authenticated(request: Request, config: ParentConfig, now: Date): Promise<boolean> {
  const token = tokenFrom(request); if (!token) return false;
  const row = await getPrisma().parentAccessSession.findUnique({ where: { tokenHash: hash(token) } });
  return !!row && !row.revoked && row.configFingerprint === config.fingerprint && row.expiresAt > now.toISOString();
}
export function checkMutation(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ParentError(403, "请从家长页面提交操作。");
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new ParentError(415, "请使用页面表单提交。");
}
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text(); if (text.length > 4096) throw new ParentError(400, "提交内容太长了。");
  try { return JSON.parse(text); } catch { throw new ParentError(400, "请检查提交内容。"); }
}
export async function login(password: string, config: ParentConfig, now: () => Date): Promise<string> {
  // 只在实际事务执行时读可信时钟；慢body/排队不能携带旧窗口倒拨预算。
  const allowed = await withTransaction(async () => {
    const executedAt = now();
    const start = new Date(Math.floor(executedAt.getTime() / 900_000) * 900_000).toISOString();
    // 判断与递增取同一条写入的RETURNING；旧窗口只耗预算，永不回退，拒绝后饱和为9。
    const rows = await getPrisma().$queryRaw<{ attempts: number }[]>`INSERT INTO ParentLoginLimit(bucket, windowStart, attempts) VALUES ('household', ${start}, 1)
      ON CONFLICT(bucket) DO UPDATE SET
        windowStart=CASE WHEN excluded.windowStart > ParentLoginLimit.windowStart THEN excluded.windowStart ELSE ParentLoginLimit.windowStart END,
        attempts=CASE WHEN excluded.windowStart > ParentLoginLimit.windowStart THEN 1 ELSE MIN(ParentLoginLimit.attempts+1, 9) END
      RETURNING attempts`;
    return !!rows[0] && rows[0].attempts <= 8;
  });
  // 预算先提交，拒绝也不能回滚已消耗的次数。
  if (!allowed) throw new ParentError(429, "尝试次数较多，请稍后再试。");
  if (!timingSafeEqual(Buffer.from(hash(password), "hex"), Buffer.from(hash(config.password), "hex"))) throw new ParentError(401, "口令不正确，请重试。");
  const token = randomBytes(32).toString("base64url");
  await getPrisma().parentAccessSession.create({ data: { tokenHash: hash(token), configFingerprint: config.fingerprint, expiresAt: new Date(now().getTime() + TTL).toISOString() } });
  return token;
}
export function cookie(value: string, production: boolean, clear = false): string {
  return `${COOKIE}=${value}; Path=/api/parent; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : TTL / 1000}${production ? "; Secure" : ""}`;
}
export function encodeCursor(config: ParentConfig, scope: string, key: string): string {
  const data = Buffer.from(JSON.stringify([scope, key])).toString("base64url");
  return `${data}.${createHmac("sha256", config.fingerprint).update(data).digest("base64url")}`;
}
export function decodeCursor(value: string | null, config: ParentConfig, scope: string): string | null {
  if (value === null) return null;
  if (value.length > 2048) throw notFound();
  const [data, mac, extra] = value.split(".");
  if (!data || !mac || extra) throw notFound();
  const expected = createHmac("sha256", config.fingerprint).update(data).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw notFound();
  try { const parsed: unknown = JSON.parse(Buffer.from(data, "base64url").toString()); if (!Array.isArray(parsed) || parsed.length !== 2 || parsed[0] !== scope || typeof parsed[1] !== "string") throw notFound(); return parsed[1]; } catch { throw notFound(); }
}

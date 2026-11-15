import { ZodError } from "zod";
import { ParentLoginSchema, ParentIncidentResolveSchema } from "../../contracts/parent";
import { SessionRequestIdSchema } from "../../contracts/session";
import { getPrisma } from "../../db/client";
import * as store from "../../db/parent/store";
import { authenticated, checkMutation, cookie, hash, loadConfig, login, notFound, ParentError, readJson, tokenFrom } from "./security";
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
  const old = queues.get(key) ?? Promise.resolve();
  const next = old.catch(() => {}).then(run); queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}
export function createParentHandler(options: { getEnv?: () => Record<string, string | undefined>; now?: () => Date } = {}) {
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" });
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      const env = options.getEnv?.() ?? process.env;
      const clock = options.now ?? (() => new Date());
      const config = loadConfig(env);
      const url = new URL(request.url); const path = url.pathname.slice("/api/parent/".length).split("/").map(decodeURIComponent);
      if (request.method === "GET" && path.join("/") === "status") return respond({ enabled: !!config, authenticated: !!config && await authenticated(request, config, clock()) });
      if (!config) throw new ParentError(403, "家长入口暂未开启。");
      if (request.method !== "GET" && request.method !== "POST") throw new ParentError(405, "暂不支持这个操作。");
      if (request.method === "POST") checkMutation(request);
      if (request.method === "POST" && path.join("/") === "login") {
        const body = ParentLoginSchema.parse(await readJson(request));
        const token = await serial("login", () => {
          const current = loadConfig(options.getEnv?.() ?? process.env);
          if (!current || current.fingerprint !== config.fingerprint) throw new ParentError(403, "家长入口配置已更新，请重新打开页面。");
          return login(body.password, current, clock);
        });
        headers.set("Set-Cookie", cookie(token, env.NODE_ENV === "production"));
        return respond({ enabled: true, authenticated: true });
      }
      const assertAccess = async () => {
        // 操作在事务真正执行时也复查撤销/过期；配置变化不得继续操作。
        const current = loadConfig(options.getEnv?.() ?? process.env);
        if (!current || current.fingerprint !== config.fingerprint || !await authenticated(request, config, clock())) throw new ParentError(401, "请先登录家长入口。");
      };
      await assertAccess();
      if (request.method === "POST" && path.join("/") === "logout") {
        await readJson(request);
        const token = tokenFrom(request)!;
        await getPrisma().parentAccessSession.updateMany({ where: { tokenHash: hash(token) }, data: { revoked: true } });
        headers.set("Set-Cookie", cookie("", env.NODE_ENV === "production", true)); return respond({ enabled: true, authenticated: false });
      }
      if (request.method === "GET" && path.join("/") === "children") return respond({ children: await store.children(config) });
      if (path[0] !== "children" || !path[1]) throw notFound();
      const childId = path[1];
      // 每个子路径先验证child，再查询任何资源ID或游标。
      await store.authorizedChild(config, childId);
      const resource = path[2];
      if (request.method === "GET" && path.length === 3) {
        if (resource === "progress") return respond(await store.progress(config, childId, url.searchParams.get("stage"), url.searchParams.get("cursor")));
        if (resource === "reports") return respond(await store.reports(config, childId, url.searchParams.get("cursor")));
        if (resource === "incidents") return respond(await store.incidents(config, childId, url.searchParams.get("cursor")));
        if (resource === "deletion-preview") return respond(await store.deletionPreview(config, childId, clock()));
      }
      if (request.method === "GET" && path.length === 4 && path[3]) {
        if (resource === "reports") return respond(await store.report(config, childId, path[3]));
        if (resource === "incidents") return respond(await store.incidentDetail(config, childId, path[3]));
      }
      if (request.method === "POST" && path.length === 5 && resource === "incidents" && path[3] && path[4] === "resolve") {
        const body = ParentIncidentResolveSchema.parse(await readJson(request));
        const requestId = SessionRequestIdSchema.parse(request.headers.get("Idempotency-Key"));
        return respond(await serial("review", () => store.resolve(config, childId, path[3]!, requestId, body, clock(), assertAccess)));
      }
      throw notFound();
    } catch (error) {
      if (error instanceof ParentError) return respond({ error: error.message }, error.status);
      if (error instanceof ZodError || error instanceof URIError) return respond({ error: "请检查提交内容。" }, 400);
      // 不序列化Prisma错误、请求、cookie或内部异常。
      return respond({ error: "暂时无法读取，请稍后再试。" }, 500);
    }
  };
}
export const parentHandler = createParentHandler();

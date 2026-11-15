import { createHash } from "node:crypto";
import {
  RESEARCH_TIMEOUT_MS, RESEARCH_MAX_RESPONSE_BYTES, ResearchRequestSchema,
  ResearchReferenceSchema, ResearchArtifactSchema,
  type PublicResearchClient, type ResearchResult, type ResearchReference,
} from "../../../src/contracts/research";

export interface ResearchDeps {
  fetch: typeof globalThis.fetch;
  getEnv: (name: string) => string | undefined;
  now: () => number;
}
/** 固定字段顺序；保留原始字符串与供应商结果顺序，不做文本改写。 */
export function sourceHash(query: string, count: number, results: ResearchReference[]): string {
  return createHash("sha256").update(JSON.stringify({ query, count, results })).digest("hex");
}
function project(value: unknown, count: number): ResearchReference[] {
  if (!value || typeof value !== "object" || !("results" in value) || !Array.isArray(value.results) || value.results.length > count) throw new Error();
  return value.results.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error();
    const r = raw as Record<string, unknown>;
    return ResearchReferenceSchema.parse({ title: r.title, url: r.url, snippet: r.snippet, summary: r.summary,
      siteName: r.site_name, publishedAt: r.date, rank: r.rerank_score, authority: r.authority });
  });
}
export function createPublicResearchClient(deps: ResearchDeps): PublicResearchClient {
  return { async search(input, options = {}): Promise<ResearchResult> {
    const started = deps.now();
    let requestCount: 0 | 1 = 0;
    const fail = (error: Extract<ResearchResult, { ok: false }>["error"]): ResearchResult => ({ ok: false, error, requestCount, latencyMs: Math.max(0, deps.now() - started) });
    const parsed = ResearchRequestSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    if (options.signal?.aborted) return fail("cancelled");
    const key = deps.getEnv("DEEPSEEK_API_KEY")?.trim();
    if (deps.getEnv("DEEPSEEK_RESEARCH_ENABLED") !== "true" || !key) return fail("disabled");
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let stopped: "timeout" | "cancelled" | undefined;
    let rejectStop!: (reason: Error) => void;
    const stopPromise = new Promise<never>((_, reject) => { rejectStop = reject; });
    const stop = (reason: "timeout" | "cancelled") => {
      if (stopped) return;
      stopped = reason;
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      rejectStop(new Error());
    };
    const cancel = () => stop("cancelled");
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => stop("timeout"), RESEARCH_TIMEOUT_MS);
    const work = async (): Promise<ResearchResult> => {
      requestCount = 1;
      const response = await deps.fetch("https://api.deepseek.com/v1/tools/search", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: parsed.data.query, count: parsed.data.count, need_content: false }),
      });
      if (!stopped && deps.now() - started >= RESEARCH_TIMEOUT_MS) stop("timeout");
      if (stopped) { void response.body?.cancel().catch(() => {}); return fail(stopped); }
      if (!response.ok || response.redirected || response.status !== 200) {
        void response.body?.cancel().catch(() => {}); return fail("provider_error");
      }
      if (!response.body) return fail("invalid_output");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (!stopped && deps.now() - started >= RESEARCH_TIMEOUT_MS) stop("timeout");
        if (stopped) return fail(stopped);
        if (part.done) break;
        size += part.value.byteLength;
        if (size > RESEARCH_MAX_RESPONSE_BYTES) { void reader.cancel().catch(() => {}); return fail("invalid_output"); }
        chunks.push(part.value);
      }
      try {
        const bytes = Buffer.concat(chunks);
        const results = project(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), parsed.data.count);
        const artifact = ResearchArtifactSchema.parse({ schemaVersion: 1, kind: "public_reference", status: "reference_only", provider: "deepseek",
          ...parsed.data, fetchedAt: new Date(deps.now()).toISOString(), sourceHash: sourceHash(parsed.data.query, parsed.data.count, results), results });
        return { ok: true, artifact, requestCount: 1, latencyMs: Math.max(0, deps.now() - started) };
      } catch { return fail("invalid_output"); }
    };
    try { return await Promise.race([work(), stopPromise]); }
    catch { return fail(stopped ?? "provider_error"); }
    finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
  } };
}

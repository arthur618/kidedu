/** 契约2.9：仅供离线公开资料查证，不作为孩子端知识或内容审批凭据。 */
import { z } from "zod";
import { IsoDateTime } from "./schemas";

export const RESEARCH_MAX_RESULTS = 5;
export const RESEARCH_TIMEOUT_MS = 8000;
export const RESEARCH_MAX_RESPONSE_BYTES = 1024 * 1024;
export const PublicResearchQuerySchema = z.string().refine(value => {
  const count = Array.from(value).length;
  return count >= 1 && count <= 128 && value.trim().length > 0;
}, "公开检索词须为1至128个Unicode字符，不能全为空白。");
export const ResearchRequestSchema = z.object({
  query: PublicResearchQuerySchema,
  count: z.number().int().min(1).max(RESEARCH_MAX_RESULTS).default(3),
}).strict();
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export const ResearchHttpUrlSchema = z.string().max(8192).url().refine(value => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "参考链接须是无凭据的HTTP或HTTPS地址。");
/** 外部网页文字均不可信；只保存有限摘要，不取正文、不执行HTML、不下载图标。 */
export const ResearchReferenceSchema = z.object({
  title: z.string().max(1000), url: ResearchHttpUrlSchema,
  snippet: z.string().max(4000), summary: z.string().max(12000),
  siteName: z.string().max(500).nullable(), publishedAt: z.string().datetime({ offset: true }).nullable(),
  rank: z.number().finite().min(0).max(3), authority: z.number().int().min(-1).max(4),
}).strict();
export type ResearchReference = z.infer<typeof ResearchReferenceSchema>;
export const ResearchArtifactSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("public_reference"), status: z.literal("reference_only"),
  provider: z.literal("deepseek"), query: PublicResearchQuerySchema,
  count: z.number().int().min(1).max(RESEARCH_MAX_RESULTS), fetchedAt: IsoDateTime,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  results: z.array(ResearchReferenceSchema).max(RESEARCH_MAX_RESULTS),
}).strict().refine(value => value.results.length <= value.count, "结果条数不能超过请求上限。");
export type ResearchArtifact = z.infer<typeof ResearchArtifactSchema>;
export type ResearchResult =
  | { ok: true; artifact: ResearchArtifact; requestCount: 1; latencyMs: number }
  | { ok: false; error: "disabled" | "invalid_input" | "timeout" | "cancelled" | "provider_error" | "invalid_output"; requestCount: 0 | 1; latencyMs: number };
export interface PublicResearchClient {
  search(request: ResearchRequest, options?: { signal?: AbortSignal }): Promise<ResearchResult>;
}

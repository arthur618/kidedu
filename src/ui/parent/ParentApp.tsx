"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { ParentStatusSchema, ParentChildSchema, ParentProgressSchema, ParentReportsPageSchema, ParentIncidentsPageSchema, ParentIncidentSchema, ParentDeletionPreviewSchema } from "../../contracts/parent";
import type { DailyReport } from "../../contracts/nightly";
import { CharStage } from "../../contracts/schemas";
import "./parent.css";
type Child = z.infer<typeof ParentChildSchema>;
type Progress = z.infer<typeof ParentProgressSchema>;
type Reports = z.infer<typeof ParentReportsPageSchema>;
type Incidents = z.infer<typeof ParentIncidentsPageSchema>;
type Preview = z.infer<typeof ParentDeletionPreviewSchema>;
const stages: Record<z.infer<typeof CharStage>, string> = { recognize: "认读", understand: "理解", write: "书写", review_2d: "两天后复习", review_7d: "七天后复习", mastered: "已掌握" };
const types = { recognition: "识别", knowledge: "知识内容", bad_question: "提问", ghostwriting: "作文引导", safety: "安全" };
const tableLabels: Record<string, string> = { Child: "孩子资料", ChildChar: "当前认字进度", Session: "学习会话", Turn: "模型调用记录", SessionRuntime: "会话快照", CoachRuntime: "认字活动", ReadingRuntime: "阅读活动与原话", EssayRuntime: "作文活动与原文", SessionCommand: "操作与重试记录", LearningOutcome: "学习流水", SessionLearningCoverage: "流水覆盖记录", Incident: "需留意的事件", IncidentContext: "事件归属", ParentReviewAudit: "人工处理审计", ParentReviewRequest: "人工请求记录", NightlyJob: "日报来源版本", NightlyStep: "日报分步记录", NightlyPublication: "已发布日报" };
export function ReportView({ report }: { report: DailyReport }) {
  const facts = report.facts;
  return <article className="parent-card"><h3>{report.date} 日报</h3><p>按{report.timezone === "UTC" ? "世界标准时间" : "北京时间"}统计</p>
    <h4>学习事实</h4><p>已结束会话合并时段：{facts.minutes} 分钟（不代表专注时长）</p>
    <p>练习：{facts.practicedChars.join("、") || "暂无记录"}；复习：{facts.reviewedChars.join("、") || "暂无记录"}；需要再练：{facts.wrongChars.join("、") || "暂无记录"}</p>
    <p>{facts.learningCoverage === "complete" ? "本日学习流水完整。" : facts.learningCoverage === "partial" ? "本日部分历史学习明细缺失，统计可能不完整。" : "本日没有可用学习流水，不能据此判断没有练习。"}</p>
    <p>已结束会话 {facts.finishedSessionIds.length} 次，未结束会话 {facts.unfinishedSessionIds.length} 次；完成作文活动 {facts.completedEssaySessionIds.length} 次。</p>
    <h4>模型参考</h4><p>以下摘要与复述分数仅供家长参考，不代表能力定论。</p>
    <p>{report.summaryStatus === "generated" ? "模型生成摘要" : report.summaryStatus === "fallback" ? "摘要服务暂不可用，显示事实摘要" : "本日无需生成模型摘要"}</p>
    {report.summary.lines.map((line, index) => <p key={index}>{line}</p>)}<p>给家长的建议：{report.summary.parentAction}</p>
    {report.retellScores.length ? report.retellScores.map(score => <p key={score.sessionId}>复述参考：{score.status === "scored" && score.result !== null ? `${score.result.score} / 3 分` : "暂不可用"}</p>) : <p>暂无复述参考分数。</p>}
  </article>;
}
export default function ParentApp() {
  const [status, setStatus] = useState<z.infer<typeof ParentStatusSchema> | null>(null);
  const [children, setChildren] = useState<Child[]>([]); const [childId, setChildId] = useState("");
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(""); const [progress, setProgress] = useState<Progress | null>(null); const [reports, setReports] = useState<Reports | null>(null); const [incidents, setIncidents] = useState<Incidents | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const [pc, setPc] = useState<string | null>(null); const [rc, setRc] = useState<string | null>(null); const [ic, setIc] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0); const controllers = useRef(new Set<AbortController>());
  const reviewRequests = useRef(new Map<string, { id: string; body: { resolved: boolean; expectedRevision: number } }>());
  function invalidate() { epoch.current++; controllers.current.forEach(c => c.abort()); controllers.current.clear(); setMessage(""); setProgress(null); setReports(null); setIncidents(null); setPreview(null); setBusy(false); }
  async function api(path: string, body?: unknown, requestId?: string) {
    const version = epoch.current;
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const response = await fetch(`/api/parent/${path}`, { method: body === undefined ? "GET" : "POST", signal: controller.signal, credentials: "same-origin", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json", ...(requestId ? { "Idempotency-Key": requestId } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data: unknown = await response.json();
      if (response.status === 401 && path !== "login" && version === epoch.current) {
        invalidate(); setChildren([]); setChildId(""); setStatus(s => s ? { ...s, authenticated: false } : s); setMessage("登录已失效，请重新登录。");
      }
      if (!response.ok) throw new Error(response.status === 401 ? path === "login" ? "口令不正确，请重试。" : "登录已失效，请重新登录。" : response.status === 409 ? "记录已更新，请刷新记录后重试。" : response.status === 429 ? "尝试次数较多，请稍后再试。" : response.status === 403 ? "家长入口暂未开启或操作无法确认。" : "暂时无法完成，请稍后重试。");
      return data;
    } finally { controllers.current.delete(controller); }
  }
  function error(error: unknown, version: number) { if (version === epoch.current && !(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "暂时无法读取，请稍后再试。"); }
  async function loadChildren(version: number) {
    const data = await api("children") as { children: unknown[] }; const rows = data.children.map(row => ParentChildSchema.parse(row));
    if (version !== epoch.current) return; setChildren(rows); setChildId(rows[0]?.id ?? "");
  }
  useEffect(() => { const version = epoch.current; api("status").then(data => { if (version !== epoch.current) return; const value = ParentStatusSchema.parse(data); setStatus(value); if (value.authenticated) return loadChildren(version); }).catch(e => error(e, version)); return () => { epoch.current++; controllers.current.forEach(c => c.abort()); }; }, []);
  useEffect(() => {
    if (!status?.authenticated || !childId) return;
    const version = epoch.current; const prefix = `children/${encodeURIComponent(childId)}`;
    const query = (cursor: string | null, extra = "") => `${extra}${cursor ? `${extra ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : ""}`;
    api(`${prefix}/progress${query(pc, stage ? `?stage=${encodeURIComponent(stage)}` : "")}`).then(data => { if (version === epoch.current) setProgress(ParentProgressSchema.parse(data)); }).catch(e => error(e, version));
    api(`${prefix}/reports${query(rc)}`).then(data => { if (version === epoch.current) setReports(ParentReportsPageSchema.parse(data)); }).catch(e => error(e, version));
    api(`${prefix}/incidents${query(ic)}`).then(data => { if (version === epoch.current) setIncidents(ParentIncidentsPageSchema.parse(data)); }).catch(e => error(e, version));
  }, [status?.authenticated, childId, stage, pc, rc, ic, refresh]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); const version = epoch.current; setBusy(true); setMessage("");
    try { const value = ParentStatusSchema.parse(await api("login", { password })); if (version !== epoch.current) return; setPassword(""); setStatus(value); await loadChildren(version); } catch (e) { error(e, version); } finally { if (version === epoch.current) setBusy(false); }
  }
  async function signOut() {
    invalidate(); setChildren([]); setChildId(""); setStatus(s => s ? { ...s, authenticated: false } : s); setPassword(""); reviewRequests.current.clear(); const version = epoch.current; setBusy(true);
    try { await api("logout", {}); } catch (e) { error(e, version); } finally { if (version === epoch.current) setBusy(false); }
  }
  function changeChild(id: string) { invalidate(); reviewRequests.current.clear(); setPc(null); setRc(null); setIc(null); setStage(""); setChildId(id); }
  function paginate(kind: "progress" | "reports" | "incidents", cursor: string | null) { invalidate(); if (kind === "progress") setPc(cursor); if (kind === "reports") setRc(cursor); if (kind === "incidents") setIc(cursor); }
  async function mark(item: Incidents["incidents"][number]) {
    const version = epoch.current; const targetChild = childId; const key = `${targetChild}:${item.id}:${item.revision}`;
    const operation = reviewRequests.current.get(key) ?? { id: crypto.randomUUID(), body: { resolved: !item.resolved, expectedRevision: item.revision } }; reviewRequests.current.set(key, operation); setBusy(true); setMessage("");
    try { const updated = ParentIncidentSchema.parse(await api(`children/${encodeURIComponent(targetChild)}/incidents/${encodeURIComponent(item.id)}/resolve`, operation.body, operation.id)); if (version === epoch.current) { setIncidents(old => old ? { ...old, incidents: old.incidents.map(row => row.id === updated.id ? updated : row) } : old); reviewRequests.current.delete(key); } } catch (e) { error(e, version); } finally { if (version === epoch.current) setBusy(false); }
  }
  async function showPreview() { const version = epoch.current; setBusy(true); try { const value = ParentDeletionPreviewSchema.parse(await api(`children/${encodeURIComponent(childId)}/deletion-preview`)); if (version === epoch.current) setPreview(value); } catch (e) { error(e, version); } finally { if (version === epoch.current) setBusy(false); } }
  return <main className="parent-app"><h1>家长日报</h1><p>看见每天的练习，给孩子一点从容的支持。</p><p role="status" aria-live="polite">{message}</p>
    {!status ? <p>正在打开家长入口……</p> : !status.enabled ? <section className="parent-card"><h2>家长入口暂未开启</h2><p>准备好后，可以在这里查看每天的学习记录。</p></section> : !status.authenticated ? <form className="parent-card" onSubmit={signIn}><h2>家长登录</h2><label htmlFor="parent-password">家长口令</label><input id="parent-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={512}/><button disabled={busy} type="submit">登录</button></form> : <>
      <div className="parent-toolbar"><label htmlFor="parent-child">查看孩子</label><select id="parent-child" value={childId} onChange={e => changeChild(e.target.value)}>{children.map(child => <option value={child.id} key={child.id}>{child.nickname}（{child.grade}年级）</option>)}</select><button onClick={signOut}>退出登录</button></div>
      {!children.length ? <p>暂时没有可查看的孩子记录。</p> : <>
        <section aria-labelledby="progress-title" className="parent-card"><h2 id="progress-title">当前认字进度</h2><p>这是当前阶段；每日练习次数请看日报。</p>
          {progress && <ul className="parent-counts">{Object.entries(progress.counts).map(([key, value]) => <li key={key}>{stages[key as keyof typeof stages]}：{value}</li>)}</ul>}
          <label htmlFor="parent-stage">按阶段查看</label><select id="parent-stage" value={stage} onChange={e => { invalidate(); setPc(null); setStage(e.target.value); }}>{<option value="">全部阶段</option>}{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          {!progress ? <p>正在读取进度……</p> : <><ul className="parent-chars">{progress.chars.map(char => <li key={char.char}><strong>{char.char}</strong> · {stages[char.stage]}</li>)}</ul>{!progress.chars.length && <p>这个阶段暂无记录。</p>}<div className="parent-toolbar">{pc && <button onClick={() => paginate("progress", null)}>返回进度首页</button>}{progress.nextCursor && <button onClick={() => paginate("progress", progress.nextCursor)}>下一页进度</button>}</div></>}
        </section>
        <section aria-labelledby="reports-title"><h2 id="reports-title">每日记录</h2>{!reports ? <p>正在读取日报……</p> : <>{reports.reports.map(report => <ReportView key={report.id} report={report}/>)}{!reports.reports.length && <p>还没有日报。日报准备好后会显示在这里。</p>}<div className="parent-toolbar">{rc && <button onClick={() => paginate("reports", null)}>返回日报首页</button>}{reports.nextCursor && <button onClick={() => paginate("reports", reports.nextCursor)}>下一页日报</button>}</div></>}</section>
        <section aria-labelledby="incidents-title"><h2 id="incidents-title">需要留意的记录</h2><p>这里只显示有可信会话归属的记录。旧记录可能没有归属，不能在这里展示或处理。人工标记不改变孩子的学习进度，也不修改内容审核结果。</p>
          <button onClick={() => { invalidate(); setIc(null); setPc(null); setRc(null); setStage(""); setRefresh(n => n + 1); }}>刷新记录</button>
          {!incidents ? <p>正在读取记录……</p> : <>{incidents.incidents.map(item => <article className="parent-card" key={item.id}><h3>{types[item.type]}</h3><p>{item.createdAt.slice(0, 10)} · {item.resolved ? "已处理" : "待留意"}</p><p>{item.note}</p>{item.agent && <p>来源：{item.agent} {item.model ?? "模型信息未保留"}</p>}<button disabled={busy} onClick={() => mark(item)}>{item.resolved ? "改为待留意" : "标记为已处理"}</button></article>)}{!incidents.incidents.length && <p>暂时没有需要留意的记录。</p>}<div className="parent-toolbar">{ic && <button onClick={() => paginate("incidents", null)}>返回记录首页</button>}{incidents.nextCursor && <button onClick={() => paginate("incidents", incidents.nextCursor)}>下一页记录</button>}</div></>}
          <p>需要修订字卡时，仍须经过内容检查、复核、人工终审后导入。</p>
        </section>
        <section className="parent-card"><h2>数据保留</h2><p>学习数据默认保留，不会因退出或登录过期而删除。仅预览，实际删除需单独审核。</p><button disabled={busy} onClick={showPreview}>预览删除范围</button>{preview && <div><p>本次只是只读预览，没有删除数据。生成时间：{new Date(preview.generatedAt).toLocaleString("zh-CN")}</p><ul>{Object.entries(preview.counts).map(([key, count]) => <li key={key}>{tableLabels[key] ?? "关联记录"}：{count}</li>)}</ul><p>会话关联调用、活动、命令与学习流水；事件关联归属、处理审计和请求结果；日报关联来源版本和分步记录。缺归属的历史事件需另行核对，共享字卡、课文和短文不在删除范围；家长登录凭证单独管理。</p></div>}</section>
      </>}
    </>}
  </main>;
}

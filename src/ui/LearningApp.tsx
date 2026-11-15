"use client";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LearningController } from "./controller";
import type { ScreenDecoder } from "./model";
import type { LearningService } from "./service";
import { Frame, LearningScreen } from "./screens";
export function LearningApp({ service, decode }: { service: LearningService; decode?: ScreenDecoder }) {
  const sequence = useRef(0);
  const binding = useMemo(() => ({ key: ++sequence.current, controller: new LearningController(service, decode) }), [service, decode]);
  return <BoundLearningApp key={binding.key} controller={binding.controller} service={service}/>;
}
function BoundLearningApp({ controller, service }: { controller: LearningController; service: LearningService }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [essayDraft, setEssayDraft] = useState("");
  useEffect(() => { if (["essay_feedback", "wrap_up", "ended"].includes(state.view?.screen ?? "")) setEssayDraft(""); }, [state.view?.screen]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true; void controller.start();
    // StrictMode同步重挂保留同一操作；真正离开后丢弃迟到结果并取消网络。
    return () => { mounted.current = false; queueMicrotask(() => { if (!mounted.current) controller.dispose(); }); };
  }, [controller]);
  useEffect(() => { if (!state.busy) document.querySelector<HTMLHeadingElement>(".child-app h1")?.focus(); }, [state.view, state.busy]);
  if (state.restartAvailable && !state.busy) return <Frame title="接着学语文" eyebrow="慢慢来" onQuit={controller.leaveUnavailable}><p role="status">这次学习暂时找不到了，可以重新开始。</p><button className="primary" onClick={() => void controller.restart()}>重新开始</button></Frame>;
  if (state.busy || state.retry || !state.view) return <Frame title="小问号陪着你" eyebrow="慢慢来" onQuit={() => void controller.event({ type: "quit" })}><div className="status" role="status" aria-live="polite"><p>小问号在想，等一下</p>{state.retry && <button className="primary" onClick={() => void controller.retry()}>再试一次</button>}</div></Frame>;
  return <LearningScreen key={state.view.screen === "essay_cards" ? "essay_cards" : JSON.stringify(state.view)} view={state.view} notice={state.notice} actions={{ restart: service.restart ? controller.restart : undefined, event: controller.event, homework: controller.homework, coach: controller.coach, essayDraft: { text: essayDraft, onChange: setEssayDraft }, essay: controller.essay, reading: controller.reading, readingCard: service.readingCard }}/>;
}

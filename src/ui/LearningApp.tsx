"use client";
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { LearningController } from "./controller";
import type { ScreenDecoder } from "./model";
import type { LearningService } from "./service";
import { Frame, LearningScreen } from "./screens";
export function LearningApp({ service, decode }: { service: LearningService; decode?: ScreenDecoder }) {
  const controllerRef = useRef<LearningController | null>(null);
  if (!controllerRef.current) controllerRef.current = new LearningController(service, decode);
  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void controller.start(); } }, [controller]);
  useEffect(() => { if (!state.busy) document.querySelector<HTMLHeadingElement>(".child-app h1")?.focus(); }, [state.view, state.busy]);
  if (state.busy || state.retry || !state.view) return <Frame title="小问号陪着你" eyebrow="慢慢来" onQuit={() => void controller.event({ type: "quit" })}><div className="status" role="status" aria-live="polite"><p>小问号在想，等一下</p>{state.retry && <button className="primary" onClick={() => void controller.retry()}>再试一次</button>}</div></Frame>;
  return <LearningScreen key={JSON.stringify(state.view)} view={state.view} notice={state.notice} actions={{ event: controller.event, homework: controller.homework, coach: controller.coach, reading: controller.reading, readingCard: service.readingCard }}/>;
}

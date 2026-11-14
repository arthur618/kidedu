"use client";
import React, { useMemo } from "react";
import { SpeechProvider } from "./speech/context";
import { LearningApp } from "./LearningApp";
import { createHttpService } from "./service";
export function HttpLearningApp({ childId, lessonId }: { childId: string; lessonId: string }) {
  const service = useMemo(() => createHttpService({ childId, lessonId }), [childId, lessonId]);
  return <SpeechProvider><LearningApp service={service}/></SpeechProvider>;
}

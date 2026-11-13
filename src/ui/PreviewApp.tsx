"use client";
import React, { useMemo } from "react";
import { SessionStateSchema } from "../contracts/orchestrator";
import { LearningApp } from "./LearningApp";
import { createDemoService } from "./demo";
export function PreviewApp({ screen }: { screen?: string }) {
  const service = useMemo(() => createDemoService(SessionStateSchema.catch("homework_capture").parse(screen)), [screen]);
  return <LearningApp service={service}/>;
}

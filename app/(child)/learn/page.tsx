import React from "react";
import { HttpLearningApp } from "@/ui/HttpLearningApp";
import "@/ui/child.css";
export default async function LearnPage({ searchParams }: { searchParams: Promise<{ childId?: string; lessonId?: string }> }) {
  const params = await searchParams;
  return <HttpLearningApp childId={params.childId ?? "child-demo-1"} lessonId={params.lessonId ?? "lesson-demo-g3-1"}/>;
}

import React from "react";
import { notFound } from "next/navigation";
import { PreviewApp } from "@/ui/PreviewApp";
import "@/ui/child.css";
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (process.env.CHILD_UI_PREVIEW !== "1") notFound();
  const params = await searchParams;
  return <PreviewApp screen={params.screen}/>;
}

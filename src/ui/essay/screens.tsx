"use client";
import React, { useState } from "react";
import { useSpeechInput } from "../speech/input";
import type { z } from "zod";
import type { EssayActionSchema } from "../../contracts/essay";
type EssayAction = z.infer<typeof EssayActionSchema>;
import type { ScreenData } from "../model";
export function EssayInterview({ data, answer, done }: { data: ScreenData["essay_interview"]; answer: (text: string) => void; done: () => void }) {
  const [text, setText] = useState("");
  const speech = useSpeechInput(setText);
  if (data.mode !== "ready") return <p>小问号还在准备。</p>;
  return <><h2 style={{ overflowWrap: "anywhere" }}>{data.topic}</h2><p>{data.say}</p>{data.ask && <p className="ask">{data.ask}</p>}<form onSubmit={event => { event.preventDefault(); if (text.trim()) { speech.cancel(); answer(text.trim()); } }}><label htmlFor="essay-answer">我的想法</label><textarea id="essay-answer" maxLength={2000} value={text} onChange={event => { speech.cancel(); setText(event.target.value); }}/>{speech.control}<button className="primary" disabled={!text.trim()}>把这个想法留下</button></form><button onClick={() => { speech.cancel(); done(); }}>这些够了</button></>;
}
export function EssayCards({ data, action, draft }: { draft?: { text: string; onChange: (text: string) => void }; data: ScreenData["essay_cards"]; action: (value: EssayAction) => void }) {
  const [localText, setLocalText] = useState(""); const [empty, setEmpty] = useState(false);
  const text = draft?.text ?? localText; const setText = draft?.onChange ?? setLocalText;
  if (data.mode !== "ready") return <p>小问号还在准备。</p>;
  return <><h2 style={{ overflowWrap: "anywhere" }}>{data.topic}</h2><p>这些是你的想法，都是你的原话。</p>{!data.cards.length && <p>还没有小卡片，也可以自己写。</p>}<div aria-label="你的原话">{data.cards.map(card => <section key={card.id} style={{ overflowWrap: "anywhere" }}><p>{card.text}</p><button aria-pressed={card.selected} onClick={() => action({ type: "select_card", cardId: card.id, selected: !card.selected })}>{card.selected ? "已选这个想法" : "选这个想法"}</button><button aria-label={`删除想法：${card.text}`} onClick={() => action({ type: "delete_card", cardId: card.id })}>删除</button></section>)}</div><form onSubmit={event => { event.preventDefault(); if (!text.trim()) { setEmpty(true); return; } action({ type: "submit_essay", text: text.trim() }); }}><label htmlFor="essay-text">我自己写的文章</label><textarea id="essay-text" maxLength={10000} rows={10} style={{ minHeight: 280, fontSize: 22, lineHeight: 1.8 }} value={text} onChange={event => { setText(event.target.value); setEmpty(false); }}/>{empty && <p role="status">写下一点自己的话，再给小问号看看吧。</p>}<button className="primary">给小问号读一读</button></form></>;
}
export function EssayFeedback({ data, done }: { data: ScreenData["essay_feedback"]; done: () => void }) {
  if (data.mode !== "ready") return <p>小问号还在准备。</p>;
  return <><p>{data.say}</p><p className="ask">{data.ask}</p><button className="primary" onClick={done}>先写到这里</button></>;
}

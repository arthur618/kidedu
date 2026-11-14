"use client";
import React, { useState } from "react";
import type { CharCard } from "../../contracts/schemas";
import type { ScreenData } from "../model";
export function Reading({ data, onDone, lookup }: { data: ScreenData["reading"]; onDone: () => void; lookup?: (char: string) => Promise<CharCard | null> }) {
  const [selected, setSelected] = useState("");
  const [card, setCard] = useState<CharCard | null>();
  const [busy, setBusy] = useState(false);
  if (data.mode !== "ready") return <p>小问号还在准备新故事。</p>;
  const body = data.passage.body;
  return <><h2>{data.passage.title}</h2><p style={{ fontSize: 24, lineHeight: 2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} onClick={event => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && Array.from(selection).length === 1 && body.includes(selection)) { setSelected(selection); setCard(undefined); return; }
    // 文本字形仅用于选择；查卡通过下面的大按钮执行。
    const target = event.target as HTMLElement;
    if (target.dataset.char) { setSelected(target.dataset.char); setCard(undefined); }
  }}>{Array.from(body).map((char, index) => <span key={index} data-char={char} style={{ background: selected === char ? "#fff0ba" : undefined }}>{char}</span>)}</p>
  <form onSubmit={async event => { event.preventDefault(); setBusy(true); try { setCard(await lookup?.(selected) ?? null); } catch { setCard(null); } finally { setBusy(false); } }}>
    <label htmlFor="reading-char">选一个想看的字</label><input id="reading-char" value={selected} onChange={event => { setSelected(Array.from(event.target.value).slice(-1).join("")); setCard(undefined); }}/>
    <button type="submit" disabled={busy || Array.from(selected).length !== 1 || !body.includes(selected)} style={{ minHeight: 56 }}>看看字卡</button>
  </form>{card === null && <p role="status">这个字的字卡还没准备好。</p>}{card && <aside aria-label="只读字卡"><p>{card.char}　{card.pinyin}</p><p>{card.explain}</p><p>{card.words.join("、")}</p></aside>}
  <button className="primary" onClick={onDone}>我读完了</button></>;
}
export function Retell({ data, onText }: { data: ScreenData["retell"]; onText: (text: string) => void }) {
  const [text, setText] = useState("");
  if (data.mode !== "ready") return <p>小问号还在准备新故事。</p>;
  return <><p>{data.say}</p>{data.ask && <p className="ask">{data.ask}</p>}<form onSubmit={event => { event.preventDefault(); if (text.trim()) onText(text.trim()); }}><label htmlFor="reading-answer">我想说</label><textarea id="reading-answer" maxLength={2000} value={text} onChange={event => setText(event.target.value)}/><button className="primary" disabled={!text.trim()}>好了，听听我的</button></form></>;
}

"use client";
import { EssayInterview, EssayCards, EssayFeedback } from "./essay/screens";
import { Reading, Retell } from "./reading/screens";
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import type { HomeworkItem } from "../contracts/schemas";
import type { SessionEvent } from "../contracts/orchestrator";
import type { ScreenData, View } from "./model";
import { useSpeechInput } from "./speech/input";
import { SpeechPlayback } from "./speech/playback";
import { compressPhoto, cropPhoto } from "./images";

export function Robot() {
  return <svg role="img" aria-label="小问号机器人" viewBox="0 0 80 80" width="64" height="64"><path d="M40 16V8" stroke="currentColor" strokeWidth="4"/><circle cx="40" cy="7" r="5" fill="#efbd56"/><rect x="10" y="17" width="60" height="51" rx="21" fill="#dceee6" stroke="currentColor" strokeWidth="3"/><circle cx="27" cy="42" r="4" fill="currentColor"/><circle cx="53" cy="42" r="4" fill="currentColor"/><path d="M32 54q8 7 16 0" fill="none" stroke="currentColor" strokeWidth="3"/><text x="35" y="32" fontSize="18" fill="currentColor">?</text></svg>;
}
export function Frame({ title, eyebrow, children, onQuit }: { title: string; eyebrow: string; children: ReactNode; onQuit: () => void }) {
  return <div className="child-app"><header className="topbar"><span className="brand"><Robot/><span>小问号<br/>陪你学语文</span></span><button className="exit" onClick={onQuit}>今天先到这</button></header><main className="learning-card"><p className="eyebrow">{eyebrow}</p><h1 tabIndex={-1}>{title}</h1>{children}</main><footer>慢慢来，每一步都算数。</footer></div>;
}
export function PhotoPicker({ label, onPhoto }: { label: string; onPhoto: (photo: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  return <div><input ref={input} className="file-input" type="file" accept="image/*" capture="environment" aria-label={label} tabIndex={-1} onChange={async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setRetry(false);
    try { onPhoto(await compressPhoto(file)); } catch { setRetry(true); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }}/><button className="primary" disabled={busy} onClick={() => input.current?.click()}><span aria-hidden="true">▣ </span>{busy ? "小问号在想，等一下" : label}</button>{retry && <p role="status">这张照片还没看清，再拍一次吧。</p>}</div>;
}
export function HomeworkCapture({ onPhoto, onText }: { onPhoto: (photo: string) => void; onText: (text: string) => void }) {
  const [speaking, setSpeaking] = useState(false);
  const [text, setText] = useState("");
  const voice = useSpeechInput(setText);
  return <><p className="lead">把今天的作业给我看看，<br/>我们一起慢慢做。</p><div className="capture-art" aria-hidden="true"><span>语 文</span><i/><i/><i/><b>✦</b></div>{!speaking ? <div className="actions"><PhotoPicker label="拍下今天的作业" onPhoto={onPhoto}/><button onClick={() => setSpeaking(true)}>我来说</button></div> : <form onSubmit={event => { event.preventDefault(); if (text.trim()) onText(text.trim()); }}><label htmlFor="homework-text">今天要做什么？</label><textarea id="homework-text" value={text} onChange={event => { voice.cancel(); setText(event.target.value); }} placeholder="把作业写在这里"/>{voice.control}<button className="primary" disabled={!text.trim()}>好了，给你看看</button><button type="button" onClick={() => { voice.cancel(); setSpeaking(false); }}>还是拍照吧</button></form>}</>;
}
export function HomeworkList({ items, onDone }: { items: HomeworkItem[]; onDone: (items: HomeworkItem[]) => void }) {
  const [draft, setDraft] = useState(items);
  return <><p>看看有没有漏下或多出来的。</p><div className="homework-list">{draft.map((item, index) => <div className="homework-row" key={item.id}><span aria-hidden="true" className="item-number">{index + 1}</span><label><span className="sr-only">第{index + 1}项作业</span><input value={item.text} onChange={event => setDraft(draft.map(row => row.id === item.id ? { ...row, text: event.target.value } : row))}/></label><button aria-label={`去掉第${index + 1}项`} onClick={() => setDraft(draft.filter(row => row.id !== item.id))}>去掉</button></div>)}</div>{draft.length === 0 && <p>今天的清单空空的，也可以开始认字。</p>}<button className="primary" disabled={draft.some(item => !item.text.trim())} onClick={() => onDone(draft.map(item => ({ ...item, text: item.text.trim() })))}>对的，开始</button></>;
}
export function Recognize({ data, onAnswer }: { data: ScreenData["recognize"]; onAnswer: (correct: boolean) => void }) {
  const word = data.word ?? data.char;
  return <><p>看一看，亮起来的字你认识吗？</p><div className="recognize-word" aria-label={word}>{Array.from(word).map((letter, i) => letter === data.char ? <mark key={i}>{letter}</mark> : <span key={i}>{letter}</span>)}</div><p className="gentle">不认识也没关系，我们一起看看。</p><div className="choices"><button className="primary" onClick={() => onAnswer(true)}>认识</button><button onClick={() => onAnswer(false)}>还不认识</button></div></>;
}
export function Understand({ data, onText }: { data: ScreenData["understand"]; onText: (text: string) => void }) {
  const [text, setText] = useState("");
  const voice = useSpeechInput(setText);
  return <><div className="char-card"><p className="pinyin">{data.card.pinyin}</p><div className="big-char">{data.card.char}</div></div><div className="speech"><p>{data.say}</p>{data.ask && <p className="ask">{data.ask}</p>}</div><form onSubmit={event => { event.preventDefault(); onText(text.trim()); }}><label htmlFor="child-answer">我想说</label><textarea id="child-answer" value={text} onChange={event => { voice.cancel(); setText(event.target.value); }} placeholder="写下你的想法"/>{voice.control}<button className="primary">{text.trim() ? "好了，听听我的" : "我听完了"}</button></form></>;
}
export function DictationPlay({ data, onDone }: { data: ScreenData["dictation_play"]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [played, setPlayed] = useState(false);
  const card = data.cards[index]!;
  return <><p className="step">第 {index + 1} 个，共 {data.cards.length} 个</p><div className="sound-art" aria-hidden="true">♫</div><p>拿好纸和笔，听一听，再写下来。</p><SpeechPlayback key={card.char} card={card} played={played} onPlayed={() => setPlayed(true)}/>{played && <button className="primary" onClick={() => { if (index === data.cards.length - 1) onDone(); else { setIndex(index + 1); setPlayed(false); } }}>下一个</button>}</>;
}
export function DictationCapture({ onPhoto }: { onPhoto: (photo: string) => void }) {
  return <><p>把刚才写的字拍下来，<br/>我们放在一起看看。</p><div className="paper-art" aria-hidden="true"><span>田</span><span>田</span><span>田</span></div><p className="gentle">把纸放平，让每个字都拍清楚。</p><PhotoPicker label="拍下我写的字" onPhoto={onPhoto}/></>;
}
function WrittenPhoto({ imageUrl, mark, onReady }: { imageUrl: string; mark: ScreenData["dictation_compare"]["marks"][number]; onReady: (ready: boolean) => void }) {
  const [src, setSrc] = useState<string>();
  const [retry, setRetry] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    onReady(false); setSrc(undefined); setRetry(false);
    const prepare = mark.box ? cropPhoto(imageUrl, mark.box) : Promise.resolve(imageUrl);
    void prepare.then(value => { if (active) setSrc(value); }).catch(() => { if (active) setRetry(true); });
    return () => { active = false; };
  }, [imageUrl, mark, attempt, onReady]);
  return <figure><figcaption>我写的</figcaption>{src && <img key={attempt} src={src} alt={`纸上的${mark.word}`} onLoad={() => onReady(true)} onError={() => { onReady(false); setRetry(true); }}/ >}{!mark.box && <p>在照片里找：<mark>{mark.word}</mark></p>}{retry && <div role="status"><p>这张照片还没看清，可以再试一次，或者今天先到这。</p><button onClick={() => setAttempt(value => value + 1)}>再试一次</button></div>}</figure>;
}
export function DictationCompare({ data, onDone }: { data: ScreenData["dictation_compare"]; onDone: (results: { char: string; result: "correct" | "wrong" }[]) => void }) {
  const [answers, setAnswers] = useState<Record<string, "correct" | "wrong">>({});
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const callbacks = useRef<Record<string, (value: boolean) => void>>({});
  return <><p>一个字一个字看，你来做决定。</p>{data.chars.map(char => {
    const mark = data.marks.find(item => item.expected === char)!;
    callbacks.current[char] ??= value => { setReady(previous => ({ ...previous, [char]: value })); if (!value) setAnswers(previous => { const next = { ...previous }; delete next[char]; return next; }); };
    return <section className="compare-card" key={char} aria-label={`对照${char}`}><div className="comparison"><WrittenPhoto imageUrl={data.imageUrl} mark={mark} onReady={callbacks.current[char]}/><figure><figcaption>字卡上的</figcaption><div className="standard-char">{char}</div></figure></div>{mark.suspicious && <p className="notice">✦ 这里可能不一样，仔细看看。</p>}<div className="choices"><button disabled={!ready[char]} aria-pressed={answers[char] === "correct"} onClick={() => setAnswers({ ...answers, [char]: "correct" })}>一样</button><button disabled={!ready[char]} aria-pressed={answers[char] === "wrong"} onClick={() => setAnswers({ ...answers, [char]: "wrong" })}>不一样</button></div>{answers[char] === "wrong" && <p className="gentle">这个字我们再看看。</p>}</section>;
  })}<button className="primary" disabled={data.chars.some(char => !ready[char] || !answers[char])} onClick={() => onDone(data.chars.map(char => ({ char, result: answers[char]! })))}>我看好了</button></>;
}
export function ReadingOffer({ onChoice }: { onChoice: (accept: boolean) => void }) {
  return <><div className="story-art" aria-hidden="true">☾<span>✦</span></div><p className="lead">今天有个小故事，要读吗？</p><div className="actions"><button className="primary" onClick={() => onChoice(true)}>想读一读</button><button onClick={() => onChoice(false)}>下次再读</button></div></>;
}
export function WrapUp({ data, onMood }: { data: ScreenData["wrap_up"]; onMood: () => void }) {
  return <><p className="lead">你认真走过的每一步，<br/>小问号都记得。</p><div className="summary"><p>今天一起学过</p><p className="summary-chars">{data.learned.join("　") || "今天先歇一歇"}</p><p>这些字，过几天再见</p><p className="summary-chars">{data.revisit.join("　") || "下次再来找新朋友"}</p></div><p>现在的心情，像哪一个？</p><div className="moods">{[["😊", "开心"], ["🙂", "平静"], ["😴", "想休息"]].map(([face, label]) => <button key={label} aria-label={label} onClick={onMood}><span aria-hidden="true">{face}</span><span>{label}</span></button>)}</div></>;
}
export function ComingSoon() { return <><div className="story-art" aria-hidden="true">✦</div><p className="lead">即将开放</p><p>小问号还在准备新故事。</p></>; }
export function Ended() { return <><div className="sound-art" aria-hidden="true">☀</div><p className="lead">今天辛苦啦，去休息吧。</p><p>下次见，小问号在这里等你。</p></>; }
const titles: Record<View["screen"], [string, string]> = {
  unavailable: ["今天先歇一歇", "慢慢来"], idle: ["你好，我是小问号", "一起学语文"], homework_capture: ["今天，我们做什么？", "从这里开始"], homework_confirm: ["这是今天的作业吗？", "看看小清单"], recognize: ["和这个字打个招呼", "认一认"], understand: ["一起认识它", "想一想"], dictation_play: ["把听到的写下来", "听一听 · 写一写"], dictation_capture: ["让我看看你的字", "拍下小作品"], dictation_compare: ["放在一起，仔细看看", "比一比"], reading_offer: ["再遇见一个小故事", "读一点点"], reading: ["故事小天地", "读一读"], retell: ["说给小问号听", "聊一聊"], essay_interview: ["收集你的好想法", "想一想"], essay_cards: ["你的想法小卡片", "看一看"], essay_feedback: ["一起看看你的文章", "聊一聊"], wrap_up: ["今天的小收获", "给自己一个微笑"], ended: ["我们下次见", "好好休息"],
};
export interface ScreenActions { essayDraft?: { text: string; onChange: (text: string) => void }; essay?: (input: Parameters<NonNullable<import("./service").LearningService["essay"]>>[0]) => void; reading?: (input: { text: string }) => void; readingCard?: (char: string) => Promise<import("../contracts/schemas").CharCard | null>; event: (event: SessionEvent) => void; homework: (input: { imageDataUrl?: string; spokenText?: string }) => void; coach: (input: { char: string; text: string }) => void }
export function LearningScreen({ view, actions, notice }: { view: View; actions: ScreenActions; notice?: string }) {
  let content: ReactNode;
  switch (view.screen) {
    case "unavailable": content = <p className="lead">{view.data.say}</p>; break;
    case "homework_capture": content = <HomeworkCapture onPhoto={imageDataUrl => actions.homework({ imageDataUrl })} onText={spokenText => actions.homework({ spokenText })}/>; break;
    case "homework_confirm": content = <HomeworkList items={view.data.items} onDone={items => actions.event({ type: "homework_confirmed", items })}/>; break;
    case "recognize": content = <Recognize data={view.data} onAnswer={correct => actions.event({ type: "recognize_result", char: view.data.char, result: correct ? "correct" : "wrong", mode: "self_report" })}/>; break;
    case "understand": content = <Understand data={view.data} onText={text => actions.coach({ char: view.data.card.char, text })}/>; break;
    case "dictation_play": content = <DictationPlay data={view.data} onDone={() => actions.event({ type: "dictation_played" })}/>; break;
    case "dictation_capture": content = <DictationCapture onPhoto={imageUrl => actions.event({ type: "dictation_photo", imageUrl })}/>; break;
    case "dictation_compare": content = <DictationCompare data={view.data} onDone={results => actions.event({ type: "dictation_confirmed", results })}/ >; break;
    case "reading_offer": content = <ReadingOffer onChoice={accept => actions.event({ type: "reading_choice", accept })}/>; break;
    case "reading": content = <Reading data={view.data} onDone={() => actions.event({ type: "reading_done" })} lookup={actions.readingCard}/>; break;
    case "retell": content = <Retell data={view.data} onText={text => actions.reading?.({ text })}/>; break;
    case "essay_interview": content = view.data.mode !== "ready" ? <ComingSoon/> : <EssayInterview data={view.data} answer={text => actions.essay?.({ type: "answer", text })} done={() => actions.event({ type: "essay_step_done" })}/>; break;
    case "essay_cards": content = view.data.mode !== "ready" ? <ComingSoon/> : <EssayCards data={view.data} draft={actions.essayDraft} action={value => actions.essay?.(value)}/>; break;
    case "essay_feedback": content = view.data.mode !== "ready" ? <ComingSoon/> : <EssayFeedback data={view.data} done={() => actions.event({ type: "essay_step_done" })}/>; break;
    case "wrap_up": content = <WrapUp data={view.data} onMood={() => actions.event({ type: "wrap_up_done" })}/>; break;
    case "ended": content = <Ended/>; break;
    default: content = <ComingSoon/>;
  }
  const [title, eyebrow] = titles[view.screen];
  return <Frame title={title} eyebrow={eyebrow} onQuit={() => actions.event({ type: "quit" })}>{notice && <p role="status">{notice}</p>}{content}</Frame>;
}

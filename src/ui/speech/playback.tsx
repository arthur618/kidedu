"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CharCard } from '../../contracts/schemas';
import { useSpeech } from './context';
export function SpeechPlayback({ card, played, onPlayed }: { card: CharCard; played: boolean; onPlayed: () => void }) {
  const { capabilities, client } = useSpeech();
  const [retry, setRetry] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    const old = audio.current;
    if (old && old !== element) { old.pause(); old.removeAttribute('src'); old.load(); }
    audio.current = element;
  }, []);
  const operation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  function clear() {
    ++operation.current; abort.current?.abort(); abort.current = null;
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); }
    if (url.current) URL.revokeObjectURL(url.current); url.current = null;
  }
  useEffect(() => () => clear(), [card.char]);
  async function play() {
    clear(); const generation = operation.current;
    onPlayed(); setRetry(false);
    try {
      let src = card.status === 'approved' ? card.audioUrl : null;
      if (!src && card.status === 'approved' && capabilities.tts && client) {
        const controller = new AbortController(); abort.current = controller;
        const blob = await client.synthesize(card.char, controller.signal);
        if (generation !== operation.current) return;
        if (blob) { src = URL.createObjectURL(blob); url.current = src; }
      }
      if (generation !== operation.current) return;
      if (!src || !audio.current) { setRetry(Boolean(card.audioUrl || capabilities.tts)); return; }
      audio.current.src = src;
      await audio.current.play();
    } catch { if (generation === operation.current) setRetry(true); }
  }
  return <><audio ref={attachAudio} preload="none"/>{!card.audioUrl && !capabilities.tts && <p className="speech">{card.dictationContext}</p>}<button className={played ? '' : 'primary'} onClick={() => void play()}>{played ? '再听一遍' : '播放这个词'}</button>{retry && <p role="status">暂时听不到，看看这句报词吧：{card.dictationContext}</p>}</>;
}

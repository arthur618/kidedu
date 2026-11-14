"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MemoryRecorder, recordingFallback, type RecordingState } from './recorder';
import { useSpeech } from './context';
export function useSpeechInput(onText: (text: string) => void) {
  const { capabilities, client } = useSpeech();
  const callback = useRef(onText); callback.current = onText;
  const [state, setState] = useState<RecordingState>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string>();
  const previewUrl = useRef<string | undefined>(undefined);
  const audio = useRef<HTMLAudioElement>(null);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    const old = audio.current;
    if (old && old !== element) { old.pause(); old.removeAttribute('src'); old.load(); }
    audio.current = element;
  }, []);
  function clearPreview() { if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); } if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = undefined; setPreview(undefined); }
  const recorder = useMemo(() => client && typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia ? new MemoryRecorder({ recorder: MediaRecorder, getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }), now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) }, client, (next, message) => { setState(next); setMessage(message ?? ''); }, text => callback.current(text), blob => { clearPreview(); previewUrl.current = URL.createObjectURL(blob); setPreview(previewUrl.current); }) : null, [client]);
  useEffect(() => () => { recorder?.cancel(); audio.current?.pause(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, [recorder]);
  return {
    cancel: () => { recorder?.reset(); clearPreview(); },
    control: capabilities.asr ? <div><button type="button" style={{ minHeight: 56 }} onClick={() => { if (!recorder) { setMessage(recordingFallback); return; } if (state === 'recording') recorder.stop(); else { clearPreview(); void recorder.start(); } }}>{state === 'recording' ? '说好了' : state === 'permission' || state === 'transcribing' ? '重新说' : '开始说'}</button>{preview && <><audio ref={attachAudio} src={preview}/><button type="button" style={{ minHeight: 56 }} onClick={() => { if (audio.current) { audio.current.currentTime = 0; const current = previewUrl.current; void audio.current.play().catch(() => { if (previewUrl.current === current) setMessage(recordingFallback); }); } }}>听听我说的</button></>}{message && <p role="status">{message}</p>}</div> : null,
  };
}

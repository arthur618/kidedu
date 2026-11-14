"use client";
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createSpeechClient, disabledSpeech } from './client';
import type { SpeechCapabilities } from '../../contracts/speech';
const SpeechContext = createContext({ capabilities: disabledSpeech, client: null as ReturnType<typeof createSpeechClient> | null });
export function SpeechProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createSpeechClient(), []);
  const [capabilities, setCapabilities] = useState<SpeechCapabilities>(disabledSpeech);
  useEffect(() => { const abort = new AbortController(); void client.capabilities(abort.signal).then(value => { if (!abort.signal.aborted) setCapabilities(value); }); return () => abort.abort(); }, [client]);
  return <SpeechContext.Provider value={{ capabilities, client }}>{children}</SpeechContext.Provider>;
}
export const useSpeech = () => useContext(SpeechContext);

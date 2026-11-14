import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { database, seed } from '../helpers';
import { getPrisma } from '../../../src/db/client';
import { getCharCard } from '../../../src/db/charCard';
import { createSpeechHandlers } from '../../../src/server/speech';
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => { db = await database(); await seed(); });
afterAll(async () => db.cleanup());
it('[5] 真实handler/approved SQLite/假适配器；持久表与控制台无媒体，学习计数不变', async () => {
  const tables = ['sessionCommand','coachRuntime','turn','incident','sessionRuntime','session','childChar','charCard','lesson','child'] as const;
  const snapshot = async () => Promise.all(tables.map(table => (getPrisma()[table] as unknown as { findMany(): Promise<unknown[]> }).findMany()));
  const before = await snapshot(); const bytes = Buffer.from('C8A_INVENTED_AUDIO_MEMORY_ONLY'); const encoded = bytes.toString('base64');
  const logs: unknown[] = []; const spies = ['log','error','warn','info','debug'].map(method => vi.spyOn(console, method as 'log').mockImplementation((...args) => { logs.push(args); }));
  try {
    const texts: string[] = [];
    const h = createSpeechHandlers({ getCharCard, asr: { transcribe: async () => ({ text: '我想读书', pinyin: [] }) }, tts: { synthesize: async text => { texts.push(text); return { bytes, mimeType: 'audio/wav' }; } } });
    const request = (value: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(value) });
    expect(await (await h.transcribe(request({ audioBase64: encoded, durationMs: 100, mimeType: 'audio/wav' }))).json()).toEqual({ status: 'ok', text: '我想读书', pinyin: [] });
    expect(Buffer.from(await (await h.synthesize(request({ char: '水' }))).arrayBuffer())).toEqual(bytes); expect(texts).toEqual([(await getCharCard('水'))!.dictationContext]);
    expect(await (await h.synthesize(request({ char: '无' }))).json()).toEqual({ status: 'unavailable' });
    const after = await snapshot(); expect(after).toEqual(before); expect(JSON.stringify(after)).not.toContain(encoded); expect(JSON.stringify(after)).not.toContain('C8A_INVENTED_AUDIO_MEMORY_ONLY'); expect(logs).toEqual([]);
  } finally { spies.forEach(spy => spy.mockRestore()); }
});

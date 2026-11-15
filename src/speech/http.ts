/** 有界完整读取；错误正文从不传播，取消实际关闭reader。 */
export async function readSpeechBody(response: Response, max: number, signal: AbortSignal): Promise<Uint8Array | null> {
  const rawLength = response.headers.get('content-length');
  const length = rawLength === null ? null : /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
  if (signal.aborted || !response.body || (length !== null && (!Number.isSafeInteger(length) || length <= 0 || length > max))) { void response.body?.cancel().catch(() => {}); return null; }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) { const next = await reader.read(); if (signal.aborted) return null; if (next.done) break; size += next.value.length; if (size > max) return null; chunks.push(next.value); }
    if (!size || (length !== null && size !== length)) return null;
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
  } catch { return null; }
  finally { signal.removeEventListener('abort', cancel); cancel(); }
}

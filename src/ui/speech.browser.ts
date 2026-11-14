import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { database, seed, harness, chars, photo } from '../../tests/integration/helpers';
import { getPrisma } from '../db/client';
import { getCharCard } from '../db/charCard';
import { createSpeechHandlers } from '../server/speech';
let db: Awaited<ReturnType<typeof database>>; let server: Server; let origin: string; let h: ReturnType<typeof harness>;
let asrCalls = 0; let ttsCalls: string[] = []; let mode = 'success'; let pending: (() => void)[] = [];
const speech = createSpeechHandlers({ getCharCard, asr: { async transcribe() { ++asrCalls; if (mode === 'late-asr') await new Promise<void>(resolve => pending.push(resolve)); return { text: '我想读书', pinyin: [] }; } }, tts: { async synthesize(text) { ttsCalls.push(text); if (mode === 'late-tts') await new Promise<void>(resolve => pending.push(resolve)); if (mode === 'reject-tts') throw new Error(); return { bytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav' }; } } });
test.beforeAll(async () => {
  db = await database();
  server = createServer(async (incoming, outgoing) => {
    try {
      const pieces: Buffer[] = []; for await (const chunk of incoming) pieces.push(Buffer.from(chunk));
      const url = new URL(incoming.url!, 'http://localhost'); const paths = url.pathname.split('/').filter(Boolean);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers as Record<string,string>, ...(incoming.method === 'GET' ? {} : { body: Buffer.concat(pieces).toString() }) });
      const response = paths[1] === 'speech' ? paths[2] === 'capabilities' ? speech.capabilities() : paths[2] === 'transcribe' ? await speech.transcribe(request) : await speech.synthesize(request) : incoming.method === 'GET' ? await h.handlers().get(paths[2]!) : await h.handlers().post(paths.length === 2 ? 'start' : paths[3] as 'event' | 'homework' | 'coach', request, paths[2]);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('test_service_unavailable'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { pending.forEach(resolve => resolve()); await new Promise<void>(resolve => server.close(() => resolve())); await db.cleanup(); });
test.beforeEach(async ({ page }) => {
  await seed(); h = harness(); asrCalls = 0; ttsCalls = []; mode = 'success'; pending = [];
  await page.route('**/api/**', async route => { const response = await route.fetch({ url: origin + new URL(route.request().url()).pathname }); await route.fulfill({ response }); });
  await page.addInitScript(() => {
    const state = { denied: false, delay: false, tracks: 0, starts: 0, stops: 0, plays: 0, pauses: 0, created: 0, revoked: 0, active: 0, resolvePermission: null as (() => void) | null };
    Object.assign(window, { speechTest: state });
    const stream = () => ({ getTracks: () => [{ stop: () => { ++state.tracks; } }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { if (state.denied) throw new DOMException('fictional denial', 'NotAllowedError'); if (state.delay) await new Promise<void>(resolve => { state.resolvePermission = resolve; }); return stream(); } } });
    class FakeRecorder {
      static isTypeSupported(mime: string) { return mime === 'audio/webm'; }
      state = 'inactive'; ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
      start() { this.state = 'recording'; ++state.starts; }
      stop() { this.state = 'inactive'; ++state.stops; this.ondataavailable?.({ data: new Blob(['fictional browser recording'], { type: 'audio/webm;codecs=opus' }) }); this.onstop?.(); }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder });
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { ++state.created; return create(blob); }; URL.revokeObjectURL = url => { ++state.revoked; revoke(url); };
    const playing = new Set<HTMLMediaElement>(); HTMLMediaElement.prototype.play = async function() { ++state.plays; playing.add(this); state.active = playing.size; }; HTMLMediaElement.prototype.pause = function() { ++state.pauses; playing.delete(this); state.active = playing.size; }; HTMLMediaElement.prototype.load = function() {};
  });
});
async function open(page: Page) { await page.goto('/learn?childId=child-test-1&lessonId=c7-lesson'); await page.getByRole('button', { name: '我来说', exact: true }).click(); await expect(page.getByRole('button', { name: '开始说', exact: true })).toBeVisible(); }
async function sendHomework(page: Page) { await page.getByLabel('今天要做什么？').fill('读一读自编课文的生字'); await page.getByRole('button', { name: '好了，给你看看' }).click(); await page.getByRole('button', { name: '对的，开始' }).click(); }
async function understand(page: Page) { await sendHomework(page); for (const char of chars) { await expect(page.locator('.recognize-word mark')).toHaveText(char); await page.getByRole('button', { name: '认识', exact: true }).click(); } }
async function dictation(page: Page) { await understand(page); for (const char of chars) { await expect(page.locator('.big-char')).toHaveText(char); await page.getByRole('button', { name: '我听完了', exact: true }).click(); await page.getByLabel('我想说').fill(`${char}字`); await page.getByRole('button', { name: '好了，听听我的' }).click(); await page.getByLabel('我想说').fill('我说了自己想到的一句话。'); await page.getByRole('button', { name: '好了，听听我的' }).click(); } await expect(page.getByRole('button', { name: '播放这个词', exact: true })).toBeVisible(); }
async function counters(page: Page) { return page.evaluate(() => (window as unknown as { speechTest: { tracks: number; starts: number; stops: number; plays: number; pauses: number; created: number; revoked: number; active: number } }).speechTest); }
for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 900 }]) test(`[6/9] ${viewport.width} 录音→停止→本机试听→编辑→原按钮手动发送，触控56px`, async ({ page }) => {
  await page.setViewportSize(viewport); await open(page);
  const before = await getPrisma().sessionCommand.count();
  await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await page.getByRole('button', { name: '说好了', exact: true }).click({ timeout: 5000 });
  await expect(page.getByLabel('今天要做什么？')).toHaveValue('我想读书'); expect(await getPrisma().sessionCommand.count()).toBe(before);
  const calls = asrCalls; await page.getByRole('button', { name: '听听我说的', exact: true }).click(); expect(asrCalls).toBe(calls); expect((await counters(page)).plays).toBe(1);
  for (const button of await page.locator('.child-app button').all()) { const box = await button.boundingBox(); if (box) { expect(box.height).toBeGreaterThanOrEqual(56); expect(box.width).toBeGreaterThanOrEqual(56); } }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('今天要做什么？').fill('我自己改过的作业'); expect((await counters(page)).revoked).toBe(1); expect((await counters(page)).active).toBe(0);
  await page.getByRole('button', { name: '好了，给你看看' }).click(); await expect(page.getByRole('button', { name: '对的，开始' })).toBeVisible(); expect(await getPrisma().sessionCommand.count()).toBe(before + 1);
});
test('[6] 麦克风拒绝仍可完成原文字/self_report学习流程', async ({ page }) => {
  await open(page); await page.evaluate(() => { (window as unknown as { speechTest: { denied: boolean } }).speechTest.denied = true; }); await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByText('这次没听清，写在这里也可以。')).toBeVisible(); expect(asrCalls).toBe(0);
  await dictation(page); for (let i = 0; i < 3; ++i) { await page.getByRole('button', { name: '播放这个词', exact: true }).click(); await page.getByRole('button', { name: '下一个', exact: true }).click(); }
  await page.getByLabel('拍下我写的字', { exact: true }).setInputFiles({ name: 'fictional.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1]!, 'base64') });
  for (const char of chars.slice(1)) await page.getByRole('region', { name: `对照${char}`, exact: true }).getByRole('button', { name: '一样', exact: true }).click(); await page.getByRole('button', { name: '我看好了' }).click(); await page.getByRole('button', { name: '下次再读' }).click(); await page.getByRole('button', { name: '开心', exact: true }).click(); await expect(page.getByText('今天辛苦啦，去休息吧。', { exact: true })).toBeVisible();
});
test('[7] 编辑/重录/退出丢弃迟到转录，晚到权限停止tracks', async ({ page }) => {
  await open(page); mode = 'late-asr'; await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await page.getByRole('button', { name: '说好了', exact: true }).click(); await expect.poll(() => pending.length).toBe(1); await page.getByLabel('今天要做什么？').fill('保留我的字'); pending.shift()!(); await expect(page.getByLabel('今天要做什么？')).toHaveValue('保留我的字');
  await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await page.getByRole('button', { name: '说好了', exact: true }).click(); await expect.poll(() => pending.length).toBe(1); await page.getByRole('button', { name: '重新说', exact: true }).click(); pending.shift()!(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await expect(page.getByLabel('今天要做什么？')).toHaveValue('保留我的字');
  await page.getByRole('button', { name: '今天先到这' }).click(); await expect(page.getByText('现在的心情，像哪一个？')).toBeVisible(); expect((await counters(page)).tracks).toBe(3);
  await page.goto('/learn?childId=child-test-1&lessonId=c7-lesson'); await page.getByRole('button', { name: '我来说', exact: true }).click(); await page.evaluate(() => { (window as unknown as { speechTest: { delay: boolean } }).speechTest.delay = true; }); await page.getByRole('button', { name: '开始说', exact: true }).click(); await page.getByRole('button', { name: '今天先到这' }).click(); await expect(page.getByText('现在的心情，像哪一个？')).toBeVisible(); await page.evaluate(() => { (window as unknown as { speechTest: { resolvePermission: () => void } }).speechTest.resolvePermission(); }); await expect.poll(async () => (await counters(page)).tracks).toBe(1);
});
test('[7] 浏览器30秒硬停止并回收试听URL；understand转录不自动coach', async ({ page }) => {
  await open(page); await understand(page); await expect(page.getByRole('button', { name: '开始说', exact: true })).toBeVisible(); const before = await getPrisma().sessionCommand.count();
  await page.clock.install(); await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await page.clock.fastForward(30000); await expect(page.getByLabel('我想说')).toHaveValue('我想读书'); expect((await counters(page)).stops).toBe(1); expect(await getPrisma().sessionCommand.count()).toBe(before);
  await page.getByRole('button', { name: '好了，听听我的', exact: true }).click(); await expect(page.getByText('你能组一个书上的词吗？', { exact: true })).toBeVisible(); expect((await counters(page)).created).toBe((await counters(page)).revoked);
});
test('[8] approved audioUrl优先；TTS重复播放/换字/退出释放URL与播放，异常文字退路', async ({ page }) => {
  await getPrisma().charCard.update({ where: { char: '水' }, data: { audioUrl: '/fictional-approved.wav' } }); await open(page); await dictation(page);
  await page.getByRole('button', { name: '播放这个词', exact: true }).click(); expect(ttsCalls).toEqual([]); expect((await counters(page)).active).toBe(1); await page.getByRole('button', { name: '下一个', exact: true }).click(); expect((await counters(page)).active).toBe(0);
  await page.getByRole('button', { name: '播放这个词', exact: true }).click(); await expect.poll(async () => (await counters(page)).created).toBe(1); expect(ttsCalls).toEqual([(await getCharCard('日'))!.dictationContext]); await expect(page.getByText((await getCharCard('日'))!.dictationContext, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '再听一遍', exact: true }).click(); await expect.poll(async () => (await counters(page)).created).toBe(2); expect((await counters(page)).revoked).toBe(1); expect((await counters(page)).active).toBe(1);
  await page.getByRole('button', { name: '下一个', exact: true }).click(); expect((await counters(page)).revoked).toBe(2); expect((await counters(page)).active).toBe(0); mode = 'reject-tts'; await page.getByRole('button', { name: '播放这个词', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '暂时听不到' })).toBeVisible(); await page.getByRole('button', { name: '今天先到这' }).click(); await expect(page.getByText('现在的心情，像哪一个？')).toBeVisible(); expect((await counters(page)).pauses).toBeGreaterThan(0); expect((await counters(page)).active).toBe(0);
});
test('[8] 换字/退出后迟到TTS不生成URL或播放', async ({ page }) => {
  await open(page); await dictation(page); mode = 'late-tts'; await page.getByRole('button', { name: '播放这个词', exact: true }).click(); await expect.poll(() => pending.length).toBe(1); await page.getByRole('button', { name: '下一个', exact: true }).click(); pending.shift()!(); await expect(page.locator('.step')).toHaveText('第 2 个，共 3 个'); expect((await counters(page)).created).toBe(0);
  await page.getByRole('button', { name: '播放这个词', exact: true }).click(); await expect.poll(() => pending.length).toBe(1); await page.getByRole('button', { name: '今天先到这' }).click(); pending.shift()!(); await expect(page.getByText('现在的心情，像哪一个？')).toBeVisible(); expect((await counters(page)).created).toBe(0); expect((await counters(page)).plays).toBe(0);
});

test('[7] 本地试听正在播放时退出，旧audio确实停止且URL回收', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: '开始说', exact: true }).click(); await expect(page.getByRole('button', { name: '说好了', exact: true })).toBeVisible(); await page.getByRole('button', { name: '说好了', exact: true }).click(); await expect(page.getByLabel('今天要做什么？')).toHaveValue('我想读书'); await page.getByRole('button', { name: '听听我说的', exact: true }).click(); expect((await counters(page)).active).toBe(1); await page.getByRole('button', { name: '今天先到这' }).click(); await expect(page.getByText('现在的心情，像哪一个？')).toBeVisible(); expect((await counters(page)).active).toBe(0); expect((await counters(page)).created).toBe((await counters(page)).revoked);
});

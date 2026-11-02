// Test of Convert a file (app 1.35) in site/index.html, in headless Chromium with a stand-in for the desktop app
// (window.lpcClient): not in an older app; on the Clips page in 1.35, picked files with the formats each can become, one
// converted with its progress and Show in folder, one ffmpeg can't read, and a failed conversion with ffmpeg's reason.
// Needs playwright; run with NODE_PATH listing its node_modules:
//   NODE_PATH=$(npm root -g) node converts.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8088, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const server = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// the desktop app as the page sees it (client/preload.js)
function fakeApp(version) {
  const on = {}, calls = [];
  window.lpcClient = {
    version, calls, screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {},
    lcu: async () => ({ status: 0, data: null }), clip: async () => '', clips: async () => [], clipsClean: async () => [],
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
  };
  if (version === '1.35.0') Object.assign(window.lpcClient, {
    async convertPick() {
      calls.push('pick');
      return [{ id: 'a', name: 'Pentakill.mkv', kind: 'video', targets: [{ id: 'mp4', label: 'MP4 (plays everywhere)' }, { id: 'discord', label: 'MP4 under 10 MB (Discord)' }, { id: 'mp3', label: 'MP3' }] },
        { id: 'b', name: 'notes.docx', error: 'Premade can’t convert this kind of file yet.' }];
    },
    async convert(id, target) {
      calls.push(`convert ${id} ${target}`);
      this.emit('convert', { id, pct: 42 });
      await new Promise((r) => setTimeout(r, 500));
      return target === 'mp3' ? { error: 'Output file does not contain any stream' } : { file: 'C:\\Users\\me\\Videos\\Pentakill (Discord).mp4' };
    },
    convertStop(id) { calls.push('stop ' + id); },
    convertShow(file) { calls.push('show ' + file); },
  });
}
async function context(browser, version) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await c.route(/cdn\.jsdelivr\.net\/npm\/peerjs/, (r) => r.fulfill({ body: 'window.Peer = class { on() {} destroy() {} };', headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await c.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com/, (r) => r.abort());
  await c.addInitScript(fakeApp, version);
  const page = await c.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(URL_);
  await page.waitForFunction(() => window.lpc);
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())); // the setup wizard and What's new
  return [c, page];
}
const subs = (page) => page.$$eval('#cvList li .sub', (s) => s.map((x) => x.textContent));

(async () => {
  const browser = await chromium.launch();
  try {
    const [oc, old] = await context(browser, '1.31.0');
    assert(await old.locator('#cvBox').isHidden(), 'no converting before app 1.35');
    await oc.close();

    const [c, page] = await context(browser, '1.35.0');
    await page.evaluate(() => document.querySelector('.nav[data-view="clips"]').click());
    assert(await page.locator('#cvBox').isVisible(), 'Convert a file on the Clips page');
    await page.click('#cvPick');
    await page.waitForSelector('#cvList li select');
    assert.deepStrictEqual(await page.$$eval('#cvList li .cname', (s) => s.map((x) => x.textContent)), ['notes.docx', 'Pentakill.mkv']);
    assert.deepStrictEqual(await subs(page), ['Premade can’t convert this kind of file yet.', '']);
    const row = page.locator('#cvList li', { hasText: 'Pentakill' });
    await row.locator('select').selectOption('discord');
    await row.locator('button:text-is("Convert")').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#cvList li .sub')].some((s) => s.textContent === 'Converting 42%'));
    assert(await row.locator('button:text-is("Stop")').isVisible(), 'Stop while it converts');
    await row.locator('.sub:text-is("Saved as Pentakill (Discord).mp4")').waitFor();
    if (process.env.SHOTS) await page.locator('#cvBox').screenshot({ path: path.join(process.env.SHOTS, 'converts.png') });
    await row.locator('button:text-is("Show in folder")').click();
    await row.locator('select').selectOption('mp3');
    await row.locator('button:text-is("Convert")').click();
    await row.locator('.sub:text-is("Output file does not contain any stream")').waitFor();
    assert.strictEqual(await row.locator('button:text-is("Show in folder")').count(), 0, 'no Show in folder after a failure');
    assert.deepStrictEqual(await page.evaluate(() => lpcClient.calls), ['pick', 'convert a discord', 'show C:\\Users\\me\\Videos\\Pentakill (Discord).mp4', 'convert a mp3']);
    await c.close();
    console.log('converts: not in an older app; picked files with their formats, a conversion with progress and Show in folder, an unreadable file, a failure');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

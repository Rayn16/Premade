// Test of Download from a link (app 1.31) in site/index.html, in headless Chromium with a stand-in for the desktop app
// (window.lpcClient): not in an older app; on the Clips page in 1.31, a video with its progress, Show in folder, the
// sound of a link that fails with yt-dlp's reason, and the downloads folder.
// Needs playwright; run with NODE_PATH listing its node_modules:
//   NODE_PATH=$(npm root -g) node downloads.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8087, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const server = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// the desktop app as the page sees it (client/preload.js); a link with "bad" in it fails as yt-dlp would
function fakeApp(version) {
  const on = {}, calls = [];
  window.lpcClient = {
    version, calls, screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {},
    lcu: async () => ({ status: 0, data: null }), clip: async () => '', clips: async () => [], clipsClean: async () => [],
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
  };
  if (version === '1.31.0') Object.assign(window.lpcClient, {
    async download(url, kind) {
      calls.push(`download ${kind} ${url}`);
      this.emit('download', { url, pct: -1 });
      this.emit('download', { url, pct: 42 });
      await new Promise((r) => setTimeout(r, 500));
      return /bad/.test(url) ? { error: 'Unsupported URL: ' + url } : { file: `C:\\Users\\me\\Downloads\\Premade\\A video [abc].${kind === 'audio' ? 'mp3' : 'mp4'}` };
    },
    downloadStop(url) { calls.push('download-stop ' + url); },
    downloadShow(file) { calls.push('download-show ' + file); },
    downloadsFolder() { calls.push('downloads-folder'); },
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
const sub = (page) => page.evaluate(() => (document.querySelector('#dlList li .sub') || {}).textContent);

(async () => {
  const browser = await chromium.launch();
  try {
    const [oc, old] = await context(browser, '1.28.7');
    assert(await old.locator('#dlBox').isHidden(), 'no downloads in app 1.28');
    await oc.close();

    const [c, page] = await context(browser, '1.31.0');
    await page.evaluate(() => document.querySelector('.nav[data-view="clips"]').click()); // League's tabs show after its first page
    assert(await page.locator('#dlBox').isVisible(), 'Download from a link on the Clips page');
    if (process.env.SHOTS) await page.locator('#dlBox').screenshot({ path: path.join(process.env.SHOTS, 'downloads.png') });
    await page.fill('#dlUrl', 'https://www.tiktok.com/@a/video/1');
    await page.click('#dlForm button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#dlList li .sub').textContent === 'Downloading 42%');
    assert(await page.locator('#dlList li button:text-is("Stop")').isVisible(), 'Stop while it downloads');
    await page.waitForFunction(() => document.querySelector('#dlList li .sub').textContent === 'Saved');
    assert.strictEqual(await page.textContent('#dlList li .cname'), 'A video [abc].mp4');
    await page.click('#dlList li button:text-is("Show in folder")');
    await page.selectOption('#dlKind', 'audio');
    await page.fill('#dlUrl', 'https://example.com/bad');
    await page.click('#dlForm button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#dlList li .sub').textContent.startsWith('Unsupported URL'));
    assert.strictEqual(await sub(page), 'Unsupported URL: https://example.com/bad');
    assert.strictEqual(await page.locator('#dlList li').count(), 2, 'both links listed, newest first');
    if (process.env.SHOTS) await page.locator('#dlBox').screenshot({ path: path.join(process.env.SHOTS, 'downloads-done.png') });
    await page.click('#dlFolder');
    assert.deepStrictEqual(await page.evaluate(() => lpcClient.calls), ['download video https://www.tiktok.com/@a/video/1',
      'download-show C:\\Users\\me\\Downloads\\Premade\\A video [abc].mp4', 'download audio https://example.com/bad', 'downloads-folder']);
    await c.close();
    console.log('downloads: not in an older app; a video with its progress and Show in folder, a link that fails, the folder');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

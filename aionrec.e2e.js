// Test of Record each Aion 2 dungeon run (site/index.html crumbTick), in headless Chromium with a stand-in for the
// desktop app 1.37.4: Aion 2's log says a dungeon map loaded, so Aion 2's window is recorded; a town map stops it.
// Needs playwright: NODE_PATH=$(npm root -g) node aionrec.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8091;
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
function fakeApp() {
  const on = {}, cv = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
  window.log = '[2026-11-05T07:18:23.522+0300] [0] Flow.SelectCharacterInLobby.LoadComplete.Map(1110)\n';
  window.calls = [];
  window.lpcClient = {
    version: '1.37.4', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay() {}, on(n, fn) { (on[n] = on[n] || []).push(fn); },
    aionLog: async (file, from) => { const b = new TextEncoder().encode(window.log); return { file: 'a.breadcrumb.log', size: b.length, text: new TextDecoder().decode(b.slice(file ? from : 0)) }; },
    captureSources: async () => [{ id: 'window:7', type: 'window', name: 'AION2' }],
    captureSource: async (id) => { calls.push('pick ' + id); return true; },
    gameVideo: async (what) => { calls.push(what); return what === 'start' ? 'Game 2026-11-05 07-27-03 Recording.webm' : what === 'list' ? [] : true; },
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
  setInterval(() => { const g = cv.getContext('2d'); g.fillStyle = `hsl(${Date.now() % 360},50%,50%)`; g.fillRect(0, 0, 320, 180); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
}
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(fakeApp);
    await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await page.waitForTimeout(7000);
    assert.deepStrictEqual(await page.evaluate(() => calls.filter((c) => c !== 'list')), [], 'in town: nothing recorded');
    await page.evaluate(() => { log += '[2026-11-05T07:27:03.166+0300] [0] Flow.Teleport.LoadComplete.Map(600092)\n[2026-11-05T07:31:44.120+0300] [0] Flow.Teleport.Load'; });
    await page.waitForFunction(() => calls.includes('start'), null, { timeout: 8000 });
    assert(await page.evaluate(() => calls.includes('pick window:7')), 'Aion 2’s window is what’s recorded');
    await page.evaluate(() => { log += 'Complete.Map(600092)\n'; }); // a reload in the same dungeon: still recording
    await page.waitForTimeout(6000);
    assert(!(await page.evaluate(() => calls.includes('end'))), 'a reload inside keeps recording');
    await page.evaluate(() => { log += '[2026-11-05T07:56:27.18+0300] [0] Flow.Teleport.LoadComplete.Map(1110)\n'; });
    await page.waitForFunction(() => calls.includes('end'), null, { timeout: 8000 });
    console.log('aionrec: ok');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

// Test of where "Premade, clip that" listens with Clip anywhere on (What's new 236): the recording runs all the time,
// but the speech recognition (about 160 MB) is loaded only in League games and while an app fills its screen in front
// (the desktop app's frontApp), and goes 5 minutes after. Before 236 it was loaded all day.
//   NODE_PATH=/path/to/node_modules node clipvoice.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8096;
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// the desktop app as far as Clip anywhere and frontApp go; window.front is what the window in front is
function fakeApp() {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 360;
  const g = cv.getContext('2d');
  let t = 0;
  setInterval(() => { g.fillStyle = `hsl(${(t += 7) % 360} 60% 40%)`; g.fillRect(0, 0, 640, 360); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
  window.front = { full: false, mine: false, hid: false };
  const on = {};
  window.lpcClient = {
    version: '1.56.0', screens: async () => [{ id: '1', main: true, thumb: '' }], useScreen() {}, keys: async () => ({}), compact() {}, windowMode: async () => 'borderless',
    update() {}, discord() {}, ducking: async () => 3, soundSettings() {}, attenuate() {}, overlay() {}, notify() {},
    clip: async () => 'Screen clip 1.webm', clips: async () => [], frontApp: async () => window.front,
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
  localStorage.setItem('lpc-opts', JSON.stringify({ clips: true, clipsAll: true, clipVoice: true, autoShare: false, denoise: false }));
}
const wait = (page, fn, what, timeout = 15000) => page.waitForFunction(fn, null, { timeout, polling: 200 }).catch((e) => { throw new Error(`waiting for ${what}: ${e.message}`); });

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext();
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev|github\.io|jsdelivr/, (r) => r.abort());
    await ctx.addInitScript(fakeApp);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await wait(page, () => window.lpc && lpc.clips().on && lpc.clips().parts > 2, 'Clip anywhere recording');
    // on the desktop (nothing fills the screen) it records, but doesn't listen
    await page.waitForTimeout(7000);
    assert(await page.evaluate(() => lpc.clips().on && !lpc.voice().loaded), 'outside games, with no app filling the screen, the speech recognition stays unloaded');
    assert.match(await page.textContent('#voiceNote'), /^In games and apps that fill your screen it listens for “Premade, clip that”\.$/);
    await page.evaluate(() => lpc.clipsDraw());
    assert.match(await page.textContent('#anyNote'), /^Press .+ in any app or game, or say “Premade, clip that” in a game or an app that fills your screen\. Clips from outside League are listed here\.$/);
    // a game in Borderless in front: it loads within a few seconds
    await page.evaluate(() => { window.front = { full: true, mine: false, hid: true }; });
    await wait(page, () => lpc.voice().on, 'the speech recognition listening for the app filling the screen', 60000);
    console.log('Clip anywhere: the speech recognition loads only while an app fills the screen');
    // back on the desktop: it goes 5 minutes later (the page's clock moved on 5 minutes here)
    await page.evaluate(() => { window.front = { full: false, mine: false, hid: false }; const now = performance.now.bind(performance); performance.now = () => now() + 301e3; });
    await wait(page, () => !lpc.voice().loaded && !lpc.voice().ears, 'the speech recognition let go 5 minutes after', 120000);
    console.log('Clip anywhere: and lets go of it 5 minutes after');
    console.log('clipvoice.e2e: all passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit();
  }
})();

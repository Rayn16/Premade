// What's new 120-122 in headless Chromium, three players in a room with a local PeerServer: screens side by side and
// zoomed, and who's talking in any game on the overlay (a stand-in for the desktop app 1.38, window.lpcClient). The file,
// pin, search, Files and past sessions checks went with the room chat in What's new 152.
//   NODE_PATH=/path/to/node_modules node extras.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8091, PEER = 9011;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;
const OPEN_ROOMS = new Map();

const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// In the page before its scripts: a moving canvas as the screen
function fakes() {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  let t = 0;
  setInterval(() => { g.fillStyle = `hsl(${(t += 7) % 360} 60% 40%)`; g.fillRect(0, 0, 1280, 720); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
}
// the desktop app 1.38, as far as the overlay needs it: the window in front is a full-screen game (window.front)
function fakeClient() {
  const on = {};
  window.front = { full: true, mine: false };
  window.lpcClient = {
    calls: [], version: '1.38.0',
    screens: async () => [{ id: '1', main: true, thumb: '' }],
    useScreen() {}, keys: async () => ({}), compact() {}, windowMode: async () => 'borderless', update() {}, discord() {},
    ducking: async () => 3, soundSettings() {}, attenuate() {},
    overlay(s) { this.calls.push(s); if (this.calls.length > 400) this.calls.shift(); },
    frontApp: async () => window.front,
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
  };
}
async function player(browser, name, client) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com/, (r) => r.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('**/hello', (r) => r.fulfill({ status: 204, headers: cors }));
  await ctx.route(/\/rooms(\?|$)/, (r) => { // GET asks with ?me= (your Riot IDs, for hidden rooms)
    if (r.request().method() === 'GET') return r.fulfill({ json: [...OPEN_ROOMS.values()], headers: cors });
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.remove || b.locked) OPEN_ROOMS.delete(b.room);
    else OPEN_ROOMS.set(b.room, { room: b.room, count: b.count, playing: b.playing });
    r.fulfill({ json: { ok: true }, headers: cors });
  });
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoShare: false })); }, name);
  await ctx.addInitScript(fakes);
  if (client) await ctx.addInitScript(fakeClient);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`[${name}]`, m.text()));
  return page;
}
async function join(page, room) {
  await page.goto(`${URL_}#${room}`);
  await page.click('#joinBtn');
  await page.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
}
const waitFor = (page, fn, arg, what, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  const chat = await page.evaluate(() => document.getElementById('chatLog').textContent.slice(-400)).catch(() => '?');
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; chat: ${chat}`);
});
const inRoom = (page, n) => waitFor(page, (n) => lpc.peers().length === n && lpc.peers().every((p) => p.conns > 0), n, `${n} others in the room`);

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  try {
    const ana = await player(browser, 'Ana', true), ben = await player(browser, 'Ben');
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    const ROOM = await ana.evaluate(() => lpc.room());
    await join(ben, ROOM);
    await inRoom(ana, 1);
    await inRoom(ben, 1);

    const cat = await player(browser, 'Cat');
    await join(cat, ROOM);
    await inRoom(cat, 2);
    await inRoom(ana, 2);

    // 58 + 59: Ben and Cat share; Ana watches both side by side and zooms into one
    for (const p of [ben, cat]) await p.click('#generalShareBtn');
    await waitFor(ana, () => document.querySelectorAll('#screenGrid .screentile video').length === 2 && [...document.querySelectorAll('#screenGrid video')].every((v) => v.videoWidth > 0), null, 'both screens on Ana’s page', 45000);
    assert(await ana.isVisible('#sideBtn'), 'Side by side with two screens');
    await ana.click('#sideBtn');
    await waitFor(ana, () => document.fullscreenElement === document.getElementById('screenGrid') && getComputedStyle(document.getElementById('screenGrid')).gridTemplateColumns.split(' ').length === 2, null, 'both full screen, 2 across');
    await ana.keyboard.press('Escape');
    await ana.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    const zoom = await ana.evaluate(() => {
      const wrap = document.querySelector('#screenGrid .scrwrap'), r = wrap.getBoundingClientRect();
      wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: r.left + r.width / 4, clientY: r.top + r.height / 4, bubbles: true, cancelable: true }));
      return { t: wrap.querySelector('video').style.transform, b: wrap.parentElement.querySelector('.unzoom').textContent };
    });
    assert(/scale\(2\.7/.test(zoom.t) && /2\.7x · Reset/.test(zoom.b), `zoomed in at the pointer: ${JSON.stringify(zoom)}`);
    await ana.click('#screenGrid .unzoom');
    assert.strictEqual(await ana.$eval('#screenGrid video', (v) => v.style.transform), '', 'Reset goes back');
    console.log('screens: side by side full screen, Ctrl + scroll zoomed in where the pointer was, Reset');

    // 25 + 50 + 61: who's talking over a full-screen game outside League, chat lines too, then it fades and hides
    await waitFor(ana, () => lpcClient.calls.some((s) => s.visible && s.any && s.talkers && s.talkers.length > 0), null, 'who’s talking on the overlay over the game');
    await ana.evaluate(() => document.querySelectorAll('#players .player .mute').forEach((b) => b.click())); // both quiet for Ana
    await waitFor(ana, () => lpcClient.calls.some((s) => s.fade && s.any) && !lpcClient.calls[lpcClient.calls.length - 1].visible, null, 'the overlay fading, then hidden, once nobody talks');
    await ben.evaluate(() => { document.getElementById('chatText').value = 'push mid'; document.getElementById('chatForm').requestSubmit(); }); // the chat is off the page since What's new 152; the overlay still shows it
    await waitFor(ana, () => lpcClient.calls.some((s) => s.any && (s.chat || []).some((c) => c.text === 'push mid')), null, 'Ben’s chat line on the overlay');
    await ana.evaluate(() => { window.front = { full: false, mine: false }; }); // a normal window in front: nothing, once the app says so (each second)
    await new Promise((r) => setTimeout(r, 1500));
    await ana.evaluate(() => { lpcClient.calls.length = 0; });
    await new Promise((r) => setTimeout(r, 2500));
    assert(await ana.evaluate(() => lpcClient.calls.every((s) => !s.any)), 'nothing over a window that isn’t full screen');
    console.log('any game: who’s talking and room chat over a full-screen game, fading out, nothing over other windows');
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer.close && peerServer.close();
  }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

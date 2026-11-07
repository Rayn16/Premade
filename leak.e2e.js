// Memory leak test (owner review item 40): Ana (a stand-in for the desktop app, with the clip buffer on, Clip anywhere)
// and her friend Ben sit in a voice room with fake mics and a moving screen for MINS minutes (default 30), Ben
// writing in the chat every 2 s (past the chat's 100-message cap within the warm-up). Every minute, after a forced garbage collection, each page's JS heap, DOM nodes,
// event listeners, live intervals and pending timeouts are logged. After WARM minutes of warm-up (default 5) the
// median of the first 5 samples is compared with the median of the last 5: it fails on steady growth.
//   NODE_PATH=/path/to/node_modules node leak.e2e.js            (MINS=2 WARM=0 for a quick run, LEAK=1 to see it fail)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8095, PEER = 9015;
const MINS = +(process.env.MINS || 30), WARM = +(process.env.WARM ?? 5);
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;
// growth allowed between the first and last samples: a share of the start and a floor, whichever is bigger
const LIMITS = { heapMB: [0.15, 3], nodes: [0.1, 200], listeners: [0.1, 50], intervals: [0, 3], timeouts: [0, 20] };

const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// In the page before its scripts: a moving canvas as the screen, and counts of live intervals and pending timeouts
function fakes() {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  let t = 0;
  setInterval(() => { g.fillStyle = `hsl(${(t += 7) % 360} 60% 40%)`; g.fillRect(0, 0, 1280, 720); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
  const ivs = new Set(), tos = new Set(), { setInterval: si, clearInterval: ci, setTimeout: st, clearTimeout: ct } = window;
  window.setInterval = (...a) => { const id = si(...a); ivs.add(id); return id; };
  window.clearInterval = (id) => { ivs.delete(id); ci(id); };
  window.setTimeout = (fn, ...a) => { const id = st((...b) => { tos.delete(id); typeof fn === 'function' ? fn(...b) : 0; }, ...a); tos.add(id); return id; };
  window.clearTimeout = (id) => { tos.delete(id); ct(id); };
  window.timers = () => ({ intervals: ivs.size, timeouts: tos.size });
}
// the desktop app as far as the clip buffer needs it: clip() is there, so Clip anywhere records all the time
function fakeClient() {
  const on = {};
  window.lpcClient = {
    calls: [], version: '1.40.0',
    screens: async () => [{ id: '1', main: true, thumb: '' }],
    useScreen() {}, keys: async () => ({}), compact() {}, windowMode: async () => 'borderless', update() {}, discord() {},
    ducking: async () => 3, soundSettings() {}, attenuate() {}, overlay() {},
    clip: async () => 'Screen clip 1.webm', clips: async () => [],
    metrics: async () => ({ cpu: 1, mb: 200 }),
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
  };
}
// LEAK=1: a page that leaks a node, a listener and an interval every 10 s, to show the test catches it
function leaky() {
  setInterval(() => { const d = document.createElement('div'); d.addEventListener('click', () => d); document.body.append(d); setInterval(() => {}, 1e6); }, 10000);
}

async function player(browser, name, opts, client) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev|github\.io/, (r) => r.abort()); // nothing reaches the live server
  await ctx.addInitScript(([n, o]) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify(o)); }, [name, opts]);
  await ctx.addInitScript(fakes);
  if (client) await ctx.addInitScript(fakeClient);
  if (process.env.LEAK && client) await ctx.addInitScript(leaky);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`[${name}]`, m.text()));
  page.cdp = await ctx.newCDPSession(page);
  return page;
}
async function sample(page) {
  await page.cdp.send('HeapProfiler.collectGarbage');
  const [{ usedSize }, dom, t] = await Promise.all([page.cdp.send('Runtime.getHeapUsage'), page.cdp.send('Memory.getDOMCounters'), page.evaluate(() => window.timers())]);
  return { heapMB: Math.round(usedSize / 104857.6) / 10, nodes: dom.nodes, listeners: dom.jsEventListeners, ...t };
}
const median = (l) => [...l].sort((a, b) => a - b)[l.length >> 1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  let chat;
  try {
    const ana = await player(browser, 'Ana', { denoise: false, autoShare: false, clipsAll: true }, true);
    const ben = await player(browser, 'Ben', { denoise: false, autoShare: false });
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    const room = await ana.evaluate(() => lpc.room());
    await ben.goto(`${URL_}#${room}`);
    await ben.click('#joinBtn');
    for (const p of [ana, ben]) await p.waitForFunction(() => lpc.peers().length === 1 && lpc.peers().every((f) => f.live), null, { timeout: 30000, polling: 200 });
    await ana.waitForFunction(() => lpc.clips().on && lpc.clips().parts > 0, null, { timeout: 30000, polling: 200 });
    console.log(`in a room with voice, the clip buffer recording; ${MINS} min, ${WARM} min warm-up`);
    let n = 0;
    chat = setInterval(() => ben.evaluate((i) => { const t = document.getElementById('chatText'); t.value = `message ${i}`; document.getElementById('chatForm').requestSubmit(); }, ++n).catch(() => {}), 2000);
    const rows = { Ana: [], Ben: [] };
    for (let m = 0; m <= MINS; m++) {
      if (m) await sleep(60000);
      for (const [name, p] of [['Ana', ana], ['Ben', ben]]) {
        const s = await sample(p);
        if (m >= WARM) rows[name].push(s);
        console.log(`${m} min ${name}: ${JSON.stringify(s)}`);
      }
      assert(await ana.evaluate(() => lpc.peers().length === 1 && lpc.clips().on), `${m} min: still in the room with the clip buffer on`);
    }
    assert(await ana.evaluate((n) => document.getElementById('chatLog').textContent.includes(`message ${n - 1}`), n), 'Ben’s chat reached Ana');
    assert(rows.Ana.length >= 2, `at least 2 samples after the warm-up (MINS ${MINS} > WARM ${WARM})`);
    const bad = [];
    for (const [name, l] of Object.entries(rows)) {
      const k = Math.min(5, l.length >> 1);
      for (const [key, [share, floor]] of Object.entries(LIMITS)) {
        const a = median(l.slice(0, k).map((s) => s[key])), b = median(l.slice(-k).map((s) => s[key]));
        const line = `${name} ${key}: ${a} -> ${b}`;
        console.log(line);
        if (b - a > Math.max(a * share, floor)) bad.push(line);
      }
    }
    assert.deepStrictEqual(bad, [], 'kept growing');
    console.log('ok: heap, DOM nodes, listeners and timers flat');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    clearInterval(chat);
    await browser.close();
    web.close();
    peerServer.close?.();
    process.exit(process.exitCode || 0);
  }
})();

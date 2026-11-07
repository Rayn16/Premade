// Test of the Aion 2 dungeon guide and raid sheet (owner review 42, 43, 34) in headless Chromium, with a stand-in for
// the desktop app: going into Ferocious Horn Den lists its bosses on the overlay from site/aion/bosses; a cast read off
// the cast bar says what to do and counts down; the boss's health from Live fight nearing a cast's % calls it; the run's
// timeline refines this PC's boss scripts and the Recording page lists them with a note per cast. Then two players in a
// room: one starts from Ludra's sheet, the other takes a job, each overlay shows only that player's jobs, and the HP
// marks call "soon" and "now". Needs playwright and peer: NODE_PATH=$(npm root -g) node aionguide.e2e.js
// MINS=30 then keeps both in a dungeon run for that long (casts read, Live fight's HP every second, the sheet changed
// every 15 s) and fails if Ana's JS heap, DOM nodes or listeners grow after a 5-minute warm-up.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8093, PEER = 9013;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;
const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
function fakeApp() { // the app 1.42 as the run reader needs it; window.scene draws Aion 2's screen, window.live() is Live fight
  const on = {}, cv = Object.assign(document.createElement('canvas'), { width: 2560, height: 1440 });
  const stamp = (d = new Date()) => d.toISOString().replace('Z', '+0000');
  window.log = `[${stamp()}] [0] Flow.SelectCharacterInLobby.LoadComplete.Map(1110)\n`;
  window.calls = []; window.shown = [];
  window.lpcClient = {
    version: '1.42.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { if (s.guide) shown.push(s.guide.join(' | ')); if (shown.length > 300) shown.splice(0, 100); window.ov = s; }, on(n, fn) { (on[n] = on[n] || []).push(fn); },
    aionLog: async (file, from) => { if (file === '*') return [window.log]; const b = new TextEncoder().encode(window.log); return { file: 'a.breadcrumb.log', size: b.length, text: new TextDecoder().decode(b.slice(file ? from : 0)) }; },
    captureSources: async () => [{ id: 'window:7', type: 'window', name: 'AION2' }],
    captureSource: async () => true,
    gameVideo: async (what, name, parts) => { calls.push(what); if (what === 'json') window.timeline = JSON.parse(parts); return what === 'start' ? 'Game 2026-11-07 08-00-00 Recording.webm' : what === 'list' ? [] : true; },
  };
  window.enter = (map) => { log += `[${stamp()}] [0] Flow.Teleport.LoadComplete.Map(${map})\n`; };
  window.live = (target, pct) => (on['aion-live'] || []).forEach((f) => f({ target, pct, secs: 30, players: [{ name: 'Rayan', dps: 1000, share: 100 }] }));
  localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-aion', '1');
  setInterval(() => {
    const g = cv.getContext('2d'), s = window.scene || '';
    g.fillStyle = `hsl(${Date.now() % 360},30%,20%)`; g.fillRect(0, 0, 2560, 1440);
    if (s) { g.fillStyle = '#20e0f0'; g.fillRect(1140, 112, 280, 4); g.fillStyle = '#c8d020'; g.fillRect(1080, 69, 300, 7); g.fillStyle = '#ff3030'; g.font = 'bold 22px sans-serif'; g.fillText('Ferocious Horn Nuakum', 1160, 56); }
    if (s === 'cast') { g.fillStyle = '#c02020'; g.fillRect(1120, 1132, 320, 30); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText('Blue Light of Destruction 20.0', 1124, 1153); }
    if (s === 'banner') { g.fillStyle = '#000'; g.fillRect(0, 0, 2560, 200); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('Boss Defeated', 1150, 125); }
  }, 250);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(4);
}
async function player(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|\/hello$|\/rooms$/, (r) => r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.addInitScript((n) => localStorage.setItem('lpc-name', n), name);
  await ctx.addInitScript(fakeApp);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] PAGE`, e.message));
  return page;
}
const seen = (page, re, what, timeout = 20000) => page.waitForFunction((re) => shown.some((l) => new RegExp(re).test(l)), re.source, { timeout, polling: 100 }).catch(async () => {
  throw new Error(`${what}: no overlay line like ${re}; got ${JSON.stringify((await page.evaluate(() => shown)).slice(-8))}`);
});
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana');
    await ana.goto(URL_);
    await ana.waitForTimeout(6000);
    await ana.evaluate(() => enter(600092));
    await seen(ana, /^Ferocious Horn Den: Watchdog Kwapo › Necromancer Duanka › Ferocious Horn Nuakum/, 'the dungeon’s bosses on entry');
    await ana.waitForFunction(() => calls.includes('start'), null, { timeout: 10000 });
    await ana.evaluate(() => window.play = (async () => { for (const [s, n] of [['boss', 22], ['cast', 4], ['boss', 4], ['', 7], ['banner', 3], ['', 2]]) { window.scene = s; await new Promise((r) => setTimeout(r, n * 1000)); } window.scene = ''; })());
    await seen(ana, /Blue Light of Destruction (19|20) s · a huge blue circle/, 'the cast says what it does and counts down', 40000);
    await seen(ana, /Blue Light of Destruction 1[0-7] s · a huge blue circle/, 'its countdown');
    await ana.evaluate(() => { live('Ferocious Horn Nuakum', 40); live('Ferocious Horn Nuakum', 23); });
    await seen(ana, /Blue Light of Destruction soon \(20%\)/, 'a call before its health gets to the cast');
    await ana.evaluate(() => window.play);
    await ana.evaluate(() => enter(1110));
    await ana.waitForFunction(() => window.timeline, null, { timeout: 20000 });
    const sc = await ana.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-scripts'))['Ferocious Horn Nuakum']);
    assert(sc && sc.runs === 3 && sc.casts[0].seen === 3 && sc.casts[0].secs > 19 && sc.casts[0].secs < 26 && /blue circle/.test(sc.casts[0].shape), `the run refined Nuakum’s script: ${JSON.stringify(sc)}`);
    await ana.evaluate(() => document.querySelector('.nav[data-view="record"]').click());
    await ana.waitForSelector('#aionGuideBox:not([hidden]) #aionGuide details');
    await ana.evaluate(() => { const i = document.querySelector('#aionGuide input[data-k="Watchdog Kwapo|Thunder Cry"]'); i.value = 'Spread out'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.strictEqual(await ana.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-notes'))['Watchdog Kwapo|Thunder Cry']), 'Spread out', 'a note per cast kept');

    // 34: the raid sheet in a room
    const ben = await player(browser, 'Ben');
    await ana.evaluate(() => document.querySelector('.nav[data-view="voice"]').click());
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    const ROOM = await ana.evaluate(() => lpc.room());
    await ben.goto(`${URL_}#${ROOM}`);
    await ben.click('#joinBtn');
    for (const p of [ana, ben]) await p.waitForFunction(() => lpc.peers().length === 1 && lpc.peers().every((x) => x.conns > 0), null, { timeout: 30000 });
    await ana.click('#raidLudra');
    await ben.waitForFunction(() => document.querySelectorAll('#raidJobs li').length === 6, null, { timeout: 15000 });
    await ben.evaluate(() => { const s = document.querySelector('#raidJobs li select'); s.value = 'Ben'; s.dispatchEvent(new Event('change', { bubbles: true })); s.blur(); });
    await ana.waitForFunction(() => document.querySelector('#raidJobs li select').value === 'Ben', null, { timeout: 15000 });
    for (const p of [ana, ben]) await p.evaluate(() => { shown.length = 0; live('Ludra', 60); });
    await seen(ben, /Your jobs: Red orb, Red orb backup/, 'Ben sees his job and everyone’s');
    await seen(ana, /Your jobs: Red orb backup,/, 'Ana sees everyone’s');
    assert(!(await ana.evaluate(() => shown.some((l) => /Your jobs: Red orb,/.test(l)))), 'Ana doesn’t get Ben’s job');
    await ana.evaluate(() => live('Ludra', 53));
    await seen(ana, /Tile phase soon \(50%\)/, 'the mark 5% before');
    await ana.evaluate(() => live('Ludra', 49));
    await seen(ana, /Tile phase now/, 'the mark at it');
    console.log('aionguide: ok');
    const MINS = +(process.env.MINS || 0);
    if (MINS) {
      const cdp = await ana.context().newCDPSession(ana), out = [];
      await ana.evaluate(() => { enter(600092); window.loop = setInterval(() => { const t = Math.floor(Date.now() / 1000) % 60; window.scene = t < 20 ? 'boss' : t < 24 ? 'cast' : ''; live(t % 2 ? 'Ferocious Horn Nuakum' : 'Ludra', 100 - (t * 5) / 3); }, 1000); });
      for (let m = 1; m <= MINS; m++) {
        for (let k = 0; k < 4; k++) { await ben.evaluate((k) => document.getElementById(k % 2 ? 'raidClear' : 'raidLudra').click(), k); await new Promise((r) => setTimeout(r, 15000)); }
        await cdp.send('HeapProfiler.collectGarbage');
        const [{ usedSize }, dom] = await Promise.all([cdp.send('Runtime.getHeapUsage'), cdp.send('Memory.getDOMCounters')]);
        out.push({ m, heapMB: Math.round(usedSize / 104857.6) / 10, nodes: dom.nodes, listeners: dom.jsEventListeners });
        console.log(JSON.stringify(out[out.length - 1]));
      }
      const after = out.filter((x) => x.m > 5), med = (k, l) => l.map((x) => x[k]).sort((a, b) => a - b)[l.length >> 1];
      for (const [k, share, floor] of [['heapMB', 0.15, 3], ['nodes', 0.1, 200], ['listeners', 0.1, 50]]) {
        const a = med(k, after.slice(0, 5)), z = med(k, after.slice(-5));
        assert(z - a <= Math.max(a * share, floor), `${k} grew from ${a} to ${z} over ${MINS} minutes`);
      }
      console.log(`aionguide: ${MINS} minutes flat`);
    }
  } finally { await browser.close(); server.close(); peerServer.close?.(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

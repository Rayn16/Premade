// Test of the overlay's line at the top of the screen (site/overlay.html) and what fills it in site/index.html, in
// headless Chromium with a stand-in for the desktop app 1.13 (window.lpcClient):
// the overlay page itself (the line in the middle at the top, fading in and out, the rest where the small window would
// be, and first in the stack over everyone's rank; parts in places of their own, who's off your minimap and the card
// after a game); the minimap reminder (every 10 s from 1:00, a game counted per room, off by itself after 20 games); the
// jungler callout, on a screen with Rayan's minimap from his Practice Tool screenshot and his Yasuo icon copied there in
// the other team's red, read by the app by itself in the game ("Jungler on botside" for 3 s, not again while they stay
// in sight, "Jungler on topside" when they show up again after 10 s); the other callouts and the list of who's off your
// minimap, with made-up champions drawn on the same minimap (a missing laner, an invade, a gank, a death, read out
// loud); the Overlay page's Layout (drag a part, the arrow keys, its size, the rest, put back); and the game report's
// look at their jungler.
// Needs playwright; run with NODE_PATH listing its node_modules:
//   NODE_PATH=$(npm root -g) node coach.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const zlib = require('zlib');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8083, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const shot = (pg, name, sel) => process.env.SHOTS && (sel ? pg.locator(sel) : pg).screenshot({ path: path.join(process.env.SHOTS, name + '.png') });

// ---- the shared screen: the bottom-right corner of Rayan's screen (646 px, his minimap 279 px), with his Yasuo icon
// copied to a spot of the minimap, its blue ring turned the other team's red (as in camera-box.test.js)
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(SITE, 'camera-box.js'), 'utf8'), ctx);
const R = 646, corner = new Uint8ClampedArray(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/rayan-practice-tool-646.rgba.gz'))));
const m = ctx.CameraBox.findMinimap(corner, R), ME = [105.5, 168.75]; // his icon's centre on the minimap
function withFoe(at) {
  const out = new Uint8ClampedArray(corner);
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    const d = Math.hypot(dx, dy), a = Math.max(0, Math.min(1, 13 - d));
    if (!a) continue;
    const from = ((m.y + Math.round(ME[1] + dy)) * R + m.x + Math.round(ME[0] + dx)) * 4, to = ((m.y + at[1] + dy) * R + m.x + at[0] + dx) * 4;
    let [r, g, b] = corner.subarray(from, from + 3);
    if (d > 10.3 && b > 140 && b - r > 50 && g > 80 && g < b) [r, g, b] = [b * 0.91, r * 0.6, r * 0.55];
    [r, g, b].forEach((v, c) => { out[to + c] = out[to + c] * (1 - a) + v * a; });
  }
  return Buffer.from(out.buffer);
}
// made-up champions: a picture of four flat colours each (their Data Dragon picture here), drawn on the minimap as
// League does, the picture 0.86 ring radii across inside the other team's red ring. No colour in them looks like a ring.
const PICS = { Zed: [[60, 70, 150], [200, 190, 60], [40, 140, 70], [120, 60, 160]], LeeSin: [[210, 150, 40], [40, 160, 110], [90, 90, 90], [150, 200, 120]], Garen: [[40, 60, 200], [80, 180, 120], [200, 200, 120], [60, 120, 60]] };
const picOf = (c) => { const out = Buffer.alloc(128 * 128 * 4); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) out.set([...PICS[c][(y < 64 ? 0 : 2) + (x < 64 ? 0 : 1)], 255], (y * 128 + x) * 4); return out; };
function withIcons(icons) { // [[champion, x, y]] in minimap pixels
  const out = new Uint8ClampedArray(corner), r = ctx.CameraBox.RING * m.s, k = 64 / 0.86;
  for (const [c, cx, cy] of icons) for (let dy = -Math.ceil(r + 2); dy <= r + 2; dy++) for (let dx = -Math.ceil(r + 2); dx <= r + 2; dx++) {
    const d = Math.hypot(dx, dy), to = ((m.y + cy + dy) * R + m.x + cx + dx) * 4;
    if (d <= 0.86 * r) out.set(PICS[c][(64 + (dy / r) * k < 64 ? 0 : 2) + (64 + (dx / r) * k < 64 ? 0 : 1)], to);
    else if (d >= r - 1.6 && d <= r + 1.4) out.set([215, 40, 45], to);
  }
  return Buffer.from(out.buffer);
}
const SCREENS = { none: Buffer.from(corner.buffer), bot: withFoe([200, 205]), top: withFoe([60, 100]), // x + y past the minimap's width: the bottom side
  zedMid: withIcons([['Zed', 172, 109]]), leeJungle: withIcons([['LeeSin', 130, 215]]), // Zed in the middle lane on their side, Lee Sin in your jungle
  g1: withIcons([['LeeSin', 165, 168]]), g2: withIcons([['LeeSin', 150, 168]]), g3: withIcons([['LeeSin', 135, 168]]) }; // Lee Sin coming toward you (ME)
const yasuo = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/ddragon-yasuo-128.rgba.gz')));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), file = path.join(SITE, u.pathname);
  if (u.pathname.startsWith('/screens/')) return res.end(SCREENS[u.pathname.slice(9)]);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// ---- Data Dragon
const DDATA = Object.fromEntries([['Ahri', 103], ['Garen', 86], ['LeeSin', 64], ['Yasuo', 157], ['Zed', 238]].map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// The desktop app 1.13 as the page sees it (client/preload.js), and the shared screen: 2560x1436 with the corner at the
// bottom right, redrawn ten times a second from /screens/<window.screenNow>
function fakeApp() {
  const on = {};
  window.lpcClient = {
    version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999'); // no What's new
  const cv = document.createElement('canvas'), shots = {};
  cv.width = 2560; cv.height = 1436;
  const g = cv.getContext('2d');
  window.screenNow = 'none';
  setInterval(async () => {
    const k = window.screenNow;
    shots[k] = shots[k] || fetch('/screens/' + k).then((r) => r.arrayBuffer()).then((b) => new ImageData(new Uint8ClampedArray(b), 646, 646));
    g.fillStyle = '#123'; g.fillRect(0, 0, 2560, 790);
    g.putImageData(await shots[k], 2560 - 646, 1436 - 646);
  }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
}
async function context(browser, opts) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cors = { 'access-control-allow-origin': '*' };
  await c.route(/cdn\.jsdelivr\.net\/npm\/peerjs/, (r) => r.fulfill({ body: 'window.Peer = class { on() {} destroy() {} };', headers: { 'content-type': 'text/javascript', ...cors } })); // no room here
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await c.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    const pic = u.match(/\/img\/champion\/(\w+)\.png$/);
    r.fulfill({ body: (pic && PNGS[pic[1]]) || PNG1, contentType: 'image/png', headers: cors });
  });
  await c.addInitScript((o) => localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, ...o })), opts);
  await c.addInitScript(fakeApp);
  const page = await c.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(URL_);
  return [c, page];
}
const PNGS = {}; // the champions' Data Dragon pictures
// for screenshots, a stand-in for League behind the overlay: a shared screen's corner shrunk into the bottom right
const backdrop = (p, screen) => p.evaluate((b64) => {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'), img = new ImageData(Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)), 646, 646), tmp = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  cv.style.cssText = 'position: fixed; inset: 0; z-index: -1';
  tmp.width = tmp.height = 646;
  tmp.getContext('2d').putImageData(img, 0, 0);
  g.fillStyle = '#1d2b25'; g.fillRect(0, 0, 1280, 720);
  g.drawImage(tmp, 1280 - 323, 720 - 323, 323, 323);
  document.body.prepend(cv);
}, SCREENS[screen].toString('base64'));
async function overlayShot(browser, name, s, screen) { // overlay.html showing what the page sent it, over that screen
  if (!process.env.SHOTS) return;
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await p.route(/ddragon\.leagueoflegends\.com/, (r) => { const pic = r.request().url().match(/\/img\/champion\/(\w+)\.png$/); r.fulfill({ body: (pic && PNGS[pic[1]]) || PNG1, contentType: 'image/png' }); });
  await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
  await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
  await backdrop(p, screen);
  await p.evaluate((s) => window.fire(s), s);
  await p.waitForTimeout(800);
  await shot(p, name);
  await p.close();
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; overlay ${JSON.stringify(await page.evaluate(() => window.lpcClient && lpcClient.lastOverlay).catch(() => null))}`);
});
// a game against Zed, Lee Sin (their jungler: the jungle pet) and Garen, as Yasuo: Rayan's own icon on the minimap
const foesGame = (dead = 0) => game({
  me: { champ: 'Yasuo', champName: 'Yasuo', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 },
  players: [['Rayan', 'ORDER', 'Yasuo', [[1056, 1]]], ['Mid', 'CHAOS', 'Zed', [[1055, 1]]], ['Jungle', 'CHAOS', 'LeeSin', [[1101, 1]]], ['Top', 'CHAOS', 'Garen', [[1054, 1]]]]
    .map(([n, team, champ, items]) => ({ name: n + '#EUW', team, champ, champName: '', pos: '', lvl: 3, k: 0, d: champ === 'Garen' ? dead : 0, a: 0, cs: 10, items })),
});
const game = (over = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 120, room: 'g0123456789a', result: '', events: [],
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 },
  players: [['Rayan', 'ORDER', 'Ahri', [[1056, 1]]], ['Them', 'CHAOS', 'Yasuo', [[1102, 1]]], ['Top', 'CHAOS', 'Garen', [[1055, 1]]]] // their jungler: the jungle pet, no positions (blind pick)
    .map(([n, team, champ, items]) => ({ name: n + '#EUW', team, champ, champName: '', pos: '', lvl: 3, k: 0, d: 0, a: 0, cs: 10, items })),
  ...over,
});

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- the champions' Data Dragon pictures as PNGs: Yasuo's from the fixture's pixels, the made-up ones
    {
      const p = await browser.newPage();
      for (const [c, px] of [['Yasuo', yasuo], ...Object.keys(PICS).map((c) => [c, picOf(c)])]) PNGS[c] = Buffer.from(await p.evaluate((b64) => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        c.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)), 128, 128), 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }, px.toString('base64')), 'base64');
      await p.close();
    }

    // ---- the overlay page: the line at the top over the whole screen (board: true), the rest where the small window would be
    {
      const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await c.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
      const p = await c.newPage();
      p.on('pageerror', (e) => console.log('overlay page error:', e.message));
      await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
      const look = () => p.evaluate(() => {
        const b = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }, call = document.getElementById('call'), main = document.getElementById('main');
        return { full: document.body.classList.contains('full'), call: b(call), text: call.textContent, opacity: +getComputedStyle(call).opacity, shown: getComputedStyle(call).display !== 'none', main: b(main), items: [...main.querySelectorAll('.toast, .pill, .nudge')].map((e) => e.textContent) };
      });
      const fire = async (s) => { await p.evaluate((s) => window.fire(s), s); await p.waitForTimeout(600); return look(); }; // the fade takes 0.4 s
      const base = { visible: true, pos: 'mr', scale: 1, opacity: 1, game: 'Dragon 1:23 · Baron 12:00', toasts: [] };
      let o = await fire({ ...base, board: true, call: 'Jungler on botside' });
      assert(o.full && o.opacity === 1 && o.text === 'Jungler on botside', JSON.stringify(o));
      assert(Math.abs(o.call[0] + o.call[2] / 2 - 640) <= 1 && o.call[1] === 18, `the line in the middle at the top: ${JSON.stringify(o.call)}`);
      assert.deepStrictEqual(o.main.slice(0, 2), [1280 - 300 - 16, (720 - 360) / 2], 'the rest at the middle right, as the small window');
      assert.deepStrictEqual(o.items, ['Dragon 1:23 · Baron 12:00']);
      if (process.env.SHOTS) { // over Rayan's minimap, red Yasuo at the bottom, as a stand-in for League
        await backdrop(p, 'bot');
        await shot(p, 'jungler-callout');
      }
      o = await fire({ ...base, board: true, call: '' });
      assert(o.full && o.opacity === 0 && o.text === 'Jungler on botside', `faded out, its words kept for the fade: ${JSON.stringify(o)}`);
      o = await fire({ ...base, pos: 'custom', box: { x: 0.5, y: 0.25 }, scale: 1.5, board: true, call: 'Check your minimap' });
      assert(o.opacity === 1 && o.text === 'Check your minimap' && o.main[0] === 640 && o.main[1] === 180 && o.main[2] === 450, `dragged and bigger: ${JSON.stringify(o)}`);
      o = await fire({ ...base, board: null, call: '' });
      assert(!o.full && !o.shown && o.main[2] === 1280 && o.items.length === 1, `the small window, no line: ${JSON.stringify(o)}`);
      const card = (name) => ({ name, sub: 'Ahri · Middle', pic: '', rank: 'Gold II', tags: [] });
      o = await fire({ ...base, board: { us: [card('A')], them: [card('B')] }, call: 'Check your minimap' });
      assert(!o.full && !o.shown && o.items[0] === 'Check your minimap' && (await p.evaluate(() => document.querySelector('.stack').firstChild.className)) === 'pill nudge', `first in the stack over everyone's rank: ${JSON.stringify(o)}`);
      // parts in places of their own (the Overlay page's Layout): chat from its bottom right corner, the line at the top
      // at the bottom middle and bigger, who's off your minimap and the card after a game; your lane with your CS
      const box = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel), r = e && e.getBoundingClientRect(); return r && [r.left, r.top, r.right, r.bottom].map(Math.round); }, sel);
      const parts = { chat: { x: 0.99, y: 0.95, ax: 'r', ay: 'b' }, call: { x: 0.5, y: 0.9, ax: 'c', ay: 'b', k: 1.5 }, missing: { x: 0.99, y: 0.72, ax: 'r', ay: 'b' }, after: { x: 0.5, y: 0.06, ax: 'c', ay: 't' } };
      const many = { ...base, board: true, call: 'Zed missing from mid', parts, cs: 'CS 64 · 7.1 a minute', lane: 'vs Zed: CS +6 · gold +0.3k', chat: [{ name: 'Kai', text: 'dragon soon' }],
        missing: [['Zed', '', '0:40', 'toward bot'], ['Lee Sin', '', '', 'not seen yet']], after: { title: 'Victory · Ahri', win: true, lines: ['+18 LP: Gold II · 63 LP', 'Score 91 · MVP'] } };
      o = await fire(many);
      const chat = await box('#parts [data-part="chat"]'), line = await box('#call'), list = await box('#parts [data-part="missing"]'), after = await box('#parts [data-part="after"]');
      assert(chat && chat[2] === 1267 && chat[3] === 684, `chat hangs from its bottom right corner: ${chat}`);
      assert(Math.abs((line[0] + line[2]) / 2 - 640) <= 1 && line[3] === 648 && line[3] - line[1] < 60 && o.text === 'Zed missing from mid', `the line at the bottom middle, half again as big: ${line}`);
      assert(list[2] === 1267 && list[3] === 518 && after[1] === 43 && Math.abs((after[0] + after[2]) / 2 - 640) <= 1, `the list over the minimap, the card at the top: ${list} ${after}`);
      assert.deepStrictEqual(o.items, ['Dragon 1:23 · Baron 12:00', 'CS 64 · 7.1 a minute', 'vs Zed: CS +6 · gold +0.3k'], 'the rest: the timers, your CS and your lane');
      assert.deepStrictEqual(await p.$$eval('.miss .name, .miss .mt, .miss .sub', (l) => l.map((e) => e.textContent)), ['Zed', '0:40', 'toward bot', 'Lee Sin', '', 'not seen yet']);
      assert.strictEqual(await p.$eval('.after', (e) => e.className + ': ' + [...e.children].map((x) => x.textContent).join(' | ')), 'toast after win: Victory · Ahri | +18 LP: Gold II · 63 LP | Score 91 · MVP');
      await shot(p, 'overlay-parts');
      o = await fire({ ...many, board: null, edit: true, call: '' });
      assert(!(await box('[data-part="chat"]')) && !(await box('[data-part="missing"]')) && o.items.includes('vs Zed: CS +6 · gold +0.3k'), 'while you move the rest, only the rest');
      o = await fire({ visible: false });
      assert(o.opacity === 0 && !o.items.length, 'all gone');
      await c.close();
      console.log('overlay: the line at the top in the middle fades in and out, the rest where the small window would be; first over everyone’s rank; parts in places of their own');
    }

    // ---- the minimap reminder: every 10 s from 1:00 in the first game, one game counted per room, off after 20
    {
      const [c, page] = await context(browser, { mapNudge: { n: 0, room: '' } });
      const emit = (d) => page.evaluate((d) => lpcClient.emit('league', d), d);
      const nudge = () => page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')).mapNudge);
      await emit(game({ mode: 'ARAM', t: 69 }));
      await page.waitForTimeout(1500);
      assert(!(await page.evaluate(() => lpcClient.lastOverlay && lpcClient.lastOverlay.board)) && (await nudge()).n === 0, 'not in ARAM');
      await emit(game({ t: 69, room: 'g000000000r1' }));
      await wait(page, () => lpcClient.lastOverlay.board === true && lpcClient.lastOverlay.call === '', null, 'the whole screen, nothing said yet');
      assert.deepStrictEqual(await nudge(), { n: 1, room: 'g000000000r1' });
      await wait(page, () => lpcClient.lastOverlay.call === 'Check your minimap', null, 'the reminder at 1:10');
      await wait(page, () => lpcClient.lastOverlay.call === '' && lpcClient.lastOverlay.board === true, null, 'gone at 1:12, still the whole screen');
      for (let n = 2; n <= 20; n++) {
        await emit(game({ room: 'g000000000r' + n }));
        await wait(page, (n) => JSON.parse(localStorage.getItem('lpc-opts')).mapNudge.n === n, n, `game ${n} counted`);
      }
      await emit(game({ room: 'g00000000r21' }));
      await wait(page, () => !JSON.parse(localStorage.getItem('lpc-opts')).mapNudge && !document.getElementById('optMapNudge').checked, null, 'off after 20 games');
      await wait(page, () => lpc.toasts().includes('That was 20 games with the minimap reminder, so it’s off now. The Overlay page turns it back on.'), null, 'and says so');
      await wait(page, () => !lpcClient.lastOverlay.board, null, 'the overlay back to its small window');
      await c.close();
      console.log('minimap reminder: every 10 s from 1:00, a game counted per room, off by itself after 20 games');
    }

    // ---- the jungler callout: their Yasuo (the jungle pet) in red on the shared minimap
    {
      const [c, page] = await context(browser, { jgCall: true });
      await page.evaluate(() => { window.screenNow = 'bot'; });
      await page.evaluate((d) => lpcClient.emit('league', d), game()); // the app reads the minimap by itself in the game
      await wait(page, () => lpcClient.lastOverlay && lpcClient.lastOverlay.call === 'Jungler on botside' && lpcClient.lastOverlay.board === true, null, 'Jungler on botside');
      const t0 = Date.now();
      await wait(page, () => lpcClient.lastOverlay.call === '', null, 'gone after 3 s');
      assert(Date.now() - t0 > 2500, `shown for 3 s, not ${Date.now() - t0} ms`);
      await page.waitForTimeout(2000);
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.call), '', 'not again while they stay in sight');
      await page.evaluate(() => { window.screenNow = 'none'; });
      await page.waitForTimeout(5000);
      await page.evaluate(() => { window.screenNow = 'top'; });
      await page.waitForTimeout(2000);
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.call), '', 'not again after only 5 s out of sight');
      await page.evaluate(() => { window.screenNow = 'none'; });
      await page.waitForTimeout(10500);
      await page.evaluate(() => { window.screenNow = 'top'; });
      await wait(page, () => lpcClient.lastOverlay.call === 'Jungler on topside', null, 'Jungler on topside after 10 s out of sight');
      await page.evaluate(() => { document.getElementById('optJgCall').click(); });
      await wait(page, () => !lpcClient.lastOverlay.board, null, 'the callout off');
      await c.close();
      console.log('jungler callout: on the bottom side for 3 s, not again while in sight or after 5 s away, on the top side after 10 s away');
    }

    // ---- the other callouts and who's off your minimap, from the made-up champions on Rayan's minimap: Zed in the
    // middle lane for 4 s, then gone (missing); Lee Sin, their jungler, in your jungle, then coming toward you; Garen
    // dying. Each read out loud, and the screen let go when the game ends.
    {
      const [c, page] = await context(browser, { missCall: true, gankCall: true, invadeCall: true, missList: true, speakCalls: true });
      await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = (u) => spoken.push(u.text); speechSynthesis.cancel = () => {}; });
      const rows = () => page.evaluate(() => (lpcClient.lastOverlay.missing || []).map(([name, , time, where]) => [name, time, where]));
      const said = (text, what, timeout = 10000) => wait(page, (t) => lpcClient.lastOverlay.call === t, text, what, timeout);
      await page.evaluate(() => { window.screenNow = 'zedMid'; });
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame());
      await wait(page, () => (lpc.foes() || []).some((f) => f.id === 'Zed' && f.zone === 'mid' && f.where === 'in mid'), null, 'Zed seen in the middle lane');
      const t0 = Date.now();
      await wait(page, () => (lpcClient.lastOverlay.missing || []).length === 2, null, 'the list without Zed');
      assert.deepStrictEqual(await rows(), [['Lee Sin', '', 'not seen yet'], ['Garen', '', 'not seen yet']]);
      const o = await page.evaluate(() => lpcClient.lastOverlay);
      assert(o.board === true && o.call === '' && o.parts.missing.ax === 'r' && o.parts.call.ax === 'c', `the whole screen, nothing said yet: ${JSON.stringify(o.parts)}`);
      await page.waitForTimeout(4000 - (Date.now() - t0));
      await page.evaluate(() => { window.screenNow = 'none'; });
      await wait(page, () => (lpcClient.lastOverlay.missing || []).some((r) => r[0] === 'Zed' && r[3] === 'in mid'), null, 'Zed off the minimap');
      const gone = Date.now();
      await said('Zed missing from mid', 'Zed missing from mid', 15000);
      assert(Date.now() - gone > 7500, `missing after 10 s out of sight, not ${Date.now() - gone} ms`);
      assert.match((await rows())[0].join(' '), /^Zed 0:(09|1\d) in mid$/);
      await overlayShot(browser, 'missing-laner', await page.evaluate(() => lpcClient.lastOverlay), 'none');
      await page.evaluate(() => { window.screenNow = 'leeJungle'; });
      await said('Lee Sin in your jungle', 'Lee Sin in your jungle');
      await wait(page, () => lpc.me().fresh, null, 'your Yasuo found on the minimap');
      for (const k of ['g1', 'g2', 'g3']) { await page.evaluate((k) => { window.screenNow = k; }, k); await page.waitForTimeout(700); }
      await said('Lee Sin heading your way', 'Lee Sin heading your way');
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame(1));
      await wait(page, () => { const r = (lpcClient.lastOverlay.missing || []).find((x) => x[0] === 'Garen'); return !!r && r[2] === 'dead' && /^back in 0:1[0-2]$/.test(r[3]); }, null, 'Garen dead, back in 12 s at level 3');
      assert.deepStrictEqual(await page.evaluate(() => spoken), ['Zed missing from mid', 'Lee Sin in your jungle', 'Lee Sin heading your way']);
      await overlayShot(browser, 'missing-list', await page.evaluate(() => lpcClient.lastOverlay), 'g3');
      await page.evaluate(() => lpcClient.emit('league', { inGame: false }));
      await wait(page, () => !lpc.me().minimap && !lpcClient.lastOverlay.missing, null, 'the screen let go after the game');
      await c.close();
      console.log('callouts: Zed missing from mid 10 s after leaving the minimap, Lee Sin in your jungle, then heading your way, all read out loud; who’s off the minimap and Garen dead');
    }

    // ---- the Overlay page's Layout: Room chat dragged to the top right, nudged down with the arrow keys and made
    // bigger; the rest dragged; each put back. The overlay in the game gets the places.
    {
      const [c, page] = await context(browser, {});
      await page.evaluate((d) => lpcClient.emit('league', d), game());
      await page.click('.nav[data-view="overlay"]');
      const handles = () => page.$$eval('#ovHandles .ovhandle', (l) => l.map((b) => b.dataset.part));
      await wait(page, () => document.querySelectorAll('#ovHandles .ovhandle').length === 11, null, 'a box over each part');
      assert.deepStrictEqual(await handles(), ['', 'game', 'cs', 'me', 'talk', 'chat', 'toasts', 'buy', 'after', 'tips', 'screen']);
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')));
      const box = (k) => page.locator(`#ovHandles .ovhandle[data-part="${k}"]`).boundingBox();
      const stage = await page.evaluate(() => { const e = document.getElementById('ovStage'), r = e.getBoundingClientRect(); return { x: r.left + e.clientLeft, y: r.top + e.clientTop, w: e.clientWidth, h: e.clientHeight }; });
      const drag = async (b, x, y) => { await page.mouse.move(b.x + b.width / 2, b.y + b.height - 4); await page.mouse.down(); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up(); };
      const chat = await box('chat');
      await drag(chat, stage.x + stage.w - 80, stage.y + 40);
      let o = await saved();
      const right = (stage.w - 80 + chat.width / 2) / stage.w, top = (40 - chat.height + 4) / stage.h;
      assert(o.overlayParts.chat.ax === 'r' && o.overlayParts.chat.ay === 't' && Math.abs(o.overlayParts.chat.x - right) < 0.01 && Math.abs(o.overlayParts.chat.y - top) < 0.01, `chat at the top right: ${JSON.stringify(o.overlayParts)}, ${right} ${top}`);
      assert(await page.evaluate(() => !!document.getElementById('ovFrame').contentDocument.querySelector('#parts [data-part="chat"]')), 'in a place of its own in the frame');
      await wait(page, () => lpcClient.lastOverlay.board === true && lpcClient.lastOverlay.parts.chat.ax === 'r', null, 'the whole screen in the game, with chat’s place');
      await page.keyboard.press('ArrowDown');
      const y = (await saved()).overlayParts.chat.y;
      assert(Math.abs(y - o.overlayParts.chat.y - 0.01) < 0.004 && (await page.evaluate(() => document.activeElement.dataset.part)) === 'chat', `a step down: ${o.overlayParts.chat.y} to ${y}, focus on ${await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80))}`);
      await page.$eval('#optScale', (el) => { el.value = 1.5; el.dispatchEvent(new Event('input')); });
      o = await saved();
      assert(o.overlayParts.chat.k === 1.5 && o.overlayScale === 1, 'chat bigger, the rest not');
      assert.deepStrictEqual([await page.textContent('#ovWhat'), await page.textContent('#scaleOut'), await page.isDisabled('#ovBack')], ['Room chat', '150%', false]);
      await page.click('#ovHandles .ovhandle[data-part="cs"]');
      assert.deepStrictEqual([await page.textContent('#ovWhat'), await page.textContent('#scaleOut'), await page.isDisabled('#ovBack')], ['The rest', '100%', true], 'your CS is in the rest');
      const rest = await box('');
      await drag(rest, rest.x + rest.width / 2 + 200, rest.y + rest.height - 4 + 100);
      o = await saved();
      assert(o.overlayPos === 'custom' && Math.abs(o.overlayBox.x - (rest.x - stage.x + 200) / stage.w) < 0.01 && Math.abs(o.overlayBox.y - (rest.y - stage.y + 100) / stage.h) < 0.01 && (await page.inputValue('#optPos')) === 'custom', `the rest moved: ${JSON.stringify(o.overlayBox)}`);
      await page.check('#optMissList');
      await page.check('#optMissCall');
      await wait(page, () => [...document.querySelectorAll('#ovHandles .ovhandle')].map((b) => b.dataset.part).join() === ',game,cs,me,talk,toasts,buy,chat,missing,after,tips,screen,call', null, 'the callouts and who’s off the minimap on the Layout');
      if (process.env.SHOTS) await page.waitForTimeout(500); // the line at the top fades in
      await shot(page, 'overlay-page', '.view[data-view="overlay"]');
      await page.click('#ovHandles .ovhandle[data-part="chat"]');
      await page.click('#ovBack');
      assert(!(await saved()).overlayParts.chat, 'chat put back');
      await page.click('#ovReset');
      o = await saved();
      assert(JSON.stringify(o.overlayParts) === '{}' && o.overlayPos === 'tl' && o.overlayBox === null && o.overlayScale === 1, 'everything put back');
      await c.close();
      console.log('Overlay page: a part dragged, nudged and sized, the rest dragged, then put back; the overlay in a game gets the places');
    }

    // ---- after the game: their jungler's first 14 minutes on the report
    {
      const [c, page] = await context(browser, {});
      const MAP = 14870, at = (x, y) => ({ x: Math.round(x * MAP), y: Math.round(y * MAP) });
      const lanes = ['MIDDLE', 'TOP', 'JUNGLE', 'BOTTOM', 'UTILITY'], champs = [103, 86, 157, 103, 86, 86, 64, 157, 103, 86];
      const r = { id: 7, mode: 'CLASSIC', me: 0, len: 1500, players: champs.map((champ, i) => ({ pid: i + 1, team: i < 5 ? 100 : 200, l: i < 5 ? lanes[i] : ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i - 5], champ })) };
      const path_ = [[0.55, 0.78], [0.62, 0.7], [0.75, 0.62], [0.7, 0.66], [0.5, 0.68], [0.47, 0.5], [0.6, 0.75], [0.72, 0.6], [0.8, 0.55], [0.65, 0.7], [0.55, 0.78], [0.62, 0.7], [0.75, 0.62], [0.7, 0.66], [0.6, 0.6]];
      const tl = { frames: Array.from({ length: 16 }, (_, k) => ({
        timestamp: k * 60000,
        participantFrames: Object.fromEntries(champs.map((_, i) => [i + 1, { position: i === 6 && k ? at(...path_[k - 1]) : at(0.45, 0.47) }])),
        events: k === 6 ? [{ type: 'CHAMPION_KILL', timestamp: 330000, victimId: 1, killerId: 7, assistingParticipantIds: [], position: at(0.42, 0.44) }]
          : k === 9 ? [{ type: 'CHAMPION_KILL', timestamp: 540000, victimId: 1, killerId: 8, assistingParticipantIds: [9], position: at(0.45, 0.47) }] : [],
      })) };
      await wait(page, () => lpc.jungler({ mode: 'CLASSIC', me: 0, players: [{ team: 100, l: 'MIDDLE', champ: 103 }] }, { frames: [] }) === null, null, 'the page', 5000);
      const says = await page.evaluate(([r, tl]) => {
        const box = document.createElement('div');
        box.id = 'jgShot';
        box.style.cssText = 'position: fixed; inset: 0; z-index: 99; padding: 20px; background: var(--bg); overflow: auto';
        box.append(lpc.jungler(r, tl));
        document.body.append(box);
        const cv = box.querySelector('canvas.fightmap');
        return { head: box.querySelector('h3').textContent, lines: [...box.querySelectorAll('.takeaways li')].map((e) => e.textContent), map: !!cv && cv.width === 480 && cv.getAttribute('aria-label') };
      }, [r, tl]);
      assert.strictEqual(says.head, 'Their jungler, Lee Sin');
      assert.match(says.lines[0], /^At 1:00, Lee Sin was in their jungle on the top side\.$/);
      assert.strictEqual(says.lines[1], 'Lee Sin was in on 1 of your 2 deaths before 14 minutes.');
      assert.match(says.lines[2], /^5:30: Lee Sin killed you in the middle lane\. At 5:00 they were in their jungle on the top side\.$/);
      assert.strictEqual(says.lines[3], 'Next game, glance at your minimap every few seconds, and play safe when their jungler shows up near your lane until you see them again. The Overlay page can remind you, or call out their jungler when they show up.');
      assert.strictEqual(says.map, 'Where Lee Sin was each minute for the first 14 minutes, and where you died');
      await shot(page, 'jungler-review', '#jgShot');
      assert.strictEqual(await page.evaluate(([r, tl]) => lpc.jungler({ ...r, mode: 'ARAM' }, tl), [r, tl]), null, 'not in ARAM');
      await c.close();
      console.log('game report: their jungler’s first 14 minutes, the death they were in on and where they were before it');
    }
    console.log('ok');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit(process.exitCode || 0);
  }
})();

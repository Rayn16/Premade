// Test of the overlay's line at the top of the screen (site/overlay.html) and what fills it in site/index.html, in
// headless Chromium with a stand-in for the desktop app 1.13 (window.lpcClient):
// the overlay page itself (the line in the middle at the top, fading in and out, the rest where the small window would
// be, and first in the stack over everyone's rank; parts in places of their own, who's off your minimap and the card
// after a game); the minimap reminder (every 10 s from 1:00, a game counted per room, off by itself after 20 games); the
// jungler callout, on a screen with Rayan's minimap from his Practice Tool screenshot and his Yasuo icon copied there in
// the other team's red, read by the app by itself in the game ("Jungler on botside" for 3 s, not again while they stay
// in sight, "Jungler on topside" when they show up again after 10 s); the other callouts and the list of who's off your
// minimap, with made-up champions drawn on the same minimap (a missing laner, an invade, a gank, a death, read out
// loud); Settings, Overlay's Layout (drag a part, the arrow keys, its size, the rest, put back); and the game report's
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
const openPage = async (p, v) => { if (!(await p.isVisible(`.nav[data-view="${v}"]`))) await p.click('#leagueNav'); await p.click(`.nav[data-view="${v}"]`); }; // the sidebar shows Premade's or League's list (What's new 178): swap it if the page isn't on it

const SITE = path.join(__dirname, 'site');
const PORT = 8083, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const shot = (pg, name, sel) => process.env.SHOTS && (sel ? pg.locator(sel) : pg).screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
const openSet = async (p, sec) => { await openPage(p, 'settings'); await p.click(`#setList [data-sec="${sec}"]`); }; // a section of Settings (What's new 207)

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
  for (const [c, cx, cy, ring] of icons) for (let dy = -Math.ceil(r + 2); dy <= r + 2; dy++) for (let dx = -Math.ceil(r + 2); dx <= r + 2; dx++) {
    const d = Math.hypot(dx, dy), to = ((m.y + cy + dy) * R + m.x + cx + dx) * 4;
    if (d <= 0.86 * r) out.set(PICS[c][(64 + (dy / r) * k < 64 ? 0 : 2) + (64 + (dx / r) * k < 64 ? 0 : 1)], to);
    else if (d >= r - 1.6 && d <= r + 1.4) out.set(ring || [215, 40, 45], to); // ring: your team's blue
  }
  return Buffer.from(out.buffer);
}
const SCREENS = { none: Buffer.from(corner.buffer), bot: withFoe([200, 205]), top: withFoe([60, 100]), red: withFoe([148, 198]), // x + y past the minimap's width: the bottom side; your red buff
  zedMid: withIcons([['Zed', 172, 109]]), leeMid: withIcons([['LeeSin', 172, 109]]), leeJungle: withIcons([['LeeSin', 130, 215]]), // Zed in the middle lane on their side, Lee Sin in your jungle
  g1: withIcons([['LeeSin', 165, 168]]), g2: withIcons([['LeeSin', 150, 168]]), g3: withIcons([['LeeSin', 135, 168]]), // Lee Sin coming toward you (ME)
  p1: withIcons([['LeeSin', 150, 140]]), p2: withIcons([['LeeSin', 150, 155]]), p3: withIcons([['LeeSin', 150, 170]]), // Lee Sin walking past you, closer but not at you
  // What's new 182: Lee Sin and Zed (their mid) coming at you together; Lee Sin walking toward the top lane, where a
  // teammate's blue icon is (Garen's picture there, as only the ring counts)
  c1: withIcons([['LeeSin', 165, 168], ['Zed', 150, 130]]), c2: withIcons([['LeeSin', 150, 168], ['Zed', 140, 140]]), c3: withIcons([['LeeSin', 135, 168], ['Zed', 122, 144]]),
  h1: withIcons([['LeeSin', 92, 112], ['Garen', 26, 120, [40, 120, 220]]]), h2: withIcons([['LeeSin', 80, 110], ['Garen', 26, 120, [40, 120, 220]]]), h3: withIcons([['LeeSin', 68, 108], ['Garen', 26, 120, [40, 120, 220]]]) };
const yasuo = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/ddragon-yasuo-128.rgba.gz')));

// ---- a faded face (What's new 181) over the shared minimap, as overlay.html draws it: the picture in grey, a third
// see-through, a 2 px grey ring, the size of an icon. The reader still finds and matches an enemy back on that spot,
// and finds no enemy at a lone faded face.
{
  const r = ctx.CameraBox.RING * m.s, sub = (buf) => { const o = new Uint8ClampedArray(m.s * m.s * 4); for (let y = 0; y < m.s; y++) o.set(buf.subarray(((m.y + y) * R + m.x) * 4, ((m.y + y) * R + m.x + m.s) * 4), y * m.s * 4); return o; };
  const ghostOn = (buf, c, cx, cy) => {
    const out = new Uint8ClampedArray(buf);
    for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
      const d = Math.hypot(dx, dy), to = ((m.y + cy + dy) * R + m.x + cx + dx) * 4;
      if (d > r) continue;
      const [cr, cg, cb] = d >= r - 2 ? [154, 160, 166] : PICS[c][(dy < 0 ? 0 : 2) + (dx < 0 ? 0 : 1)], grey = d >= r - 2 ? null : 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      [grey ?? cr, grey ?? cg, grey ?? cb].forEach((v, k) => { out[to + k] = out[to + k] * (2 / 3) + v / 3; });
    }
    return out;
  };
  const zed = ctx.CameraBox.picLook(picOf('Zed'), 128), near = (l, x, y) => l.filter((i) => Math.hypot(i.x - x, i.y - y) < r);
  const back = sub(ghostOn(withIcons([['Zed', 172, 109]]), 'Zed', 172, 109)), found = near(ctx.CameraBox.findIcons(back, m.s, true), 172, 109);
  assert(found.length === 1 && ctx.CameraBox.lookDiff(ctx.CameraBox.iconLook(back, m.s, found[0].x, found[0].y), zed) < ctx.CameraBox.PICK_LOOK, `Zed back under his faded face is found and matched: ${JSON.stringify(found)}`);
  assert.strictEqual(near(ctx.CameraBox.findIcons(sub(ghostOn(corner, 'Zed', 172, 109)), m.s, true), 172, 109).length, 0, 'no enemy at a lone faded face');
  console.log('faded faces: an enemy back under one is still found and matched, a lone one is no enemy');
}

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
    if (u.endsWith('summoner.json')) return r.fulfill({ json: { data: { SummonerFlash: { key: '4', cooldown: [300] }, SummonerDot: { key: '14', cooldown: [180] } } }, headers: cors });
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
      // parts in places of their own (Settings, Overlay's Layout): chat from its bottom right corner, the line at the top
      // at the bottom middle and bigger, who's off your minimap and the card after a game; your lane with your CS
      const box = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel), r = e && e.getBoundingClientRect(); return r && [r.left, r.top, r.right, r.bottom].map(Math.round); }, sel);
      const parts = { chat: { x: 0.99, y: 0.95, ax: 'r', ay: 'b' }, call: { x: 0.5, y: 0.9, ax: 'c', ay: 'b', k: 1.5 }, after: { x: 0.5, y: 0.06, ax: 'c', ay: 't' } };
      const many = { ...base, board: true, call: 'Zed missing from mid', parts, cs: 'CS 64 · 7.1 a minute', lane: 'vs Zed: CS +6 · gold +0.3k', chat: [{ name: 'Kai', text: 'dragon soon' }],
        ghosts: [{ pic: 'https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Zed.png', x: 0.9, y: 0.85, d: 0.022, s: 12 }], after: { title: 'Victory · Ahri', win: true, lines: ['+18 LP: Gold II · 63 LP', 'Score 91 · MVP'] } };
      o = await fire(many);
      const chat = await box('#parts [data-part="chat"]'), line = await box('#call'), face = await box('#ghosts .ghost'), after = await box('#parts [data-part="after"]');
      assert(chat && chat[2] === 1267 && chat[3] === 684, `chat hangs from its bottom right corner: ${chat}`);
      assert(Math.abs((line[0] + line[2]) / 2 - 640) <= 1 && line[3] === 648 && line[3] - line[1] < 60 && o.text === 'Zed missing from mid', `the line at the bottom middle, half again as big: ${line}`);
      assert(face && Math.abs((face[0] + face[2]) / 2 - 1152) <= 1 && Math.abs((face[1] + face[3]) / 2 - 612) <= 1 && Math.abs(face[2] - face[0] - 15.84) <= 1 && after[1] === 43 && Math.abs((after[0] + after[2]) / 2 - 640) <= 1, `the faded face on the minimap, the card at the top: ${face} ${after}`);
      assert.deepStrictEqual(await p.$eval('#ghosts .ghost', (e) => [getComputedStyle(e.firstChild).filter, getComputedStyle(e.firstChild).opacity, getComputedStyle(e.firstChild).borderTopColor, e.lastChild.textContent]), ['grayscale(1)', '0.33', 'rgb(154, 160, 166)', '12 s'], 'grey, a third see-through, a grey ring, the seconds since');
      assert.deepStrictEqual(o.items, ['Dragon 1:23 · Baron 12:00', 'CS 64 · 7.1 a minute', 'vs Zed: CS +6 · gold +0.3k'], 'the rest: the timers, your CS and your lane');
      // up to 3 callouts at once, newest on top: faces and signs with a word or two, the sentence for screen readers
      const Z = 'https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Zed.png', L = 'https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/LeeSin.png';
      await fire({ ...base, board: true, call: 'Lee Sin at your red', calls: [{ text: 'Lee Sin at your red', pics: ['f:' + L, 's:pin', 'w:your red'] }, { text: 'Zed missing from mid', pics: ['f:' + Z, 's:missing', 'w:missing mid'] }, { text: 'Zed is level 6', pics: [Z, '6'] }] });
      assert.deepStrictEqual(await p.$$eval('#call > .pill', (l) => l.map((e) => [e.getAttribute('aria-label'), e.className, [...e.querySelector('.cpics').children].map((x) => x.className || x.tagName).join(' ')])),
        [['Lee Sin at your red', 'pill nudge pics words', 'face f sign cw'], ['Zed missing from mid', 'pill nudge pics words', 'face f sign cw'], ['Zed is level 6', 'pill nudge pics', 'IMG lvl']], 'three, newest on top');
      assert.strictEqual(await p.$eval('#call .face.f', (e) => getComputedStyle(e).borderTopColor), 'rgb(255, 92, 92)', 'their face in a red ring');
      if (process.env.SHOTS) { await backdrop(p, 'none'); await shot(p, 'callouts-stack'); }
      o = await fire(many);
      assert.strictEqual(await p.$eval('.after', (e) => e.className + ': ' + [...e.children].map((x) => x.textContent).join(' | ')), 'toast after win: Victory · Ahri | +18 LP: Gold II · 63 LP | Score 91 · MVP');
      await shot(p, 'overlay-parts');
      o = await fire({ ...many, board: null, edit: true, call: '' });
      assert(!(await box('[data-part="chat"]')) && !(await box('#ghosts .ghost')) && o.items.includes('vs Zed: CS +6 · gold +0.3k'), 'while you move the rest, only the rest');
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
      await wait(page, () => lpc.toasts().includes('That was 20 games with the minimap reminder, so it’s off now. Settings, Callouts turns it back on.'), null, 'and says so');
      await wait(page, () => !lpcClient.lastOverlay.board, null, 'the overlay back to its small window');
      await c.close();
      console.log('minimap reminder: every 10 s from 1:00, a game counted per room, off by itself after 20 games');
    }

    // ---- the jungler callout: their Yasuo (the jungle pet) in red on the shared minimap
    {
      const [c, page] = await context(browser, { jgCall: true });
      await page.evaluate(() => { window.screenNow = 'red'; });
      await page.evaluate((d) => lpcClient.emit('league', d), game()); // the app reads the minimap by itself in the game
      await wait(page, () => lpcClient.lastOverlay && lpcClient.lastOverlay.call === 'Yasuo at your red' && lpcClient.lastOverlay.board === true, null, 'Yasuo at your red');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['f:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Yasuo.png', 's:pin', 'w:your red'], 'their face, a pin, your red');
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
      await wait(page, () => /^Yasuo (at|in) /.test(lpcClient.lastOverlay.call), null, 'Yasuo called again after 10 s out of sight');
      console.log('jungler callout on the top side:', await page.evaluate(() => lpcClient.lastOverlay.call));
      await page.evaluate(() => { document.getElementById('optJgCall').click(); });
      await wait(page, () => !lpcClient.lastOverlay.board, null, 'the callout off');
      await c.close();
      console.log('jungler callout: at your red for 3 s, not again while in sight or after 5 s away, called again on the top side after 10 s away');
    }

    // ---- the other callouts and who's off your minimap, from the made-up champions on Rayan's minimap: Zed in the
    // middle lane for 4 s, then gone (missing); Lee Sin, their jungler, in your jungle, then coming toward you; Garen
    // dying. Each read out loud, and the screen let go when the game ends.
    {
      const [c, page] = await context(browser, { missCall: true, gankCall: true, invadeCall: true, missList: true, speakCalls: true });
      await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = (u) => spoken.push(u.text); speechSynthesis.cancel = () => {}; });
      const ghosts = () => page.evaluate(() => lpcClient.lastOverlay.ghosts || []);
      const said = (text, what, timeout = 10000) => wait(page, (t) => lpcClient.lastOverlay.call === t, text, what, timeout);
      await page.evaluate(() => { window.screenNow = 'zedMid'; });
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame());
      await wait(page, () => (lpc.foes() || []).some((f) => f.id === 'Zed' && f.zone === 'mid' && f.where === 'in mid'), null, 'Zed seen in the middle lane');
      const t0 = Date.now();
      await wait(page, () => lpcClient.lastOverlay.board === true, null, 'the whole screen');
      const o = await page.evaluate(() => lpcClient.lastOverlay);
      assert(o.call === '' && !o.ghosts && o.parts.call.ax === 'c', `nothing said yet, no faded face while Zed is in sight: ${JSON.stringify(o)}`);
      await page.waitForTimeout(4000 - (Date.now() - t0));
      await page.evaluate(() => { window.screenNow = 'none'; });
      await wait(page, () => (lpcClient.lastOverlay.ghosts || []).some((g) => /Zed\.png$/.test(g.pic)), null, 'Zed’s faded face');
      const gone = Date.now();
      await said('Zed missing from mid', 'Zed missing from mid', 15000);
      assert(Date.now() - gone > 7500, `missing after 10 s out of sight, not ${Date.now() - gone} ms`);
      const [g] = await ghosts(), sq = await page.evaluate(() => lpc.me().minimap); // where League's minimap showed him last: the screen is 2560 x 1436
      assert(Math.abs(g.x * 2560 - (sq.x + 172)) < 2 && Math.abs(g.y * 1436 - (sq.y + 109)) < 2 && Math.abs(g.d * 1436 - 2 * 0.0432 * sq.s) < 0.5 && g.s >= 9 && g.s <= 12, `his faded face where he was, the seconds since: ${JSON.stringify(g)} ${JSON.stringify(sq)}`);
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['f:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Zed.png', 's:missing', 'w:missing mid'], 'his face, a missing sign, missing mid');
      await overlayShot(browser, 'missing-laner', await page.evaluate(() => lpcClient.lastOverlay), 'none');
      await page.evaluate(() => { window.screenNow = 'leeJungle'; });
      await wait(page, () => /^Lee Sin (at|in) your /.test(lpcClient.lastOverlay.call), null, 'Lee Sin in your jungle, by its spot');
      const invade = await page.evaluate(() => lpcClient.lastOverlay.call);
      await wait(page, () => lpc.me().fresh, null, 'your Yasuo found on the minimap');
      for (const k of ['p1', 'p2', 'p3']) { await page.evaluate((k) => { window.screenNow = k; }, k); await page.waitForTimeout(700); }
      await page.waitForTimeout(3500); // a warning would have shown by now, after the invade's 3 s
      assert(!(await page.evaluate(() => spoken)).some((t) => /heading your way/.test(t)), 'no gank warning for a jungler walking past you');
      for (const k of ['g1', 'g2', 'g3']) { await page.evaluate((k) => { window.screenNow = k; }, k); await page.waitForTimeout(700); }
      await said('Lee Sin heading your way', 'Lee Sin heading your way');
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame(1));
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['f:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/LeeSin.png', 's:arrow', 'a:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Yasuo.png', 'w:your way'], 'his face, an arrow, yours, your way');
      assert.deepStrictEqual(await page.evaluate(() => spoken), ['Zed missing from mid', invade, 'Lee Sin heading your way']);
      await overlayShot(browser, 'missing-list', await page.evaluate(() => lpcClient.lastOverlay), 'g3');
      await page.evaluate(() => lpcClient.emit('league', { inGame: false }));
      await wait(page, () => !lpc.me().minimap && !lpcClient.lastOverlay.ghosts, null, 'the screen let go after the game');
      await c.close();
      console.log(`callouts: Zed missing from mid 10 s after leaving the minimap with his faded face where he was, “${invade}”, then heading your way, all as pictures and read out loud`);
    }

    // ---- What's new 237, the gank clock: Lee Sin (their jungler) seen in mid on their side, 5,442 units round the walls
    // from you, then gone: "Safe 15 s" or so by the minimap at 340 speed with Flash up, about a second longer once his
    // Flash is timed on the strip, red under 5 s, "Could be here" at 0 for 5 s, then nothing; his faded face's outline
    // grows meanwhile; no box while he's in sight
    {
      const [c, page] = await context(browser, { gankClock: true, missList: true, foeTimers: true });
      const gank = () => page.evaluate(() => lpcClient.lastOverlay.gank);
      await page.evaluate(() => { window.screenNow = 'leeMid'; });
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame());
      await wait(page, () => (lpc.foes() || []).some((f) => f.id === 'LeeSin' && f.zone === 'mid') && lpc.me().fresh, null, 'Lee Sin seen in mid, you on the minimap');
      await page.waitForTimeout(1500);
      assert.strictEqual(await gank(), null, 'no box while he’s in sight');
      await page.evaluate(() => { window.screenNow = 'none'; });
      await wait(page, () => /^Safe \d+ s$/.test((lpcClient.lastOverlay.gank || {}).t), null, 'the gank clock');
      const first = await page.evaluate(() => lpcClient.lastOverlay), sq = await page.evaluate(() => lpc.me().minimap), n0 = +first.gank.t.match(/\d+/)[0];
      assert(n0 >= 13 && n0 <= 15 && !first.gank.red, `Safe 13 to 15 s at first: ${JSON.stringify(first.gank)}`);
      assert(Math.abs(first.parts.gank.x * 2560 - sq.x) < 1 && Math.abs(first.parts.gank.y * 1436 - sq.y) < 1 && first.parts.gank.ay === 'b', `over the minimap's top left: ${JSON.stringify(first.parts.gank)}`);
      // just as the number drops, his Flash timed: about a second more
      const was = await page.evaluate(() => lpcClient.lastOverlay.gank.t);
      await wait(page, (w) => lpcClient.lastOverlay.gank.t !== w, was, 'the next second');
      const edge = +(await gank()).t.match(/\d+/)[0];
      await page.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'strip', go: 'flash:LeeSin' } }));
      await wait(page, (e) => +lpcClient.lastOverlay.gank.t.match(/\d+/)[0] > e, edge, `longer than ${edge} s with his Flash used`, 1000);
      await wait(page, () => (lpcClient.lastOverlay.reach || {}).d, null, 'his faded face’s outline');
      const d1 = (await page.evaluate(() => lpcClient.lastOverlay.reach)).d.length;
      await wait(page, () => lpcClient.lastOverlay.gank.red, null, 'red under 5 s', 15000);
      assert(/^Safe [1-4] s$/.test((await gank()).t), `red at 4 s or less: ${JSON.stringify(await gank())}`);
      const r = await page.evaluate(() => lpcClient.lastOverlay.reach);
      assert(r.d.length > d1 && Math.abs(r.x * 2560 - (sq.x + 0.05 * sq.s)) < 1 && Math.abs(r.w * 2560 - 0.9175 * sq.s) < 1, `the outline grew, over League's map: ${d1} -> ${r.d.length}`);
      await overlayShot(browser, 'gank-clock', await page.evaluate(() => lpcClient.lastOverlay), 'none');
      await wait(page, () => (lpcClient.lastOverlay.gank || {}).t === 'Could be here' && lpcClient.lastOverlay.gank.red, null, 'Could be here, in red', 6000);
      const at0 = Date.now();
      await wait(page, () => !lpcClient.lastOverlay.gank, null, 'gone after 5 s', 7000);
      assert(Date.now() - at0 > 4000, `Could be here for 5 s, not ${Date.now() - at0} ms`);
      await page.evaluate(() => { window.screenNow = 'leeMid'; });
      await wait(page, () => !lpcClient.lastOverlay.reach && (lpc.foes() || []).some((f) => f.id === 'LeeSin' && performance.now() - f.seen < 500), null, 'seen again: no outline');
      assert.strictEqual(await gank(), null, 'no box while he’s in sight');
      await c.close();
      // the overlay draws them: the box red under 5 s, the outline over League's map
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
      await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
      await p.evaluate((s) => window.fire(s), { visible: true, board: true, scale: 1, opacity: 1, parts: { gank: first.parts.gank }, gank: { t: 'Safe 4 s', red: true }, reach: r });
      const box = await p.evaluate(() => { const e = document.querySelector('#parts [data-part="gank"] .toast.gank.red'), b = e && e.getBoundingClientRect(), svg = document.querySelector('#ghosts svg'), sb = svg && svg.getBoundingClientRect(); return e && sb && { text: e.textContent, color: getComputedStyle(e).color, bottom: b.bottom, left: b.left, svg: [sb.left, sb.width], path: !!svg.querySelector('path').getAttribute('d') }; });
      assert(box && box.text === 'Safe 4 s' && box.color === 'rgb(255, 92, 92)' && Math.abs(box.left - first.parts.gank.x * 1280) < 2 && Math.abs(box.bottom - first.parts.gank.y * 720) < 2 && box.path && Math.abs(box.svg[0] - r.x * 1280) < 1, `the red box above the minimap and the outline: ${JSON.stringify(box)}`);
      await p.close();
      console.log(`gank clock: Safe ${n0} s once Lee Sin left your minimap, longer with his Flash used, red under 5 s, Could be here for 5 s, then nothing; his outline grew; none while seen`);
    }

    // ---- What's new 234: with no callout on and no room, the League share doesn't follow you on the minimap (it did five
    // times a second for nobody); a callout turned on mid-game starts it
    {
      const [c, page] = await context(browser, {});
      await page.evaluate(() => { const g = navigator.mediaDevices.getDisplayMedia; window.caps = 0; navigator.mediaDevices.getDisplayMedia = (x) => { caps++; return g(x); }; window.screenNow = 'zedMid'; });
      await page.evaluate((d) => lpcClient.emit('league', d), foesGame());
      await wait(page, () => window.caps > 0, null, 'the League share');
      await page.waitForTimeout(2000);
      assert.strictEqual(await page.evaluate(() => lpc.me().minimap), null, 'no minimap read for nobody');
      await page.$eval('#optJgCall', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });
      await wait(page, () => !!lpc.me().minimap, null, 'read once a callout is on');
      await c.close();
      console.log('no callouts and no room: the minimap isn’t read; turning a callout on reads it');
    }

    // ---- What's new 182: no missing call after a recall to buy (the face moves to their base), "back mid", ganks from
    // anyone but your lane opponents with "2 coming" and the sharp sound, their jungler heading to a teammate's lane,
    // an objective window, Voidgrubs and the Herald, and the soul's element
    {
      const [c, page] = await context(browser, { missCall: true, gankCall: true, laneCall: true, missList: true, objCall: true, grubCall: true, spikeCall: true, callSounds: true, speakCalls: true });
      await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = (u) => spoken.push(u.text); speechSynthesis.cancel = () => {}; });
      const said = (re, what, timeout = 15000) => wait(page, (re) => new RegExp(re).test(lpcClient.lastOverlay.call || ''), re, what, timeout);
      const pos = (g, p) => ({ ...g, players: g.players.map((q) => ({ ...q, pos: { 'Rayan#EUW': 'BOTTOM', 'Mid#EUW': 'MIDDLE', 'Jungle#EUW': 'JUNGLE', 'Top#EUW': 'TOP' }[q.name], ...(p && p[q.name]) })) });
      const emit = (g) => page.evaluate((d) => lpcClient.emit('league', d), g);
      // Zed seen in mid, gone, then a new item on League's scoreboard: no missing call, his face at their fountain
      await page.evaluate(() => { window.screenNow = 'zedMid'; });
      await emit(pos(foesGame()));
      await wait(page, () => (lpc.foes() || []).some((f) => f.id === 'Zed' && f.zone === 'mid'), null, 'Zed seen in mid');
      await page.waitForTimeout(3500);
      await page.evaluate(() => { window.screenNow = 'none'; });
      await page.waitForTimeout(3000);
      await emit(pos(foesGame(), { 'Mid#EUW': { items: [[1055, 1], [3057, 1]] } }));
      await wait(page, () => (lpcClient.lastOverlay.ghosts || []).some((g) => /Zed\.png$/.test(g.pic) && g.s === 'shop'), null, 'Zed’s face at their base, shop');
      const shop = (await page.evaluate(() => lpcClient.lastOverlay.ghosts)).find((g) => g.s === 'shop'), sq = await page.evaluate(() => lpc.me().minimap);
      assert(shop.x * 2560 > sq.x + 0.9 * sq.s && shop.y * 1436 < sq.y + 0.1 * sq.s, `at their fountain, top right: ${JSON.stringify(shop)}`);
      await page.waitForTimeout(8000);
      assert(!(await page.evaluate(() => spoken)).some((t) => /missing/.test(t)), 'no missing call after a recall to buy');
      // seen again, gone 10 s: missing; back in mid: back mid (seen 3 s first: 5 s here, as the screen is read a beat late)
      await page.evaluate(() => { window.screenNow = 'zedMid'; });
      await page.waitForTimeout(5000);
      await page.evaluate(() => { window.screenNow = 'none'; });
      await said('^Zed missing from mid$', 'Zed missing from mid');
      await page.evaluate(() => { window.screenNow = 'zedMid'; });
      await said('^Zed back mid$', 'Zed back mid');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['f:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Zed.png', 's:eye', 'w:back mid']);
      // Lee Sin and Zed (their mid, not your lane: you're bot) walking at you together: 2 coming, the sharp sound first
      await page.evaluate(() => { window.screenNow = 'none'; });
      await page.waitForTimeout(1500);
      await wait(page, () => lpc.me().fresh, null, 'your Yasuo found on the minimap');
      for (const k of ['c1', 'c2', 'c3']) { await page.evaluate((k) => { window.screenNow = k; }, k); await page.waitForTimeout(700); }
      const TWO = /^(Zed and Lee Sin|Lee Sin and Zed) heading your way$/;
      await wait(page, (re) => (lpcClient.lastOverlay.calls || []).some((x) => new RegExp(re).test(x.text)), TWO.source, '2 coming');
      const two = (await page.evaluate(() => lpcClient.lastOverlay.calls)).find((x) => TWO.test(x.text));
      assert.deepStrictEqual(two.pics.slice(2), ['s:arrow', 'a:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Yasuo.png', 'w:2 coming'], 'their faces, an arrow, yours, 2 coming');
      assert(await page.evaluate(() => lpc.played().filter((x) => x === 'sharp').length >= 2), 'the sharp sound');
      // their jungler walking toward the top lane, where a teammate is
      await page.waitForTimeout(3500);
      for (const k of ['h1', 'h2', 'h3']) { await page.evaluate((k) => { window.screenNow = k; }, k); await page.waitForTimeout(700); }
      await said('^Lee Sin heading top$', 'Lee Sin heading top');
      assert(await page.evaluate(() => lpc.played().includes('soft')), 'the soft sound');
      // their jungler dies at 6:00 with Dragon up (no dragon taken): an objective window
      await emit(pos(foesGame(), { 'Jungle#EUW': { lvl: 6 } }));
      await page.waitForTimeout(1500);
      await emit({ ...pos(foesGame(), { 'Jungle#EUW': { lvl: 6, d: 1, dead: true, respawn: 40 } }), t: 360 });
      await said('^Lee Sin dead for 40 seconds\\. Dragon is up\\.$', 'the objective window');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['d:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/LeeSin.png', 's:clock', 'w:0:40', 's:flame', 'w:Dragon up']);
      // 7:30: Voidgrubs in 30 seconds, and both on the timers line
      await emit({ ...pos(foesGame()), t: 452 });
      await said('^Voidgrubs in 30 seconds$', 'Voidgrubs in 30 seconds');
      assert.match(await page.evaluate(() => lpcClient.lastOverlay.game), /Voidgrubs 0:2\d · Herald 7:2\d · Baron/, 'Voidgrubs and the Herald on the timers line');
      // their third dragon, an Ocean one: soul point with its element, a red ring
      const drag = (t) => ({ e: 'dragon', team: 'CHAOS', t, type: 'Water' });
      await emit({ ...pos(foesGame()), t: 1300, events: [drag(300), drag(600), drag(1290)] });
      await said('^They’re on Ocean soul point$', 'Ocean soul point');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.callPics), ['s!:drop', 'w:Ocean soul point']);
      const words = await page.evaluate(() => spoken);
      assert(words.includes('Zed back mid') && words.some((w) => TWO.test(w)) && words.includes('Lee Sin heading top'), `read out loud after the sounds: ${words}`);
      await c.close();
      console.log('What’s new 182: no missing call after a recall to buy (face at their base), Zed back mid, 2 coming with the sharp sound, Lee Sin heading top, the objective window, Voidgrubs in 30 seconds, Ocean soul point');
    }

    // ---- What's new 183: the enemy spell strip from Riot's live game (Zed's Flash and Ignite, his Cosmic Insight), a
    // click on it timing Flash for the game channel, a teammate's timer and callout coming back through it, and the
    // callout log on the Game page
    {
      const [c, page] = await context(browser, { foeTimers: true, teamCall: true, missCall: true });
      await c.addInitScript(() => { lpcClient.lcu = async (m, p) => (p === '/lol-summoner/v1/current-summoner' ? { status: 200, data: { puuid: 'me-p', gameName: 'Rayan', tagLine: 'EUW' } }
        : /^\/lol-match-history\/v1\/products\/lol\/current-summoner\//.test(p) ? { status: 200, data: { games: { games: [{ gameId: 1, platformId: 'EUW1', gameDuration: 100 }] } } } : { status: 404, data: null }); });
      const ps = [['me-p', 100, 157, 4, 7, []], ['zed-p', 200, 238, 4, 14, [8347]], ['lee-p', 200, 64, 4, 11, []], ['garen-p', 200, 86, 4, 12, []]];
      let asked = 0;
      await c.route(/\/riot\/api\/euw1\/lol\/spectator\/v5\/active-games\/by-summoner\/me-p$/, (r) => { asked++; r.fulfill({ json: { gameId: 777, participants: ps.map(([puuid, teamId, championId, spell1Id, spell2Id, perkIds]) => ({ puuid, teamId, championId, spell1Id, spell2Id, perks: { perkIds } })) }, headers: { 'access-control-allow-origin': '*' } }); });
      const got = [];
      let sock = null, url = '';
      await c.routeWebSocket(/\/game\?/, (ws) => { sock = ws; url = ws.url(); ws.onMessage((m) => got.push(JSON.parse(m))); });
      await page.reload();
      const emit = (g) => page.evaluate((d) => lpcClient.emit('league', d), g);
      const g = { ...foesGame(), players: foesGame().players.map((q) => ({ ...q, pos: { 'Rayan#EUW': 'BOTTOM', 'Mid#EUW': 'MIDDLE', 'Jungle#EUW': 'JUNGLE', 'Top#EUW': 'TOP' }[q.name] })) };
      await emit(g);
      await wait(page, () => ((lpcClient.lastOverlay.strip || [])[0] || {}).spells && lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells.length === 2, null, 'the strip with Zed’s two spells', 30000);
      const zed = (await page.evaluate(() => lpcClient.lastOverlay.strip)).find((r) => r.name === 'Zed');
      assert.deepStrictEqual(zed.spells.map((x) => [x.k, x.name, x.left]), [['flash:Zed', 'Flash', 0], ['sp14:Zed', 'Ignite', 0]], 'Zed’s Flash and Ignite from Riot’s live game');
      assert.strictEqual(asked, 1, 'Riot’s live game asked once');
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.prog), true, 'the strip takes the mouse without Alt+X (What’s new 188)');
      for (let i = 0; i < 100 && !sock; i++) await page.waitForTimeout(200);
      assert(sock && /plat=euw1&u=me-p&g=777&team=100$/.test(url), `the game channel for game 777, team 100: ${url}`);
      // a click on his Flash: 300 s less Cosmic Insight's 18 haste, 254 s, sent with your name
      await page.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'strip', go: 'flash:Zed' } }));
      await wait(page, () => lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells[0].left > 0, null, 'Zed’s Flash running');
      const left = (await page.evaluate(() => lpcClient.lastOverlay.strip)).find((r) => r.name === 'Zed').spells[0].left;
      assert(left >= 252 && left <= 255, `Flash with Cosmic Insight: ${left} s`);
      for (let i = 0; i < 25 && !got.length; i++) await page.waitForTimeout(200);
      assert(got.some((m) => m.t === 'timer' && m.k === 'flash:Zed' && m.by === 'Rayan' && m.g === 'g0123456789a'), `sent to the game channel: ${JSON.stringify(got)}`);
      // Kai, in the game but not in the room: his Ignite timer and "mid missing"
      sock.send(JSON.stringify({ t: 'timer', g: 'g0123456789a', k: 'sp14:Zed', end: 300, by: 'Kai' }));
      await wait(page, () => { const x = lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells[1]; return x.left > 0 && x.by === 'K'; }, null, 'Kai’s Ignite timer, with his letter');
      sock.send(JSON.stringify({ t: 'call', g: 'g0123456789a', lane: 'mid', id: 'kai1', by: 'Kai' }));
      await wait(page, () => (lpcClient.lastOverlay.calls || []).some((x) => x.text === 'Kai: Zed missing from mid'), null, 'Kai: Zed missing from mid');
      assert.deepStrictEqual((await page.evaluate(() => lpcClient.lastOverlay.calls)).find((x) => /^Kai/.test(x.text)).pics, ['p:K', 'f:https://ddragon.leagueoflegends.com/cdn/1.1/img/champion/Zed.png', 's:missing', 'w:missing mid']);
      sock.send(JSON.stringify({ t: 'call', g: 'g0123456789a', lane: 'mid', id: 'kai1', by: 'Kai' })); // the same one again, as through the room too
      // app 1.52 (What's new 188): League's own spells win, so an Unsealed Spellbook swap (Ignite to Ghost) shows; an
      // upgraded Smite's key is Smite
      await emit({ ...g, players: g.players.map((q) => ({ ...q, spells: q.champ === 'Zed' ? ['SummonerFlash', 'SummonerHaste'] : q.champ === 'LeeSin' ? ['SummonerFlash', 'SummonerSmitePlayerGanker'] : ['', ''] })) });
      await wait(page, () => lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells[1].name === 'Ghost', null, 'Zed’s Ghost from League’s live data');
      assert.deepStrictEqual((await page.evaluate(() => lpcClient.lastOverlay.strip)).find((r) => r.name === 'Lee Sin').spells.map((x) => x.k), ['flash:LeeSin', 'sp11:LeeSin'], 'Lee Sin’s Flash and Smite');
      await page.waitForTimeout(1000); // a callout stays up 3 s, so a second copy would be on the line by now
      const kai = (await page.evaluate(() => lpcClient.lastOverlay.calls)).filter((x) => /^Kai/.test(x.text)).length;
      assert.strictEqual(kai, 1, `Kai’s callout shown once: ${kai}`);
      await overlayShot(browser, '183-strip-and-team-call', await page.evaluate(() => lpcClient.lastOverlay), 'none');
      await c.close();
      console.log('What’s new 183: the enemy spell strip from Riot’s live game, Flash with Cosmic Insight sent to the game channel, Kai’s Ignite and “Kai: Zed missing from mid” back through it, once');
    }

    // ---- the voice that reads callouts: the computer's English voices by name, a girl's voice (Zira here), one picked
    // by name, and a higher usual voice when there's no woman's voice
    {
      const [c, page] = await context(browser, { speakCalls: true, callVoice: 'girl' });
      await page.evaluate(() => {
        const v = (name, lang) => ({ name, lang, voiceURI: name });
        Object.assign(window, { spoken: [], voices: [v('Microsoft David - English (United States)', 'en-US'), v('Microsoft Zira - English (United States)', 'en-US'), v('Microsoft Hortense - French (France)', 'fr-FR')] });
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } }; // a real one only takes the browser's own voices
        Object.assign(speechSynthesis, { getVoices: () => voices, speak: (u) => spoken.push([u.text, u.voice ? u.voice.name : '', u.pitch || 1]), cancel: () => {} });
        speechSynthesis.dispatchEvent(new Event('voiceschanged'));
      });
      await openSet(page, 'callouts');
      assert.deepStrictEqual(await page.$$eval('#optCallVoice option', (l) => l.map((o) => o.textContent)), ['My computer’s usual voice', 'A girl’s voice', 'David', 'Zira (woman)']);
      assert.strictEqual(await page.inputValue('#optCallVoice'), 'girl');
      await page.click('#callVoiceTry');
      await page.selectOption('#optCallVoice', 'Microsoft David - English (United States)');
      await page.evaluate(() => { voices = []; speechSynthesis.dispatchEvent(new Event('voiceschanged')); });
      assert.strictEqual(await page.inputValue('#optCallVoice'), '', 'a voice that is gone: the usual one');
      await page.selectOption('#optCallVoice', 'girl');
      assert.deepStrictEqual(await page.evaluate(() => spoken), [['Zed missing from mid', 'Microsoft Zira - English (United States)', 1], ['Jungler on topside', 'Microsoft David - English (United States)', 1], ['Jungler on topside', '', 1.6]]);
      assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')).callVoice), 'girl');
      await c.close();
      console.log('callout voice: Zira for a girl’s voice, David by name, the usual voice higher with no woman’s voice');
    }

    // ---- Settings, Overlay's Layout: Room chat dragged to the top right, nudged down with the arrow keys and made
    // bigger; the rest dragged; each put back. The overlay in the game gets the places.
    {
      const [c, page] = await context(browser, {});
      await page.evaluate((d) => lpcClient.emit('league', d), game());
      await openSet(page, 'overlay');
      await page.click('#ovEdit > summary'); // Edit layout: the big picture, and the boxes take the mouse
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
      await page.click('#ovEdit > summary'); // Done: the cards are back
      await openSet(page, 'callouts');
      await page.check('#ovMapCalls');
      await page.uncheck('#optJgCall'); await page.uncheck('#optGankCall'); await page.uncheck('#optInvadeCall');
      await openSet(page, 'overlay');
      await page.click('#ovEdit > summary');
      await wait(page, () => [...document.querySelectorAll('#ovHandles .ovhandle')].map((b) => b.dataset.part).join() === ',game,cs,me,talk,toasts,buy,chat,after,tips,screen,call', null, 'the callouts on the Layout');
      if (process.env.SHOTS) await page.waitForTimeout(500); // the line at the top fades in
      await shot(page, 'overlay-editor', '.view[data-view="settings"]');
      await page.click('#ovEdit > summary');
      await shot(page, 'overlay-page', '.view[data-view="settings"]');
      await page.click('#ovEdit > summary');
      await page.click('#ovHandles .ovhandle[data-part="chat"]');
      await page.click('#ovBack');
      assert(!(await saved()).overlayParts.chat, 'chat put back');
      await page.click('#ovReset');
      o = await saved();
      assert(JSON.stringify(o.overlayParts) === '{}' && o.overlayPos === 'tl' && o.overlayBox === null && o.overlayScale === 1, 'everything put back');
      await c.close();
      console.log('Settings, Overlay: a part dragged, nudged and sized, the rest dragged, then put back; the overlay in a game gets the places');
    }

    // ---- What's new 165: Light, Full and Learning at the top of Settings, Overlay, each pressed while the boxes match it;
    // and the HUD check: the score, abilities and minimap as League's HUD settings have them (bigger HUD, a bigger
    // minimap on the left here), and a part dragged over the minimap in red with a line saying so
    {
      const [c, page] = await context(browser, {});
      await c.addInitScript(() => { lpcClient.lcu = async (m, p) => (p === '/lol-game-settings/v1/game-settings' ? { status: 200, data: { General: {}, HUD: { GlobalScale: 1, MinimapScale: 1.5, FlipMiniMap: true } } } : { status: 404, data: null }); }); // League's client, for its HUD settings
      await page.reload();
      await page.evaluate((d) => lpcClient.emit('league', d), game());
      await openSet(page, 'overlay');
      const pressed = () => page.$$eval('#ovPresets [aria-pressed="true"]', (l) => l.map((b) => b.querySelector('b').textContent));
      const on = (...ids) => page.evaluate((ids) => ids.map((id) => document.getElementById(id).checked), ids);
      const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')));
      await page.click('#ovPresets [data-preset="learning"]');
      assert.deepStrictEqual(await pressed(), ['Learning']);
      assert.deepStrictEqual(await on('optOverlay', 'optCoach', 'optCoachNew', 'optMapNudge', 'optSpikeCall', 'optOverlayChat', 'optJgClock'), [true, true, true, true, true, false, false]);
      assert((await saved()).coach === true && !!(await saved()).mapNudge, 'saved like a box ticked by hand');
      await page.click('#ovPresets [data-preset="light"]');
      assert.deepStrictEqual(await pressed(), ['Light']);
      assert.deepStrictEqual(await on('optOverlay', 'optOverlayMe', 'optOverlayToasts', 'optOverlayGame', 'optCoach', 'optMapNudge', 'optOverlayBoard'), [true, true, true, true, false, false, false]);
      await page.check('#optOverlayCs');
      assert.deepStrictEqual(await pressed(), [], 'a box changed by hand: none pressed');
      await page.click('#ovPresets [data-preset="full"]');
      assert.deepStrictEqual(await pressed(), ['Full']);
      assert.deepStrictEqual(await on('optOverlayChat', 'optOverlayCs', 'optMissList', 'optFoeTimers', 'optJgClock', 'optCoach', 'optDeadTips', 'optMapNudge'), [true, true, true, true, true, false, false, false]);
      // What's new 171: the extra choices show only while their switch is on, and one Minimap callouts switch
      // follows its five (Full turned them on)
      const shown = (q) => page.evaluate((q) => document.querySelector(q).checkVisibility(), q);
      await openSet(page, 'callouts'); // the callouts have a section of their own (What's new 207)
      assert(await page.isChecked('#ovMapCalls') && await shown('#ovMapList'), 'Full: Minimap callouts on, its five showing');
      await openSet(page, 'overlay');
      assert(await page.isVisible('#ovPresets') && await page.isHidden('#ovMix'), 'Full matches: no Your own mix');
      await page.uncheck('#optOverlayBoard');
      assert(await page.isVisible('#ovMix'), 'Everyone’s rank off: it’s your own mix');
      await page.check('#optOverlayBoard');
      await openSet(page, 'callouts');
      assert(!(await shown('#optCallVoice')) && !(await shown('#optCoachNew')), 'Read them out loud and Coach off: their extras hidden');
      await page.check('#optSpeakCalls');
      assert(await shown('#optCallVoice'), 'Read them out loud on: the voice shows');
      await page.uncheck('#optSpeakCalls');
      const MAP5 = ['optJgCall', 'optGankCall', 'optLaneCall', 'optMissCall', 'optInvadeCall']; // faded faces have a switch of their own (What's new 182)
      await page.uncheck('#optGankCall');
      assert(await page.isChecked('#ovMapCalls') && (await saved()).gankCall === false, 'one of the five off: the switch stays on');
      await page.uncheck('#ovMapCalls');
      assert.deepStrictEqual(await on(...MAP5), [false, false, false, false, false]);
      assert(!(await shown('#ovMapList')), 'Minimap callouts off: all five off, the list hidden');
      let o = await saved();
      assert(!o.jgCall && !o.missCall && !o.invadeCall && !o.laneCall && o.missList && !('ovMapCalls' in o) && !('mapCalls' in o), `all five saved off, nothing new saved: ${JSON.stringify(o)}`);
      await page.check('#ovMapCalls');
      assert.deepStrictEqual(await on(...MAP5), [true, true, true, true, true]);
      o = await saved();
      assert(o.jgCall && o.gankCall && o.missCall && o.invadeCall && o.laneCall, 'all five saved on');
      await openSet(page, 'overlay');
      await page.click('#ovPresets [data-preset="light"]');
      await openSet(page, 'callouts');
      assert(!(await page.isChecked('#ovMapCalls')) && await page.isVisible('#ovMapCalls') && !(await shown('#ovMapList')), 'Light: Minimap callouts off');
      await openSet(page, 'overlay');
      await page.click('#ovPresets [data-preset="full"]');
      assert(await page.isChecked('#ovMapCalls'), 'Full: Minimap callouts on');
      console.log('Settings, Overlay and Callouts: extra choices follow their switches; Minimap callouts ticks and unticks its five, saving nothing of its own');
      await page.click('#ovEdit > summary'); // Edit layout, for the HUD check's drag
      await wait(page, () => document.querySelector('#ovStage .ovmap').style.left === '0.4%', null, 'League’s HUD read: the minimap on the left');
      assert.deepStrictEqual(await page.evaluate(() => ['.ovscore', '.ovhud', '.ovmap'].map((q) => { const st = document.querySelector('#ovStage ' + q).style; return [st.width, st.height]; })), [['33.6%', '5.6%'], ['', '18.2%'], ['', '39%']]);
      const box = async (k) => { // the handles are drawn again as the preview redraws, so one can be between draws: ask again
        for (let i = 0; i < 20; i++) { const b = await page.locator(`#ovHandles .ovhandle[data-part="${k}"]`).boundingBox().catch(() => null); if (b) return b; await page.waitForTimeout(100); }
        return null;
      };
      const stage = await page.evaluate(() => { const e = document.getElementById('ovStage'), r = e.getBoundingClientRect(); return { x: r.left + e.clientLeft, y: r.top + e.clientTop, w: e.clientWidth, h: e.clientHeight }; });
      const chat = await box('chat');
      assert(!(await page.getAttribute('#ovHandles .ovhandle[data-part="chat"]', 'data-covers')), 'chat clear of League’s HUD at first');
      await page.mouse.move(chat.x + chat.width / 2, chat.y + chat.height - 4); await page.mouse.down(); await page.mouse.move(stage.x + 40 + chat.width / 2, stage.y + stage.h - 20, { steps: 8 }); await page.mouse.up();
      await wait(page, () => document.querySelector('#ovHandles .ovhandle[data-part="chat"]').hasAttribute('data-covers') && /Room chat covers the minimap\./.test(document.getElementById('ovHudNote').textContent), null, 'Room chat over the minimap, in red');
      assert(!/Couldn’t read/.test(await page.textContent('#ovHudNote')));
      await shot(page, 'overlay-hud-check', '.view[data-view="settings"]');
      await c.close();
      console.log('Settings, Overlay: Light, Full and Learning tick their boxes and stay pressed until one changes; the HUD check reads League’s HUD (bigger, minimap left) and turns Room chat red over the minimap');
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
      assert.strictEqual(says.lines[3], 'Next game, glance at your minimap every few seconds, and play safe when their jungler shows up near your lane until you see them again. Settings, Callouts can remind you, or call out their jungler when they show up.');
      assert.strictEqual(says.map, 'Where Lee Sin was each minute for the first 14 minutes, and where you died');
      await shot(page, 'jungler-review', '#jgShot');
      assert.strictEqual(await page.evaluate(([r, tl]) => lpc.jungler({ ...r, mode: 'ARAM' }, tl), [r, tl]), null, 'not in ARAM');
      // What's new 235: this game's jungler calls against Riot's copy: one matched (2:05, Riot's 2:00 spot), one didn't
      // (4:10, far from Riot's 4:00), one 30 s from both its minutes isn't counted; the miss is kept for the tuning
      const chk = await page.evaluate(([r, tl, a, b]) => {
        lpc.jgLog({ g: '7', list: [{ t: 125, id: 'LeeSin', name: 'their raptors', at: true, ...a }, { t: 250, id: 'LeeSin', name: 'your krugs', at: true, ...b }, { t: 390, id: 'LeeSin', name: 'top river', at: false, ...a }] });
        const box = lpc.jungler(r, tl), q = box.querySelector('.jgchk');
        lpc.jgLog({ g: '', list: [] });
        return q && { head: q.querySelector('b').textContent, blocks: [...q.querySelectorAll('.blk i')].map((i) => i.className), lines: [...q.querySelectorAll('p')].map((e) => e.textContent),
          fig: box.querySelector('figcaption').textContent, kept: JSON.parse(localStorage.getItem('lpc-jgmiss')) };
      }, [r, tl, at(0.62, 0.7), at(0.2, 0.15)]);
      assert(chk, 'the check shows');
      assert.strictEqual(chk.head, '1 of 2 jungler calls matched Riot’s copy of the game');
      assert.deepStrictEqual(chk.blocks, ['ok', 'miss']);
      assert.match(chk.lines[0], /^4:10 “Lee Sin at your krugs”: at 4:00 Riot had Lee Sin (in|at) .+\.$/);
      assert.strictEqual(chk.lines[1], 'Premade tunes its jungler calls from these by itself. Calls more than 20 s from one of Riot’s once-a-minute spots aren’t counted.');
      assert.match(chk.fig, /the call that didn’t match \(orange rings\)/);
      assert.deepStrictEqual(chk.kept, [{ g: '7', m: ['your krugs'] }]);
      assert.strictEqual(await page.evaluate(([r, tl]) => !lpc.jungler(r, tl).querySelector('.jgchk'), [r, tl]), true, 'no check without this game’s calls');
      // What's new 235: Dodge or stay?, What wins for you's habits, their weak side
      const v = await page.evaluate(() => {
        const d = (n, w, t, v = 'behind') => Array.from({ length: n }, (_, i) => ({ g: String(v + t + w + i), v, t, w: i < w }));
        const many = [...d(11, 3, true), ...d(12, 7, false), ...d(30, 15, false, 'even')];
        return [lpc.dodgeSay(many.slice(0, 34), 'x', 'behind', 'Lina is on Autofill and new to Thresh'), lpc.dodgeSay(many, 'x', 'behind', 'Lina is on Autofill and new to Thresh'),
          lpc.dodgeSay(many, 'x', 'behind', ''), lpc.dodgeSay([...d(11, 6, true), ...many.slice(11)], 'x', 'behind', 'Lina is on Autofill')];
      });
      assert.deepStrictEqual(v, ['Learning from your drafts: 34 of 50 saved.', 'A dodge may be worth it: Lina is on Autofill and new to Thresh, and drafts like this went 3 of 11 for you.',
        'Stay: drafts like this went 7 of 12 for you.', 'Stay: drafts like this went 6 of 11 for you.']);
      const hb = await page.evaluate(([tl]) => {
        const t2 = JSON.parse(JSON.stringify(tl));
        t2.frames[10].participantFrames[1] = { ...t2.frames[10].participantFrames[1], minionsKilled: 60, jungleMinionsKilled: 12 };
        t2.frames[3].events.push({ type: 'ITEM_PURCHASED', timestamp: 170000, participantId: 1, itemId: 2055 });
        return [lpc.habits(tl, 1), lpc.habits(t2, 1), lpc.habits(tl, 2)];
      }, [tl]);
      assert.deepStrictEqual(hb, [[false, null, null, false], [false, true, false, true], [true, null, null, false]], 'deaths before 10, a Control Ward, first back (no item data here), CS at 10');
      const ws = await page.evaluate(() => {
        const g = (w) => Array.from({ length: 10 }, (_, i) => ({ win: i < w, champ: 1, lane: '' }));
        const rows = [['TOP', 6], ['JUNGLE', 5], ['MIDDLE', 6], ['BOTTOM', 2], ['UTILITY', 4]].map(([pos, w], i) => ({ puuid: 'w' + i, name: ['Rook', 'Vex', 'Mara', 'Ivy', 'Noor'][i] + '#EUW', champ: 103, pos, ally: false }));
        const data = Object.fromEntries(rows.map((p, i) => [p.puuid, { games: g([6, 5, 6, 2, 4][i]), mastery: i === 3 ? [] : [{ championId: 103, championPoints: 50000 }], ranked: {}, level: 200 }]));
        const a = lpc.weakSide(rows, data);
        data.w3.games = g(5);
        data.w3.mastery = [{ championId: 103, championPoints: 50000 }];
        return [a && { lane: a.lane, why: a.why, ps: a.ps.map((p) => p.name) }, lpc.weakSide(rows, data)];
      });
      assert.deepStrictEqual(ws[0], { lane: 'bot', why: 'Ivy won 2 of the last 10 and is new to Ahri. Noor won 4 of 10.', ps: ['Ivy#EUW', 'Noor#EUW'] });
      assert.strictEqual(ws[1], null, 'no line when no lane stands out');
      await c.close();
      console.log('game report: their jungler’s first 14 minutes, the death they were in on and where they were before it, and Premade’s calls checked against Riot’s copy; Dodge or stay?, What wins for you’s habits and their weak side');
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

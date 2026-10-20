// Test of the overlay's line at the top of the screen (site/overlay.html) and what fills it in site/index.html, in
// headless Chromium with a stand-in for the desktop app 1.13 (window.lpcClient):
// the overlay page itself (the line in the middle at the top, fading in and out, the rest where the small window would
// be, and first in the stack over everyone's rank); the minimap reminder (every 10 s from 1:00, a game counted per
// room, off by itself after 20 games); the jungler callout, on a shared screen with Rayan's minimap from his Practice
// Tool screenshot and his Yasuo icon copied there in the other team's red ("Jungler on botside" for 3 s, not again while
// they stay in sight, "Jungler on topside" when they show up again after 10 s); and the game report's look at their jungler.
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
const SCREENS = { none: Buffer.from(corner.buffer), bot: withFoe([200, 205]), top: withFoe([60, 100]) }; // x + y past the minimap's width: the bottom side
const yasuo = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/ddragon-yasuo-128.rgba.gz')));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), file = path.join(SITE, u.pathname);
  if (u.pathname.startsWith('/screens/')) return res.end(SCREENS[u.pathname.slice(9)]);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// ---- Data Dragon
const DDATA = Object.fromEntries([['Ahri', 103], ['Garen', 86], ['LeeSin', 64], ['Yasuo', 157]].map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
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
    r.fulfill({ body: u.endsWith('/img/champion/Yasuo.png') ? YASUO_PNG : PNG1, contentType: 'image/png', headers: cors });
  });
  await c.addInitScript((o) => localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, ...o })), opts);
  await c.addInitScript(fakeApp);
  const page = await c.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(URL_);
  return [c, page];
}
let YASUO_PNG;
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; overlay ${JSON.stringify(await page.evaluate(() => window.lpcClient && lpcClient.lastOverlay).catch(() => null))}`);
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
    // ---- Yasuo's Data Dragon picture as a PNG, from the fixture's pixels
    {
      const p = await browser.newPage();
      YASUO_PNG = Buffer.from(await p.evaluate((b64) => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        c.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)), 128, 128), 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }, yasuo.toString('base64')), 'base64');
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
        await p.evaluate((b64) => {
          const cv = document.createElement('canvas'), g = cv.getContext('2d'), img = new ImageData(Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)), 646, 646), tmp = document.createElement('canvas');
          cv.width = 1280; cv.height = 720;
          cv.style.cssText = 'position: fixed; inset: 0; z-index: -1';
          tmp.width = tmp.height = 646;
          tmp.getContext('2d').putImageData(img, 0, 0);
          g.fillStyle = '#1d2b25'; g.fillRect(0, 0, 1280, 720);
          g.drawImage(tmp, 1280 - 323, 720 - 323, 323, 323);
          document.body.prepend(cv);
        }, SCREENS.bot.toString('base64'));
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
      o = await fire({ visible: false });
      assert(o.opacity === 0 && !o.items.length, 'all gone');
      await c.close();
      console.log('overlay: the line at the top in the middle fades in and out, the rest where the small window would be; first over everyone’s rank');
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
      await wait(page, () => lpc.toasts().includes('That was 20 games with the minimap reminder, so it’s off now. Settings > Overlay turns it back on.'), null, 'and says so');
      await wait(page, () => !lpcClient.lastOverlay.board, null, 'the overlay back to its small window');
      await c.close();
      console.log('minimap reminder: every 10 s from 1:00, a game counted per room, off by itself after 20 games');
    }

    // ---- the jungler callout: their Yasuo (the jungle pet) in red on the shared minimap
    {
      const [c, page] = await context(browser, { jgCall: true });
      await page.evaluate((d) => lpcClient.emit('league', d), game());
      await page.evaluate(() => { window.screenNow = 'bot'; document.getElementById('shareBtn').click(); });
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
      assert.strictEqual(says.lines[3], 'Next game, glance at your minimap every few seconds, and play safe when their jungler shows up near your lane until you see them again. Settings > Overlay can remind you, or call out their jungler when they show up.');
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

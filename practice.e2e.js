// Test of Practice Tool's combo trainer and jungle clear timer, whole games on video and champion colours in
// site/index.html, in headless Chromium with a stand-in for the desktop app 1.15 (window.lpcClient): the overlay page's
// Practice Tool lines (after the timers, and in a place of their own from Layout); the combo trainer
// (League's keys read only in Practice Tool with it ticked, on the overlay with the time between them, a combo timed
// from its first key to its last once you stop, a click between casts not making another combo, your best for each
// combo on each champion); the jungle clear (each camp timed by the game clock from the gold it gives, income and
// Practice Tool's gold buttons left out, the clear kept at the camps picked, the next one held against your best, and
// Practice Tool's reset); whole games on video (recorded with the app, not in Practice Tool, sent to it in parts, the
// old ones binned after the days picked, and on the Clips page to watch, show in their folder or bin); the main colour
// from your champion's splash art, there before the page shows too, and your own colour over it; and app 1.13, which
// says these come with the next app update.
// Needs playwright; run with NODE_PATH listing its node_modules:
//   NODE_PATH=$(npm root -g) node practice.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8086, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const shot = (pg, name, sel) => process.env.SHOTS && (sel ? pg.locator(sel) : pg).screenshot({ path: path.join(process.env.SHOTS, name + '.png') });

http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// ---- Data Dragon, with Ahri's splash art: pink, with grey and a little blue
const DDATA = Object.fromEntries([['Ahri', 103], ['Zed', 238]].map(([id, key]) => [id, { id, key: String(key), name: id, info: { attack: 3, magic: 8 }, tags: ['Mage'], stats: { attackrange: 550 } }]));
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let SPLASH = null;

// The desktop app as the page sees it (client/preload.js); app 1.15 (fresh) adds the combo trainer's keys and game
// videos, kept here in a list of their own. The shared screen is a canvas that keeps changing, for the recordings.
function fakeApp(fresh) {
  const on = {}, calls = [], parts = new Map(), vids = new Map([['Game 2026-10-10 20-00-00 Zed.webm', { size: 280e6, at: Date.now() - 10 * 864e5, rec: false }], ['Game 2026-10-09 20-00-00 Lux.webm', { size: 250e6, at: Date.now() - 11 * 864e5, rec: false }]]);
  window.lpcClient = {
    version: fresh ? '1.15.0' : '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    lcu: async () => ({ status: 0, data: null }), clip: async () => '', clips: async () => [], clipsClean: async () => [],
    overlay(s) { this.lastOverlay = s; }, calls,
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
  };
  if (fresh) Object.assign(window.lpcClient, {
    combo(v) { calls.push('combo ' + v); },
    async videoFolder(what) { calls.push('folder ' + what); return what === 'pick' ? 'D:\\Clips' : 'C:\\Users\\Rayan\\Videos\\Premade'; },
    async gameVideo(what, a, b) {
      calls.push(`video ${what}${a == null ? '' : ' ' + a}${b instanceof ArrayBuffer ? ' ' + b.byteLength : ''}`);
      const v = vids.get(a);
      if (what === 'start') { const name = `Game 2026-10-20 15-00-00${a ? ' ' + a : ''}.webm`; vids.set(name, { size: 0, at: Date.now(), rec: true }); return name; }
      if (what === 'add') return !!(v && v.rec && b instanceof ArrayBuffer && parts.set(a, [...(parts.get(a) || []), b]) && (v.size += b.byteLength));
      if (what === 'read') return v && !v.rec && parts.has(a) ? new Blob(parts.get(a)).arrayBuffer() : null;
      if (what === 'end') return !!(v && v.rec && !(v.rec = false));
      if (what === 'list') return [...vids].map(([name, x]) => ({ name, ...x })).sort((x, y) => y.at - x.at);
      if (what === 'clean') { const out = [...vids].filter(([, x]) => !x.rec && Date.now() - x.at > a * 864e5).map(([n]) => n); out.forEach((n) => vids.delete(n)); return out; }
      if (what === 'trash') return vids.delete(a);
      return what === 'folder' || !!v;
    },
  });
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-vid-saved', JSON.stringify(['Game 2026-10-09 20-00-00 Lux.webm'])); // never binned
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999'); // no What's new
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.width = 320; cv.height = 180;
  setInterval(() => { g.fillStyle = `hsl(${(performance.now() / 5) % 360}, 70%, 50%)`; g.fillRect(Math.random() * 300, Math.random() * 160, 40, 40); }, 40);
  navigator.mediaDevices.getDisplayMedia = async () => { lpcClient.shared = (lpcClient.shared || 0) + 1; return cv.captureStream(15); };
}
async function context(browser, opts, fresh = true) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cors = { 'access-control-allow-origin': '*' };
  await c.route(/cdn\.jsdelivr\.net\/npm\/peerjs/, (r) => r.fulfill({ body: 'window.Peer = class { on() {} destroy() {} };', headers: { 'content-type': 'text/javascript', ...cors } })); // no room here
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await c.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    if (/\/splash\/Ahri_0\.jpg$/.test(u)) return r.fulfill({ body: SPLASH, contentType: 'image/jpeg', headers: cors });
    r.fulfill({ body: PNG1, contentType: 'image/png', headers: cors });
  });
  await c.addInitScript((o) => { if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, clips: false, ...o })); }, opts);
  await c.addInitScript(fakeApp, fresh);
  const page = await c.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  page.on('dialog', (d) => d.accept()); // Bin's "Move it to the Recycle Bin?"
  await page.goto(URL_);
  return [c, page];
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; overlay ${JSON.stringify(await page.evaluate(() => window.lpcClient && lpcClient.lastOverlay).catch(() => null))}; calls ${JSON.stringify(await page.evaluate(() => window.lpcClient && lpcClient.calls).catch(() => null))}`);
});
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const rows = (page, sel) => page.$$eval(`${sel} tr`, (l) => l.map((tr) => [...tr.children].map((td) => td.textContent)));
// a game as Ahri; in Practice Tool unless said, with your gold and a jungle pet
const game = (over = {}, me = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'PRACTICETOOL', t: 60, room: 'gpractice001', result: '', events: [],
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330, gold: 500, ...me },
  players: [{ name: 'Rayan#EUW', team: 'ORDER', champ: 'Ahri', champName: 'Ahri', pos: '', lvl: 1, k: 0, d: 0, a: 0, cs: 0, items: [[1101, 1]] }],
  ...over,
});

(async () => {
  const browser = await chromium.launch();
  try {
    { // Ahri's splash art: half pink, a tenth blue and the rest grey
      const p = await browser.newPage();
      SPLASH = Buffer.from(await p.evaluate(() => {
        const c = document.createElement('canvas'), g = c.getContext('2d');
        c.width = 1215; c.height = 717;
        g.fillStyle = '#808080'; g.fillRect(0, 0, 1215, 717);
        g.fillStyle = '#c040a0'; g.fillRect(0, 0, 608, 717);
        g.fillStyle = '#3050d0'; g.fillRect(1094, 0, 121, 717);
        return c.toDataURL('image/png').split(',')[1];
      }), 'base64');
      await p.close();
    }

    // ---- the overlay page: Practice Tool's lines after the timers, and in a place of their own (Layout)
    {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
      await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
      const fire = async (s) => { await p.evaluate((s) => window.fire(s), s); await p.waitForTimeout(300); return p.$$eval('#main .toast, #parts .toast', (l) => l.map((e) => e.textContent)); };
      const base = { visible: true, pos: 'mr', scale: 1, opacity: 1, game: 'Dragon 1:23 · Baron 12:00', practice: ['E · Q +0.21 · R +0.30 = 0.51 s, best 0.40', 'Camp 1 at 1:36'], toasts: [] };
      assert.deepStrictEqual(await fire(base), ['Dragon 1:23 · Baron 12:00', 'E · Q +0.21 · R +0.30 = 0.51 s, best 0.40', 'Camp 1 at 1:36']);
      await fire({ ...base, board: true, parts: { practice: { x: 0.5, y: 0.8, ax: 'c', ay: 'b' } } });
      assert.deepStrictEqual(await p.$$eval('#parts [data-part="practice"] .toast', (l) => l.map((e) => e.textContent)), base.practice, 'in a place of their own');
      await p.close();
    }

    // ---- the combo trainer: the keys only in Practice Tool with it ticked, the time between them on the overlay, a
    // combo timed once you stop for a second, and your best for it on Ahri
    {
      const [c, page] = await context(browser, { jgCamps: 3 });
      const emit = (d) => page.evaluate((d) => lpcClient.emit('league', d), d);
      const press = (keys) => page.evaluate((keys) => { for (const [k, t] of keys) lpcClient.emit('press', { k, t }); }, keys);
      const practice = () => page.evaluate(() => (lpcClient.lastOverlay && lpcClient.lastOverlay.practice) || []);
      await emit(game());
      await page.click('.nav[data-view="game"]');
      await wait(page, () => !document.getElementById('comboBox').hidden && /^Tick the box/.test(document.getElementById('comboNow').textContent), null, 'the combo trainer in Practice Tool');
      assert(!(await page.evaluate(() => lpcClient.calls.some((x) => x.startsWith('combo')))), 'no keys read until it’s ticked');
      await page.check('#optCombo');
      await wait(page, () => lpcClient.calls.includes('combo true'), null, 'the app reads League’s keys');
      await press([['E', 1000], ['Q', 1210], ['Click', 1330], ['R', 1630]]);
      assert.deepStrictEqual(await practice(), ['E · Q +0.21 · click +0.12 · R +0.30'], 'the keys on the overlay as you press them');
      await wait(page, () => /= 0\.63 s$/.test(lpcClient.lastOverlay.practice[0]), null, 'E Q R timed once you stop');
      assert.deepStrictEqual(await rows(page, '#comboRows'), [['E Q R', '0.63 s', '0.63 s', '1']]);
      await press([['E', 5000], ['Q', 5150], ['R', 5400]]);
      await wait(page, () => lpcClient.lastOverlay.practice[0] === 'E · Q +0.15 · R +0.25 = 0.40 s, your best yet (was 0.63)', null, 'a faster one');
      await press([['E', 9000], ['Q', 9300], ['R', 9800], ['X', 9900], ['Q', NaN]]);
      await wait(page, () => lpcClient.lastOverlay.practice[0] === 'E · Q +0.30 · R +0.50 = 0.80 s, best 0.40', null, 'a slower one, against the best');
      await press([['W', 13000], ['Click', 13100], ['Click', 13300]]); // one key and clicks: no combo
      await wait(page, () => /^W · click \+0\.10 · click \+0\.20$/.test(lpcClient.lastOverlay.practice[0]), null, 'one key isn’t a combo');
      await page.waitForTimeout(1300);
      assert.deepStrictEqual(await rows(page, '#comboRows'), [['E Q R', '0.40 s', '0.80 s', '3']]);
      assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-combos'))), { Ahri: { 'E Q R': { best: 400, last: 800, n: 3 } } });
      await shot(page, 'combo-trainer', '#comboBox');
      // ---- the jungle clear: 3 camps (picked in its settings), each timed from the gold it gives
      const clear = async (room, steps) => { for (const [t, gold] of steps) await emit(game({ room, t }, { gold })); };
      await clear('gpractice001', [[90, 500], [91, 502], [95, 590], [96, 600], [101, 610]]); // income, then a camp's gold in two parts
      await wait(page, () => lpcClient.lastOverlay.practice[1] === 'Camp 1 at 1:36' && document.getElementById('jgNow').textContent === 'Camp 1 at 1:36', null, 'the first camp');
      await clear('gpractice001', [[102, 5612], [110, 5702], [115, 5714], [125, 5822]]); // Practice Tool's gold button, then two camps
      await wait(page, () => /^Camp 2 at 1:50$/.test(document.getElementById('jgNow').textContent), null, 'the second camp');
      await clear('gpractice001', [[130, 5832]]);
      await wait(page, () => /^Clear: 3 camps at 2:05$/.test(document.getElementById('jgNow').textContent) && document.getElementById('toasts').textContent.includes('Jungle clear: 3 camps at 2:05.'), null, 'the clear');
      assert.deepStrictEqual(await rows(page, '#jgRows'), [['1', '1:36', '+98', ''], ['2', '1:50', '+90', ''], ['3', '2:05', '+108', '']]);
      await clear('gpractice001', [[140, 5832], [150, 5950], [156, 5960]]); // more gold after the clear: nothing
      assert.match(await text(page, '#jgNow'), /^Clear: 3 camps at 2:05$/);
      // Practice Tool's reset: the clock goes back, and the next clear is held against the first, camp by camp
      await clear('gpractice001', [[60, 500], [85, 590], [90, 600], [100, 690], [105, 700], [118, 810], [124, 812]]);
      await wait(page, () => /^Clear: 3 camps at 1:58 · your best yet$/.test(document.getElementById('jgNow').textContent) && document.getElementById('toasts').textContent.includes('Jungle clear: 3 camps at 1:58, your best yet.'), null, 'a faster clear');
      assert.deepStrictEqual(await rows(page, '#jgRows'), [['1', '1:25', '+90', '11 s faster'], ['2', '1:40', '+90', '10 s faster'], ['3', '1:58', '+110', '7 s faster']]);
      assert.deepStrictEqual((await page.$$eval('#jgList li', (l) => l.map((e) => e.textContent))).map((t) => t.replace(/^.* · Ahri/, 'Ahri')), ['Ahri · 3 camps at 1:58 · your best', 'Ahri · 3 camps at 2:05']);
      await clear('gpractice002', [[60, 500], [80, 600], [86, 610]]); // a new game, held against the best
      await wait(page, () => lpcClient.lastOverlay.practice[1] === 'Camp 1 at 1:20 · 5 s faster than your best', null, 'held against the best');
      await shot(page, 'jungle-clear', '#jgBox');
      await emit(game({ mode: 'CLASSIC', room: 'g00000000001' }, { gold: 500 }));
      await wait(page, () => lpcClient.calls[lpcClient.calls.length - 1] === 'combo false' && !(lpcClient.lastOverlay.practice || []).length, null, 'no keys read outside Practice Tool');
      await wait(page, () => /^Your best combos/.test(document.getElementById('comboNow').textContent), null, 'your best combos, between games');
      assert.deepStrictEqual(await rows(page, '#comboRows'), [['Ahri: E Q R', '0.40 s', '0.80 s', '3']]);
      await c.close();
      console.log('combo trainer: keys on the overlay, combos timed with the best kept; jungle clear: camps timed from their gold, held against the best');
    }

    // ---- whole games on video: recorded with the app (not in Practice Tool), sent in parts, the old ones binned, and
    // on the Clips page
    {
      const [c, page] = await context(browser, { gameVideo: true, gameDays: 7 });
      const emit = (d) => page.evaluate((d) => lpcClient.emit('league', d), d);
      const NAME = 'Game 2026-10-20 15-00-00 Ahri.webm';
      await emit(game());
      await page.waitForTimeout(2500);
      assert(!(await page.evaluate(() => lpcClient.shared || lpcClient.calls.some((x) => x.startsWith('video start')))), 'not in Practice Tool');
      await page.click('.nav[data-view="clips"]');
      await wait(page, () => !document.getElementById('vidBox').hidden && document.querySelectorAll('#vidList li').length === 1, null, 'the old game on the Clips page');
      const events = [{ t: 61, e: 'kill', me: true, team: 'ORDER' }, { t: 62, e: 'kill', me: true, team: 'ORDER' }, { t: 62, e: 'multi', n: 2, me: true, team: 'ORDER' },
        { t: 65, e: 'kill', on: true, team: 'CHAOS' }, { t: 66, e: 'dragon', team: 'ORDER', type: 'Fire' }, { t: 67, e: 'baron', team: 'CHAOS', stolen: true }, { t: 68, e: 'tower', of: 'CHAOS', team: 'ORDER' }];
      await emit(game({ mode: 'CLASSIC', room: 'g00000000001', events }));
      await wait(page, () => lpcClient.calls.includes('video start Ahri'), null, 'the game recorded');
      await wait(page, (n) => [...document.querySelectorAll('#vidList li')].some((li) => li.textContent.includes(n.slice(0, -5)) && li.textContent.includes('recording now') && !li.querySelector('button')), NAME, 'recording now, on the Clips page');
      await page.waitForTimeout(1500);
      await emit({ inGame: false });
      await wait(page, () => lpcClient.calls.some((x) => x.startsWith('video trash')), null, 'the game over');
      const calls = await page.evaluate(() => lpcClient.calls.filter((x) => x.startsWith('video') && !x.startsWith('video list')));
      const adds = calls.filter((x) => x.startsWith(`video add ${NAME} `));
      assert(adds.length && adds.every((x) => +x.split(' ').pop() > 0), `its parts: ${calls}`);
      assert.deepStrictEqual(calls.filter((x) => !adds.includes(x)), ['video start Ahri', `video end ${NAME}`, 'video trash Game 2026-10-10 20-00-00 Zed.webm'], 'started, ended, then the old one binned, not the saved one');
      assert.deepStrictEqual(await page.$$eval('#savedVids .cname', (l) => l.map((e) => e.textContent)), ['Game 2026-10-09 20-00-00 Lux'], 'the saved one in Saved');
      await wait(page, () => document.getElementById('toasts').textContent.includes('Moved 1 game video older than 7 days to the Recycle Bin.'), null, 'the old one binned');
      await wait(page, (n) => document.querySelectorAll('#vidList li').length === 1 && document.querySelector('#vidList li').textContent.includes(n.slice(0, -5)) && document.querySelectorAll('#vidList li .cacts button').length === 4, NAME, 'the game, ready to watch');
      assert.deepStrictEqual((await page.$$eval('#vidList .vmarks button', (bs) => bs.map((b) => b.textContent.replace(/^\d+:\d\d /, '')))),
        ['Play highlights', 'Double kill', 'You died', 'Your team took Dragon', 'The enemy stole Baron', 'Took a tower'], 'its highlights, a double kill’s kills in it');
      await page.click('#vidList .vmarks button:has-text("You died")');
      await wait(page, () => document.getElementById('clipDlg').open && /: You died$/.test(document.getElementById('clipTitle').textContent) && document.getElementById('clipVideo').src.startsWith('blob:'), null, 'a highlight in the player');
      await page.click('#clipClose');
      await page.click('#vidBox button:text-is("Change folder")');
      await wait(page, () => document.querySelector('.whereAt').textContent === 'Clips are saved in D:\\Clips, games in its Games folder.', null, 'another folder');
      await page.evaluate(() => { lpcClient.gameVideo = ((f) => async (what, ...x) => (what === 'read' ? null : f.call(lpcClient, what, ...x)))(lpcClient.gameVideo); }); // an app before 1.18
      await page.click('#vidList .vmarks button:has-text("Play highlights")');
      await wait(page, () => document.getElementById('toasts').textContent.includes('Update the app to watch highlights here.'), null, 'older apps: the video player');
      assert.match(await text(page, '#vidNote'), /^Each one is kept for 7 days, then it goes to the Recycle Bin\. Save one to keep it\.$/);
      await shot(page, 'game-videos', '#vidBox');
      for (const b of ['Watch', 'Show in folder']) await page.click(`#vidList li button:text-is("${b}")`);
      await page.click('#vidsFolder');
      await page.click('#vidList li button:text-is("☆ Save")');
      await wait(page, () => !document.querySelectorAll('#vidList li').length && document.querySelectorAll('#savedVids li').length === 2 && JSON.parse(localStorage.getItem('lpc-vid-saved')).length === 2, null, 'the game saved');
      await page.click(`#savedVids li:has-text("${NAME.slice(0, -5)}") button:text-is("Bin")`);
      await wait(page, () => document.querySelectorAll('#savedVids li').length === 1 && JSON.parse(localStorage.getItem('lpc-vid-saved')).length === 1, null, 'the saved game binned');
      await wait(page, () => !document.querySelectorAll('#vidList li').length && /^No game videos yet/.test(document.getElementById('vidNote').textContent), null, 'binned');
      const acts = await page.evaluate(() => lpcClient.calls.filter((x) => /^video (open|show|folder|trash)/.test(x)));
      assert.deepStrictEqual(acts, ['video trash Game 2026-10-10 20-00-00 Zed.webm', `video open ${NAME}`, `video open ${NAME}`, `video show ${NAME}`, 'video folder', `video trash ${NAME}`]);
      assert.strictEqual(await page.evaluate(() => lpcClient.shared), 1, 'one share of the screen for the game');
      await c.close();
      console.log('whole games on video: recorded in parts, not in Practice Tool, the old ones binned, and on the Clips page with their highlights');
    }

    // ---- champion colours: Ahri's pink from her splash art, before the page shows after a reload, and your own colour
    // over it
    {
      const [c, page] = await context(browser, {});
      const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      const pink = (h) => /^#[0-9a-f]{6}$/.test(h) && [1, 3, 5].every((i, k) => Math.abs(parseInt(h.slice(i, i + 2), 16) - [0xc0, 0x40, 0xa0][k]) <= 4); // the splash's pink, give or take its edges
      const was = await accent();
      await page.click('.nav[data-view="settings"]');
      await page.check('#optChampLook');
      await page.evaluate((d) => lpcClient.emit('league', d), game({ mode: 'CLASSIC' }));
      await wait(page, () => (JSON.parse(localStorage.getItem('lpc-opts')).champMain || {}).c === 'Ahri', null, 'Ahri’s colour');
      const hex = (await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')).champMain)).hex;
      assert(pink(hex) && (await accent()) === hex && !pink(was), `Ahri’s pink: ${hex}, the main colour ${await accent()}, was ${was}`);
      await shot(page, 'champion-colours');
      await page.reload();
      assert.strictEqual(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), hex, 'there before the page shows');
      await page.evaluate(() => { const i = document.getElementById('optMain'); i.value = '#22aa44'; i.dispatchEvent(new Event('input')); });
      assert.strictEqual(await accent(), '#22aa44', 'your own colour');
      assert(!(await page.isChecked('#optChampLook')), 'over your champion’s');
      await c.close();
      console.log('champion colours: the main colour from the splash art, before the page shows, and your own over it');
    }

    // ---- app 1.13: these come with the next app update (the jungle clear with 1.14, which tells the page your gold)
    {
      const [c, page] = await context(browser, {}, false);
      await page.evaluate((d) => lpcClient.emit('league', d), game({}, { gold: undefined }));
      await page.click('.nav[data-view="game"]');
      await wait(page, () => /^Restart the app to finish its update: version 1\.15 adds the combo trainer\.$/.test(document.getElementById('comboNow').textContent)
        && /^Restart the app to finish its update: version 1\.15 times jungle clears\.$/.test(document.getElementById('jgNow').textContent), null, 'the notes for app 1.13');
      for (const id of ['optCombo', 'optGameVideo']) assert(await page.evaluate((id) => document.getElementById(id).disabled && document.getElementById(id).parentElement.textContent.includes('(comes with the next app update)'), id), id);
      await c.close();
      console.log('app 1.13: the combo trainer, jungle clear and game videos come with the next app update');
    }
    console.log('ok');
  } catch (err) { console.error(err); process.exitCode = 1; }
  await browser.close();
  process.exit(process.exitCode || 0);
})();

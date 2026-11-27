// Test of auto enemy Flash (What's new 230): site/flash-finder.js on Rayan's 6 fixture moments (640x360 frames of his
// games, cut by the planning thread: fixtures/flash), the auto timer on the enemy strip (marked auto, and since What's new 242 sent
// to Premade friends in the game, its turning off too), the faces to click when it can't tell who, and the Flash check after the game (keys 1-5, its guess
// after the answer, the last screen) with a re-tune kept only when it scores better on his marks.
// Needs playwright; run with NODE_PATH listing its node_modules:   NODE_PATH=/path/to/node_modules node flash.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), FX = path.join(__dirname, 'fixtures/flash');
const PORT = 8091, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
const FIX = JSON.parse(fs.readFileSync(path.join(FX, 'fixtures.json'), 'utf8'));
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), fx = u.pathname.startsWith('/fx/'), file = fx ? path.join(FX, u.pathname.slice(4)) : path.join(SITE, u.pathname);
  if (!file.startsWith((fx ? FX : SITE) + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.json': 'application/json' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

const DDATA = Object.fromEntries([['Ahri', 103], ['Garen', 86], ['LeeSin', 64], ['Zed', 238]].map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const game = (over = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 300, room: 'g0123456789a', result: '', events: [],
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 },
  players: [['Rayan', 'ORDER', 'Ahri'], ['Mid', 'CHAOS', 'Zed'], ['Jungle', 'CHAOS', 'LeeSin'], ['Top', 'CHAOS', 'Garen']]
    .map(([n, team, champ]) => ({ name: n + '#EUW', team, champ, champName: '', pos: '', lvl: 6, k: 0, d: 0, a: 0, cs: 10, items: [], spells: ['SummonerDot', 'SummonerFlash'] })),
  ...over,
});
// the desktop app 1.55 as the page sees it, with Games\Flash marks in window.marks and earlier games' files in window.marksList
function fakeApp() {
  const on = {};
  window.marks = {};
  window.marksList = window.marksList || [];
  window.lpcClient = {
    version: '1.55.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, notify() {},
    overlay(s) { this.lastOverlay = s; },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    flashMarks: async (what, name, data) => { if (what === 'save') { window.marks[name] = typeof data === 'string' ? data : data.byteLength; return true; } return what === 'list' ? window.marksList : null; },
    lcu: async (m, p) => (p === '/lol-summoner/v1/current-summoner' ? { status: 200, data: { puuid: 'me-p', gameName: 'Rayan', tagLine: 'EUW' } }
      : /^\/lol-match-history\/v1\/products\/lol\/current-summoner\//.test(p) ? { status: 200, data: { games: { games: [{ gameId: 1, platformId: 'EUW1', gameDuration: 100 }] } } } : { status: 404, data: null }),
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
  const cv = document.createElement('canvas'); // League's screen: plain, so the finder sees nothing on it
  cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  setInterval(() => { g.fillStyle = '#123'; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#' + Math.floor(Math.random() * 9); g.fillRect(0, 0, 1, 1); }, 50);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(30);
}
const shot = (pg, name) => process.env.SHOTS && pg.screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => { throw new Error(`waiting for ${what}: ${e.message}`); });
// a light as the finder gives it (the clues of fixture a1, an enemy, unless changed), t: ms before now
const light = (page, over, foes) => page.evaluate(([o, f]) => {
  const t = performance.now() - 1000;
  lpc.flashLight({ id: Math.random(), t, xb: 133, yb: 69, xt: 110, yt: 14, len: 60, wide: 3.59, glowHi: 0.46, n: 2, busy: 0, ingame: true, self: false, p: 4, peak: 139.5, late: 0.09, later: 0.09, arr: { red: 36, blue: 0, green: 0 }, ...o },
    f && f.map(([id, d]) => ({ id, name: id, trail: [{ x: 0.5, y: 0.5, t: t - 200 }, { x: 0.5 + d, y: 0.5, t }] })));
}, [over, foes]);
const L = (over = {}) => ({ t: 0, xb: 0, yb: 0, len: 60, wide: 3.5, glowHi: 0.5, n: 1, busy: 0, ingame: true, self: false, p: 4, peak: 120, late: 0.05, later: 0.05, arr: { red: 30, blue: 0, green: 0 }, ...over });

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- the finder on Rayan's fixture moments, each played in at 15 frames a second as the page does. v2's calls on
    // his recordings: enemy, enemy, his own, nothing, ally, no enemy call. On these JPEG copies v2 itself (Python,
    // checked 2026-11-25) gives b5's nearly empty enemy bar only 6 px of red, so '?' there: the same here.
    {
      const p = await browser.newPage();
      await p.goto(`http://127.0.0.1:${PORT}/privacy.html`);
      await p.addScriptTag({ url: '/flash-finder.js' });
      const WANT = { 'K-524_80': 'enemy', 'K-1541_33': '?', 'K-1686_27': 'self', 'T-854_80': 'no', 'MF-85_20': 'ally', 'MF-262_93': 'ally' };
      for (const m of FIX) {
        const out = await p.evaluate(async ([m]) => {
          const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true }), f = FlashFinder.create(), done = [];
          cv.width = 640; cv.height = 360;
          for (let k = 0; k < 30; k++) {
            g.drawImage(await createImageBitmap(await (await fetch('/fx/' + m.frames[Math.min(k, 11)])).blob()), 0, 0);
            done.push(...f.push(g.getImageData(0, 0, 640, 360).data, m.first_frame_t * 1000 + (k * 1000) / 15).done);
          }
          if (f.ultAt) return 'ult'; // no R slot going dark on these moments (What's new 242)
          return done.map((l) => ({ t: l.t / 1000, len: l.len, xb: l.xb, yb: l.yb, self: l.self, arr: l.arr, call: FlashFinder.call(l), loose: FlashFinder.loose(l) }));
        }, [m]);
        const at = out.find((l) => Math.abs(l.t - m.t) < 0.05);
        assert(at, `${m.id}: a light at ${m.t} s: ${JSON.stringify(out)}`);
        assert(Math.abs(at.xb - m.pillar.xb) <= 1 && Math.abs(at.yb - m.pillar.yb) <= 1, `${m.id}: the pillar where v2 had it: ${JSON.stringify(at)} vs ${JSON.stringify(m.pillar)}`);
        assert.strictEqual(at.call, WANT[m.id], `${m.id} (${m.note}): ${JSON.stringify(at)}`);
        assert(!out.some((l) => l.call === 'enemy') || m.rayan === 'enemy', `${m.id}: no enemy call on a moment that isn't one: ${JSON.stringify(out)}`);
      }
      // your R slot (What's new 242): ready, then its cooldown shade for 4 frames on a fixture moment = your ultimate used then
      const ult = await p.evaluate(async () => {
        const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true }), f = FlashFinder.create(), b = await createImageBitmap(await (await fetch('/fx/K-1686_27-00.jpg')).blob()), at = [];
        cv.width = 640; cv.height = 360;
        for (let k = 0; k < 14; k++) {
          g.drawImage(b, 0, 0);
          g.fillStyle = k < 6 ? '#787878' : '#3c3c3c'; // 120, then 60
          g.fillRect(315, 331, 9, 9);
          f.push(g.getImageData(0, 0, 640, 360).data, 1000 + k * 66);
          at.push(f.ultAt);
        }
        return at;
      });
      assert(ult.slice(0, 9).every((t) => !t) && ult[9] === 1000 + 6 * 66 && ult[13] === ult[9], `your ultimate when R went dark, once: ${ult}`);
      // scoring and re-tuning: a wrong enemy call costs twice a missed one; a version is only better on more points
      const r = await p.evaluate(([a, b, c]) => {
        const marks = [{ ...a, mark: 'enemy' }, { ...b, len: 40, mark: 'enemy' }, { ...c, mark: 'no' }];
        const P = FlashFinder.retune(marks);
        return { s0: FlashFinder.score(marks, FlashFinder.P0), P, s1: FlashFinder.score(marks, P), played: FlashFinder.score([{ ...a, call: 'enemy', mark: 'no' }], null) };
      }, [L(), L(), L({ late: 0.3 })]);
      assert.deepStrictEqual([r.s0.right, r.s0.wrong, r.s0.caught, r.s0.missed, r.s0.points], [1, 0, 1, 1, 1], `v2 on the marks: ${JSON.stringify(r.s0)}`);
      assert(r.P.len <= 40 && r.P.late < 0.3 && r.s1.points === 2, `re-tuned: the short pillar counts, the slow one still doesn't: ${JSON.stringify(r)}`);
      assert.deepStrictEqual([r.played.wrong, r.played.points], [1, -2], 'null: the calls made in the game');
      await p.close();
      console.log('the finder on Rayan’s 6 fixture moments: enemy, ? (JPEG), his own, nothing, ally, ally; scoring and re-tuning');
    }

    // ---- in a game: auto timers for you only, the faces to click, then the Flash check after the game
    {
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const cors = { 'access-control-allow-origin': '*' };
      await c.route(/cdn\.jsdelivr\.net\/npm\/peerjs/, (r) => r.fulfill({ body: 'window.Peer = class { on() {} destroy() {} };', headers: { 'content-type': 'text/javascript', ...cors } }));
      await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await c.route(/ddragon\.leagueoflegends\.com/, (r) => {
        const u = r.request().url();
        if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
        if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
        if (u.endsWith('summoner.json')) return r.fulfill({ json: { data: { SummonerFlash: { key: '4', cooldown: [300] }, SummonerDot: { key: '14', cooldown: [180] } } }, headers: cors });
        if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
        r.fulfill({ body: PNG1, contentType: 'image/png', headers: cors });
      });
      // Riot's live game and the game channel, to see that nothing auto goes out on it
      await c.route(/\/riot\/api\/euw1\/lol\/spectator\/v5\/active-games\/by-summoner\/me-p$/, (r) => r.fulfill({ json: { gameId: 777, participants: [['me-p', 100, 103], ['zed-p', 200, 238], ['lee-p', 200, 64], ['garen-p', 200, 86]].map(([puuid, teamId, championId]) => ({ puuid, teamId, championId, spell1Id: 4, spell2Id: 14, perks: { perkIds: [] } })) }, headers: cors }));
      const sent = [];
      let sock = null;
      await c.routeWebSocket(/\/game\?/, (ws) => { sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); });
      await c.addInitScript(() => localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, foeTimers: true, flashAuto: true })));
      await c.addInitScript(fakeApp);
      const page = await c.newPage();
      page.on('pageerror', (e) => console.log('page error:', e.message));
      await page.goto(URL_);
      // older earlier games, all marked as v2 called them: nothing to re-tune at this game's end
      await page.evaluate((x) => { window.marksList = [JSON.stringify({ v: 1, at: 1, lights: x })]; }, [L({ call: 'enemy', mark: 'enemy' }), L({ call: 'no', late: 0.3, mark: 'no' })]);
      const emit = (g) => page.evaluate((d) => lpcClient.emit('league', d), g);
      await emit(game());
      await wait(page, () => lpc.flash().fl, null, 'the finder on League’s screen', 30000);
      assert.strictEqual(await page.evaluate(() => lpc.flash().fl.slot), 1, 'your Flash on F, from League’s live data');
      for (let i = 0; i < 100 && !sock; i++) await page.waitForTimeout(200);
      assert(sock, 'the game channel open');
      await wait(page, () => (lpcClient.lastOverlay.strip || []).length === 3, null, 'the enemy strip');
      await page.waitForTimeout(2000); // Data Dragon's items and spells, for the cooldowns
      const zed = () => page.evaluate(() => ((lpcClient.lastOverlay.strip || []).find((r) => r.name === 'Zed') || { spells: [] }).spells.find((x) => x.k === 'flash:Zed'));
      // 1: an enemy light, Zed's icon jumping on the minimap: his Flash from a second ago, marked auto, for you only
      await light(page, {}, [['Zed', 0.03], ['LeeSin', 0.004]]);
      await wait(page, () => { const z = (lpcClient.lastOverlay.strip || []).find((r) => r.name === 'Zed'); return z && z.spells.find((x) => x.k === 'flash:Zed').left > 0; }, null, 'Zed’s Flash running');
      let z = await zed();
      assert(z.auto && z.by === 'A' && z.left >= 297 && z.left <= 300, `auto, from when the light was: ${JSON.stringify(z)}`);
      // 4: an ally's light and your own: no enemy timer, and your own isn't asked about after
      await light(page, { arr: { red: 0, blue: 50, green: 0 } });
      await light(page, { self: true });
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.strip.filter((r) => r.spells.some((x) => x.left > 0)).length), 1, 'only Zed’s timer');
      // 2: an enemy light with no icon jump: the faces it could be (not Zed, whose Flash is down), for 10 s
      await light(page, {}, []);
      await wait(page, () => (lpcClient.lastOverlay.flashAsk || []).length === 2, null, 'Whose Flash? with 2 faces');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.flashAsk.map((a) => a.k)), ['LeeSin', 'Garen'], 'Lee Sin and Garen, still with their Flash');
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.prog), true, 'the faces take the mouse');
      if (process.env.SHOTS) { // the overlay with Zed's auto timer and the faces to click
        const o = await page.evaluate(() => lpcClient.lastOverlay), p = await browser.newPage({ viewport: { width: 420, height: 260 } });
        await p.route(/ddragon\.leagueoflegends\.com/, (r) => r.fulfill({ body: PNG1, contentType: 'image/png' }));
        await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
        await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
        await p.evaluate((s) => { document.body.style.background = '#1d2b25'; window.fire({ ...s, board: null, parts: null }); }, o);
        await p.waitForTimeout(800);
        await shot(p, 'flash-strip-ask');
        await p.close();
      }
      await page.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'flashAsk', go: 'LeeSin' } }));
      await wait(page, () => !lpcClient.lastOverlay.flashAsk && lpcClient.lastOverlay.strip.find((r) => r.name === 'Lee Sin').spells.find((x) => x.k === 'flash:LeeSin').auto, null, 'Lee Sin’s Flash after the click');
      // 3: a click on Zed's auto timer turns it off, for friends too (What's new 242)
      await page.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'strip', go: 'flash:Zed' } }));
      await wait(page, () => !lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells.find((x) => x.k === 'flash:Zed').left, null, 'Zed’s timer off');
      await page.waitForTimeout(500);
      const foeSent = sent.filter((m) => m.t === 'timer' && !/^me:/.test(m.k));
      assert.deepStrictEqual(foeSent.map((m) => [m.k, !!m.end, m.auto || 0, m.by]), [['flash:Zed', true, 1, 'Rayan'], ['flash:LeeSin', true, 1, 'Rayan'], ['flash:Zed', false, 0, 'Rayan']], `the auto timers and Zed's off went to the game channel: ${JSON.stringify(foeSent)}`);
      for (let i = 0; i < 30 && !sent.some((m) => m.k === 'me:Ahri' && m.f); i++) await page.waitForTimeout(100); // sent each second when it changes
      const mine = sent.filter((m) => m.k === 'me:Ahri').pop();
      assert(mine && mine.f > 590 && mine.f <= 605 && mine.r === 0, `your own Flash (seen at 5:00) sent for your friends' strips: ${JSON.stringify(mine)}`);
      // a recorded moment played in: fixture a1 (an enemy), its replay kept from the frames, Zed and Garen asked about
      const a1 = FIX.find((m) => m.id === 'K-524_80');
      await page.evaluate((fr) => lpc.flashFeed([...fr, ...Array(18).fill(fr[11])].map((f) => '/fx/' + f)), a1.frames);
      await wait(page, () => lpc.flash().fl.lights.length === 4, null, 'the fixture’s light');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.flashAsk.map((a) => a.k)), ['Zed', 'Garen'], 'Zed (his timer turned off) and Garen can still Flash');
      const lights = await page.evaluate(() => lpc.flash().fl.lights);
      assert.deepStrictEqual(lights.map((x) => [x.call, x.foe, x.timer, x.off]), [['enemy', 'Zed', 'auto', true], ['ally', '', '', false], ['enemy', 'LeeSin', 'picked', false], ['enemy', '', '', false]], JSON.stringify(lights));
      assert.deepStrictEqual(lights[3].spot, [(133 - 53) * 3, (69 - 0) * 3], 'the light’s spot in its replay');
      // the game ends: the check opens with the first light, its guess hidden until the answer
      await emit({ inGame: false, phase: 'EndOfGame' });
      await wait(page, () => document.getElementById('flashDlg').open, null, 'the Flash check', 10000);
      const names = await page.evaluate(() => Object.keys(marks));
      assert(names.some((n) => /^Game \d{4}-\d\d-\d\d \d\d-\d\d-\d\d Ahri\.json$/.test(n)) && names.some((n) => / 4\.jpg$/.test(n)), `the game’s marks and the fixture light’s replay saved: ${names}`);
      const look = () => page.evaluate(() => ({ of: document.getElementById('flashOf').textContent, said: document.getElementById('flashSaid').textContent, lit: (() => { const d = document.getElementById('flashCv').getContext('2d').getImageData(0, 0, 480, 300).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2] > 60; return n; })() }));
      let o = await look();
      assert(/^1 of 4 · /.test(o.of) && o.said === '', `the first of 4, no guess yet: ${JSON.stringify(o)}`);
      await page.keyboard.press('1');
      o = await look();
      assert.strictEqual(o.said, 'It said: Enemy Flash: it started Zed’s timer, and you turned it off.', 'its guess after the answer');
      await wait(page, () => /^2 of 4/.test(document.getElementById('flashOf').textContent), null, 'the next one by itself');
      await page.keyboard.press('2');
      await wait(page, () => /^3 of 4/.test(document.getElementById('flashOf').textContent), null, 'the third');
      await page.click('#flashKeys [data-m="enemy"]');
      await wait(page, () => /^4 of 4/.test(document.getElementById('flashOf').textContent), null, 'the fixture’s light');
      await page.waitForTimeout(700);
      o = await look();
      assert(o.lit > 20000, `the fixture’s light replayed from its frames: ${o.lit} lit pixels`);
      if (process.env.SHOTS) { // the light's own frame, held a second
        await page.evaluate(() => new Promise((r) => { const cv = document.getElementById('flashCv'); const t = setInterval(() => { const d = cv.getContext('2d').getImageData(399, 100, 1, 1).data; if (d[0] > 200) { clearInterval(t); r(); } }, 50); setTimeout(r, 5000); }));
        await shot(page, 'flash-check');
      }
      await page.keyboard.press('1');
      await wait(page, () => !document.getElementById('flashEnd').hidden && /This game/.test(document.getElementById('flashEnd').textContent), null, 'the last screen');
      const end = await page.evaluate(() => ({ text: document.getElementById('flashEnd').innerText, ok: document.querySelectorAll('#flashEnd .flb i.ok').length, bad: document.querySelectorAll('#flashEnd .flb i.bad').length, miss: document.querySelectorAll('#flashEnd .flb i.miss').length, bars: document.querySelectorAll('.fltrend rect.ok').length, P: JSON.parse(localStorage.getItem('lpc-opts')).flashP }));
      assert(/3 right, 0 wrong/.test(end.text) && /3 caught, 0 missed/.test(end.text) && end.ok === 6 && end.bad === 0 && end.bars === 2, `how it did, as blocks, and the trend over the 2 games: ${JSON.stringify(end)}`);
      assert(!/Better now/.test(end.text) && end.P === null, `no better version, so none kept: ${JSON.stringify(end)}`);
      await shot(page, 'flash-check-end');
      const saved = JSON.parse(await page.evaluate(() => Object.entries(marks).find(([n]) => /\.json$/.test(n))[1]));
      assert.deepStrictEqual(saved.lights.map((x) => x.mark), ['enemy', 'ally', 'enemy', 'enemy'], 'your marks saved');
      assert(saved.lights.every((x) => x.arr && Number.isFinite(x.len) && /\.jpg$/.test(x.pic)), 'each with its clues and its picture’s name');
      await page.click('#flashClose');

      // a second game: an earlier enemy Flash v2 missed (a short pillar, 40 px) makes a better version, kept and said
      await page.evaluate((x) => { window.marksList = [JSON.stringify({ v: 1, at: 1, lights: x })]; }, [L({ call: 'no', len: 40, mark: 'enemy' }), L({ call: 'no', len: 40, mark: 'enemy' }), L({ call: 'no', late: 0.3, mark: 'no' })]);
      await emit(game({ room: 'g0123456789b' }));
      await wait(page, () => lpc.flash().fl, null, 'the finder in the second game', 30000);
      await light(page, {}, [['Garen', 0.03]]);
      await emit({ inGame: false, phase: 'EndOfGame' });
      await wait(page, () => document.getElementById('flashDlg').open, null, 'the second Flash check', 10000);
      await page.keyboard.press('1');
      await wait(page, () => !document.getElementById('flashEnd').hidden && /Better now/.test(document.getElementById('flashEnd').textContent), null, 'Better now');
      const P = await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-opts')).flashP);
      assert(P && P.len <= 40, `the re-tuned version kept: ${JSON.stringify(P)}`);
      assert(await page.evaluate(() => lpc.features().some(([, , l]) => l.some(([n]) => n === 'Auto enemy Flash'))), 'its FEATURES line');
      await c.close();
      console.log('in a game: Zed’s auto Flash, sent to friends, Lee Sin from the faces, an ally’s and your own left alone (yours sent as your Flash time), the timer off with a click, for friends too; the Flash check with keys, guesses after answers, the last screen; a better re-tune kept, an equal one not');
    }

    // ---- What's new 242, two Premade friends in one game (Rayan on Ahri, Kai on Lee Sin), their game channels joined:
    // Rayan's auto Flash on Kai's strip and off on both; Kai's own Flash and ultimate as a row on Rayan's strip, gone
    // 30 s after Kai's Premade stops; "Premade, go Dragon" from Rayan on Kai's line for 5 s with Ahri's face, not spoken
    {
      const cors = { 'access-control-allow-origin': '*' }, socks = [];
      const players = [['Rayan', 'ORDER', 'Ahri'], ['Kai', 'ORDER', 'LeeSin'], ['Mid', 'CHAOS', 'Zed'], ['Top', 'CHAOS', 'Garen']]
        .map(([n, team, champ]) => ({ name: n + '#EUW', team, champ, champName: '', pos: '', lvl: 6, k: 0, d: 0, a: 0, cs: 10, items: [], spells: ['SummonerDot', 'SummonerFlash'] }));
      const open = async (name, champ) => {
        const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await c.route(/cdn\.jsdelivr\.net\/npm\/peerjs/, (r) => r.fulfill({ body: 'window.Peer = class { on() {} destroy() {} };', headers: { 'content-type': 'text/javascript', ...cors } }));
        await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
        await c.route(/ddragon\.leagueoflegends\.com/, (r) => {
          const u = r.request().url(), ch = /\/champion\/(\w+)\.json$/.exec(u);
          if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
          if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
          if (u.endsWith('summoner.json')) return r.fulfill({ json: { data: { SummonerFlash: { key: '4', cooldown: [300] }, SummonerDot: { key: '14', cooldown: [180] } } }, headers: cors });
          if (ch) return r.fulfill({ json: { data: { [ch[1]]: { passive: { name: 'P', image: { full: 'P.png' } }, spells: ['Q', 'W', 'E', 'R'].map((k) => ({ name: k, cooldown: k === 'R' ? [100, 85, 70] : [5], image: { full: k + '.png' } })) } } }, headers: cors });
          if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
          r.fulfill({ body: PNG1, contentType: 'image/png', headers: cors });
        });
        await c.route(/\/riot\/api\/euw1\/lol\/spectator\/v5\/active-games\/by-summoner\/me-p$/, (r) => r.fulfill({ json: { gameId: 777, participants: [['me-p', 100, 103], ['kai-p', 100, 64], ['zed-p', 200, 238], ['garen-p', 200, 86]].map(([puuid, teamId, championId]) => ({ puuid, teamId, championId, spell1Id: 4, spell2Id: 14, perks: { perkIds: [] } })) }, headers: cors }));
        await c.routeWebSocket(/\/game\?/, (ws) => { socks.push(ws); ws.onMessage((m) => { for (const o of socks) if (o !== ws) o.send(m); }); }); // our server's game channel: on to the others
        await c.addInitScript(() => localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, foeTimers: true, flashAuto: true, teamCall: true, speakCalls: true })));
        await c.addInitScript(fakeApp);
        await c.addInitScript((n) => { localStorage.setItem('lpc-name', n); window.spoke = []; speechSynthesis.speak = (u) => window.spoke.push(u.text); }, name);
        const page = await c.newPage();
        page.on('pageerror', (e) => console.log(name, 'page error:', e.message));
        await page.goto(URL_);
        await page.evaluate((d) => lpcClient.emit('league', d), game({ me: { champ, champName: champ, team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 }, players }));
        await wait(page, () => lpc.flash().fl, null, `${name}’s finder`, 30000);
        return { c, page };
      };
      const A = await open('Rayan', 'Ahri'), B = await open('Kai', 'LeeSin');
      for (let i = 0; i < 100 && socks.length < 2; i++) await A.page.waitForTimeout(200);
      assert.strictEqual(socks.length, 2, 'both on the game channel');
      await A.page.waitForTimeout(2500); // Data Dragon's items and spells, for the cooldowns
      const flashOf = (page, name) => page.evaluate((n) => ((lpcClient.lastOverlay.strip || []).find((r) => r.name === n) || { spells: [] }).spells.find((x) => /^flash:/.test(x.k)) || null, name);
      // 1: Rayan's Premade sees Zed Flash: on Kai's strip too, with the gold A; Rayan turns it off: off on both
      await light(A.page, {}, [['Zed', 0.03]]);
      await wait(B.page, () => { const z = (lpcClient.lastOverlay.strip || []).find((r) => r.name === 'Zed'); return z && z.spells.find((x) => x.k === 'flash:Zed').left > 0; }, null, 'Zed’s Flash on Kai’s strip');
      const z = await flashOf(B.page, 'Zed');
      assert(z.auto && z.by === 'A' && z.left >= 290 && z.left <= 310, `Kai sees it auto (his page’s clock started a few seconds later), gold A: ${JSON.stringify(z)}`);
      await A.page.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'strip', go: 'flash:Zed' } }));
      await wait(B.page, () => !lpcClient.lastOverlay.strip.find((r) => r.name === 'Zed').spells.find((x) => x.k === 'flash:Zed').left, null, 'Zed’s Flash off on Kai’s strip');
      assert(!(await flashOf(A.page, 'Zed')).left, 'and on Rayan’s');
      // 2: Kai Flashes and uses his ultimate: his row on Rayan's strip, under the enemies, Flash ~5:00 and ultimate ~1:40
      await light(B.page, { self: true });
      await B.page.evaluate(() => lpc.ultNow());
      await wait(A.page, () => { const m = (lpcClient.lastOverlay.mates || [])[0]; return m && m.spells.length === 2 && m.spells.every((x) => x.left > 0); }, null, 'Kai’s row on Rayan’s strip');
      const row = await A.page.evaluate(() => lpcClient.lastOverlay.mates);
      assert(row.length === 1 && row[0].name === 'Lee Sin' && row[0].spells[0].name === 'Flash' && row[0].spells[0].left >= 290 && row[0].spells[0].left <= 305 && row[0].spells[1].left >= 90 && row[0].spells[1].left <= 105,
        `Lee Sin’s Flash and ultimate times: ${JSON.stringify(row)}`);
      await wait(B.page, () => ((lpcClient.lastOverlay.mates || [])[0] || { spells: [] }).spells.length === 2, null, 'Rayan’s row on Kai’s strip (sent every 10 s), with his ultimate’s icon');
      const kai = await B.page.evaluate(() => lpcClient.lastOverlay.mates);
      assert(kai.length === 1 && kai[0].name === 'Ahri' && kai[0].spells.length === 2 && kai[0].spells.every((x) => !x.left), `Kai’s strip: Rayan’s row, both up, none for himself: ${JSON.stringify(kai)}`);
      // 3: "Premade, go Dragon" said by Rayan: Kai's line with Ahri's face, the flame and the words for 5 s, never spoken
      await A.page.evaluate(() => lpc.said('premade go dragon'));
      await wait(B.page, () => (lpcClient.lastOverlay.calls || []).some((c) => c.pics && c.pics.join() === `a:${c.pics[0].slice(2)},s:flame,w:Go Dragon` && /Ahri/.test(c.pics[0])), null, 'Go Dragon on Kai’s line');
      await wait(A.page, () => (lpcClient.lastOverlay.calls || []).some((c) => c.text === 'Sent: Go Dragon'), null, 'Sent: Go Dragon on Rayan’s line');
      const t0 = Date.now();
      if (process.env.SHOTS) { // Rayan's strip with Kai's row, and Kai's line
        for (const [pg, name, w, h] of [[A.page, 'squad-strip', 220, 300], [B.page, 'squad-go-dragon', 520, 120]]) {
          const o = await pg.evaluate(() => lpcClient.lastOverlay), p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
          await p.route(/ddragon\.leagueoflegends\.com/, (r) => r.fulfill({ body: PNG1, contentType: 'image/png' }));
          await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
          await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
          await p.evaluate((s) => { document.body.style.background = '#1d2b25'; window.fire({ ...s, board: null, parts: null }); }, name === 'squad-strip' ? { ...o, call: '', calls: null } : { ...o, strip: null, mates: null });
          await p.waitForTimeout(800);
          await shot(p, name);
          await p.close();
        }
      }
      await wait(A.page, () => !(lpcClient.lastOverlay.calls || []).some((c) => c.text === 'Sent: Go Dragon'), null, 'Rayan’s own line gone after 2 s', 5000);
      await wait(B.page, () => !(lpcClient.lastOverlay.calls || []).some((c) => (c.pics || []).includes('w:Go Dragon')), null, 'Kai’s line gone after 5 s', 8000);
      assert(Date.now() - t0 >= 3000, 'Kai’s line stayed about 5 s');
      assert.deepStrictEqual(await B.page.evaluate(() => window.spoke), [], 'nothing read out loud on Kai’s, with Read them out loud on');
      // 5 (What's new 243): the fight check. League's ult dots read off his fixture moments at 1080p (the minimap's square
      // where his HUD has it), 2 readings for a change; then 59 s before the first Dragon with 2 Flash timers running
      const dots = await A.page.evaluate(async (ids) => {
        const out = {}, cv = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }), g = cv.getContext('2d');
        for (const id of ids) {
          g.drawImage(await createImageBitmap(await (await fetch(`/fx/${id}-00.jpg`)).blob()), 0, 0, 1920, 1080);
          lpc.readDots(cv, 1920, 1080, { x: 1715, y: 874, s: 205 });
          const r = lpc.readDots(cv, 1920, 1080, { x: 1715, y: 874, s: 205 });
          out[id] = r.dots.join('') + (r.r ? ' R' : '');
        }
        return out;
      }, ['K-524_80', 'K-1541_33', 'K-1686_27', 'MF-262_93', 'T-854_80']);
      assert.deepStrictEqual(dots, { 'K-524_80': '1110', 'K-1541_33': '1000', 'K-1686_27': '1000 R', 'MF-262_93': '0000', 'T-854_80': '0110' }, `the ult dots and your R on his moments: ${JSON.stringify(dots)}`);
      await A.page.evaluate((d) => lpcClient.emit('league', d), game({ t: 241, me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 }, players }));
      for (const k of ['flash:Zed', 'flash:Garen']) await A.page.evaluate((go) => lpcClient.emit('overlay-moved', { prog: { id: 'strip', go } }), k);
      await wait(A.page, () => (lpcClient.lastOverlay.calls || []).some((c) => /^Dragon in 1:00/.test(c.text)), null, 'the fight check a minute before Dragon', 5000);
      const fc = await A.page.evaluate(() => lpcClient.lastOverlay.calls.find((c) => /^Dragon in 1:00/.test(c.text)));
      assert.deepStrictEqual(fc, { text: 'Dragon in 1:00. Ults 2 of 2 up, their Flash 2 of 2 down', pics: ['s:flame', 'w:Dragon in 1:00. Ults 2 of 2 up, their Flash 2 of 2 down'] }, JSON.stringify(fc));
      assert(await A.page.evaluate(() => lpc.features().some(([, , l]) => l.some(([n]) => n === 'Fight check'))), 'its FEATURES line');
      if (process.env.SHOTS) {
        const o = await A.page.evaluate(() => lpcClient.lastOverlay), p = await browser.newPage({ viewport: { width: 520, height: 70 }, deviceScaleFactor: 2 });
        await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
        await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
        await p.evaluate((s) => { document.body.style.background = '#1d2b25'; window.fire({ ...s, strip: null, mates: null, game: null, cs: null, toasts: [], board: null, parts: null, calls: [s.calls.find((c) => /^Dragon/.test(c.text))] }); }, o);
        await p.waitForTimeout(500);
        await shot(p, 'fight-check');
        await p.close();
      }
      // 4: Kai leaves (his Premade stops sending): his row goes after 30 s
      await B.c.close();
      await wait(A.page, () => !lpcClient.lastOverlay.mates, null, 'Kai’s row gone', 40000);
      assert(await A.page.evaluate(() => lpc.features().some(([, , l]) => l.some(([n]) => n === 'Squad on the strip'))), 'its FEATURES line');
      await A.c.close();
      console.log('two friends in one game: an auto Flash shared and turned off on both, a friend’s Flash and ultimate as a row on the strip till 30 s of silence, Go Dragon with the caller’s face for 5 s and not spoken');
    }
  } finally {
    await browser.close();
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

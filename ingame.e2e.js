// Test of the in-game helpers in site/index.html and site/overlay.html, in headless Chromium with a stand-in for the
// desktop app 1.13 (window.lpcClient) and League's client: the tips for your lane while you're dead (on the overlay and
// the Game page), what to buy next against the other team, your team's chance to win at the end of the timers line,
// the overlay drawing them in their places, the chance to win popping up beside League's surrender vote box when it
// shows on the shared screen, and a teammate's screen while you're dead, with three players in a room on
// a local PeerServer: Ana lends theirs once they turn it on, Ben on Ana's team watches it while dead, and Cat on the
// other team never gets it, even by asking.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node ingame.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8086, PEER = 9006;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const shot = (pg, name) => process.env.SHOTS && pg.screenshot({ path: path.join(process.env.SHOTS, name + '.png') });

PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// ---- Data Dragon: champions [id, key, attack, magic, tags, range]; items with the stats, tags and text the page reads
const CHAMPS = [['Ahri', 103, 3, 8, 'Mage Assassin', 550], ['Zed', 238, 9, 1, 'Assassin', 125], ['Talon', 91, 9, 1, 'Assassin', 125], ['Garen', 86, 7, 1, 'Fighter Tank', 175],
  ['Jinx', 222, 9, 2, 'Marksman', 525], ['Lux', 99, 2, 9, 'Mage Support', 550], ['Syndra', 134, 2, 9, 'Mage', 550], ['Aatrox', 266, 8, 3, 'Fighter', 175],
  ['Vladimir', 8, 2, 8, 'Mage', 450], ['Soraka', 16, 2, 7, 'Support', 550]];
const DDATA = Object.fromEntries(CHAMPS.map(([id, key, attack, magic, tags, range]) => [id, { id, key: String(key), name: id, info: { attack, magic }, tags: tags.split(' '), stats: { attackrange: range } }]));
const ITEM = (name, total, x = {}) => ({ name, gold: { total }, tags: [], maps: { 11: true }, ...x });
const ITEMS = { data: {
  1056: ITEM('Doran’s Ring', 400), 2003: ITEM('Health Potion', 50, { tags: ['Consumable'] }), 9001: ITEM('A thousand gold', 1000),
  6655: ITEM('Luden’s Companion', 2750, { stats: { FlatMagicDamageMod: 90 }, tags: ['SpellDamage', 'MagicPenetration'] }),
  3020: ITEM('Sorcerer’s Shoes', 1100, { tags: ['Boots', 'MagicPenetration'] }), 3175: ITEM('Spellslinger’s Shoes', 1100, { from: ['3020'], tags: ['MagicPenetration'] }), // tier 3, with no Boots tag (as Gunmetal Greaves)
  3089: ITEM('Rabadon’s Deathcap', 3600, { stats: { FlatMagicDamageMod: 130 }, tags: ['SpellDamage'] }),
  3157: ITEM('Zhonya’s Hourglass', 3250, { stats: { FlatMagicDamageMod: 105, FlatArmorMod: 50 }, tags: ['SpellDamage', 'Armor', 'Active'] }),
  3102: ITEM('Banshee’s Veil', 3000, { stats: { FlatMagicDamageMod: 105, FlatSpellBlockMod: 40 }, tags: ['SpellDamage', 'SpellBlock'] }),
  3165: ITEM('Morellonomicon', 2950, { stats: { FlatMagicDamageMod: 75 }, tags: ['SpellDamage'], description: '<mainText>Magic damage applies <keyword>Grievous Wounds</keyword>.</mainText>' }),
  3142: ITEM('Youmuu’s Ghostblade', 2800, { stats: { FlatPhysicalDamageMod: 55 }, tags: ['Damage', 'ArmorPenetration'] }),
  6691: ITEM('Duskblade', 3100, { stats: { FlatPhysicalDamageMod: 60 }, tags: ['Damage', 'ArmorPenetration'] }),
} };
// Riot's tips (allytips, enemytips) in a champion's own file
const TIPS = { Ahri: [['Use Charm to set up your combos.'], []], Zed: [[], ['Stay away from the shadows.', 'Zhonya’s Hourglass stops Death Mark.']] };
const champFull = (id) => ({ data: { [id]: { id, allytips: (TIPS[id] || [[]])[0], enemytips: (TIPS[id] || [[], []])[1] } } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// our server's high elo games of Ahri in the middle (server/worker.js /riot/champ): 40, 20 of them against Zed (8
// won, 150 gold behind and 5 CS ahead at 10 minutes). Each starts Doran's Ring, Luden's and Sorcerer's Shoes; in 30
// Rabadon's then Zhonya's and then Banshee's Veil or Morellonomicon (15 each), in 10 Zhonya's then Rabadon's.
const AHRI = { patch: '16.20', role: 'MIDDLE', roles: { MIDDLE: [40, 20] }, games: Array.from({ length: 40 }, (_, i) => ({
  p: '16.20', t: 7000 + i, w: +(i < 8 || (i >= 20 && i < 32)), o: i < 20 ? 238 : 99, g: i < 20 ? -150 : 100, s: [4, 14], rn: null, k: null, x: null, l: [i < 20 ? 5 : 0, 100],
  b: [[10, 1056], [10, 2003], [600, 6655], [700, 3020], ...(i < 30 ? [[1200, 3089], [1500, 3157], [1800, i % 2 ? 3102 : 3165]] : [[1200, 3157], [1500, 3089]])],
})) };

// The desktop app 1.13 as the page sees it (client/preload.js), with League's client knowing you as Rayan when lcu;
// the shared screen: a canvas of one colour, with a pixel that flips so frames keep coming
function fakeApp([lcu, colour]) {
  const on = {};
  window.lpcClient = {
    version: '1.13.0', screens: async () => [{ id: 'screen:1:0', main: true }], captureSource: async () => true, useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    // remote control: Windows' box says allow or not, or stays open ('wait') till answer(); controlStop closes it as
    // Don't allow, as the app does, unless Allow was pressed first (late)
    allow: true, stopped: 0, control(name) { this.asked = name; return this.allow === 'wait' ? new Promise((res) => { this.answer = (r) => { this.answer = null; res(r); }; }) : Promise.resolve(this.allow ? { ok: true, source: 'screen:1:0' } : { ok: false, why: 'They said no.' }); },
    controlStop() { this.stopped++; if (this.answer && !this.late) this.answer({ ok: false, why: 'They took it back.' }); }, controlInput(m) { (this.input = this.input || []).push(m); },
    captureSource(id) { this.source = id; return Promise.resolve(true); },
    point(m) { (this.points = this.points || []).push(m); return Promise.resolve(''); }, // a friend's pointer on the shared screen (1.27)
    ...(lcu && { lcu: async (method, p) => (p === '/lol-summoner/v1/current-summoner' ? { status: 200, data: { puuid: 'me-puuid', gameName: 'Rayan', tagLine: 'EUW', summonerId: 1 } } : { status: 404, data: null }) }),
  };
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.width = 1280; cv.height = 720;
  g.fillStyle = colour; g.fillRect(0, 0, 1280, 720);
  let n = 0;
  setInterval(() => { g.fillStyle = n++ % 2 ? colour : '#000'; g.fillRect(0, 0, 1, 1); }, 100);
  navigator.mediaDevices.getDisplayMedia = async (c) => { // with a tone for its sound, when asked
    const s = cv.captureStream(10);
    if (c && c.audio) { const a = new AudioContext(), d = a.createMediaStreamDestination(), o = a.createOscillator(); o.connect(d); o.start(); s.addTrack(d.stream.getAudioTracks()[0]); }
    return s;
  };
  window.voteBox = (on) => { // League's surrender vote box where League puts it on this 720p screen: a yes, 4 to come, half the time left
    const s = 720 / 1200;
    g.setTransform(s, 0, 0, s, 1280 - 243 * s, 602 * s);
    g.fillStyle = on ? '#161c1e' : colour;
    g.fillRect(0, 0, 223, 113);
    if (on) {
      g.fillStyle = '#000'; g.fillRect(13, 42, 197, 16); g.fillRect(13, 61, 197, 9);
      ['#008e25', '#323232', '#323232', '#323232', '#323232'].forEach((c, i) => { g.fillStyle = c; g.fillRect(15 + i * 38.8, 44, 36.8, 12); });
      g.fillStyle = '#00a09e'; g.fillRect(13, 62, 98, 5);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  };
}
async function context(browser, name, { opts = {}, lcu = false, colour = '#333', notes = null } = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const cors = { 'access-control-allow-origin': '*' };
  await c.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await c.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url(), one = /\/champion\/(\w+)\.json$/.exec(u);
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (one) return r.fulfill({ json: champFull(one[1]), headers: cors });
    if (u.endsWith('item.json')) return r.fulfill({ json: ITEMS, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  if (lcu) await c.route(/127\.0\.0\.1:9007\/riot\//, (r) => { // our server's Riot data, for the page without a room
    const u = r.request().url().replace(/^.*?\/riot/, '');
    if (u === '/summary') return r.fulfill({ json: { p: '16.20', c: {}, old: null, today: 5, total: 50, at: Date.now() }, headers: cors });
    if (u === '/champ?c=103&r=MIDDLE') return r.fulfill({ json: AHRI, headers: cors });
    if (u.startsWith('/champ?')) return r.fulfill({ json: { patch: '16.20', games: [] }, headers: cors });
    r.fulfill({ status: 404, headers: cors });
  });
  await c.addInitScript(([name, o, notes]) => {
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', name);
    localStorage.setItem('lpc-news', '9999'); // no What's new
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, ...o }));
    if (notes) localStorage.setItem('lpc-notes', JSON.stringify(notes));
  }, [name, opts, notes]);
  await c.addInitScript(fakeApp, [lcu, colour]);
  const page = await c.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${lcu ? 9007 : PEER}&debug`);
  return [c, page];
}
const wait = (page, fn, arg, what, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; overlay ${JSON.stringify(await page.evaluate(() => window.lpcClient && lpcClient.lastOverlay).catch(() => null)).slice(0, 600)}; cam ${JSON.stringify(await page.evaluate(() => window.lpc && [lpc.cam(), lpc.lends()]).catch(() => null))}`);
});
// League's live data for a game (client/main.js summary): players [name, team, champion, position, items, kills]
const game = (me, players, over = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 600, room: 'g0123456789a', result: '', events: [], me: { champName: me.champ, hp: 1, speed: 330, dead: false, respawn: 0, ...me },
  players: players.map(([n, team, champ, pos, items = [[1056, 1]], k = 0]) => ({ name: n + '#EUW', team, champ, champName: champ, pos, lvl: 9, k, d: 0, a: 0, cs: 80, items })),
  ...over,
});
const US = (items = [[6655, 1], [3020, 1]]) => [['Rayan', 'ORDER', 'Ahri', 'MIDDLE', items], ['Friend', 'ORDER', 'Garen', 'TOP'], ['Jungler', 'ORDER', 'Lux', 'JUNGLE'], ['Shooter', 'ORDER', 'Jinx', 'BOTTOM'], ['Hooks', 'ORDER', 'Soraka', 'UTILITY']];
const ahri = (dead, them, items, over) => game({ champ: 'Ahri', team: 'ORDER', dead, respawn: dead ? 30 : 0 }, [...US(items), ...them], over);
// their teams: physical burst with Zed and Talon fed, even, mostly magic, and healers
const BURST = [['Shadow', 'CHAOS', 'Zed', 'MIDDLE', [[3142, 1], [6691, 1]], 5], ['Claws', 'CHAOS', 'Talon', 'JUNGLE', [[3142, 1]], 3], ['Axe', 'CHAOS', 'Garen', 'TOP'], ['Sniper', 'CHAOS', 'Jinx', 'BOTTOM'], ['Light', 'CHAOS', 'Lux', 'UTILITY']];
const EVEN = [['Shadow', 'CHAOS', 'Zed', 'MIDDLE'], ['Claws', 'CHAOS', 'Talon', 'JUNGLE'], ['Light', 'CHAOS', 'Lux', 'TOP'], ['Sniper', 'CHAOS', 'Syndra', 'BOTTOM'], ['Healer', 'CHAOS', 'Soraka', 'UTILITY']];
const MAGIC = [['Shadow', 'CHAOS', 'Syndra', 'MIDDLE', [[3089, 1]], 4], ['Claws', 'CHAOS', 'Vladimir', 'JUNGLE'], ['Light', 'CHAOS', 'Lux', 'TOP', [[3089, 1]], 3], ['Sniper', 'CHAOS', 'Jinx', 'BOTTOM'], ['Healer', 'CHAOS', 'Soraka', 'UTILITY']];
const HEAL = [['Shadow', 'CHAOS', 'Zed', 'MIDDLE'], ['Blood', 'CHAOS', 'Vladimir', 'JUNGLE'], ['Darkin', 'CHAOS', 'Aatrox', 'TOP'], ['Sniper', 'CHAOS', 'Jinx', 'BOTTOM'], ['Healer', 'CHAOS', 'Soraka', 'UTILITY']];

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    // ---- the overlay draws them: the tips on the left, what to buy under League's score, a teammate's screen on the
    // right, your chance to win at the end of the timers line
    {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await p.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
      await p.goto(`http://127.0.0.1:${PORT}/overlay.html`);
      const red = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 36); return c.toDataURL('image/jpeg'); });
      const spots = { buy: { x: 0.99, y: 0.06, ax: 'r', ay: 't' }, tips: { x: 0.01, y: 0.5, ax: 'l', ay: 't' }, screen: { x: 0.99, y: 0.3, ax: 'r', ay: 't' }, vote: { x: 0.881, y: 0.5017, ax: 'r', ay: 't' } };
      await p.evaluate(([red, parts]) => window.fire({ visible: true, board: true, pos: 'tl', scale: 1, opacity: 1, parts, game: 'Dragon 1:23 · Baron 12:00 · Kills 5–3 · Gold +1.2k · Win chance 62%',
        buy: { name: 'Zhonya’s Hourglass', pic: red, why: 'armor against Zed and Talon' }, tips: { title: 'Ahri against Zed', lines: ['Your note: stay away at 6', 'Zhonya’s Hourglass stops Death Mark.'] },
        screen: { name: 'Ana', img: red }, vote: { title: 'Win chance 6%', win: false, lines: ['Gold −4.5k · Kills 0–8 · Towers 0–0'] } }), [red, spots]);
      const box = (k) => p.evaluate((k) => { const e = document.querySelector(`#parts [data-part="${k}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, text: e.innerText.replace(/\s+/g, ' ').trim(), imgs: [...e.querySelectorAll('img')].map((i) => i.naturalWidth), loss: !!e.querySelector('.after.loss') }; }, k);
      await p.waitForFunction(() => [...document.querySelectorAll('#parts img')].every((i) => i.complete && i.naturalWidth));
      const [tips, buy, screen, vote] = [await box('tips'), await box('buy'), await box('screen'), await box('vote')];
      assert(vote && vote.text === 'WIN CHANCE 6% Gold −4.5k · Kills 0–8 · Towers 0–0' && vote.loss && Math.abs(vote.r - 1127.7) < 2 && Math.abs(vote.t - 361.2) < 2, `the chance to win left of League’s vote box: ${JSON.stringify(vote)}`);
      assert(tips && tips.text === 'TIPS: AHRI AGAINST ZED Your note: stay away at 6 Zhonya’s Hourglass stops Death Mark.' && Math.abs(tips.l - 12.8) < 2 && Math.abs(tips.t - 360) < 2, `the tips on the left: ${JSON.stringify(tips)}`);
      assert(buy && buy.text === 'Next: Zhonya’s Hourglass · armor against Zed and Talon' && buy.imgs.length === 1 && Math.abs(buy.r - 1267.2) < 2 && Math.abs(buy.t - 43.2) < 2, `what to buy at the top right: ${JSON.stringify(buy)}`);
      assert(screen && screen.text === 'ANA’S SCREEN' && screen.imgs[0] === 64 && Math.abs(screen.r - 1267.2) < 2 && Math.abs(screen.t - 216) < 2, `Ana’s screen on the right: ${JSON.stringify(screen)}`);
      assert.match(await p.innerText('#main'), /Gold \+1\.2k · Win chance 62%/);
      await shot(p, 'ingame-overlay');
      await p.close();
      console.log('overlay: the tips on the left, what to buy at the top right, a teammate’s screen on the right, the chance to win after the timers and beside League’s vote box');
    }

    // ---- while you're dead: your lane's tips, and what to buy next against their team
    {
      const [c, page] = await context(browser, 'Rayan', { lcu: true, notes: { '103|238': 'stay out of the shadow’s range at level 6' } });
      await page.click('#leagueNav'); await page.click('.nav[data-view="game"]');
      await page.evaluate((g) => lpcClient.emit('league', g), ahri(false, BURST));
      await wait(page, () => !!lpc.lcu().me0, null, 'you, from League’s client');
      await wait(page, () => lpc.winChance() != null, null, 'the items, for the gold');
      assert.strictEqual(await page.evaluate(() => [lpc.deadTips(), lpc.buyNext(), lpcClient.lastOverlay.tips, lpcClient.lastOverlay.buy]).then((l) => l.every((x) => x == null)), true, 'nothing while alive outside your base');
      await page.evaluate((g) => lpcClient.emit('league', g), ahri(true, BURST));
      await wait(page, () => { const t = lpcClient.lastOverlay.tips; return !!t && t.lines.length === 6; }, null, 'the tips while dead');
      const o = await page.evaluate(() => lpcClient.lastOverlay);
      assert.strictEqual(o.tips.title, 'Ahri against Zed');
      assert.deepStrictEqual(o.tips.lines.map((l) => l.replace(/^(High elo: .*?)\..*$/, '$1')), ['Your note: stay out of the shadow’s range at level 6', 'High elo: Ahri won 8 of 20 games against Zed, −150 gold and +5 CS at 10 minutes',
        'Zed is a melee assassin with mostly physical damage, so armor helps against them. You outrange Zed: 550 against 125.', 'Riot’s tip against Zed: Stay away from the shadows.',
        'Riot’s tip against Zed: Zhonya’s Hourglass stops Death Mark.', 'Riot’s tip for Ahri: Use Charm to set up your combos.']);
      assert(o.board === true && o.parts.tips && o.parts.buy && o.parts.screen, `the whole screen, with their places: ${JSON.stringify(o.parts)}`);
      await wait(page, () => { const e = document.getElementById('gameTips'); return !e.hidden && /Your note: stay out of the shadow’s range/.test(e.innerText); }, null, 'the tips on the Game page too');
      await wait(page, () => !!lpcClient.lastOverlay.buy, null, 'what to buy');
      assert.deepStrictEqual(await page.evaluate(() => lpcClient.lastOverlay.buy), { name: 'Zhonya’s Hourglass', pic: 'https://ddragon.leagueoflegends.com/cdn/1.1/img/item/3157.png', why: 'armor against Zed and Talon' });
      const buyVs = async (them, items) => { await page.evaluate((g) => lpcClient.emit('league', g), ahri(true, them, items)); return page.evaluate(() => { const b = lpc.buyNext(); return b && `${b.name}: ${b.why}`; }); };
      assert.strictEqual(await buyVs(EVEN), 'Rabadon’s Deathcap: usual next on Ahri', 'an even team: what high elo players buy next');
      const four = [[6655, 1], [3020, 1], [3089, 1], [3157, 1]];
      assert.strictEqual(await buyVs(MAGIC, four), 'Banshee’s Veil: magic resist against Syndra and Lux');
      assert.strictEqual(await buyVs(HEAL, four), 'Morellonomicon: Grievous Wounds against Vladimir and Aatrox');
      assert.strictEqual(await buyVs(EVEN, [...four, [3102, 1], [3165, 1]]), null, 'nothing left that high elo players build');
      assert.strictEqual(await buyVs(EVEN, [[6655, 1], [3175, 1]]), 'Rabadon’s Deathcap: usual next on Ahri', 'tier 3 boots count as your boots: no Sorcerer’s Shoes again');
      // ---- your build on the Game page: Premade's, why, which you have and which is next; then changed, and back
      const build = () => page.evaluate(() => { const b = document.getElementById('liveBuild'); return { hidden: b.hidden, head: b.querySelector('h3').textContent, why: b.querySelector('.bwhy').textContent, rows: [...b.querySelectorAll('li')].map((l) => `${l.dataset.k}:${l.innerText.split('\n')[0]}`) }; });
      await page.evaluate((g) => lpcClient.emit('league', g), ahri(true, EVEN));
      await wait(page, () => !document.getElementById('liveBuild').hidden, null, 'your build on the Game page');
      let b = await build();
      assert.strictEqual(b.head, 'Premade’s build on Ahri');
      assert(/high elo players buy on Ahri middle \(40 games this patch.*Games with all three first items: won 50% of 40\./.test(b.why), b.why);
      assert.deepStrictEqual(b.rows, ['have:Luden’s Companion', 'next:Rabadon’s Deathcap', ':Zhonya’s Hourglass', 'have:Sorcerer’s Shoes', ':Morellonomicon', ':Banshee’s Veil'], JSON.stringify(b.rows));
      await page.click('#liveBuild li:nth-child(2) button[aria-label^="Take out"]');
      await page.click('#liveBuild li:nth-child(4) button[aria-label^="Move up"]');
      await page.fill('#liveBuild input', 'Youmuu’s Ghostblade');
      await page.click('#liveBuild .badd button[type="submit"]');
      await wait(page, () => document.querySelectorAll('#liveBuild li').length === 6 && /^Your build/.test(document.querySelector('#liveBuild h3').textContent), null, 'your changed build');
      b = await build();
      assert.deepStrictEqual(b.rows, ['have:Luden’s Companion', 'next:Zhonya’s Hourglass', ':Morellonomicon', 'have:Sorcerer’s Shoes', ':Banshee’s Veil', ':Youmuu’s Ghostblade'], JSON.stringify(b.rows));
      assert.strictEqual(await page.evaluate(() => { const x = lpc.buyNext(); return `${x.name}: ${x.why}`; }), 'Zhonya’s Hourglass: next in your build', 'what to buy next goes by your build');
      assert.strictEqual(await page.evaluate(() => localStorage.getItem('lpc-builds')), '{"103/MIDDLE":[6655,3157,3165,3020,3102,3142]}');
      await page.click('#liveBuild .breset');
      await wait(page, () => document.querySelector('#liveBuild h3').textContent === 'Premade’s build on Ahri', null, 'back to Premade’s build');
      console.log('your build: tier 3 boots count; Premade’s build with why, which you have and next; moved, taken out and added, and what to buy goes by it; back to Premade’s');
      await page.evaluate((g) => lpcClient.emit('league', g), ahri(false, BURST));
      await wait(page, () => !lpcClient.lastOverlay.tips && !lpcClient.lastOverlay.buy && document.getElementById('gameTips').hidden, null, 'all gone when you’re back');
      console.log('while dead: the tips for your lane on the overlay and the Game page; what to buy: Zhonya’s against Zed and Talon, Banshee’s against magic, Morellonomicon against healers');

      // ---- your chance to win: even at 10:00, 2,000 gold up, 8,000 up at 20:00, an Elder each way, Baron gone
      const chance = (over, ours = [], theirs = []) => page.evaluate((g) => { lpcClient.emit('league', g); return lpc.winChance(); },
        game({ champ: 'Ahri', team: 'ORDER' }, [['Rayan', 'ORDER', 'Ahri', 'MIDDLE', [[1056, 1], ...ours]], ['Shadow', 'CHAOS', 'Zed', 'MIDDLE', [[1056, 1], ...theirs]]], over));
      const near = (v, want, what) => assert(Math.abs(v - want) < 0.005, `${what}: ${v}, not ${want}`);
      near(await chance({}), 0.5, 'even');
      near(await chance({}, [[9001, 2]]), 0.7503, '2,000 gold up at 10:00');
      near(await chance({}, [], [[9001, 2]]), 0.2497, '2,000 gold down');
      near(await chance({ t: 1200 }, [[9001, 8]]), 0.948, '8,000 up at 20:00');
      near(await chance({ t: 1800, events: [{ t: 1740, e: 'elder', team: 'ORDER' }] }), 0.7685, 'your Elder');
      near(await chance({ t: 1800, events: [{ t: 1740, e: 'elder', team: 'CHAOS' }] }), 0.2315, 'their Elder');
      near(await chance({ t: 1800, events: [{ t: 1600, e: 'baron', team: 'CHAOS' }] }), 0.5, 'their Baron over after 3 minutes');
      const ahead = await chance({ t: 1500, events: [...[300, 600, 900, 1200].map((t) => ({ t, e: 'dragon', team: 'ORDER' })), { t: 1400, e: 'tower', team: 'ORDER', of: 'CHAOS' }] }, [[9001, 3]]);
      near(ahead, 0.886, 'the soul, a tower and 3,000 gold up at 25:00');
      await chance({}, [[9001, 2]]);
      await wait(page, () => / · Win chance 75%$/.test(lpcClient.lastOverlay.game || ''), null, 'the chance to win after the timers');
      await page.$eval('#optOverlayWin', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
      await wait(page, () => !/Win chance/.test(lpcClient.lastOverlay.game || ''), null, 'off when turned off');
      await c.close();
      console.log('chance to win: 50% even, 75% 2,000 gold up at 10:00, 95% 8,000 up at 20:00, 77% with your Elder; at the end of the timers line');
    }

    // ---- a surrender vote: League's vote box on the shared screen (a callout has the app share it by itself) pops the
    // chance to win up left of it, with the gold, kills and towers; not for a remake (before 2:30), gone with the box
    {
      const [c, page] = await context(browser, 'Rayan', { lcu: true, opts: { missList: true } });
      const lol = (t) => page.evaluate((g) => lpcClient.emit('league', g), ahri(false, BURST, undefined, { t }));
      await lol(600);
      await wait(page, () => lpc.winChance() != null, null, 'the items, for the gold');
      await page.waitForTimeout(1500);
      assert.strictEqual(await page.evaluate(() => lpcClient.lastOverlay.vote || null), null, 'nothing without a vote');
      await page.evaluate(() => voteBox(true));
      await wait(page, () => !!lpcClient.lastOverlay.vote, null, 'the chance to win beside the vote box');
      const o = await page.evaluate(() => lpcClient.lastOverlay);
      assert.deepStrictEqual(o.vote, { title: 'Win chance 6%', win: false, lines: ['Gold −4.5k · Kills 0–8 · Towers 0–0'] });
      assert(o.board === true && Math.abs(o.parts.vote.x - 0.881) < 0.001 && Math.abs(o.parts.vote.y - 0.5017) < 0.001 && o.parts.vote.ax === 'r' && o.parts.vote.ay === 't', `left of League’s box, the same top: ${JSON.stringify(o.parts.vote)}`);
      await lol(100); // a remake
      await wait(page, () => !lpcClient.lastOverlay.vote, null, 'no pop-up for a remake');
      await lol(600);
      await wait(page, () => !!lpcClient.lastOverlay.vote, null, 'the pop-up again');
      await shot(page, 'ingame-vote');
      await page.evaluate(() => voteBox(false));
      await wait(page, () => !lpcClient.lastOverlay.vote, null, 'gone with League’s box');
      await c.close();
      console.log('surrender vote: the chance to win pops up left of League’s vote box, 6% with the gold, kills and towers; not for a remake, gone with the box');
    }

    // ---- a teammate's screen while you're dead: Ana (ORDER, alive) lends theirs once they turn it on, Ben (ORDER,
    // dead) watches it, Cat (CHAOS, dead) never gets it, not even by asking
    {
      const ps = [];
      for (const [name, colour] of [['Ana', '#c22'], ['Ben', '#2c2'], ['Cat', '#22c']]) {
        const [c, page] = await context(browser, name, { colour });
        await page.click('.nav[data-view="voice"]'); // the app opens on Profile
        await page.fill('#code', 'SCREENS');
        await page.click('#joinBtn');
        await wait(page, () => lpc.slot() >= 0, null, `${name} in the room`);
        ps.push([c, page]);
      }
      const [ana, ben, cat] = ps.map(([, p]) => p);
      for (const p of [ana, ben, cat]) await wait(p, () => lpc.peers().length === 2 && lpc.peers().every((x) => x.name), null, 'everyone in the room');
      for (const p of [ana, ben, cat]) await wait(p, () => document.querySelector('#generalShareBtn').textContent === 'Stop sharing', null, 'the main screen shared by itself on joining a room, before any game (What’s new 63, 84)');
      for (const p of [ana, ben, cat]) await p.$eval('#optRoomScreen', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); }); // screens in the room come later
      const players = [['Ana', 'ORDER', 'Ahri', 'MIDDLE'], ['Ben', 'ORDER', 'Garen', 'TOP'], ['Cat', 'CHAOS', 'Zed', 'MIDDLE']];
      const lol = (p, me) => p.evaluate((g) => lpcClient.emit('league', g), game(me, players));
      await lol(ana, { champ: 'Ahri', team: 'ORDER' });
      await lol(ben, { champ: 'Garen', team: 'ORDER', dead: true, respawn: 40 });
      await lol(cat, { champ: 'Zed', team: 'CHAOS', dead: true, respawn: 40 });
      for (const p of [ana, ben, cat]) await wait(p, () => document.querySelector('#shareBtn').textContent === 'Stop sharing', null, 'swapped to League’s screen share once the game starts (What’s new 50, 84)', 10000);
      assert.deepStrictEqual(await Promise.all([ana, ben, cat].map((p) => p.evaluate(() => [lpc.cam(), lpc.lends(), !!lpcClient.lastOverlay.screen]))), [[null, [], false], [null, [], false], [null, [], false]], 'nothing until Ana lets teammates watch');
      await cat.$eval('#optAutoShare', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
      await wait(cat, () => document.querySelector('#shareBtn').textContent === 'Share League screen', null, 'turned off, it stops');
      await cat.$eval('#optAutoShare', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });

      await ana.$eval('#optLendScreen', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });
      await wait(ben, () => { const s = lpcClient.lastOverlay.screen; return !!s && s.name === 'Ana' && /^data:image\/jpeg/.test(s.img); }, null, 'Ana’s screen on Ben’s overlay', 30000);
      const px = await ben.evaluate(async () => { const i = new Image(); i.src = lpcClient.lastOverlay.screen.img; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [i.width, ...g.getImageData(i.width / 2, i.height / 2, 1, 1).data.slice(0, 3)]; });
      assert(px[0] === 640 && px[1] > 160 && px[2] < 80 && px[3] < 80, `Ana’s red screen, 640 px wide: ${px}`);
      assert(await ben.evaluate(() => lpcClient.lastOverlay.board === true && !!lpcClient.lastOverlay.parts.screen), 'over the whole screen, in its place');
      assert.deepStrictEqual(await ana.evaluate(() => lpc.lends()), ['Ben']);
      await wait(ana, () => lpc.toasts().includes('Ben is watching your screen while they’re dead.'), null, 'Ana told who watches');
      await shot(ben, 'ingame-watching');

      await cat.evaluate(() => lpc.send({ t: 'watch', on: true })); // Cat asks anyway
      await cat.waitForTimeout(3000);
      assert.deepStrictEqual([await cat.evaluate(() => [lpc.cam(), !!lpcClient.lastOverlay.screen]), await ana.evaluate(() => lpc.lends())], [[null, false], ['Ben']], 'never to the other team');

      await lol(ben, { champ: 'Garen', team: 'ORDER' }); // Ben is back
      await wait(ben, () => !lpcClient.lastOverlay.screen && !lpc.cam(), null, 'gone from Ben’s overlay');
      await wait(ana, () => !lpc.lends().length, null, 'Ana stops sending it');

      // screens in the room (What's new 52): Ben, on Ana's team, sees Ana's screen on his Voice page by itself, even with
      // his own hidden; Hide stops it until Show screen; Cat on the other team never gets it, not even by asking; Ana
      // turning it off ends it
      await ana.$eval('#optRoomScreen', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });
      await ben.$eval('#optRoomScreen', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
      const screens = (p) => p.evaluate(() => lpc.seen().map((s) => s.name));
      await wait(ben, () => { const s = lpc.seen(); return s.length === 1 && s[0].name === 'Ana' && s[0].call && s[0].video > 0; }, null, 'Ana’s screen playing on Ben’s Voice page', 30000);
      await wait(ben, () => document.querySelector('#screenGrid figcaption span').textContent === 'Ana’s screen', null, 'named on its tile');
      assert.strictEqual(await ben.evaluate(() => lpc.seen()[0].sound), 1, 'with its sound (What’s new 63)');
      // each watcher gets the size they watch, and the tile says what they get (What's new 89)
      await wait(ben, () => /^\d+p · \d+ fps/.test(document.querySelector('#screenGrid .shq').textContent), null, 'size and frame rate on the tile', 15000);
      const benH = await ben.evaluate(() => lpc.seen()[0].h);
      assert.ok([360, 540, 720, 1080, 1440, 2160].includes(benH), `Ben asks for his tile's height: ${benH}`);
      await wait(ana, (h) => lpc.lendH()[0] === Math.min(1080, h), benH, 'Ana sends Ben that size');
      assert.strictEqual(await ben.$eval('#screenGrid .pop', (b) => b.textContent), 'Pop out');
      assert.strictEqual(await ben.$eval('#screenGrid video', (v) => v.muted), false, 'not muted');
      await wait(ana, () => lpc.toasts().includes('Ben is watching your screen.'), null, 'Ana told who watches');
      await shot(ben, 'room-screen');
      // full screen while only watching (the video's own button) stays: the every-second refresh left it at once (2026-10-26)
      await ben.$eval('#screenGrid video', (v) => v.requestFullscreen());
      await new Promise((r) => setTimeout(r, 2500));
      assert.ok(await ben.evaluate(() => document.fullscreenElement === document.querySelector('#screenGrid video')), 'watching full screen stays');
      await ben.evaluate(() => document.exitFullscreen());
      // Point (What's new 80): Ben points and draws on Ana's screen, Cat can't, and Ana can turn it off
      assert.strictEqual(await ben.$eval('#screenGrid figcaption', (e) => e.textContent.includes('Request control')), false, 'no Request control on room tiles (What’s new 83)');
      await ben.click('#screenGrid .pt');
      assert.strictEqual(await ben.$eval('#screenGrid .pt', (b) => b.textContent), 'Stop pointing');
      const [tx, ty, tw, th] = await ben.$eval('#screenGrid video', (v) => { const r = v.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }), at = [tx + tw / 2, ty + th / 2];
      await ben.mouse.move(at[0], at[1]);
      await ben.mouse.down();
      await ben.mouse.move(at[0] + 40, at[1], { steps: 4 });
      await ben.mouse.up();
      await wait(ana, () => (lpcClient.points || []).some((m) => m.d) && lpcClient.points.at(-1).d === false && lpc.toasts().includes('Ben is pointing at your screen. Turn it off under Players in your room.'), null, 'Ben’s pointer and line in Ana’s app');
      const pt = await ana.evaluate(() => lpcClient.points[0]);
      assert(pt.who === 'Ben' && Math.abs(pt.x - 0.5) < 0.02 && Math.abs(pt.y - 0.5) < 0.02, `Ben’s pointer in the middle of Ana’s screen: ${JSON.stringify(pt)}`);
      await cat.evaluate(() => lpc.send({ t: 'pt', x: 0.1, y: 0.1 }));
      await ana.$eval('#optLetPoint', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
      await ben.mouse.move(at[0], at[1] + 30);
      await wait(ben, () => lpc.toasts().includes('Ana: They turned off pointing on their screen.') && document.querySelector('#screenGrid .pt').textContent === 'Point', null, 'Ben told, and his pointing off');
      assert(!(await ana.evaluate(() => lpcClient.points.some((m) => m.x === 0.1))), 'nothing from Cat');
      await cat.waitForTimeout(2000);
      assert.deepStrictEqual(await screens(cat), [], 'Cat sees no screen from the other team');
      await cat.evaluate(() => lpc.send({ t: 'see', on: true }));
      await cat.waitForTimeout(3000);
      assert.deepStrictEqual(await ana.evaluate(() => lpc.lends()), ['Ben'], 'never to the other team');
      await ben.click('#screenGrid figcaption button'); // Hide
      await wait(ben, () => !lpc.seen().length && document.getElementById('roomScreens').hidden, null, 'hidden on Ben’s page');
      await wait(ana, () => !lpc.lends().length, null, 'and Ana stops sending it');
      await wait(ben, () => !!document.querySelector('#players li .screen:not([hidden])'), null, 'Show screen on Ana’s card');
      await ben.click('#players li .screen:not([hidden])');
      await wait(ben, () => lpc.seen().length === 1 && lpc.seen()[0].call, null, 'back after Show screen', 30000);
      await ana.$eval('#optRoomScreen', (e) => { e.checked = false; e.dispatchEvent(new Event('change')); });
      await wait(ana, () => !lpc.lends().length, null, 'turned off, Ana stops sending it');
      await wait(ben, () => !lpc.seen().length && document.getElementById('roomScreens').hidden, null, 'and Ben’s screens box closes');
      for (const [c] of ps) await c.close();
      console.log('teammate’s screen: Ben sees Ana’s while dead once Ana lets teammates watch, until Ben is back; Cat on the other team never does; screens in the room: Ben sees Ana’s on the Voice page with his own off, hides it and shows it again, Cat never does, Ana turning hers off ends it; Ben’s pointer on Ana’s screen until Ana turns it off');
    }

    // ---- Remote help (What's new 83): no room, no screen share. Ana's code, Ben types it in: Ana's app says no; Ben
    // takes a request back while Ana's box is open and it closes; a yes that comes just as he does is undone; each code
    // ends with its session. Then yes: only now does Ana's page share her screen with Ben; Cat can't use the same code;
    // Ben's click, key, a drag let go off her screen, a key down when it loses focus and a click in full screen reach
    // Ana's app once each and in Ben's order, even sent out of order, and one lost doesn't hold up the rest. Ben's
    // Ctrl+V sends what he copied before its V; Ana's Pause and an admin window in front show on Ben's side; 10 minutes
    // without input ends it. Then Ben's Control on Ana in Friends gets him in without a code, and Stop ends it
    {
      const invites = []; // our server's /invite and /friends: { to, n, riot, room, key, lob, at }
      const ps = [];
      for (const [name, colour] of [['Ana', '#c22'], ['Ben', '#2c2'], ['Cat', '#22c']]) {
        const [c, page] = await context(browser, name, { colour });
        await c.route(`http://127.0.0.1:${PEER}/invite`, async (r) => {
          const b = JSON.parse(r.request().postData());
          invites.push({ to: b.to.toLowerCase(), n: name, riot: `${name}#EUW`, room: b.room, key: b.key, lob: b.lob, at: Math.round(Date.now() / 1000) });
          r.fulfill({ json: { ok: true }, headers: { 'access-control-allow-origin': '*' } });
        });
        await c.route(`http://127.0.0.1:${PEER}/friends`, (r) => r.fulfill({ json: { has: { 'ana#euw': Date.now() / 1000, 'ben#euw': Date.now() / 1000 }, inv: invites.filter((v) => v.to === `${name}#euw`.toLowerCase()) }, headers: { 'access-control-allow-origin': '*' } }));
        await page.evaluate((n) => { localStorage.setItem('lpc-friends', JSON.stringify([n === 'Ana' ? 'Ben#EUW' : 'Ana#EUW'])); lpcClient.version = '1.28.0'; }, name);
        await page.reload();
        await page.evaluate(() => { lpcClient.version = '1.28.0'; });
        await page.click('.nav[data-view="help"]');
        ps.push([c, page]);
      }
      const [ana, ben, cat] = ps.map(([, p]) => p);
      const offer = async () => { await ana.click('#helpOffer'); await wait(ana, () => !!lpc.help() && !document.getElementById('helpMine').hidden, null, 'Ana’s code'); return ana.evaluate(() => lpc.help().code); };
      const connect = async (p, code) => { await p.fill('#helpCode', code.replace(/(\d{3})/g, '$1 ')); await p.click('#helpGo'); };
      let code = await offer();
      assert.match(await ana.$eval('#helpMine', (e) => e.textContent), /^\d{3} \d{3} \d{3}$/, 'shown in threes');
      await ana.evaluate(() => { lpcClient.allow = false; });
      await connect(ben, code);
      await wait(ben, () => lpc.toasts().includes('Ana: They said no.') && document.getElementById('helpTile').hidden, null, 'Ana said no');
      assert.strictEqual(await ana.evaluate(() => lpcClient.asked), 'Ben', 'Ana’s app asked about Ben');
      await wait(ana, () => !lpc.help(), null, 'Ana’s code gone with it');
      assert.strictEqual(await ana.evaluate(() => lpcClient.source), undefined, 'and Ana’s screen never shared');
      await ana.evaluate(() => { lpcClient.allow = 'wait'; });
      code = await offer();
      await connect(ben, code);
      await wait(ana, () => !!lpcClient.answer && lpc.toasts().includes('Ben asks to control your PC. Answer in Premade’s window.'), null, 'Ana’s box open, and Ana told');
      assert.strictEqual(await ben.$eval('#helpSt', (e) => e.textContent), 'Asking Ana: their Premade asks them to allow it.');
      await ben.click('#helpStop'); // Cancel: takes it back
      await wait(ana, () => !lpcClient.answer && lpcClient.stopped === 1 && !lpc.help(), null, 'Ana’s box closed');
      code = await offer();
      await connect(ben, code);
      await wait(ana, () => !!lpcClient.answer, null, 'Ana’s box open again');
      await ana.evaluate(() => { lpcClient.late = true; }); // Ana pressed Allow as Ben took it back
      await ben.click('#helpStop');
      await wait(ana, () => lpcClient.stopped === 2, null, 'Ben’s cancel at Ana’s');
      await ana.evaluate(() => { lpcClient.late = false; lpcClient.answer({ ok: true, source: 'screen:1:0' }); });
      await wait(ana, () => lpcClient.stopped === 3, null, 'the late yes undone');
      assert(!(await ana.evaluate(() => lpc.toasts().some((t) => t.startsWith('Ben is controlling your PC')) || !!lpcClient.source)), 'never on for Ana, her screen never shared');
      await ana.evaluate(() => { lpcClient.allow = true; });
      code = await offer();
      await connect(ben, code);
      await wait(ben, () => document.getElementById('helpStop').textContent === 'Stop control' && !document.getElementById('helpFull').hidden && document.getElementById('helpVid').videoWidth > 0, null, 'Ben in control, seeing Ana’s screen, with Full screen', 30000);
      await wait(ana, () => lpc.toasts().at(-1).startsWith('Ben is controlling your PC') && lpcClient.source === 'screen:1:0', null, 'Ana told who controls; the screen her app said shared');
      await connect(cat, code);
      await wait(cat, () => lpc.toasts().includes('Someone else is already using that code.') && document.getElementById('helpTile').hidden, null, 'Cat can’t use Ana’s code too');
      const [vx, vy, vw, vh] = await ben.$eval('#helpVid', (v) => { const r = v.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }), mid = [vx + vw / 2, vy + vh / 2];
      await ben.mouse.click(mid[0], mid[1]);
      await ben.keyboard.press('KeyA');
      await ben.mouse.down();
      await ben.mouse.move(mid[0], vy - 20); // off her screen
      await ben.mouse.up();
      await ben.keyboard.down('KeyS');
      await ben.click('#helpName'); // her screen loses focus
      await ben.keyboard.up('KeyS');
      await wait(ana, () => (lpcClient.input || []).filter((m) => m.k !== 'm').map((m) => m.k + (m.c || '')).join() === 'd,u,kdKeyA,kuKeyA,d,u,kdKeyS,kuKeyS', null, 'Ben’s click, key, drag and held key in Ana’s app, each let go once');
      const down = await ana.evaluate(() => lpcClient.input.find((m) => m.k === 'd'));
      assert(down.b === 0 && Math.abs(down.x - 0.5) < 0.02 && Math.abs(down.y - 0.5) < 0.02, `a left click in the middle of Ana’s screen: ${JSON.stringify(down)}`);
      await ben.click('#helpFull');
      await wait(ben, () => document.fullscreenElement === document.getElementById('helpVid'), null, 'Ben’s full screen');
      await ben.mouse.click(320, 250); // a quarter in: 1280x720 in the middle of his 1280x860 window
      await wait(ana, () => lpcClient.input.filter((m) => m.k === 'd').length === 3, null, 'Ben’s click in full screen');
      const quarter = await ana.evaluate(() => lpcClient.input.filter((m) => m.k === 'd')[2]);
      assert(Math.abs(quarter.x - 0.25) < 0.02 && Math.abs(quarter.y - 0.25) < 0.02, `a quarter in on Ana’s screen: ${JSON.stringify(quarter)}`);
      await ben.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await ben.evaluate(() => navigator.clipboard.writeText('hello from Ben'));
      await ben.keyboard.press('Control+KeyV');
      await wait(ana, () => lpcClient.input.filter((m) => m.k !== 'm').slice(-5).map((m) => m.k + (m.c || '')).join() === 'kdControlLeft,clip,kdKeyV,kuKeyV,kuControlLeft', null, 'Ben’s Ctrl+V: his text first, then the V');
      assert.strictEqual(await ana.evaluate(() => lpcClient.input.find((m) => m.k === 'clip').text), 'hello from Ben');
      const note = () => ben.$eval('#helpSt', (e) => e.textContent);
      await ana.evaluate(() => lpcClient.emit('control-state', 'paused')); // Pause on Ana's red bar
      await wait(ben, () => lpc.toasts().at(-1) === 'Ana paused your control: your mouse and keys do nothing there until they press Resume.', null, 'Ben told it’s paused');
      assert.strictEqual(await note(), 'Ana paused your control: your mouse and keys do nothing there until they press Resume.');
      await ana.evaluate(() => lpcClient.emit('control-state', 'admin'));
      await wait(ben, () => document.getElementById('helpSt').textContent.startsWith('Ana’s window in front runs as administrator'), null, 'and that an admin window is in front');
      await ana.evaluate(() => lpcClient.emit('control-state', ''));
      await wait(ben, () => document.getElementById('helpSt').textContent === 'Click their screen to use your mouse and keys there.', null, 'and nothing in the way');
      await ben.waitForTimeout(500);
      assert(await ana.evaluate(() => lpcClient.input.every((m, i) => m.n === i + 1)), 'all of Ben’s, in his order');
      await ben.evaluate(() => {
        const n = lpc.ctlN(), go = (m) => lpc.helpSend({ t: 'in', ...m });
        go({ n: n + 2, k: 'ku', c: 'KeyQ' }); // before its down
        go({ n: n + 1, k: 'kd', c: 'KeyQ' });
        for (let i = n + 4; i <= n + 104; i++) go({ n: i, k: 'w', d: 120 }); // n + 3 never comes
      });
      await wait(ana, () => lpcClient.input.slice(-103).map((m) => m.k + (m.c || '')).join() === ['kdKeyQ', 'kuKeyQ', ...Array(101).fill('w')].join(), null, 'Ben’s order kept, and the lost one skipped');
      const stopped = await ana.evaluate(() => lpcClient.stopped);
      await ana.evaluate(() => lpcClient.emit('control-end', 'idle')); // 10 minutes without Ben's input (the red bar's Stop is the same, without 'idle')
      await wait(ben, () => document.getElementById('helpTile').hidden && lpc.toasts().includes('Ana: Control ended after 10 minutes without use.') && !document.fullscreenElement, null, 'ended on Ben’s side, out of full screen');
      await wait(ana, () => !lpc.help() && lpc.toasts().includes('Ben is no longer controlling your PC.'), null, 'and on Ana’s, her code gone');
      assert.strictEqual(await ana.evaluate(() => lpcClient.stopped), stopped + 1, 'Ana’s app stopped it');
      // Control in Friends, on the Voice page: Ana's page takes Ben's code by itself (she has Ben in her Friends)
      await ben.click('.nav[data-view="voice"]');
      await wait(ben, () => [...document.querySelectorAll('#frRows button')].some((b) => b.textContent === 'Control'), null, 'Control next to Ana in Ben’s Friends', 40000);
      await ben.evaluate(() => [...document.querySelectorAll('#frRows button')].find((b) => b.textContent === 'Control').click());
      await wait(ben, () => !document.querySelector('.view[data-view="help"]').hidden && document.getElementById('helpName').textContent === 'Ana’s PC', null, 'Ben on Remote help, asking Ana');
      await wait(ben, () => document.getElementById('helpStop').textContent === 'Stop control' && document.getElementById('helpVid').videoWidth > 0, null, 'Ben in control of Ana’s PC from Friends', 60000);
      await ben.click('#helpStop');
      await wait(ana, (n) => !lpc.help() && lpcClient.stopped === n && lpc.toasts().filter((t) => t === 'Ben is no longer controlling your PC.').length === 2, stopped + 2, 'Ben’s Stop ends it at Ana’s');
      for (const [c] of ps) await c.close();
      console.log('remote help: by Ana’s code, refused, taken back with Ana’s box open, a late yes undone, then allowed: Ana’s screen only after her yes, Cat kept out, Ben’s input in order and in full screen, pasted into, paused, ended after 10 idle minutes; then from Friends without a code, and Ben’s Stop');
    }
    console.log('ok');
  } finally {
    await browser.close();
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

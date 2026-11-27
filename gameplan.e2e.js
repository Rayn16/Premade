// Test of the Game plan (What's new 244) in site/index.html, in Chromium with a stand-in for the desktop app and a fake
// League client: the plan maker on 41 fixture games together (late games, first Dragon, Ali ahead at 15), a part with 7
// games one way left out, no plan under 20 games; the timeline reader filling lpc-plan in the background and never in
// champ select; the Pregame card once all 5 lock (under Squad comp's card); the loading screen's line; the switch.
//   NODE_PATH=/path/to/node_modules node gameplan.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const URL_ = 'http://127.0.0.1:8097/index.html?peer=127.0.0.1:9097&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]);
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true });
const cors = { 'access-control-allow-origin': '*' };
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': path.extname(file) === '.js' ? 'text/javascript' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8097, '127.0.0.1');

const CH = [['Ahri', 103, 'Mage', 'MIDDLE'], ['Thresh', 412, 'Support', 'UTILITY'], ['Darius', 122, 'Fighter', 'TOP'], ['Vi', 254, 'Fighter', 'JUNGLE'], ['Jinx', 222, 'Marksman', 'BOTTOM'], ['Zed', 238, 'Assassin', 'MIDDLE']];
const ID = Object.fromEntries(CH.map(([n, k]) => [n, k]));
const DDATA = Object.fromEntries(CH.map(([id, key, tags]) => [id, { id, key: String(key), name: id, tags: [tags], info: { attack: 5, magic: 5 }, stats: { attackrange: 125 } }]));
const SUM = { p: '16.23', c: Object.fromEntries(CH.map(([, k, , r]) => [k, { [r]: [100, 50] }])), old: null, today: 5, total: 999, at: 0 };

// 41 games together with Ali, newest first: past 30 min 9 of 13, under 25 min 4 of 11, 8 of 17 between; first Dragon
// 8 of 10 (13 of 31 without); Ali with the team's most gold at 15 in 15 games, 12 won (9 of 26 otherwise)
const H = 36e5, T = Date.now(), ME = 'rayan-puuid', ALI = 'ali-puuid';
const WON = (i) => i <= 8 || (i >= 13 && i <= 16) || (i >= 24 && i <= 31);
const FACT = (i, aliTop = [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 11, 12, 17]) => ({ w: +WON(i), s: i < 13 ? 1900 : i < 24 ? 1300 : 1650, d: i <= 7 || i === 9 || i === 10 ? 1 : 0, dt: 320, v: -1, h: -1, t: -1, b: -1, bt: 0, top: aliTop.includes(i) ? ALI : ME });
const N = 41, DUO = { u: ME, g: {} }, PLAN = { u: ME, g: {} };
for (let i = 0; i < N; i++) {
  DUO.g[String(9000 + i)] = { at: T - (i + 1) * H, q: 420, w: +WON(i), c: ID.Ahri, l: 'MIDDLE', m: [[ALI, ID.Thresh, 'UTILITY'], [`x${i}a`, ID.Darius, 'TOP'], [`x${i}b`, ID.Vi, 'JUNGLE'], [`x${i}c`, ID.Jinx, 'BOTTOM']] };
  if (i >= 2) PLAN.g[String(9000 + i)] = FACT(i); // the newest 2 left for the reader
}
// League's copy of a game and its timeline, for the reader: Rayan 1, Ali 2 (team 100), the rest 3-10
function game(id) {
  const i = id - 9000, ps = Array.from({ length: 10 }, (_, k) => k + 1);
  return { gameId: id, gameCreation: T - (i + 1) * H, gameDuration: FACT(i).s, queueId: 420, gameMode: 'CLASSIC',
    participants: ps.map((k) => ({ participantId: k, championId: [ID.Ahri, ID.Thresh, ID.Darius, ID.Vi, ID.Jinx][(k - 1) % 5], teamId: k <= 5 ? 100 : 200, stats: { win: k <= 5 ? WON(i) : !WON(i) }, timeline: { lane: 'NONE', role: 'NONE' } })),
    participantIdentities: ps.map((k) => ({ participantId: k, player: { puuid: k === 1 ? ME : k === 2 ? ALI : `x${i}-${k}`, gameName: `P${k}` } })) };
}
function timeline(id) {
  const f = FACT(id - 9000), gold = (k) => (k === (f.top === ALI ? 2 : 1) ? 6000 : 4000);
  return { frames: [{ timestamp: 0, participantFrames: {}, events: [] },
    { timestamp: 360000, participantFrames: {}, events: [{ type: 'ELITE_MONSTER_KILL', monsterType: 'DRAGON', killerId: f.d ? 1 : 6, killerTeamId: f.d ? 100 : 200, timestamp: f.dt * 1000 }] },
    { timestamp: 900000, participantFrames: Object.fromEntries(Array.from({ length: 10 }, (_, k) => [k + 1, { totalGold: gold(k + 1) }])), events: [] },
    { timestamp: f.s * 1000, participantFrames: {}, events: [] }] };
}

const L = { calls: [], refused: [], lobby: null, cs: null };
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p) {
  L.calls.push(p);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 200, profileIconId: 1 });
  if (p.startsWith('/lol-match-history/v1/products/lol/current-summoner/matches?')) return ok({ games: { games: [] } });
  let m = p.match(/^\/lol-match-history\/v1\/games\/(\d+)$/);
  if (m && DUO.g[m[1]]) return ok(game(+m[1]));
  m = p.match(/^\/lol-match-history\/v1\/game-timelines\/(\d+)$/);
  if (m && DUO.g[m[1]]) return ok(timeline(+m[1]));
  if (p === '/lol-chat/v1/friends') return ok([]);
  if (p === '/lol-lobby/v2/lobby') return L.lobby ? ok(L.lobby) : { status: 404, data: null };
  if (p === '/lol-gameflow/v1/session') return ok({ map: { id: 11 }, gameData: { gameId: 5, queue: { id: 420, isRanked: true, mapId: 11 } } });
  if (p === '/lol-champ-select/v1/session') return L.cs ? ok(L.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(CH.map((c) => c[1]));
  return { status: 404, data: null };
}
function fakeApp() {
  const on = {};
  window.lpcClient = { version: '1.57.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}`);
});

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: process.env.SHOTS ? 2 : 1 });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|communitydragon\.org|cdn\.jsdelivr\.net/, (r) => r.abort());
    await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
      const u = r.request().url();
      if (u.endsWith('versions.json')) return r.fulfill({ json: ['16.23.1'], headers: cors });
      if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
      if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
      const nm = decodeURIComponent(u.replace(/^.*\//, '').replace(/(_\d+)?\.(png|jpg)$/, '')), h = [...nm].reduce((t, c) => t + c.charCodeAt(0) * 37, 0) % 360;
      r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${h} 40% 34%)"/><text x="5" y="7.2" font-size="6" text-anchor="middle" fill="#fff" font-family="sans-serif">${nm[0]}</text></svg>` });
    });
    await ctx.route(/127\.0\.0\.1:9097\//, (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/riot/summary') return r.fulfill({ json: SUM, headers: cors });
      r.fulfill({ status: 404, json: {}, headers: cors });
    });
    await ctx.addInitScript((s) => {
      if (localStorage.getItem('lpc-setup')) return;
      localStorage.setItem('lpc-setup', '1');
      localStorage.setItem('lpc-name', 'Rayan');
      localStorage.setItem('lpc-news', '9999');
      localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, scout: false, clips: false }));
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    }, { 'lpc-duo': DUO, 'lpc-plan': PLAN, 'lpc-squad': [{ riot: 'Ali#EUW', u: ALI, ic: 1 }] });
    await ctx.addInitScript(fakeApp);
    await ctx.exposeFunction('fakeLcu', fakeLcu);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(URL_);
    await wait(page, () => window.lpc, null, 'the page');
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(page, () => lpc.lcu().me0 && document.querySelector('#optGamePlan'), null, 'League');

    // 1. the plan maker on the fixture games: 3 parts; Ali ahead in only 7 games: that part left out; 19 games: no plan
    const gs = (top) => Array.from({ length: N }, (_, i) => ({ ...FACT(i, top), m: [ME, ALI, `x${i}a`, `x${i}b`, `x${i}c`] }));
    const team = [{ u: ME, c: ID.Ahri }, { u: ALI, c: ID.Thresh }, { u: 'z1', c: ID.Darius }, { u: 'z2', c: ID.Vi }, { u: 'z3', c: ID.Jinx }];
    const brief = (p) => p && p.parts.map((x) => [x.b, x.sub, ...x.rows.map(([t, l]) => `${t} ${l.filter((g) => g.w).length} of ${l.length}`)]);
    assert.deepStrictEqual(brief(await page.evaluate(([g, t]) => lpc.plan(g, t), [gs(), team])), [
      ['You win late games', 'Play safe early, Baron after 25', 'Past 30 min 9 of 13', 'Under 25 min 4 of 11'],
      ['Fight for first Dragon', 'Group bot before 5:00', 'With it 8 of 10', 'Without it 13 of 31'],
      ['Play around Thresh', 'When Thresh has your most gold at 15', 'Thresh ahead 12 of 15', 'Not ahead 9 of 26']]);
    assert.deepStrictEqual(brief(await page.evaluate(([g, t]) => lpc.plan(g, t), [gs([0, 1, 2, 3, 4, 5, 6]), team])).map((x) => x[0]), ['You win late games', 'Fight for first Dragon'], '7 games one way: left out');
    assert.strictEqual(await page.evaluate(([g, t]) => lpc.plan(g.slice(0, 19), t), [gs(), team]), null, 'under 20 games: no plan');
    console.log('1: plan maker: late games, first Dragon, play around Thresh; 7 games one way left out; under 20 no plan');

    // 2. the reader: never in champ select; idle, it reads the newest 2 (League's copy, then the timeline) into lpc-plan
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'ChampSelect' }));
    L.calls.length = 0;
    await page.evaluate(() => lpc.crawlAll());
    assert(!L.calls.some((p) => /game-timelines|\/games\/9/.test(p)), 'nothing read in champ select');
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(page, () => lpc.lcu().me0, null, 'League again');
    await page.evaluate(() => lpc.crawlAll());
    const st = await page.evaluate(() => lpc.planStore());
    assert.strictEqual(Object.keys(st.g).length, N, 'all 41 in lpc-plan');
    assert.deepStrictEqual([st.g['9000'], st.g['9001']], [FACT(0), FACT(1)], 'the newest 2 read from their timelines');
    assert.deepStrictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-plan'))).g['9001'], FACT(1), 'kept');
    console.log('2: reader: nothing in champ select; idle it read the newest 2 from League’s timelines');

    // 3. champ select with Ali from the lobby: nothing until all 5 lock, then the plan under Squad comp's card
    L.lobby = { partyId: 'p1', gameConfig: { queueId: 420 }, localMember: { puuid: ME, isLeader: true }, members: [{ puuid: ME }, { puuid: ALI }], invitations: [] };
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    await page.waitForTimeout(1500); // the lobby read
    const seat = (cellId, puuid, pos, c) => ({ cellId, puuid, gameName: puuid, tagLine: 'EUW', assignedPosition: pos, championId: c, championPickIntent: 0 });
    const pick = (id, cell, c, done) => ({ id, actorCellId: cell, type: 'pick', championId: c, completed: done, isInProgress: !done });
    L.cs = { gameId: 5, localPlayerCellId: 2, timer: { adjustedTimeLeftInPhase: 30000, totalTimeInPhase: 30000, phase: 'BAN_PICK' }, benchEnabled: false, bans: { myTeamBans: [], theirTeamBans: [] },
      myTeam: [seat(0, 'z1', 'top', ID.Darius), seat(1, 'z2', 'jungle', ID.Vi), seat(2, ME, 'middle', ID.Ahri), seat(3, 'z3', 'bottom', ID.Jinx), seat(4, ALI, 'utility', ID.Thresh)],
      theirTeam: [5, 6, 7, 8, 9].map((c) => ({ cellId: c, championId: 0 })),
      actions: [[pick(1, 0, ID.Darius, true), pick(2, 1, ID.Vi, true), pick(3, 2, ID.Ahri, true), pick(4, 3, ID.Jinx, true), pick(5, 4, ID.Thresh, false)]] };
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'ChampSelect' }));
    await wait(page, () => !document.getElementById('csSq').hidden, null, 'Squad comp in champ select');
    await page.waitForTimeout(1200);
    assert(await page.isHidden('#csPlan'), 'no plan until all 5 lock');
    L.cs.actions = [[...L.cs.actions[0].slice(0, 4), pick(5, 4, ID.Thresh, true)]];
    await wait(page, () => !document.getElementById('csPlan').hidden, null, 'the game plan');
    const rows = await page.$$eval('#csPlan .gprow', (l) => l.map((r) => [r.querySelector('.gptext b').textContent, [...r.querySelectorAll('.gpn')].map((e) => e.textContent).join(', '), r.querySelectorAll('.blk i.w').length]));
    assert.deepStrictEqual(rows, [['You win late games', '9 of 13, 4 of 11', 13], ['Fight for first Dragon', '8 of 10, 13 of 31', 14], ['Play around Thresh', '12 of 15, 9 of 26', 17]]);
    assert.strictEqual(await page.textContent('#csPlan .gphead small'), 'From 41 games together');
    assert(await page.isHidden('#csPlan .gphead b'), 'one title: under Squad comp’s card');
    assert.strictEqual(await page.$eval('#csPlan', (e) => getComputedStyle(e).borderTopWidth), '0px', 'joined to Squad comp’s card');
    await page.$eval('#csSq', (e) => e.scrollIntoView());
    await shot(page, 'gameplan-champ-select');
    console.log('3: champ select: no plan until all 5 locked, then 3 rows under Squad comp’s card');

    // 4. the loading screen's line, from your team there
    const line = await page.evaluate(() => lpc.planLine([{ ally: true, me: true, champ: 103 }, { ally: true, puuid: 'ali-puuid', champ: 412 }, { ally: true, puuid: 'z1', champ: 122 }, { ally: true, puuid: 'z2', champ: 254 }, { ally: true, puuid: 'z3', champ: 222 }, { ally: false, puuid: 'e1', champ: 238 }]));
    assert.deepStrictEqual(line.map(([i, t, f]) => [i, t, /Thresh\.png$/.test(f)]), [['clock', 'You win late, Baron after 25', false], ['dragon', 'Fight for first Dragon', false], ['', 'Play around Thresh', true]]);
    console.log('4: loading screen line:', line.map((x) => x[1]).join(' · '));

    // 5. the switch off: no plan, no line, no reading
    await page.evaluate(() => { const c = document.getElementById('optGamePlan'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(page, () => document.getElementById('csPlan').hidden, null, 'the plan gone');
    assert.strictEqual(await page.evaluate(() => lpc.planLine([{ ally: true, me: true, champ: 103 }, { ally: true, puuid: 'ali-puuid', champ: 412 }])), null);
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    console.log('5: Game plan off: no card, no line');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log('Game plan tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

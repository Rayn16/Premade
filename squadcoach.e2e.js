// Test of the Squad coach (What's new 246) in site/index.html, in Chromium with a stand-in for the desktop app and a
// fake League client: the habit finder on fixture timelines (a gank with their jungler helping, two deaths 11 s apart
// not one, dying alone, dying before their objective, ults down from the fight check), the week's pick (7 of 10 losses
// and 2 of 14 wins give the gank goal; a habit with 2 losses left out; 9 games: no goal), the crawl reading last week's
// games and picking the goal, and the Squad page's panel with this week's blocks and the 3 worst moments cut as clips.
//   NODE_PATH=/path/to/node_modules node squadcoach.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const URL_ = 'http://127.0.0.1:8098/index.html?peer=127.0.0.1:9098&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]);
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const cors = { 'access-control-allow-origin': '*' };
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': path.extname(file) === '.js' ? 'text/javascript' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8098, '127.0.0.1');

const CH = [['Ahri', 103, 'Mage', 'MIDDLE'], ['Thresh', 412, 'Support', 'UTILITY'], ['Darius', 122, 'Fighter', 'TOP'], ['Vi', 254, 'Fighter', 'JUNGLE'], ['Jinx', 222, 'Marksman', 'BOTTOM'], ['Zed', 238, 'Assassin', 'MIDDLE']];
const ID = Object.fromEntries(CH.map(([n, k]) => [n, k]));
const DDATA = Object.fromEntries(CH.map(([id, key, tags]) => [id, { id, key: String(key), name: id, tags: [tags], info: { attack: 5, magic: 5 }, stats: { attackrange: 125 } }]));
const SUM = { p: '16.23', c: Object.fromEntries(CH.map(([, k, , r]) => [k, { [r]: [100, 50] }])), old: null, today: 5, total: 999, at: 0 };

// players: 1 you (Ahri, mid), 2 Ali (Thresh, support), 3 Darius top, 4 Vi jungle, 5 Jinx bot; 6-10 them: Darius top,
// Vi jungle (7), Zed mid, Jinx bot, Thresh support
const ME = 'rayan-puuid', ALI = 'ali-puuid', LANE = { TOP: { lane: 'TOP' }, JUNGLE: { lane: 'JUNGLE' }, MIDDLE: { lane: 'MIDDLE' }, BOTTOM: { lane: 'BOTTOM', role: 'DUO_CARRY' }, UTILITY: { lane: 'BOTTOM', role: 'DUO_SUPPORT' } };
const CHAMPS = [ID.Ahri, ID.Thresh, ID.Darius, ID.Vi, ID.Jinx, ID.Darius, ID.Vi, ID.Zed, ID.Jinx, ID.Thresh];
const PS = CHAMPS.map((c, k) => ({ id: k + 1, u: k === 0 ? ME : k === 1 ? ALI : `p${k + 1}`, c, t: k < 5 ? 100 : 200, l: ['MIDDLE', 'UTILITY', 'TOP', 'JUNGLE', 'BOTTOM', 'TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][k], w: false }));
const kill = (s, victimId, killerId, assist = [], x = 7000, y = 7000) => ({ type: 'CHAMPION_KILL', timestamp: s * 1000, victimId, killerId, assistingParticipantIds: assist, position: { x, y } });
const mon = (s, monsterType, killerTeamId) => ({ type: 'ELITE_MONSTER_KILL', timestamp: s * 1000, monsterType, killerTeamId, killerId: killerTeamId === 100 ? 4 : 7 });
const tlOf = (events) => ({ frames: [{ timestamp: 0, participantFrames: {}, events: [] }, { timestamp: 900000, participantFrames: {}, events }, { timestamp: 1800000, participantFrames: {}, events: [] }] });

// the weeks, from this Monday 00:00 (the page's time zone is this machine's)
const now = new Date(), MON = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime(), H = 36e5, LAST = MON - 7 * 24 * H;
// last week, 24 games together with Ali, oldest first: losses 0-9, wins 10-23. Gank: losses 0-6, wins 10-11. Alone: losses
// 0 and 1 only. Before their objective: losses 7-9, wins 12-16. Games 0 and 1 are read from League's timelines.
const DUO = { u: ME, g: {} }, PLAN = { u: ME, g: {} }, COACH = { u: ME, g: {}, ult: {}, cur: null, prev: null }, AT = {};
const gank = (n, me) => [600, n, me ? [0, ID.Thresh] : [ID.Thresh, ID.Jinx], ID.Vi, me ? 1 : 0, 6];
for (let i = 0; i < 24; i++) {
  const id = String(8000 + i), w = i >= 10;
  AT[i] = LAST + (i + 1) * 5 * H;
  DUO.g[id] = { at: AT[i], q: 420, w: +w, c: ID.Ahri, l: 'MIDDLE', m: [[ALI, ID.Thresh, 'UTILITY'], ['p3', ID.Darius, 'TOP'], ['p4', ID.Vi, 'JUNGLE'], ['p5', ID.Jinx, 'BOTTOM']] };
  PLAN.g[id] = { w: +w, s: 1800, d: -1, dt: 0, v: -1, h: -1, t: -1, b: -1, bt: 0, top: ME };
  if (i < 2) continue;
  COACH.g[id] = { g: i === 3 ? [[600, 3, [0, ID.Thresh, ID.Jinx], ID.Vi, 1, 8]] : i <= 6 || i === 10 || i === 11 ? [gank(2, i !== 5)] : [], a: [], o: (i >= 7 && i <= 9) || (i >= 12 && i <= 16) ? [[1500, 1, [ID.Jinx], 'Dragon', 0, 0]] : [] };
}
// this week, 3 games together: a gank in the first (lost), none in the next 2 (won)
for (let j = 0; j < 3; j++) {
  const id = String(8100 + j);
  DUO.g[id] = { at: MON + (j + 1) * 2 * H, q: 420, w: +(j > 0), c: ID.Ahri, l: 'MIDDLE', m: [[ALI, ID.Thresh, 'UTILITY']] };
  PLAN.g[id] = { w: +(j > 0), s: 1800, d: -1, dt: 0, v: -1, h: -1, t: -1, b: -1, bt: 0, top: ME };
  COACH.g[id] = { g: j ? [] : [gank(2, true)], a: [], o: [] };
}
// League's copy and timeline of games 0 and 1: 0 a gank on you and Ali at 5:00 (their Vi helping) and Jinx alone at
// 21:40; 1 a gank on Ali and Jinx at 6:40 (Vi the killer, you not in it) and Darius alone at 20:50
const TL = { 8000: [kill(300, 1, 6, [7]), kill(305, 2, 7), kill(1300, 5, 8)], 8001: [kill(400, 2, 7), kill(404, 5, 7, [8]), kill(1250, 3, 9)] };
const game = (id) => ({ gameId: id, gameCreation: DUO.g[id].at, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
  participants: CHAMPS.map((c, k) => ({ participantId: k + 1, championId: c, teamId: k < 5 ? 100 : 200, stats: { win: k < 5 ? !!DUO.g[id].w : !DUO.g[id].w }, timeline: LANE[PS[k].l] })),
  participantIdentities: CHAMPS.map((c, k) => ({ participantId: k + 1, player: { puuid: k === 0 ? ME : k === 1 ? ALI : `p${k + 1}`, gameName: `P${k + 1}` } })) });

const L = { calls: [], refused: [] };
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p) {
  L.calls.push(p);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 200, profileIconId: 1 });
  if (p.startsWith('/lol-match-history/v1/products/lol/current-summoner/matches?')) return ok({ games: { games: [] } });
  let m = p.match(/^\/lol-match-history\/v1\/games\/(\d+)$/);
  if (m && TL[m[1]]) return ok(game(m[1]));
  m = p.match(/^\/lol-match-history\/v1\/game-timelines\/(\d+)$/);
  if (m && TL[m[1]]) return ok(tlOf(TL[m[1]]));
  if (p === '/lol-chat/v1/friends') return ok([]);
  if (p === '/lol-gameflow/v1/session') return ok({ map: { id: 11 }, gameData: { gameId: 5, queue: { id: 420, isRanked: true, mapId: 11 } } });
  return { status: 404, data: null };
}
// match videos of games 0, 3 and 4 (named by their start, 40 s after the game's), cut by the app's clipEdit
const pad = (n) => String(n).padStart(2, '0'), vname = (t) => { const d = new Date(t + 40000); return `Game ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())} Ahri.webm`; };
const VIDS = [0, 3, 4].map((i) => ({ name: vname(AT[i]), at: AT[i], size: 2e9 }));
function fakeApp(vids) {
  const on = {};
  window.cuts = [];
  window.lpcClient = { version: '1.57.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b),
    gameVideo: async (what) => (what === 'list' ? vids : false), media: (kind, name) => `/nothing/${encodeURIComponent(name)}`,
    clipEdit: async (kind, name, from, to) => { window.cuts.push([kind, name, from, to]); return name.replace('.webm', ' cut.mp4'); } };
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
    await ctx.route(/127\.0\.0\.1:9098\//, (r) => {
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
    }, { 'lpc-duo': DUO, 'lpc-plan': PLAN, 'lpc-coach': COACH, 'lpc-squad': [{ riot: 'Ali#EUW', u: ALI, ic: 1 }] });
    await ctx.addInitScript(fakeApp, VIDS);
    await ctx.exposeFunction('fakeLcu', fakeLcu);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(URL_);
    await wait(page, () => window.lpc, null, 'the page');
    assert.strictEqual(await page.evaluate(() => lpc.monOf(Date.now())), MON, 'this Monday, the same time zone');
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'ChampSelect' })); // no crawl yet
    await wait(page, () => lpc.lcu().me0 && document.querySelector('#optSquadCoach'), null, 'League');

    // 1. the habit finder on timelines
    const facts = (ev, id = 1) => page.evaluate(([d, tl, id]) => lpc.coachFacts(d, tl, id), [{ me: 0, ps: PS }, tlOf(ev), id]);
    let f = await facts([kill(300, 1, 6, [7]), kill(305, 2, 6)]);
    assert.deepStrictEqual(f.g, [[300, 2, [0, ID.Thresh], ID.Vi, 1, 5]], 'their jungler helping: a gank');
    f = await facts([kill(300, 1, 7), kill(311, 2, 7)]);
    assert.deepStrictEqual(f.g, [], 'two deaths 11 s apart: no gank');
    f = await facts([kill(900, 1, 7), kill(905, 2, 7)]);
    assert.deepStrictEqual(f.g, [], 'after 14:00: no gank');
    f = await facts([kill(1300, 3, 8), kill(1400, 4, 8), kill(1405, 8, 4, [], 7500, 7000), kill(1600, 5, 9), kill(1610, 9, 2, [], 12000, 12000)]);
    assert.deepStrictEqual(f.a, [[1300, 1, [ID.Darius], ID.Zed, 0, 0], [1600, 1, [ID.Jinx], ID.Jinx, 0, 0]], 'alone: nothing within 15 s and 2,000 units');
    f = await facts([kill(1500, 4, 8), mon(1540, 'DRAGON', 200), kill(1600, 1, 8), mon(1700, 'BARON_NASHOR', 100)]);
    assert.deepStrictEqual(f.o, [[1500, 1, [ID.Vi], 'Dragon', 0, 0]], 'a death in the minute before their Dragon, not before yours');
    assert.strictEqual(f.u, undefined, 'no fight check: no ults');
    await page.evaluate(() => { lpc.coachStore().ult['77'] = [['Dragon', 2, 1440], ['Baron', 1, 1580], ['Dragon', 4, 1900]]; });
    f = await facts([mon(1540, 'DRAGON', 200), mon(1700, 'BARON_NASHOR', 100), mon(2000, 'DRAGON', 200)], 77);
    assert.deepStrictEqual(f.u, [[1500, 2, [], 'Dragon', 0, 0]], 'ults down: theirs after 2 up; Baron was yours; 4 up is fine');
    console.log('1: habit finder: gank with their jungler helping, not 11 s apart, alone, before their objective, ults down');

    // 2. the week's pick from the store (the 22 games read so far + 2 more as the reader would)
    await page.evaluate((x) => Object.assign(lpc.coachStore().g, x), { 8000: { g: [gank(2, true)], a: [[1300, 1, [ID.Jinx], ID.Zed, 0, 0]], o: [] }, 8001: { g: [gank(2, false)], a: [[1250, 1, [ID.Darius], ID.Jinx, 0, 0]], o: [] } });
    const wk = await page.evaluate(([a, b]) => lpc.coachWeek(a, b), [LAST, MON]);
    assert.deepStrictEqual([wk.n, wk.h, wk.s.g, wk.s.a, wk.s.o, wk.wr], [24, 'g', [7, 10, 2, 14], [2, 10, 0, 14], [3, 10, 5, 14], [14, 24]], 'gank in 7 of 10 losses and 2 of 14 wins; alone with 2 losses left out');
    const nine = await page.evaluate(([a, b]) => lpc.coachWeek(a, b), [LAST, AT[8] + 1]);
    assert.deepStrictEqual([nine.n, nine.h], [9, ''], '9 games together: no goal');
    await page.evaluate(() => { const s = lpc.coachStore(); delete s.g['8000']; delete s.g['8001']; delete s.ult['77']; });
    console.log('2: week pick: gank (7 of 10 losses, 2 of 14 wins); alone (2 losses) left out; 9 games no goal');

    // 3. idle, the reader reads games 0 and 1 from League's timelines, then picks the goal and cuts the 3 clips
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(page, () => lpc.lcu().me0, null, 'League again');
    await page.evaluate(() => lpc.crawlAll());
    const st = await page.evaluate(() => lpc.coachStore());
    assert.deepStrictEqual(st.g['8000'], { g: [[300, 2, [0, ID.Thresh], ID.Vi, 1, 5]], a: [[1300, 1, [ID.Jinx], ID.Zed, 0, 0]], o: [] }, 'game 0 read');
    assert.deepStrictEqual(st.g['8001'].g, [[400, 2, [ID.Thresh, ID.Jinx], ID.Vi, 0, 4]], 'game 1 read: you not in it');
    await wait(page, () => lpc.coachStore().cur && lpc.coachStore().cur.cf === 'g', null, 'the goal and its clips');
    const cur = await page.evaluate(() => lpc.coachStore().cur);
    assert.deepStrictEqual([cur.k, cur.h, cur.n, cur.s.g], [MON, 'g', 24, [7, 10, 2, 14]]);
    const cuts = await page.evaluate(() => window.cuts);
    assert.deepStrictEqual(cuts, [['game', VIDS[1].name, 590, 613], ['game', VIDS[0].name, 290, 310], ['game', VIDS[2].name, 590, 611]], 'most deaths first, then oldest; game 2 has no video, game 5 wasn’t yours');
    assert.deepStrictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-coach'))).cur.clips.length, 3, 'kept');
    console.log('3: reader read 2 games, goal picked Monday from 24 games, 3 clips cut:', cuts.map((c) => `${c[2]}-${c[3]} s`).join(', '));

    // 4. the Squad page: the goal, last week, this week's blocks, the 3 worst moments
    if (!(await page.isVisible('.nav[data-view="squad"]'))) await page.click('#leagueNav');
    await page.click('.nav[data-view="squad"]');
    await wait(page, () => !document.getElementById('sqCoachBox').hidden, null, 'Squad goal this week');
    const panel = await page.evaluate(() => ({ goal: document.querySelector('#sqCoach .cgoal b').textContent, last: document.querySelector('#sqCoach .cgoal small').textContent,
      blocks: [...document.querySelectorAll('#sqCoach .cblk i')].map((i) => (i.className === 'w' ? 'kept' : 'missed')), week: document.querySelector('#sqCoach .cweek .gpn').textContent,
      clips: [...document.querySelectorAll('#sqCoach .cclip')].map((c) => [c.querySelector('.ctime').textContent, c.querySelector('b').textContent, c.querySelector('small').textContent.replace(/^\w+ · /, '')]) }));
    assert.deepStrictEqual(panel, { goal: 'No two of us die to one gank before 14:00', last: 'Last week: in 7 of 10 losses, and 2 of 14 wins', blocks: ['missed', 'kept', 'kept'], week: 'Kept in 2 of 3 games, and you won 2 of those 2',
      clips: [['10:00', 'You, Thresh and Jinx, to their Vi', '3 deaths in 8 s'], ['5:00', 'You and Thresh, to their Vi', '2 deaths in 5 s'], ['10:00', 'You and Thresh, to their Vi', '2 deaths in 6 s']] });
    assert.strictEqual(await page.evaluate(() => document.querySelector('#sqCoachBox').compareDocumentPosition(document.querySelector('#sqBestBox')) & Node.DOCUMENT_POSITION_FOLLOWING), Node_FOLLOWING(), 'at the top');
    if (process.env.SHOTS) await page.locator('#sqCoachBox').screenshot({ path: path.join(process.env.SHOTS, 'squadcoach-panel.png') });
    console.log('4: Squad page: goal, 7 of 10 losses, blocks missed/kept/kept, 3 clip cards');

    // 6. step 2 (What's new 247): the loading screen's words, the report's row, the squad's one goal, Monday's result
    const rows = (mate) => [{ ally: true, me: true, champ: ID.Ahri }, { ally: true, puuid: mate, champ: ID.Thresh }, { ally: false, puuid: ALI, champ: ID.Zed }];
    assert.strictEqual(await page.evaluate((r) => lpc.coachGoal(r), rows(ALI)), 'no two of us die to one gank before 14:00');
    assert.strictEqual(await page.evaluate((r) => lpc.coachGoal(r), rows('p2')), null, 'no squad friend on your team: no words');
    const rp = { id: 8200, at: Date.now() - 60000, mode: 'CLASSIC', me: 0, len: 1800, players: PS.map((p) => ({ pid: p.id, puuid: p.u, team: p.t, win: p.t === 200, champ: p.c, l: p.l })) };
    const report = (tl) => page.evaluate(([r, t]) => { const d = document.createElement('div'); d.id = 'cTry'; d.style.cssText = 'position:fixed;left:380px;top:20px;width:620px;padding:16px;background:var(--panel);z-index:99'; d.innerHTML = lpc.coachReport(r, t);
      document.body.append(d); const o = [...d.querySelectorAll('.gprow')].map((x) => [x.querySelector('.gptext b').textContent, x.querySelector('.gptext small').textContent, x.querySelector('.gppill').textContent]); return [o, d.querySelector(".crep .gpn").textContent]; }, [rp, tl]);
    const [row, weekLine] = await report(tlOf([kill(492, 1, 6, [7]), kill(495, 2, 7)]));
    assert.deepStrictEqual(row, [['Squad goal: no two of us die to one gank before 14:00', 'You and Thresh died to their Vi at 8:12', 'Missed']]);
    assert.strictEqual(weekLine, 'This week: kept in 2 of 3 games together', 'this week’s blocks (the game isn’t in your history yet)');
    if (process.env.SHOTS) await page.locator('#cTry').screenshot({ path: path.join(process.env.SHOTS, 'squadcoach-report.png') });
    await page.evaluate(() => document.getElementById('cTry').remove());
    rp.id = 8201;
    assert.deepStrictEqual((await report(tlOf([kill(492, 1, 6)])))[0], [['Squad goal: no two of us die to one gank before 14:00', 'No two of you died to one gank before 14:00', 'Done']]);
    await page.evaluate(() => document.getElementById('cTry').remove());
    rp.at = MON - 60000;
    assert.strictEqual(await page.evaluate(([r, t]) => lpc.coachReport(r, t), [rp, tlOf([])]), null, 'a game from last week: no row');
    // a friend's goal picked from fewer games: ours stays (sent again); from more: theirs (alone, clips cut again)
    await page.evaluate((k) => lpc.coachHeard({ h: 'a', k, n: 20 }, 'zz'), MON);
    assert.deepStrictEqual(await page.evaluate(() => [lpc.coachStore().cur.h, lpc.coachStore().cur.sh]), ['g', 1]);
    await page.evaluate((k) => lpc.coachHeard({ h: 'o', k: k - 7 * 864e5, n: 40 }, 'aa'), MON);
    assert.strictEqual(await page.evaluate(() => lpc.coachStore().cur.h), 'g', 'last week’s goal: not taken');
    await page.evaluate(() => { window.cuts = []; });
    await page.evaluate((k) => lpc.coachHeard({ h: 'a', k, n: 24 }, 'aa'), MON);
    assert.deepStrictEqual(await page.evaluate(() => [lpc.coachStore().cur.h, lpc.coachStore().cur.from]), ['a', 24], 'a tie: the lower player id');
    await wait(page, () => lpc.coachStore().cur.cf === 'a', null, 'clips for the new goal');
    assert.strictEqual(await page.textContent('#sqCoach .cpick'), 'Picked Monday from 24 games together · your squad’s Premade has the same one');
    assert.strictEqual(await page.textContent('#sqCoach .cgoal b'), 'Nobody dies alone after 20:00');
    // Monday: last week's goal against the week before (the goal picked a week ago from 10 games)
    await page.evaluate(([k, s]) => { const c = lpc.coachStore(); c.cur = { k: k - 7 * 864e5, n: 10, h: 'g', s, wr: [4, 10], cf: 'g', clips: [] }; lpc.coachPick(); }, [MON, { g: [7, 6, 0, 4], a: [0, 6, 0, 4], o: [0, 6, 0, 4], u: [0, 0, 0, 0] }]);
    const prev = await page.evaluate(() => lpc.coachStore().prev);
    assert.deepStrictEqual(prev, { k: MON, h: 'g', b: [7, 6, 0, 4], a: [7, 10, 2, 14], wr: [4, 10], wr2: [14, 24] });
    await page.evaluate(([k]) => { const c = lpc.coachStore(); c.prev.b = [7, 10, 0, 10]; c.prev.a = [3, 10, 2, 14]; }, [MON]);
    await page.evaluate(() => { const g = lpc.coachStore().g; for (const id of ['8100', '8101', '8102']) delete g[id]; }); // no game together yet this week: shown as on Monday
    await page.click('.nav[data-view="pregame"]');
    await page.click('.nav[data-view="squad"]');
    await wait(page, () => document.querySelector('#sqCoach .cres'), null, 'Monday’s result');
    const res = await page.evaluate(() => [...document.querySelectorAll('#sqCoach .cres .gpsq small, #sqCoach .cres .cwr, #sqCoach .cres .gppill')].map((e) => e.textContent));
    assert.deepStrictEqual(res, ['Better', 'The week before: in 7 of 10 losses', 'Last week: in 3 of 10 losses', 'You won 58% of your games together (was 40%): +18 points']);
    if (process.env.SHOTS) await page.locator('#sqCoachBox').screenshot({ path: path.join(process.env.SHOTS, 'squadcoach-monday.png') });
    console.log('6: step 2: loading screen words, report Missed/Done, a friend’s goal from more games (tie: lower id), Monday result Better +18');

    // 5. the switch off: no panel, nothing read for it
    await page.evaluate(() => { const c = document.getElementById('optSquadCoach'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(page, () => document.getElementById('sqCoachBox').hidden, null, 'the panel gone');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    console.log('5: Squad coach off: no panel');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log('Squad coach tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
function Node_FOLLOWING() { return 4; }

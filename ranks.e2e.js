// Test of champ select and ranks in site/index.html, in headless Chromium, with a stand-in for the desktop app and a fake
// League client behind it: your hidden MMR on Profile from the ranks in your last Solo/Duo games and the LP you win and
// lose, your place on the ladder from our server's count (faked here); in champ select, the avoid list (a teammate on it
// flagged with a popup, Avoid on another, the list in Pregame settings, a Riot ID added there), the hovered champion
// locked in when time is almost up, and Dodge (twice to be sure, a note on an app without it, none in a custom game); on
// the loading screen, each team's average rank and which is favored on the Game page and the overlay, an enemy on the
// avoid list flagged there; and only calls the desktop app lets through (client/main.js LCU_OK).
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node ranks.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8087/index.html?peer=127.0.0.1:9007&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true });

PeerServer({ host: '127.0.0.1', port: 9007, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8087, '127.0.0.1');

// ---- Data Dragon's champions
const CHAMPS = [['Ahri', 103], ['Garen', 86], ['LeeSin', 64], ['Thresh', 412], ['Jinx', 222], ['Darius', 122], ['Zed', 238], ['Vi', 254], ['Caitlyn', 51], ['Sona', 37]];
const DDATA = Object.fromEntries(CHAMPS.map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ---- the fake League client. You're Rayan, Silver II 40 LP; the other nine in your last four Solo/Duo games are Gold I
// 50 LP. In the game you load into, your four teammates are Gold II 50 LP and the other team Silver I 50 LP.
const ME = 'me-puuid';
const RANK = (tier, division, leaguePoints) => ({ tier, division, leaguePoints, wins: 20, losses: 20 });
const rankOf = (u) => (u === ME ? RANK('SILVER', 'II', 40) : /^ally/.test(u) ? RANK('GOLD', 'II', 50) : /^enemy/.test(u) ? RANK('SILVER', 'I', 50) : RANK('GOLD', 'I', 50));
const GAMES = [9101, 9102, 9103, 9104];
const game = (id, all) => ({ gameId: id, platformId: 'EUW1', gameCreation: Date.now() - (id - 9100) * 3600e3, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
  participants: (all ? [...Array(10).keys()] : [0]).map((i) => ({ participantId: i + 1, teamId: i < 5 ? 100 : 200, championId: CHAMPS[i][1], stats: { win: i < 5, kills: 5, deaths: 3, assists: 7, goldEarned: 10000 } })),
  participantIdentities: (all ? [...Array(10).keys()] : [0]).map((i) => ({ participantId: i + 1, player: i ? { puuid: `m${id}-${i}`, gameName: `P${i}`, tagLine: 'EUW' } : { puuid: ME, gameName: 'Rayan', tagLine: 'EUW' } })) });
const TEAM1 = [[ME, 'Rayan', 103, 'MIDDLE'], ['ally1', 'Friend', 86, 'TOP'], ['ally3', 'Toxic', 64, 'JUNGLE'], ['ally4', 'Hooks', 412, 'UTILITY'], ['ally5', 'Shooter', 222, 'BOTTOM']];
const TEAM2 = [['enemy1', 'Axe', 122, 'TOP'], ['enemy2', 'Bully', 238, 'MIDDLE'], ['enemy3', 'Punch', 254, 'JUNGLE'], ['enemy4', 'Sniper', 51, 'BOTTOM'], ['enemy5', 'Singer', 37, 'UTILITY']];
const L = { phase: 'None', cs: null, calls: [], refused: [], oldApp: false };
const ok = (data) => ({ status: 200, data });
function champSelect() {
  const cell = (cellId, puuid, gameName, pos) => ({ cellId, puuid, gameName, tagLine: gameName ? 'EUW' : '', nameVisibilityType: gameName ? 'VISIBLE' : 'HIDDEN', assignedPosition: pos, championId: 0, championPickIntent: 0 });
  L.cs = { gameId: 77, localPlayerCellId: 2, isCustomGame: false, timer: { phase: 'BAN_PICK', adjustedTimeLeftInPhase: 20000 },
    myTeam: [cell(0, 'ally1', 'Friend', 'top'), cell(1, 'hidden1', '', 'jungle'), cell(2, ME, 'Rayan', 'middle'), cell(3, 'ally3', 'Toxic', 'bottom'), cell(4, 'ally4', 'Hooks', 'utility')],
    theirTeam: [5, 6, 7, 8, 9].map((cellId) => ({ cellId, championId: 0 })),
    actions: [[{ id: 8, actorCellId: 2, type: 'pick', completed: false, isInProgress: true, championId: 103 }]], trades: [], positionSwaps: [], pickOrderSwaps: [] };
}
function fakeLcu(method, p) {
  L.calls.push(`${method} ${p}`);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  let m;
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 300, profileIconId: 1 });
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: { RANKED_SOLO_5x5: rankOf(ME) } });
  if ((m = /^\/lol-ranked\/v1\/ranked-stats\/(.+)$/.exec(p))) return ok({ queueMap: { RANKED_SOLO_5x5: rankOf(m[1]) } });
  if ((m = /^\/lol-match-history\/v1\/products\/lol\/([\w-]+)\/matches\?begIndex=(\d+)&endIndex=(\d+)$/.exec(p))) return ok({ games: { games: m[1] === 'current-summoner' && +m[2] === 0 ? GAMES.map((id) => game(id)) : [] } });
  if ((m = /^\/lol-match-history\/v1\/games\/(\d+)$/.exec(p))) return GAMES.includes(+m[1]) ? ok(game(+m[1], true)) : { status: 404, data: null };
  if (p === '/lol-gameflow/v1/session') return ok({ map: { id: 11 }, gameData: { gameId: L.phase === 'ChampSelect' ? 77 : 88, queue: { id: 420, isRanked: true, mapId: 11 },
    teamOne: TEAM1.map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition })),
    teamTwo: TEAM2.map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition })) } });
  if (p === '/lol-champ-select/v1/session') return L.cs && L.phase === 'ChampSelect' ? ok(L.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(CHAMPS.map((c) => c[1]));
  if ((m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)\/complete$/.exec(p))) { Object.assign(L.cs.actions[0][0], { completed: true, isInProgress: false }); L.cs.myTeam[2].championId = 103; return { status: 204, data: null }; }
  if (p === '/lol-lobby-team-builder/champ-select/v1/session/quit') return L.oldApp ? { status: 0, data: null } : { status: 204, data: null }; // an older app doesn't let it through
  if ((m = /alias\/lookup\?gameName=([^&]*)&tagLine=(.*)$/.exec(p))) return decodeURIComponent(m[1]).toLowerCase() === 'grumpy' && m[2].toLowerCase() === 'euw' ? ok({ puuid: 'grumpy1', gameName: 'Grumpy', tagLine: 'EUW' }) : { status: 404, data: null };
  if ((m = /^\/lol-summoner\/v2\/summoners\/puuid\/([\w-]+)$/.exec(p))) return ok({ puuid: m[1], summonerLevel: 100 });
  return { status: 404, data: null };
}
function fakeApp() { // the desktop app 1.13 (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.lpcClient = { version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, front() {},
    overlay(s) { this.lastOverlay = s; },
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}

// our server's count of Europe West's ladder: 100 players from Master up (all 0-9 LP) and 1,000 in each division below
const PLACES = { p: 'euw1', at: Math.round(Date.now() / 1000), lp: [100], d: Object.fromEntries(['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'].flatMap((t) => ['I', 'II', 'III', 'IV'].map((d) => [`${t} ${d}`, 1000]))) };
const asked = [];

async function context(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/127\.0\.0\.1:9007\/(riot|stats)/, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/riot/places') { asked.push(u.search); return r.fulfill(u.searchParams.get('p') === 'euw1' ? { json: PLACES, headers: cors } : { status: 200, json: {}, headers: cors }); }
    r.fulfill({ status: 404, json: {}, headers: cors });
  });
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.route(/communitydragon\.org/, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.addInitScript(() => {
    if (localStorage.getItem('lpc-setup')) return;
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', 'Rayan');
    localStorage.setItem('lpc-news', '9999'); // no What's new
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, gameView: true, autoLock: true }));
    localStorage.setItem('lpc-avoid', JSON.stringify([{ n: 'Toxic#EUW', u: '', at: Date.now() - 864e5 }, { n: 'Bully#EUW', u: '', at: Date.now() - 2 * 864e5 }]));
    const at = Date.now() - 864e5; // 4 wins and 4 losses in Solo/Duo: +28 and −16 LP
    localStorage.setItem('lpc-lp', JSON.stringify([...Array(8).keys()].map((i) => ({ id: 5000 + i, at: at + i * 3600e3, q: 'RANKED_SOLO_5x5', tier: 'SILVER', div: 'II', lp: 40, delta: i % 2 ? -16 : 28, win: !(i % 2) }))));
  });
  await ctx.addInitScript(fakeApp);
  await ctx.exposeFunction('fakeLcu', fakeLcu);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(URL_);
  await wait(page, () => window.lpc, null, 'the page');
  return [ctx, page];
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; page ${JSON.stringify(await page.evaluate(() => document.querySelector('main > .view:not([hidden])').innerText.slice(0, 800)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).textContent();
const league = (page, phase) => page.evaluate((ph) => lpcClient.emit('league', { inGame: false, phase: ph }), phase);
const row = (page, name) => page.locator('#csRows tr', { hasText: name });
const calls = (re) => L.calls.filter((c) => re.test(c));

(async () => {
  const browser = await chromium.launch();
  try {
    const [ctx, page] = await context(browser);
    // ---- Profile: your hidden MMR and your place on the ladder
    await league(page, 'None');
    await wait(page, () => lpc.hist() && lpc.hist().length === 4, null, 'your Solo/Duo games');
    await page.evaluate(() => lpc.crawlAll());
    assert.deepStrictEqual(await page.evaluate(() => [9101, 9102, 9103, 9104].map((id) => lpc.deep()[id].lb)), [1550, 1550, 1550, 1550], 'each game’s average rank: Gold I 50 LP');
    assert.strictEqual(calls(/ranked-stats\/m9101-/).length, 9, 'the other nine asked once each');
    await page.click('#leagueNav'); await page.click('.nav[data-view="profile"]');
    const solo = page.locator('#proRanks .rank', { hasText: 'Solo/Duo' });
    await wait(page, () => /Your games are around/.test(document.getElementById('proRanks').textContent) && /Top/.test(document.getElementById('proRanks').textContent), null, 'the MMR and ladder lines');
    assert.strictEqual(await solo.locator('.mmr').textContent(), 'Your games are around Gold I while you’re Silver II, so you should climb fast. You win about 28 LP and lose about 16, so your hidden MMR is above your rank.');
    // 100 from Master up, 17 divisions from Diamond I to Silver I, and 60% of Silver II's 1,000 above Silver II 40 LP: #17,701 of 28,100
    assert.match(await solo.textContent(), /Top 63% of EUW · about #17,701/);
    assert.strictEqual(asked.length, 1, 'the ladder count asked once');
    assert.strictEqual(await page.locator('#proRanks .rank', { hasText: 'Flex' }).locator('.mmr').count(), 0, 'Solo/Duo only');
    await shot(page, 'profile-mmr-ladder');
    console.log('Profile: hidden MMR from the ranks in your last Solo/Duo games and your LP, and your place on the ladder');

    // ---- champ select: the avoid list, lock in for you, Dodge
    champSelect();
    L.phase = 'ChampSelect';
    await league(page, 'ChampSelect');
    await wait(page, () => !document.getElementById('csBox').hidden && document.querySelectorAll('#csRows tr').length === 5, null, 'champ select');
    await wait(page, () => lpc.toasts().includes('Toxic is on your avoid list, on your team. Dodge is on Pregame.'), null, 'the popup for Toxic');
    assert.match(await row(page, 'Toxic#EUW').textContent(), /On your avoid list/);
    assert.strictEqual(await row(page, 'Toxic#EUW').locator('button.avoid').textContent(), 'Avoided');
    assert.strictEqual(await row(page, 'Name hidden by Riot').locator('button.avoid').count(), 0, 'nothing to avoid for a name Riot hides');
    assert.strictEqual(await row(page, 'Rayan#EUW').locator('button.avoid').count(), 0, 'not you');
    await row(page, 'Friend#EUW').locator('button.avoid').click();
    await wait(page, () => /On your avoid list/.test([...document.querySelectorAll('#csRows tr')].find((tr) => /Friend#EUW/.test(tr.textContent)).textContent), null, 'Friend flagged');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-avoid')).map((e) => [e.n, e.u])), [['Toxic#EUW', ''], ['Bully#EUW', ''], ['Friend#EUW', 'ally1']]);
    await page.waitForTimeout(1500);
    assert(!(await page.evaluate(() => lpc.toasts().some((t) => /^Friend is on/.test(t)))), 'no popup for someone you just added');
    // the list in Pregame settings: Friend taken off, a Riot ID added
    await page.click('#preSet summary');
    assert.deepStrictEqual(await page.$$eval('#avoidList li b', (l) => l.map((e) => e.textContent)), ['Toxic#EUW', 'Bully#EUW', 'Friend#EUW']);
    await page.locator('#avoidList li', { hasText: 'Friend#EUW' }).getByRole('button', { name: 'Take Friend#EUW off your avoid list' }).click();
    await page.fill('#avoidId', 'Nobody');
    await page.click('#avoidForm button');
    assert.strictEqual(await text(page, '#avoidNote'), 'Type a Riot ID with its tag, like Name#EUW.');
    await page.fill('#avoidId', 'Nobody#EUW');
    await page.click('#avoidForm button');
    await wait(page, () => document.getElementById('avoidNote').textContent === 'League found nobody called Nobody#EUW in your region.', null, 'nobody found');
    await page.fill('#avoidId', 'grumpy#euw');
    await page.click('#avoidForm button');
    await wait(page, () => document.querySelectorAll('#avoidList li').length === 3, null, 'Grumpy added');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-avoid')).map((e) => [e.n, e.u])), [['Toxic#EUW', ''], ['Bully#EUW', ''], ['grumpy#euw', 'grumpy1']], 'with League’s id for them');
    assert.strictEqual(await row(page, 'Friend#EUW').locator('button.avoid').textContent(), 'Avoid');
    // lock in for you: not with 20 s left, then with 2.5 s left, once
    assert.strictEqual(calls(/actions\/8\/complete/).length, 0, 'plenty of time left');
    L.cs.timer.adjustedTimeLeftInPhase = 2500;
    await wait(page, () => lpc.toasts().includes('Time was almost up, so Premade locked in Ahri for you.'), null, 'locked in for you');
    await page.waitForTimeout(1500);
    assert.deepStrictEqual(calls(/actions\/8\/complete/), ['POST /lol-champ-select/v1/session/actions/8/complete'], 'once');
    // Dodge: twice to be sure
    assert.strictEqual(await text(page, '#dodgeBtn'), 'Dodge');
    await page.click('#dodgeBtn');
    assert.strictEqual(await text(page, '#dodgeBtn'), 'Click again to dodge');
    assert.strictEqual(calls(/session\/quit/).length, 0, 'not on the first click');
    await shot(page, 'champ-select-avoid-dodge');
    await page.click('#dodgeBtn');
    await wait(page, () => document.getElementById('dodgeBtn').textContent === 'Dodge', null, 'Dodge done');
    assert.deepStrictEqual(calls(/session\/quit/), ['POST /lol-lobby-team-builder/champ-select/v1/session/quit']);
    L.oldApp = true;
    await page.click('#dodgeBtn');
    await page.click('#dodgeBtn');
    await wait(page, () => lpc.toasts().includes('Dodge comes with the app update: restart Premade to get it.'), null, 'the note on an older app');
    L.cs.isCustomGame = true;
    await wait(page, () => document.getElementById('dodgeBtn').hidden, null, 'no Dodge in a custom game');
    console.log('champ select: a teammate on the avoid list flagged with a popup, Avoid and the list in Pregame settings, locked in with 2.5 s left, Dodge twice, a note on an older app, none in a custom game');

    // ---- the loading screen: each team's average rank and which is favored; an enemy on the avoid list
    L.phase = 'InProgress';
    await league(page, 'InProgress');
    await wait(page, () => !document.getElementById('liveAvg').hidden && document.querySelectorAll('#liveRows tr').length === 10, null, 'the lobby rank on Game');
    await wait(page, () => lpc.lcu().scouted.length >= 10 && /theirs Silver I\./.test(document.getElementById('liveAvg').textContent), null, 'everyone scouted');
    // yours: four Gold II 50 LP and you, Silver II 40 LP, so Gold III; theirs Silver I 50 LP, 218 points lower
    assert.strictEqual(await text(page, '#liveAvg'), 'Average rank: your team Gold III, theirs Silver I. Your team is favored, by about 2 divisions.');
    await wait(page, () => lpc.toasts().includes('Bully is on your avoid list, on their team.'), null, 'the popup for Bully');
    assert(!(await page.evaluate(() => lpc.toasts().filter((t) => /^Toxic is on/.test(t)).length > 1)), 'Toxic named once a game');
    assert.match(await page.locator('#liveRows tr', { hasText: 'Bully#EUW' }).textContent(), /On your avoid list/);
    await wait(page, () => { const b = lpcClient.lastOverlay && lpcClient.lastOverlay.board; return b && b.heads && b.them.every((c) => c.rank !== 'Looking up…'); }, null, 'the overlay caught up'); // it's pushed on the page's next tick
    const board = await page.evaluate(() => lpcClient.lastOverlay.board);
    assert.deepStrictEqual(board.heads, ['Your team · Gold III · favored', 'Their team · Silver I']);
    assert.deepStrictEqual(board.them.find((c) => c.name === 'Bully').tags[0], ['bad', 'Avoid list']);
    await shot(page, 'game-lobby-rank');
    console.log('loading screen: each team’s average rank and the favored team on Game and the overlay, an enemy on the avoid list flagged');

    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log('Champ select and ranks tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

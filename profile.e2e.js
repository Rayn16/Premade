// Test of Profile and Stats' extras in site/index.html, in headless Chromium, with a stand-in for the desktop app 1.12
// and a fake League client behind it: the patch day popup, the champion pool, duo and party picks, a rank goal,
// match history filters, League's warnings on rank cards, the weekly recap, Compare with me, the Champions table on a
// player's profile, the rank watch feed, and a second League account kept apart from the first.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node profile.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8082/index.html?peer=127.0.0.1:9002&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));

PeerServer({ host: '127.0.0.1', port: 9002, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8082, '127.0.0.1');

// ---- Data Dragon: patch 1.1 gave Ahri more health and a shorter Q
const CHAMPS = { Ahri: 103, Lux: 99, Garen: 86, Zed: 238, Thresh: 412, LeeSin: 64, Sona: 37, Jinx: 222, Caitlyn: 51, Vi: 254, Darius: 122 };
const DDATA = Object.fromEntries(Object.entries(CHAMPS).map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 125 } }]));
const champFull = (id, v) => ({ data: { [id]: { id, allytips: [], enemytips: [], stats: { hp: id === 'Ahri' && v === '1.1' ? 600 : 590, armor: 21 }, passive: { name: 'Passive', description: 'Same.' },
  spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: id === 'Ahri' ? ['Orb of Deception', 'Fox-Fire', 'Charm', 'Spirit Rush'][i] : k, cooldownBurn: id === 'Ahri' && !i && v === '1.1' ? '6' : '7', costBurn: '50', rangeBurn: '900', tooltip: '', description: '' })) } } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// our server's high elo counts: Ahri a B tier middle, Zed an S tier middle, Garen a D tier top; too few Lux games for a tier
const SUM = { 103: { MIDDLE: [50, 26] }, 238: { MIDDLE: [100, 60] }, 86: { TOP: [100, 40] }, 99: { MIDDLE: [5, 3] } };

// ---- your games: this week, last week (Monday to Sunday) and before
const day = 864e5, midnight = new Date().setHours(0, 0, 0, 0);
const thisMonday = (() => { const d = new Date(midnight); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
const daysFrom = (t, k) => { const d = new Date(t); d.setDate(d.getDate() + k); return d.getTime(); };
const lastMonday = daysFrom(thisMonday, -7);
// newest first: two games today (Ahri won, Lux lost); last week Ahri 3W 1L and Lux 2W, with 210 CS; before that Garen
// 3W 5L at the top, Zed lost twice and Ahri 5W 5L, with 150 CS. Duo is on your team (Thresh, support) in the newest 10
// and against you in the 13th; Trio (Lee Sin, jungle) in the newest 4.
const MINE = Array.from({ length: 28 }, (_, i) => {
  const [champ, lane, win] = i === 0 ? [103, 'MIDDLE', true] : i === 1 ? [99, 'MIDDLE', false] : i <= 5 ? [103, 'MIDDLE', i !== 4] : i <= 7 ? [99, 'MIDDLE', true]
    : i <= 15 ? [86, 'TOP', [8, 10, 11].includes(i)] : i <= 17 ? [238, 'MIDDLE', false] : [103, 'MIDDLE', (i - 18) % 2 === 0];
  const at = i <= 1 ? midnight + (Date.now() - midnight) * (i ? 0.3 : 0.6) : i <= 7 ? lastMonday + day + (7 - i) * 36e5 : daysFrom(lastMonday, 7 - i);
  return { i, id: 6000 + i, champ, lane, win, at, cs: i <= 7 ? 210 : 150 };
});
const SMURF = Array.from({ length: 6 }, (_, i) => ({ i: 100 + i, id: 7000 + i, champ: 37, lane: 'UTILITY', win: i % 2 === 0, at: daysFrom(midnight, -30 - i), cs: 40 }));
const LANE = { TOP: ['TOP', 'SOLO'], JUNGLE: ['JUNGLE', 'NONE'], MIDDLE: ['MIDDLE', 'SOLO'], BOTTOM: ['BOTTOM', 'DUO_CARRY'], UTILITY: ['BOTTOM', 'DUO_SUPPORT'] };
const one = (g, stats) => ({ gameId: g.id, platformId: 'EUW1', gameCreation: g.at, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
  participants: [{ championId: g.champ, teamId: 100, timeline: { lane: LANE[g.lane][0], role: LANE[g.lane][1] }, stats: { win: g.win, totalDamageDealtToChampions: 20000, ...stats } }] });
const mine = (g) => one(g, { kills: 5, deaths: 3, assists: 7, totalMinionsKilled: g.cs - 10, neutralMinionsKilled: 10, visionScore: 20 });
const DUO_STATS = { kills: 1, deaths: 5, assists: 14, totalMinionsKilled: 25, neutralMinionsKilled: 5, visionScore: 60 };
// Duo's own match history: your 10 games together, 10 more on Thresh (5 won) and 10 older ones on Sona (all lost)
const DUO_GAMES = [...MINE.slice(0, 10).map((g) => ({ ...g, champ: 412, lane: 'UTILITY' })),
  ...Array.from({ length: 10 }, (_, k) => ({ id: 8000 + k, champ: 412, lane: 'UTILITY', win: k % 2 === 0, at: daysFrom(lastMonday, -3 - k) - 6 * 36e5 })),
  ...Array.from({ length: 10 }, (_, k) => ({ id: 8100 + k, champ: 37, lane: 'UTILITY', win: false, at: daysFrom(lastMonday, -15 - k) }))].map((g) => one(g, DUO_STATS));
// all ten players of one of your games
const FILL = { TOP: 122, JUNGLE: 254, MIDDLE: 51, BOTTOM: 222, UTILITY: 37 };
function detail(g, me) {
  const ours = new Map([[g.lane, [me.puuid, me.gameName, g.champ]]]), theirs = new Map();
  if (g.i <= 9) ours.set('UTILITY', ['duo', 'Duo', 412]);
  if (g.i <= 3) ours.set('JUNGLE', ['trio', 'Trio', 64]);
  if (g.i === 12) theirs.set('UTILITY', ['duo', 'Duo', 412]);
  const ps = [100, 200].flatMap((t) => Object.keys(LANE).map((r) => [t, r, (t === 100 ? ours : theirs).get(r) || [`p${g.id}-${t}-${r}`, `P${g.id}${t}${r[0]}`, FILL[r]]]));
  return { gameId: g.id, platformId: 'EUW1', gameCreation: g.at, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
    participantIdentities: ps.map(([, , [puuid, gameName]], k) => ({ participantId: k + 1, player: { puuid, gameName, tagLine: 'EUW' } })),
    participants: ps.map(([t, r, [, , c]], k) => ({ participantId: k + 1, teamId: t, championId: c, timeline: { lane: LANE[r][0], role: LANE[r][1] }, stats: { win: t === 100 ? g.win : !g.win } })) };
}

// ---- the fake League client: your two accounts, Rayan (Diamond II at 10 LP, decaying in 2 days; Flex placements
// half done) and Smurf (Silver I), and Duo (Gold I, until they rank up)
const ACCOUNTS = {
  A: { who: { puuid: 'me-a', gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 300, profileIconId: 1 }, games: MINE,
    ranks: { RANKED_SOLO_5x5: { tier: 'DIAMOND', division: 'II', leaguePoints: 10, wins: 30, losses: 20, provisionalGamesRemaining: 0, warnings: { daysUntilDecay: 2, displayDecayWarning: true, demotionWarning: 0, timeUntilInactivityStatusChanges: 0 } },
      RANKED_FLEX_SR: { tier: '', division: 'NA', leaguePoints: 0, wins: 0, losses: 0, isProvisional: true, provisionalGamesRemaining: 3, provisionalGameThreshold: 5 } } },
  B: { who: { puuid: 'me-b', gameName: 'Smurf', tagLine: 'EUW', summonerId: 2, summonerLevel: 40, profileIconId: 2 }, games: SMURF, ranks: { RANKED_SOLO_5x5: { tier: 'SILVER', division: 'I', leaguePoints: 50, wins: 5, losses: 5 } } },
};
const L = { acct: 'A', duoRank: ['GOLD', 'I', 40], duoNew: false, calls: [], refused: [] };
const ok = (data) => ({ status: 200, data }), none = { status: 404, data: null };
function fakeLcu(method, p) {
  L.calls.push(`${method} ${p}`);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  const a = ACCOUNTS[L.acct];
  let m;
  if (p === '/lol-summoner/v1/current-summoner') return ok(a.who);
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: a.ranks });
  if (p === '/lol-champion-mastery/v1/local-player/champion-mastery') return ok([]);
  if (p === '/lol-perks/v1/recommended-champion-positions') return ok({});
  if ((m = /alias\/lookup\?gameName=([^&]*)&tagLine=(.*)$/.exec(p))) return m[1] === 'Duo' && m[2] === 'EUW' ? ok({ puuid: 'duo' }) : none;
  if (p === '/lol-ranked/v1/ranked-stats/duo') { const [tier, division, leaguePoints] = L.duoRank; return ok({ queueMap: { RANKED_SOLO_5x5: { tier, division, leaguePoints, wins: 20, losses: 20 } } }); }
  if (p === '/lol-summoner/v2/summoners/puuid/duo') return ok({ puuid: 'duo', summonerLevel: 150, profileIconId: 3 });
  if (p === '/lol-champion-mastery/v1/duo/champion-mastery') return ok([{ championId: 412, championLevel: 7, championPoints: 100000 }]);
  if ((m = /^\/lol-match-history\/v1\/products\/lol\/([\w-]+)\/matches\?begIndex=(\d+)&endIndex=(\d+)$/.exec(p))) { // both ends in, as League's client does
    const list = m[1] === 'current-summoner' ? a.games.map(mine) : m[1] === 'duo' ? (L.duoNew ? [one({ id: 8999, champ: 412, lane: 'UTILITY', win: true, at: Date.now() - 1900e3 }, { ...DUO_STATS, pentaKills: 1 }), ...DUO_GAMES] : DUO_GAMES) : [];
    return ok({ games: { games: list.slice(+m[2], +m[3] + 1) } });
  }
  if ((m = /^\/lol-match-history\/v1\/games\/(\d+)$/.exec(p))) {
    const g = MINE.find((x) => x.id === +m[1]), s = SMURF.find((x) => x.id === +m[1]);
    return g ? ok(detail(g, ACCOUNTS.A.who)) : s ? ok(detail(s, ACCOUNTS.B.who)) : none;
  }
  return none;
}

function fakeApp(version) { // the desktop app (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.lpcClient = { version, screens: async () => [], useScreen() {}, keys: async (k) => ({ mute: !!k.mute, show: !!k.show, clip: !!k.clip, overlay: !!k.overlay, ptt: !!k.ptt }),
    windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); },
    lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}
// Rayan's LP after six Solo/Duo games (+22 a win and −20 a loss on average; three last week, +24), and a Flex game kept
// before the app knew accounts
const LP = [[-5, 'RANKED_FLEX_SR', -15, false, null], ...[[-3, 24, true], [-3, -20, false], [-3, -22, false], [1, 20, true], [1, 22, true], [1, -18, false]].map(([d, delta, win]) => [d, 'RANKED_SOLO_5x5', delta, win, 'rayan#euw'])]
  .map(([d, q, delta, win, a], k) => ({ id: 100 + k, at: daysFrom(lastMonday, d) + (6 + k) * 36e5, q, tier: 'DIAMOND', div: 'II', lp: 50, delta, win, ...(a && { a }) }));

const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; page ${JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).textContent();
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true }); // SHOTS=folder saves screenshots
const tiles = (page, sel) => page.$$eval(`${sel} .champ`, (l) => l.map((e) => `${e.querySelector('b').textContent}: ${e.querySelector('.sub').textContent}`));

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const cors = { 'access-control-allow-origin': '*' };
    await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
      const u = r.request().url();
      let m;
      if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
      if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
      if ((m = /\/cdn\/([\d.]+)\/data\/en_US\/champion\/(\w+)\.json$/.exec(u))) return r.fulfill({ json: champFull(m[2], m[1]), headers: cors });
      if (u.endsWith('item.json')) return r.fulfill({ json: { data: {} }, headers: cors });
      if (u.endsWith('runesReforged.json')) return r.fulfill({ json: [], headers: cors });
      if (u.endsWith('.json')) return r.fulfill({ status: 404, body: '', headers: cors });
      r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
    });
    await ctx.route(/127\.0\.0\.1:9002\/(riot|stats)/, (r) => { // our server: high elo counts, and nothing from Riot itself
      const u = new URL(r.request().url());
      if (u.pathname === '/riot/summary') return r.fulfill({ json: { p: '15.20', c: SUM, old: null, today: 1, total: 100, at: 0 }, headers: cors });
      if (u.pathname === '/riot/past') return r.fulfill({ json: { s: {} }, headers: cors });
      if (u.pathname === '/riot/champ') return r.fulfill({ json: { patch: '15.20', role: u.searchParams.get('r'), roles: {}, games: [] }, headers: cors });
      r.fulfill({ status: 404, json: { status: { status_code: 404 } }, headers: cors });
    });
    await ctx.addInitScript((lp) => {
      if (localStorage.getItem('lpc-setup')) return;
      localStorage.setItem('lpc-setup', '1');
      localStorage.setItem('lpc-name', 'Rayan');
      localStorage.setItem('lpc-news', '9999'); // no What's new
      localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false }));
      localStorage.setItem('lpc-lp', JSON.stringify(lp));
      localStorage.setItem('lpc-patch-seen', '1.0'); // the app saw patch 1.0, so 1.1 is new
    }, LP);
    await ctx.addInitScript(fakeApp, '1.12.0');
    await ctx.exposeFunction('fakeLcu', fakeLcu);
    const pc = await ctx.newPage();
    pc.on('pageerror', (e) => errors.push(e.message));
    const league = (d) => pc.evaluate((d) => lpcClient.emit('league', d), d);
    await pc.goto(URL_);
    await wait(pc, () => window.lpc, null, 'the page');
    await league({ inGame: false, phase: 'None' });
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => document.getElementById('proName').textContent === 'Rayan' && lpc.lcu().hist === 28, null, 'your profile');

    // ---- the patch day popup: Ahri, the only one of your champions patch 1.1 changed; then Patch changes in Stats
    await wait(pc, () => document.getElementById('patchDlg').open, null, 'the patch day popup');
    await shot(pc, 'patch-popup');
    assert.strictEqual(await text(pc, '#patchDlgTitle'), 'Patch 1.1 is out');
    assert.match(await text(pc, '#patchDlgNote'), /^What changed for the champions you play most since patch 1\.0, from Riot’s Data Dragon/);
    assert.deepStrictEqual(await pc.$$eval('#patchDlgList .patchchamp', (l) => l.map((e) => [e.querySelector('b').textContent, ...[...e.querySelectorAll('li')].map((x) => x.textContent)])),
      [['Ahri', 'Health 590 → 600', 'Q (Orb of Deception) cooldown 7 → 6']]);
    await pc.click('#patchDlgGo');
    await wait(pc, () => !document.getElementById('patchDlg').open && lpc.statsTab() === 'champs' && !document.getElementById('h-patch').closest('.panel').hidden, null, 'Patch changes in Stats');
    assert.strictEqual(await pc.evaluate(() => localStorage.getItem('lpc-patch-seen')), '1.1', 'not again for this patch');
    console.log('patch day popup: what changed for Ahri, and Patch changes in Stats');

    // ---- your games in detail, read now; then the champion pool and duo and party picks
    assert.strictEqual(await pc.evaluate(() => lpc.crawlAll()), 28);
    await pc.click('.tab[data-tab="champs"]');
    await wait(pc, () => document.querySelectorAll('#poolKeep .champ').length === 2 && document.querySelectorAll('#duos > div').length === 3, null, 'the pool and duo picks');
    assert.deepStrictEqual(await tiles(pc, '#poolKeep'), ['Ahri: 15 games, 60% won · Middle, B tier in high elo', 'Lux: 3 games, 67% won · Middle']);
    assert.deepStrictEqual(await tiles(pc, '#poolPractice'), ['Zed: 2 games, 0% won · Middle, S tier in high elo']);
    assert.deepStrictEqual(await tiles(pc, '#poolDrop'), ['Garen: 8 games, 38% won · Top, D tier in high elo']);
    assert.deepStrictEqual(await pc.$$eval('#duos > div', (l) => l.map((d) => [...d.children].map((e) => e.textContent))), [
      ['With Duo: 7W 3L', 'Ahri with their Thresh: 4W 1L', 'Lux with their Thresh: 2W 1L', 'Garen with their Thresh: 1W 1L', 'You middle, them support: 6W 2L', 'You top, them support: 1W 1L'],
      ['With Trio: 3W 1L', 'Ahri with their Lee Sin: 3W 0L', 'You middle, them jungle: 3W 1L'],
      ['Duo, Trio and you: 3W 1L', 'You on Ahri: 3W 0L']]);
    await shot(pc, 'pool-and-duos');
    console.log('champion pool: keep Ahri and Lux, practice Zed, drop Garen; duo picks with Duo and Trio, and the three of you');

    // ---- a rank goal: Diamond I from Diamond II at 10 LP
    await pc.click('.tab[data-tab="you"]');
    await pc.selectOption('#lpGoal', 'DIAMOND I');
    await wait(pc, () => /^Diamond I is/.test(document.getElementById('lpGoalNote').textContent), null, 'the goal');
    assert.strictEqual(await text(pc, '#lpGoalNote'), 'Diamond I is 90 LP away: about 5 wins at your usual +22 LP a win, or about 18 games at your 60% win rate this season.');
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-goals'))), { 'rayan#euw RANKED_SOLO_5x5': 'DIAMOND I' });
    console.log('rank goal: Diamond I is 90 LP away, about 5 wins or 18 games');

    // ---- match history filters
    await pc.click('.tab[data-tab="games"]');
    const games = async () => [await pc.$$eval('#matches > li', (l) => l.length), await text(pc, '#matchNote')];
    assert.deepStrictEqual(await games(), [20, '']);
    const filter = async ({ mfFind = '', ...o }) => {
      for (const [id, v] of Object.entries({ mfChamp: '', mfRole: '', mfRes: '', mfWith: '', mfWhen: '', ...o })) await pc.selectOption('#' + id, v);
      await pc.fill('#mfFind', mfFind);
      return games();
    };
    const of = (n) => [n, `${n} of your last 28 games match.`];
    assert.deepStrictEqual(await filter({ mfChamp: '99' }), of(3), 'Lux');
    assert.deepStrictEqual(await filter({ mfRole: 'TOP' }), of(8), 'top');
    assert.deepStrictEqual(await filter({ mfChamp: '103', mfRes: 'w' }), of(9), 'Ahri wins');
    assert.deepStrictEqual(await pc.$$eval('#mfWith option', (l) => l.map((o) => o.textContent)), ['Anyone', 'Duo#EUW', 'Trio#EUW']);
    assert.deepStrictEqual(await filter({ mfWith: 'duo' }), of(10), 'with Duo');
    await shot(pc, 'filters');
    assert.deepStrictEqual(await filter({ mfWhen: '0' }), of(2), 'today');
    assert.deepStrictEqual(await filter({ mfFind: 'trio' }), of(4), 'Trio by name');
    assert.deepStrictEqual(await filter({ mfFind: 'LUX' }), of(3), 'Lux by name');
    assert.deepStrictEqual(await filter({ mfRole: 'JUNGLE' }), [0, 'No games match.']);
    assert.deepStrictEqual(await filter({}), [20, '']);
    console.log('match history filters: champion, role, result, friend, today and search');

    // ---- Profile: League's warnings and the goal on your rank cards, and last week's recap
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => document.querySelectorAll('#proRanks .rank .warn').length === 3, null, 'the warnings');
    assert.deepStrictEqual(await pc.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.warn, .goal')].map((x) => `${x.className}${x.dataset.k ? ' ' + x.dataset.k : ''}: ${x.textContent}`))),
      [['warn bad: Decays in 2 days without a ranked game', 'warn bad: 10 LP: one loss can drop you to Diamond III', 'goal: Goal Diamond I: 90 LP, about 5 wins'], ['warn: Placements: 3 of 5 games left']]);
    assert(await pc.isVisible('#weekBox'), 'last week’s recap');
    await shot(pc, 'profile');
    const dayText = (t) => pc.evaluate((t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }), t);
    assert.strictEqual(await text(pc, '#h-week'), `Your week: ${await dayText(lastMonday)} to ${await dayText(thisMonday - 1)}`);
    assert.deepStrictEqual(await pc.$$eval('#weekTiles > span', (l) => l.map((s) => `${s.firstChild.textContent}: ${s.lastChild.textContent}`)),
      ['Games: 6: 5W 1L', 'Solo/Duo LP: +24 in 3 games', 'Best champion: Ahri: 3W 1L', 'Most improved: CS a minute: 7.0, from 5.0']);
    await pc.click('#weekOk');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    assert(!(await pc.isVisible('#weekBox')), 'closed until next week');
    console.log('rank cards: decay in 2 days, one loss from Diamond III, placements, the goal; last week: 6 games, +24 LP, Ahri, CS up');

    // ---- Compare with me, and the Champions table on Duo's profile, growing with Show more games
    assert(!(await pc.isVisible('#proCmp')), 'nobody to compare with on your own profile');
    await pc.fill('#proId', 'Duo#EUW');
    await pc.press('#proId', 'Enter');
    await wait(pc, () => document.getElementById('proName').textContent === 'Duo', null, 'Duo’s profile');
    assert(await pc.isVisible('#proMineToo'), 'Add to my accounts');
    await pc.click('#proCmp');
    await wait(pc, () => !document.getElementById('proCmpBox').hidden, null, 'the comparison');
    assert.deepStrictEqual(await pc.$$eval('#cmpRows tr', (l) => l.map((tr) => [...[...tr.children].map((td) => td.textContent), [...tr.children].findIndex((td) => td.hasAttribute('data-best'))])), [
      ['Solo/Duo', 'Diamond II · 10 LP', 'Gold I · 40 LP', 1], ['Flex', 'Unranked', 'Unranked', -1], ['Plays most', 'Garen, Ahri, Lux', 'Thresh', -1], ['Record', '10W 10L · 50%', '12W 8L · 60%', 2],
      ['KDA', '5.0 / 3.0 / 7.0 · 4.0', '1.0 / 5.0 / 14.0 · 3.0', 1], ['CS a minute', '5.8', '1.0', 1], ['Vision a game', '20.0', '60.0', 2], ['Main role', 'Middle', 'Support', -1]]);
    assert.deepStrictEqual([await text(pc, '#cmpA'), await text(pc, '#cmpB')], ['Rayan (you)', 'Duo']);
    await shot(pc, 'compare');
    assert.strictEqual(await text(pc, '#cmpNote'), 'Your last 20 games and their last 20, not TFT. Together: on the same team 7W 3L; against each other you won 0 of 1.');
    const champRows = () => pc.$$eval('#proChampRows tr', (l) => l.map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')));
    assert.deepStrictEqual(await champRows(), ['Thresh | 20 | 60% | 3.0 | 1.0']);
    assert.strictEqual(await text(pc, '#proChampNote'), 'From 20 games: Show more games adds older ones.');
    await pc.click('#proMore');
    await wait(pc, () => document.querySelectorAll('#proChampRows tr').length === 2, null, 'older games in the table');
    assert.deepStrictEqual(await champRows(), ['Thresh | 20 | 60% | 3.0 | 1.0', 'Sona | 10 | 0% | 3.0 | 1.0']);
    assert.match(await text(pc, '#proChampNote'), /^From 30 games/);
    await pc.click('#proBack');
    await wait(pc, () => document.getElementById('proName').textContent === 'Rayan' && document.getElementById('proCmpBox').hidden, null, 'your profile again');
    console.log('compare with me: Duo side by side, 7W 3L together; Duo’s champions, 20 games then 30');

    // ---- the rank watch feed: Duo's latest 3 games the first time; then a new game with a pentakill, and a rank-up
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await pc.click('.tab[data-tab="players"]');
    await pc.fill('#watchId', 'Duo#EUW');
    await pc.press('#watchId', 'Enter');
    await wait(pc, () => document.querySelectorAll('#watchFeed li').length === 3, null, 'Duo in the feed');
    const feed = () => pc.$$eval('#watchFeed li > span', (l) => l.map((s) => s.childNodes[0].textContent + s.childNodes[1].textContent).sort());
    const won = 'Duo won as Thresh, 1/5/14 · Ranked Solo/Duo';
    assert.deepStrictEqual(await feed(), ['Duo lost as Thresh, 1/5/14 · Ranked Solo/Duo', won, won]);
    assert(await pc.isVisible('#h-feed'));
    L.duoRank = ['PLATINUM', 'IV', 10];
    L.duoNew = true;
    await pc.evaluate(() => lpc.watchNow());
    assert.deepStrictEqual(await feed(), ['Duo got a pentakill as Thresh', 'Duo lost as Thresh, 1/5/14 · Ranked Solo/Duo', 'Duo ranked up to Platinum IV', won, won, won]);
    const toasts = await pc.evaluate(() => lpc.toasts());
    await shot(pc, 'feed');
    assert(toasts.includes('Duo got a pentakill as Thresh!') && toasts.includes('Duo ranked up to Platinum IV!') && !toasts.some((t) => t.startsWith('Duo: ')), `a popup for each, and none for the LP: ${toasts}`);
    console.log('rank watch feed: Duo’s games, a pentakill and a rank-up to Platinum IV, with popups');

    // ---- a second account: League signs in to Smurf; Rayan's profile, LP and goal stay apart and come back in Account
    assert.deepStrictEqual(await pc.evaluate(() => lpc.lpLog().map((e) => e.a)), Array(7).fill('rayan#euw'), 'the LP kept before accounts is Rayan’s');
    assert(await pc.evaluate(() => document.getElementById('lpAcctBox').hidden), 'one account: no Account box');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    L.acct = 'B';
    await league(null); // League closed, and started again on the other account
    await league({ inGame: false, phase: 'None' });
    await wait(pc, () => document.getElementById('proName').textContent === 'Smurf' && /Silver I/.test(document.getElementById('proRanks').textContent), null, 'Smurf’s profile');
    assert.deepStrictEqual(await pc.evaluate(() => Object.keys(lpc.accounts()).sort()), ['rayan#euw', 'smurf#euw']);
    assert.deepStrictEqual(await pc.$$eval('#proAcct option', (l) => l.map((o) => o.textContent)), ['Rayan#EUW', 'Smurf#EUW']);
    assert(await pc.isVisible('#proAcct') && (await pc.inputValue('#proAcct')) === 'smurf#euw', 'Account on Profile');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await pc.click('.tab[data-tab="you"]');
    await wait(pc, () => /Silver I · 50 LP/.test(document.getElementById('rankNow').textContent), null, 'Smurf’s rank in Stats');
    assert(await pc.isVisible('#lpAcctBox') && (await pc.inputValue('#lpAcct')) === 'smurf#euw');
    assert.strictEqual(await pc.$$eval('#lpList li', (l) => l.length), 0, 'none of Rayan’s LP');
    assert.strictEqual(await text(pc, '#lpToday'), 'Your LP shows up here after each ranked game you play with the app open.');
    assert.strictEqual(await pc.inputValue('#lpGoal'), '', 'Smurf has no goal');
    await pc.selectOption('#lpAcct', 'rayan#euw');
    await wait(pc, () => document.querySelectorAll('#lpList li').length === 6 && /Diamond II · 10 LP/.test(document.getElementById('rankNow').textContent), null, 'Rayan’s LP and rank');
    await shot(pc, 'ranked-accounts');
    assert.strictEqual(await pc.inputValue('#lpGoal'), 'DIAMOND I');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => document.getElementById('proName').textContent === 'Rayan', null, 'Rayan’s profile');
    assert.match(await text(pc, '#proNote'), /^As of .+\. Sign in to it in League to update it\.$/);
    assert.match(await text(pc, '#proRanks'), /Diamond II[\s\S]*Decays in 2 days without a ranked game/);
    await pc.selectOption('#proAcct', 'smurf#euw');
    await wait(pc, () => document.getElementById('proName').textContent === 'Smurf' && document.getElementById('proNote').hidden, null, 'Smurf again');
    console.log('accounts: Smurf added by signing in, with its own LP and goal; Rayan’s profile, rank and LP picked in Account');

    assert.deepStrictEqual(L.refused, [], 'every call to League’s client is on the desktop app’s list');
    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log(`all ${L.calls.length} calls to League's client are on the desktop app's list`);
    console.log('ok');
  } catch (err) {
    console.error(err);
    if (errors.length) console.error('page errors:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit(process.exitCode || 0);
  }
})().catch((err) => { console.error(err); process.exit(1); });

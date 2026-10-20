// Checks the Riot object (/riot/...) under `wrangler dev` against a fake Riot API: it counts each high-elo game once
// (only full ranked solo games on Summoner's Rift), from Korea's and Europe West's ladders, with their bans, keeps
// what each champion bought, levelled and took, with their lane opponent and gold at 10, and the game's length and
// their gold, vision and damage, passes only the lookup calls on its list through, with our key and its limits,
// keeping the ranks they get for each season, and says how much of the free plan it used. Then, restarted with the
// sweep going 8 days back, it carries on with the day it was on and counts the older games a day at a time, newer
// days first.
// WRANGLER=<path to wrangler> node riot.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');

const PORT = 8788, RIOT = 8899, BASE = `http://127.0.0.1:${PORT}`, KEY = 'test-key-123', SITE = 'http://127.0.0.1:8096';
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-riot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = (n) => `${n}`.repeat(78).slice(0, 78); // a puuid
const DAY = 86400, today = Math.floor(Date.now() / 864e5);
const TEAM = [[266, 'TOP'], [64, 'JUNGLE'], [103, 'MIDDLE'], [222, 'BOTTOM'], [412, 'UTILITY'], [86, 'TOP'], [254, 'JUNGLE'], [238, 'MIDDLE'], [145, 'BOTTOM'], [117, 'UTILITY']];
// the games: KR_1001 is the patch before; KR_1004 is ARAM and KR_1005 a remake, which don't count. EUW1_3001 is Europe
// West's, with other champions (+1000). The sweep's older games: KR_2002 is the patch before and KR_2003 the one before
// that; KR_2004 is ARAM and KR_2005 a remake
const GAMES = { KR_1001: ['16.19.1.1', 420, 1800], KR_1002: ['16.20.3.4', 420, 1700], KR_1003: ['16.20.3.4', 420, 2000], KR_1004: ['16.20.3.4', 450, 1200], KR_1005: ['16.20.3.4', 420, 300], KR_1006: ['16.20.5.1', 420, 1500],
  EUW1_3001: ['16.20.3.4', 420, 1900],
  KR_2001: ['16.20.1.1', 420, 1900], KR_2002: ['16.19.2.1', 420, 1600], KR_2003: ['16.18.1.1', 420, 1750], KR_2004: ['16.20.1.1', 450, 1200], KR_2005: ['16.20.1.1', 420, 250], KR_2006: ['16.20.1.1', 420, 1800] };
// each server's Challenger and Grandmaster players; North America's one has no games
const LADDERS = { kr: [[P(1), P(2)], [P(3)]], euw1: [[P(4)], []], na1: [[P(5)], []] };
const IDS = { [P(1)]: ['KR_1001', 'KR_1002', 'KR_1003'], [P(2)]: ['KR_1002', 'KR_1004', 'KR_1005'], [P(3)]: ['KR_1006'], [P(4)]: ['EUW1_3001'] }; // the last 3 days'
// the games played that many days ago, which every ladder player was in; KR_1001 (the crawl's) too, for the sweep
const DAYS = { 4: ['KR_1001', 'KR_2004'], 5: ['KR_2002'], 6: ['KR_2001'], 7: ['KR_2003'], 8: ['KR_2005'], 9: ['KR_2006'] };
const match = (id) => {
  const [v, q, len] = GAMES[id], blueWins = id !== 'KR_1003', ago = Object.keys(DAYS).find((k) => DAYS[k].includes(id)), eu = id.startsWith('EUW') ? 1000 : 0;
  return { metadata: { matchId: id }, info: { gameVersion: v, queueId: q, mapId: q === 450 ? 12 : 11, gameDuration: len,
    gameCreation: id.startsWith('KR_2') ? (today - ago) * 864e5 + 3600e3 : 1760000000000 + +id.split('_')[1] * 1000,
    teams: [{ teamId: 100, bans: [{ championId: 157, pickTurn: 1 }, { championId: -1, pickTurn: 2 }] }, { teamId: 200, bans: [{ championId: 157, pickTurn: 6 }, { championId: 555, pickTurn: 7 }] }],
    participants: TEAM.map(([c, r], i) => ({ participantId: i + 1, championId: c + eu, teamPosition: r, teamId: i < 5 ? 100 : 200, win: i < 5 === blueWins, summoner1Id: 4, summoner2Id: i % 5 === 1 ? 11 : 14,
      kills: i, deaths: 2, assists: 7, totalMinionsKilled: 150 + i, neutralMinionsKilled: 4, riotIdGameName: 'Secret' + i, puuid: P(9),
      goldEarned: 10000 + 100 * i, visionScore: 20 + i, totalDamageDealtToChampions: 15000 + 1000 * i,
      perks: { statPerks: { defense: 5011, flex: 5008, offense: 5005 }, styles: [{ description: 'primaryStyle', style: 8100, selections: [8112, 8139, 8138, 8135].map((perk) => ({ perk })) }, { description: 'subStyle', style: 8300, selections: [8306, 8347].map((perk) => ({ perk })) }] } })) } };
};
const timeline = () => {
  const frames = [];
  for (let m = 0; m <= 12; m++) {
    const events = [];
    if (m === 0) for (let p = 1; p <= 10; p++) events.push({ type: 'ITEM_PURCHASED', itemId: 1055, participantId: p, timestamp: 2000 }, { type: 'ITEM_PURCHASED', itemId: 2003, participantId: p, timestamp: 2500 });
    if (m === 1) for (let p = 1; p <= 10; p++) for (const [i, s] of [1, 2, 3].entries()) events.push({ type: 'SKILL_LEVEL_UP', levelUpType: 'NORMAL', skillSlot: s, participantId: p, timestamp: 61000 + i * 1000 });
    if (m === 6) events.push({ type: 'ITEM_PURCHASED', itemId: 3006, participantId: 3, timestamp: 400000 }, { type: 'ITEM_UNDO', beforeId: 3006, afterId: 0, goldGain: 1100, participantId: 3, timestamp: 401000 },
      { type: 'ITEM_PURCHASED', itemId: 3020, participantId: 3, timestamp: 402000 }, { type: 'SKILL_LEVEL_UP', levelUpType: 'EVOLVE', skillSlot: 1, participantId: 3, timestamp: 403000 },
      { type: 'CHAMPION_KILL', killerId: 3, victimId: 8, timestamp: 404000, victimDamageDealt: [] });
    const participantFrames = {};
    for (let p = 1; p <= 10; p++) participantFrames[p] = { participantId: p, totalGold: 3000 + 100 * p * (m === 10), minionsKilled: 80 + p, jungleMinionsKilled: 0, xp: 4000 + 10 * p };
    frames.push({ timestamp: m * 60000 + (m ? 30 : 0), events, participantFrames });
  }
  return { metadata: {}, info: { frameInterval: 60000, frames } };
};

// the fake Riot API: the routing value is the first part of the path
const calls = [];
let slowDown = false, anaLost = false; // Ana's rank drops for her second lookup
const riot = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), [, host, ...rest] = u.pathname.split('/'), p = '/' + rest.join('/');
  calls.push({ host, p, q: u.search, key: req.headers['x-riot-token'] });
  const send = (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  if (req.headers['x-riot-token'] !== KEY) return send(401, { status: { message: 'Unauthorized' } });
  let m;
  if (LADDERS[host] && (m = p.match(/^\/lol\/league\/v4\/(challenger|grandmaster)leagues\/by-queue\/RANKED_SOLO_5x5$/))) return send(200, { entries: LADDERS[host][m[1] === 'challenger' ? 0 : 1].map((puuid) => ({ puuid, leaguePoints: 1000 })) });
  if (host === 'asia' && (m = p.match(/^\/lol\/match\/v5\/matches\/by-puuid\/(\w+)\/ids$/))) {
    const end = u.searchParams.get('endTime'); // the sweep asks for one day
    return send(200, end ? DAYS[today - Math.floor(end / DAY)] || [] : IDS[m[1]] || []);
  }
  if (host === 'europe' && p === `/lol/match/v5/matches/by-puuid/${P(4)}/ids`) return send(200, IDS[P(4)]);
  if ((m = p.match(/^\/lol\/match\/v5\/matches\/([A-Z0-9]+_\d+)(\/timeline)?$/)) && GAMES[m[1]] && host === (m[1].startsWith('KR') ? 'asia' : 'europe')) return send(200, m[2] ? timeline() : match(m[1]));
  // lookups
  if (host === 'europe' && p === '/riot/account/v1/accounts/by-riot-id/Ana%20B/EUW') return send(200, { puuid: P('a'), gameName: 'Ana B', tagLine: 'EUW' });
  if (host === 'europe' && p.startsWith('/riot/account/v1/accounts/by-riot-id/')) return send(404, { status: { message: 'Data not found' } });
  if (host === 'europe' && p === `/riot/account/v1/region/by-game/lol/by-puuid/${P('a')}`) return send(200, { puuid: P('a'), game: 'lol', region: 'euw1' });
  if (host === 'euw1' && p === `/lol/league/v4/entries/by-puuid/${P('a')}`) return send(200, [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: anaLost ? 'III' : 'II', leaguePoints: anaLost ? 75 : 40, wins: 10, losses: 8 }, { queueType: 'CHERRY', tier: 'GOLD' }]);
  if (host === 'kr' && p.startsWith('/lol/summoner/v4/summoners/by-puuid/')) return send(200, { puuid: P('k'), summonerLevel: 300 });
  if (host === 'jp1') return slowDown ? send(429, { status: { message: 'Rate limit exceeded' } }, { 'retry-after': '2' }) : send(200, { summonerLevel: 1 });
  if (host === 'europe' && p === `/lol/match/v5/matches/by-puuid/${P('a')}/ids`) return send(200, ['EUW1_7123456789']);
  if (host === 'europe' && p === '/lol/match/v5/matches/EUW1_7123456789') return send(200, { info: { gameId: 7123456789 } });
  if (host === 'euw1' && p === '/lol/status/v4/platform-data') return send(200, { id: 'EUW1', maintenances: [{ id: 1, maintenance_status: 'in_progress', titles: [{ locale: 'en_US', content: 'Ranked is off' }] }], incidents: [] });
  send(404, { status: { message: 'Not found' } });
}).listen(RIOT, '127.0.0.1');

const env = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
let wr;
const up = async (...vars) => { // wrangler dev with our key, the fake Riot API and these variables
  wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist,
    ...[`RIOT_KEY:${KEY}`, `RIOT_BASE:http://127.0.0.1:${RIOT}/{host}`, 'CRAWL_EVERY:75', ...vars].flatMap((v) => ['--var', v])], { cwd: __dirname, detached: true, stdio: 'ignore', env });
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) return; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
};
const get = (p, headers = {}) => fetch(BASE + p, { headers: { origin: SITE, ...headers } });
const counted = async (n) => { // the summary once n games are counted and nothing more comes
  for (let i = 0; ; i++) {
    const sum = await (await get('/riot/summary')).json();
    if (sum.total >= n) break;
    assert(i < 120, `only ${sum.total} games counted: ${JSON.stringify(calls.map((c) => c.p))}`);
    await sleep(500);
  }
  await sleep(1500);
  return (await get('/riot/summary')).json();
};

(async () => {
  await up('SWEEP_DAYS:3'); // the sweep waits for now: it has no day older than 3 days to count
  // the counting starts by itself once the Riot object wakes up
  let sum = await counted(5);
  assert.equal(sum.total, 5, 'KR_1004 (ARAM) and KR_1005 (a remake) are not counted');
  assert.equal(sum.today, 5);
  assert.deepEqual(sum.by, { kr: 4, euw1: 1 }, "Korea's games and Europe West's");
  assert.equal(sum.p, '16.20');
  assert.equal(sum.from, undefined, 'no older days counted');
  assert.equal(sum.on, undefined);
  assert.deepEqual(sum.c['103'], { MIDDLE: [3, 2] }, 'Ahri: three games this patch, won two');
  assert.deepEqual(sum.c['1103'], { MIDDLE: [1, 1] }, "Europe West's game");
  assert.deepEqual([sum.b, sum.bn], [{ 157: 4, 555: 4 }, 4], 'each champion banned once a game, without no ban (-1)');
  assert.deepEqual(sum.old, { p: '16.19', c: Object.fromEntries(TEAM.map(([c, r], i) => [c, { [r]: [1, i < 5 ? 1 : 0] }])), b: { 157: 1, 555: 1 }, bn: 1 }, 'the patch before');
  // what it used of the free plan today
  const isoDay = new Date().toISOString().slice(0, 10);
  assert.equal(sum.use.day, isoDay);
  assert(sum.use.req > 20 && sum.use.read > 0 && sum.use.write > 20 && sum.use.ms >= 0 && sum.use.prev === undefined, JSON.stringify(sum.use));
  assert.deepEqual(sum.use.lim, { req: 1e5, read: 5e6, write: 1e5, ms: 101562500 });
  assert((await (await get('/riot/summary')).json()).use.req > sum.use.req, 'a call is a request');
  const crawl = calls.filter((c) => c.host === 'kr' || c.host === 'asia');
  for (const id of Object.keys(GAMES).filter((x) => x.startsWith('KR_1'))) assert.equal(crawl.filter((c) => c.p === `/lol/match/v5/matches/${id}`).length, 1, `${id} asked for once`);
  assert.deepEqual(crawl.filter((c) => c.p.endsWith('/timeline')).map((c) => c.p.split('/')[5]).sort(), ['KR_1001', 'KR_1002', 'KR_1003', 'KR_1006'], 'timelines only for games that count');
  for (const c of crawl.filter((x) => x.p.endsWith('/ids'))) assert.match(c.q, /^\?queue=420&type=ranked&count=20&startTime=\d+$/);
  assert(calls.every((c) => c.key === KEY), 'our key on every call');

  // a champion's games for the page
  let r = await get('/riot/champ?c=103&r=MIDDLE');
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  const ahri = await r.json();
  assert.equal(ahri.patch, '16.20');
  assert.equal(ahri.role, 'MIDDLE');
  assert.deepEqual(ahri.roles, { MIDDLE: [3, 2] });
  assert.deepEqual(ahri.y, { n: 0, w: 0, vs: {} }, 'no older games yet');
  assert.equal(ahri.games.length, 4);
  assert.deepEqual(ahri.games.map((g) => g.p), ['16.20', '16.20', '16.20', '16.19'], 'newest first');
  const g = ahri.games.find((x) => x.t === 1760000000000 / 1000 + 1002);
  assert.deepEqual({ ...g, b: undefined }, { p: '16.20', t: 1760001002, w: 1, o: 238, g: -500, s: [4, 14], rn: [8100, 8300, 8112, 8139, 8138, 8135, 8306, 8347, 5005, 5008, 5011], k: [1, 2, 3], x: [2, 2, 7, 156], l: [-5, -50], b: undefined,
    a: [266, 64, 222, 412], e: [86, 254, 238, 145, 117], m: [1700, 10200, 22, 17000, 10, 85000] }, "with who was on each team, the game's length and Ahri's gold, vision and damage, and her team's kills and damage");
  assert.deepEqual(g.b, [[2, 1055], [3, 2003], [402, 3020]], 'the boots Ahri undid are left out');
  assert.equal(ahri.games.filter((x) => x.w).length, 3);
  assert.equal((await (await get('/riot/champ?c=103')).json()).role, 'MIDDLE', 'its most played role when none is asked for');
  const jungle = await (await get('/riot/champ?c=64')).json();
  assert.equal(jungle.role, 'JUNGLE');
  assert.deepEqual(jungle.games[0].s, [4, 11]);
  assert.deepEqual(await (await get('/riot/champ?c=nope')).json(), { games: [] });
  const eu = await (await get('/riot/champ?c=1103')).json();
  assert.deepEqual(eu.games.map((x) => [x.t, x.m, x.e]), [[1760003001, [1900, 10200, 22, 17000, 10, 85000], [1086, 1254, 1238, 1145, 1117]]], "Europe West's game");
  assert.equal((await get('/riot/champ?c=103', { origin: 'https://evil.example' })).headers.get('access-control-allow-origin'), null, 'other sites are not let in');

  // lookups: only the calls on the list, with their own query parameters, as Riot answers them (the counting goes on
  // meanwhile: Korea's on kr and asia, the others' ladders, game lists and EUW1_3001)
  const before = calls.length, looked = () => calls.slice(before).filter((c) => c.host !== 'kr' && c.host !== 'asia' && !c.q.includes('startTime') && !/leagues\/by-queue|EUW1_3001/.test(c.p));
  r = await get('/riot/api/europe/riot/account/v1/accounts/by-riot-id/Ana%20B/EUW');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  assert.deepEqual(await r.json(), { puuid: P('a'), gameName: 'Ana B', tagLine: 'EUW' });
  assert.equal((await get('/riot/api/europe/riot/account/v1/accounts/by-riot-id/Nobody/EUW')).status, 404, "Riot's not found passes through");
  assert.deepEqual(await (await get(`/riot/api/europe/riot/account/v1/region/by-game/lol/by-puuid/${P('a')}`)).json(), { puuid: P('a'), game: 'lol', region: 'euw1' }, 'the server Ana plays League on');
  assert.equal((await get(`/riot/api/euw1/lol/league/v4/entries/by-puuid/${P('a')}`)).status, 200);
  assert.equal((await get(`/riot/api/euw1/lol/spectator/v5/active-games/by-summoner/${P('a')}`)).status, 404, 'not in a game');
  r = await get(`/riot/api/europe/lol/match/v5/matches/by-puuid/${P('a')}/ids?count=500&type=ranked&evil=1`);
  assert.deepEqual(await r.json(), ['EUW1_7123456789']);
  assert.equal(looked().pop().q, '?count=20&type=ranked', 'count capped at 20, other parameters dropped');
  r = await get('/riot/api/europe/lol/match/v5/matches/EUW1_7123456789');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=86400/);
  r = await get('/riot/api/euw1/lol/status/v4/platform-data');
  assert.equal((await r.json()).maintenances[0].maintenance_status, 'in_progress', "the problems Riot reports on a server");
  for (const bad of ['/riot/api/europe/lol/match/v5/matches/EUW1_7123456789/timeline', '/riot/api/euw1/riot/account/v1/accounts/by-riot-id/Ana/EUW', '/riot/api/evil/lol/match/v5/matches/EUW1_7123456789',
    '/riot/api/europe/riot/account/v1/accounts/by-riot-id/%2e%2e/x', '/riot/api/euw1/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5', `/riot/api/europe/lol/league/v4/entries/by-puuid/${P('a')}`,
    `/riot/api/europe/riot/account/v1/region/by-game/val/by-puuid/${P('a')}`, `/riot/api/euw1/riot/account/v1/region/by-game/lol/by-puuid/${P('a')}`, '/riot/api/europe/lol/status/v4/platform-data'])
    assert.equal((await get(bad)).status, 404, bad);
  assert.equal(looked().length, 8, 'nothing off the list reached Riot');

  // the ranks lookups get, kept for each season (16.20 is 2026): the highest and the last, for the page's past ranks
  let past = (await (await get(`/riot/past?u=${P('a')}`)).json()).s;
  assert.deepEqual(Object.keys(past), ['2026']);
  assert.deepEqual(Object.keys(past['2026']), ['RANKED_SOLO_5x5'], 'not Arena');
  assert.deepEqual(past['2026'].RANKED_SOLO_5x5.last, ['GOLD', 'II', 40]);
  anaLost = true;
  assert.equal((await get(`/riot/api/euw1/lol/league/v4/entries/by-puuid/${P('a')}`)).status, 200);
  r = await get(`/riot/past?u=${P('a')}`);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  past = (await r.json()).s['2026'].RANKED_SOLO_5x5;
  assert.deepEqual([past.peak, past.last], [['GOLD', 'II', 40], ['GOLD', 'III', 75]], 'the highest stays');
  assert(Math.abs(past.at - Date.now() / 1000) < 60, 'with when it was seen');
  assert.deepEqual(await (await get(`/riot/past?u=${P('b')}`)).json(), { s: {} }, 'nobody looked up');
  assert.deepEqual(await (await get('/riot/past?u=..%2Fx')).json(), { s: {} });

  // one address gets 60 lookups every 2 minutes
  const ip = { 'cf-connecting-ip': '198.51.100.7' };
  let codes = [];
  for (let i = 0; i < 61; i++) { codes.push((await get(`/riot/api/kr/lol/summoner/v4/summoners/by-puuid/${P('k')}`, ip)).status); await sleep(80); }
  assert.deepEqual(codes, [...Array(60).fill(200), 429]);
  assert.equal((await get(`/riot/api/kr/lol/summoner/v4/summoners/by-puuid/${P('k')}`, { 'cf-connecting-ip': '198.51.100.8' })).status, 200, 'someone else still can');

  // when Riot says to wait, the server waits too
  slowDown = true;
  const jp = `/riot/api/jp1/lol/summoner/v4/summoners/by-puuid/${P('j')}`;
  assert.equal((await get(jp)).status, 429);
  slowDown = false;
  const jpCalls = () => calls.filter((c) => c.host === 'jp1').length, n = jpCalls();
  assert.equal((await get(jp)).status, 429, 'held off');
  assert.equal(jpCalls(), n, 'without asking Riot');
  await sleep(2200);
  assert.equal((await get(jp)).status, 200, 'and asks again once the wait is over');

  // the key never comes back
  for (const p of ['/riot/summary', '/riot/champ?c=103', '/riot/api/europe/riot/account/v1/accounts/by-riot-id/Ana%20B/EUW']) {
    const x = await get(p), text = await x.text();
    assert(!text.includes(KEY) && ![...x.headers.values()].some((v) => v.includes(KEY)), p);
  }

  // the sweep: restarted as if it had stopped while on the day 6 days ago, its games listed (so the newer days come
  // next) and one game in from before it kept bans, with a month of lane matchups older than it keeps; and the free
  // plan's use from an older day
  try { process.kill(-wr.pid); } catch {}
  for (let i = 0; ; i++) {
    try { await fetch(BASE + '/'); } catch { if (wr.exitCode !== null || wr.signalCode !== null) break; }
    assert(i < 100, 'wrangler dev did not stop');
    await sleep(200);
  }
  const { DatabaseSync } = require('node:sqlite'), dir = path.join(persist, 'v3', 'do', 'league-proxchat-Riot');
  const db = new DatabaseSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.sqlite'))));
  const had = ['16.20', (today - 6) * DAY + 7200, ...TEAM.map(([c, r], i) => [c, r, i < 5 ? 1 : 0, TEAM[(i + 5) % 10][0]])];
  db.prepare('INSERT OR REPLACE INTO kv VALUES (?, ?)').run('sweep', JSON.stringify({ lo: today - 6, hi: today - 6, li: 0, w: { d: today - 6, asked: 3, found: ['KR_2001', 'KR_2009'], q: ['KR_2001'], g: [had] } }));
  db.prepare('INSERT OR REPLACE INTO kv VALUES (?, ?)').run('use', JSON.stringify({ day: '2000-01-01', req: 5, read: 6, write: 7, ms: 8 }));
  db.prepare('INSERT INTO matchups VALUES (?, ?, ?)').run(103 % 16, '2020-01', JSON.stringify({ 103: { MIDDLE: { 238: [50, 0] } } }));
  db.close();
  const mark = calls.length;
  await up('SWEEP_DAYS:8', 'SWEEP_ROOM:100'); // room for the sweep beside this test's busy crawl
  sum = await counted(9);
  assert.equal(sum.total, 9, 'KR_2001, KR_2002, KR_2003 and the game it had count; not the ARAM, the remake, KR_1001 again or KR_2006, 9 days old');
  assert.deepEqual(sum.by, { kr: 8, euw1: 1 });
  assert.equal(sum.from, (today - 8) * DAY, 'counted back to 8 days ago');
  assert.equal(sum.on, undefined, 'and on no day now');
  assert.deepEqual(sum.c['103'], { MIDDLE: [5, 4] }, 'KR_2001 and the game it had join this patch');
  assert.deepEqual([sum.b, sum.bn], [{ 157: 5, 555: 5 }, 5], "KR_2001's bans, and none for the game it had");
  assert.deepEqual(sum.old.c['103'], { MIDDLE: [2, 2] }, 'KR_2002 the patch before, and KR_2003 neither');
  assert.deepEqual([sum.old.b, sum.old.bn], [{ 157: 2, 555: 2 }, 2]);
  assert.deepEqual([sum.use.day, sum.use.prev], [isoDay, { day: '2000-01-01', req: 5, read: 6, write: 7, ms: 8 }], 'a new day, with the one before');
  const swept = calls.slice(mark).filter((c) => c.p.endsWith('/ids') && c.q.includes('endTime')).map((c) => c.q.match(/^\?queue=420&type=ranked&startTime=(\d+)&endTime=(\d+)&count=100$/));
  assert(swept.every((x) => x && x[1] % DAY === 0 && x[2] - x[1] === DAY - 1), 'a whole UTC day each');
  assert.deepEqual(swept.map((x) => today - x[1] / DAY), [5, 5, 5, 4, 4, 4, 7, 7, 7, 8, 8, 8], 'after the day it was on, each ladder player, newer days first, then back in time');
  for (const id of Object.keys(GAMES)) assert.equal(calls.filter((c) => c.p === `/lol/match/v5/matches/${id}`).length, id === 'KR_2006' ? 0 : 1, `${id} asked for ${id === 'KR_2006' ? 'never' : 'once'}`);
  assert(!calls.some((c) => /KR_2\d+\/timeline$/.test(c.p)), 'no timelines for older games');
  const old = await (await get('/riot/champ?c=103&r=MIDDLE')).json();
  assert.deepEqual(old.y, { n: 4, w: 4, vs: { 238: [4, 4] } }, "Ahri's older games against Zed, without 2020's month");
  assert.equal(old.games.length, 4, 'its games with builds are still the last 3 days');
  console.log('riot ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} riot.close(); fs.rmSync(persist, { recursive: true, force: true }); });

// Checks the game channel (What's new 183) under `wrangler dev` against a fake Riot API: a player joins only when
// Riot's live game shows them in that game on that team, and a timer or a callout one of them sends reaches the rest
// of their team in that game, nobody else, and nothing but timers and callouts is passed on.
// WRANGLER=<path to wrangler> node game.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), http = require('http');
const { spawn } = require('child_process');

const PORT = 8791, RIOT = 8901, BASE = `ws://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(require('path').join(os.tmpdir(), 'lpc-game-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = (n) => `${n}`.repeat(78).slice(0, 78); // a puuid
// Riot's live games: P(1) and P(2) on the blue team of game 777, P(3) on its red team, P(4) in game 888, P(5) in none
const LIVE = { 777: [[P(1), 100], [P(2), 100], [P(3), 200]], 888: [[P(4), 100]] };
http.createServer((req, res) => {
  const m = req.url.match(/^\/euw1\/lol\/spectator\/v5\/active-games\/by-summoner\/([\w-]+)$/), g = m && Object.keys(LIVE).find((k) => LIVE[k].some(([u]) => u === m[1]));
  if (!g) { res.writeHead(404); return res.end('{}'); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ gameId: +g, participants: LIVE[g].map(([puuid, teamId]) => ({ puuid, teamId, championId: 1, spell1Id: 4, spell2Id: 14, perks: { perkIds: [8347] } })) }));
}).listen(RIOT, '127.0.0.1');

const join = (u, g, team) => new Promise((ok) => {
  const ws = new WebSocket(`${BASE}/game?plat=euw1&u=${u}&g=${g}&team=${team}`), got = [];
  ws.onmessage = (e) => got.push(JSON.parse(e.data));
  ws.onopen = () => ok({ ws, got });
  ws.onerror = () => ok(null);
});

const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist,
  ...['RIOT_KEY:test-key', `RIOT_BASE:http://127.0.0.1:${RIOT}/{host}`].flatMap((v) => ['--var', v])], { cwd: __dirname, detached: true, stdio: 'ignore' });
(async () => {
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(500); }
    const a = await join(P(1), 777, 100), b = await join(P(2), 777, 100), red = await join(P(3), 777, 200);
    assert(a && b && red, 'players in that game on their team join');
    assert.strictEqual(await join(P(3), 777, 100), null, 'not on the other team');
    assert.strictEqual(await join(P(4), 777, 100), null, 'not in another game');
    assert.strictEqual(await join(P(5), 777, 100), null, 'not when Riot shows no game');
    const timer = { t: 'timer', g: 'g0123456789a', k: 'flash:Caitlyn', end: 754, by: 'Kai' }, call = { t: 'call', k: 'mid', what: 'missing', by: 'Kai' };
    a.ws.send(JSON.stringify(timer));
    a.ws.send(JSON.stringify(call));
    a.ws.send(JSON.stringify({ t: 'chat', text: 'hi' }));
    a.ws.send(JSON.stringify({ t: 'call', pad: 'x'.repeat(700) }));
    await sleep(1000);
    assert.deepStrictEqual(b.got, [timer, call], 'the timer and the callout reach the teammate, nothing else');
    assert.deepStrictEqual(a.got, [], 'not back to the sender');
    assert.deepStrictEqual(red.got, [], 'not to the other team');
    console.log('game channel: only players Riot shows in that game on that team join; timers and callouts reach their team only');
  } finally { process.kill(-wr.pid); process.exit(process.exitCode || 0); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

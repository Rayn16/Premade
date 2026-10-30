// Checks the daily counter (/stats) under `wrangler dev`: rooms and players are counted once a day, a taken slot and
// phone remotes aren't counted, and the same address in two rooms is one player. And who has Premade: /hello keeps
// each device's version, name and Riot IDs with when it first and last opened, and only the owner's key gets /who, with
// no line for a page on the same computer (our tests) or like the ones they made before. And
// Friends: /friends says which Riot IDs have Premade (any case, not your own device) and gives a device the invites to
// its Riot IDs, and /inbox is a socket that hears 'inv' the moment one of them is invited; /invite needs a device that said hello, and a new invite from the same device replaces the last; lob, a lobby's hash, comes back as it was sent.
// Aion 2: /aion/boss, /aion/ticks and /aion/fights take a kill, a tick or a fight only for a Riot ID the device said
// hello with, and the 30-minute cron starts the tracker's update on GitHub with GH_TOKEN (here a stand-in GitHub on GH_PORT).
// WRANGLER=<path to wrangler> NODE_PATH=<folder with ws> node stats.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8787, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-stats-'));
const OWNER = 'the owner key', GH_PORT = 8790, github = [];
require('http').createServer((q, r) => { let body = ''; q.on('data', (d) => (body += d)).on('end', () => { github.push({ method: q.method, url: q.url, auth: q.headers.authorization, ua: q.headers['user-agent'], body }); r.writeHead(204).end(); }); }).listen(GH_PORT).unref();
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist, '--var', `OWNER_KEY:${OWNER}`,
  '--var', 'GH_TOKEN:the token', '--var', `GH_API:http://127.0.0.1:${GH_PORT}`, '--test-scheduled'], { cwd: __dirname, detached: true, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function join(id, token, ip) { // resolves with the server's first message type: OPEN or ID-TAKEN
  return new Promise((ok, bad) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/peerjs?key=peerjs&id=${id}&token=${token}&version=1.5.4`, { headers: { 'CF-Connecting-IP': ip } });
    ws.once('message', (m) => ok({ ws, type: JSON.parse(m).type }));
    ws.once('error', bad);
  });
}

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  const get = async () => { const r = await fetch(BASE + '/stats'); assert.equal(r.headers.get('access-control-allow-origin'), '*'); return (await r.json()).days; };
  assert.deepEqual(await get(), []);
  const open = [];
  for (const [id, token, ip, want] of [
    ['lolprox-abcd-0', 't1', '203.0.113.1', 'OPEN'],
    ['lolprox-abcd-1', 't2', '203.0.113.2', 'OPEN'],
    ['lolprox-abcd-0', 't3', '203.0.113.3', 'ID-TAKEN'], // someone else's slot: not counted
    ['lolprox-g0123456789a-0', 't4', '203.0.113.1', 'OPEN'], // the first player again, in a game room
    ['lolprox-rabcdefghijkm-1', 't5', '203.0.113.9', 'OPEN'], // a phone remote: not counted
    ['lolprox-abcd-0', 't1', '203.0.113.1', 'OPEN'], // the first player reconnecting
  ]) {
    const j = await join(id, token, ip);
    assert.equal(j.type, want, id);
    open.push(j.ws);
  }
  await sleep(1000);
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(await get(), [{ day: today, rooms: 2, players: 2 }]);
  for (const ws of open) ws.close();

  const post = (p, b) => fetch(BASE + p, { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) });
  const A = '0f8c1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b', B = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  for (const bad of ['not json', {}, { id: 'abc', v: 'web' }, { id: A, v: '1.13' }, { id: A.toUpperCase(), v: 'web' }]) assert.equal((await post('/hello', bad)).status, 400, JSON.stringify(bad));
  const h = await post('/hello', { id: A, v: 'web', name: '', riot: [] });
  assert.equal(h.status, 204);
  assert.equal(h.headers.get('access-control-allow-origin'), '*');
  await sleep(1100);
  assert.equal((await post('/hello', { id: B, v: '1.13.0', name: 'Rayan the very long voice name', riot: ['Rayan#EUW', 'no tag', 'Smurf#1234', 42] })).status, 204);
  await sleep(1100);
  assert.equal((await post('/hello', { id: A, v: 'web', name: 'Kev', riot: ['Kev#NA1'] })).status, 204); // the same device again, now with a name
  const T = '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f', U = '4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a';
  const local = await fetch(BASE + '/hello', { method: 'POST', headers: { origin: 'http://127.0.0.1:8083' }, body: JSON.stringify({ id: T, v: '1.15.0', name: 'Ana', riot: [] }) });
  assert.equal(local.status, 204); // a page on the same computer, one of our tests: not kept
  assert.equal((await post('/hello', { id: U, v: '1.13.0', name: 'Rayan', riot: [] })).status, 204); // like our tests' pages made before: gone at /who
  for (const key of [undefined, '', 'the owner kez', 'the owner key!']) assert.equal((await post('/who', { key })).status, 403, String(key));
  assert.equal((await fetch(BASE + '/who')).status, 404); // only POST
  const w = await post('/who', { key: OWNER });
  assert.equal(w.status, 200);
  assert.equal(w.headers.get('access-control-allow-origin'), '*');
  const { apps } = await w.json(), now = Date.now() / 1000;
  assert.deepEqual(apps.map(({ first, last, ...a }) => a), [ // the last opened first, and no device ids
    { v: 'web', name: 'Kev', riot: ['Kev#NA1'] },
    { v: '1.13.0', name: 'Rayan the very long voic', riot: ['Rayan#EUW', 'Smurf#1234'] },
  ]);
  assert(apps.every((a) => Math.abs(a.last - now) < 30 && a.first <= a.last), JSON.stringify(apps));
  assert(apps[0].first < apps[0].last, 'the first opening is kept');
  const C = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', fr = async (b) => (await post('/friends', b)).json();
  assert.deepEqual((await fr({ riot: ['Kev#NA1'] })).has, {}, 'not until Kev’s own page asks /friends');
  await fr({ id: A, riot: [] });
  const kev = (await fr({ riot: ['Kev#NA1'] })).has['kev#na1'];
  assert(Math.abs(kev - now) < 30, 'Kev has Premade');
  assert.deepEqual(await fr({ id: B, riot: ['kev#na1', 'rayan#euw', 'Nobody#EUW', 'bad'] }), { has: { 'kev#na1': kev }, inv: [] }); // not your own
  assert.deepEqual(await fr({ id: 'nope', riot: 'x' }), { has: {}, inv: [] });
  for (const bad of [{}, { id: B, to: 'Kev', room: 'abcd' }, { id: B, to: 'Kev#NA1', room: 'AB CD' }, { id: B, to: 'Kev#NA1', room: 'abcd', key: 'NO1' }, { id: B, to: 'Kev#NA1', room: 'abcd', key: ['a'] }, { id: B, to: 'Kev#NA1', room: 'abcd', lob: 'abc' }, { id: B, to: 'Kev#NA1', room: 'abcd', lob: 'A'.repeat(64) }])
    assert.equal((await post('/invite', bad)).status, 400, JSON.stringify(bad));
  assert.match((await (await post('/invite', { id: C, to: 'Kev#NA1', room: 'abcd' })).json()).error || '', /^Turn on/); // a device that never said hello
  assert.equal(await new Promise((ok) => new WebSocket(`ws://127.0.0.1:${PORT}/inbox?id=${C}`).once('unexpected-response', (q, r) => ok(r.statusCode)).once('open', () => ok('open'))), 404, 'no inbox before a hello');
  const inbox = new WebSocket(`ws://127.0.0.1:${PORT}/inbox?id=${A}`), heard = [];
  await new Promise((ok, bad) => { inbox.once('open', ok); inbox.once('error', bad); });
  inbox.on('message', (m) => heard.push(String(m)));
  inbox.send('ping');
  assert.deepEqual(await (await post('/invite', { id: B, to: 'KEV#na1', room: 'abcd', key: '' })).json(), { ok: true });
  for (let i = 0; heard.length < 2 && i < 40; i++) await sleep(50);
  assert.deepEqual(heard, ['pong', 'inv'], 'Kev’s page hears the invite at once');
  inbox.close();
  assert.deepEqual(await (await post('/invite', { id: B, to: 'Kev#NA1', room: 'efgh', key: 'pass', lob: 'c'.repeat(64) })).json(), { ok: true }); // replaces it
  const { inv } = await fr({ id: A, riot: [] });
  assert.deepEqual(inv.map(({ at, ...v }) => v), [{ n: 'Rayan the very long voic', riot: 'Rayan#EUW', room: 'efgh', key: 'pass', lob: 'c'.repeat(64) }]);
  assert.deepEqual((await fr({ id: B, riot: [] })).inv, []);
  assert.deepEqual((await fr({ id: '', riot: [] })).inv, [], 'no device, no invites');
  // Aion 2 characters: only for a Riot ID the device said hello with, ten each, a new claim takes the character over
  const aion = async (b) => (await post('/aion', b)).json(), chars = async () => (await (await fetch(BASE + '/aion')).json()).chars;
  assert.deepEqual(await chars(), []);
  for (const bad of [{}, { id: B, o: 'Rayan#EUW', n: 'a,b', s: 'Tassin' }, { id: B, o: 'no tag', n: 'Yasuo', s: 'Tassin' }, { id: B, o: 'Rayan#EUW', n: 'Yasuo', s: '<b>' }])
    assert.equal((await post('/aion', bad)).status, 400, JSON.stringify(bad));
  assert.match((await aion({ id: B, o: 'Kev#NA1', n: 'Yasuo', s: 'Tassin' })).error, /^Turn on/, 'not B’s Riot ID');
  assert.match((await aion({ id: C, o: 'Rayan#EUW', n: 'Yasuo', s: 'Tassin' })).error, /^Turn on/, 'never said hello');
  assert.deepEqual(await aion({ id: B, o: 'rayan#euw', n: 'Yasuo', s: 'Tassin' }), { ok: true });
  assert.deepEqual(await aion({ id: B, o: 'Rayan#EUW', n: 'Yasuo', s: 'Tassin' }), { ok: true }); // again: still one
  assert.deepEqual(await chars(), [{ n: 'Yasuo', s: 'Tassin', o: 'Rayan#EUW' }]);
  for (let i = 0; i < 9; i++) assert.deepEqual(await aion({ id: B, o: 'Rayan#EUW', n: 'Alt' + i, s: 'Ariel' }), { ok: true });
  assert.match((await aion({ id: B, o: 'Rayan#EUW', n: 'Alt9', s: 'Ariel' })).error, /^Ten/);
  assert.deepEqual(await aion({ id: A, o: 'Kev#NA1', n: 'Yasuo', s: 'Tassin' }), { ok: true }); // Kev takes it over
  assert.deepEqual(await aion({ id: B, o: 'Rayan#EUW', n: 'Yasuo', s: 'Tassin', del: true }), { ok: true }); // not Rayan's any more: nothing
  assert.deepEqual((await chars()).filter((c) => c.n === 'Yasuo'), [{ n: 'Yasuo', s: 'Tassin', o: 'Kev#NA1' }]);
  assert.deepEqual(await aion({ id: A, o: 'Kev#NA1', n: 'Yasuo', s: 'Tassin', del: true }), { ok: true });
  assert.equal((await chars()).length, 9);
  const D = '5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b'; // a Riot ID with a capital that isn't ASCII
  assert.equal((await post('/hello', { id: D, v: 'web', name: 'Ödön', riot: ['Ödön#EUW'] })).status, 204);
  assert.deepEqual(await aion({ id: D, o: 'Ödön#EUW', n: 'Odin', s: 'Ariel' }), { ok: true });
  assert.equal((await chars()).length, 10);
  assert.deepEqual(await aion({ id: D, o: 'Ödön#EUW', n: 'Odin', s: 'Ariel', del: true }), { ok: true });
  assert.equal((await chars()).length, 9, 'Remove works for it too');
  // Aion 2 boss kills: a device marks one for a Riot ID it said hello with; a new mark replaces the last, del takes it off
  const kills = async () => (await (await fetch(BASE + '/aion/boss')).json()).kills, boss = async (b) => (await post('/aion/boss', b)).json();
  assert.deepEqual(await kills(), []);
  const t0 = Date.now();
  for (const bad of [{}, { id: B, o: 'Rayan#EUW', s: 'Tassin' }, { id: B, o: 'Rayan#EUW', s: 'Tassin', b: '<b>' }, { id: B, o: 'Rayan#EUW', s: 'Tassin', b: 'Melted Danar', at: t0 + 864e5 },
    { id: B, o: 'Rayan#EUW', s: 'Tassin', b: 'Melted Danar', at: t0 - 2 * 864e5 }, { id: B, o: 'Rayan#EUW', s: 'Tassin', b: 'Melted Danar', at: 'soon' }])
    assert.equal((await post('/aion/boss', bad)).status, 400, JSON.stringify(bad));
  assert.match((await boss({ id: C, o: 'Rayan#EUW', s: 'Tassin', b: 'Melted Danar' })).error, /^Turn on/, 'never said hello');
  assert.deepEqual(await boss({ id: B, o: 'rayan#euw', s: 'Tassin', b: "Sentinel K'nash", at: t0 - 6e5 }), { ok: true });
  assert.deepEqual(await boss({ id: A, o: 'Kev#NA1', s: 'Tassin', b: 'Melted Danar' }), { ok: true });
  let k = await kills();
  assert.deepEqual(k.map(({ at, ...x }) => x), [{ s: 'Tassin', b: "Sentinel K'nash", o: 'Rayan#EUW' }, { s: 'Tassin', b: 'Melted Danar', o: 'Kev#NA1' }]); // oldest first, o as its hello gave it
  assert.equal(k[0].at, t0 - 6e5);
  assert(Math.abs(k[1].at - Date.now()) < 5000, 'now when at is left out');
  assert.deepEqual(await boss({ id: B, o: 'Rayan#EUW', s: 'Tassin', b: 'Melted Danar', del: true }), { ok: true }); // anyone can take a wrong mark off
  assert.deepEqual((await kills()).map((x) => x.b), ["Sentinel K'nash"]);
  // the checklist: a tick is set (0 takes it off) only for your own Riot ID
  const ticks = async () => (await (await fetch(BASE + '/aion/ticks')).json()).ticks, tick = async (b) => (await post('/aion/ticks', b)).json();
  assert.deepEqual(await ticks(), []);
  for (const bad of [{ id: B, o: 'Rayan#EUW', k: 'Yasuo', n: 1 }, { id: B, o: 'Rayan#EUW', k: 'Yasuo:Night', n: 1 }, { id: B, o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: -1 },
    { id: B, o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: 100 }, { id: B, o: 'Rayan#EUW', k: 'Ya suo:nightmare', n: 1 }, { id: B, o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: 1.5 }])
    assert.equal((await post('/aion/ticks', bad)).status, 400, JSON.stringify(bad));
  assert.match((await tick({ id: A, o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: 1 })).error, /^Turn on/, 'not A’s Riot ID');
  const t1 = await tick({ id: B, o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: 1 });
  assert(t1.ok && Math.abs(t1.at - Date.now()) < 5000, JSON.stringify(t1));
  assert.deepEqual((await tick({ id: B, o: 'RAYAN#euw', k: 'Yasuo:nightmare', n: 2 })).ok, true); // the same tick, counted up
  assert.deepEqual((await tick({ id: B, o: 'Rayan#EUW', k: 'Tassin:duty', n: 5 })).ok, true);
  assert.deepEqual((await ticks()).map(({ at, ...x }) => x).sort((a, b) => a.k.localeCompare(b.k)), [{ o: 'Rayan#EUW', k: 'Tassin:duty', n: 5 }, { o: 'Rayan#EUW', k: 'Yasuo:nightmare', n: 2 }]);
  assert.deepEqual((await tick({ id: B, o: 'Rayan#EUW', k: 'Tassin:duty', n: 0 })).ok, true);
  assert.deepEqual((await ticks()).map((x) => x.k), ['Yasuo:nightmare']);
  // fights: only a fight that adds up, for your own Riot ID; the same at replaces it, del takes it off, the newest 100 each
  const fights = async () => (await (await fetch(BASE + '/aion/fights')).json()).fights, fight = async (b) => (await post('/aion/fights', b)).json();
  assert.deepEqual(await fights(), []);
  const f0 = { id: B, o: 'Rayan#EUW', at: Date.now() - 6e4, c: 'Yasuo', tg: 'Melee Training Scarecrow', t: 73, d: 15938, dmg: 1175060, k: [['Upward Strike', 331020, 28], ['Rage Burst', 5712, 0]] };
  for (const bad of [{ ...f0, t: 2 }, { ...f0, d: 20000 }, { ...f0, dmg: 0, d: 0 }, { ...f0, at: 'now' }, { ...f0, at: Date.now() + 864e5 }, { ...f0, at: Date.now() - 61 * 864e5 }, { ...f0, tg: '<b>' },
    { ...f0, c: 'a b' }, { ...f0, k: [['<b>', 1, 0]] }, { ...f0, k: [['Upward Strike', 1, 101]] }, { ...f0, k: [['Upward Strike', 2e6, 1]] }, { ...f0, k: Array(8).fill(['Upward Strike', 1, 0]) }, { id: B, o: 'Rayan#EUW', del: true }])
    assert.equal((await post('/aion/fights', bad)).status, 400, JSON.stringify(bad));
  assert.match((await fight({ ...f0, id: A })).error, /^Turn on/, 'not A’s Riot ID');
  assert.deepEqual(await fight({ ...f0, o: 'rayan#euw' }), { ok: true });
  assert.deepEqual(await fight({ ...f0, t: 80, d: 14688, k: [] }), { ok: true }); // the same at: it replaces the first
  assert.deepEqual(await fights(), [{ o: 'Rayan#EUW', at: f0.at, c: 'Yasuo', tg: 'Melee Training Scarecrow', t: 80, d: 14688, dmg: 1175060, k: [] }]);
  const t2 = Date.now() - 3e4;
  for (let i = 0; i < 100; i++) assert.deepEqual(await fight({ ...f0, at: t2 + i }), { ok: true });
  let fs2 = await fights();
  assert.equal(fs2.length, 100);
  assert(!fs2.some((f) => f.at === f0.at), 'the oldest went');
  assert.deepEqual(await fight({ id: B, o: 'Rayan#EUW', at: t2, del: true }), { ok: true });
  fs2 = await fights();
  assert.equal(fs2.length, 99);
  assert(!fs2.some((f) => f.at === t2), 'taken off');
  // the cron starts the Aion 2 tracker's update on GitHub
  assert.equal((await fetch(BASE + '/__scheduled?cron=*/30+*+*+*+*')).status, 200);
  for (let i = 0; i < 20 && !github.length; i++) await sleep(250);
  assert.deepEqual(github, [{ method: 'POST', url: '/repos/Rayn16/aion2-tracker/actions/workflows/update.yml/dispatches', auth: 'Bearer the token', ua: 'Premade (github.com/Rayn16/Premade)', body: '{"ref":"main"}' }]);
  console.log('stats ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

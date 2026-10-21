// Checks the daily counter (/stats) under `wrangler dev`: rooms and players are counted once a day, a taken slot and
// phone remotes aren't counted, and the same address in two rooms is one player. And who has Premade: /hello keeps
// each device's version, name and Riot IDs with when it first and last opened, and only the owner's key gets /who, with
// no line for a page on the same computer (our tests) or like the ones they made before. And
// Friends: /friends says which Riot IDs have Premade (any case, not your own device) and gives a device the invites to
// its Riot IDs; /invite needs a device that said hello, and a new invite from the same device replaces the last.
// WRANGLER=<path to wrangler> NODE_PATH=<folder with ws> node stats.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8787, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-stats-'));
const OWNER = 'the owner key';
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist, '--var', `OWNER_KEY:${OWNER}`], { cwd: __dirname, detached: true, stdio: 'ignore' });
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
  for (const bad of [{}, { id: B, to: 'Kev', room: 'abcd' }, { id: B, to: 'Kev#NA1', room: 'AB CD' }, { id: B, to: 'Kev#NA1', room: 'abcd', key: 'NO1' }, { id: B, to: 'Kev#NA1', room: 'abcd', key: ['a'] }])
    assert.equal((await post('/invite', bad)).status, 400, JSON.stringify(bad));
  assert.match((await (await post('/invite', { id: C, to: 'Kev#NA1', room: 'abcd' })).json()).error || '', /^Turn on/); // a device that never said hello
  assert.deepEqual(await (await post('/invite', { id: B, to: 'KEV#na1', room: 'abcd', key: '' })).json(), { ok: true });
  assert.deepEqual(await (await post('/invite', { id: B, to: 'Kev#NA1', room: 'efgh', key: 'pass' })).json(), { ok: true }); // replaces it
  const { inv } = await fr({ id: A, riot: [] });
  assert.deepEqual(inv.map(({ at, ...v }) => v), [{ n: 'Rayan the very long voic', riot: 'Rayan#EUW', room: 'efgh', key: 'pass' }]);
  assert.deepEqual((await fr({ id: B, riot: [] })).inv, []);
  assert.deepEqual((await fr({ id: '', riot: [] })).inv, [], 'no device, no invites');
  console.log('stats ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

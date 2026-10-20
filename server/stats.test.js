// Checks the rooms under `wrangler dev`: the daily counter (/stats) counts rooms and players once a day, a taken slot
// and phone remotes aren't counted, and the same address in two rooms is one player. A locked room only lets in who
// has its password, and only its host changes it or removes someone.
// WRANGLER=<path to wrangler> NODE_PATH=<folder with ws> node stats.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8787, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-stats-'));
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist], { cwd: __dirname, detached: true, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function join(id, token, ip, key = 'peerjs') { // resolves with the server's first message type: OPEN, ID-TAKEN or INVALID-KEY
  return new Promise((ok, bad) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/peerjs?key=${key}&id=${id}&token=${token}&version=1.5.4`, { headers: { 'CF-Connecting-IP': ip } });
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

  // a locked room: the first one in sets its password (as the page sends it, a SHA-256 of it), and it lasts while
  // anyone is in; only the host, the lowest slot in, changes it or removes someone
  const K1 = 'a'.repeat(64), K2 = 'b'.repeat(64), next = (ws) => new Promise((ok) => ws.once('message', (m) => ok(JSON.parse(m).type)));
  const host = await join('lolprox-lock-0', 'h', '203.0.113.20', K1);
  assert.equal(host.type, 'OPEN', 'the first one in');
  for (const key of ['peerjs', K2, 'nothex']) assert.equal((await join('lolprox-lock-1', 'x', '203.0.113.21', key)).type, 'INVALID-KEY', key);
  const ana = await join('lolprox-lock-1', 'a', '203.0.113.22', K1);
  assert.equal(ana.type, 'OPEN', 'with the password');
  ana.ws.send(JSON.stringify({ type: 'LOCK', payload: { key: 'peerjs' } }));
  await sleep(300);
  assert.equal((await join('lolprox-lock-2', 'b', '203.0.113.23', 'peerjs')).type, 'INVALID-KEY', 'only the host changes it');
  const gone = next(ana.ws);
  host.ws.send(JSON.stringify({ type: 'LOCK', payload: { key: K2, drop: 'lolprox-lock-1' } }));
  assert.equal(await gone, 'INVALID-KEY', 'the host removed Ana');
  assert.equal((await join('lolprox-lock-1', 'a', '203.0.113.22', K1)).type, 'INVALID-KEY', 'and changed the password');
  const bo = await join('lolprox-lock-2', 'b', '203.0.113.23', K2);
  assert.equal(bo.type, 'OPEN', 'the new password');
  host.ws.send(JSON.stringify({ type: 'LOCK', payload: { key: 'peerjs' } }));
  await sleep(300);
  const cy = await join('lolprox-lock-3', 'c', '203.0.113.24', K1);
  assert.equal(cy.type, 'OPEN', 'unlocked: anyone with the room code');
  host.ws.send(JSON.stringify({ type: 'LOCK', payload: { key: K2 } }));
  for (const j of [host, bo, cy]) j.ws.close();
  await sleep(500);
  const last = await join('lolprox-lock-0', 'd', '203.0.113.25');
  assert.equal(last.type, 'OPEN', 'no lock once everyone left');
  last.ws.close();
  console.log('stats ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

// Checks locked rooms under `wrangler dev`: an open room passes everything on; once the host locks it, a newcomer is
// let in only with the password's key, a wrong or missing key is turned away, only the host can change the key, a
// removed player's socket closes, and the lock is forgotten once everyone has left.
// WRANGLER=<path to wrangler> NODE_PATH=<folder with ws> node lock.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8789, ROOM = 'lockt';
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-lock-'));
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist], { cwd: __dirname, detached: true, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K1 = 'a'.repeat(64), K2 = 'b'.repeat(64);

// a player in slot s: its socket, everything the server sent it, and whether it was closed
function join(s, token = 't' + s + Math.random()) {
  return new Promise((ok, bad) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/peerjs?key=peerjs&id=lolprox-${ROOM}-${s}&token=${token}&version=1.5.4`);
    const p = { ws, id: `lolprox-${ROOM}-${s}`, token, got: [], closed: false };
    ws.on('message', (m) => p.got.push(JSON.parse(m)));
    ws.on('close', () => { p.closed = true; });
    ws.once('open', () => ok(p));
    ws.once('error', bad);
  });
}
const lock = (p, key, out) => p.ws.send(JSON.stringify({ type: 'LOCK', payload: { key, ...(out && { out }) } }));
const offer = (p, q) => p.ws.send(JSON.stringify({ type: 'OFFER', dst: q.id, payload: { n: Math.random() } }));
const offers = (p, from) => p.got.filter((m) => m.type === 'OFFER' && m.src === from.id).length;
// p offers to q: whether q got it
async function reaches(p, q) {
  const n = offers(q, p);
  offer(p, q);
  await sleep(300);
  return offers(q, p) > n;
}
const turnedAway = (p) => p.closed && p.got.some((m) => m.type === 'INVALID-KEY');

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  // an open room: everything passes, and a key from someone who isn't the host changes nothing
  const ana = await join(0), ben = await join(1);
  await sleep(300);
  assert.deepEqual(ana.got.map((m) => m.type), ['OPEN']);
  lock(ana, ''); lock(ben, K2);
  assert(await reaches(ana, ben) && await reaches(ben, ana), 'an open room passes offers on');
  const cat0 = await join(2);
  lock(cat0, '');
  assert(await reaches(cat0, ana), 'Ben\'s key didn\'t lock the room');
  cat0.ws.close();

  // the host locks it: those already in stay in
  lock(ana, K1);
  await sleep(300);
  assert(await reaches(ben, ana) && await reaches(ana, ben), 'Ben is still in');
  // a newcomer is passed nothing until its key matches, and a wrong or missing key is turned away
  const cat = await join(2);
  assert(!(await reaches(cat, ana)), 'nothing from Cat before her key');
  lock(cat, '');
  await sleep(300);
  assert(turnedAway(cat), 'no key: turned away');
  const dee = await join(2);
  lock(dee, K2);
  await sleep(300);
  assert(turnedAway(dee), 'a wrong key: turned away');
  assert(!dee.got.some((m) => m.type === 'OFFER') && !cat.got.some((m) => m.type === 'OFFER'), 'nothing passed to them');
  const eve = await join(2);
  lock(eve, K1);
  await sleep(300);
  assert(!eve.closed && await reaches(eve, ana) && await reaches(ana, eve), 'the right key: let in');
  // Ben, who isn't the host, can't change it
  lock(ben, K2);
  await sleep(300);
  const fay = await join(3);
  lock(fay, K2);
  await sleep(300);
  assert(turnedAway(fay), 'Ben\'s new key didn\'t take');
  // the host removes Eve: a new key, Eve's socket closes, and her key stops working
  lock(ana, K2, eve.id);
  await sleep(300);
  assert(eve.closed && !eve.got.some((m) => m.type === 'INVALID-KEY'), 'Eve\'s socket closed');
  const eve2 = await join(2, eve.token);
  lock(eve2, K1);
  await sleep(300);
  assert(turnedAway(eve2), 'the old key no longer works');
  // Ben's connection drops and comes back with the new key
  ben.ws.close();
  await sleep(300);
  const ben2 = await join(1, ben.token);
  assert(!(await reaches(ben2, ana)), 'Ben\'s new socket waits for his key');
  lock(ben2, K2);
  await sleep(300);
  assert(await reaches(ben2, ana) && await reaches(ana, ben2), 'Ben back in with the new key');
  // the host leaves: Ben is the host now and can change it
  ana.ws.close();
  await sleep(300);
  lock(ben2, K1);
  await sleep(300);
  const gus = await join(0);
  lock(gus, K1);
  await sleep(300);
  assert(!gus.closed && await reaches(gus, ben2), 'Ben, the new host, changed the key');
  // everyone leaves: the room is open again
  for (const p of [ben2, gus]) p.ws.close();
  await sleep(500);
  const hal = await join(0), ida = await join(1);
  lock(hal, ''); lock(ida, '');
  await sleep(300);
  assert(!hal.closed && !ida.closed && await reaches(ida, hal), 'open again once everyone left');
  // the first one back with the password locks it again
  for (const p of [hal, ida]) p.ws.close();
  await sleep(500);
  const jo = await join(0);
  lock(jo, K1);
  await sleep(300);
  const kim = await join(1);
  lock(kim, '');
  await sleep(300);
  assert(turnedAway(kim), 'locked again by the first one back');
  jo.ws.close();
  console.log('lock ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

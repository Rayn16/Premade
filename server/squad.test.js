// Checks squads (/squad/..., squad.js) and the esports matches (/esports, esports.js) under `wrangler dev`, against a
// fake push service and a fake LoL Esports: members join with a name (their remote codes never come back), a call
// reaches the others' phones that sent their keys, encrypted so only that phone reads it (with who it's for and how
// to answer), at most once a minute; answers to it; pings for a game and a rank-up only to who wants them, at most one
// a minute; the big leagues' matches, asked once in a while; pick'em guesses only before a match starts and for its
// teams, its winner once it's over; leaving, and the last one out deleting the squad.
// WRANGLER=<path to wrangler> node squad.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const { subtle } = globalThis.crypto;

const PORT = 8791, PUSH = 8898, ESP = 8899, BASE = `http://127.0.0.1:${PORT}`, SVC = `http://127.0.0.1:${PUSH}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-squad-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const got = []; // what the fake push service was sent
http.createServer((req, res) => {
  const body = [];
  req.on('data', (d) => body.push(d));
  req.on('end', () => { got.push({ url: req.url, headers: req.headers, body: Buffer.concat(body) }); res.writeHead(201); res.end(); });
}).listen(PUSH, '127.0.0.1');

// the fake LoL Esports: Worlds, the LCK and the LFL (not a big league); Worlds' T1 against Gen.G 5 s after the esports
// part below starts (SOON), the LCK's HLE against KT that ended an hour ago, a match with a team not decided yet, an
// LFL match and a show
const asked = [];
const team = (code, name, gameWins = 0, outcome = null) => ({ name, code, image: '', result: { gameWins, outcome }, record: null });
const ev = (id, slug, name, at, state, teams) => ({ startTime: new Date(at).toISOString(), state, type: 'match', blockName: 'Swiss stage', league: { name, slug }, match: { id, flags: [], teams, strategy: { type: 'bestOf', count: 3 } } });
let SOON = 0;
let t1Won = false;
http.createServer((req, res) => {
  asked.push(req.url);
  assert.strictEqual(req.headers['x-api-key'], '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z');
  const send = (j) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
  if (req.url === '/getLeagues?hl=en-US') return send({ data: { leagues: [{ id: '1', slug: 'worlds', name: 'Worlds' }, { id: '2', slug: 'lck', name: 'LCK' }, { id: '3', slug: 'lfl', name: 'LFL' }] } });
  if (req.url === '/getSchedule?hl=en-US&leagueId=1,2') return send({ data: { schedule: { updated: '', pages: { older: null, newer: null }, events: [
    ev('111', 'worlds', 'Worlds', SOON, t1Won ? 'completed' : 'unstarted', [team('T1', 'T1', t1Won ? 2 : 0, t1Won ? 'win' : null), team('GEN', 'Gen.G', t1Won ? 1 : 0, t1Won ? 'loss' : null)]),
    ev('222', 'lck', 'LCK', Date.now() - 36e5, 'completed', [team('HLE', 'Hanwha Life Esports', 2, 'win'), team('KT', 'KT Rolster', 0, 'loss')]),
    ev('333', 'worlds', 'Worlds', Date.now() + 864e5, 'unstarted', [team('TBD', 'TBD'), team('T1', 'T1')]),
    ev('444', 'lfl', 'LFL', Date.now() + 864e5, 'unstarted', [team('KC', 'Karmine Corp'), team('VIT', 'Vitality')]),
    { startTime: new Date().toISOString(), state: 'unstarted', type: 'show', blockName: 'Show', league: { name: 'Worlds', slug: 'worlds' } },
  ] } } });
  res.writeHead(404);
  res.end();
}).listen(ESP, '127.0.0.1');

const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist,
  '--var', `PUSH_OK:^${SVC.replace(/\./g, '\\.')}/`, '--var', `ESPORTS_API:http://127.0.0.1:${ESP}`, '--var', 'ESPORTS_MS:1000'], { cwd: __dirname, detached: true, stdio: 'ignore' });
const b64 = (b) => Buffer.from(b).toString('base64url'), unb64 = (s) => Buffer.from(s, 'base64url');
const post = (p, j) => fetch(BASE + p, { method: 'POST', body: JSON.stringify(j) }); // text/plain, as the pages send it
const state = async () => (await fetch(`${BASE}/squad/${SQ}`)).json();

// a phone: its key pair and secret, as PushManager.subscribe makes them, and what it reads in a push
async function phone() {
  const k = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), auth = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return { k, auth, keys: { p256dh: b64(await subtle.exportKey('raw', k.publicKey)), auth: b64(auth) } };
}
async function hkdf(salt, ikm, info, n) {
  return Buffer.from(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
}
async function read(ph, body) { // RFC 8291, as a phone opens it
  assert.strictEqual(body.readUInt32BE(16), 4096, 'one record');
  const salt = body.subarray(0, 16), as = body.subarray(21, 21 + body[20]), ua = unb64(ph.keys.p256dh);
  const shared = Buffer.from(await subtle.deriveBits({ name: 'ECDH', public: await subtle.importKey('raw', as, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ph.k.privateKey, 256));
  const ikm = await hkdf(ph.auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const key = await subtle.importKey('raw', await hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const out = Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: await hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12) }, key, body.subarray(21 + body[20])));
  assert.strictEqual(out[out.length - 1], 2, 'the last record');
  return JSON.parse(out.subarray(0, -1).toString());
}

const SQ = 'sq0000000001', A = 'aaaaaaaaaaaa', B = 'bbbbbbbbbbbb', C = 'cccccccccccc', CODE_A = 'codeaaaaaaaa', CODE_B = 'codebbbbbbbb';
(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  // phones: Rayan's on code A, Zed's on code B, and an old remote on code B that never sent its keys
  const pa = await phone(), pb = await phone();
  const keyB = (await (await fetch(`${BASE}/push/${CODE_B}`)).json()).key;
  await fetch(`${BASE}/push/${CODE_A}`);
  assert.deepStrictEqual(await (await post(`/push/${CODE_A}`, { add: SVC + '/a', keys: pa.keys })).json(), { ok: true });
  assert.deepStrictEqual(await (await post(`/push/${CODE_B}`, { add: SVC + '/b', keys: pb.keys })).json(), { ok: true });
  assert.deepStrictEqual(await (await post(`/push/${CODE_B}`, { add: SVC + '/old', keys: { p256dh: 'short', auth: 'x' } })).json(), { ok: true }, 'keys that don’t look right: a phone for matches found only');

  // ---- joining
  assert.strictEqual((await post(`/squad/${SQ}`, { id: 'short', n: 'Who' })).status, 400, 'a member id');
  assert.strictEqual((await post(`/squad/${SQ}`, { id: A, n: '  ' })).status, 400, 'a name');
  assert.strictEqual((await fetch(`${BASE}/squad/short`)).status, 404);
  for (const [id, n, c, g, r] of [[A, 'Rayan', CODE_A, true, true], [B, 'Zed', CODE_B, true, false], [C, 'Ana', '', true, true]]) assert.deepStrictEqual(await (await post(`/squad/${SQ}`, { id, n, c, g, r })).json(), { ok: true });
  let s = await state();
  assert.deepStrictEqual(s, { m: [{ id: A, n: 'Rayan', phone: true, g: true, r: true }, { id: B, n: 'Zed', phone: true, g: true, r: false }, { id: C, n: 'Ana', phone: false, g: true, r: true }], call: null, picks: {} }, 'no remote codes');
  assert.strictEqual((await post(`/squad/${SQ}/call`, { id: 'dddddddddddd', room: 'kayn' })).status, 403, 'only members');

  // ---- a call: Zed's phone that sent its keys reads it; nobody else's
  assert.strictEqual((await post(`/squad/${SQ}/call`, { id: A, room: 'Not a room!' })).status, 400);
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/call`, { id: A, room: 'kayn' })).json(), { call: 1, sent: 1 });
  assert.deepStrictEqual(got.map((g) => g.url), ['/b'], 'not the old remote, nor Rayan’s own phone');
  const g = got[0];
  assert.deepStrictEqual([g.headers['content-encoding'], g.headers.ttl, g.headers.topic, g.headers.urgency], ['aes128gcm', '1800', 'call', 'high']);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(g.headers.authorization);
  assert.strictEqual(m[4], keyB, 'signed with Zed’s code’s key');
  assert(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await subtle.importKey('raw', unb64(keyB), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']), unb64(m[3]), Buffer.from(`${m[1]}.${m[2]}`)));
  assert.deepStrictEqual(await read(pb, g.body), { t: 'call', title: 'Rayan wants to play', body: 'Room KAYN', sq: SQ, call: 1, api: BASE, to: B });
  await assert.rejects(read(pa, g.body), 'nobody else can read it');
  assert.strictEqual((await post(`/squad/${SQ}/call`, { id: B, room: 'kayn' })).status, 429, 'once a minute');
  s = await state();
  assert.deepStrictEqual([s.call.n, s.call.from, s.call.room, s.call.ans], [1, A, 'kayn', {}]);

  // ---- answers
  assert.strictEqual((await post(`/squad/${SQ}/answer`, { id: B, call: 2, a: 'in10' })).status, 409, 'not the last call');
  assert.strictEqual((await post(`/squad/${SQ}/answer`, { id: B, call: 1, a: 'maybe' })).status, 409);
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/answer`, { id: B, call: 1, a: 'in10' })).json(), { ok: true });
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/answer`, { id: C, call: 1, a: 'no' })).json(), { ok: true });
  assert.deepStrictEqual((await state()).call.ans, { [B]: 'in10', [C]: 'no' });

  // ---- pings: Zed's game reaches Rayan; Rayan's rank-up reaches nobody (Zed turned those off, Ana has no phone)
  got.length = 0;
  assert.strictEqual((await post(`/squad/${SQ}/ping`, { id: B, k: 'nap' })).status, 400);
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/ping`, { id: B, k: 'game', q: 'Ranked Solo/Duo', c: 'Ahri' })).json(), { sent: 1 });
  assert.deepStrictEqual(got.map((x) => [x.url, x.headers.ttl, x.headers.topic]), [['/a', '600', 'ping']]);
  assert.deepStrictEqual(await read(pa, got[0].body), { t: 'ping', title: 'Zed started a game', body: 'Ranked Solo/Duo as Ahri', to: A });
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/ping`, { id: B, k: 'game', q: 'ARAM' })).json(), { sent: 0 }, 'one game ping a minute');
  assert.deepStrictEqual(await (await post(`/squad/${SQ}/ping`, { id: A, k: 'rank', r: 'Gold II' })).json(), { sent: 0 });
  assert.strictEqual(got.length, 1);

  // ---- esports: the big leagues' matches only, asked again only after a while (a second here)
  SOON = Date.now() + 5000; // from here, however long wrangler took to start
  let j = await (await fetch(`${BASE}/esports`)).json();
  assert.deepStrictEqual(j.ev.map((e) => e.id), ['111', '222', '333'], 'no LFL, no show');
  assert.deepStrictEqual(j.ev[1], { id: '222', at: j.ev[1].at, st: 'completed', lg: 'LCK', bl: 'Swiss stage', bo: 3, t: [{ c: 'HLE', n: 'Hanwha Life Esports', w: 2, o: 'win' }, { c: 'KT', n: 'KT Rolster', w: 0, o: 'loss' }] });
  await fetch(`${BASE}/esports`);
  assert.deepStrictEqual(asked, ['/getLeagues?hl=en-US', '/getSchedule?hl=en-US&leagueId=1,2'], 'kept in memory');

  // ---- the pick'em: guesses before the start, for one of its teams
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: A, match: '222', team: 'HLE' })).status, 409, 'that one’s over');
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: A, match: '999', team: 'T1' })).status, 409, 'not a match we know');
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: A, match: '111', team: 'KT' })).status, 400, 'not in that match');
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: A, match: '333', team: 'T1' })).status, 400, 'its other team isn’t decided');
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: 'dddddddddddd', match: '111', team: 'T1' })).status, 403);
  for (const [id, t] of [[A, 'GEN'], [A, 'T1'], [B, 'GEN']]) assert.deepStrictEqual(await (await post(`/squad/${SQ}/pick`, { id, match: '111', team: t })).json(), { ok: true });
  s = await state();
  assert.deepStrictEqual(s.picks, { 111: { t: ['T1', 'GEN'], at: SOON, w: '', p: { [A]: 'T1', [B]: 'GEN' } } }, 'a changed guess replaces the first');
  await sleep(Math.max(0, SOON - Date.now()) + 300);
  assert.strictEqual((await post(`/squad/${SQ}/pick`, { id: C, match: '111', team: 'T1' })).status, 409, 'too late once it starts');
  t1Won = true;
  await sleep(1100);
  s = await state();
  assert.strictEqual(s.picks[111].w, 'T1', 'its winner, once LoL Esports says it’s over');

  // ---- leaving
  assert.deepStrictEqual(await (await post(`/squad/${SQ}`, { id: C, leave: true })).json(), { ok: true });
  assert.deepStrictEqual((await state()).m.map((x) => x.n), ['Rayan', 'Zed']);
  await post(`/squad/${SQ}`, { id: A, leave: true });
  await post(`/squad/${SQ}`, { id: B, leave: true });
  assert.deepStrictEqual(await state(), { m: [], call: null, picks: {} }, 'the last one out deleted it');
  console.log('squads: names only, a call encrypted for each phone with its keys and answered, pings to who wants them, the big leagues’ matches, guesses until the start and the winner, leaving');
})().then(() => { process.kill(-wr.pid); process.exit(0); }, (e) => { console.error(e); process.kill(-wr.pid); process.exit(1); });

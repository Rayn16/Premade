// Checks the phone remote's notifications (/push/..., push.js) under `wrangler dev` against a fake push service: each
// code has its own key, only push services' addresses are taken, a ring reaches every phone with a signed token
// (checked against the key), Apple's headers and nothing in it, at most once every 5 s, with the same token next
// time; an address the push service says is gone (410) is dropped, and so is one a phone takes back.
// WRANGLER=<path to wrangler> node push.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');

const PORT = 8789, PUSH = 8897, BASE = `http://127.0.0.1:${PORT}`, SVC = `http://127.0.0.1:${PUSH}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-push-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const got = []; // what the fake push service was sent
http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => { got.push({ url: req.url, method: req.method, headers: req.headers, body }); res.writeHead(req.url === '/gone' ? 410 : 201); res.end(); });
}).listen(PUSH, '127.0.0.1');
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist, '--var', `PUSH_OK:^${SVC.replace(/\./g, '\\.')}/`],
  { cwd: __dirname, detached: true, stdio: 'ignore' });
const unb64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const post = (p, j) => fetch(BASE + p, { method: 'POST', ...(j && { body: JSON.stringify(j) }) }); // text/plain, as the pages send it

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  const A = '/push/abcdefghjk23', B = '/push/mnpqrstuvw45';
  const r = await fetch(BASE + A);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const { key } = await r.json(), raw = unb64(key);
  assert(raw.length === 65 && raw[0] === 4, 'a P-256 public key');
  assert.equal((await (await fetch(BASE + A)).json()).key, key, 'the same key next time');
  assert.notEqual((await (await fetch(BASE + B)).json()).key, key, 'another code has its own');
  assert.equal((await fetch(BASE + '/push/short')).status, 404);
  assert.equal((await post(A, { add: 'https://example.com/x' })).status, 400, 'not a push service');
  assert.equal((await post(A, { add: `${SVC}/${'x'.repeat(1000)}` })).status, 400, 'too long');
  for (const p of ['/a', '/b', '/gone']) assert.deepEqual(await (await post(A, { add: SVC + p })).json(), { ok: true });

  let j = await (await post(A + '/ring')).json();
  assert.equal(j.sent, 2, 'a and b got it');
  assert.deepEqual(got.map((g) => g.url).sort(), ['/a', '/b', '/gone']);
  const pub = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  for (const g of got) {
    assert.equal(g.method, 'POST');
    assert.deepEqual([g.body, g.headers['content-length']], ['', '0'], 'nothing in it, and it says so (some push services want a length)');
    assert.deepEqual([g.headers.ttl, g.headers.urgency, g.headers.topic], ['20', 'high', 'match']);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(g.headers.authorization);
    assert(m, `the token: ${g.headers.authorization}`);
    assert.equal(m[4], key);
    assert.deepEqual(JSON.parse(unb64(m[1])), { typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(unb64(m[2])), now = Date.now() / 1000;
    assert.equal(claims.aud, SVC);
    assert.equal(claims.sub, 'https://league-proxchat.netlify.app');
    assert(claims.exp > now + 11 * 3600 && claims.exp <= now + 24 * 3600, 'under a day, as Apple wants');
    assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64(m[3]), Buffer.from(`${m[1]}.${m[2]}`)), 'signed with the code’s key');
  }
  assert.equal(new Set(got.map((g) => g.headers.authorization)).size, 1, 'one token for one push service');
  const token = got[0].headers.authorization;
  j = await (await post(A + '/ring')).json();
  assert.equal(j.sent, 0, 'not twice in 5 s');
  assert.equal(got.length, 3);
  await sleep(5200);
  got.length = 0;
  j = await (await post(A + '/ring')).json();
  assert.equal(j.sent, 2);
  assert.deepEqual(got.map((g) => g.url).sort(), ['/a', '/b'], 'the gone one was dropped');
  assert.equal(got[0].headers.authorization, token, 'the same token: Apple wants a new one at most once an hour');
  assert.deepEqual(await (await post(A, { drop: SVC + '/a' })).json(), { ok: true });
  await sleep(5200);
  got.length = 0;
  j = await (await post(A + '/ring')).json();
  assert.equal(j.sent, 1);
  assert.deepEqual(got.map((g) => g.url), ['/b'], 'a was taken back');
  assert.equal((await (await post(B + '/ring')).json()).sent, 0, 'nobody on the other code');
  console.log('push: a key for each code, push services only, a signed ring to every phone at most every 5 s with the same token, gone and dropped addresses left out');
})().then(() => { process.kill(-wr.pid); process.exit(0); }, (e) => { console.error(e); process.kill(-wr.pid); process.exit(1); });

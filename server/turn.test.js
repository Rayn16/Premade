// Checks /turn (turn.js) against a fake Cloudflare API: a 404 without the secrets; with them, Cloudflare asked once with
// the key and a day's ttl, port 53 left out, the same credentials for an hour; a 502 when Cloudflare fails.
// node turn.test.js
const assert = require('assert');

(async () => {
  const { turn } = await import('./turn.js');
  assert.strictEqual((await turn({})).status, 404, 'no secrets: no relay of our own');
  const asked = [];
  const cf = async (url, o) => {
    asked.push([url, o.headers.Authorization, JSON.parse(o.body).ttl]);
    return new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] }), { status: 201 });
  };
  const env = { TURN_KEY_ID: 'key1', TURN_KEY_TOKEN: 'tok' };
  const r = await turn(env, cf), j = await r.json();
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(asked, [['https://rtc.live.cloudflare.com/v1/turn/keys/key1/credentials/generate-ice-servers', 'Bearer tok', 86400]]);
  assert.deepStrictEqual(j.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }], 'port 53 left out');
  await turn(env, cf);
  assert.strictEqual(asked.length, 1, 'the same credentials within the hour');
  const real = Date.now;
  Date.now = () => real() + 3600001;
  assert.strictEqual((await turn(env, async () => new Response('no', { status: 500 }))).status, 502, 'an hour on, Cloudflare failing: 502');
  Date.now = real;
  console.log('turn: 404 without secrets, Cloudflare asked with the key for a day, port 53 left out, kept an hour, 502 on failure');
})().catch((e) => { console.error(e); process.exit(1); });

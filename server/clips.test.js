// Checks clip links (/clips/..., /c/..., clips.js) under `wrangler dev`: a clip sent in two parts comes back whole at its
// link, and a range of it for seeking; too big, a bad part number or an unknown upload are refused; a link that was
// never made is a 404.
// WRANGLER=<path to wrangler> node clips.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const PORT = 8792, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-clips-'));
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist], { cwd: __dirname, detached: true, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  assert.deepStrictEqual(await (await fetch(BASE + '/clips/on')).json(), { on: true }, 'clip links on with the bucket');
  assert.strictEqual((await fetch(BASE + '/clips/start?size=300000000', { method: 'POST' })).status, 413, 'over 200 MB refused');

  const clip = Buffer.alloc(9 * 2 ** 20 + 123);
  for (let i = 0; i < clip.length; i++) clip[i] = (i * 31) & 255;
  const s = await (await fetch(`${BASE}/clips/start?size=${clip.length}`, { method: 'POST' })).json();
  assert(/^[0-9a-f]{16}\.webm$/.test(s.id) && s.up && s.part === 8 * 2 ** 20, `an upload started: ${JSON.stringify(s)}`);
  const q = `id=${s.id}&up=${encodeURIComponent(s.up)}`;
  assert.strictEqual((await fetch(`${BASE}/clips/part?${q}&n=99`, { method: 'PUT', body: clip.subarray(0, 10) })).status, 400, 'a part number past 200 MB refused');
  const parts = [];
  for (let o = 0, n = 1; o < clip.length; o += s.part, n++) {
    const r = await fetch(`${BASE}/clips/part?${q}&n=${n}`, { method: 'PUT', body: clip.subarray(o, o + s.part) });
    assert(r.ok, `part ${n}: ${r.status} ${await r.clone().text()}`);
    parts.push(await r.json());
  }
  const done = await fetch(`${BASE}/clips/done?${q}`, { method: 'POST', body: JSON.stringify(parts) });
  assert(done.ok, `done: ${done.status} ${await done.clone().text()}`);
  const { url } = await done.json();
  assert.strictEqual(url, `${BASE}/c/${s.id}`, 'its link');

  const whole = await fetch(url);
  assert(whole.ok && whole.headers.get('content-type') === 'video/webm' && whole.headers.get('accept-ranges') === 'bytes', 'a WebM you can seek in');
  assert(Buffer.from(await whole.arrayBuffer()).equals(clip), 'the clip comes back whole');
  const part = await fetch(url, { headers: { range: 'bytes=100-199' } });
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.headers.get('content-range'), `bytes 100-199/${clip.length}`);
  assert(Buffer.from(await part.arrayBuffer()).equals(clip.subarray(100, 200)), 'a range of it');

  assert.strictEqual((await fetch(`${BASE}/clips/done?id=0123456789abcdef.webm&up=nope`, { method: 'POST', body: '[]' })).status, 400, 'an unknown upload refused');
  assert.strictEqual((await fetch(`${BASE}/c/0123456789abcdef.webm`)).status, 404, 'a link never made');
  assert.strictEqual((await fetch(`${BASE}/c/..%2Fsecret`)).status, 404, 'not a clip name');
  console.log('clip links: uploaded in parts, whole and in ranges at its link, the limits held');
})().then(() => { process.kill(-wr.pid); process.exit(0); }, (err) => { console.error(err); try { process.kill(-wr.pid); } catch {} process.exit(1); });

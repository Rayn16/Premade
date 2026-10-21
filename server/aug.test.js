// Checks the augment ratings (/riot/mayhem and /riot/tftaug) under `wrangler dev`: Premade apps send their games'
// augments, each game counts once, bad games and an address's 201st game in an hour are refused, and the counts come
// back by champion (Mayhem) and for the newest set (TFT).
// WRANGLER=<path to wrangler> node aug.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const PORT = 8789, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-aug-'));
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist], { cwd: __dirname, detached: true, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = async (kind, b, ip = '203.0.113.1') => (await fetch(`${BASE}/riot/${kind}`, { method: 'POST', body: JSON.stringify(b), headers: { 'CF-Connecting-IP': ip } })).text();
const get = async (q) => (await fetch(`${BASE}/riot/${q}`)).json();
// a Mayhem game: Ahri (103) on the winning team with augments 79 and 1205, everyone else champion 1-9 with augment 58
const may = (g, ahri = [79, 1205]) => ({ g, ps: Array.from({ length: 10 }, (_, i) => (i ? { c: i, w: i < 5 ? 1 : 0, a: [58] } : { c: 103, w: 1, a: ahri })) });
const tft = (g, s) => ({ g, s, ps: Array.from({ length: 8 }, (_, i) => ({ p: i + 1, a: i < 2 ? ['TFT18_Augment_Rich', 'DA_18_Cluster'] : ['DA_18_Cluster'] })) });

(async () => {
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(BASE + '/')).ok) break; } catch {}
      assert(i < 120, 'wrangler dev did not start');
      await sleep(500);
    }
    assert.equal(await send('mayhem', may('EUW1_7001000')), 'ok');
    assert.equal(await send('mayhem', may('EUW1_7001000')), 'ok', 'the same game again');
    assert.equal(await send('mayhem', may('EUW1_7002000', [79])), 'ok');
    assert.equal(await send('mayhem', { ...may('EUW1_7003000'), ps: may('x').ps.slice(1) }), 'not a game', '9 players');
    assert.equal(await send('mayhem', { g: 'nope', ps: may('x').ps }), 'no game id');
    assert.equal(await send('mayhem', 'junk'), 'no game id');
    assert.deepEqual(await get('mayhem?c=103'), { n: 2, a: { 79: 2, 1205: 1 } }, 'Ahri: 2 games, 79 in both');
    assert.deepEqual(await get('mayhem?c=3'), { n: 2, a: { 58: 2 } });
    assert.deepEqual(await get('mayhem?c=500'), { n: 0, a: {} });
    assert.equal(await send('tftaug', tft('NA1_5001000', 17)), 'ok');
    assert.equal(await send('tftaug', tft('NA1_5002000', 18)), 'ok');
    assert.equal(await send('tftaug', tft('NA1_5002000', 18)), 'ok', 'again');
    assert.equal(await send('tftaug', tft('NA1_5003000', 18)), 'ok');
    assert.equal(await send('tftaug', { ...tft('NA1_5004000', 18), ps: tft('x', 18).ps.map((p) => ({ ...p, p: 1 })) }), 'not a game', 'eight firsts');
    assert.equal(await send('tftaug', { ...tft('NA1_5005000', 18), ps: tft('x', 18).ps.map((p) => ({ ...p, p: [p.p] })) }), 'not a game', 'places that are not numbers');
    assert.equal(await send('tftaug', { ...tft('NA1_5006000', 18), pad: 'x'.repeat(9000) }), 'too big');
    assert.deepEqual(await get('tftaug'), { s: 18, a: { TFT18_Augment_Rich: [4, 6, 4], DA_18_Cluster: [16, 72, 8] } }, 'set 18 only: Rich 1st and 2nd twice');
    assert.deepEqual(await get('tftaug?s=17'), { s: 17, a: { TFT18_Augment_Rich: [2, 3, 2], DA_18_Cluster: [8, 36, 4] } }, 'set 17 when asked');
    for (let i = 0; i < 200; i++) await send('mayhem', may('KR_' + (8000000 + i)), '203.0.113.7');
    assert.equal(await send('mayhem', may('KR_90000000'), '203.0.113.7'), 'too many', 'the 201st in an hour');
    assert.equal(await send('mayhem', may('KR_90000000'), '203.0.113.8'), 'ok', 'another address');
    console.log('augment ratings: games counted once, bad ones refused, 200 an hour from an address (a history sent at once), counts by champion and for the newest set');
  } finally { process.kill(-wr.pid); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

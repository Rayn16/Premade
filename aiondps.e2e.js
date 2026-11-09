// Test of Aion 2 rotation tests and pace (What's new 130), in headless Chromium with a stand-in for the desktop app:
// site/index.html follows Live fight's snapshots, keeps each run of a named test (opener 0-10 s, burst 10-20 s) and the
// fastest kill's HP each second; site/meter.html shows the pace against it and starts a test from its flask button.
// Deaths on the meter add up over a whole dungeon run (What's new 140): from Aion 2's map log to the next dungeon.
// Needs playwright: NODE_PATH=$(npm root -g) node aiondps.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8093;
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
function fakeApp() {
  const on = {};
  window.emit = (n, v) => (on[n] || []).forEach((fn) => fn(v));
  window.lpcClient = { version: '1.40.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay() {}, on(n, fn) { (on[n] = on[n] || []).push(fn); }, aionLive: async () => 'on', aionFights: async () => [], captureSources: async () => [],
    // Aion 2's map log: window.crumbs, lines added by the test
    aionLog: async (file, from) => (window.crumbs ? { file: 'a.breadcrumb.log', size: window.crumbs.length, text: window.crumbs.slice(file ? from : 0) } : null) };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
}
// Live fight's snapshot at a second of a fight: you deal 1,000 a second (2,000 from 10 s), the boss loses 3% a second
const snap = (target, secs, killed) => ({ active: true, target, secs, pct: target === 'Nuakum' ? (killed ? 0 : 100 - 3 * secs) : null, hp: null,
  players: [{ name: 'Rayan', me: true, damage: secs <= 10 ? 1000 * secs : 10000 + 2000 * (secs - 10), dps: 1500, share: 100, crit: 20, skills: [{ id: 11000000, damage: 1, hits: 1, share: 60, crit: 0, max: 1 }, { id: 12000000, damage: 1, hits: 1, share: 40, crit: 0, max: 1 }] }] });
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errors = [];
    await page.addInitScript(fakeApp);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await page.waitForFunction(() => typeof emit === 'function');
    await page.waitForTimeout(1500);
    // a test run on a dummy, then a trash fight after it isn't one (the test is stopped)
    await page.evaluate(() => localStorage.setItem('lpc-aion-test', JSON.stringify({ name: 'opener A', at: Date.now() - 60000 })));
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, Array.from({ length: 26 }, (_, i) => snap('Training Dummy', i)));
    await page.evaluate((f) => emit('aion-fight', { ...f, killed: false, at: Date.now() - 25000 }), snap('Training Dummy', 25));
    const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-tests')));
    assert.strictEqual(runs.length, 1, 'one run saved');
    assert.deepStrictEqual([runs[0].test, runs[0].target, runs[0].secs, runs[0].open, runs[0].burst], ['opener A', 'Training Dummy', 25, 10000, 20000], 'opener 0-10 s and burst 10-20 s');
    assert.deepStrictEqual(runs[0].skills, [[11000000, 60], [12000000, 40]], 'skill shares');
    // a fight seen only partway through (Premade restarted) has no opener
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, [30, 31, 32].map((i) => snap('Elite', i)));
    await page.evaluate((f) => emit('aion-fight', { ...f, killed: false, at: Date.now() - 32000 }), snap('Elite', 32));
    assert.deepStrictEqual(await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lpc-aion-tests'))[0]; return [r.target, r.open, r.burst]; }), ['Elite', null, null], 'no opener when seen late');
    // a mob under the same name a moment later is a new fight, seen late here: its run has no opener from the old one
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, [0, 1, 2, 3, 4, 5].map((i) => snap('Dummy', i)));
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, [12, 13, 14].map((i) => snap('Dummy', i)));
    await page.evaluate((f) => emit('aion-fight', { ...f, killed: false, at: Date.now() - 14000 }), snap('Dummy', 14));
    assert.deepStrictEqual(await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lpc-aion-tests'))[0]; return [r.target, r.open]; }), ['Dummy', null], 'same name later: a new fight');
    // you not known in the first 10 s: no opener rather than 0
    const noMe = (i) => ({ ...snap('Golem', i), players: i < 15 ? [] : snap('Golem', i).players });
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, Array.from({ length: 26 }, (_, i) => noMe(i)));
    await page.evaluate((f) => emit('aion-fight', { ...f, killed: false, at: Date.now() - 25000 }), snap('Golem', 25));
    assert.deepStrictEqual(await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lpc-aion-tests'))[0]; return [r.target, r.open, r.burst]; }), ['Golem', null, null], 'no opener without you');
    await page.evaluate(() => localStorage.removeItem('lpc-aion-test'));
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, Array.from({ length: 22 }, (_, i) => snap('Mob', i)));
    await page.evaluate((f) => emit('aion-fight', { ...f, killed: false, at: Date.now() - 21000 }), snap('Mob', 21));
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-tests')).length), 4, 'no run without a test');
    // a 30 s kill of Nuakum keeps its HP each second; a slower kill later doesn't replace it
    const kill = async (secs) => {
      await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, [...Array.from({ length: secs }, (_, i) => snap('Nuakum', i)), snap('Nuakum', secs, true)]);
      await page.evaluate((f) => emit('aion-fight', { ...f, killed: true, at: Date.now() }), snap('Nuakum', secs, true));
    };
    await kill(30); await kill(33);
    const pace = await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-pace')).Nuakum);
    assert.deepStrictEqual([pace.secs, pace.hp[0], pace.hp[10], pace.hp.length], [30, 100, 70, 31], 'the fastest kill, HP each second');
    // a boss fight with no name for its first seconds (Live fight names players only; the screen names it a moment in): its pace from the pull
    await page.evaluate((s) => { for (const x of s) emit('aion-live', x); }, [...Array.from({ length: 31 }, (_, i) => ({ ...snap('Nuakum', i), target: i < 5 ? '' : 'Gelcos' })), { ...snap('Nuakum', 31, true), target: 'Gelcos' }]);
    await page.evaluate((f) => emit('aion-fight', { ...f, target: 'Gelcos', killed: true, at: Date.now() }), snap('Nuakum', 31, true));
    const gel = await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-pace')).Gelcos);
    assert.deepStrictEqual([gel.secs, gel.hp[0], gel.hp.length], [31, 100, 32], 'named a few seconds in, its pace still starts at the pull');
    // the pop-up: 10 s in at 65% is 5% ahead of the best kill's 70%
    const meter = await ctx.newPage();
    meter.on('pageerror', (e) => errors.push(e.message));
    await meter.goto(`http://127.0.0.1:${PORT}/meter.html`);
    await page.evaluate((f) => localStorage.setItem('lpc-aion-live', JSON.stringify({ at: Date.now(), state: 'on', fight: { ...f, pct: 65 } })), snap('Nuakum', 10));
    await meter.waitForFunction(() => document.querySelector('#pace') && document.querySelector('#pace').textContent === '+5% vs best', null, { timeout: 5000 });
    await page.evaluate((f) => localStorage.setItem('lpc-aion-live', JSON.stringify({ at: Date.now(), state: 'on', fight: { ...f, pct: 5 } })), snap('Nuakum', 31));
    await meter.waitForFunction(() => document.querySelector('#pace').textContent === 'past your best 0:30', null, { timeout: 5000 });
    // its flask button names and starts a test, which index.html then uses; Stop ends it
    await meter.click('#testBtn');
    await meter.fill('#testName', 'new stigma');
    await meter.click('#testGo');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-test')).name), 'new stigma', 'test started from the pop-up');
    await meter.waitForFunction(() => document.querySelector('#testOn').textContent === 'Testing new stigma · 0 runs');
    await meter.click('#testGo');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('lpc-aion-test')), null, 'and stopped');
    assert(await meter.evaluate(() => document.querySelector('#test').hidden), 'the test bar closes');
    // deaths through a dungeon: each boss fight counts its own (Live fight), the meter shows the run's
    const dg = await browser.newContext(), d = await dg.newPage();
    await d.clock.install();
    await d.addInitScript(fakeApp);
    d.on('pageerror', (e) => errors.push(e.message));
    await d.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await d.waitForFunction(() => typeof emit === 'function');
    const map = async (m) => { await d.evaluate((m) => { window.crumbs = (window.crumbs || '') + `[2026-11-08T01:00:00.000+0300] [0] Flow.Teleport.LoadComplete.Map(${m})\n`; }, m); await d.clock.runFor(6000); };
    const boss = async (target, rayan, sam) => { // a fight 30 s long, then a minute's walk
      await d.evaluate((f) => emit('aion-live', f), { active: true, target, secs: 30, players: [{ name: 'Rayan', me: true, party: true, deaths: rayan, damage: 1, dps: 1, share: 50 }, { name: 'Sam', party: true, deaths: sam, damage: 1, dps: 1, share: 50 }] });
      await d.clock.runFor(1000);
      const deaths = await d.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-live')).fight.players.map((p) => p.deaths));
      await d.clock.runFor(60000);
      return deaths;
    };
    await map(1110); await map(600092);
    assert.deepStrictEqual(await boss('Kwapo', 1, 0), [1, 0], 'first boss');
    assert.deepStrictEqual(await boss('Mau Totem', 1, 1), [2, 1], 'the second boss adds to the first');
    await map(600092); // back in after a wipe: the same run
    assert.deepStrictEqual(await boss('Nuakum', 0, 2), [2, 3], 'the third adds too');
    await map(1110);
    assert.deepStrictEqual(await boss('Nuakum', 0, 2), [2, 3], 'left: the last boss keeps the run’s');
    assert.deepStrictEqual(await boss('Dummy', 1, 0), [1, 0], 'outside a dungeon, the fight’s');
    await map(600022);
    assert.deepStrictEqual(await boss('Ignus', 1, 0), [1, 0], 'a new run starts at 0');
    await dg.close();
    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('aiondps.e2e: ok');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

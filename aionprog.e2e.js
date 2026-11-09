// Test of Aion 2's progression panels on the overlay (What's new 143, app 1.46) in headless Chromium, with a stand-in for
// the desktop app. index.html: the overlay key shows the panels the tracker wrote (lpc-aion-prog) over the whole screen,
// a drag, an open and a line click from the overlay are kept or open the tracker, the Aion 2 overlay page turns panels
// off and puts them back. overlay.html: the window takes the mouse only over a panel, a title click opens it, dragging
// it moves it, a line click opens the tracker page; 2,000 redraws leave no DOM nodes or listeners behind.
// Needs playwright: NODE_PATH=$(npm root -g) node aionprog.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8097;
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const PANELS = [
  { id: 'gear', title: 'Gear next · Rayan', lines: [['Helmet +7 → +10', 'safe: every try works (unconfirmed)', '#/member/Rayan/gear'], ['Pants +11 → +12', '50% a try', '#/member/Rayan/gear']] },
  { id: 'events', title: 'Rift and Abyss', lines: [['Spacetime Rift in 20 min', 'every 3 h', '#/today']] },
  { id: 'plan', title: 'Tonight’s plan', lines: [['Shugo Festival in 30 min', '16:00', '#/today']] },
];
function fakeApp(panels) {
  const on = {};
  window.calls = [];
  window.lpcClient = {
    version: '1.46.0', screens: async () => [], useScreen() {}, keys: async () => ({ overlay: true }), windowMode: async () => 'borderless', compact() {}, update() {},
    front() { calls.push('front'); }, notify() {}, overlay(s) { window.ov = s; }, on(n, fn) { (on[n] = on[n] || []).push(fn); },
  };
  window.emit = (n, v) => (on[n] || []).forEach((f) => f(v));
  localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-aion', '1');
  localStorage.setItem('lpc-aion-card', JSON.stringify({ at: Date.now(), lines: ['Daily reset in 2 h'] }));
  localStorage.setItem('lpc-aion-prog', JSON.stringify({ at: Date.now(), panels }));
}
const until = (page, fn, arg, what) => page.waitForFunction(fn, arg, { timeout: 10000, polling: 100 }).catch(async () => {
  throw new Error(`${what}: overlay was ${JSON.stringify(await page.evaluate(() => window.ov))}`);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    // ---- index.html
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon|github\.io|workers\.dev/, (r) => r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }));
    await ctx.addInitScript(fakeApp, PANELS);
    const pc = await ctx.newPage();
    const errs = [];
    pc.on('pageerror', (e) => errs.push(e.message));
    await pc.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await pc.waitForTimeout(1500);
    await pc.evaluate(() => emit('key', 'overlay'));
    await until(pc, () => ov && ov.visible && ov.board === true && Array.isArray(ov.prog) && ov.prog.map((p) => `${p.id}:${p.open}`).join() === 'gear:false,events:false,plan:true', null, 'the panels over the whole screen, Tonight’s plan open');
    await pc.evaluate(() => { emit('overlay-moved', { prog: { id: 'gear', x: 0.4, y: 0.3 } }); emit('overlay-moved', { prog: { id: 'gear', open: true } }); emit('overlay-moved', { prog: { id: 'nope', open: true } }); });
    await until(pc, () => { const g = ov.prog[0]; return g.x === 0.4 && g.y === 0.3 && g.open === true && !('nope' in JSON.parse(localStorage.getItem('lpc-opts')).aionProg.open); }, null, 'a drag and an open kept, an unknown panel not');
    await pc.evaluate(() => emit('overlay-moved', { prog: { go: '#/member/Rayan/gear' } }));
    await until(pc, () => !document.querySelector('.view[data-view="aion"]').hidden && document.getElementById('aionFrame').src.endsWith('?embed#/member/Rayan/gear') && calls.includes('front'), null, 'a line opens the tracker page in Premade, in front');
    await pc.evaluate(() => emit('overlay-moved', { prog: { go: 'javascript:alert(1)' } }));
    assert(await pc.evaluate(() => document.getElementById('aionFrame').src.endsWith('#/member/Rayan/gear')), 'only tracker pages');
    await pc.evaluate(() => document.querySelector('.nav[data-view="aionov"]').click());
    await pc.waitForSelector('#aionProgBox:not([hidden]) #aionProgPick input');
    assert.strictEqual(await pc.locator('#aionProgPick input').count(), 6);
    await pc.locator('#aionProgPick label', { hasText: 'Rift and Abyss' }).locator('input').uncheck();
    await until(pc, () => ov.prog.map((p) => p.id).join() === 'gear,plan', null, 'a panel turned off');
    await pc.click('#aionProgBack');
    await until(pc, () => !('x' in ov.prog[0]) && ov.prog[0].open, null, 'put back on the right, still open');
    await pc.evaluate(() => localStorage.setItem('lpc-aion-prog', JSON.stringify({ at: Date.now() - 300e3, panels: [] })));
    await pc.evaluate(() => dispatchEvent(new Event('focus')));
    await until(pc, () => ov.visible && !ov.prog, null, 'panels older than 2 minutes left off');
    await pc.evaluate(() => { lpcClient.version = '1.45.1'; localStorage.setItem('lpc-aion-prog', JSON.stringify({ at: Date.now(), panels: [{ id: 'plan', title: 'x', lines: [] }] })); dispatchEvent(new Event('focus')); });
    await pc.waitForTimeout(300);
    assert(await pc.evaluate(() => !ov.prog), 'an app older than 1.46 gets none (it can’t give them the mouse)');
    assert.deepStrictEqual(errs, []);
    console.log('index: the panels with the Aion 2 card, drag and open kept, a line opens the tracker, panels off and back, none when old');

    // ---- overlay.html
    const op = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await op.addInitScript(() => {
      window.mouseCalls = []; window.progCalls = [];
      window.lpcClient = { on(n, fn) { if (n === 'overlay') window.draw = fn; }, overlayMouse(on) { mouseCalls.push(on); }, overlayProg(m) { progCalls.push(m); }, overlayDone() {} };
    });
    op.on('pageerror', (e) => errs.push(e.message));
    await op.goto(`http://127.0.0.1:${PORT}/overlay.html`);
    const state = (panels) => ({ visible: true, board: true, pos: 'tl', scale: 1, aion: ['Daily reset in 2 h'], prog: panels });
    await op.evaluate((s) => draw(s), state([{ ...PANELS[0], open: false }, { ...PANELS[2], open: true }]));
    const head = op.locator('.pp .ph', { hasText: 'Gear next' });
    const box = await head.boundingBox();
    assert(box.x > 1200 && box.y > 90, `down the right: ${JSON.stringify(box)}`);
    assert.strictEqual(await op.locator('.pp li:visible').count(), 1, 'only the open panel shows its lines');
    await op.mouse.move(400, 400);
    await op.mouse.move(box.x + 20, box.y + 8);
    await op.mouse.move(400, 400);
    assert.deepStrictEqual(await op.evaluate(() => mouseCalls), [true, false], 'the mouse taken over a panel only');
    await head.click();
    assert.deepStrictEqual(await op.evaluate(() => progCalls.pop()), { id: 'gear', open: true }, 'a title click opens it');
    assert.strictEqual(await op.locator('.pp li:visible').count(), 3);
    await op.locator('.pp li', { hasText: 'Pants' }).click();
    assert.deepStrictEqual(await op.evaluate(() => progCalls.pop()), { id: 'gear', go: '#/member/Rayan/gear' }, 'a line click opens its page');
    await op.mouse.move(box.x + 20, box.y + 8);
    await op.mouse.down();
    await op.mouse.move(600, 300, { steps: 5 });
    await op.evaluate((s) => draw(s), state([{ ...PANELS[0], open: true, lines: [['changed mid-drag']] }, { ...PANELS[2], open: true }]));
    await op.mouse.move(500, 200, { steps: 5 });
    await op.mouse.up();
    const m = await op.evaluate(() => progCalls.pop());
    assert(m.id === 'gear' && Math.abs(m.x - (500 - 20) / 1600) < 0.01 && Math.abs(m.y - (200 - 8) / 900) < 0.01 && m.open === undefined, `dragged where it was let go: ${JSON.stringify(m)}`);
    assert(await op.evaluate(() => !document.body.textContent.includes('changed mid-drag')), 'not redrawn mid-drag');
    await op.evaluate((s) => draw(s), state([{ ...PANELS[0], open: true, x: m.x, y: m.y }, { ...PANELS[2], open: true }]));
    const moved = await head.boundingBox();
    assert(Math.abs(moved.x - 480) < 3 && Math.abs(moved.y - 192) < 3, `drawn where it was dragged: ${JSON.stringify(moved)}`);
    await op.evaluate(() => draw({ visible: false }));
    assert(await op.evaluate(() => !document.querySelector('.pp') && mouseCalls.at(-1) === false), 'hidden: no panels, the mouse back to the game');
    // memory: 2,000 redraws with the countdowns changing leave the DOM and listeners where 20 did
    const cdp = await op.context().newCDPSession(op);
    await cdp.send('Performance.enable');
    const count = async (n) => {
      await op.evaluate(({ n, s }) => { for (let i = 0; i < n; i++) draw({ ...s, prog: s.prog.map((p) => ({ ...p, lines: p.lines.map(([t, u, g]) => [`${t} ${i}`, u, g]) })) }); }, { n, s: state(PANELS.map((p) => ({ ...p, open: true }))) });
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      return Object.fromEntries(metrics.filter((x) => ['Nodes', 'JSEventListeners', 'JSHeapUsedSize'].includes(x.name)).map((x) => [x.name, x.value]));
    };
    const a = await count(20), b = await count(2000);
    assert(b.Nodes <= a.Nodes + 5 && b.JSEventListeners <= a.JSEventListeners + 5 && b.JSHeapUsedSize < a.JSHeapUsedSize * 1.5 + 2e6, `no growth: ${JSON.stringify({ a, b })}`);
    assert.deepStrictEqual(errs, []);
    console.log(`overlay: the mouse only over a panel, open on a title click, drag to move (not redrawn mid-drag), line click; 2,000 redraws: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

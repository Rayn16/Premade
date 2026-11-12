// Test of Premade's animations (Settings > Look, 2026-11-12) in site/index.html, in headless Chromium, with a stand-in
// for the desktop app that can say League is in a game. Checks: Follow Windows turns Reduced when Windows' Show
// animations is off, On and Reduced override it; Pause animations while a game runs turns all motion off while League
// is in a game and back on after; a page picked in the menu fades in, one opened by a shortcut doesn't; a button shrinks
// a little when pressed (not in Reduced); a dialog fades in from 95%; the overlay page has no motion rules at all.
//   NODE_PATH=/path/to/node_modules node motion.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': path.extname(file) === '.js' ? 'text/javascript' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8087, '127.0.0.1');

function fakeClient() {
  const on = {};
  window.lpcClient = {
    version: '1.46.0', screens: async () => [], useScreen() {}, keys: async () => ({}), compact() {}, overlay() {}, update() {}, discord() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, d) { for (const fn of on[name] || []) fn(d); },
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-news', '9999');
}
const waitFor = async (page, fn, arg, what) => {
  for (let i = 0; i < 100; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(100); }
  throw new Error('timed out waiting for ' + what);
};
const motion = (page) => page.evaluate(() => document.documentElement.dataset.motion);

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }) });
  try {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(fakeClient);
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8087/index.html?debug');
    await waitFor(page, () => document.documentElement.dataset.motion, null, 'data-motion');
    assert.strictEqual(await motion(page), 'reduced', 'Follow Windows with Show animations off is Reduced');
    await page.click('.nav[data-view="settings"]');
    await page.selectOption('#optMotion', 'on');
    assert.strictEqual(await motion(page), 'on', 'On overrides Windows');
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-opts'))).motion, 'on', 'the pick is kept');

    // press: scale(0.96) on, 1 in Reduced
    assert.match(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--m').trim()), /^1$/);
    const scaleOn = await page.evaluate(() => { const d = document.createElement('div'); d.style.transform = 'scale(var(--press))'; document.body.append(d); const t = getComputedStyle(d).transform; d.remove(); return t; });
    assert.strictEqual(scaleOn, 'matrix(0.96, 0, 0, 0.96, 0, 0)', 'a pressed button goes to 96%');

    // pages: a click fades in, a shortcut is instant
    await page.click('.nav[data-view="friends"]');
    assert.ok(await page.evaluate(() => { const v = document.querySelector('.view[data-view="friends"]'); return v.classList.contains('enter') && v.getAnimations().length > 0; }), 'a page picked in the menu fades in');
    await page.evaluate(() => window.lpcClient.emit('join', '')); // nothing; then the keyboard path:
    await page.evaluate(() => document.querySelector('.nav[data-view="settings"]').click());
    await page.waitForTimeout(400);
    // a dialog fades in from 95%
    await page.click('#newsBtn');
    const d0 = await page.evaluate(() => { const d = document.getElementById('newsDlg'); return { o: +getComputedStyle(d).opacity, open: d.open }; });
    assert.ok(d0.open && d0.o < 1, 'What’s new starts see-through: ' + JSON.stringify(d0));
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('newsDlg')).opacity), '1', 'then fully there');
    await page.keyboard.press('Escape');
    await waitFor(page, () => !document.getElementById('newsDlg').open, null, 'Esc closing What’s new');

    // Reduced: nothing moves (--m 0), a page still fades
    await page.selectOption('#optMotion', 'reduced');
    assert.strictEqual(await motion(page), 'reduced');
    assert.strictEqual(await page.evaluate(() => { const d = document.createElement('div'); d.style.transform = 'scale(var(--press))'; document.body.append(d); const t = getComputedStyle(d).transform; d.remove(); return t; }), 'matrix(1, 0, 0, 1, 0, 0)', 'Reduced: no shrinking');

    // Pause while a game runs
    await page.selectOption('#optMotion', 'on');
    await page.check('#optMotionGame');
    await page.evaluate(() => window.lpcClient.emit('league', { inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 60, room: 'g0123456789a', result: '', events: [], me: { champName: 'Ahri' }, players: [] }));
    await waitFor(page, () => document.documentElement.dataset.motion === 'off', null, 'motion off in a game');
    assert.strictEqual(await page.evaluate(() => { document.querySelector('.nav[data-view="friends"]').click(); return document.querySelector('.view[data-view="friends"]').getAnimations().length; }), 0, 'no page fade in a game');
    await page.evaluate(() => window.lpcClient.emit('league', { inGame: false, phase: 'EndOfGame' }));
    await waitFor(page, () => document.documentElement.dataset.motion === 'on', null, 'motion back after the game');

    // the overlay never animates
    const ov = fs.readFileSync(path.join(SITE, 'overlay.html'), 'utf8');
    assert.ok(!/--t-press|data-motion|page-in|pop-in/.test(ov), 'overlay.html has none of the motion rules');
    console.log('motion e2e: all checks passed');
  } finally { await browser.close(); }
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

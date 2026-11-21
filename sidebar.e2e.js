// Test of the sidebar (What's new 178) in site/index.html, in headless Chromium, with a stand-in for the desktop app.
// Checks: dragging the edge past halfway settles on icons only (names kept for screen readers), dragging back on full,
// a click or Enter switches, hover names beside the icons, the size kept after a reload, the edge following the mouse
// at App size 150%; League swaps the list (League's from the right, Premade's back to the last Premade page), a League
// page opened another way swaps it too, no slide at startup, Reduced = a short fade, off = none; a narrow window is
// icons only with no edge; a phone's bottom bar swaps the same way. SHOTS=<folder> saves pictures.
//   NODE_PATH=/path/to/node_modules node sidebar.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), SHOTS = process.env.SHOTS;
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8097, '127.0.0.1');
const URL0 = 'http://127.0.0.1:8097/index.html?debug';

function fakeClient() {
  const on = {};
  window.lpcClient = {
    version: '1.50.0', screens: async () => [], useScreen() {}, keys: async () => ({}), compact() {}, overlay() {}, update() {}, discord() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, d) { for (const fn of on[name] || []) fn(d); },
  };
  if (!localStorage.getItem('lpc-setup')) { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-news', '9999'); }
}
const railW = (p) => p.evaluate(() => document.querySelector('.rail').offsetWidth);
const shot = (p, name) => SHOTS && p.screenshot({ path: path.join(SHOTS, name + '.png') });
const visibleNames = (p) => p.$$eval('.rail .nav', (b) => b.filter((x) => x.checkVisibility()).map((x) => x.textContent.trim()));
async function drag(p, toX, { up = true } = {}) { // from the edge's middle to toX (screen pixels)
  const g = await p.locator('#railGrip').boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  await p.mouse.move(toX, g.y + g.height / 2, { steps: 8 });
  if (up) await p.mouse.up();
}

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(fakeClient);
    const page = await ctx.newPage();
    await page.goto(URL0);
    await page.waitForSelector('#railGrip');
    await page.evaluate(() => { document.documentElement.dataset.motion = 'on'; });
    assert.strictEqual(await railW(page), 212, 'full at first');
    assert(await page.isVisible('#premadeList') && await page.isHidden('#leagueList') && await page.isHidden('#leagueTabs'), 'Premade’s list, no tabs row');
    await shot(page, '1-full-premade');

    // 1. drag past halfway = icons only; the names stay in each button's accessible name
    await drag(page, 80);
    assert.strictEqual(await railW(page), 60, 'let go past halfway: icons only');
    for (const n of ['Rooms', 'Friends', 'Settings', 'League']) assert(await page.getByRole('button', { name: n, exact: true }).isVisible(), `${n} keeps its name`);
    assert.strictEqual(await page.getAttribute('#railGrip', 'aria-label'), 'Make the sidebar bigger');
    // 3. hover names beside the icon, inside the window
    await page.hover('.nav[data-view="friends"]');
    await page.waitForTimeout(250);
    const tip = await page.evaluate(() => { const t = document.getElementById('railTip'), r = t.getBoundingClientRect(), b = document.querySelector('.nav[data-view="friends"]').getBoundingClientRect(); return { on: t.classList.contains('on'), text: t.textContent, o: getComputedStyle(t).opacity, left: r.left, rail: document.querySelector('.rail').getBoundingClientRect().right, mid: r.top + r.height / 2, bmid: b.top + b.height / 2 }; });
    assert(tip.on && tip.text === 'Friends' && tip.o === '1' && tip.left > tip.rail && Math.abs(tip.mid - tip.bmid) < 2, 'Friends beside its icon: ' + JSON.stringify(tip));
    await shot(page, '2-icons-hover');
    await page.mouse.move(700, 400);
    // drag back = full
    await drag(page, 200);
    assert.strictEqual(await railW(page), 212, 'dragged back: full');
    // short drag settles on the nearer size
    await drag(page, 160);
    assert.strictEqual(await railW(page), 212, 'not past halfway: stays full');
    // 2. a click switches, so does Enter
    await page.click('#railGrip');
    assert.strictEqual(await railW(page), 60, 'click: icons only');
    await page.focus('#railGrip');
    await page.keyboard.press('Enter');
    assert.strictEqual(await railW(page), 212, 'Enter: full');
    await page.click('#railGrip');
    // 4. kept after a reload, from the first paint
    await page.reload();
    await page.waitForSelector('#railGrip');
    assert(await page.evaluate(() => document.documentElement.classList.contains('slim-rail')) && await railW(page) === 60, 'icons only after a reload');
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-opts'))).slimRail, true);
    await page.click('#railGrip');

    // 5. League: the list slides in from the right, the top says League, the bottom Premade; Premade goes back to the last Premade page
    await page.evaluate(() => { document.documentElement.dataset.motion = 'on'; });
    await page.click('.nav[data-view="friends"]');
    await page.click('#leagueNav');
    const sw = await page.evaluate(() => ({ list: !document.getElementById('leagueList').hidden, premade: document.getElementById('premadeList').hidden, top: document.getElementById('brandL').checkVisibility() && document.getElementById('brandL').textContent, bottom: document.querySelector('#leagueNav span').textContent, page: !document.querySelector('.view[data-view="prox"]').hidden, slide: document.getElementById('leagueList').getAnimations().map((a) => a.animationName), fade: document.querySelector('.view[data-view="prox"]').getAnimations().length }));
    assert.deepStrictEqual(sw, { list: true, premade: true, top: 'League', bottom: 'Premade', page: true, slide: ['rail-in'], fade: 0 }, 'League’s list slides in, the page doesn’t also fade');
    assert.deepStrictEqual(await visibleNames(page), ['Proximity voice', 'Profile', 'Pregame', 'Game', 'Overlay', 'Stats', 'TFT', 'Premade'], 'League’s pages in the sidebar');
    assert.strictEqual(await page.getAttribute('#leagueNav', 'aria-current'), null, 'the bottom button isn’t lit');
    await page.waitForTimeout(300);
    await page.click('.nav[data-view="stats"]');
    await shot(page, '3-full-league');
    await page.click('#leagueNav');
    assert(await page.isVisible('.view[data-view="friends"]') && await page.isVisible('#premadeList') && await page.textContent('#leagueNav span') === 'League', 'Premade: back to Friends');
    await page.click('#leagueNav');
    assert(await page.isVisible('.view[data-view="stats"]'), 'League again: the last League page');
    await page.click('#railGrip');
    await page.waitForTimeout(300);
    await shot(page, '4-icons-league');
    await page.click('#railGrip');
    await page.click('#leagueNav');
    // 6. a League page opened another way swaps the list too (the status bar's Tracking)
    await page.click('#sbTrack');
    assert(await page.isVisible('.view[data-view="prox"]') && await page.isVisible('#leagueList'), 'Tracking opens League’s list');
    await page.click('#leagueNav');
    // 10. League pages' titles sit where other pages' titles sit
    const top = (v) => page.evaluate((v) => document.querySelector(`.view[data-view="${v}"]`).getBoundingClientRect().top, v);
    const fTop = await top('friends');
    await page.click('#leagueNav');
    await page.click('.nav[data-view="stats"]');
    assert.strictEqual(await top('stats'), fTop, 'Stats starts where Friends does');
    // 7. Reduced: a short fade; off: nothing
    await page.click('#leagueNav');
    await page.evaluate(() => { document.documentElement.dataset.motion = 'reduced'; });
    await page.click('#leagueNav');
    const red = await page.evaluate(() => { const a = document.getElementById('leagueList').getAnimations()[0]; return a && { ms: a.effect.getTiming().duration, x: getComputedStyle(document.documentElement).getPropertyValue('--m').trim() }; });
    assert.deepStrictEqual(red, { ms: 150, x: '0' }, 'Reduced: a 150 ms fade, no movement');
    await page.evaluate(() => { document.documentElement.dataset.motion = 'off'; });
    await page.click('#leagueNav');
    assert.strictEqual(await page.evaluate(() => document.getElementById('premadeList').getAnimations().length), 0, 'off: instant');
    await page.evaluate(() => { document.documentElement.dataset.motion = 'on'; });

    // startup on Profile: League's list, no slide
    await page.evaluate(() => localStorage.setItem('lpc-start', 'profile'));
    await page.reload();
    await page.waitForSelector('#railGrip');
    assert(await page.evaluate(() => !document.querySelector('.view[data-view="profile"]').hidden && !document.getElementById('leagueList').hidden && !document.getElementById('leagueList').getAnimations().length), 'starts on Profile with League’s list, no slide');
    await shot(page, '5-profile-start');
    await page.click('#leagueNav');
    assert(await page.isVisible('.view[data-view="voice"]'), 'Premade from a Profile start: Rooms');

    // 8. App size 150%: the edge follows the mouse exactly
    await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('lpc-opts')); o.zoom = 1.5; localStorage.setItem('lpc-opts', JSON.stringify(o)); });
    await page.reload();
    await page.waitForSelector('#railGrip');
    const right0 = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().right);
    assert(Math.abs(right0 - 318) < 1, 'full at 150% is 318 screen pixels: ' + right0);
    await drag(page, right0 - 60, { up: false });
    const right1 = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().right);
    assert(Math.abs(right1 - (right0 - 60)) < 2, `the edge stays under the mouse at 150%: ${right1} vs ${right0 - 60}`);
    await page.mouse.up();
    assert.strictEqual(await railW(page), 212, 'not past halfway at 150%: full');
    await shot(page, '6-full-150');
    await page.click('#railGrip');
    await page.hover('.nav[data-view="settings"]');
    await page.waitForTimeout(250);
    const tip15 = await page.evaluate(() => { const t = document.getElementById('railTip').getBoundingClientRect(), b = document.querySelector('.nav[data-view="settings"]').getBoundingClientRect(); return Math.abs((t.top + t.bottom) / 2 - (b.top + b.bottom) / 2) < 2 && t.left > b.right && t.left - b.right < 30; });
    assert(tip15, 'the hover name sits beside its icon at 150%');
    await shot(page, '7-icons-150');
    await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('lpc-opts')); o.zoom = 1; o.slimRail = false; localStorage.setItem('lpc-opts', JSON.stringify(o)); });

    // 9. a narrow window: icons only with no edge
    await page.setViewportSize({ width: 700, height: 800 });
    await page.reload();
    await page.waitForSelector('#railGrip', { state: 'attached' });
    assert(await railW(page) === 60 && await page.isHidden('#railGrip'), 'narrow: icons only, no edge');
    assert(await page.getByRole('button', { name: 'Friends', exact: true }).isVisible(), 'narrow: names kept for screen readers');
    await ctx.close();

    // 9. a phone: the bottom bar swaps the same way, no edge
    const ph = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true });
    await ph.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ph.addInitScript(() => { delete MediaDevices.prototype.getDisplayMedia; if (!localStorage.getItem('lpc-setup')) { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-news', '9999'); } });
    const pp = await ph.newPage();
    await pp.goto(URL0);
    await pp.waitForSelector('#railGrip', { state: 'attached' });
    assert(await pp.evaluate(() => document.documentElement.classList.contains('phone')) && await pp.isHidden('#railGrip'), 'phone, no edge');
    assert.deepStrictEqual(await visibleNames(pp), ['Rooms', 'Friends', 'Aion 2', 'Settings', 'League'], 'phone: Premade’s bar');
    await shot(pp, '8-phone-premade');
    await pp.click('#leagueNav');
    assert.deepStrictEqual(await visibleNames(pp), ['Proximity voice', 'Profile', 'Stats', 'TFT', 'Premade'], 'phone: League’s bar');
    await pp.waitForTimeout(300);
    await shot(pp, '9-phone-league');
    console.log('sidebar e2e: all checks passed');
  } finally { await browser.close(); }
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

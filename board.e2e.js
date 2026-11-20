// Test of everyone's rank on the overlay (site/overlay.html, What's new 166-168), in headless Chromium with a stand-in
// for the desktop app: Premade's own loading screen with your team on top on the red side and at the bottom on the blue
// side, the same smaller in a game, the cards, rows and your-lane-first looks, each stat's box on hover, 2 tags a card
// on the loading screen and 1 in a game, and the board kept (not drawn again) while the rest of the overlay updates.
//   node board.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
const srv = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8093);

const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const P = (name, ally, extra = {}) => ({ name, sub: 'Zed · Middle', pic: '', art: '', spells: [], me: false, ally, lane: false, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: '', rec: 'Zed: 9 of the last 20, 67% won',
  stats: { l20: { w: 12, l: 8, lines: lines(20, (i) => `Zed · Win · 8/2/5 (6.5 KDA) · 180 CS (7.2 a minute) · ${i + 2} days ago`) }, role: { pos: 'MIDDLE', name: 'Middle', off: false, lines: ['Middle: 16 games, 9 won'] }, sea: { w: 77, l: 63, lines: ['Solo/Duo: 77W 63L, 55% won'] } },
  tags: [['good', 'Millionaire: Zed'], ['', 'One-trick: Zed']], ...extra });
const board = (over) => ({ look: 'cards', load: true, side: 'red', title: 'Ranked Solo/Duo', heads: ['Your team · Gold II', 'Their team · Gold III'], tips: { title: 'Ahri against Zed', lines: ['Respect level 6'] },
  us: ['A', 'B', 'Me', 'D', 'E'].map((n) => P(n, true, n === 'Me' ? { me: true } : {})), them: ['F', 'G', 'Lane', 'I', 'J'].map((n) => P(n, false, n === 'Lane' ? { lane: true } : n === 'J' ? { stats: { l20: null, role: null, sea: null }, rank: 'Unranked', tags: [] } : {})), ...over });
const state = (b, game = '') => ({ visible: true, board: b, pos: 'tl', scale: 1, opacity: 1, game, prog: true });

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => { window.lpcClient = { on: (n, f) => { if (n === 'overlay') window.fire = f; }, overlayProg: (m) => (window.prog = m), overlayMouse: (on) => (window.mouse = on) }; });
    await page.goto('http://127.0.0.1:8093/overlay.html');
    const fire = (s) => page.evaluate((x) => window.fire(x), s);
    const heads = () => page.$$eval('.rb .team', (l) => l.map((e) => e.textContent));
    // red side: your team on top; blue side: at the bottom, with the tips between
    await fire(state(board()));
    assert.deepStrictEqual(await heads(), ['Your team · Gold II', 'Their team · Gold III']);
    assert.strictEqual(await page.textContent('.rhead b'), 'Red side: your team is on top');
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('.rb')).backgroundImage !== 'none' && document.querySelector('.rb').getBoundingClientRect().height === innerHeight), 'the loading screen covers the screen');
    await shot(page, 'board-red');
    await fire(state(board({ side: 'blue' })));
    assert.deepStrictEqual(await heads(), ['Their team · Gold III', 'Your team · Gold II']);
    assert.deepStrictEqual(await page.$$eval('.rb > *', (l) => l.map((e) => e.className)), ['rhead', 'tm foes', 'tipband', 'tm'], 'the tips between the teams');
    // 2 tags a card on the loading screen, 1 in a game; You and Your lane; hidden and unranked stats
    assert.deepStrictEqual(await page.$$eval('.pc', (l) => l.map((c) => c.querySelectorAll('.chip').length)), [2, 2, 2, 2, 0, 2, 2, 2, 2, 2]);
    assert.deepStrictEqual(await page.$$eval('.chipx', (l) => l.map((e) => e.textContent)), ['Your lane', 'You']);
    assert.deepStrictEqual(await page.$$eval('.foes .pc:nth-child(5) .vl', (l) => l.map((e) => e.textContent)), ['Hidden', 'Hidden', 'Unranked']);
    await fire(state(board({ load: false }), 'Dragon 1:00'));
    assert.deepStrictEqual(await page.$$eval('.pc', (l) => l.map((c) => c.querySelectorAll('.chip').length)), [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    const box = await page.evaluate(() => { const r = document.querySelector('.rb').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; });
    assert(box[0] > 50 && box[1] < 760 && box[2] > 300 && box[3] < 1620, `in a game, smaller in the middle: ${box}`);
    await shot(page, 'board-in-game');
    // each stat's box on hover, and kept open while the rest of the overlay updates
    const pop = '.pc.me .st:nth-child(1) .pop';
    assert(!(await page.isVisible(pop)), 'closed');
    await page.hover('.pc.me .st:nth-child(1)');
    assert(await page.isVisible(pop), 'open on hover');
    assert.strictEqual(await page.$$eval(`${pop} > div`, (l) => l.length), 20, 'a line a game');
    const before = await page.evaluateHandle(() => document.querySelector('.rb'));
    await fire(state(board({ load: false }), 'Dragon 0:59'));
    assert(await page.evaluate((b) => b === document.querySelector('.rb') && b.isConnected, before), 'the board isn’t drawn again');
    assert(await page.isVisible(pop), 'still open');
    await page.hover('.pc.me .st:nth-child(2)');
    assert(!(await page.isVisible(pop)) && await page.isVisible('.pc.me .st:nth-child(2) .pop'), 'the next stat’s box');
    await shot(page, 'board-hover');
    // rows and your lane first
    await fire(state(board({ look: 'rows' })));
    assert.strictEqual(await page.locator('.rb.rows .pc').count(), 10);
    assert(await page.evaluate(() => { const r = [...document.querySelectorAll('.rows .pc')].map((e) => e.getBoundingClientRect()); return r.every((x, i) => !i || x.top >= r[i - 1].bottom - 1); }), 'a row each');
    await shot(page, 'board-rows');
    await fire(state(board({ look: 'lane', side: 'blue' })));
    assert.deepStrictEqual(await page.$$eval('.rb.lane > *', (l) => l.map((e) => e.className)), ['rhead', 'tm foes small', 'mid', 'tm small'], 'their team above, you and your lane in the middle, yours below');
    assert.deepStrictEqual(await page.$$eval('.mid .pc .chipx', (l) => l.map((e) => e.textContent)), ['You', 'Your lane']);
    assert(await page.evaluate(() => document.querySelector('.rb').scrollHeight <= innerHeight + 1), 'fits the screen');
    await shot(page, 'board-lane');
    // 300 redraws, the clock ticking and the look changing: the page's nodes stay level (no leak)
    const nodes = () => page.evaluate(async () => { for (let i = 0; i < 150; i++) { window.fire(window.st(i)); await new Promise((r) => setTimeout(r)); } return document.getElementsByTagName('*').length; });
    await page.evaluate(([a, b]) => { window.st = (i) => ({ ...(i % 2 ? a : b), game: `Dragon 0:${String(i % 60).padStart(2, '0')}` }); }, [state(board({ look: 'rows' })), state(board({ look: 'lane' }))]);
    const n1 = await nodes(), n2 = await nodes();
    assert(n2 <= n1 + 5, `nodes level over 300 redraws: ${n1} then ${n2}`);
    console.log(`board, 300 redraws: nodes ${n1} then ${n2}`);
    // a board off: nothing left over
    await fire({ visible: true, board: null, pos: 'tl', scale: 1, opacity: 1, game: 'Dragon 0:58' });
    assert.strictEqual(await page.locator('.rb').count(), 0);
    // the card over League's end screen: its Scoreboard button takes the mouse while over it, and opens the Game page
    await fire({ visible: true, pos: 'tl', scale: 1, opacity: 1, after: { title: 'Victory · Ahri', win: true, lines: ['+18 LP'], board: true } });
    await page.hover('.after button');
    assert.strictEqual(await page.evaluate(() => window.mouse), true, 'the mouse taken over the button');
    await page.click('.after button');
    assert.deepStrictEqual(await page.evaluate(() => window.prog), { id: 'after', go: 'scoreboard' });
    await page.mouse.move(5, 700);
    assert.strictEqual(await page.evaluate(() => window.mouse), false, 'and given back');
    await fire({ visible: true, pos: 'tl', scale: 1, opacity: 1, after: { title: 'Victory', win: true, lines: [] } });
    assert.strictEqual(await page.locator('.after button').count(), 0, 'no button without a report');
    console.log('Board tests passed: red and blue side, the loading screen and in game, 2 tags then 1, hover boxes kept through updates, rows and your lane first');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

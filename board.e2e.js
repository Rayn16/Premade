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

// stats as index.html's cardStats sends them (What's new 174): 14W 6L (70%, green), season 45W 55L (45%, red)
const G20 = Array.from({ length: 20 }, (_, i) => ({ c: i % 3 ? 'Zed' : 'Ahri', win: i % 10 < 7, q: 'Ranked Solo/Duo', k: 8, d: 2, a: 5, it: [3006, 3031, 0, 0, 0, 0], ago: `${i + 2}d` }));
const STATS = { l20: { w: 14, l: 6, games: G20 }, role: { pos: 'MIDDLE', name: 'Middle', off: false, now: 'MIDDLE', list: [['MIDDLE', 16, 9], ['TOP', 4, 1]] },
  sea: { w: 45, l: 55, now: ['Gold II', '', '#d9ad55'], lp: 45, peak: ['Gold I', '', '#d9ad55'], end: ['Silver I', '', '#a9b9c4'], champs: [['Zed', 13, 9], ['Ahri', 7, 5]], mastery: [['Zed', 7, 412000], ['Ahri', 5, 61000]] } };
const P = (name, ally, extra = {}) => ({ name, sub: 'Zed · Middle', pic: '', art: '', spells: [], me: false, ally, lane: false, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: '', rec: 'Zed: 9 of the last 20, 67% won',
  stats: STATS, tags: [['good', 'Millionaire: Zed'], ['', 'One-trick: Ahri']], ...extra });
const board = (over) => ({ look: 'cards', load: true, dd: 'https://ddragon.leagueoflegends.com/cdn/14.1.1', side: 'red', title: 'Ranked Solo/Duo', heads: ['Your team · Gold II', 'Their team · Gold III'], tips: { title: 'Ahri against Zed', lines: ['Respect level 6'] },
  us: ['A', 'B', 'Me', 'D', 'E'].map((n) => P(n, true, n === 'Me' ? { me: true } : {})), them: ['F', 'G', 'Lane', 'I', 'J'].map((n) => P(n, false, n === 'Lane' ? { lane: true } : n === 'J' ? { stats: { l20: null, role: null, sea: null }, rank: 'Unranked', tags: [] } : n === 'I' ? { stats: { ...STATS, role: { ...STATS.role, off: true, now: 'TOP' }, sea: { ...STATS.sea, w: 0, l: 0, now: null, peak: null, end: null } } } : {})), ...over });
const state = (b, game = '') => ({ visible: true, board: b, pos: 'tl', scale: 1, opacity: 1, game, prog: true });

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => { window.lpcClient = { on: (n, f) => { if (n === 'overlay') window.fire = f; }, overlayProg: (m) => (window.prog = m), overlayMouse: (on) => (window.mouse = on) }; });
    // Data Dragon's pictures: a colored square with the name's first letter (no network in tests)
    await page.route(/ddragon\.leagueoflegends\.com/, (r) => { const n = decodeURIComponent(r.request().url().replace(/^.*\//, '').replace(/\.png$/, '')), h = [...n].reduce((t, c) => t + c.charCodeAt(0) * 37, 0) % 360;
      r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${h} 45% 40%)"/><text x="5" y="7.2" font-size="6" text-anchor="middle" fill="#fff" font-family="sans-serif">${n[0]}</text></svg>` }); });
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
    // the rings: 70% green, 45% red, the role's icon; off-role red; unranked empty
    const rings = (sel) => page.$$eval(`${sel} .st`, (l) => l.map((c) => [c.querySelector('text') ? c.querySelector('text').textContent : '', getComputedStyle(c.querySelectorAll('circle')[1] || c.querySelector('path') || c).stroke, c.querySelector('.vl').textContent]));
    const [g, r] = await page.evaluate(() => ['--good', '--bad'].map((v) => { const e = document.createElement('i'); e.style.color = `var(${v})`; document.querySelector('.rb').append(e); const c = getComputedStyle(e).color; e.remove(); return c; }));
    const [fg] = await page.evaluate(() => { const e = document.createElement('i'); e.style.color = 'var(--fg)'; document.querySelector('.rb').append(e); const c = getComputedStyle(e).color; e.remove(); return [c]; });
    assert.deepStrictEqual(await rings('.pc.me'), [['70%', g, '14W 6L'], ['', fg, 'Middle'], ['45%', r, '45W 55L']]);
    assert.deepStrictEqual(await rings('.foes .pc:nth-child(4)'), [['70%', g, '14W 6L'], ['', r, 'Middle'], ['', 'none', 'Unranked']], 'off-role red, unranked empty');
    assert.strictEqual(await page.locator('.foes .pc:nth-child(5) .st circle').count(), 3, 'hidden: three empty rings');
    // nothing opens on a hidden player's rings
    await page.hover('.foes .pc:nth-child(5) .st:nth-child(1)');
    assert.strictEqual(await page.locator('.pop').count(), 0, 'no box when hidden');
    await fire(state(board({ load: false }), 'Dragon 1:00'));
    assert.deepStrictEqual(await page.$$eval('.pc', (l) => l.map((c) => c.querySelectorAll('.chip').length)), [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    const box = await page.evaluate(() => { const r = document.querySelector('.rb').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; });
    assert(box[0] > 50 && box[1] < 760 && box[2] > 300 && box[3] < 1620, `in a game, smaller in the middle: ${box}`);
    await shot(page, 'board-in-game');
    const hov = async (sel) => { await page.mouse.move(1, 1); await page.hover(sel); }; // away first: an open box covers the rings under it
    // each ring's box on hover (What's new 174), kept open while the rest of the overlay updates
    const pop = '.pc.me .st:nth-child(1) .pop';
    await hov('.pc.me .st:nth-child(1)');
    assert(await page.isVisible(pop), 'open on hover');
    assert.deepStrictEqual(await page.$$eval(`${pop} .blk i`, (l) => [l.length, l.filter((e) => e.className === 'w').length]), [20, 14], 'a block a game, green wins');
    assert.strictEqual(await page.locator(`${pop} .gr`).count(), 10, 'the newest 10 as rows');
    const row = await page.$eval(`${pop} .gr`, (e) => ({ pic: e.querySelector('img').src.replace(/^.*\//, ''), loaded: e.querySelector('img').complete && e.querySelector('img').naturalWidth > 0, word: e.querySelector('.res b').textContent, color: getComputedStyle(e.querySelector('.res b')).color,
      q: e.querySelector('.res span').textContent, kda: e.querySelector('.kda b').textContent, ago: e.querySelector('.kda > span').textContent, items: e.querySelectorAll('.its > *').length, pics: e.querySelectorAll('.its img').length, d: getComputedStyle(e.querySelector('.kda .l')).color }));
    assert.deepStrictEqual({ ...row, color: row.color === g, d: row.d !== fg }, { pic: 'Ahri.png', loaded: true, word: 'Victory', color: true, q: 'Ranked Solo/Duo', kda: '8 / 2 / 5', ago: '2d ago', items: 6, pics: 2, d: true });
    assert.strictEqual(await page.$eval(`${pop} .gr:nth-child(8) .res b`, (e) => e.textContent), 'Defeat');
    const before = await page.evaluateHandle(() => document.querySelector('.rb'));
    await fire(state(board({ load: false }), 'Dragon 0:59'));
    assert(await page.evaluate((b) => b === document.querySelector('.rb') && b.isConnected, before), 'the board isn’t drawn again');
    assert(await page.isVisible(pop), 'still open');
    await shot(page, 'hover-last20-in-game');
    // role: the played bar against the most played, the win rate's color, This game
    await hov('.pc.me .st:nth-child(2)');
    const role = '.pc.me .st:nth-child(2) .pop';
    assert(!(await page.isVisible(pop)) && await page.isVisible(role), 'the next ring’s box');
    assert.deepStrictEqual(await page.$$eval(`${role} .br:not(.hd)`, (l) => l.map((e) => [...e.querySelectorAll('.bar > span')].map((x) => x.textContent).concat(e.querySelector('.now') ? e.querySelector('.now').className : ''))), [['16', '56%', 'now'], ['4', '25%', '']]);
    assert.deepStrictEqual(await page.$$eval(`${role} .bar > i > i`, (l) => l.map((e) => e.style.width)), ['100%', '56%', '25%', '25%']);
    await hov('.foes .pc:nth-child(4) .st:nth-child(2)');
    assert.strictEqual(await page.getAttribute('.foes .pc:nth-child(4) .st:nth-child(2) .now', 'class'), 'now off', 'This game red when off-role');
    // season: rank now, peak, last season, champions, mastery; unranked still opens with the champions
    await hov('.pc.me .st:nth-child(3)');
    const sea = '.pc.me .st:nth-child(3) .pop';
    assert.deepStrictEqual(await page.$eval(sea, (e) => [e.querySelector('.rn b').textContent, e.querySelector('.rn span').textContent, [...e.querySelectorAll('.sm b')].map((x) => x.textContent), e.querySelectorAll('.sec:not(.ms) .br:not(.hd)').length, [...e.querySelectorAll('.mrw > span')].map((x) => x.textContent)]),
      ['Gold II', '45 LP', ['Gold I', 'Silver I'], 2, ['7412k', '561k']]);
    await hov('.foes .pc:nth-child(4) .st:nth-child(3)');
    assert.deepStrictEqual(await page.$eval('.foes .pc:nth-child(4) .st:nth-child(3) .pop', (e) => [e.querySelector('.rn b').textContent, e.querySelectorAll('.sm').length, e.querySelectorAll('.sec').length]), ['Unranked', 0, 2]);
    // every box inside the screen, on both sides, on the loading screen and in game; in game at the loading screen's size
    const inside = async (sideName, load) => {
      await fire(state(board({ side: sideName, load }), load ? '' : 'Dragon 1:00'));
      for (const c of await page.$$('.st:has(svg circle:nth-of-type(2)), .st:has(path)')) {
        await page.mouse.move(1, 1); await c.hover();
        const r = await c.evaluate((e) => { const b = e.querySelector('.pop'); if (!b) return null; const q = b.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom, parseFloat(getComputedStyle(b).fontSize)]; });
        if (r) assert(r[0] >= 0 && r[1] >= 0 && r[2] <= 1920 && r[3] <= 1080, `${sideName} ${load ? 'loading' : 'in game'}: a box off the screen ${r}`);
        if (r && !load) assert(Math.abs(r[4] * 0.62 - 10.8) < 0.3, `in game the box is at the loading screen's size: ${r[4]}`);
      }
    };
    for (const sd of ['red', 'blue']) for (const ld of [true, false]) await inside(sd, ld);
    await fire(state(board({ side: 'red' })));
    for (const [n, name] of [[1, 'hover-last20'], [2, 'hover-role'], [3, 'hover-season']]) { await hov(`.pc.me .st:nth-child(${n})`); await page.waitForTimeout(50); await shot(page, name); }
    await fire(state(board({ side: 'blue' })));
    await hov('.foes .pc:nth-child(4) .st:nth-child(1)');
    await shot(page, 'hover-last20-blue-top');
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
    // 100 boxes opened over 100 new boards: nodes and listeners stay level
    const opens = async () => { for (let i = 0; i < 50; i++) { await fire({ ...state(board({ look: 'cards' })), game: `Dragon 1:${String(i).padStart(2, '0')}`, board: board({ title: 'Game ' + i }) }); await page.mouse.move(1, 1); await page.hover(`.pc.me .st:nth-child(${1 + (i % 3)})`); }
      return page.evaluate(() => document.getElementsByTagName('*').length); };
    const h1 = await opens(), h2 = await opens();
    assert(h2 <= h1 + 5, `nodes level over 100 boxes opened: ${h1} then ${h2}`);
    console.log(`board, 100 boxes opened: nodes ${h1} then ${h2}`);
    console.log(`board, 300 redraws: nodes ${n1} then ${n2}`);
    // What's new 179: in a game, dragged by its top line and resized by its corner, kept for the next board, put back by a double-click
    await fire(state(board({ load: false, title: 'Move me' }), 'Dragon 0:57'));
    const rect = () => page.$eval('.rb', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; });
    const [l0, t0, w0] = await rect();
    await page.mouse.move(1, 1);
    await page.hover('.rb .rhead');
    assert.strictEqual(await page.evaluate(() => window.mouse), true, 'the top line takes the mouse');
    await page.mouse.down();
    await page.mouse.move(l0 + 200, t0 + 20, { steps: 4 });
    await page.mouse.move(5, 5, { steps: 4 }); // off the line: still dragging, the mouse still taken
    assert.strictEqual(await page.evaluate(() => window.mouse), true, 'kept while dragging');
    await page.mouse.move(l0 - 200, t0 + 300, { steps: 4 });
    await page.mouse.up();
    const [l1, t1, w1] = await rect();
    assert(w1 === w0 && l1 < l0 - 100 && t1 > t0 + 200, `moved: ${[l0, t0]} to ${[l1, t1]}`);
    const grip = await page.$eval('.rb .rsz', (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(...grip);
    await page.mouse.down();
    await page.mouse.move(grip[0] - w1 / 4, grip[1], { steps: 4 });
    await page.mouse.up();
    const [l2, t2, w2] = await rect();
    assert(l2 === l1 && t2 === t1 && Math.abs(w2 - w1 * 0.75) < 3, `resized from its corner: ${w1} to ${w2}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ovBoard')));
    assert(Math.abs(saved.k - 0.62 * 0.75) < 0.01, `size kept: ${saved.k}`);
    assert(Math.abs(await page.$eval('.rb', (e) => parseFloat(getComputedStyle(e).getPropertyValue('--bk'))) - saved.k) < 0.001, 'the boxes keep their size');
    await shot(page, 'board-moved');
    await fire(state(board({ load: false, title: 'Next game' }), 'Dragon 0:56'));
    assert.deepStrictEqual(await rect(), [l2, t2, w2], 'a new board where it was left');
    await page.dblclick('.rb .rhead');
    assert.deepStrictEqual(await rect(), [l0, t0, w0], 'put back');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('ovBoard')), null);
    await fire(state(board({ title: 'Loading' })));
    assert.strictEqual(await page.isVisible('.rb .rsz'), false, 'the loading screen stays whole');
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
    console.log('Board tests passed: red and blue side, the loading screen and in game, 2 tags then 1, ring boxes as pictures inside the screen, kept through updates, rows and your lane first');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

// Test of everyone's rank on the overlay (site/overlay.html, What's new 166-168, cards since 205), in headless Chromium
// with a stand-in for the desktop app: Premade's own loading screen as League-style cards with your team on top on the
// red side and at the bottom on the blue side, the same at half size in a game, each stat's box on hover, the mini
// profile on names, 2 tags a card, and the board kept (not drawn again) while the rest of the overlay updates.
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

// stats as index.html's cardStats sends them (What's new 174, 205): 14W 6L in the last 20 (the newest 10: 7W 3L)
const G20 = Array.from({ length: 20 }, (_, i) => ({ c: i % 3 ? 'Zed' : 'Ahri', win: i % 10 < 7, q: 'Ranked Solo/Duo', k: 8, d: 2, a: 5, it: [3006, 3031, 0, 0, 0, 0], ago: `${i + 2}d` }));
const STATS = { l20: { w: 14, l: 6, games: G20 }, role: { pos: 'MIDDLE', name: 'Middle', off: false, now: 'MIDDLE', list: [['MIDDLE', 16, 9], ['TOP', 4, 1]] },
  sea: { w: 45, l: 55, now: ['Gold II', '', '#d9ad55'], lp: 45, peak: ['Gold I', '', '#d9ad55'], champs: [['Zed', 13, 9], ['Ahri', 7, 5]] } };
const DDV = 'https://ddragon.leagueoflegends.com/cdn/14.1.1';
const MP = { tag: 'EUW', lvl: 41, icon: `${DDV}/img/profileicon/4568.png`, ban: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yasuo_2.jpg', other: ['Emerald I', '', '#34b37a', 55, 8, 4],
  last: [['Emerald II', '', '#34b37a'], ['Emerald I', '', '#34b37a']], mastery: [['Zed', 7, 412000], ['Yasuo', 7, 1200000], ['Fizz', 5, 61000]] };
const P = (name, ally, extra = {}) => ({ name, id: name + '#EUW', ch: 'Zed', pic: `${DDV}/img/champion/Zed.png`, art: '', spells: [`${DDV}/img/spell/SummonerFlash.png`, `${DDV}/img/spell/SummonerDot.png`],
  runes: ['https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Domination/Electrocute/Electrocute.png', 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png'],
  me: false, ally, lane: false, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: '', on: [9, 6, 7], stats: STATS, tags: [['good', 'Millionaire'], ['', 'One-trick: Ahri']], mp: MP, ...extra });
const board = (over) => ({ load: true, dd: DDV, side: 'red', heads: [['Gold II', '#d9ad55', true], ['Gold III', '#d9ad55', false]], tips: { title: 'Ahri against Zed', lines: ['Respect level 6', 'Ward the river'] },
  us: ['A', 'B', 'Me', 'D', 'E'].map((n) => P(n, true, n === 'Me' ? { me: true } : n === 'E' ? { rank: 'Looking up…', tc: '', stats: null, on: null, tags: [], mp: null, runes: [] } : {})),
  them: ['F', 'G', 'Lane', 'I', 'J'].map((n) => P(n, false, n === 'Lane' ? { lane: true, on: [0, 0, 0] } : n === 'J' ? { id: '', stats: { l20: null, role: null, sea: null, why: 'Match history didn’t load' }, rank: 'Unranked', tc: '', on: null, tags: [], mp: null }
    : n === 'I' ? { stats: { ...STATS, role: { ...STATS.role, off: true, now: 'TOP' }, sea: { ...STATS.sea, w: 0, l: 0, now: null, peak: null } }, mp: { ...MP, other: null, last: null } } : {})), ...over });
const state = (b, game = '', scale = 1) => ({ visible: true, board: b, pos: 'tl', scale, opacity: 1, game, prog: true });

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => { window.lpcClient = { on: (n, f) => { if (n === 'overlay') window.fire = f; }, overlayProg: (m) => (window.prog = m), overlayMouse: (on) => (window.mouse = on) }; });
    // Data Dragon's pictures: a colored square with the name's first letter (no network in tests)
    await page.route(/ddragon\.leagueoflegends\.com/, (r) => { const n = decodeURIComponent(r.request().url().replace(/^.*\//, '').replace(/\.(png|jpg)$/, '')), h = [...n].reduce((t, c) => t + c.charCodeAt(0) * 37, 0) % 360;
      r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${h} 45% 40%)"/><text x="5" y="7.2" font-size="6" text-anchor="middle" fill="#fff" font-family="sans-serif">${n[0]}</text></svg>` }); });
    await page.goto('http://127.0.0.1:8093/overlay.html');
    const fire = (s) => page.evaluate((x) => window.fire(x), s);
    const lines = () => page.$$eval('.rb .team', (l) => l.map((e) => e.textContent));
    const color = (v) => page.evaluate((x) => { const e = document.createElement('i'); e.style.color = x; document.querySelector('.rb').append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, v);
    // red side: your team on top, one line a row with its average in its tier's color, the tip line between the rows
    await fire(state(board()));
    assert.deepStrictEqual(await lines(), ['Your team · Gold II average · favored', 'Their team · Gold III average']);
    assert.strictEqual(await page.$eval('.rb .team span', (e) => getComputedStyle(e).color), 'rgb(217, 173, 85)', 'the average in its tier’s color');
    assert.deepStrictEqual(await page.$$eval('.rb > *', (l) => l.map((e) => e.className)), ['tm', 'tip', 'tm foes'], 'no queue line, the tip between the rows');
    assert.strictEqual(await page.textContent('.tip'), 'Ahri against Zed: Respect level 6 · Ward the river');
    assert.strictEqual(await page.locator('.rhead, .tipband, .rb circle').count(), 0, 'no top line, tips box or rings');
    assert(await page.evaluate(() => { const b = document.querySelector('.rb'), c = getComputedStyle(b); return c.backgroundImage === 'none' && b.getBoundingClientRect().height === innerHeight; }), 'a plain background over the whole screen');
    assert.deepStrictEqual(await page.$eval('.rb .team', (e) => [getComputedStyle(e).textTransform, getComputedStyle(e).letterSpacing]), ['none', 'normal'], 'sentence case');
    // the cards: 10, two rows of 5 in map-side order, League's size (about 259 x 454 at 1080p), parts 1-7
    const cards = await page.$$eval('.pc', (l) => l.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }));
    assert.strictEqual(cards.length, 10);
    assert(cards.every(([, , w, h]) => Math.abs(w - 259) <= 2 && Math.abs(h - 454) <= 2), `card size ${cards[0]}`);
    assert(cards.slice(0, 5).every((c) => c[1] === cards[0][1]) && cards.slice(5).every((c) => c[1] === cards[5][1]) && cards[5][1] > cards[0][1] + 454, 'two rows');
    assert(cards.every((c, i) => i % 5 === 0 || c[0] > cards[i - 1][0]), 'left to right');
    assert(cards.every((c) => c[0] >= 0 && c[0] + c[2] <= 1920 && c[1] >= 0 && c[1] + c[3] <= 1080), 'all on the screen');
    const parts = await page.$eval('.pc.me', (c) => [c.querySelector('.chipx').textContent, c.querySelector('.chn').textContent, c.querySelectorAll('.ru img').length, !!c.querySelector('.kit i.emb'), c.querySelectorAll('.sp img').length,
      c.querySelector('.who .pn').textContent, c.querySelector('.rkl').textContent, c.querySelectorAll('.srow .blk i').length, c.querySelectorAll('.srow .blk i.w').length, c.querySelector('.chs').textContent, c.querySelectorAll('.chip').length,
      getComputedStyle(c).boxShadow, getComputedStyle(c).borderTopWidth]);
    assert.deepStrictEqual(parts, ['You', 'Zed', 2, true, 2, 'Me', 'Gold II · 45 LP · 55% of 55', 10, 7, '79 games67%', 2, 'none', '2px'], 'parts 1-7, no glow');
    assert.deepStrictEqual(await page.$$eval('.chipx', (l) => l.map((e) => e.textContent)), ['You', 'Your lane']);
    assert.deepStrictEqual(await page.$$eval('.pc:not(.me)', (l) => [...new Set(l.map((c) => getComputedStyle(c).borderTopWidth + ' ' + getComputedStyle(c).borderTopColor))].length), 1, 'the same line on both teams');
    const [gL, bad] = [await color('color-mix(in srgb, var(--good) 60%, var(--fg))'), await color('var(--bad)')];
    assert.deepStrictEqual(await page.$eval('.pc.me .rkl', (e) => [getComputedStyle(e.querySelector('b')).color, getComputedStyle(e.querySelectorAll('b')[1]).color]), ['rgb(217, 173, 85)', gL], 'the tier in its color, 55% green');
    assert.strictEqual(await page.$eval('.pc.me .chs > span:last-child > span', (e) => getComputedStyle(e).color), gL, '67% green');
    assert.strictEqual(await page.$eval('.foes .pc:nth-child(4) .srow svg rect', (e) => getComputedStyle(e).stroke), bad, 'off-role red');
    assert.strictEqual(await page.$eval('.foes .pc:nth-child(3) .chs', (e) => e.textContent), 'No gamesin the last 20');
    // J: unranked, League never gave their games (What's new 224); E: still looking up
    assert.deepStrictEqual(await page.$eval('.foes .pc:nth-child(5)', (c) => [c.querySelector('.rkl').textContent, c.querySelector('.rkl').classList.contains('mu'), !!c.querySelector('.kit i.emb'), c.querySelector('.srow').textContent, c.querySelectorAll('.chip').length]),
      ['Unranked', true, true, 'Match history didn’t load', 0]);
    assert.deepStrictEqual(await page.$eval('.tm:not(.foes) .pc:nth-child(5)', (c) => [c.querySelector('.rkl').textContent, c.querySelectorAll('.ru img').length, c.querySelectorAll('.ru i').length, c.querySelectorAll('.sp img').length, c.querySelector('.srow').childElementCount]),
      ['Looking up…', 0, 2, 2, 0], 'looking up: art, champion, empty rune spots, spells, name');
    await shot(page, 'board-red');
    // What's new 226: a picture behind the cards (Settings > Overlay > Loading screen > Background): a skin's splash over
    // the whole screen, darkened and softened, under the cards; your own read from the site's Cache Storage; in a game
    // inside the half-size box, which still moves by its top line; any other address shows nothing
    const SPLASH = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_15.jpg';
    const bgOf = () => page.evaluate(() => {
      const b = document.querySelector('.rb'), i = b.querySelector('.rbg'), me = document.querySelector('.pc.me').getBoundingClientRect(), r = i && i.getBoundingClientRect(), k = b.getBoundingClientRect();
      return i && { src: i.src, at: [r.left, r.top, r.width, r.height].map(Math.round), box: [k.left, k.top, k.width, k.height].map(Math.round), filter: getComputedStyle(i).filter, pic: b.classList.contains('hasbg'),
        under: !!document.elementFromPoint(me.left + me.width / 2, me.top + me.height / 2).closest('.pc.me'), line: !!document.elementFromPoint(k.left + 40, k.top + 14).closest('.rb > :first-child'), kids: [...b.children].map((e) => e.className) };
    });
    await fire(state(board({ bg: SPLASH })));
    let bg = await bgOf();
    assert.deepStrictEqual([bg.src, bg.at, bg.pic, bg.under], [SPLASH, [0, 0, 1920, 1080], true, true], 'the splash over the whole screen, under the cards');
    assert.match(bg.filter, /^brightness\(0\.4\d*\) blur\(/, 'darkened and softened');
    assert.deepStrictEqual(bg.kids, ['tm', 'tip', 'tm foes', 'rbg'], 'the rows as they were, the picture last');
    await page.waitForFunction(() => document.querySelector('.rbg').complete);
    await shot(page, 'board-bg-skin');
    await page.evaluate(async () => (await caches.open('premade')).put('board-bg', new Response(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#2a8a6a"/><circle cx="8" cy="4" r="3" fill="#e8c46a"/></svg>'], { type: 'image/svg+xml' }))));
    await fire(state(board({ bg: 'own:1700000000000' })));
    await page.waitForFunction(() => /^blob:/.test(document.querySelector('.rbg').src), null, { timeout: 5000 });
    assert.deepStrictEqual((await bgOf()).at, [0, 0, 1920, 1080], 'your own picture, read from the Cache Storage');
    await shot(page, 'board-bg-own');
    await fire(state(board({ bg: 'own:1700000000000', us: board().us.slice(0, 4) })));
    assert.match((await bgOf()).src, /^blob:/, 'read once: there at once when the cards change');
    for (const bad of ['https://example.com/Ahri_15.jpg', 'own:', 'javascript:alert(1)']) {
      await fire(state(board({ bg: bad })));
      assert.strictEqual(await bgOf(), null, `nothing for ${bad}`);
    }
    await fire(state(board({ load: false, bg: SPLASH }), 'Dragon 1:00'));
    bg = await bgOf();
    assert.deepStrictEqual([bg.src, bg.at, bg.under, bg.line], [SPLASH, bg.box, true, true], 'in a game, inside the box, which still moves by its top line');
    assert.match(await page.$eval('.rbg', (e) => getComputedStyle(e).clipPath), /^inset\(0px round/, 'the blur kept inside the box’s corners');
    await shot(page, 'board-bg-in-game');
    // What's new 217: long tags stay inside the card, the second under the first, and the cards still line up; a tag
    // wider than the card ends in "…", whole on hover
    const LONG = 'Pro player: ' + 'Team Liquid Honda Academy '.repeat(2);
    await fire(state(board({ us: board().us.map((p) => (p.name === 'B' ? { ...p, tags: [['bad', 'Autofill: usually support'], ['', 'Premade with Rayan1000RR']] } : p.name === 'D' ? { ...p, tags: [['', LONG]] } : p)) })));
    const tg = await page.$$eval('.pc', (l) => l.map((c) => { const k = c.getBoundingClientRect(), r = [...c.querySelectorAll('.chip')].map((e) => [e.getBoundingClientRect(), e.scrollWidth > e.clientWidth, e.title]);
      return { inside: r.every(([q]) => q.left >= k.left && q.right <= k.right && q.bottom <= k.bottom), lines: new Set(r.map(([q]) => Math.round(q.top))).size, cut: r.map((x) => x[1]), title: r.map((x) => x[2]), who: Math.round(c.querySelector('.who').getBoundingClientRect().top) }; }));
    assert(tg.every((c) => c.inside), 'every tag inside its card');
    assert.deepStrictEqual([tg[1].lines, tg[1].cut, tg[1].title], [2, [false, false], ['Autofill: usually support', 'Premade with Rayan1000RR']], 'two long tags: whole, one under the other');
    assert.deepStrictEqual([tg[0].lines, tg[3].cut, tg[3].title], [1, [true], [LONG]], 'short ones side by side; one wider than the card cut, whole on hover');
    const even = (l) => Math.max(...l) - Math.min(...l) <= 1; // your own card's 2 px line moves its inside by 1 px
    assert(even(tg.slice(0, 5).map((c) => c.who)) && even(tg.slice(5).map((c) => c.who)), `the names still line up: ${tg.map((c) => c.who)}`);
    await shot(page, 'board-long-tags');
    await fire(state(board({ side: 'blue' })));
    assert.deepStrictEqual(await lines(), ['Their team · Gold III average', 'Your team · Gold II average · favored']);
    assert.deepStrictEqual(await page.$$eval('.rb > *', (l) => l.map((e) => e.className)), ['tm foes', 'tip', 'tm']);
    // nothing opens on a hidden player's stats or an unranked player's rank line without a season
    const hov = async (sel) => { await page.mouse.move(1, 1); await page.hover(sel); }; // away first: an open box covers what's under it
    await hov('.tm.foes .pc:nth-child(5) .rkl');
    assert.strictEqual(await page.locator('.pop').count(), 0, 'no box for J');
    // in a game: the same cards at half size (about 720 x 510 at 1080p) in the middle, 2 tags, no tip line
    await fire(state(board({ load: false }), 'Dragon 1:00'));
    assert.deepStrictEqual(await page.$$eval('.pc', (l) => l.map((c) => c.querySelectorAll('.chip').length)), [2, 2, 2, 2, 0, 2, 2, 2, 2, 0]);
    assert.strictEqual(await page.locator('.tip').count(), 0);
    const box = await page.evaluate(() => { const b = document.querySelector('.rb'), r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, getComputedStyle(b).getPropertyValue('--bk').trim()]; });
    console.log('in-game board', box.slice(2, 4).map(Math.round).join(' x ')); assert(Math.abs(box[2] - 720) < 8 && Math.abs(box[3] - 510) < 8 && Math.abs(box[0] + box[2] / 2 - 960) < 2 && Math.abs(box[1] - 97) < 2 && box[4] === '0.5', `in a game, half size in the middle: ${box}`);
    await shot(page, 'board-in-game');
    // each stat's box on hover, kept open while the rest of the overlay updates
    const pop = '.pc.me .srow > .st:first-child .pop';
    await hov('.pc.me .srow > .st:first-child');
    assert(await page.isVisible(pop), 'the blocks open the Last 20 box');
    assert.deepStrictEqual(await page.$$eval(`${pop} .blk i`, (l) => [l.length, l.filter((e) => e.className === 'w').length]), [20, 14], 'a block a game, green wins');
    assert.strictEqual(await page.locator(`${pop} .gr`).count(), 10, 'the newest 10 as rows');
    const row = await page.$eval(`${pop} .gr`, (e) => ({ pic: e.querySelector('img').src.replace(/^.*\//, ''), word: e.querySelector('.res b').textContent, q: e.querySelector('.res span').textContent, kda: e.querySelector('.kda b').textContent, ago: e.querySelector('.kda > span').textContent, items: e.querySelectorAll('.its > *').length, pics: e.querySelectorAll('.its img').length }));
    assert.deepStrictEqual(row, { pic: 'Ahri.png', word: 'Victory', q: 'Ranked Solo/Duo', kda: '8 / 2 / 5', ago: '2d ago', items: 6, pics: 2 });
    const before = await page.evaluateHandle(() => document.querySelector('.rb'));
    await fire(state(board({ load: false }), 'Dragon 0:59'));
    assert(await page.evaluate((b) => b === document.querySelector('.rb') && b.isConnected, before), 'the board isn’t drawn again');
    assert(await page.isVisible(pop), 'still open');
    await shot(page, 'hover-last20-in-game');
    // role: the played bar against the most played, the win rate's color, This game
    const role = '.pc.me .srow > .st:last-child .pop';
    await hov('.pc.me .srow > .st:last-child');
    assert(!(await page.isVisible(pop)) && await page.isVisible(role), 'the role’s box');
    assert.deepStrictEqual(await page.$$eval(`${role} .br:not(.hd)`, (l) => l.map((e) => [...e.querySelectorAll('.bar > span')].map((x) => x.textContent).concat(e.querySelector('.now') ? e.querySelector('.now').className : ''))), [['16', '56%', 'now'], ['4', '25%', '']]);
    await hov('.foes .pc:nth-child(4) .srow > .st:last-child');
    assert.strictEqual(await page.getAttribute('.foes .pc:nth-child(4) .srow > .st:last-child .now', 'class'), 'now off', 'This game red when off-role');
    // the rank line: the Season box with only the peak this season and the champions in the last 20
    await hov('.pc.me .rkl');
    const sea = '.pc.me .st:has(> .rkl) .pop';
    assert.deepStrictEqual(await page.$eval(sea, (e) => [[...e.querySelectorAll('.sec > span:first-child')].map((x) => x.textContent), e.querySelector('.pk b').textContent, e.querySelectorAll('.br:not(.hd)').length, e.querySelectorAll('.rn, .sm, .mrw').length, /Last season|Mastery/.test(e.textContent)]),
      [['Peak this season', 'Champions in the last 20'], 'Gold I', 2, 0, false]);
    await hov('.foes .pc:nth-child(4) .rkl');
    assert.deepStrictEqual(await page.$eval('.foes .pc:nth-child(4) .st:has(> .rkl) .pop', (e) => [e.querySelectorAll('.pk').length, e.querySelectorAll('.sec').length, e.querySelectorAll('.hr').length]), [0, 1, 0], 'no peak: the champions alone');
    // every box inside the screen, on both sides, on the loading screen and in game; in game at the loading screen's size
    const inside = async (sideName, load) => {
      await fire(state(board({ side: sideName, load }), load ? '' : 'Dragon 1:00'));
      for (const c of await page.$$('.st')) {
        await page.mouse.move(1, 1); await c.hover();
        const r = await c.evaluate((e) => { const b = e.querySelector('.pop'); if (!b) return null; const q = b.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom, parseFloat(getComputedStyle(b).fontSize)]; });
        if (r) assert(r[0] >= 0 && r[1] >= 0 && r[2] <= 1920 && r[3] <= 1080, `${sideName} ${load ? 'loading' : 'in game'}: a box off the screen ${r}`);
        if (r && !load) assert(Math.abs(r[4] * 0.5 - 10.8) < 0.3, `in game the box is at the loading screen's size: ${r[4]}`);
      }
    };
    for (const sd of ['red', 'blue']) for (const ld of [true, false]) await inside(sd, ld);
    // the mini profile (What's new 205, planned as 201): rest 0.3 s on a name, under the card on the top half, above
    // the name on the bottom half, never over the card's own rank and stats, closed as soon as the mouse leaves; look only
    await fire(state(board({ side: 'red' })));
    await page.mouse.move(1, 1);
    for (const n of [1, 2, 3, 4]) { await page.hover(`.tm.foes .pc:nth-child(${n}) .pn`); await page.waitForTimeout(60); }
    await page.waitForTimeout(100);
    assert.strictEqual(await page.locator('.mini.on').count(), 0, 'a sweep across the names opens nothing');
    const mini = async (card) => {
      await page.mouse.move(1, 1);
      await page.hover(`${card} .pn`);
      assert.strictEqual(await page.locator(`${card} .mini.on`).count(), 0, 'not before 0.3 s');
      await page.waitForTimeout(400);
      return page.$eval(card, (c) => { const m = c.querySelector('.mini.on'); if (!m) return null; const q = m.getBoundingClientRect(), r = c.getBoundingClientRect(), n = c.querySelector('.pn').getBoundingClientRect(), k = c.querySelector('.rkl').getBoundingClientRect();
        return { box: [q.left, q.top, q.right, q.bottom], under: q.top >= r.bottom - 1, above: q.bottom <= n.top + 1, clear: q.bottom <= k.top || q.top >= k.bottom, font: parseFloat(getComputedStyle(m).fontSize), pe: getComputedStyle(m).pointerEvents, take: m.closest('[data-take]') === c.querySelector('.pn') || m.hasAttribute('data-take'),
          text: [m.querySelector('.mn').textContent, [...m.querySelectorAll('.rkc')].map((x) => x.textContent), [...m.querySelectorAll('.mrw > span')].map((x) => x.textContent), m.querySelector('.dim').textContent] }; });
    };
    const top = await mini('.tm:not(.foes) .pc:nth-child(2)');
    assert(top && top.under && top.clear && top.pe === 'none' && !top.take, `top row: under the card ${JSON.stringify(top)}`);
    assert.deepStrictEqual(top.text, ['B #EUWLevel 41', ['FlexEmerald I55 LP · 8W 4L', 'Last seasonEmerald IIpeak Emerald I'], ['7412k', '71.2M', '561k'], 'Click the name for the full profile']);
    await shot(page, 'mini-top');
    await page.mouse.move(1, 1);
    assert.strictEqual(await page.locator('.mini.on').count(), 0, 'closed once the mouse leaves');
    const bot = await mini('.tm.foes .pc:nth-child(3)');
    assert(bot && bot.above && bot.clear, `bottom row: above the name ${JSON.stringify(bot)}`);
    await shot(page, 'mini-loading');
    const ivy = await mini('.tm.foes .pc:nth-child(4)');
    assert.deepStrictEqual([ivy.text[1], ivy.text[2].length], [[], 3], 'no Flex and no last season: the cells step aside');
    assert.strictEqual(await page.locator('.tm.foes .pc:nth-child(4) .mini .cells, .tm.foes .pc:nth-child(4) .mini .hr').count(), 0);
    await page.mouse.move(1, 1); await page.hover('.tm:not(.foes) .pc:nth-child(5) .pn'); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('.mini').count(), 3, 'no mini while looking up');
    await page.click('.tm.foes .pc:nth-child(3) .pn');
    assert.deepStrictEqual(await page.evaluate(() => window.prog), { id: 'player', go: 'Lane#EUW' }, 'the click still opens their profile');
    // every mini on the screen, on the loading screen and in game (at the loading screen's size)
    for (const load of [true, false]) for (const sd of ['red', 'blue']) {
      await fire(state(board({ side: sd, load }), load ? '' : 'Dragon 1:00'));
      for (const c of ['.tm:not(.foes) .pc:nth-child(1)', '.tm:not(.foes) .pc:nth-child(4)', '.tm.foes .pc:nth-child(1)', '.tm.foes .pc:nth-child(4)']) {
        const m = await mini(c);
        assert(m && m.box[0] >= 0 && m.box[1] >= 0 && m.box[2] <= 1920 && m.box[3] <= 1080 && m.clear, `${sd} ${load ? 'loading' : 'in game'} ${c}: ${JSON.stringify(m)}`);
        if (!load) assert(Math.abs(m.font * 0.5 - 10.8) < 0.3, `in game the mini is at the loading screen's size: ${m.font}`);
      }
    }
    await shot(page, 'mini-in-game');
    await fire(state(board({ side: 'red' })));
    await hov('.pc.me .rkl');
    await page.waitForTimeout(50);
    await shot(page, 'hover-season');
    // 4:3, 1440p and the overlay at 80%: the loading screen fits with nothing cut off
    for (const [w, h, k] of [[1024, 768, 1], [1440, 1080, 1], [2560, 1440, 1], [1920, 1080, 0.8], [1024, 768, 1.4]]) {
      await page.setViewportSize({ width: w, height: h });
      await fire(state(board({ title: `${w}x${h}@${k}` }), '', k));
      const r = await page.$$eval('.pc, .rb .team, .tip > span', (l) => l.map((e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom, e.scrollWidth <= e.clientWidth + 1]; }));
      assert(r.every((q) => q[0] >= 0 && q[1] >= 0 && q[2] <= w && q[3] <= h), `${w}x${h} at ${k}: off the screen ${JSON.stringify(r.find((q) => !(q[0] >= 0 && q[1] >= 0 && q[2] <= w && q[3] <= h)))}`);
      if (w === 1024) await shot(page, `board-4-3-${k}`);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    // 300 redraws, the clock ticking and the board coming and going: the page's nodes stay level (no leak)
    const nodes = () => page.evaluate(async () => { for (let i = 0; i < 150; i++) { window.fire(window.st(i)); await new Promise((r) => setTimeout(r)); } return document.getElementsByTagName('*').length; });
    await page.evaluate(([a, b]) => { window.st = (i) => ({ ...(i % 2 ? a : b), game: `Dragon 0:${String(i % 60).padStart(2, '0')}` }); }, [state(board({ load: false })), state(board({ side: 'blue' }))]);
    const n1 = await nodes(), n2 = await nodes();
    assert(n2 <= n1 + 5, `nodes level over 300 redraws: ${n1} then ${n2}`);
    // 100 boxes and minis opened over 100 new boards: nodes stay level
    const STS = ['.srow > .st:first-child', '.st:has(> .rkl)', '.srow > .st:last-child'];
    const opens = async () => { for (let i = 0; i < 50; i++) { await fire({ ...state(board({ tips: { title: 'Game ' + i, lines: ['x'] } })), game: `Dragon 1:${String(i).padStart(2, '0')}` }); await page.mouse.move(1, 1); await page.hover(i % 4 === 3 ? '.pc.me .pn' : `.pc.me ${STS[i % 3]}`); if (i % 4 === 3) await page.waitForTimeout(320); }
      return page.evaluate(() => document.getElementsByTagName('*').length); };
    const h1 = await opens(), h2 = await opens();
    assert(h2 <= h1 + 5, `nodes level over 100 boxes opened: ${h1} then ${h2}`);
    console.log(`board, 100 boxes opened: nodes ${h1} then ${h2}`);
    console.log(`board, 300 redraws: nodes ${n1} then ${n2}`);
    // What's new 179: in a game, dragged by its top line and resized by its corner, kept for the next board, put back by
    // a double-click; What's new 205: the old board's saved place (ovBoard) isn't used
    await page.evaluate(() => localStorage.setItem('ovBoard', JSON.stringify({ x: 0.1, y: 0.5, k: 0.9 })));
    await fire(state(board({ load: false, tips: null }), 'Dragon 0:57'));
    const rect = () => page.$eval('.rb', (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; });
    const [l0, t0, w0] = await rect();
    assert(Math.abs(w0 - 720) < 8, `the old place and size aren't reused: ${w0}`);
    const handle = '.rb > :first-child > .team';
    await page.mouse.move(1, 1);
    await page.hover(handle);
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
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ovCards')));
    assert(Math.abs(saved.k - 0.5 * 0.75) < 0.01, `size kept: ${saved.k}`);
    assert(Math.abs(await page.$eval('.rb', (e) => parseFloat(getComputedStyle(e).getPropertyValue('--bk'))) - saved.k) < 0.001, 'the boxes keep their size');
    await shot(page, 'board-moved');
    await fire(state(board({ load: false, tips: { title: 'Next game', lines: ['x'] } }), 'Dragon 0:56'));
    assert.deepStrictEqual(await rect(), [l2, t2, w2], 'a new board where it was left');
    await page.dblclick(handle);
    assert.deepStrictEqual(await rect(), [l0, t0, w0], 'put back');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('ovCards')), null);
    await fire(state(board({ tips: { title: 'Loading', lines: ['x'] } })));
    assert.strictEqual(await page.isVisible('.rb .rsz'), false, 'the loading screen stays whole');
    // What's new 195: a name with a Riot ID opens their profile in Premade, taking the mouse while over it; J has none, so it stays text
    for (const load of [true, false]) {
      await fire(state(board({ load }), load ? '' : 'Dragon 0:55'));
      assert.deepStrictEqual(await page.$$eval('.rb .who > :first-child', (l) => l.map((e) => e.tagName)), [...Array(9).fill('BUTTON'), 'B']);
      const look = await page.$$eval('.rb .who > :first-child', (l) => [l[0], l[9]].map((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.color, c.backgroundColor, c.borderTopWidth, c.padding]; }));
      assert.deepStrictEqual(look[0], look[1], 'a name you can click looks like the others');
      await page.mouse.move(1, 1);
      await page.hover('.pc.me .pn');
      assert.strictEqual(await page.evaluate(() => window.mouse), true, 'a name takes the mouse');
      await page.click('.pc.me .pn');
      assert.deepStrictEqual(await page.evaluate(() => window.prog), { id: 'player', go: 'Me#EUW' });
      await page.mouse.move(5, 1075);
      assert.strictEqual(await page.evaluate(() => window.mouse), false, 'and given back');
    }
    await shot(page, 'board-name-link');
    // What's new 208 (Rayan's screenshot): over everyone's rank only callouts, voices, room chat and popups; the timers
    // line with the win chance and the enemy spell strip wait until the cards go, then come back
    const more = { cs: 'CS 64', talkers: [{ name: 'Sam', pic: '', team: 'ally' }], chat: [{ name: 'Kai', text: 'gl' }], toasts: ['Everyone’s rank is on the overlay.'],
      strip: [{ name: 'Zed', pic: `${DDV}/img/champion/Zed.png`, spells: [{ k: 'flash:Zed', icon: `${DDV}/img/spell/SummonerFlash.png`, name: 'Flash', left: 0, by: '' }] }] };
    for (const load of [true, false]) {
      await fire({ ...state(board({ load }), 'Win chance 50%'), ...more });
      assert.deepStrictEqual(await page.$$eval('.stack > *', (l) => l.map((e) => e.dataset.part)), ['talk', 'chat', 'toasts'], `only voices, chat and popups over the cards (${load ? 'loading' : 'in game'})`);
    }
    await fire({ ...state(true, 'Win chance 50%'), ...more });
    assert(await page.isVisible('.strip') && (await page.textContent('.toast.game')) === 'Win chance 50%', 'both back once the cards go');
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
    // What's new 225: Move it's own corner sizes the rest on the League screen, along the window's diagonal in 5% steps
    // from 70% to 200%, sent to the page (overlayProg) as the app grows the window under the mouse; the window at 100%
    await page.setViewportSize({ width: 300, height: 360 });
    await fire({ visible: true, pos: 'custom', box: { x: 0.1, y: 0.1 }, scale: 1, edit: true, opacity: 1, talkers: [], toasts: [] });
    assert.deepStrictEqual(await page.$eval('#grip', (e) => { const r = e.getBoundingClientRect(); return [r.right, r.bottom, r.width, getComputedStyle(e).cursor]; }), [300, 360, 28, 'nwse-resize'], 'in the window’s corner');
    assert((await page.textContent('.toast')).startsWith('Drag this to move it, or its corner to size it'));
    await page.mouse.move(288, 348);
    await page.mouse.down();
    await page.mouse.move(288 + 150, 348 + 180, { steps: 5 }); // past the window's edge
    assert.deepStrictEqual(await page.evaluate(() => window.prog), { id: 'size', x: 1.5 }, 'half as big again');
    await page.mouse.move(288 + 1000, 348, { steps: 2 });
    assert.strictEqual(await page.evaluate(() => window.prog.x), 2, 'at most 200%');
    await page.mouse.move(0, 0, { steps: 2 });
    assert.strictEqual(await page.evaluate(() => window.prog.x), 0.7, 'at least 70%');
    await page.mouse.up();
    await page.evaluate(() => (window.prog = null));
    await page.mouse.move(100, 100);
    assert.strictEqual(await page.evaluate(() => window.prog), null, 'nothing once you let go');
    await shot(page, 'move-it-corner');
    await fire({ visible: true, pos: 'custom', box: { x: 0.1, y: 0.1 }, scale: 1, opacity: 1, game: 'Dragon 0:57' });
    assert(await page.$eval('#grip', (e) => e.hidden), 'only while you move it');
    console.log('Board tests passed: League-style cards on both sides, the loading screen and half size in game, 2 tags, stat boxes inside the screen, the mini profile, kept through updates, 4:3 and 1440p, names that open profiles; Move it’s corner');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

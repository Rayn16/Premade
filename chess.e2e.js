// What's new 145 in headless Chromium: chess in a room's Games panel. The rules (Scholar's mate, castling, en
// passant, promotion, stalemate, threefold, illegal and out-of-turn moves refused, Card Chess cards and taking the
// king), then three players with a local PeerServer: Ana and Ben play by clicking, Cat joins mid-game and watches,
// Card Chess deals both the same cards, and the page's DOM nodes and listeners stay flat over 200 redraws and 3 games.
//   NODE_PATH=/path/to/node_modules node chess.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8097, PEER = 9017;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;

const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

async function player(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com/, (r) => r.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('**/hello', (r) => r.fulfill({ status: 204, headers: cors }));
  await ctx.route(/\/rooms(\?|$)/, (r) => r.fulfill({ json: r.request().method() === 'GET' ? [] : { ok: true }, headers: cors }));
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoShare: false })); }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`[${name}]`, m.text()));
  return page;
}
async function join(page, room) {
  await page.goto(`${URL_}#${room}`);
  await page.click('#joinBtn');
  await page.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
}
const waitFor = (page, fn, arg, what, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch((e) => { throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}`); });
const inRoom = (page, n) => waitFor(page, (n) => lpc.peers().length === n && lpc.peers().every((p) => p.conns > 0), n, `${n} others in the room`);
const sq = (s) => (8 - +s[1]) * 8 + 'abcdefgh'.indexOf(s[0]);
const mv = (s, p) => ({ k: 'm', f: sq(s.slice(0, 2)), t: sq(s.slice(2, 4)), ...(p && { p }) });
const line = (moves) => moves.split(' ').map((m) => mv(m));

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana'), ben = await player(browser, 'Ben');
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });

    // ---- the rules, replayed the way every Premade checks a game
    const R = (g) => ana.evaluate((g) => lpc.chessReplay(g), g);
    let s = await R({ acts: line('e2e4 e7e5 d1h5 b8c6 f1c4 g8f6 h5f7') });
    assert.deepStrictEqual(s.over, { title: 'A wins', why: 'Checkmate' }, 'Scholar’s mate');
    assert.strictEqual(await R({ acts: line('e2e5') }), null, 'a pawn can’t jump three');
    assert.strictEqual(await R({ acts: line('e7e5') }), null, 'black can’t go first');
    assert.strictEqual(await R({ acts: line('e2e4 f7f6 d1h5 e8f7') }), null, 'a king can’t step into check');
    assert.strictEqual(await R({ acts: line('e2e4 f7f6 d1h5 a7a6') }), null, 'in check, only an answer to it');
    s = await R({ acts: line('e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1') });
    assert(s.board.split(',')[sq('g1')] === 'wK' && s.board.split(',')[sq('f1')] === 'wR' && s.castle === 'kq', `castling: ${s.castle}`);
    assert.strictEqual(await R({ acts: line('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 e1f1 g8f6 f1e1 a7a6 e1g1') }), null, 'no castling once the king moved');
    assert.strictEqual(await R({ acts: line('e2e4 e7e5 g1f3 d7d6 f1e2 c8g4 b1c3 g4f3 g2g3 f3h1 e1g1') }), null, 'no castling without its rook');
    s = await R({ acts: line('e2e4 a7a6 e4e5 d7d5 e5d6') });
    assert(!s.board.split(',')[sq('d5')] && s.out.b.includes('P'), 'en passant takes the pawn beside');
    assert.strictEqual(await R({ acts: line('e2e4 a7a6 e4e5 d7d5 h2h3 h7h6 e5d6') }), null, 'en passant only right away');
    const promo = line('a2a4 h7h6 a4a5 h6h5 a5a6 h5h4 a6b7 h4h3');
    s = await R({ acts: [...promo, mv('b7a8', 'N')] });
    assert.strictEqual(s.board.split(',')[sq('a8')], 'wN', 'promotion to the piece picked');
    assert.strictEqual(await R({ acts: [...promo, mv('b7a8')] }), null, 'promotion needs its piece');
    s = await R({ acts: line('e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6') });
    assert.deepStrictEqual(s.over, { title: 'Draw', why: 'Stalemate: no legal move, and not in check' }, 'stalemate');
    s = await R({ acts: line('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8') });
    assert.strictEqual(s.over && s.over.why, 'The same position three times', 'threefold');
    s = await R({ acts: [...line('e2e4 e7e5'), { k: 'offer', by: 'B' }, { k: 'accept', by: 'A' }] });
    assert.strictEqual(s.over && s.over.why, 'Agreed by both players', 'agreed draw');
    assert.strictEqual(await R({ acts: [{ k: 'offer', by: 'B' }, { k: 'accept', by: 'B' }] }), null, 'you can’t accept your own offer');
    s = await R({ acts: [{ k: 'resign', by: 'A' }] });
    assert.deepStrictEqual(s.over, { title: 'B wins', why: 'A resigned' }, 'resign');
    console.log('rules: mate, castling, en passant, promotion, stalemate, threefold, draws and resign; illegal lists refused');

    // Card Chess: a seed whose first card is a 3, the second a 0
    const top = (seed) => R({ mode: 'cards', seed, acts: [] }).then((x) => x.deck.slice(-3).reverse().map((c) => c.slice(1)));
    const find = async (want) => { for (let seed = 1; seed < 5000; seed++) { const t = await top(seed); if (want.every((v, i) => v == null || v === t[i])) return seed; } throw new Error(`no seed for ${want}`); };
    const C = (seed, acts) => R({ mode: 'cards', seed, acts });
    let seed = await find(['3', '0']);
    s = await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7')]);
    assert(s.turn === 'b' && s.phase === 'flip' && s.out.b.includes('P'), 'a 3 is three moves, then the turn passes');
    assert.strictEqual(await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7 f7e8')]), null, 'not a fourth move');
    s = await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }]);
    assert(s.turn === 'w' && s.phase === 'flip' && s.card.slice(1) === '0', 'a 0 passes the turn');
    const kseed = await find(['3', '0', '1']);
    s = await C(kseed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, { k: 'flip' }, mv('f7e8')]);
    assert.deepStrictEqual(s.over, { title: 'A wins', why: 'Took the king' }, 'taking the king wins');
    s = await C(seed, [{ k: 'flip' }, mv('e2e3'), { k: 'end' }]);
    assert(s.turn === 'b' && s.phase === 'flip', 'End turn stops early');
    seed = await find(['R']);
    s = await C(seed, [{ k: 'flip' }]);
    assert(s.players.w === 'B' && s.players.b === 'A' && s.turn === 'b' && s.phase === 'flip', 'Reverse swaps armies, A plays on with black');
    seed = await find(['S']);
    s = await C(seed, [{ k: 'flip' }]);
    assert(s.turn === 'w' && s.phase === 'flip', 'Skip: flip again');
    seed = await find(['3', '+2']);
    s = await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }]);
    assert(s.turn === 'w', '+2 with the only free pawn square taken: the turn passes');
    seed = await find(['3', '3', '+2']);
    s = await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, ...line('e8f7 a7a6 a6a5'), { k: 'flip' }]);
    assert(s.phase === 'back' && s.turn === 'w' && s.out.w.includes('Q'), '+2: white brings back');
    assert.strictEqual(await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, ...line('e8f7 a7a6 a6a5'), { k: 'flip' }, { k: 'back', t: 'Q', i: sq('e4') }]), null, 'only to its own starting square');
    s = await C(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, ...line('e8f7 a7a6 a6a5'), { k: 'flip' }, { k: 'back', t: 'Q', i: sq('d1') }]);
    assert(s.board.split(',')[sq('d1')] === 'wQ' && s.turn === 'b', 'the queen back on d1');
    console.log('Card Chess: numbers, 0, End turn, Reverse, Skip, +2 put-backs, taking the king');

    // What's new 146: Swap, Freeze and Shield in games with d: 2; a game without d keeps the old 44 cards
    const old = await R({ mode: 'cards', seed: 7, acts: [] }), neu = await R({ mode: 'cards', d: 2, seed: 7, acts: [] });
    assert(old.deck.length === 44 && !old.deck.some((c) => /^k[XFH]$/.test(c)) && neu.deck.length === 50 && neu.deck.filter((c) => /^k[XFH]$/.test(c)).length === 6, 'old games keep the 44 cards, new ones have 50');
    const find2 = (want) => ana.evaluate((want) => { // in the page: thousands of seeds a second
      for (let seed = 1; seed < 300000; seed++) { const t = lpc.chessReplay({ mode: 'cards', d: 2, seed, acts: [] }).deck.slice(-want.length).reverse().map((c) => c.slice(1)); if (want.every((v, i) => v == null || v === t[i])) return seed; }
      return 0;
    }, want);
    const D = (seed, acts) => R({ mode: 'cards', d: 2, seed, acts });
    const at = (s, x) => s.board.split(',')[sq(x)];
    seed = await find2(['X']);
    s = await D(seed, [{ k: 'flip' }]);
    assert(s.phase === 'swap' && s.turn === 'w', 'Swap: pick two pieces');
    s = await D(seed, [{ k: 'flip' }, { k: 'swap', a: sq('e1'), b: sq('d1') }]);
    assert(at(s, 'd1') === 'wK' && at(s, 'e1') === 'wQ' && s.castle === 'kq' && s.phase === 'flip' && s.turn === 'w', `the king and queen swapped, castling gone, flip again: ${s.castle}`);
    assert.strictEqual(await D(seed, [{ k: 'flip' }, { k: 'swap', a: sq('e2'), b: sq('e1') }]), null, 'a pawn can’t land on the first row');
    assert.strictEqual(await D(seed, [{ k: 'flip' }, { k: 'swap', a: sq('e2'), b: sq('e7') }]), null, 'only your own pieces');
    s = await D(seed, [{ k: 'flip' }, { k: 'skipcard' }]);
    assert(s.phase === 'flip' && s.turn === 'w', 'Don’t use: flip again');
    seed = await find2(['F', '3', '3']);
    const frz = [{ k: 'flip' }, { k: 'freeze', i: sq('e7') }, { k: 'flip' }, ...line('e2e3 a2a3 b2b3'), { k: 'flip' }];
    s = await D(seed, frz);
    assert(s.turn === 'b' && s.frozen.length === 1 && s.frozen[0].by === 'A', 'black’s e7 frozen by A');
    assert.strictEqual(await D(seed, [...frz, mv('e7e5')]), null, 'a frozen piece can’t move');
    assert.strictEqual(await D(seed, [{ k: 'flip' }, { k: 'freeze', i: sq('e2') }]), null, 'Freeze: only their pieces');
    s = await D(seed, [...frz, ...line('a7a6 a6a5 b7b6')]);
    assert(s.turn === 'w' && !s.frozen.length, 'the freeze ends when A’s turn comes back');
    s = await D(seed, [{ k: 'flip' }, { k: 'freeze', i: sq('f7') }, { k: 'flip' }, ...line('e2e3 d1h5 h5f7')]);
    assert(s.out.b.includes('P') && !s.frozen.length && at(s, 'f7') === 'wQ', 'a frozen piece can still be taken, and the freeze goes with it');
    seed = await find2(['3', 'H', '3', '3']);
    const shd = [{ k: 'flip' }, ...line('e2e3 d1h5 a2a3'), { k: 'flip' }, { k: 'shield', i: sq('f7') }, { k: 'flip' }, ...line('a7a6 a6a5 b7b6'), { k: 'flip' }];
    s = await D(seed, shd);
    assert(s.turn === 'w' && s.shields.length === 1 && s.shields[0].by === 'B', 'f7 shielded by B');
    assert.strictEqual(await D(seed, [...shd, mv('h5f7')]), null, 'a shielded piece can’t be taken');
    s = await D(seed, [...shd, ...line('h5h6 a3a4 b2b3')]);
    assert(s.turn === 'b' && !s.shields.length, 'the shield ends when B’s turn comes back');
    s = await D(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, { k: 'shield', i: sq('e8') }, { k: 'flip' }, ...line('a7a6 a6a5 b7b6'), { k: 'flip' }]);
    assert(s.turn === 'w' && s.shields[0].i === sq('e8'), 'the king shielded');
    assert.strictEqual(await D(seed, [{ k: 'flip' }, ...line('e2e3 d1h5 h5f7'), { k: 'flip' }, { k: 'shield', i: sq('e8') }, { k: 'flip' }, ...line('a7a6 a6a5 b7b6'), { k: 'flip' }, mv('f7e8')]), null, 'a shielded king can’t be taken');
    console.log('Card Chess 146: Swap (no pawn on the end rows), Freeze (still takeable), Shield (the king too), each ending at the card player’s next turn; old games keep the old deck');

    // ---- two players and a watcher
    const ROOM = await ana.evaluate(() => lpc.room());
    await join(ben, ROOM);
    await inRoom(ana, 1);
    await inRoom(ben, 1);
    await waitFor(ana, () => document.getElementById('chWho').value === 'Ben', null, 'Ben in Play with');
    await ana.click('#chPlay');
    await waitFor(ben, () => { const c = lpc.chess(); return c && c.players.w && !document.getElementById('chGame').hidden; }, null, 'the game on Ben’s page');
    const players = await ben.evaluate(() => lpc.chess().players);
    const pageOf = { Ana: ana, Ben: ben };
    const click = async (page, from, to) => { await page.click(`#chBoard [data-i="${sq(from)}"]`); await page.click(`#chBoard [data-i="${sq(to)}"]`); };
    const scholar = 'e2e4 e7e5 d1h5 b8c6 f1c4 g8f6'.split(' ');
    for (let i = 0; i < scholar.length; i++) {
      const who = pageOf[players[i % 2 ? 'b' : 'w']], other = who === ana ? ben : ana;
      await click(who, scholar[i].slice(0, 2), scholar[i].slice(2));
      await waitFor(other, (n) => lpc.chess().acts === n, i + 1, `move ${i + 1} on the other page`);
      if (i === 3) { // Cat joins mid-game
        const cat = await player(browser, 'Cat');
        await join(cat, ROOM);
        await waitFor(cat, () => lpc.chess() && lpc.chess().acts === 4 && /watching/.test(document.getElementById('chWatchNote').textContent), null, 'the game for Cat, who came later');
        assert((await cat.locator('#chActs').isHidden()) && (await cat.textContent('#chWatch')).includes('Cat'), 'Cat only watches');
        assert.deepStrictEqual(await cat.evaluate(() => lpc.chessSounds()), [], 'no sounds for a whole game arriving');
        pageOf.Cat = cat;
      }
    }
    await click(pageOf[players.w], 'h5', 'f7');
    for (const p of [ana, ben, pageOf.Cat]) await waitFor(p, () => lpc.chess().over && lpc.chess().over.why === 'Checkmate' && !document.getElementById('chResult').hidden, null, 'checkmate everywhere');
    assert.strictEqual(await pageOf.Cat.evaluate(() => lpc.chess().board.join()), await ana.evaluate(() => lpc.chess().board.join()), 'the same board for the watcher');
    console.log(`room: ${players.w} mated ${players.b} by clicking, Cat joined at move 4 and saw it all`);

    // sounds: moves, your turn only for the players, the end; a capture; nothing with the speaker off
    const snd = (p) => p.evaluate(() => lpc.chessSounds());
    const [sw, sb, sc] = [await snd(pageOf[players.w]), await snd(pageOf[players.b]), await snd(pageOf.Cat)];
    assert(sw.includes('move') && sw.includes('turn') && sw.at(-1) === 'win' && sb.includes('turn') && sb.at(-1) === 'lose', `players: ${sw} / ${sb}`);
    assert(sc.includes('move') && !sc.includes('turn') && sc.at(-1) === 'draw', `the watcher: ${sc}`);
    await pageOf.Cat.click('#chSound');
    assert.strictEqual(await pageOf.Cat.evaluate(() => localStorage.getItem('lpc-chess-sound')), '0', 'the speaker off is kept');
    await ana.click('#chClose');
    await ana.click('#chPlay');
    await waitFor(ben, () => lpc.chess() && lpc.chess().acts === 0 && !lpc.chess().over, null, 'a second Normal game for Ben');
    const p2 = await ben.evaluate(() => lpc.chess().players);
    for (const [i, m] of ['e2e4', 'd7d5', 'e4d5'].entries()) {
      await click(pageOf[p2[i % 2 ? 'b' : 'w']], m.slice(0, 2), m.slice(2));
      await waitFor(ana, (n) => lpc.chess().acts === n, i + 1, `move ${i + 1}`);
      await waitFor(ben, (n) => lpc.chess().acts === n, i + 1, `move ${i + 1}`);
    }
    await waitFor(pageOf.Cat, () => lpc.chess().acts === 3, null, 'the capture for Cat');
    assert((await snd(ana)).includes('capture') && (await snd(ben)).includes('capture'), 'a capture sounds heavier');
    assert.deepStrictEqual(await snd(pageOf.Cat), sc, 'nothing with the speaker off');
    await ana.click('#chResign');
    await ana.click('#chResign');
    await waitFor(ana, () => lpc.chess().over, null, 'the second game over');
    console.log(`sounds: ${sw.join(' ')}; the watcher has no "turn", a capture, the speaker off kept quiet`);

    // a move dragged, then Card Chess dealing both the same cards
    await ana.click('#chClose');
    await ana.click('#chMode [data-mode="cards"]');
    await ana.selectOption('#chClock', '5');
    await ana.click('#chPlay');
    await waitFor(ben, () => lpc.chess() && lpc.chess().mode === 'cards' && lpc.chess().acts === 0, null, 'Card Chess for Ben');
    const cp = await ben.evaluate(() => lpc.chess().players), white = pageOf[cp.w];
    assert(!(await white.locator('#chTopSeat .chclock').isHidden()), 'the 5 minute clock shows');
    await white.click('#chFlip');
    await waitFor(ben, () => lpc.chess().acts === 1, null, 'the flip on Ben’s page');
    const cards = [await ana.evaluate(() => lpc.chess().card), await ben.evaluate(() => lpc.chess().card), await pageOf.Cat.evaluate(() => lpc.chess().card)];
    assert(cards[0] && cards.every((c) => c === cards[0]), `the same card everywhere: ${cards}`);
    assert((await snd(ana)).includes('flip') && (await snd(ben)).includes('flip'), 'the flip sounds');
    console.log(`Card Chess: ${cp.w} flipped ${cards[0]}, the same card on all three pages`);

    // ---- memory: 200 redraws and 3 games in a row
    const cdp = await ana.context().newCDPSession(ana);
    await cdp.send('Performance.enable');
    const metrics = async () => { await ana.evaluate(() => new Promise((r) => setTimeout(r, 200))); const { metrics: m } = await cdp.send('Performance.getMetrics'); const g = (n) => m.find((x) => x.name === n).value; return [g('Nodes'), g('JSEventListeners')]; };
    await ana.evaluate(() => { for (let i = 0; i < 200; i++) lpc.chessDraw(); });
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await metrics();
    for (let i = 0; i < 3; i++) {
      await ana.evaluate(() => { for (let i = 0; i < 200; i++) lpc.chessDraw(); });
      if (!(await ana.locator('#chActs').isHidden())) { await ana.click('#chResign'); await ana.click('#chResign'); }
      await waitFor(ana, () => lpc.chess().over, null, 'the game over');
      await ana.click('#chRematch');
      await waitFor(ben, (id) => lpc.chess() && !lpc.chess().over, null, 'the rematch for Ben');
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await metrics();
    assert(after[0] - before[0] < 300 && after[1] - before[1] < 20, `DOM nodes and listeners flat: ${before} -> ${after}`);
    console.log(`memory: nodes ${before[0]} -> ${after[0]}, listeners ${before[1]} -> ${after[1]} over 600 redraws and 3 games`);
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer.close && peerServer.close();
  }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

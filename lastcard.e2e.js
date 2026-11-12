// What's new 148 in headless Chromium: Last Card in a room's Games panel. The rules (stacking, Shield, Swap, Freeze,
// draw and keep, the Last card call and its catch, places, timeouts, out-of-turn lists refused), 400 bot games of 2 to
// 10 players through the page's own rules, then four players with a local PeerServer: Ana, Ben and Cat play a game by
// clicking, Dan joins mid-game and only watches, Ben reloads and gets his hand back, a turn times out, Cat leaves and
// is dropped, and the page's DOM nodes and listeners stay flat over 200 redraws and 3 games.
//   NODE_PATH=/path/to/node_modules node lastcard.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8098, PEER = 9018;
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
  await ctx.route('**/rooms', (r) => r.fulfill({ json: r.request().method() === 'GET' ? [] : { ok: true }, headers: cors }));
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoShare: false })); }, name);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('WebSocket') && console.log(`[${name}]`, m.text()));
  return page;
}
async function join(page, room) {
  await page.goto(`${URL_}#${room}`);
  await page.click('#joinBtn');
  await page.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
}
const waitFor = (page, fn, arg, what, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch((e) => { throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}`); });
const inRoom = (page, n) => waitFor(page, (n) => lpc.peers().length === n && lpc.peers().every((p) => p.conns > 0), n, `${n} others in the room`);
// one turn by clicking, the way a player would: a pending pick, a catch, a raised card (Last card first when it's due), keep, or draw
const clickTurn = (page) => page.evaluate(() => {
  const $ = (id) => document.getElementById(id), vis = (id) => !$(id).hidden;
  if (vis('lcChoice')) return $('lcChoiceBtns').firstElementChild.click(), 'pick';
  if (vis('lcCatch')) return $('lcCatch').click(), 'catch';
  const ok = $('lcHand').querySelector('.lcok');
  if (ok) { if (vis('lcLast') && $('lcLast').getAttribute('aria-pressed') === 'false') $('lcLast').click(); $('lcHand').querySelector('.lcok').click(); return 'play'; }
  if (vis('lcKeep')) return $('lcKeep').click(), 'keep';
  return $('lcDraw').click(), 'draw';
});

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana');
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });

    // ---- the rules, on hands set up by hand
    const rules = await ana.evaluate(() => {
      const L = lpc.lcRules, out = {};
      const set = (hands, topCard, turn = 0) => { const S = L.deal(hands.map((h, i) => 'ABCDEFGHIJ'[i]), 1); hands.forEach((h, i) => { S.players[i].hand = h.slice(); }); S.pile = [topCard]; S.color = topCard[0]; S.turn = turn; return S; };
      let S = set([['r+2', 'r5'], ['b+2', 'g1'], ['k+4', 'kH', 'y1']], 'r3');
      L.act(S, { k: 'play', i: 0 }); out.stack1 = [S.stack, S.turn];
      out.noPlus = L.fits(S, 'g1');
      L.act(S, { k: 'play', i: 0 }); out.stack2 = [S.stack, S.turn];
      out.plus4 = L.act(S, { k: 'play', i: 0 }) && L.act(S, { k: 'color', c: 'g' }) && [S.stack, S.turn];
      L.act(S, { k: 'draw' }); out.drewTotal = [S.players[0].hand.length, S.stack, S.turn];
      S = set([['r+2', 'r5'], ['kH', 'g1'], ['y1', 'y2']], 'r3');
      L.act(S, { k: 'play', i: 0 }); L.act(S, { k: 'play', i: 0 }); out.shield = [S.stack, S.turn, S.players[1].hand.length];
      S = set([['kX', 'r5', 'r6'], ['g1'], ['y1', 'y2']], 'r3');
      L.act(S, { k: 'play', i: 0 }); L.act(S, { k: 'color', c: 'b' }); out.swapWho = S.pending && S.pending.k;
      out.swapSelf = L.act(S, { k: 'who', j: 0 });
      L.act(S, { k: 'who', j: 1 }); out.swap = [S.players[0].hand.join(), S.players[1].hand.join(), S.color, S.turn];
      S = set([['kF', 'r5'], ['g1', 'g2'], ['y1', 'y2']], 'r3');
      L.act(S, { k: 'play', i: 0 }); L.act(S, { k: 'color', c: 'r' }); L.act(S, { k: 'who', j: 2 }); out.freeze = [S.turn, S.players[2].frozen];
      L.act(S, { k: 'draw' }); out.freezeSkip = [S.turn, S.players[2].frozen]; // B -> A, as C sits out
      S = set([['r5', 'g9'], ['b1'], ['y1']], 'r3');
      out.outOfTurn = L.act(S, { k: 'play', i: 1 });
      L.act(S, { k: 'play', i: 0, call: false }); out.forgot = S.catchable;
      L.act(S, { k: 'catch' }); out.caught = S.players[0].hand.length;
      S = set([['r5', 'g9'], ['b1'], ['y1']], 'r3');
      L.act(S, { k: 'play', i: 0, call: true }); out.called = [S.catchable, S.players[0].shout];
      S = set([['g9'], ['b1'], ['y1']], 'r3');
      S.deck.push('r7'); L.act(S, { k: 'draw' }); out.drawnFits = S.drawn;
      out.onlyDrawn = L.act(S, { k: 'play', i: 0 });
      L.act(S, { k: 'keep' }); out.kept = [S.turn, S.players[0].hand.length];
      S = set([['r9'], ['b1', 'b2'], ['y1', 'y2']], 'r3');
      L.act(S, { k: 'play', i: 0 }); out.place = [S.players[0].place, S.turn, S.over];
      S.players[2].hand = ['r1']; S.turn = 2; L.act(S, { k: 'play', i: 0 }); out.end = [S.over, S.places.join()];
      S = set([['g9', 'g8'], ['b1'], ['y1']], 'r3');
      for (let i = 0; i < 3; i++) { S.turn = 0; L.act(S, { k: 'time' }); }
      out.timeout = [S.players[0].place, S.dropped.length];
      return out;
    });
    assert.deepStrictEqual(rules.stack1, [2, 1], '+2: the next player faces 2');
    assert.strictEqual(rules.noPlus, false, 'facing a +2, only a +2, +4 or Shield fits');
    assert.deepStrictEqual(rules.stack2, [4, 2], '+2 on +2 makes 4');
    assert.deepStrictEqual(rules.plus4, [8, 0], '+4 on +2 makes 8');
    assert.deepStrictEqual(rules.drewTotal, [9, 0, 1], 'whoever can’t stack draws the whole total and misses the turn');
    assert.deepStrictEqual(rules.shield, [0, 2, 1], 'a Shield blocks the total');
    assert.strictEqual(rules.swapWho, 'who', 'Swap asks who after the color');
    assert.strictEqual(rules.swapSelf, false, 'you can’t swap with yourself');
    assert.deepStrictEqual(rules.swap, ['g1', 'r5,r6', 'b', 1], 'Swap trades whole hands');
    assert.deepStrictEqual(rules.freeze, [1, true], 'Freeze marks the player');
    assert.deepStrictEqual(rules.freezeSkip, [0, false], 'a frozen player sits out their turn');
    assert.strictEqual(rules.outOfTurn, false, 'a card that doesn’t fit is refused');
    assert.strictEqual(rules.forgot, 0, 'no Last card call: the next player can catch you');
    assert.strictEqual(rules.caught, 3, 'caught: +2');
    assert.deepStrictEqual(rules.called, [-1, true], 'with the call, nobody can catch you');
    assert.strictEqual(rules.drawnFits, 1, 'a drawn card that fits waits to be played or kept');
    assert.deepStrictEqual(rules.kept, [1, 2], 'Keep it ends the turn');
    assert.deepStrictEqual(rules.place, [1, 1, false], 'out of cards takes 1st, the rest play on');
    assert.deepStrictEqual(rules.end, [true, 'A,C,B'], 'the last one left comes last');
    assert.deepStrictEqual(rules.timeout, [-1, 1], '3 timeouts in a row drop you');
    console.log('rules: stacking to 8, Shield, Swap, Freeze, draw and keep, the Last card call and catch, places, 3 timeouts');

    // out-of-turn lists refused when someone sends them
    const ord = await ana.evaluate(() => {
      const g = { id: 'x', names: ['A', 'B', 'C'], seed: 5, at: 0, acts: [] }, S = lpc.lcReplay(g), turn = S.players[S.turn].name, other = ['A', 'B', 'C'].find((n) => n !== turn);
      return { mine: !!lpc.lcReplay({ ...g, acts: [{ k: 'draw' }] }, turn, 0), theirs: lpc.lcReplay({ ...g, acts: [{ k: 'draw' }] }, other, 0), dropSelf: lpc.lcReplay({ ...g, acts: [{ k: 'drop' }] }, turn, 0), dropOther: !!lpc.lcReplay({ ...g, acts: [{ k: 'drop' }] }, other, 0) };
    });
    assert.deepStrictEqual(ord, { mine: true, theirs: null, dropSelf: null, dropOther: true }, 'only the turn player acts; anyone else still playing can drop them');

    // 400 bot games through the page's own rules: every game ends, no card is lost or made, every place is given once
    const bots = await ana.evaluate(() => {
      const L = lpc.lcRules, lens = [];
      for (let g = 0; g < 400; g++) {
        const n = 2 + (g % 9), names = Array.from({ length: n }, (x, i) => 'P' + i), S = L.deal(names, g * 7919 + 1);
        let k = 0;
        for (; !S.over && k < 20000; k++) {
          const p = S.players[S.turn], r = Math.random();
          if (r < 0.01) { L.act(S, { k: 'time' }); continue; }
          if (r < 0.012) { L.act(S, { k: 'drop' }); continue; }
          if (S.pending) { if (!L.act(S, S.pending.k === 'color' ? { k: 'color', c: L.COLS[k % 4] } : { k: 'who', j: L.targets(S)[0] })) return `stuck on a pick in game ${g}`; continue; }
          if (S.catchable >= 0 && r < 0.5) L.act(S, { k: 'catch' });
          if (S.drawn >= 0) { L.act(S, r < 0.7 ? { k: 'play', i: S.drawn, call: r < 0.6 } : { k: 'keep' }); continue; }
          const i = p.hand.findIndex((c) => L.fits(S, c));
          if (!L.act(S, i >= 0 ? { k: 'play', i, call: r < 0.8 } : { k: 'draw' })) return `refused in game ${g}`;
          const cards = S.players.reduce((a, q) => a + q.hand.length, 0) + S.deck.length + S.pile.length;
          if (cards !== 114) return `${cards} cards in game ${g}`;
        }
        if (!S.over) return `game ${g} never ended`;
        if (S.places.length !== n || new Set(S.places).size !== n) return `places ${S.places} in game ${g}`;
        lens.push(k);
      }
      return lens.reduce((a, b) => a + b, 0) / lens.length;
    });
    assert(typeof bots === 'number', bots);
    console.log(`400 bot games of 2 to 10 players: all ended, 114 cards throughout, every place once (about ${Math.round(bots)} actions a game)`);

    // ---- a room: Ana, Ben and Cat play, Dan joins later and watches
    const ben = await player(browser, 'Ben'), cat = await player(browser, 'Cat');
    const ROOM = await ana.evaluate(() => lpc.room());
    await join(ben, ROOM);
    await join(cat, ROOM);
    for (const p of [ana, ben, cat]) await inRoom(p, 2);
    await ana.click('#gamePick [data-g="lc"]');
    await waitFor(ana, () => document.querySelectorAll('#lcWho [aria-pressed="true"]').length === 3, null, 'everyone ticked');
    await ana.click('#lcPlay');
    const pages = { Ana: ana, Ben: ben, Cat: cat };
    for (const p of [ben, cat]) await waitFor(p, () => lpc.lc() && !document.getElementById('lcBox').hidden && !document.getElementById('lcGame').hidden, null, 'the game, and the picker on Last Card');
    const hands = await Promise.all([ana, ben, cat].map((p) => p.evaluate(() => document.querySelectorAll('#lcHand .lccard').length)));
    assert.deepStrictEqual(hands, [7, 7, 7], 'all three get 7 cards at once');
    const acts = (p) => p.evaluate(() => lpc.lc().acts);
    const sync = async (n) => { for (const p of Object.values(pages)) await waitFor(p, (n) => lpc.lc() && lpc.lc().acts >= n, n, `action ${n} everywhere`); };
    const turnPage = () => ana.evaluate(() => lpc.lc().players[lpc.lc().turn].name).then((n) => pages[n]);
    const turns = async (count) => { for (let i = 0; i < count; i++) { if (await ana.evaluate(() => lpc.lc().over)) return; const p = await turnPage(), n = await acts(p); await clickTurn(p); await sync(n + 1); } };
    await turns(4);

    // Dan joins mid-game: the table and the counts, never a hand
    const dan = await player(browser, 'Dan');
    await join(dan, ROOM);
    await waitFor(dan, () => lpc.lc() && lpc.lc().acts > 0, null, 'the game for Dan');
    await dan.click('#gamePick [data-g="lc"]');
    assert(await dan.locator('#lcHandBox').isHidden() && await dan.locator('#lcWatchNote').isVisible() && await dan.locator('#lcTable').isVisible(), 'Dan watches the table without a hand');
    assert.strictEqual(await dan.locator('#lcSeats li').count(), 3, 'Dan sees the three seats');
    assert((await ana.textContent('#lcWatch')).includes('Dan'), 'Dan shows as watching');
    pages.Dan = dan;
    const deal = (p) => p.evaluate(() => lpc.lc().players.map((q) => q.hand.join()).join('|') + lpc.lc().pile.join());
    assert.strictEqual(await deal(dan), await deal(ana), 'the same table on Dan’s page');

    // Ben reloads and gets his hand back
    const benHand = await ben.evaluate(() => lpc.lc().players.find((q) => q.name === 'Ben').hand.join());
    await ben.reload();
    if (await ben.locator('#joinBtn').isVisible()) await ben.click('#joinBtn');
    await ben.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    await ben.click('#gamePick [data-g="lc"]');
    await waitFor(ben, () => lpc.lc() && document.querySelectorAll('#lcHand .lccard').length > 0, null, 'Ben’s hand after a reload');
    assert.strictEqual(await ben.evaluate(() => lpc.lc().players.find((q) => q.name === 'Ben').hand.join()), benHand, 'the same hand');
    for (const p of Object.values(pages)) await inRoom(p, 3);
    await turns(20);
    console.log('room: 3 dealt 7 each at once, Dan joined mid-game and watches without a hand, Ben reloaded and got his hand back');

    // a turn runs out: the player's own page draws and passes
    if (!(await ana.evaluate(() => lpc.lc().over))) {
      const p = await turnPage(), n = await acts(p), who = await p.evaluate(() => lpc.lc().players[lpc.lc().turn].name);
      await waitFor(ana, (n) => lpc.lc().acts > n, n, 'the timeout', 40000);
      const log = await ana.evaluate(() => lpc.lc().log.join(' | '));
      assert(log.includes(who), `${who}’s turn played for them: ${log}`);
      console.log(`timer: ${who}’s 30 seconds ran out and their page drew for them`);
    }

    // Cat leaves the room: dropped 10 s into Cat's turn by the next player still here
    if (!(await ana.evaluate(() => lpc.lc().over))) {
      await cat.context().close();
      delete pages.Cat;
      for (let i = 0; i < 6 && (await ana.evaluate(() => lpc.lc().players[lpc.lc().turn].name)) !== 'Cat'; i++) {
        if (await ana.evaluate(() => lpc.lc().over)) break;
        const p = await turnPage(), n = await acts(p);
        await clickTurn(p);
        await sync(n + 1);
      }
      await waitFor(ana, () => lpc.lc().over || lpc.lc().players.find((q) => q.name === 'Cat').place !== 0, null, 'Cat dropped', 30000);
      console.log('left: Cat left the room and was dropped on their turn');
    }
    // play it out: places, Rematch with the same players still here
    for (let i = 0; i < 600 && !(await ana.evaluate(() => lpc.lc().over)); i++) { const p = await turnPage(), n = await acts(p); await clickTurn(p); await sync(n + 1); }
    for (const p of Object.values(pages)) await waitFor(p, () => lpc.lc().over && !document.getElementById('lcEnd').hidden, null, 'the places everywhere');
    assert.strictEqual(await dan.locator('#lcPlaces li').count(), 3, 'three places');
    const snd = await ana.evaluate(() => lpc.chessSounds());
    assert(snd.includes('flip') && /^(win|lose)$/.test(snd.at(-1)), `game sounds: ${snd}`);
    assert(await dan.locator('#lcRematch').isHidden(), 'only players get Rematch');
    await inRoom(ana, 2); // Ben and Dan, once Cat's gone
    await ana.click('#lcRematch');
    await waitFor(ben, () => lpc.lc() && !lpc.lc().over && lpc.lc().acts === 0 && lpc.lc().names.length === 2, null, 'the rematch with Ana and Ben');
    console.log(`end: places for everyone, sounds ${snd.slice(-3).join(' ')}, Rematch with the 2 still here`);

    // ---- memory: 200 redraws and 3 games in a row
    const cdp = await ana.context().newCDPSession(ana);
    await cdp.send('Performance.enable');
    const metrics = async () => { await ana.evaluate(() => new Promise((r) => setTimeout(r, 300))); const { metrics: m } = await cdp.send('Performance.getMetrics'); const g = (n) => m.find((x) => x.name === n).value; return [g('Nodes'), g('JSEventListeners')]; };
    pages.Ana = ana; pages.Ben = ben;
    await ana.evaluate(() => { for (let i = 0; i < 200; i++) lpc.lcDraw(); });
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await metrics();
    for (let g = 0; g < 3; g++) {
      await ana.evaluate(() => { for (let i = 0; i < 200; i++) lpc.lcDraw(); });
      for (let i = 0; i < 800 && !(await ana.evaluate(() => lpc.lc().over)); i++) { const p = await turnPage(), n = await acts(p); await clickTurn(p); await waitFor(ana, (n) => lpc.lc().acts > n, n, 'the move'); await waitFor(ben, (n) => lpc.lc().acts > n, n, 'the move'); }
      const id = await ana.evaluate(() => lpc.lc().id);
      await ana.click('#lcRematch');
      await waitFor(ben, (id) => lpc.lc() && lpc.lc().id !== id, id, 'the rematch for Ben');
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await metrics();
    assert(after[0] - before[0] < 300 && after[1] - before[1] < 20, `DOM nodes and listeners flat: ${before} -> ${after}`);
    console.log(`memory: nodes ${before[0]} -> ${after[0]}, listeners ${before[1]} -> ${after[1]} over 800 redraws and 3 games`);
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer.close && peerServer.close();
  }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

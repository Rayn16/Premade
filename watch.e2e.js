// What's new 150 in headless Chromium: Watch together in a room, on a fake YouTube player (fixtures/fake-youtube.js
// stands in for www.youtube.com/iframe_api, with its own clock and a fake ad). Ana picks a video (as the app's YouTube
// window sends it), Ben gets the banner and Joins at the same spot; pause, seek, speed and skip from different pages;
// Up next with Play now, Remove and a playlist; Ben catches up after an ad; Cat joins the room late and lands on the
// spot; a video that can't play outside YouTube is skipped; the corner player on another page and when scrolled away
// (the frame never re-made, never under 356x200); Close and leaving the room take the player away; a chat link's
// Watch together button; and DOM nodes and listeners stay flat over 30 opens and closes.
//   NODE_PATH=/path/to/node_modules node watch.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8099, PEER = 9019;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const FAKE_YT = fs.readFileSync(path.join(__dirname, 'fixtures', 'fake-youtube.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;

const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

async function player(browser, name, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/youtube\.com|ytimg\.com|fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com/, (r) => r.abort());
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ body: FAKE_YT, headers: { 'content-type': 'text/javascript' } })); // the last route added wins
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
const yt = (page) => page.evaluate(() => { const p = [...ytFake.players].find((x) => x.f.isConnected && x.f.closest('#wtBox')); return p && { v: p.v, t: p.getCurrentTime(), st: p.st, rate: p.rate, vol: p.vol }; });
const playing = (page, v, what) => waitFor(page, (v) => { const p = [...(window.ytFake ? ytFake.players : [])].find((x) => x.f.closest('#wtBox')); return p && p.v === v && p.st === 1; }, v, what);
const box = (page) => page.evaluate(() => { const b = document.getElementById('wtBox').getBoundingClientRect(), f = document.querySelector('#wtBox iframe').getBoundingClientRect(), z = document.querySelector('main').currentCSSZoom || 1; return { corner: document.getElementById('wtBox').classList.contains('corner'), w: f.width / z, h: f.height / z, x: b.x, y: b.y, bw: b.width, bh: b.height }; });

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ana = await player(browser, 'Ana'), ben = await player(browser, 'Ben');
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    const room = await ana.evaluate(() => lpc.room());
    await join(ben, room);
    await inRoom(ana, 1);
    await inRoom(ben, 1);
    assert(await ana.isVisible('#wtBtn'), 'Watch together in the Current room card');
    assert(await ana.isHidden('#roomWatch'), 'no Watch panel before anyone watches');

    // 1, 2: Ana picks a video (the app's YouTube window), Ben gets the banner and Joins at her spot
    await ana.evaluate(() => lpc.wtPick('aaaaaaaaaaa'));
    await playing(ana, 'aaaaaaaaaaa', 'the video playing for Ana');
    assert(await ana.isVisible('#wtSlot') && await ana.isHidden('#wtJoinBox'), 'Ana watches in the panel');
    await waitFor(ben, () => !document.getElementById('roomWatch').hidden && /Ana is watching/.test(document.getElementById('wtJoinText').textContent), null, 'the banner for Ben');
    assert(await ben.evaluate(() => !document.querySelector('#wtBox iframe')), 'no player for Ben before Join');
    await ana.waitForTimeout(2000);
    await ben.click('#wtJoin');
    await playing(ben, 'aaaaaaaaaaa', 'the video for Ben');
    await ben.waitForTimeout(700);
    let [a, b] = [await yt(ana), await yt(ben)];
    assert(a.t > 1.5 && Math.abs(a.t - b.t) < 1, `Ben joins at Ana's spot: ${a.t.toFixed(2)} vs ${b.t.toFixed(2)}`);
    console.log(`join: Ana at ${a.t.toFixed(2)} s, Ben at ${b.t.toFixed(2)} s`);

    // 3: anyone controls it, and the panel says who
    for (const p of [ana, ben]) await p.evaluate(() => document.getElementById('wtSlot').scrollIntoView({ block: 'center' })); // the bar under the video on screen
    await ben.click('#wtPlay');
    await waitFor(ana, () => lpc.wt().on === false && [...ytFake.players][0].st === 2, null, 'Ben’s pause on Ana’s page');
    assert.strictEqual(await ana.textContent('#wtWho'), 'Ben paused');
    await ana.evaluate(() => { const s = document.getElementById('wtSeek'); s.value = 100; s.dispatchEvent(new Event('change')); });
    await waitFor(ben, () => Math.abs([...ytFake.players][0].getCurrentTime() - 100) < 0.5, null, 'Ana’s seek on Ben’s page');
    assert.strictEqual(await ben.textContent('#wtWho'), 'Ana moved to 1:40');
    await ana.click('#wtPlay');
    await ben.selectOption('#wtSpeed', '1.5');
    await waitFor(ana, () => [...ytFake.players][0].rate === 1.5 && [...ytFake.players][0].st === 1, null, 'Ben’s speed on Ana’s page');
    await ana.selectOption('#wtSpeed', '1');
    await ana.fill('#wtVol', '30');
    await ana.dispatchEvent('#wtVol', 'input');
    assert((await yt(ana)).vol === 30 && (await yt(ben)).vol === 70, 'the volume is yours only');
    console.log('controls: Ben paused, Ana moved to 1:40, Ben set 1.5x; volume only on Ana’s page');

    // 4: Up next, Play now, Remove, a playlist
    await ana.evaluate(() => lpc.wtPick('bbbbbbbbbbb'));
    await waitFor(ben, () => lpc.wt().q.length === 1 && document.querySelectorAll('#wtQueue li').length === 1, null, 'Up next for Ben');
    assert.strictEqual((await yt(ana)).v, 'aaaaaaaaaaa', 'the video playing isn’t cut off');
    await ben.evaluate(() => lpc.wtPick('ccccccccccc', 'PLfake'));
    await waitFor(ana, () => lpc.wt().q.map((i) => i.v).join() === 'bbbbbbbbbbb,ccccccccccc,aaaaaaaaaaa,ppppppppp01,ppppppppp02,ppppppppp03', null, 'the playlist in Up next');
    await ana.click('#wtQueue li:nth-child(3) button[data-k="rm"]');
    await waitFor(ben, () => lpc.wt().q.length === 5 && /removed/.test(document.getElementById('wtWho').textContent), null, 'Ana’s Remove on Ben’s page');
    await ben.click('#wtQueue li:nth-child(1) button[data-k="now"]');
    await playing(ana, 'bbbbbbbbbbb', 'Play now on Ana’s page');
    await ana.click('#wtNext');
    await playing(ben, 'ccccccccccc', 'Next on Ben’s page');
    await playing(ana, 'ccccccccccc', 'Next on Ana’s page');
    console.log(`up next: ${(await ana.evaluate(() => lpc.wt().q.map((i) => i.v))).join(', ')}`);

    // 5: an ad on Ben's page: everyone else keeps going, Ben jumps to the room's spot after
    await ben.evaluate(() => ytAd(4));
    await ana.waitForTimeout(2500);
    [a, b] = [await yt(ana), await yt(ben)];
    assert(a.t - b.t > 1.5, `Ben is behind during the ad: ${a.t.toFixed(2)} vs ${b.t.toFixed(2)}`);
    assert(await ana.evaluate(() => lpc.wt().on), 'the room keeps playing');
    await ana.waitForTimeout(3500);
    [a, b] = [await yt(ana), await yt(ben)];
    assert(Math.abs(a.t - b.t) < 1.6, `Ben caught up after the ad: ${a.t.toFixed(2)} vs ${b.t.toFixed(2)}`);
    console.log(`ad: Ben caught up, ${a.t.toFixed(2)} vs ${b.t.toFixed(2)}`);

    // 7: Cat joins the room late, gets the banner, and Join lands on the spot with the same Up next
    const cat = await player(browser, 'Cat', { width: 390, height: 844 });
    await join(cat, room);
    await inRoom(cat, 2);
    await waitFor(cat, () => lpc.wt() && /Ana is watching/.test(document.getElementById('wtJoinText').textContent), null, 'the banner for Cat');
    await cat.click('#wtJoin');
    await playing(cat, 'ccccccccccc', 'the video for Cat');
    await cat.waitForTimeout(700);
    [a, b] = [await yt(ana), await yt(cat)];
    assert(Math.abs(a.t - b.t) < 1, `Cat at the spot: ${a.t.toFixed(2)} vs ${b.t.toFixed(2)}`);
    assert.deepStrictEqual(await cat.evaluate(() => lpc.wt().q.map((i) => i.v)), await ana.evaluate(() => lpc.wt().q.map((i) => i.v)), 'the same Up next');
    const cb = await box(cat);
    assert(cb.w >= 356 - 1 && cb.h >= 200 - 1 && cb.x >= 0 && cb.x + cb.bw <= 391, `Cat's phone player fits: ${JSON.stringify(cb)}`);
    console.log(`late joiner: Cat at ${b.t.toFixed(2)} s, player ${cb.w}x${cb.h.toFixed(0)}`);

    // 8: a video that can't play outside YouTube is skipped for everyone
    await ana.evaluate(() => lpc.wtPick('blocked0001'));
    await waitFor(ana, () => lpc.wt().q.some((i) => i.v === 'blocked0001'), null, 'the blocked video in Up next');
    await ana.click('#wtQueue button[data-k="now"][data-v="blocked0001"]');
    await waitFor(ben, () => lpc.wt().did === 'blocked' && lpc.wt().v === 'ppppppppp01' && /can’t play outside YouTube/.test(document.getElementById('wtWho').textContent), null, 'the blocked video skipped for Ben');
    await playing(cat, 'ppppppppp01', 'the next video for Cat');

    // 6: the corner player on another page and when the panel scrolls away; the frame is never made again
    const made = await ana.evaluate(() => ytFake.made);
    const docked = await box(ana);
    assert(!docked.corner && docked.w > 500, `docked in the panel: ${JSON.stringify(docked)}`);
    await ana.evaluate(() => document.querySelector('.nav[data-view="settings"]').click());
    await waitFor(ana, () => document.getElementById('wtBox').classList.contains('corner'), null, 'the corner player on Settings');
    let c = await box(ana);
    assert(c.w >= 356 - 0.5 && c.h >= 200 - 0.5 && c.x > 640 && c.y > 450, `bottom right, 356x200 or more: ${JSON.stringify(c)}`);
    assert((await yt(ana)).st === 1, 'it keeps playing');
    const grip = await ana.locator('#wtGrip').boundingBox();
    await ana.mouse.move(grip.x + 4, grip.y + 4);
    await ana.mouse.down();
    await ana.mouse.move(300, 120, { steps: 5 });
    await ana.mouse.up();
    c = await box(ana);
    assert(c.x < 640 && c.y < 450 && await ana.evaluate(() => localStorage.getItem('lpc-wt-corner')) === 'tl', `dragged to the top left: ${JSON.stringify(c)}`);
    await ana.click('#wtBack');
    await waitFor(ana, () => !document.getElementById('wtBox').classList.contains('corner'), null, 'docked again on Back to the room');
    await ana.evaluate(() => { document.querySelector('main').scrollTop = 1e5; });
    await waitFor(ana, () => document.getElementById('wtBox').classList.contains('corner'), null, 'the corner player when scrolled away');
    await ana.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await waitFor(ana, () => !document.getElementById('wtBox').classList.contains('corner'), null, 'docked when scrolled back');
    assert.strictEqual(await ana.evaluate(() => ytFake.made), made, 'the YouTube frame was never made again');
    // at App size 150%
    await ana.evaluate(() => document.documentElement.style.setProperty('--zoom', 1.5));
    await ana.evaluate(() => document.getElementById('wtSlot').scrollIntoView({ block: 'center' }));
    await waitFor(ana, () => !document.getElementById('wtBox').classList.contains('corner'), null, 'docked at 150%');
    await ana.waitForTimeout(300);
    const s = await ana.evaluate(() => { const a = document.getElementById('wtSlot').getBoundingClientRect(), b = document.getElementById('wtBox').getBoundingClientRect(); return [a.x, a.y, a.width, b.x, b.y, b.width].map(Math.round); });
    assert(Math.abs(s[0] - s[3]) <= 1 && Math.abs(s[1] - s[4]) <= 1 && Math.abs(s[2] - s[5]) <= 1, `over the slot at 150%: ${s}`);
    await ana.evaluate(() => document.documentElement.style.setProperty('--zoom', 1));
    console.log(`corner: ${c.w}x${c.h} at the top left after a drag, docked again on Back and scroll; frame made once`);

    // the video ends: Up next plays
    await ana.evaluate(() => { const s = document.getElementById('wtSeek'); s.value = 298; s.dispatchEvent(new Event('change')); });
    await playing(ben, 'ppppppppp02', 'the next one after the end');

    // 9: Close takes Ben's player away; Ana leaving the room too
    await ben.click('#wtLeave');
    await waitFor(ben, () => ytFake.live() === 0 && !document.querySelector('#wtBox iframe') && document.getElementById('wtBox').hidden && !lpc.wt().listening, null, 'Ben’s player gone');
    assert(await ben.isVisible('#wtJoin'), 'Ben can Join again');
    await cat.click('#wtEnd');
    await waitFor(ana, () => lpc.wt().v === '' && document.getElementById('roomWatch').hidden && ytFake.live() === 0, null, 'End for everyone on Ana’s page');

    // 10: a YouTube link in the room chat gets a Watch together button
    await cat.fill('#chatText', 'look https://www.youtube.com/watch?v=ddddddddddd');
    await cat.press('#chatText', 'Enter');
    await waitFor(ben, () => document.querySelector('#chatLog button[data-wt="ddddddddddd"]'), null, 'the chat button');
    await ben.click('#chatLog button[data-wt="ddddddddddd"]');
    await playing(ben, 'ddddddddddd', 'the chat link for Ben');
    await waitFor(ana, () => /Ben is watching/.test(document.getElementById('wtJoinText').textContent), null, 'Ben’s banner');

    // memory: 30 opens and closes on Ana's page
    const cdp = await ana.context().newCDPSession(ana);
    await cdp.send('Performance.enable');
    const metrics = async () => { await ana.evaluate(() => new Promise((r) => setTimeout(r, 300))); await cdp.send('HeapProfiler.collectGarbage'); const { metrics: m } = await cdp.send('Performance.getMetrics'); const g = (n) => m.find((x) => x.name === n).value; return [g('Nodes'), g('JSEventListeners'), Math.round(g('JSHeapUsedSize') / 1024)]; };
    const cycle = async () => { await ana.click('#wtJoin'); await playing(ana, 'ddddddddddd', 'Ana watching'); await ana.click('#wtLeave'); await waitFor(ana, () => ytFake.live() === 0, null, 'closed'); };
    for (let i = 0; i < 3; i++) await cycle();
    const before = await metrics();
    for (let i = 0; i < 30; i++) await cycle();
    const after = await metrics();
    assert(after[0] - before[0] < 200 && after[1] - before[1] < 10, `DOM nodes and listeners flat: ${before} -> ${after}`);
    console.log(`memory: nodes ${before[0]} -> ${after[0]}, listeners ${before[1]} -> ${after[1]}, heap ${before[2]} -> ${after[2]} KB over 30 opens and closes`);

    await ana.click('#wtJoin');
    await playing(ana, 'ddddddddddd', 'Ana watching');
    await ana.click('#leaveBtn');
    await waitFor(ana, () => ytFake.live() === 0 && !lpc.wt() && document.getElementById('wtBox').hidden, null, 'the player gone when Ana leaves the room');
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer.close && peerServer.close();
  }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

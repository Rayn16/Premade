// Rooms on a phone: Ana (desktop) makes a room and shares her screen; Bo joins from an iPhone-sized page that,
// like phone browsers, can't share a screen. Bo hears Ana, sees her screen, points at it with a tap, chats both ways,
// shares the invite through the phone's share sheet and keeps his screen on while in the room; he gets the menu along
// the bottom, no screen-share controls, no screen step in setup and no sideways scrolling, and Ana's Help says he's on
// his phone.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium, devices } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8088/index.html?peer=127.0.0.1:9008&debug';
PeerServer({ host: '127.0.0.1', port: 9008, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8088, '127.0.0.1');

function fakeScreen() { // Ana's screen: a canvas
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  setInterval(() => { g.fillStyle = '#246'; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#fc0'; g.fillRect(Date.now() % 1000, 300, 80, 80); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
}
async function player(browser, name, opts, init) {
  const ctx = await browser.newContext(opts);
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon|workers\.dev/, (r) => r.fulfill({ status: 404, headers: cors }));
  await ctx.addInitScript(init);
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false })); }, name);
  const page = await ctx.newPage();
  page.on('console', (m) => process.env.DEBUG && console.log(`[${name}]`, m.type(), m.text().slice(0, 200)));
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  return page;
}
const inRoom = (p) => p.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 20000 });
const nav = (p, name) => p.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name, exact: true }); // the menu, by each button's name
const shown = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent || e.getClientRects().length).map((e) => e.id || e.className), sel);

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana', { viewport: { width: 1280, height: 860 } }, fakeScreen);
    const bo = await player(browser, 'Bo', devices['iPhone 13'], () => {
      delete MediaDevices.prototype.getDisplayMedia;
      window.wakes = []; window.wakeNo = true; // the screen kept on, and let go: a stand-in for the phone's, which says no at first (a battery saver)
      Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => ({ request: async (type) => {
        if (wakeNo) { wakes.push('no'); throw new DOMException('Battery saver', 'NotAllowedError'); }
        const l = new EventTarget(); l.release = async () => { wakes.push('released'); l.dispatchEvent(new Event('release')); }; wakes.push(type); return l;
      } }) });
      Navigator.prototype.share = async (d) => { window.shared = d; }; // the phone's share sheet
    });
    await ana.addInitScript(() => localStorage.setItem('lpc-setup', '1'));

    // Bo's first visit: setup goes name, mic, done, with no screen to check
    await bo.goto(URL_);
    assert(await bo.evaluate(() => document.documentElement.classList.contains('phone')), 'a page that cannot share a screen is a phone');
    await bo.click('#wNext'); await bo.click('#wNext');
    assert.strictEqual(await bo.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 3 of 3', 'setup skips the screen check on a phone');
    await bo.click('#wBack');
    assert.strictEqual(await bo.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 2 of 3', 'and Back skips it too');
    await bo.click('#wNext'); await bo.click('#wNext');
    assert.deepStrictEqual(await shown(bo, '#appLink, #sbTrack, #compactBtn, .nav[data-view="help"]'), [], 'no desktop app link, tracking, compact view or Remote help on a phone');
    const [railTop, railBottom, mainBottom, h] = await bo.evaluate(() => [document.querySelector('.rail').getBoundingClientRect().top, document.querySelector('.rail').getBoundingClientRect().bottom, document.querySelector('main').getBoundingClientRect().bottom, innerHeight]);
    assert(railBottom === h && railTop >= mainBottom, `the menu sits along the bottom: ${[railTop, railBottom, mainBottom, h]}`);

    await ana.goto(`${URL_}#kayn`); await ana.click('#joinBtn'); await inRoom(ana);
    await ana.click('#generalShareBtn');
    await bo.fill('#code', 'kayn'); await bo.click('#joinBtn'); await inRoom(bo);
    await bo.waitForTimeout(1500);
    assert.strictEqual(await bo.evaluate(() => wakes.join()), 'no', 'a phone that says no is asked again later, not on every render');
    await bo.evaluate(() => { wakeNo = false; });
    await bo.waitForFunction(() => lpc.peers().some((p) => p.name === 'Ana' && p.live), null, { timeout: 20000 });
    await bo.waitForFunction(() => [...document.querySelectorAll('#screenGrid video')].some((v) => v.videoWidth > 0 && !v.paused), null, { timeout: 20000 });
    assert.deepStrictEqual(await shown(bo, '#generalShareBtn, #optRoomScreen, #optRoomSound, #optLetPoint, #roomSoundState, #optShareQ'), [], 'no screen-share controls on a phone');
    assert(await shown(ana, '#generalShareBtn').then((s) => s.length === 1), 'the PC keeps them');
    await bo.waitForFunction(() => wakes.join() === 'no,screen', null, { timeout: 15000 }); // a phone that locks itself can stop the mic
    assert.strictEqual(await bo.textContent('#copyBtn'), 'Share invite link');
    await bo.click('#copyBtn');
    assert.match(await bo.evaluate(() => shared.url), /#kayn$/, 'the invite link goes to the share sheet');

    // Point: a tap on Ana's screen points there; her page (no desktop app to draw it) says so
    await bo.click('#screenGrid .pt');
    await bo.tap('#screenGrid video');
    await bo.waitForFunction(() => lpc.toasts().includes('Ana: They need the Premade app for Windows to see your pointer.'), null, { timeout: 10000 });
    assert.strictEqual(await bo.textContent('#screenGrid .pt'), 'Point', 'pointing stops');

    // Ana's Help on Bo's card: he's on his phone, not someone who forgot to share his screen
    await ana.click('#players li:has-text("Bo") .help');
    await ana.waitForFunction(() => /They’re on their phone/.test(document.getElementById('helpList').textContent), null, { timeout: 15000 });
    assert(!/aren’t sharing their screen|They use the website/.test(await ana.textContent('#helpList')), 'no screen-share advice for a phone');
    await ana.click('#helpClose');

    // League, Proximity voice: no tracking to set up, and why friends in a game go quiet
    await nav(bo, 'League').click();
    await bo.waitForFunction(() => /A phone isn’t on the map/.test(document.getElementById('offmap').textContent), null, { timeout: 5000 });
    assert.deepStrictEqual(await shown(bo, '#shareBtn, #sbVersion'), [], 'no League screen share on a phone');
    await nav(bo, 'Rooms').click();

    assert(await bo.isHidden('#chatText'), 'no room chat on the room page (What’s new 152)');

    for (const v of ['Rooms', 'Friends', 'Settings', 'Features']) { // by name: the bottom menu's icons keep theirs
      await nav(bo, v).click();
      assert.strictEqual(await bo.evaluate(() => document.documentElement.scrollWidth), 390, `${v} fits the phone's width`);
    }
    assert.deepStrictEqual(await bo.$$eval('#setupList h3', (hs) => hs.map((h) => h.textContent)), ['Your name', 'Your mic', 'A room with your friends'], 'Get set up leaves out what a phone can’t do');
    await nav(bo, 'Rooms').click();
    await bo.click('#leaveBtn');
    await bo.waitForFunction(() => wakes.join() === 'no,screen,released', null, { timeout: 5000 }); // and lets the screen sleep again
    console.log('phone.e2e: all passed');
  } finally {
    await browser.close();
    web.close();
  }
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); }); // the PeerServer would keep Node running

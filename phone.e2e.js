// Rooms on a phone: Ana (desktop) makes a room and shares her screen; Bo joins from an iPhone-sized page that,
// like phone browsers, can't share a screen. Bo hears Ana, sees her screen, chats both ways, and gets no screen-share
// controls, no screen step in setup and no sideways scrolling.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium, devices } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8082/index.html?peer=127.0.0.1:9002&debug';
PeerServer({ host: '127.0.0.1', port: 9002, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8082, '127.0.0.1');

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
const shown = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent || e.getClientRects().length).map((e) => e.id || e.className), sel);

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana', { viewport: { width: 1280, height: 860 } }, fakeScreen);
    const bo = await player(browser, 'Bo', devices['iPhone 13'], () => { delete MediaDevices.prototype.getDisplayMedia; });
    await ana.addInitScript(() => localStorage.setItem('lpc-setup', '1'));

    // Bo's first visit: setup goes name, mic, done, with no screen to check
    await bo.goto(URL_);
    assert(await bo.evaluate(() => document.documentElement.classList.contains('phone')), 'a page that cannot share a screen is a phone');
    await bo.click('#wNext'); await bo.click('#wNext');
    assert.strictEqual(await bo.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 4 of 4', 'setup skips the screen check on a phone');
    await bo.click('#wBack');
    assert.strictEqual(await bo.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 2 of 4', 'and Back skips it too');
    await bo.click('#wNext'); await bo.click('#wNext');
    assert.deepStrictEqual(await shown(bo, '#appLink, #sbTrack, #compactBtn'), [], 'no desktop app link, tracking or compact view on a phone');

    await ana.goto(`${URL_}#kayn`); await ana.click('#joinBtn'); await inRoom(ana);
    await ana.click('#generalShareBtn');
    await bo.fill('#code', 'kayn'); await bo.click('#joinBtn'); await inRoom(bo);
    await bo.waitForFunction(() => lpc.peers().some((p) => p.name === 'Ana' && p.live), null, { timeout: 20000 });
    await bo.waitForFunction(() => [...document.querySelectorAll('#screenGrid video')].some((v) => v.videoWidth > 0 && !v.paused), null, { timeout: 20000 });
    assert.deepStrictEqual(await shown(bo, '#generalShareBtn, #optRoomScreen, #optRoomSound, #optLetPoint, #roomSoundState, #optShareQ'), [], 'no screen-share controls on a phone');
    assert(await shown(ana, '#generalShareBtn').then((s) => s.length === 1), 'the PC keeps them');

    await ana.fill('#chatText', 'hi from the PC'); await ana.press('#chatText', 'Enter');
    await bo.waitForFunction(() => document.getElementById('chatLog').innerText.includes('hi from the PC'), null, { timeout: 10000 });
    await bo.fill('#chatText', 'hi from my phone'); await bo.press('#chatText', 'Enter');
    await ana.waitForFunction(() => document.getElementById('chatLog').innerText.includes('hi from my phone'), null, { timeout: 10000 });
    await bo.tap('#chatLog li'); // a tap shows a message's buttons under it, so its text stays readable
    const [txt, acts] = await bo.evaluate(() => { const li = document.querySelector('#chatLog li'); return [li.querySelector('b'), li.querySelector('.acts')].map((e) => e.getBoundingClientRect().bottom); });
    assert(acts > txt, 'message buttons sit under the message on a phone');

    for (const v of ['voice', 'friends', 'settings']) {
      await bo.click(`.nav[data-view="${v}"]`);
      assert.strictEqual(await bo.evaluate(() => document.documentElement.scrollWidth), 390, `${v} fits the phone's width`);
    }
    console.log('phone.e2e: all passed');
  } finally {
    await browser.close();
    web.close();
  }
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); }); // the PeerServer would keep Node running

// The Discord filter box (What's new 158) in headless Chromium with a stand-in for the desktop app (window.lpcClient):
// on by default, a share then starts the app's filtered sound; unticked mid-share, the share starts again with the plain
// sound and the filter stops; ticked again, it's back. Five rounds leave no audio context open. With the app 1.56
// (What's new 234) the filter runs only while a friend hears the share: Ben in Ana's room watches it with its sound,
// hides it, and 10 s later Ana's app stops the filter and its audio context sleeps; shown again, both start again.
//   NODE_PATH=/path/to/node_modules node sharefilter.e2e.js        (peer@1.0.2, peerjs@1.5.4, playwright)
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8098, PEER = 9021;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

function fakeClient() {
  const cv = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
  setInterval(() => { const g = cv.getContext('2d'); g.fillStyle = `hsl(${Date.now() % 360},50%,40%)`; g.fillRect(0, 0, 640, 360); }, 100);
  const AC = AudioContext;
  let tone = null;
  navigator.mediaDevices.getDisplayMedia = async () => { // the screen with its sound (Windows' loopback)
    if (!tone) { const a = new AC(), o = a.createOscillator(); tone = a.createMediaStreamDestination(); o.connect(tone); o.start(); }
    return new MediaStream([...cv.captureStream(10).getVideoTracks(), tone.stream.getAudioTracks()[0].clone()]);
  };
  window.acs = 0; // audio contexts the page has open
  window.ctxs = [];
  window.AudioContext = class extends AC { constructor(o) { super(o); acs++; ctxs.push(this); } close() { if (this.state !== 'closed') acs--; return super.close(); } };
  window.calls = [];
  window.lpcClient = {
    version: '1.48.0', screens: async () => [], useScreen() {}, keys: async () => ({}), compact() {}, windowMode: async () => 'borderless',
    update() {}, discord() {}, ducking: async () => 3, soundSettings() {}, attenuate() {}, overlay() {}, on() {},
    captureSources: async () => [{ id: 'screen:1', type: 'screen', name: 'Screen 1', main: true, thumb: '' }],
    captureSource: async () => true,
    shareAudioMode: () => { calls.push('mode'); return { filter: true, discord: true, warning: false }; },
    shareAudioCancel() {},
    startFilteredAudio: async () => { calls.push('start'); return true; },
    stopFilteredAudio: () => { calls.push('stop'); },
  };
}

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext();
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev/, (r) => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', 'Ana'); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ autoShare: false, denoise: false })); });
    await ctx.addInitScript(fakeClient);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:9&debug`);
    await page.waitForFunction(() => window.lpc, null, { timeout: 15000 });
    const box = () => page.evaluate(() => document.getElementById('optShareFilter').checked);
    const tick = (on) => page.evaluate((on) => { const b = document.getElementById('optShareFilter'); b.checked = on; b.dispatchEvent(new Event('change')); }, on);
    const pick = () => page.waitForSelector('#captureDlg[open] #captureGrid button').then((b) => b.click());
    const state = (re) => page.waitForFunction((re) => new RegExp(re).test(document.getElementById('roomSoundState').textContent), re.source, { timeout: 10000 });

    assert.strictEqual(await box(), true, 'the Discord filter is on by default');
    await page.evaluate(() => document.getElementById('generalShareBtn').click());
    await pick();
    await state(/without Premade's voices or Discord/);
    assert.deepStrictEqual(await page.evaluate(() => calls), ['mode', 'start'], 'a share starts the filtered sound');
    const open = await page.evaluate(() => acs);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => { calls.length = 0; });
      await tick(false);
      await pick(); // the share starts again, so its sound is the plain one
      await state(/^Screen audio is being shared with the room\.$/);
      assert.deepStrictEqual(await page.evaluate(() => calls), ['mode', 'stop'], 'filter off: the share starts again without it, and the old filter stops');
      assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-opts'))).shareFilter, false, 'off is saved');
      await page.evaluate(() => { calls.length = 0; });
      await tick(true);
      await pick();
      await state(/without Premade's voices or Discord/);
      assert.deepStrictEqual(await page.evaluate(() => calls), ['mode', 'start'], 'filter on again: the filtered sound starts');
    }
    assert.strictEqual(await page.evaluate(() => acs), open, 'five rounds of off and on leave no audio context open');
    await page.evaluate(() => { calls.length = 0; document.getElementById('generalShareBtn').click(); }); // stop sharing
    assert.deepStrictEqual(await page.evaluate(() => calls), ['stop'], 'stopping the share stops the filter');
    await page.waitForFunction((n) => acs === n - 1, open, { timeout: 5000 });

    // the app 1.56: Ana shares in a room, Ben watches with its sound
    const player = async (name, app) => {
      const c = await browser.newContext();
      await c.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
      await c.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev/, (r) => r.abort());
      await c.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ autoShare: false, denoise: false })); }, name);
      if (app) {
        await c.addInitScript(fakeClient);
        await c.addInitScript(() => Object.assign(lpcClient, { version: '1.56.0', pauseFilteredAudio: () => { calls.push('pause'); } }));
      }
      const pg = await c.newPage();
      pg.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
      return pg;
    };
    const url = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;
    const ana = await player('Ana', true), ben = await player('Ben', false);
    await ana.goto(url);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    await ben.goto(`${url}#${await ana.evaluate(() => lpc.room())}`);
    await ben.click('#joinBtn');
    await ana.evaluate(() => document.getElementById('generalShareBtn').click());
    await ana.waitForSelector('#captureDlg[open] #captureGrid button').then((b) => b.click());
    await ben.waitForFunction(() => { const s = lpc.seen(); return s.length === 1 && s[0].video > 0 && s[0].sound === 1; }, null, { timeout: 45000 });
    await ana.waitForTimeout(12000);
    assert.deepStrictEqual(await ana.evaluate(() => calls), ['mode', 'start'], 'heard: the filter keeps running');
    const sleeping = () => ana.evaluate(() => ctxs.filter((c) => c.state === 'suspended').length);
    assert.strictEqual(await sleeping(), 0);
    await ben.click('#screenGrid figcaption button'); // Hide
    await ana.waitForFunction(() => calls.includes('pause'), null, { timeout: 20000 });
    assert.deepStrictEqual(await ana.evaluate(() => calls), ['mode', 'start', 'pause'], 'nobody hears it: the filter stops');
    await ana.waitForFunction(() => ctxs.some((c) => c.state === 'suspended'), null, { timeout: 5000 });
    await ben.click('#players li .screen:not([hidden])'); // Show screen
    await ana.waitForFunction(() => calls.length === 4, null, { timeout: 30000 });
    assert.deepStrictEqual(await ana.evaluate(() => calls), ['mode', 'start', 'pause', 'start'], 'Ben hears it again: the filter starts again');
    await ana.waitForFunction(() => !ctxs.some((c) => c.state === 'suspended'), null, { timeout: 5000 });
    console.log('sharefilter: ok');
  } finally { await browser.close(); web.close(); peerServer.close && peerServer.close(); }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

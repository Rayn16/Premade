// The Discord filter box (What's new 158) in headless Chromium with a stand-in for the desktop app (window.lpcClient):
// on by default, a share then starts the app's filtered sound; unticked mid-share, the share starts again with the plain
// sound and the filter stops; ticked again, it's back. Five rounds leave no audio context open.
//   node sharefilter.e2e.js
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8098;
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
  window.AudioContext = class extends AC { constructor(o) { super(o); acs++; } close() { if (this.state !== 'closed') acs--; return super.close(); } };
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
    console.log('sharefilter: ok');
  } finally { await browser.close(); web.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

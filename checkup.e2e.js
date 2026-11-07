// PC check-up (Settings, App: Check this PC, What's new 131) in headless Chromium with a stand-in for the desktop app
// (window.lpcClient): the report lists the page's own checks (relay, H.264 encoder, mic, push to talk read by the app)
// and the app's lines, says OK / FIX / -- per line, is copied, and leaves no test connection or camera track open
// after five runs.
//   node checkup.e2e.js
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8097;
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

function fakeClient() {
  const on = {};
  window.copied = '';
  navigator.clipboard.writeText = async (t) => { window.copied = t; };
  // every test connection counted, so the test can see they all closed (counts only: holding them would keep them
  // alive, and Chromium allows 500)
  const PC = RTCPeerConnection;
  window.pcs = { made: 0, open: 0 };
  window.RTCPeerConnection = class extends PC { constructor(c) { super(c); pcs.made++; pcs.open++; } close() { if (this.signalingState !== 'closed') pcs.open--; super.close(); } };
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.mics = 0; // tracks still live
  navigator.mediaDevices.getUserMedia = async (c) => { const m = await gum(c); for (const t of m.getTracks()) { mics++; const stop = t.stop.bind(t); t.stop = () => { if (t.readyState === 'live') mics--; stop(); }; } return m; };
  window.lpcClient = {
    version: '1.43.0', screens: async () => [], useScreen() {}, keys: async () => ({ ptt: true }), compact() {}, windowMode: async () => 'borderless',
    update() {}, discord() {}, ducking: async () => 3, soundSettings() {}, attenuate() {}, overlay() {}, metrics: async () => ({ cpu: 1, mb: 200 }),
    checkup: async () => [{ ok: true, name: 'Overlay window', say: 'shows on top' }, { ok: false, name: 'Games drive', say: 'D:\\Premade Clips\\Games: 3.0 GB free' }],
    on: (n, f) => { on[n] = f; }, emit: (n, v) => on[n] && on[n](v),
  };
}

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ctx = await browser.newContext();
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev/, (r) => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', 'Ana'); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-keys', JSON.stringify({ ptt: 'KeyT' })); });
    await ctx.addInitScript(fakeClient);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:9&debug`);
    await page.waitForFunction(() => window.lpc, null, { timeout: 15000 });

    // MINS=30: runs it again and again that long (the leak check), page memory, DOM nodes and listeners measured after
    // the third run and at the end
    const cdp = await ctx.newCDPSession(page), until = Date.now() + (+process.env.MINS || 0) * 60e3;
    const measure = async () => { await cdp.send('HeapProfiler.collectGarbage'); const d = await cdp.send('Memory.getDOMCounters'), h = await cdp.send('Runtime.getHeapUsage'); return { nodes: d.nodes, listeners: d.jsEventListeners, heapMB: +(h.usedSize / 1e6).toFixed(1) }; };
    let warm = null, runs = 0;
    for (let run = 0; run < 5 || Date.now() < until; run++, runs++) {
      if (run === 3) warm = await measure();
      if (run === 3 || run % 500 === 0) console.log(`run ${run}: ${JSON.stringify(await measure())}`);
      await page.evaluate(() => { window.copied = ''; document.getElementById('checkBtn').click(); });
      // push to talk: the app says the key went down while the page waits for it
      await page.waitForFunction(() => /Hold T now/.test(document.getElementById('checkOut').textContent), null, { timeout: 30000 });
      await page.evaluate(() => lpcClient.emit('key', 'ptt-down'));
      await page.evaluate(() => lpcClient.emit('key', 'ptt-up'));
      await page.waitForFunction(() => window.copied, null, { timeout: 30000 });
    }
    const end = await measure();
    console.log(`${runs} runs: after 3 ${JSON.stringify(warm)}, at the end ${JSON.stringify(end)}`);
    assert(!/FIX the /.test(await page.evaluate(() => window.copied)), 'no check failed to run');
    assert(end.nodes <= warm.nodes + 50 && end.listeners <= warm.listeners + 20, 'no DOM nodes or listeners left behind');
    const report = await page.evaluate(() => window.copied);
    console.log(report);
    assert.strictEqual(report, await page.textContent('#checkOut'), 'the report on the page is the one copied');
    assert(/^Premade PC check-up, app 1\.43\.0/.test(report), 'header');
    assert(/^-- {2}Relay \(TURN\): no relay passwords yet/m.test(report), 'relay not tested without relay passwords');
    assert(/^(OK|--) {1,2}H\.264 encoder: \S/m.test(report), 'an encoder named from getStats');
    assert(/^OK {2}Mic: .*\d+(\.\d+)? kHz/m.test(report), 'mic sample rate');
    assert(/^OK {2}Push to talk: T read by the app/m.test(report), 'push to talk read');
    assert(/^OK {2}Overlay window: shows on top$/m.test(report) && /^FIX Games drive: /m.test(report), 'the app’s lines');
    assert.strictEqual(await page.evaluate(() => pcs.open), 0, 'every test connection closed');
    assert.strictEqual(await page.evaluate(() => pcs.made), runs * 2, 'two test connections per run (the encoder test; the relay test makes none without relays)');
    assert.strictEqual(await page.evaluate(() => mics), 0, 'the mic opened for the check-up is closed again');
    assert.deepStrictEqual(errors, [], 'no page errors');
    assert(await page.isEnabled('#checkBtn'), 'button back on');
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

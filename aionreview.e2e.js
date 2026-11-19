// Test of the Aion 2 run review on the Recording page (What's new 133), in headless Chromium with a stand-in for the
// desktop app: runs kept in lpc-aion-runs (one with Live fight's deaths, one older one with only respawns) show as a
// strip under their recording (fights, casts, deaths, time against your best, the cast up at a death).
// Needs playwright and ffmpeg: NODE_PATH=$(npm root -g) node aionreview.e2e.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8096, CLIP = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aionrev-')), 'run.webm');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10', '-t', '120', '-c:v', 'libvpx', '-g', '10', '-b:v', '100k', CLIP]); // 2 minutes, a key frame a second
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/media/')) { // the app's video server: the same small video for every name, in parts
    const all = fs.statSync(CLIP).size, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''), a = m && m[1] ? +m[1] : 0, z = m && m[2] ? +m[2] : all - 1;
    res.writeHead(m ? 206 : 200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1, 'Access-Control-Allow-Origin': '*', ...(m && { 'Content-Range': `bytes ${a}-${z}/${all}` }) });
    return fs.createReadStream(CLIP, { start: a, end: z }).pipe(res);
  }
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
function fakeApp(port) {
  const A = 'Game 2026-11-06 23-02-00 Recording.webm', B = 'Game 2026-11-07 01-06-00 Recording.webm';
  const runs = {
    [B]: { game: 'Aion 2', map: 600092, dungeon: 'Ferocious Horn Den', start: '2026-11-07T01:06:00.000Z', parts: [[0, 60], [100, 190]],
      bosses: [{ name: 'Duanka', from: 0, to: 50, kill: 45 }, { name: 'Nuakum', from: 60, to: 150, kill: null }], kills: [{ t: 45, name: 'Duanka' }], respawns: [],
      casts: [{ t: 20, name: 'Mau Necromancy', secs: 11 }, { t: 100, name: 'Blue Light of Destruction', secs: 25 }, { t: 130, name: 'Blue Light of Destruction', secs: 10 }],
      deaths: [{ t: 110, name: 'Rayan', me: true }, { t: 140, name: 'Sam', me: false }, { t: 148, name: 'Rayan', me: true }] },
    [A]: { game: 'Aion 2', map: 600092, dungeon: 'Ferocious Horn Den', start: '2026-11-06T23:02:00.000Z', parts: null, // before deaths were kept: only respawns
      bosses: [{ name: 'Nuakum', from: 10, to: 90, kill: 85 }], kills: [{ t: 85, name: 'Nuakum' }], respawns: [70], casts: [{ t: 30, name: 'Blue Light of Destruction', secs: 25 }] },
  };
  localStorage.setItem('lpc-aion-runs', JSON.stringify(runs));
  window.lpcClient = {
    version: '1.42.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, on() {},
    media: (kind, name) => `http://127.0.0.1:${port}/media/${encodeURIComponent(name)}`,
    gameVideo: async (what) => (what === 'list' ? [{ name: B, size: 5e7, at: Date.now() - 6e5 }, { name: A, size: 5e7, at: Date.now() - 864e5 }] : true),
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
}
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(fakeApp, PORT);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await page.evaluate(() => document.querySelector('.nav[data-view="record"]').click());
    await page.waitForSelector('#recList .runbar');
    // 44: the strip under each run
    const strips = await page.$$eval('#recList li', (l) => l.map((li) => ({ line: li.querySelector('.runline').textContent, fights: [...li.querySelectorAll('.rb')].map((b) => b.title), kills: li.querySelectorAll('.rb.kill').length, deaths: [...li.querySelectorAll('.rd')].map((b) => b.title), casts: li.querySelectorAll('.rc').length })));
    assert.deepStrictEqual(strips[0].fights, ['Duanka: killed in 0:35, your best', 'Nuakum: no kill'], 'fights, from the pull to the kill');
    assert.strictEqual(strips[0].kills, 1);
    assert.strictEqual(strips[0].casts, 3);
    assert.deepStrictEqual(strips[0].deaths, ['You died at 1:50, during Blue Light of Destruction', 'Sam died at 2:20, during Blue Light of Destruction', 'You died at 2:28'], 'the cast up at each death, only while its countdown runs');
    assert.match(strips[0].line, /3 deaths: 2 of 3 during Blue Light of Destruction$/);
    assert.deepStrictEqual(strips[1].fights, ['Nuakum: killed in 1:05, your best'], 'the older run');
    assert.deepStrictEqual(strips[1].deaths, ['Came back in at 1:10, during Blue Light of Destruction'], 'without deaths, coming back in counts, with the cast in the minute before');
    // a death on the strip plays from 10 s before it
    await page.click('#recList li:first-child .rd');
    await page.waitForFunction(() => document.getElementById('clipDlg').open && Math.abs(document.querySelector('#clipDlg video').currentTime - 100) < 1.5, null, { timeout: 10000 });
    await page.evaluate(() => document.getElementById('clipDlg').close());
    assert(await page.evaluate(() => !document.getElementById('aionReviewBox') && !document.getElementById('vsBox')), 'boss practice and side by side are gone');
    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('aionreview: ok');
  } finally { await browser.close(); server.close(); fs.rmSync(path.dirname(CLIP), { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });

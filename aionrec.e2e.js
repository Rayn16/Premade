// Test of Record each Aion 2 dungeon run (site/index.html crumbTick), in headless Chromium with a stand-in for the
// desktop app 1.38.1: Aion 2's log says a dungeon map loaded, so Aion 2's window is recorded, each reload inside is a
// mark on its video, a boss fight (the gauge under its health bar with the boss's name above it) is kept when the video
// is cut, up to its "Defeated" banner, named after the boss, with its cast read, while a menu with a gauge and an elite
// with no kill are not, the run's timeline goes beside its video, and a town map stops it; a boss bar on a field map
// records too, and a recording with no boss in it is binned; the Recording page lists each dungeon's runs and the last 7 days.
// The frames are drawn at Rayan's 2560x1440 with his UI's places; Tesseract reads them (app 1.42).
// Needs playwright: NODE_PATH=$(npm root -g) node aionrec.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8091;
const server = http.createServer((req, res) => {
  const f = path.join(SITE, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
function fakeApp() {
  const on = {}, cv = Object.assign(document.createElement('canvas'), { width: 2560, height: 1440 });
  window.log = '[2026-11-05T07:18:23.522+0300] [0] Flow.SelectCharacterInLobby.LoadComplete.Map(1110)\n';
  window.calls = [];
  const t = (min) => new Date(Date.now() - 864e5 + min * 60000).toISOString().replace('Z', '+0000');
  window.old = [[0, 'Flow.SelectCharacterInLobby.LoadComplete.Map(1110)'], [1, 'Flow.Teleport.LoadComplete.Map(600072)'], [5, 'Flow.Teleport.LoadComplete.Map(600072)'],
    [13, 'Flow.Teleport.LoadComplete.Map(1110)'], [14, 'Flow.Teleport.LoadComplete.Map(600072)'], [24, 'Flow.Teleport.LoadComplete.Map(1110)'],
    [25, 'Flow.Teleport.LoadComplete.Map(320007)'], [27, 'Dungeon.Twisted Pit.Clear'], [28, 'Flow.Teleport.LoadComplete.Map(1110)'], [60, 'Flow.QuitFromIngame.None']].map(([m, e]) => `[${t(m)}] [0] ${e}\n`).join('');
  window.lpcClient = {
    version: '1.37.4', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay() {}, on(n, fn) { (on[n] = on[n] || []).push(fn); }, fire: (n, x) => (on[n] || []).forEach((fn) => fn(x)),
    aionLog: async (file, from) => { if (file === '*') return [window.old, window.log]; const b = new TextEncoder().encode(window.log); return { file: 'a.breadcrumb.log', size: b.length, text: new TextDecoder().decode(b.slice(file ? from : 0)) }; },
    captureSources: async () => [{ id: 'window:3', type: 'window', name: 'Aion 2 meter' }, { id: 'window:7', type: 'window', name: 'AION2' }],
    captureSource: async (id) => { calls.push('pick ' + id); return true; },
    gameVideo: async (what, name, parts) => { calls.push(what); if (what === 'cut') window.cut = parts; if (what === 'json') window.timeline = JSON.parse(parts); return what === 'start' ? 'Game 2026-11-05 07-27-03 Recording.webm' : what === 'list' ? [{ name: 'Game 2026-11-05 07-27-03 Recording.webm', size: 1e6, at: Date.now(), rec: calls.includes('start') && !calls.includes('end') }] : true; },
  };
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
  setInterval(() => { // Aion 2's top middle and cast bar as window.scene says
    const g = cv.getContext('2d'), s = window.scene || '';
    g.fillStyle = `hsl(${Date.now() % 360},30%,20%)`; g.fillRect(0, 0, 2560, 1440);
    g.fillStyle = '#c8b461'; g.fillRect(2252, 385, 18, 18); g.font = '22px sans-serif'; g.fillText('Ferocious Horn Den', 2290, 399); // the quest tracker's dungeon line
    if (s) { g.fillStyle = '#20e0f0'; g.fillRect(1140, 112, 280, 4); } // the gauge under the target's health bar (a menu has one too)
    if (s === 'elite' || s === 'boss' || s === 'cast') {
      g.fillStyle = '#c8d020'; g.fillRect(1080, 69, 300, 7); // its health, 75%
      g.fillStyle = '#ff3030'; g.font = 'bold 22px sans-serif'; g.fillText(s === 'elite' ? 'Kwapo Guard' : 'Nuakum', 1180, 56);
    }
    if (s === 'cast') { g.fillStyle = '#c02020'; g.fillRect(1120, 1132, 320, 30); g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('Blue Light 12.0', 1180, 1154); }
    if (s === 'banner') { g.fillStyle = '#000'; g.fillRect(0, 0, 2560, 200); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('Nuakum Defeated', 1110, 125); }
  }, 250);
  window.play = async (l) => { for (const [s, sec] of l) { window.scene = s; await new Promise((r) => setTimeout(r, sec * 1000)); } window.scene = ''; };
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(4);
}
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(fakeApp);
    page.on('pageerror', (e) => console.log('PAGE', e.message)); page.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`);
    await page.waitForTimeout(7000);
    assert.deepStrictEqual(await page.evaluate(() => calls.filter((c) => c !== 'list')), [], 'in town: nothing recorded');
    await page.evaluate(() => { log += '[2026-11-05T07:27:03.166+0300] [0] Flow.Teleport.LoadComplete.Map(600092)\n[2026-11-05T07:31:44.120+0300] [0] Flow.Teleport.Load'; });
    await page.waitForFunction(() => calls.includes('start'), null, { timeout: 8000 });
    // a menu with a gauge, an elite that doesn't die, a walk, then the boss with a cast, and its banner after its bar goes
    await page.evaluate(() => { window.played = play([['menu', 22], ['elite', 21], ['', 47], ['boss', 14], ['cast', 5], ['boss', 8], ['', 8], ['banner', 3], ['', 3]]).then(() => { window.done = true; }); });
    // Live fight's deaths: a fight over before the run (3 deaths) isn't counted; your fall during the boss is, a stranger's isn't
    await page.evaluate(() => {
      const f = (active, target, deaths) => lpcClient.fire('aion-live', { active, target, players: [{ name: 'Rayan', me: true, party: true, deaths }, { name: 'Stranger', deaths }] });
      setTimeout(() => { f(false, 'Old boss', 3); f(true, 'Nuakum', 0); f(true, 'Nuakum', 1); f(true, 'Nuakum', 1); f(true, 'Totem', 1); f(true, 'Nuakum', 1); }, 96000); // another target in the same time counts the same death
    });
    assert(await page.evaluate(() => calls.includes('pick window:7')), 'Aion 2’s window is what’s recorded');
    await page.evaluate(() => { log += 'Complete.Map(600092)\n'; }); // a reload in the same dungeon: still recording
    await page.waitForTimeout(6000);
    assert(!(await page.evaluate(() => calls.includes('end'))), 'a reload inside keeps recording');
    await page.evaluate(() => { const at = new Date(Date.now() - 2000).toISOString().replace('Z', '+0000'); log += `[${at}] [0] Flow.Teleport.LoadComplete.Map(600092)\n`; });
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('lpc-vid-marks') || '{}')['Game 2026-11-05 07-27-03 Recording.webm'] || []).length === 1, null, { timeout: 8000 });
    await page.waitForFunction(() => window.done, null, { timeout: 150000 });
    await page.evaluate(() => { log += '[2026-11-05T07:56:27.18+0300] [0] Flow.Teleport.LoadComplete.Map(1110)\n'; });
    await page.waitForFunction(() => calls.includes('end'), null, { timeout: 8000 });
    await page.waitForFunction(() => window.cut, null, { timeout: 8000 });
    const cut = await page.evaluate(() => window.cut);
    assert(cut.length === 1 && cut[0][0] >= 75 && cut[0][1] - cut[0][0] >= 40 && cut[0][1] - cut[0][0] <= 62, `only the boss fight kept, 10 s before it to 5 s after its banner: ${JSON.stringify(cut)}`);
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('lpc-vid-marks'))['Game 2026-11-05 07-27-03 Recording.webm'] || []).some((m) => m.text === 'Nuakum'), null, { timeout: 5000 }); // the fight marked with its boss
    await page.waitForFunction(() => window.timeline, null, { timeout: 5000 });
    const tl = await page.evaluate(() => window.timeline);
    assert(tl.map === 600092 && tl.dungeon === 'Ferocious Horn Den' && tl.parts.length === 1 && tl.bosses.length === 1 && tl.bosses[0].name === 'Nuakum' && tl.bosses[0].from === 0 && tl.bosses[0].kill > 30, `the timeline: ${JSON.stringify(tl.bosses)}`);
    assert(tl.kills.length === 1 && tl.casts.some((c) => /Blue Light/i.test(c.name) && c.secs === 12 && c.t > 5) && tl.bosses[0].hp.some(([, hp]) => hp > 70 && hp < 80), `kills, casts and health: ${JSON.stringify(tl)}`);
    assert(tl.deaths.length === 1 && tl.deaths[0].me && tl.deaths[0].name === 'Rayan' && tl.deaths[0].t > tl.bosses[0].from && tl.deaths[0].t < tl.bosses[0].to, `your death in the boss fight: ${JSON.stringify(tl.deaths)}`);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-runs'))['Game 2026-11-05 07-27-03 Recording.webm']);
    assert(kept && kept.deaths.length === 1 && !kept.marks && !('hp' in kept.bosses[0]) && kept.bosses[0].pull > kept.bosses[0].from, 'the run kept for the Recording page, without its health readings');
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('lpc-aion-run-bosses'))), { 600092: ['Nuakum'] }, 'the dungeon’s bosses learnt');
    // a field map: a boss bar for 5 s records a run (on Live fight's watch of Aion 2's window); a town map ends it, and with no boss in it it's binned
    await page.evaluate(() => { localStorage.setItem('lpc-aion', '1'); log += `[${new Date().toISOString().replace('Z', '+0000')}] [0] Flow.Teleport.LoadComplete.Map(510003)\n`; window.scene = 'elite'; });
    await page.waitForFunction(() => calls.filter((c) => c === 'start').length === 2, null, { timeout: 40000 });
    await page.evaluate(() => { window.scene = ''; log += `[${new Date().toISOString().replace('Z', '+0000')}] [0] Flow.Teleport.LoadComplete.Map(1110)\n`; });
    await page.waitForFunction(() => calls.includes('trash'), null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector('.nav[data-view="record"]').click());
    await page.waitForSelector('#aionRunsBox:not([hidden]) #aionRuns tr');
    const rows = await page.$$eval('#aionRuns tr', (l) => l.map((tr) => [...tr.cells].map((c) => c.textContent)));
    assert.deepStrictEqual(rows[0], ['Dungeon 600072', '2', '10:00', '12:00', '0.5'], 'runs, best, usual, respawns');
    assert.deepStrictEqual(rows.map((r) => r[0]), ['Dungeon 600072', 'Ferocious Horn Den'], 'quick story dungeons aren’t dungeon runs; a run names its dungeon from the quest tracker');
    assert.match(await page.textContent('#aionWeek'), /^Last 7 days: 3 dungeon runs, [\d.]+ hours/, 'the week');
    console.log('aionrec: ok');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

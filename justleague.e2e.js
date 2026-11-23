// Test of Just League and What you play (What's new 184) in site/index.html, in headless Chromium, with a stand-in for
// the desktop app and a local PeerServer. Checks the brief's stories: setup's Just League path (no mic test since What's
// new 207) ends on Profile with League's list plus Settings (no League/Premade button), its last step's Light look and
// Start with League land in Settings, Overlay and App, a reload paints League's list before the page's script, the
// Settings switch brings Rooms back and hides them again, With friends in rooms + only League hides Aion 2 and RE4
// co-op (What you play brings Aion 2 back, nothing saved shows both), an old plays list keeps RE4 co-op, an invite link
// opens Rooms with League's list kept, and a phone's bar. And What's new 207: no mic, no Voice section and no game room
// joined by itself outside a room; joining the invite's room brings the mic and Settings, Voice back.
// SHOTS=<folder> saves pictures.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node justleague.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium, devices } = require('playwright');

const SITE = path.join(__dirname, 'site'), SHOTS = process.env.SHOTS;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8098, '127.0.0.1');
PeerServer({ host: '127.0.0.1', port: 9098, path: '/' });
const URL0 = 'http://127.0.0.1:8098/index.html?peer=127.0.0.1:9098&debug';

function fakeClient() {
  const on = {};
  window.lpcClient = {
    version: '1.51.0', screens: async () => [], useScreen() {}, keys: async () => ({}), compact() {}, overlay() {}, update() {}, discord() {},
    withLeague: async (v) => (v === undefined ? !!window.withLeagueOn : (window.withLeagueOn = v)),
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, d) { for (const fn of on[name] || []) fn(d); },
  };
}
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } }; // after fades and switches settle
const shown = (p) => p.$$eval('.rail .nav', (b) => b.filter((x) => x.checkVisibility()).map((x) => x.textContent.trim()));
const LEAGUE = ['Profile', 'Pregame', 'Game', 'Stats', 'TFT']; // no Proximity voice or Overlay (What's new 207)
const secs = (p) => p.$$eval('#setList [data-sec]', (b) => b.filter((x) => x.checkVisibility()).map((x) => x.dataset.sec)); // Settings' sections shown
const openSet = async (p, sec) => { await p.click('.rail [data-view="settings"]'); await p.click(`#setList [data-sec="${sec}"]`); };
const cur = (p) => p.evaluate(() => document.querySelector('main > .view:not([hidden])').dataset.view);

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }) });
  const fresh = async (seed, opt = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ['microphone'], ...opt });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
    if (!opt.isMobile) await ctx.addInitScript(fakeClient);
    if (seed) await ctx.addInitScript((s) => { if (!localStorage.getItem('lpc-setup')) for (const [k, v] of Object.entries({ 'lpc-setup': '1', 'lpc-news': '9999', ...s })) localStorage.setItem(k, v); }, seed);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    return page;
  };
  try {
    // 1 + 2: a new Premade, Just League
    const p = await fresh();
    await p.goto(URL0);
    await p.waitForFunction(() => document.getElementById('setup').open);
    await p.fill('#wName', 'Yas');
    assert(await p.isDisabled('#wNext'), 'Next waits for a choice');
    await p.click('#wUse [data-use="league"]');
    assert(await p.isHidden('#wPlays') && await p.isVisible('#wJustHint'), 'Just League skips What do you play?');
    assert.strictEqual(await p.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 1 of 3', 'a League player checks the screen, with no mic test (What’s new 207)');
    assert.match(await p.textContent('#wJustHint'), /without voice/, 'the hint doesn’t promise voice');
    await shot(p, 'setup-1-just');
    await p.click('#wNext');
    assert.strictEqual(await p.textContent('#setup .step:not([hidden]) h2'), 'Check your screen', 'no Test your mic step');
    assert.strictEqual(await p.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 2 of 3');
    await p.click('#wNext');
    assert.strictEqual(await p.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 3 of 3');
    await p.click('#wBack');
    await p.click('#wBack');
    assert.strictEqual(await p.textContent('#setup .step:not([hidden]) .eyebrow'), 'Step 1 of 3', 'Back skips the mic test too');
    await p.click('#wNext'); await p.click('#wNext');
    assert(await p.isVisible('#wLol') && await p.isHidden('#wRooms') && await p.isVisible('#wWithLeague:checked'), 'step 4 is Set up League, Start with League on');
    await p.click('#wLooks [data-preset="light"]');
    assert.strictEqual(await p.getAttribute('#wLooks [data-preset="light"]', 'aria-pressed'), 'true', 'Light pressed');
    assert(await p.evaluate(() => document.getElementById('wNext').classList.contains('primary')), 'Done is the red button here');
    await shot(p, 'setup-4-league');
    await p.click('#wNext');
    assert.strictEqual(await cur(p), 'profile', 'opens on Profile');
    assert.deepStrictEqual(await shown(p), [...LEAGUE, 'Settings'], 'League’s list plus Settings, no League/Premade button');
    assert(await p.isVisible('#brandP') && await p.isHidden('#brandL'), 'the Premade wordmark on top');
    await shot(p, 'sidebar-just-full');
    await p.click('#railGrip');
    await shot(p, 'sidebar-just-icons');
    await p.click('#railGrip');
    assert(await p.isHidden('#railMic') && await p.isHidden('#railMicText'), 'no mic button outside a room (What’s new 207)');
    await p.click('.rail [data-view="settings"]');
    assert.strictEqual(await p.getAttribute('#setList [aria-current]', 'data-sec'), 'overlay', 'Settings opens on Overlay the first time');
    assert.deepStrictEqual(await secs(p), ['overlay', 'callouts', 'league', 'look', 'app'], 'no Voice section in Just League (Champ select and Clips need League’s client)');
    assert.strictEqual(await p.getAttribute('#ovPresets [data-preset="light"]', 'aria-pressed'), 'true', 'Settings, Overlay shows Light');
    assert(await p.isVisible('#kOverlay') && await p.isVisible('#kBoard'), 'the overlay’s keys on top of Settings, Overlay');
    assert(await p.isHidden('[aria-labelledby="h-ovvoice"]') && await p.isHidden('[aria-labelledby="h-callteam"]'), 'no rows that need a room: Overlay’s Voice card, Callouts’ From your team');
    await shot(p, 'settings-overlay-just');
    await p.click('#setList [data-sec="app"]');
    assert(await p.isChecked('#optWithLeague') && await p.evaluate(() => window.withLeagueOn === true), 'Start with League ticked in Settings, App');
    assert(await p.isChecked('#optJustLeague') && await p.isHidden('#optPlays'), 'Just League on, What you play hidden');
    assert.strictEqual(await p.getAttribute('.rail [data-view="settings"]', 'aria-current'), 'page', 'Settings current in League’s list');
    await p.locator('#optJustLeague').scrollIntoViewIfNeeded();
    await shot(p, 'settings-app-just');
    console.log('stories 1, 2: setup’s Just League path');

    // 3: restart: League's list from the first paint, Profile first
    await p.addInitScript(() => { const mo = new MutationObserver(() => { // while the page is still being read: once the Rooms page is in, before any script below it
      const v = document.querySelector('.view[data-view="voice"]'), vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      if (!v) return;
      mo.disconnect();
      window.firstPaint = [vis('premadeList'), vis('leagueList'), getComputedStyle(v).visibility, !!window.lpc];
    }); mo.observe(document, { childList: true, subtree: true }); });
    await p.reload();
    await p.waitForFunction(() => document.documentElement.classList.contains('booted'));
    assert.deepStrictEqual(await p.evaluate(() => window.firstPaint), [false, true, 'hidden', false], 'before the script ran: League’s list, no Rooms page');
    assert.strictEqual(await cur(p), 'profile', 'Profile after a restart');
    console.log('story 3: no Rooms flash on restart');

    // 4: off brings Premade's list back (staying on Settings), on hides it again
    await p.evaluate(() => document.documentElement.classList.add('has-lcu')); // League's own client: Clips and Recording show
    assert.deepStrictEqual(await shown(p), [...LEAGUE, 'Clips', 'Recording', 'Settings'], 'Recording at the foot with Settings (What’s new 197)');
    await shot(p, 'sidebar-just-recording');
    await p.click('.rail [data-view="record"]');
    assert(await p.isVisible('#recBtn') && await p.isVisible('#optClipsAll'), 'Record your screen and Clip anywhere reachable');
    await p.click('.rail [data-view="settings"]');
    assert.strictEqual(await p.getAttribute('#setList [aria-current]', 'data-sec'), 'app', 'Settings opens on the section used last');
    assert.deepStrictEqual(await secs(p), ['overlay', 'callouts', 'champ', 'clips', 'league', 'look', 'app'], 'Champ select and Clips with League’s client');
    await p.uncheck('#optJustLeague');
    assert.strictEqual(await cur(p), 'settings', 'still on Settings');
    assert((await secs(p)).includes('voice') && await p.isVisible('#railMic'), 'Rooms on: Settings, Voice and the mic are back');
    assert.deepStrictEqual(await shown(p), ['Rooms', 'Friends', 'Remote help', 'Recording', 'Settings', 'League'], 'Premade’s list back, Recording in its place (Aion 2 and RE4 co-op: League only was saved)');
    assert(await p.isVisible('#optPlays'), 'What you play shows');
    await p.locator('#optJustLeague').scrollIntoViewIfNeeded();
    await shot(p, 'settings-app-rooms');
    await p.check('#optJustLeague');
    assert.strictEqual(await cur(p), 'settings', 'on again: still on Settings');
    assert.deepStrictEqual(await shown(p), [...LEAGUE, 'Clips', 'Recording', 'Settings'], 'League’s list again');
    console.log('story 4: the Settings switch');

    // 5: With friends in rooms, only League: no Aion 2 or RE4 co-op; What you play brings Aion 2 back
    const r = await fresh();
    await r.goto(URL0);
    await r.waitForFunction(() => document.getElementById('setup').open);
    await r.click('#wUse [data-use="rooms"]');
    assert.deepStrictEqual(await r.$$eval('#wPlays label', (l) => l.map((x) => x.textContent.trim())), ['League of Legends or TFT', 'Aion 2', 'Resident Evil 4 co-op', 'Something else']);
    await r.check('#wPlays input[value="league"]');
    await shot(r, 'setup-1-rooms');
    await r.click('#wNext'); await r.click('#wNext'); await r.click('#wNext');
    assert(await r.isVisible('#wCreate') && await r.isHidden('#wLol') && !(await r.evaluate(() => document.getElementById('wNext').classList.contains('primary'))), 'Create a room is the one red button');
    await shot(r, 'setup-4-rooms');
    await r.click('#wNext');
    assert.strictEqual(await cur(r), 'voice', 'opens on Rooms');
    assert.deepStrictEqual(await shown(r), ['Rooms', 'Friends', 'Remote help', 'Settings', 'League'], 'no Aion 2 or RE4 co-op');
    await openSet(r, 'app');
    await r.check('#optPlays input[value="aion"]');
    assert((await shown(r)).includes('Aion 2'), 'ticking Aion 2 brings it back');
    const s = await fresh({});
    await s.goto(URL0);
    assert.deepStrictEqual(await shown(s), ['Rooms', 'Friends', 'Remote help', 'Aion 2', 'RE4 co-op', 'Settings', 'League'], 'nothing saved: everything');
    console.log('story 5: What you play');

    // 6: a list saved before 184 with only League: RE4 co-op stays, Aion 2 doesn't
    const o = await fresh({ 'lpc-plays': 'league' });
    await o.goto(URL0);
    assert.deepStrictEqual(await shown(o), ['Rooms', 'Friends', 'Remote help', 'RE4 co-op', 'Settings', 'League'], 'an old list keeps RE4 co-op');
    await openSet(o, 'app');
    assert(await o.isChecked('#optPlays input[value="re4"]') && !(await o.isChecked('#optPlays input[value="aion"]')), 'What you play says so');
    console.log('story 6: an old plays list');

    // 7: an invite link with Just League on opens Rooms with the room's code, League's list kept with nothing current
    const i = await fresh({ 'lpc-opts': JSON.stringify({ justLeague: true }) });
    await i.goto(URL0 + '#kayn');
    assert.strictEqual(await cur(i), 'voice', 'Rooms');
    assert.strictEqual(await i.inputValue('#code'), 'KAYN', 'with its code');
    assert.deepStrictEqual(await shown(i), [...LEAGUE, 'Settings'], 'League’s list');
    assert.strictEqual(await i.$$eval('.rail .nav[aria-current]', (b) => b.filter((x) => x.checkVisibility()).length), 0, 'nothing current in it');
    console.log('story 7: invite link');

    // What's new 207: Just League joins no game room by itself; the invite's room brings the mic and Settings, Voice back
    await i.evaluate(() => lpc.league({ inGame: true, phase: 'InProgress', room: 'g00000000001', t: 100, players: [] }));
    await i.waitForTimeout(1500);
    assert.strictEqual(await i.evaluate(() => lpc.slot()), -1, 'no game room joined by itself');
    await i.click('#joinBtn');
    await i.waitForFunction(() => lpc.slot() >= 0);
    assert(await i.isVisible('#railMic'), 'the mic is back in the room');
    await i.click('.rail [data-view="settings"]');
    assert((await secs(i)).includes('voice'), 'Settings, Voice is back in the room');
    await i.click('#setList [data-sec="voice"]');
    assert(await i.isVisible('#micHome') && await i.isVisible('#optAutoRoom'), 'with the mic and In a game');
    await shot(i, 'settings-voice-just-in-room');
    console.log('What’s new 207: no voice outside a room, the mic and Voice back inside one');

    // 10: a phone with Just League on: Voice, Profile, Stats, TFT and Settings along the bottom
    const ph = await fresh({ 'lpc-opts': JSON.stringify({ justLeague: true }) }, { ...devices['iPhone 13'] });
    await ph.addInitScript(() => { delete MediaDevices.prototype.getDisplayMedia; });
    await ph.goto(URL0);
    assert(await ph.evaluate(() => document.documentElement.classList.contains('phone')), 'a phone');
    assert.deepStrictEqual(await shown(ph), ['Profile', 'Stats', 'TFT', 'Settings'], 'the phone’s bar');
    assert(await ph.isHidden('#muteBtn'), 'no mic on the phone’s bar outside a room');
    await shot(ph, 'phone-just');
    console.log('story 10: phone bar');
    console.log('justleague e2e: all checks passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit(process.exitCode || 0);
  }
})();

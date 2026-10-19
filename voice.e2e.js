// Multi-player test of site/index.html in headless Chromium, with fake mics and a local PeerServer.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node voice.e2e.js
// Screen sharing is swapped for a canvas: Ana's screen holds Rayan's real minimap (fixtures/), Ben's a drawn
// minimap whose camera box and champion icon the test moves. Checks the setup wizard and join screen, smart noise
// removal, that everyone hears each other in the lobby, that volume follows the distance between champions (with
// less bass far away), that a player whose minimap isn't tracked is silent once a game is on, the live map and player
// cards (the other team hidden), shortcuts and their beeps, popups and chimes, room chat, locking the room, studio
// voice, the game modes (Gibberish, Voice swap), who can hear you, the ready check, the room games (balanced teams,
// role roulette, the queue quiz, a mock draft) and game history with its room awards. Dee and Eve get
// a stand-in for the Windows client (window.lpcClient) to check what League's own data does: the League status window
// (champ select, loading, in game), a room made for the game, your champion found by name, hurt voice, the Legends and
// Immersive voices, the overlay (moved and resized, with chat, who hears you and voice swap's countdown), the compact
// view, the ready check with the app's window mode, room awards from the scoreboard, app updates and Discord status.
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const CORNER = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures/rayan-practice-tool-646.rgba.gz'))).toString('base64');
// PEER=127.0.0.1:8787 runs it against our own server (server/worker.js under `wrangler dev`) instead of a local PeerServer
const PEER = process.env.PEER || '127.0.0.1:9000';
const URL_ = `http://127.0.0.1:8080/index.html?peer=${PEER}&debug`;
const MAP = 14870, RANGE = 1200;
const GAME_ROOM = 'g0123456789a';

const peerServer = process.env.PEER ? null : PeerServer({ host: '127.0.0.1', port: 9000, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8080, '127.0.0.1');

// Runs in the page before its own scripts: getDisplayMedia returns a canvas the test paints.
function fakeScreen([w, h]) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b2a22'; g.fillRect(0, 0, w, h);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
  let tick = 0;
  setInterval(() => { g.fillStyle = tick++ % 2 ? '#1b2a22' : '#1c2a22'; g.fillRect(0, 0, 1, 1); }, 100); // canvas capture only sends changed frames
  // Rayan's 646px screen corner, at the bottom-right of a 2548x1435 screen like the one it came from
  window.paintCorner = (b64) => {
    const bytes = Uint8ClampedArray.from(atob(b64), (c) => c.charCodeAt(0));
    g.putImageData(new ImageData(bytes, 646, 646), w - 646, h - 646);
  };
  // A 300px minimap with the real frame's gold edge, a white 70x40 camera box centred at (fx, fy) of it, and a
  // champion icon with the team's blue ring at icon (by default where it sits when the camera is on it)
  window.setBox = (fx, fy, icon = [fx, fy + 0.015]) => {
    const s = 300, x0 = w - s, y0 = h - s;
    g.fillStyle = '#101a16'; g.fillRect(x0, y0, s, s);
    g.fillStyle = 'rgb(166,144,80)'; g.fillRect(x0, y0, s, 1); g.fillRect(x0, y0, 1, s);
    g.fillStyle = 'rgb(107,85,49)'; g.fillRect(x0 + 1, y0 + 1, s - 1, 2); g.fillRect(x0 + 1, y0 + 1, 2, s - 1);
    const ix = x0 + icon[0] * s, iy = y0 + icon[1] * s;
    g.fillStyle = '#4a2f5c'; g.beginPath(); g.arc(ix, iy, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d9a07a'; g.beginPath(); g.arc(ix + 3, iy - 2, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgb(81,162,230)'; g.lineWidth = 2; g.beginPath(); g.arc(ix, iy, 13, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1;
    g.strokeRect(x0 + Math.round(fx * s - 35) + 0.5, y0 + Math.round(fy * s - 20) + 0.5, 69, 39);
  };
}
// A stand-in for client/preload.js: records what the page asks of the client, and lets the test send League data and keys.
// modern: the installed 1.5 app (version, window mode, updates, Discord); otherwise an old portable one.
function fakeClient(modern) {
  const on = {};
  window.lpcClient = {
    calls: [],
    screens: async () => [{ id: '1', main: true, thumb: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
    useScreen(id) { this.calls.push(['screen', id]); },
    keys: async () => ({ mute: true, show: true, ptt: true }),
    compact(on) { this.calls.push(['compact', on]); },
    overlay(s) { this.calls.push(['overlay', s]); },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    ...(modern && { version: '1.5.0', windowMode: async () => 'borderless', update() { this.calls.push(['update']); }, discord(s) { this.calls.push(['discord', s]); } }),
  };
}

// Wave Link's channels as extra speakers, like on Rayan's PC; setSinkId notes where voices were sent
function fakeOutputs() {
  const list = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async () => [...await list(), ...['Voice Chat', 'Game'].map((n) => ({ kind: 'audiooutput', deviceId: n, label: `${n} (Elgato Virtual Audio)`, groupId: '' }))];
  AudioContext.prototype.setSinkId = async function (id) { window.sinkWas = id; };
}

let pic = ''; // Data Dragon's picture of "Test Champ" (and every other champion): Ben's drawn icon
// Data Dragon's champions: Test Champ and 21 more for the room games' quiz and draft
const CHAMPS = { Testchamp: { id: 'Testchamp', key: '900', name: 'Test Champ', title: 'the Tester', tags: ['Mage'], stats: { attackrange: 550 } } };
['Annie', 'Ashe', 'Garen', 'Lux', 'Darius', 'Jinx', 'Leona', 'Zed', 'Ahri', 'Thresh', 'Vayne', 'Malphite', 'Ezreal', 'Sona', 'Yasuo', 'Teemo', 'Caitlyn', 'Nasus', 'Morgana', 'Riven', 'Braum'].forEach((n, i) => {
  CHAMPS[n] = { id: n, key: String(i + 1), name: n, title: `the ${n} of the test`, tags: [['Mage', 'Marksman', 'Fighter', 'Tank', 'Support', 'Assassin'][i % 6]], stats: { attackrange: 125 + 25 * i } };
});
const POS = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' };
async function player(browser, name, screen, { setup = true, client = false, denoise = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: CHAMPS }, headers: cors });
    r.fulfill({ body: Buffer.from(pic, 'base64'), contentType: 'image/png', headers: cors });
  });
  await ctx.addInitScript(fakeScreen, screen);
  if (setup) await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); }, name);
  // smart noise removal takes the fake mic's beeps for noise, so it's off unless a test wants it
  await ctx.addInitScript((d) => { if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: d })); }, denoise);
  if (client) await ctx.addInitScript(fakeClient, client === 'modern');
  await ctx.addInitScript(fakeOutputs);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`[${name}]`, m.text())); // fonts are blocked here
  return page;
}
async function join(page, room) {
  await page.goto(`${URL_}#${room}`);
  assert.strictEqual(await page.inputValue('#code'), room.toUpperCase(), 'invite link fills in the code');
  assert.strictEqual(await page.getAttribute('#appLink', 'href'), `lolprox://join/${room}`, 'and offers to open the room in the desktop app');
  await page.click('#joinBtn');
  await page.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
}

const others = (page) => page.evaluate(() => lpc.peers());
const waitFor = (page, fn, arg, what, timeout = 30000) =>
  page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async () => { // not on animation frames: a busy container holds those back
    const view = await page.evaluate(() => ({ view: [...document.querySelectorAll('main > .view')].filter((v) => !v.hidden).map((v) => v.dataset.view), map: [!!document.getElementById('map').offsetParent, document.getElementById('map').clientWidth], hidden: document.hidden, marks: lpc.map() }));
    throw new Error(`timed out waiting for ${what}; page ${JSON.stringify(view)}; peers: ${JSON.stringify(await others(page))}; me: ${JSON.stringify(await page.evaluate(() => lpc.me()))}`);
  });
// Waits until this page hears exactly `names`, each with live audio and a volume close to vol.
const hears = (page, names, vol, what) => waitFor(page, ([names, vol]) => {
  const ps = lpc.peers();
  return ps.length === names.length && names.every((n) => ps.some((p) => p.name === n && p.live && (vol == null || Math.abs(p.vol - vol) < 0.02)));
}, [names, vol], what);
const volOf = async (page, name) => (await others(page)).find((p) => p.name === name);
const shot = (page, name, sel) => process.env.SHOTS && (sel ? page.locator(sel) : page).screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
// WCAG's contrast between two #rrggbb colours (4.5 reads well)
const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const scratch = await browser.newPage();
    pic = await scratch.evaluate(() => {
      const c = document.createElement('canvas'), g = c.getContext('2d'), k = 64 / 0.86 / (0.0432 * 300); // minimap px -> picture px
      c.width = c.height = 128;
      g.fillStyle = '#4a2f5c'; g.beginPath(); g.arc(64, 64, 12 * k, 0, 7); g.fill();
      g.fillStyle = '#d9a07a'; g.beginPath(); g.arc(64 + 3 * k, 64 - 2 * k, 5 * k, 0, 7); g.fill();
      return c.toDataURL().split(',')[1];
    });
    await scratch.close();

    // first launch: Ana goes through the setup wizard, checking her screen on her real minimap
    const ana = await player(browser, 'Ana', [2548, 1435], { setup: false });
    // our server's numbers for Settings > Our server: today and two days ago
    const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    await ana.context().route('**/stats', (r) => r.fulfill({ json: { days: [{ day: ago(2), rooms: 3, players: 7 }, { day: ago(0), rooms: 2, players: 3 }] }, headers: { 'access-control-allow-origin': '*' } }));
    await ana.goto(URL_);
    assert(await ana.evaluate(() => document.getElementById('setup').open), 'setup wizard on first launch');
    await shot(ana, 'wizard-1');
    await ana.fill('#wName', 'Ana');
    await ana.click('#wNext');
    await ana.click('#micTest');
    await waitFor(ana, () => document.getElementById('micLevel').value > 0, null, 'Ana\'s mic meter moving in the wizard');
    await shot(ana, 'wizard-2');
    await ana.selectOption('#outSel', 'Voice Chat');
    assert(await ana.evaluate(() => window.sinkWas === 'Voice Chat' && localStorage.getItem('lpc-out') === 'Voice Chat'), 'voices sent to the Wave Link channel, and remembered');
    await ana.click('#wNext');
    await ana.evaluate((b64) => paintCorner(b64), CORNER);
    await ana.click('#wShare');
    await waitFor(ana, () => /Found your minimap/.test(document.getElementById('wScreen').textContent), null, 'the wizard to find Ana\'s minimap');
    await shot(ana, 'wizard-3');
    await ana.click('#wNext');
    await ana.click('#wNext');
    assert(!(await ana.evaluate(() => document.getElementById('setup').open)) && await ana.evaluate(() => localStorage.getItem('lpc-setup') === '1' && localStorage.getItem('lpc-name') === 'Ana'), 'wizard done and remembered');
    assert(await ana.isVisible('#micTest') === false && await ana.locator('#micBox').evaluate((el) => el.parentElement.id === 'micHome' && el.closest('main > .view').dataset.view === 'voice'), 'mic settings back in Voice settings');
    console.log('setup wizard: name, mic test and screen check (found Ana\'s minimap)');
    await ana.evaluate(() => document.getElementById('shareBtn').click()); // stop for now: no minimap is the lobby, where everyone hears everyone

    // smart noise removal: the RNNoise files on the site take out a fan-like hiss (pink noise) and keep a voiced
    // sound (a wobbling 220 Hz tone stands in for a voice)
    const kept = await ana.evaluate(async () => {
      const run = async (fan) => {
        const N = 4 * 48000, oc = new OfflineAudioContext(1, N, 48000), buf = oc.createBuffer(1, N, 48000), d = buf.getChannelData(0);
        for (let i = 0, pink = 0; i < N; i++) {
          pink = 0.98 * pink + 0.1 * (Math.random() * 2 - 1);
          d[i] = fan ? 0.05 * pink : 0.3 * Math.sin(2 * Math.PI * 220 * i / 48000) * (1 + 0.5 * Math.sin(2 * Math.PI * 4 * i / 48000));
        }
        const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
        const wasmBinary = await (await fetch(`vendor/rnnoise/rnnoise${simd ? '_simd' : ''}.wasm`)).arrayBuffer();
        await oc.audioWorklet.addModule('vendor/rnnoise/workletProcessor.js');
        const src = oc.createBufferSource(), rn = new AudioWorkletNode(oc, '@sapphi-red/web-noise-suppressor/rnnoise', { processorOptions: { maxChannels: 1, wasmBinary } });
        src.buffer = buf;
        src.connect(rn).connect(oc.destination);
        src.start();
        oc.suspend(128 / 48000).then(() => new Promise((r) => setTimeout(r, 1000))).then(() => oc.resume()); // it loads its model in the background
        const out = (await oc.startRendering()).getChannelData(0), rms = (a) => Math.sqrt(a.reduce((t, v) => t + v * v, 0) / a.length);
        return rms(out.subarray(48000)) / rms(d.subarray(48000));
      };
      return { fan: await run(true), voice: await run(false) };
    });
    console.log(`smart noise removal: fan noise down to ${(kept.fan * 100).toFixed(1)}%, the voiced sound kept at ${(kept.voice * 100).toFixed(0)}%`);
    assert(kept.fan < 0.1 && kept.voice > 0.7, 'noise removal takes out the noise and keeps the voice');

    // the first page is your League profile; in a browser, with no League and no Riot data, it says where it comes from
    assert(await ana.isVisible('.view[data-view="profile"]') && await ana.isHidden('#createBtn'), 'Profile first');
    assert.deepStrictEqual(await ana.$$eval('.nav', (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim())), ['Profile', 'Voice', 'Stats', 'Settings'], 'the menu in a browser: all of voice on one page');
    assert.match(await ana.textContent('#proNote'), /^Your League profile shows up here in the desktop app while League is open/);
    assert.deepStrictEqual(await Promise.all(['#proApp', '#proFindBox', '#proRanks', '#proStatus'].map((s) => ana.isVisible(s))), [true, false, false, false], 'the app link and nothing else');
    await ana.click('#proRoom');
    // the big join screen: Create room
    assert(await ana.isVisible('#createBtn') && await ana.isVisible('#code'), 'join screen');
    await ana.click('#createBtn');
    await ana.waitForFunction(() => lpc.slot() >= 0, null, { timeout: 15000 });
    const ROOM = await ana.evaluate(() => lpc.room());
    assert(/^[a-z]{4}$/.test(ROOM) && (await ana.textContent('#roomName')) === ROOM, `a 4-letter room: ${ROOM}`);
    console.log(`Ana created room ${ROOM.toUpperCase()}`);

    const ben = await player(browser, 'Ben', [1920, 1080]);
    await join(ben, ROOM);
    assert.deepStrictEqual([await ana.evaluate(() => lpc.slot()), await ben.evaluate(() => lpc.slot())], [0, 1], 'first free slots');
    await hears(ana, ['Ben'], 1, 'Ana to hear Ben');
    await hears(ben, ['Ana'], 1, 'Ben to hear Ana');

    // the fake mic beeps, so sound must arrive at both ends and come out of the speakers (Web Audio)
    const benId = (await others(ana))[0].id, anaId = (await others(ben))[0].id;
    const a1 = await ana.evaluate((id) => lpc.audio(id), benId);
    await ana.waitForTimeout(1500);
    const a2 = await ana.evaluate((id) => lpc.audio(id), benId), b2 = await ben.evaluate((id) => lpc.audio(id), anaId);
    const outA = await ana.evaluate((id) => lpc.heard(id), benId), outB = await ben.evaluate((id) => lpc.heard(id), anaId);
    assert(a2.bytes > a1.bytes && b2.bytes > 0 && outA > 0.05 && outB > 0.05, `audio must flow both ways and reach the speakers: ${JSON.stringify([a1, a2, b2, outA, outB])}`);
    console.log(`voice flows both ways (Ana received ${a2.bytes} bytes of Ben's mic)`);

    // status bar, connection dot, and the "talking now" glow (the beeps count as talking)
    await waitFor(ana, () => lpc.peers()[0].health === 'good', null, 'Ben\'s health dot green');
    assert.strictEqual(await ana.getAttribute('.player .dot', 'data-h'), 'good');
    assert.strictEqual(await ana.textContent('#sbServer'), 'Connected');
    assert.strictEqual(await ana.textContent('#sbCode'), ROOM);
    await waitFor(ana, () => lpc.peers()[0].talking && document.querySelector('.player[data-talking]'), null, 'Ben glowing while talking');
    console.log('status bar connected; Ben\'s card glows while Ben talks');

    // noise gate: Ben's mic meter moves; with the gate shut, Ana stops getting Ben's beeps
    await waitFor(ben, () => document.getElementById('micLevel').value > 0, null, 'Ben\'s mic meter moving');
    const gain = async (gate) => {
      await ben.evaluate((v) => lpc.gate(v), gate); // past the slider's top: the fake mic's beeps are full scale
      await ana.waitForTimeout(1500);
      return ana.evaluate((id) => lpc.heard(id), benId);
    };
    const shut = await gain(1.01), open = await gain(0);
    console.log(`noise gate: Ana got ${open.toExponential(2)} of Ben's beeps with the gate off, ${shut.toExponential(2)} with it shut`);
    assert(shut < 0.01 && open > 0.05, 'gate cuts the mic');
    await ben.$eval('#gate', (el) => { el.value = 0.12; el.dispatchEvent(new Event('input')); });

    // studio voice: Ana's mic without the browser's processing, sent at 96 kbps; off again, back to WebRTC's own rate
    const bitrate = async (ok, what) => {
      for (let i = 0; i < 50; i++, await ana.waitForTimeout(200)) { const b = await ana.evaluate((id) => lpc.bitrate(id), benId); if (ok(b)) return b; }
      throw new Error('timed out waiting for ' + what);
    };
    await ana.$eval('#optStudio', (el) => el.click());
    const studio = await bitrate((b) => b.max === 96000 && b.target === 96000 && b.mic.echoCancellation === false && b.mic.autoGainControl === false, 'Ana\'s studio voice at 96 kbps');
    console.log(`studio voice: sent at ${studio.target / 1000} kbps, mic ${JSON.stringify(studio.mic)}`);
    await ana.$eval('#optStudio', (el) => el.click());
    const normal = await bitrate((b) => b.max === 0 && b.target > 0 && b.target < 96000 && b.mic.echoCancellation === true, 'Ana\'s studio voice off');
    console.log(`studio voice off: ${normal.target / 1000} kbps`);
    await hears(ben, ['Ana'], 1, 'Ben still hears Ana after her mic reopened');

    // the voice connection: Faster has the others send Ben 10 ms packets; Less data (either side) 60 ms ones at 16 kbps,
    // nothing while silent; a new call each time, which Ana starts (the lower slot)
    const rate = async (page, id) => { const a = await page.evaluate((i) => lpc.audio(i), id); await page.waitForTimeout(2000); const b = await page.evaluate((i) => lpc.audio(i), id); return (b.packets - a.packets) / 2; };
    const voiceSetting = async (page, v) => page.$eval('#optVoice', (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, v);
    const packetsAt = async (lo, hi, what) => { // Ben's packets a second from Ana, once the new call settles
      let r = 0;
      for (let i = 0; i < 8; i++) { await hears(ben, ['Ana'], 1, what); r = await rate(ben, anaId); if (r >= lo && r <= hi) return r; }
      throw new Error(`${what}: ${r} packets a second`);
    };
    const normalRate = await packetsAt(40, 60, 'normal voice');
    await voiceSetting(ben, 'fast');
    const fastRate = await packetsAt(85, 115, 'faster voice');
    await voiceSetting(ben, 'low');
    const lowRate = await packetsAt(1, 20, 'less data');
    await bitrate((b) => b.max === 16000, 'Ana sending Ben 16 kbps');
    await voiceSetting(ben, 'normal');
    await packetsAt(40, 60, 'normal voice again');
    console.log(`voice connection: ${normalRate} packets a second normally, ${fastRate} on Faster, ${lowRate} on Less data (16 kbps)`);

    // screen share: Ana shares again (her real minimap through the browser's video pipeline)
    await ana.click('#shareBtn');
    await ben.evaluate(() => setBox(0.4, 0.6));
    await ben.click('#shareBtn');
    await waitFor(ana, () => lpc.me().fresh, null, 'Ana tracked', 40000); // the first frames are slow on a busy container
    await waitFor(ben, () => lpc.me().fresh, null, 'Ben tracked', 40000);
    const me = await ana.evaluate(() => lpc.me());
    console.log(`Ana's real minimap through screen share: ${me.minimap.s}px, following Ana's ${me.by} at ${(me.x * 100).toFixed(1)}% across, ${(me.y * 100).toFixed(1)}% down; champion icons ${JSON.stringify(me.icons)}`);
    // Ana's screen never moves, so the page can't tell which icon is Ana's yet: camera box, moved down to the champion
    assert(Math.abs(me.minimap.s - 278) <= 3 && me.by === 'camera' && Math.abs(me.x - 0.387) < 0.01 && Math.abs(me.y - 0.605) < 0.01, 'same minimap and box as the screenshot test');
    assert(me.icons.length === 1 && Math.abs(me.icons[0].x - 105) <= 1 && Math.abs(me.icons[0].y - 168) <= 1, 'Ana\'s icon found as on the screenshot');

    await hears(ana, ['Ben'], 1, 'Ben close by: full volume');
    await hears(ben, ['Ana'], 1, 'Ana close by: full volume');
    await waitFor(ana, () => lpc.map().some((m) => m.name === 'You') && lpc.map().some((m) => m.name === 'Ben'), null, 'Ana and Ben on the live map'); // it's drawn once a second
    const marks = await ana.evaluate(() => lpc.map());
    assert(marks.some((m) => m.name === 'You' && Math.abs(m.x - me.x) < 0.01) && marks.some((m) => m.name === 'Ben'), `live map shows Ana and Ben: ${JSON.stringify(marks)}`);
    console.log('live map: Ana and Ben on it');

    await ben.evaluate(() => setBox(0.85, 0.15)); // Ben's camera jumps onto Ben's champion: the page learns that icon
    await waitFor(ben, () => lpc.me().by === 'icon', null, 'Ben followed by the champion icon');
    await hears(ana, ['Ben'], 0, 'Ben across the map: silent');
    await hears(ben, ['Ana'], 0, 'Ana across the map: silent');
    assert.strictEqual((await volOf(ana, 'Ben')).volume, 0, 'audio element muted by distance');

    // 5/6 of the hearing range away: halfway through the fade
    const d = (RANGE * 5) / 6 / MAP;
    await ben.evaluate(([x, y]) => setBox(x, y - 0.015), [me.x + d, me.y]);
    await waitFor(ana, () => { const p = lpc.peers()[0]; return p.vol > 0.05 && p.vol < 0.95; }, null, 'Ben mid range');
    await ana.waitForTimeout(600);
    const mid = (await volOf(ana, 'Ben')).vol, midB = (await volOf(ben, 'Ana')).vol;
    console.log(`Ben ${Math.round(RANGE * 5 / 6)} units away: Ana hears Ben at ${Math.round(mid * 100)}%, Ben hears Ana at ${Math.round(midB * 100)}%`);
    assert(Math.abs(mid - 0.5) < 0.15 && Math.abs(mid - midB) < 0.05, 'half volume, the same both ways');
    const [pa, pb] = [(await volOf(ana, 'Ben')), (await volOf(ben, 'Ana'))];
    assert(Math.abs(pa.far - 5 / 6) < 0.05 && Math.abs(pb.far - 5 / 6) < 0.05, `far away, so less bass: ${pa.far}, ${pb.far}`);
    console.log(`stereo: Ana hears Ben at pan ${pa.pan.toFixed(2)}, Ben hears Ana at ${pb.pan.toFixed(2)}; terrain muffle ${pa.muffle.toFixed(2)} / ${pb.muffle.toFixed(2)}`);
    assert(pa.pan > 0.3 && pb.pan < -0.3, 'Ben is to Ana\'s right, Ana to Ben\'s left');
    // 3D sound: the same direction, all the way round (up the minimap is in front); plain stereo when it's off
    const [pa3, pb3] = [await ana.evaluate((id) => lpc.panner(id), benId), await ben.evaluate((id) => lpc.panner(id), anaId)];
    assert(pa3.model === 'HRTF' && pa3.x > 0.95 && Math.abs(pa3.z) < 0.2 && pb3.x < -0.95, `3D sound: Ben right of Ana, Ana left of Ben: ${JSON.stringify([pa3, pb3])}`);
    await ana.$eval('#optSurround', (el) => el.click());
    await waitFor(ana, (id) => lpc.panner(id).model === 'equalpower', benId, 'plain stereo without 3D sound');
    await ana.$eval('#optSurround', (el) => el.click());
    assert(/units away: in range/.test(await ana.textContent('.player .pstate')), 'card says how far away Ben is');

    // the other team (League's own data says who's on which): not on Ana's map, and Ana's card for Ben doesn't say where
    await ana.$eval('#optCompact', (el) => { el.checked = false; el.dispatchEvent(new Event('change')); }); // a client setting: no strip for this
    const team = (t) => ({ inGame: true, room: '', mode: 'CLASSIC', me: { champ: '', champName: '', team: t } });
    await ana.evaluate((g) => lpc.league(g), team('ORDER'));
    await ben.evaluate((g) => lpc.league(g), team('CHAOS'));
    await waitFor(ana, () => lpc.peers()[0].team === 'CHAOS' && !lpc.map().some((m) => m.name === 'Ben') && /^Other team/.test(document.querySelector('.player .pstate').textContent), null, 'Ben (other team) hidden on Ana\'s map');
    assert(/other team is hidden/.test(await ana.textContent('#offmap')), 'the map says the other team is hidden');
    await ben.evaluate((g) => lpc.league(g), team('ORDER'));
    await waitFor(ana, () => lpc.map().some((m) => m.name === 'Ben'), null, 'Ben (same team) back on Ana\'s map');
    for (const p of [ana, ben]) await p.evaluate(() => lpc.league(null));
    console.log('the other team is hidden on the map; your own team shows');

    // Ben looks elsewhere with a free camera: the box leaves, Ben's champion stays, so nothing changes
    await ben.evaluate(([x, y]) => setBox(0.2, 0.2, [x, y]), [me.x + d, me.y]);
    await ben.waitForTimeout(1500);
    const roam = await ben.evaluate(() => lpc.me());
    assert(roam.by === 'icon' && Math.abs(roam.x - (me.x + d)) < 0.01 && Math.abs(roam.y - me.y) < 0.01, `Ben still at the champion: ${JSON.stringify(roam)}`);
    assert(Math.abs((await volOf(ana, 'Ben')).vol - mid) < 0.05, 'Ben\'s volume follows the champion, not the camera');
    console.log('Ben moved the camera away: still heard at the same volume');
    assert(await ben.$eval('#face', (c) => !c.hidden && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 < 3 && v > 60)), 'close-up of the followed icon shown');
    await waitFor(ana, () => lpc.peers()[0].face, null, 'Ben\'s icon close-up on Ana\'s card for Ben', 20000);
    await shot(ana, 'ana-room');
    await shot(ben, 'ben-room');

    // the range slider changes only what you hear
    await ana.$eval('#range', (el) => { el.value = 3000; el.dispatchEvent(new Event('input')); });
    await hears(ana, ['Ben'], 1, 'Ana hears Ben with a longer range');
    assert(Math.abs((await volOf(ben, 'Ana')).vol - midB) < 0.05, 'Ben unaffected by Ana\'s range');
    await ana.$eval('#range', (el) => { el.value = 1200; el.dispatchEvent(new Event('input')); });

    // Ben's card on Ana's page: mute, and a volume slider
    await ana.click('#players .player .mute');
    assert.strictEqual((await volOf(ana, 'Ben')).volume, 0, 'muted player is silent');
    await ana.click('#players .player .mute');
    const full = (await volOf(ana, 'Ben')).volume;
    assert(full > 0, 'unmuted again');
    await ana.$eval('#players .player .pvol input', (el) => { el.value = 50; el.dispatchEvent(new Event('input')); });
    const half = await volOf(ana, 'Ben');
    assert(half.user === 0.5 && Math.abs(half.volume - full / 2) < 0.05, `card slider halves Ben: ${full} -> ${half.volume}`);
    await ana.$eval('#players .player .pvol input', (el) => { el.value = 100; el.dispatchEvent(new Event('input')); });
    console.log('player card: mute and volume slider work');

    // "Not my champion" makes Ben's page forget the icon and use the camera box until it learns again
    assert(await ben.isVisible('#mini') && await ben.isVisible('#relearnBtn'), 'minimap preview and Not my champion button shown');
    await ben.click('#relearnBtn');
    await waitFor(ben, () => !lpc.me().learned && lpc.me().by === 'camera', null, 'Ben\'s icon forgotten');
    assert(await ben.isHidden('#relearnBtn'), 'button hidden until an icon is learned again');
    console.log('Not my champion: back to the camera box until it learns again');

    // telling it the champion by name
    assert(await ben.isVisible('#pickForm'), 'champion picker offered while the icon is unknown');
    await ben.fill('#champ', 'test champ');
    await ben.click('#pickForm button');
    await waitFor(ben, () => lpc.me().by === 'icon', null, 'Ben found by champion name');
    assert(await ben.isHidden('#pickForm'), 'picker hidden once it knows the icon');
    await waitFor(ana, () => lpc.peers()[0].champ === 'Testchamp' && document.querySelector('.player .pic img[src*="Testchamp"]'), null, 'Ben\'s champion picture on Ana\'s card');
    console.log('pick by name: Ben\'s icon found from the champion picture, and Ana\'s card for Ben shows that champion');

    // shortcuts in a browser: Ctrl+Shift+M mutes; a push-to-talk key keeps the mic off unless held
    await ben.keyboard.press('Control+Shift+M');
    assert(!(await ben.evaluate(() => lpc.micOn())) && (await ben.textContent('#muteBtn')).includes('Muted'), 'Ctrl+Shift+M mutes');
    await waitFor(ben, () => lpc.toasts().includes('You’re muted. Press Ctrl+Shift+M to unmute.'), null, 'a note when Ben talks while muted');
    await ben.keyboard.press('Control+Shift+M');
    assert(await ben.evaluate(() => lpc.micOn()), 'and unmutes');
    assert.deepStrictEqual((await ben.evaluate(() => lpc.played())).slice(-2), ['mute', 'unmute'], 'a beep down for mute, up for unmute');
    await ben.click('.nav[data-view="voice"]');
    await ben.click('#voiceSet > summary'); // Voice settings, under the room
    assert.strictEqual(await ben.textContent('#talkNote'), 'In a browser these work while this page is in front.');
    await ben.click('[data-key="ptt"]');
    await ben.keyboard.press('KeyV');
    assert.strictEqual(await ben.textContent('#kPtt'), 'V', 'push-to-talk key set');
    assert(!(await ben.evaluate(() => lpc.micOn())), 'push to talk: mic off until the key is held');
    await ben.keyboard.down('KeyV');
    assert(await ben.evaluate(() => lpc.micOn()), 'push to talk: on while held');
    await ben.keyboard.up('KeyV');
    assert(!(await ben.evaluate(() => lpc.micOn())), 'push to talk: off when let go');
    await ben.click('#pttOff');
    assert(await ben.evaluate(() => lpc.micOn()), 'open mic again');
    await ben.click('#voiceSet > summary');
    console.log('shortcuts: mute toggle and push to talk');

    // Ben stops sharing: Ana is in a game (her minimap is tracked), so Ben, whose spot isn't known now, is silent both ways
    await ben.click('#shareBtn');
    await hears(ben, ['Ana'], 0, 'Ben (not sharing) doesn\'t hear Ana, who is in a game');
    await hears(ana, ['Ben'], 0, 'Ana doesn\'t hear Ben once Ben\'s position is stale');
    assert(/Minimap not tracked: silent during a game/.test(await ana.textContent('.player .pstate')), 'Ana\'s card for Ben says why');
    console.log('in a game, a player whose minimap isn\'t tracked is silent');

    // Ben leaves and rejoins from the join screen: same slot, voice comes back
    await ben.click('#leaveBtn');
    await waitFor(ana, () => lpc.peers().length === 0, null, 'Ben gone from Ana\'s list');
    assert(await ben.isVisible('#createBtn'), 'Ben back on the join screen');
    await ben.fill('#code', ROOM);
    await ben.click('#joinBtn');
    await ben.waitForFunction(() => lpc.slot() >= 0, null, { timeout: 15000 });
    await hears(ana, ['Ben'], null, 'Ana hears Ben after Ben rejoined');
    await hears(ben, ['Ana'], null, 'Ben hears Ana after rejoining');
    assert.strictEqual(await ben.evaluate(() => lpc.slot()), 1, 'Ben gets the same slot back');
    assert.strictEqual(await ben.$eval('#gate', (el) => el.value), '0.12', 'noise gate setting remembered');

    // a third player meets both
    const cat = await player(browser, 'Cat', [1920, 1080]);
    await join(cat, ROOM);
    await hears(cat, ['Ana', 'Ben'], null, 'Cat hears both');
    await hears(ana, ['Ben', 'Cat'], null, 'Ana hears both');
    await hears(ben, ['Ana', 'Cat'], null, 'Ben hears both');
    await waitFor(cat, () => { const v = Object.fromEntries(lpc.peers().map((p) => [p.name, p.vol])); return v.Ana === 0 && v.Ben === 1; }, null, 'Cat hears Ben (both in the lobby), not Ana (in a game)');
    console.log('three players: everyone connected; Cat and Ben hear each other in the lobby, Ana is in a game');
    await waitFor(ana, () => lpc.toasts().includes('Cat joined the room'), null, 'a popup on Ana\'s page when Cat joined');

    // room chat, with a link
    await ana.fill('#chatText', 'brb, build: https://example.com/build');
    await ana.press('#chatText', 'Enter');
    await waitFor(ben, () => /Ana\s*brb, build: https:\/\/example\.com\/build/.test(document.getElementById('chatLog').textContent) && document.querySelector('#chatLog a[href="https://example.com/build"]'), null, 'Ana\'s message with its link in Ben\'s chat');
    await waitFor(cat, () => document.getElementById('chatLog').children.length === 1, null, 'Ana\'s message in Cat\'s chat');
    assert.strictEqual(await ana.$$eval('#chatLog li', (l) => l.length), 1, 'and in Ana\'s own');
    console.log('room chat: a message with a link reached everyone');

    // talk time: the fake mics beep, so everyone talks; Ana sees the others' totals and the stats list
    await ana.waitForFunction(() => lpc.talk().peers.length === 2 && lpc.talk().peers.every((s) => s > 0) && lpc.talk().me > 0, null, { timeout: 15000 });
    await ana.click('.nav[data-view="stats"]');
    assert.strictEqual(await ana.$$eval('#talk li', (l) => l.length), 3, 'talk time for all three');
    await ana.click('.nav[data-view="voice"]');
    assert((await ana.textContent('#phase')).startsWith('In game'), 'Ana is in game: proximity on');
    assert((await cat.textContent('#phase')).startsWith('Lobby'), 'Cat has no minimap: lobby');
    console.log(`talk time on Ana's page: ${JSON.stringify(await ana.evaluate(() => lpc.talk()))}`);

    // a broken connection comes back by itself, without join or leave popups
    const catId = (await others(ana)).find((p) => p.name === 'Cat').id;
    await ana.evaluate((id) => lpc.kick(id), catId);
    await waitFor(ana, () => lpc.peers().length === 1, null, 'Cat dropped');
    await ana.waitForFunction(() => lpc.peers().length === 2 && lpc.peers().every((p) => p.live), null, { timeout: 30000 });
    await hears(cat, ['Ana', 'Ben'], null, 'Cat hears both again');
    console.log('auto reconnect: Cat came back after the connection broke');
    const popups = await ana.evaluate(() => lpc.toasts());
    assert(popups.includes('Ben left the room') && popups.includes('Ben joined the room') && popups.filter((t) => t === 'Cat joined the room').length === 1 && !popups.includes('Cat left the room'), `popups when Ben left and came back, none for Cat's reconnect: ${JSON.stringify(popups)}`);
    const sounds = await ana.evaluate(() => lpc.played());
    assert(sounds.includes('leave') && sounds.filter((t) => t === 'join').length === 2, `chimes when Ben left and Ben and Cat joined: ${sounds}`);

    // locking the room: Ana, the host, locks it; Fay, who only has the code, is turned away until she types the password
    assert(await ana.isVisible('#lockBtn') && await ben.isHidden('#lockBtn'), 'only the host can lock');
    await ana.click('#lockBtn');
    const KEY = await ana.evaluate(() => lpc.key());
    assert(/^[a-z]{6}$/.test(KEY) && (await ana.evaluate(() => location.hash)) === `#${ROOM}.${KEY}`, `a password, in the invite link: ${KEY}`);
    await waitFor(ben, (k) => lpc.key() === k && document.getElementById('lockNote').textContent.includes(k.toUpperCase()), KEY, 'Ben told the password');
    await waitFor(cat, (k) => lpc.key() === k, KEY, 'Cat told the password');
    const fay = await player(browser, 'Fay', [1920, 1080], { denoise: true });
    await fay.goto(`${URL_}#${ROOM}`);
    await fay.click('#joinBtn');
    await waitFor(fay, () => lpc.slot() < 0 && !document.getElementById('key').hidden && /is locked/.test(document.getElementById('msg').textContent), null, 'Fay turned away');
    assert.strictEqual((await others(ana)).length, 2, 'Fay never showed up for Ana');
    await fay.fill('#key', KEY.toUpperCase());
    await fay.click('#joinBtn');
    await hears(fay, ['Ana', 'Ben', 'Cat'], null, 'Fay in with the password');
    await hears(ana, ['Ben', 'Cat', 'Fay'], null, 'Ana hears Fay');
    await waitFor(ana, () => lpc.inGame().includes('Fay'), null, 'Fay in the game Ana is playing (checked once a second)');
    assert(await fay.evaluate(() => lpc.denoise()), 'Fay\'s smart noise removal is on');
    // the host removes Fay: everyone left gets a new password, so Fay's old one stops working
    const fayRec = (await others(ana)).find((p) => p.name === 'Fay');
    ana.once('dialog', (d) => d.accept());
    await ana.click(`#players .player[data-slot="${fayRec.slot}"] .kick`);
    await waitFor(fay, () => lpc.slot() < 0 && /removed you/.test(document.getElementById('msg').textContent), null, 'Fay told she was removed');
    await hears(ana, ['Ben', 'Cat'], null, 'Fay gone for Ana');
    await hears(ben, ['Ana', 'Cat'], null, 'Fay gone for Ben');
    const KEY2 = await ana.evaluate(() => lpc.key());
    assert(KEY2 !== KEY && (await ben.evaluate(() => lpc.key())) === KEY2 && (await cat.evaluate(() => lpc.key())) === KEY2, 'a new password for everyone left');
    assert.strictEqual(await fay.inputValue('#key'), KEY, 'the old password still filled in for Fay');
    await fay.click('#joinBtn');
    await waitFor(fay, () => lpc.slot() < 0 && /wrong or out of date/.test(document.getElementById('msg').textContent), null, 'Fay\'s old password turned away');
    assert.strictEqual((await others(ana)).length, 2, 'Fay stayed out: ' + JSON.stringify(await others(ana)));
    await fay.context().close();
    console.log(`room lock: password ${KEY}; Fay kept out without it, let in with it, removed, and the old password stopped working`);

    // game modes: only the host (Ana) picks; everyone gets it
    assert(await ben.$eval('#modeSel', (el) => el.disabled) && !(await ana.$eval('#modeSel', (el) => el.disabled)), 'only the host picks the mode');
    await ana.selectOption('#modeSel', 'gibberish');
    for (const p of [ben, cat]) await waitFor(p, () => lpc.mode().mode === 'gibberish' && lpc.toasts().includes('Game mode: Gibberish'), null, 'the mode sent to everyone');
    // Gibberish: Ben on the other team comes out scrambled (speech inversion: a 500 Hz tone comes out at 2,900 Hz)
    for (const p of [ben, cat]) await p.$eval('#optCompact', (el) => { el.checked = false; el.dispatchEvent(new Event('change')); });
    // Cat shares a minimap next to Ana, Ben one across the map
    await cat.evaluate(() => setBox(0.4, 0.6));
    await cat.click('#shareBtn');
    await ben.evaluate(() => setBox(0.85, 0.15));
    await ben.click('#shareBtn');
    for (const p of [ana, ben, cat]) await waitFor(p, () => lpc.me().fresh, null, 'everyone tracked');
    await ana.evaluate((g) => lpc.league(g), team('ORDER'));
    await ben.evaluate((g) => lpc.league(g), team('CHAOS'));
    await cat.evaluate((g) => lpc.league(g), team('ORDER'));
    await waitFor(ana, () => { const ps = lpc.peers(); return ps.find((p) => p.name === 'Ben').scrambled && !ps.find((p) => p.name === 'Cat').scrambled; }, null, 'Ben scrambled for Ana, Cat not');
    await waitFor(ben, () => lpc.peers().every((p) => p.scrambled), null, 'Ana and Cat scrambled for Ben');
    assert(/Other team, scrambled/.test(await ana.textContent(`#players .player[data-slot="1"] .pstate`)), 'Ben\'s card says scrambled');
    const [s500, s2900, s3900] = await ana.evaluate(() => lpc.tone('scramble', 500, 0, [500, 2900, 3900]));
    console.log(`Gibberish: a 500 Hz tone comes out at 2,900 Hz (${s2900.toFixed(3)}), with ${s3900.toFixed(3)} at 3,900 and ${s500.toFixed(4)} left at 500`);
    assert(s2900 > 0.2 && s2900 > 1.5 * s3900 && s500 < 0.01, 'speech inversion');
    // who can hear Ana: her teammate Cat, close by; Ben, on the other team, is left out
    assert.deepStrictEqual(await ana.evaluate(() => lpc.hearMe()), ['Cat'], 'Cat can hear Ana, Ben isn\'t listed');
    await waitFor(ana, () => document.getElementById('hearMe').textContent === 'Can hear you now: Cat.', null, 'who can hear Ana on her page');
    for (const p of [ana, ben, cat]) await p.evaluate(() => lpc.league(null));

    // Voice swap: every voice comes from someone else's spot
    await hears(ana, ['Ben', 'Cat'], null, 'Ana hears both before the swap');
    await waitFor(ana, () => JSON.stringify(lpc.peers().map((p) => [p.name, p.vol]).sort()) === '[["Ben",0],["Cat",1]]', null, 'Classic: Ben far (silent), Cat close');
    await ana.selectOption('#modeSel', 'swap');
    const pages = [ana, ben, cat];
    for (const p of pages) await waitFor(p, () => lpc.swap().on && lpc.swap().n >= 1, null, 'a voice swap shuffle');
    const sw1 = await ana.evaluate(() => lpc.swap());
    assert(Object.entries(sw1.map).length === 3 && Object.entries(sw1.map).every(([k, v]) => +k !== v), `nobody keeps their own spot: ${JSON.stringify(sw1.map)}`);
    for (const p of [ben, cat]) assert.deepStrictEqual((await p.evaluate(() => lpc.swap())).map, sw1.map, 'the same shuffle for everyone');
    // what each page should hear: each voice at the spot the shuffle gave it, full volume close by, silent far away
    const at = await Promise.all(pages.map((p) => p.evaluate(() => ({ slot: lpc.slot(), x: lpc.me().x, y: lpc.me().y }))));
    const posOf = (s) => at.find((a) => a.slot === s);
    for (const [i, p] of pages.entries()) {
      await waitFor(p, ([mine, all, map, MAP]) => lpc.peers().every((q) => {
        const spot = all.find((a) => a.slot === map[q.slot]), d = Math.hypot(spot.x - mine.x, spot.y - mine.y) * MAP;
        return q.spot === map[q.slot] && Math.abs(q.vol - (d < 800 ? 1 : d > 1200 ? 0 : q.vol)) < 0.02;
      }), [at[i], at, sw1.map, MAP], 'volumes from the swapped spots');
    }
    console.log(`voice swap: spots ${JSON.stringify(sw1.map)}; Ana hears ${JSON.stringify((await others(ana)).map((p) => [p.name, p.vol]))}`);
    // disguise: each voice pitched up or down a little, as the shuffle says
    const benPitch = (await ben.evaluate(() => lpc.fx().mix.pitch));
    assert(Math.abs(benPitch - sw1.pitch[1]) < 0.001 && Math.abs(benPitch - 1) > 0.05, `Ben's voice disguised: ${benPitch}`);
    // who can hear Ana: whoever sits at the spot her voice comes from (the other one is far from it)
    assert.deepStrictEqual(await ana.evaluate(() => lpc.hearMe()), [sw1.map[0] === 1 ? 'Ben' : 'Cat'], 'who can hear Ana in voice swap');
    // a death reshuffles (once 10 s have passed since the last), with a reveal of who was behind each spot
    await cat.evaluate(() => lpc.league({ inGame: true, room: '', mode: 'CLASSIC', me: { champ: '', champName: '', team: '', dead: true } }));
    await waitFor(ben, (n) => lpc.swap().n > n, sw1.n, 'a reshuffle when Cat died', 20000);
    await waitFor(ben, () => lpc.toasts().some((t) => t.startsWith('Voice swap reveal:') && /spot was (Ana|Cat)/.test(t)), null, 'the reveal on Ben\'s page');
    console.log(`swap on deaths: ${JSON.stringify((await ben.evaluate(() => lpc.toasts())).filter((t) => t.startsWith('Voice swap reveal')).pop())}`);
    await cat.evaluate(() => lpc.league(null));
    // the warning: a chime and a countdown 10 s before a timed reshuffle
    const n2 = (await ana.evaluate(() => lpc.swap())).n;
    for (const p of pages) await p.evaluate(() => lpc.swapSoon(11500));
    await waitFor(ben, () => lpc.played().includes('swap') && /Next reshuffle in 0:(0\d|1[01])/.test(document.getElementById('modeNote').textContent), null, 'the warning chime and countdown');
    await waitFor(ben, (n) => lpc.swap().n > n, n2, 'the timed reshuffle', 20000);
    console.log('voice swap: shuffled, disguised, warned, reshuffled on a death and on time, with reveals');
    // own team / other team: as many spots as possible on that side, nobody on their own
    const checks = await ana.evaluate(() => {
      const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], team = (s) => (s < 5 ? 'ORDER' : 'CHAOS'), out = {};
      for (const want of ['any', 'team', 'other']) out[want] = Array.from({ length: 20 }, () => lpc.shuffleSpots(all, team, want)).every((m) => all.every((s) => m[s] !== s
        && (want === 'any' || (team(m[s]) === team(s)) === (want === 'team'))) && new Set(Object.values(m)).size === 10);
      return out;
    });
    assert.deepStrictEqual(checks, { any: true, team: true, other: true }, 'team swaps');
    await ana.selectOption('#modeSel', 'classic');
    await waitFor(ana, () => !lpc.swap().on && lpc.peers().find((p) => p.name === 'Ben').vol === 0, null, 'Classic again: Ben far away and silent');

    // ready check: Ana sees everyone's setup; the others get a popup
    await ana.click('#readyBtn');
    await waitFor(ana, () => document.querySelectorAll('#readyRows tr').length === 3 && [...document.querySelectorAll('#readyRows tr')].every((r) => r.children.length === 6), null, 'the ready check table');
    const rows = await ana.$$eval('#readyRows tr', (rs) => rs.map((r) => [...r.children].map((c) => c.textContent.trim())));
    console.log(`ready check: ${JSON.stringify(rows)}`);
    assert.deepStrictEqual(rows[0], ['Ana (you)', 'Working', 'Shared', 'Found', 'Browser', '—'], 'Ana\'s own row');
    assert(rows.some((r) => r[0] === 'Ben' && r[2] === 'Shared' && r[3] === 'Found'), 'Ben\'s row');
    await waitFor(ben, () => lpc.toasts().includes('Ana started a ready check'), null, 'the ready check popup for Ben');
    await ana.click('#readyClose');
    // help a friend: what's wrong with Ben's setup, from Ana's card for Ben
    await ana.click(`#players .player[data-slot="1"] .help`);
    await waitFor(ana, () => document.getElementById('helpDlg').open && document.getElementById('helpTitle').textContent === 'Help Ben', null, 'the help for Ben');
    const help = await ana.$$eval('#helpList li', (l) => l.map((li) => [li.querySelector('.dot').dataset.h, li.textContent]));
    console.log(`help a friend: ${JSON.stringify(help)}`);
    assert(help.some(([h, t]) => h === 'good' && /^Voice connection is good/.test(t)) && help.some(([h, t]) => h === 'good' && t === 'Their mic picks up sound.')
      && help.some(([h, t]) => h === 'good' && t === 'Their minimap is found.') && help.some(([, t]) => /They use the website/.test(t)), 'Ben’s setup');
    await ana.click('#helpAsk');
    await ana.click('#helpClose');
    for (const p of [ben, cat]) await p.click('#shareBtn'); // stop sharing

    // room games, started by the host (Ana) and the same on every page: balanced teams (nobody's rank is known in a
    // browser), role roulette, the queue quiz and a mock draft
    const trio = [ana, ben, cat], bySlot = Object.fromEntries(await Promise.all(trio.map(async (p) => [await p.evaluate(() => lpc.slot()), p])));
    assert(await ben.$eval('#teamsBtn', (b) => b.disabled) && (await ben.textContent('#gamesNote')) === 'The host starts these.', 'only the host starts room games');
    await ana.click('#teamsBtn');
    for (const p of trio) await waitFor(p, () => lpc.teams().n === 1 && !document.getElementById('teamsBox').hidden, null, 'the teams on every page');
    const tms = await Promise.all(trio.map((p) => p.evaluate(() => lpc.teams())));
    assert(tms.every((t) => JSON.stringify(t) === JSON.stringify(tms[0])) && [tms[0].a.length, tms[0].b.length].sort().join() === '1,2' && [...tms[0].a, ...tms[0].b].sort().join() === '0,1,2', `two teams, the same for everyone: ${JSON.stringify(tms)}`);
    assert(/^Team 1[\s\S]*rank not knownTeam 2[\s\S]*rank not known$/.test(await ana.textContent('#teamsBox')), 'no ranks in a browser');
    // the most even splits: of these ten, the best leaves 45 between the teams, so every split must, and not always the same one
    const fair = await ana.evaluate(() => {
      const rs = [1445, 0, 3800, 1200, 1200, 800, 2000, 1600, 400, 2400], all = rs.reduce((a, b) => a + b, 0), runs = Array.from({ length: 20 }, () => lpc.split(rs));
      return { ok: runs.every(([a, b]) => a.length === 5 && b.length === 5 && Math.abs(all - 2 * a.reduce((s, i) => s + rs[i], 0)) === 45), kinds: new Set(runs.map((r) => JSON.stringify(r))).size };
    });
    assert(fair.ok && fair.kinds > 1, `even teams: ${JSON.stringify(fair)}`);
    assert.deepStrictEqual(await ana.evaluate(() => lpc.split([1000, null, 3000])), [[2], [0, 1]], 'an unknown rank counts as the average');
    assert.deepStrictEqual(await ana.evaluate(() => [['GOLD', 'II', 45], ['IRON', 'IV', 0], ['MASTER', '', 120], null].map((r) => lpc.rating(r))), [1445, 0, 2920, null], 'ranks as numbers');
    await ana.click('#rolesBtn');
    for (const p of trio) await waitFor(p, () => /^Your role: (Top|Jungle|Middle|Bottom|Support)\.$/.test(document.getElementById('rolesMine').textContent), null, 'a role on every page');
    const rls = await Promise.all(trio.map((p) => p.evaluate(() => lpc.roles())));
    const duo = tms[0].a.length === 2 ? tms[0].a : tms[0].b;
    assert(rls.every((r) => JSON.stringify(r) === JSON.stringify(rls[0])) && Object.keys(rls[0].map).length === 3 && rls[0].map[duo[0]] !== rls[0].map[duo[1]], `roles, different within a team: ${JSON.stringify(rls)}`);
    await waitFor(ben, (r) => lpc.toasts().includes(`Role roulette: you’re ${r}.`), POS[rls[0].map[1]], 'Ben told which role');
    assert(await ben.isHidden('#rolesSet'), 'no League lobby to set it in, in a browser');
    console.log(`room games: teams ${JSON.stringify(tms[0])}, roles ${JSON.stringify(rls[0].map)}`);
    // the queue quiz: Ana and Cat get it right, Ben doesn't
    await ana.click('#quizBtn');
    for (const p of trio) await waitFor(p, () => lpc.qv() && lpc.qv().i === 0 && document.querySelectorAll('#quizOpts button').length === 4, null, 'the first question on every page');
    const asked = await Promise.all(trio.map((p) => p.evaluate(() => { const q = lpc.qv(); return JSON.stringify([q.n, q.of, q.q, q.img, q.opts]); })));
    assert(asked.every((q) => q === asked[0]), `the same question for everyone: ${asked}`);
    const right = (await ana.evaluate(() => lpc.quiz())).right, wrong = (right + 1) % 4;
    for (const [p, a] of [[ana, right], [cat, right], [ben, wrong]]) await p.click(`#quizOpts button:nth-child(${a + 1})`);
    for (const p of trio) await waitFor(p, (r) => lpc.qv().right === r && document.querySelector(`#quizOpts button:nth-child(${r + 1})`).dataset.s === 'right', right, 'the right answer shown');
    assert.strictEqual(await ben.$eval(`#quizOpts button:nth-child(${wrong + 1})`, (b) => b.dataset.s), 'wrong', 'Ben\'s answer marked wrong');
    const sc = await ben.evaluate(() => lpc.qv().scores);
    assert(sc[0] > 100 && sc[2] > 100 && !sc[1], `100 and a bit for speed: ${JSON.stringify(sc)}`);
    assert.match(await ben.textContent('#quizHead'), /^Question 1 of 10: right: (Ana, Cat|Cat, Ana)\.$/);
    console.log(`queue quiz: "${JSON.parse(asked[0])[2]}" scored ${JSON.stringify(sc)}`);
    for (const p of trio) await waitFor(p, () => lpc.qv().i === 1 && lpc.qv().right < 0, null, 'the next question', 10000);
    await ana.click('#quizStop');
    for (const p of trio) await waitFor(p, () => document.getElementById('quizHead').textContent === 'Quiz over. The host ended it.' && !document.getElementById('quizClose').hidden, null, 'the quiz over on every page');
    assert.strictEqual(await ben.$eval('#quizScores li:last-child', (l) => l.textContent), 'Ben (you): 0');
    await waitFor(ben, () => lpc.toasts().some((t) => /^(Ana|Cat) won the queue quiz with \d+ points\.$/.test(t)), null, 'who won, on Ben\'s page');
    for (const p of trio) await p.click('#quizClose');
    // the mock draft: blue and red are the balanced teams; whoever's turn it is chooses, the host's clock does the rest
    await ana.click('#draftBtn');
    for (const p of trio) await waitFor(p, () => lpc.dv() && document.querySelectorAll('#draftGrid button').length === 22, null, 'the draft with every champion');
    const dv0 = await ana.evaluate(() => lpc.dv()), blue = bySlot[dv0.blue[0]], red = bySlot[dv0.red[0]];
    assert.deepStrictEqual([dv0.blue, dv0.red], [tms[0].a, tms[0].b], 'the balanced teams draft');
    assert.match(await blue.textContent('#draftHead'), /^Blue side bans: \d+ s left\. Your turn: choose below\.$/);
    assert(!/Your turn/.test(await red.textContent('#draftHead')) && await red.$eval('#draftGrid button[data-c="Zed"]', (b) => b.disabled), 'red waits');
    await blue.click('#draftGrid button[data-c="Zed"]');
    for (const p of trio) await waitFor(p, () => lpc.dv().step === 1 && document.querySelector('#draftGrid button[data-c="Zed"]').dataset.taken === '1', null, 'Zed banned on every page');
    await red.fill('#draftFind', 'ah');
    assert.deepStrictEqual(await red.$$eval('#draftGrid button:not([hidden])', (l) => l.map((b) => b.dataset.c)), ['Ahri'], 'finding a champion');
    await red.click('#draftGrid button[data-c="Ahri"]');
    for (const p of trio) await waitFor(p, () => lpc.dv().step === 2, null, 'Ahri banned');
    for (let i = 0; i < 18; i++) await ana.evaluate(() => lpc.draftNow());
    for (const p of trio) await waitFor(p, () => document.getElementById('draftHead').textContent === 'Draft done.' && document.getElementById('draftPicker').hidden, null, 'the draft done on every page');
    const acts = (await ben.evaluate(() => lpc.dv())).acts, picks = acts.filter((_, i) => !(i < 6 || (i >= 12 && i < 16)));
    assert(acts.length === 20 && acts[0] === 'Zed' && acts[1] === 'Ahri' && [2, 3, 4, 5, 12, 13, 14, 15].every((i) => acts[i] === '') && new Set(picks).size === 10 && picks.every((c) => c && c !== 'Zed' && c !== 'Ahri'), `bans nobody made skipped, picks nobody made random: ${acts}`);
    assert.strictEqual(await ben.$$eval('#draftBoard img', (l) => l.length), 12, 'two bans and ten picks on the board');
    console.log(`mock draft: ${acts.map((c) => c || '-').join(' ')}`);
    // the host's button just closes a finished draft; a new one the host ends ends for everyone
    assert.strictEqual(await ana.textContent('#draftStop'), 'Close');
    await ana.click('#draftAgain');
    for (const p of trio) await waitFor(p, (n) => lpc.dv() && lpc.dv().n !== n && lpc.dv().step === 0, dv0.n, 'a new draft');
    assert.strictEqual(await red.inputValue('#draftFind'), '', 'the search cleared for a new draft');
    await ana.click('#draftStop');
    await waitFor(ben, () => document.getElementById('draftHead').textContent === 'The host ended the draft.', null, 'the draft ended for Ben');
    assert(await ana.isHidden('#draftBox'), 'and closed for Ana');
    for (const p of [ben, cat]) await p.click('#draftStop');

    // compact view, light theme and a help tip
    await ana.click('#compactBtn');
    assert(await ana.isVisible('#chips') && await ana.$$eval('#chips .chip', (c) => c.length) === 2 && await ana.isHidden('main'), 'compact strip with a chip per player');
    await shot(ana, 'ana-compact');
    await ana.click('#compactBtn');
    assert(await ana.isVisible('main'), 'full view again');
    await ana.context().route('**/riot/summary', (r) => r.fulfill({ json: { p: '15.20', c: {}, old: null, today: 12, total: 3456, at: 0, from: Date.UTC(2025, 9, 20) / 1000 }, headers: { 'access-control-allow-origin': '*' } })); // and the Riot games it counted
    await ana.click('.nav[data-view="settings"]');
    await ana.waitForSelector('#serverBox', { state: 'visible' });
    assert.strictEqual(await ana.textContent('#serverToday'), 'Today: 3 players in 2 rooms. Busiest day of the last two weeks: 7 players.');
    await ana.waitForSelector('#serverRiot', { state: 'visible' });
    assert.strictEqual(await ana.textContent('#serverRiot'), 'High elo games counted from Riot: 3,456, 12 games today, patch 25.20, going back to October 20, 2025. Matchups use all of them, and runes, builds and skill orders the recent ones (older ones are out of date).');
    assert.deepStrictEqual(await ana.$$eval('#serverChart g', (g) => [g.length, g.filter((x) => x.querySelector('.bar')).length, g[11].querySelector('title').textContent.endsWith(': 7 players in 3 rooms')]), [14, 2, true], 'a bar for each day with players');
    // themes: red and black by default, Light, your own main colour, Light with the computer's light mode
    const look = (...ks) => ana.evaluate((ks) => { const c = getComputedStyle(document.documentElement); return ks.map((k) => c.getPropertyValue('--' + k).trim()); }, ks);
    assert.deepStrictEqual([await ana.evaluate(() => document.documentElement.dataset.theme), ...await look('bg', 'accent')], ['red', '#0b0809', '#d9202d'], 'red and black at first');
    assert.strictEqual(await ana.$$eval('.sw', (l) => l.map((e) => getComputedStyle(e).backgroundColor).join(' ')), 'rgb(11, 8, 9) rgb(1, 10, 19) rgb(242, 238, 228) rgb(12, 9, 19) rgb(7, 16, 13) rgb(0, 0, 0)', 'each theme’s card in its own colours');
    await shot(ana, 'ana-settings-red');
    await ana.$eval('#optMain', (el) => { el.value = '#0000ff'; el.dispatchEvent(new Event('input')); });
    const [accent, accentFg, gold, link, ...backs] = await look('accent', 'accent-fg', 'gold', 'link', 'bg', 'panel', 'raised');
    assert(accent === '#0000ff' && accentFg === '#ffffff' && link === gold && gold !== accent && backs.every((b) => contrast(gold, b) >= 4.5), `a dark blue of your own, its trim lightened to read on the page: ${[accent, accentFg, gold]}`);
    await ana.$eval('#optMain', (el) => { el.value = '#ffd700'; el.dispatchEvent(new Event('input')); });
    assert.deepStrictEqual(await look('accent', 'accent-fg', 'gold'), ['#ffd700', '#000000', '#ffd700'], 'gold of your own: black text on its buttons, and readable as it is');
    assert(await ana.isVisible('#mainReset'));
    await ana.click('#mainReset');
    assert.deepStrictEqual([...await look('accent', 'gold'), await ana.inputValue('#optMain'), await ana.isHidden('#mainReset')], ['#d9202d', '#ff4f5a', '#d9202d', true], 'the theme’s own colour again');
    await ana.check('#optThemeAuto'); // Playwright's pages are in light mode unless told otherwise
    assert.strictEqual(await ana.evaluate(() => document.documentElement.dataset.theme), 'light', 'Light while the computer is in light mode');
    await ana.emulateMedia({ colorScheme: 'dark' });
    await waitFor(ana, () => document.documentElement.dataset.theme === 'red', null, 'red and black again in dark mode');
    await ana.uncheck('#optThemeAuto');
    await ana.emulateMedia({ colorScheme: null });
    await ana.check('input[name="theme"][value="light"]');
    assert.strictEqual(await ana.evaluate(() => document.documentElement.dataset.theme), 'light');
    await shot(ana, 'ana-settings-light');
    await ana.click('.nav[data-view="voice"]');
    await ana.click('#voiceSet > summary');
    await ana.click('.tip[popovertarget="t-gate"]');
    assert(await ana.evaluate(() => document.getElementById('t-gate').matches(':popover-open')), 'help tip opens');
    await ana.keyboard.press('Escape');
    await shot(ana, 'ana-voice-light');
    await ana.click('#voiceSet > summary');
    await ana.click('.nav[data-view="settings"]');
    await ana.check('input[name="theme"][value="red"]');
    await ana.click('.nav[data-view="voice"]');
    console.log('compact view, themes and help tips');

    // game history: the game Ana has been in since her minimap was tracked
    await ana.evaluate(() => lpc.endGame());
    const games = await ana.evaluate(() => lpc.games());
    assert(games.length === 1 && games[0].me.name === 'Ana' && games[0].me.talk > 0 && games[0].map.startsWith('data:image/jpeg'), 'a game saved');
    assert.deepStrictEqual(games[0].players.map((p) => p.name).sort(), ['Ben', 'Cat', 'Fay'], 'with who was in voice: ' + JSON.stringify({ ...games[0], map: 0 }));
    // room awards: who talked most and least (no scoreboard in a browser); the record's talk is rounded, so near ties go either way
    const ppl = [games[0].me, ...games[0].players], most = Math.max(...ppl.map((e) => e.talk)), least = Math.min(...ppl.map((e) => e.talk));
    const near = (v) => ppl.filter((e) => Math.abs(e.talk - v) <= 0.1).map((e) => e.name), want = [...(most >= 30 ? ['Chatterbox'] : []), 'Quiet one'], aw = games[0].awards;
    assert(aw.length === want.length && aw.every(([t, n], i) => t === want[i] && near(t === 'Chatterbox' ? most : least).includes(n)), `room awards: ${JSON.stringify(aw)}, talk ${JSON.stringify(ppl)}`);
    assert(await ana.$eval('#awardsBox', (el) => !el.hidden) && (await ana.$$eval('#awardsList li', (l) => l.length)) === aw.length, 'the awards on the Room page');
    assert((await ana.evaluate(() => lpc.toasts())).some((t) => t.startsWith('Room awards: ')), 'and a popup');
    await ana.click('.nav[data-view="stats"]');
    await ana.click('#games summary');
    assert(await ana.isVisible('#games img'), 'game history lists it with its talk map');
    assert.strictEqual(await ana.$$eval('#games > li:first-child .awards li', (l) => l.length), aw.length, 'with its awards');
    await shot(ana, 'ana-stats');
    console.log(`game history: ${JSON.stringify({ ...games[0], map: games[0].map.length + ' bytes' })}`);

    // League's own data (Windows client): it never moves you out of a room you joined yourself...
    await ana.evaluate((room) => lpc.league({ inGame: true, room, mode: 'CLASSIC', me: { champ: 'Testchamp', champName: 'Test Champ', team: 'ORDER' }, players: [] }), GAME_ROOM);
    await ana.waitForTimeout(500);
    assert.strictEqual(await ana.evaluate(() => lpc.room()), ROOM, 'Ana stays in the room she created');
    await ana.evaluate(() => lpc.league(null));

    // ...and two players who aren't in a room land in their game's room by themselves
    const game = (champ, team, dead = false) => ({ inGame: true, room: GAME_ROOM, mode: 'CLASSIC', me: { champ, champName: champ, team, dead }, players: [] });
    const dee = await player(browser, 'Dee', [1920, 1080], { client: true });
    const eve = await player(browser, 'Eve', [1920, 1080], { client: 'modern' });
    for (const p of [dee, eve]) await p.context().route('**/latest.yml', (r) => r.fulfill({ body: 'version: 1.7.0\n', contentType: 'text/yaml' })); // the newest app
    await dee.goto(URL_);
    await eve.goto(URL_ + '&discord=123456789012345678');
    await dee.evaluate(() => setBox(0.4, 0.6));
    await dee.click('.nav[data-view="voice"]');
    await dee.evaluate(() => document.getElementById('shareBtn').click());
    // League status before the game: where Eve is in League's client
    await eve.evaluate(() => lpc.league({ inGame: false, phase: 'ChampSelect' }));
    await waitFor(eve, () => document.getElementById('statusRows').textContent === 'Eve (you)In champ select' && document.getElementById('sbLeague').textContent === 'League: in champ select', null, 'champ select on Eve\'s status window');
    await eve.evaluate(() => lpc.league({ inGame: false, phase: 'InProgress' }));
    await waitFor(eve, () => /Loading into the game/.test(document.getElementById('statusRows').textContent) && document.getElementById('phase').dataset.game === '1', null, 'loading: the game has started for Eve');
    console.log('League status: champ select, then loading into the game');
    await dee.evaluate((g) => lpc.league(g), game('Testchamp', 'ORDER'));
    await eve.evaluate((g) => lpc.league(g), game('Annie', 'ORDER', true));
    await eve.evaluate(() => setBox(0.41, 0.6)); // next to Dee, so they hear each other in the game
    await eve.evaluate(() => document.getElementById('shareBtn').click());
    await waitFor(dee, (r) => lpc.room() === r && lpc.slot() >= 0, GAME_ROOM, 'Dee in the game\'s room');
    await waitFor(eve, (r) => lpc.room() === r && lpc.slot() >= 0, GAME_ROOM, 'Eve in the game\'s room');
    await hears(dee, ['Eve'], null, 'Dee hears Eve');
    await hears(eve, ['Dee'], null, 'Eve hears Dee');
    console.log('League data: Dee and Eve joined their game\'s room by themselves');
    // the version check: each hears once that the other's app is out of date, and sees their own version
    await waitFor(eve, () => lpc.toasts().includes('Dee has a very old version of the app: they need the installer from the site.'), null, 'Eve told Dee’s app is old');
    await waitFor(dee, () => lpc.toasts().includes('Eve has app 1.5.0, and 1.7.0 is out: restarting the app installs it.'), null, 'Dee told Eve’s app is out of date');
    assert.strictEqual(await eve.textContent('#sbVersion'), 'App 1.5.0 (1.7.0 is out)');
    assert.strictEqual(await ana.textContent('#sbVersion'), 'Website');
    console.log('version check: old apps in the room, and your own version in the status bar');
    // League says Dee plays Test Champ, so Dee's icon is found without the camera teaching it
    await waitFor(dee, () => lpc.me().by === 'icon', null, 'Dee\'s icon found from League\'s champion');
    await waitFor(eve, () => { const p = lpc.peers()[0]; return p && p.champ === 'Testchamp' && p.team === 'ORDER'; }, null, 'Eve sees Dee\'s champion and team');
    await waitFor(dee, () => { const p = lpc.peers()[0]; return p && p.dead && p.team === 'ORDER'; }, null, 'Dee sees Eve is dead, on Dee\'s team');
    assert.strictEqual(await dee.getAttribute('.player', 'data-team'), 'ally');
    console.log('League data: champion found by name, team and deaths on the cards');
    // the overlay shows who's talking, and the window went compact for the game
    await waitFor(dee, () => lpcClient.calls.some(([k, s]) => k === 'overlay' && s.visible && s.talkers.some((t) => t.name === 'Eve')), null, 'Eve on Dee\'s overlay while talking');
    assert(await dee.evaluate(() => lpcClient.calls.some(([k, h]) => k === 'compact' && h > 0)), 'compact view when the game started');
    await shot(dee, 'dee-compact');
    // the client's shortcuts arrive as key events
    await dee.evaluate(() => lpcClient.emit('key', 'mute'));
    assert(!(await dee.evaluate(() => lpc.micOn())), 'mute shortcut from the client');
    const muted = await dee.evaluate(() => lpcClient.calls.filter(([k]) => k === 'overlay').pop()[1]);
    assert(muted.muted === true, 'overlay shows you\'re muted');
    assert.deepStrictEqual([muted.theme.bg, muted.theme.gold, muted.theme.talk], ['#0b0809', '#ff4f5a', '#ffffff'], 'the overlay in red and black too');
    await dee.evaluate(() => lpcClient.emit('key', 'mute'));

    // hurt voice: rough and shaky as Dee's health drops
    await dee.evaluate((g) => lpc.league({ ...g, me: { ...g.me, hp: 0.2 } }), game('Testchamp', 'ORDER'));
    assert(Math.abs(await dee.evaluate(() => lpc.hurt()) - 0.5) < 0.01, 'half hurt at 20% health');
    await dee.evaluate((g) => lpc.league(g), game('Testchamp', 'ORDER'));
    assert.strictEqual(await dee.evaluate(() => lpc.hurt()), 0, 'not hurt at full health');

    // moving and sizing the overlay
    const lastOverlay = () => dee.evaluate(() => lpcClient.calls.filter(([k]) => k === 'overlay').pop()[1]);
    await dee.evaluate(() => document.getElementById('moveBtn').click());
    assert((await lastOverlay()).edit === true, 'overlay in move mode');
    await dee.evaluate(() => lpcClient.emit('overlay-moved', { x: 0.5, y: 0.25 }));
    let ov = await lastOverlay();
    assert(ov.pos === 'custom' && ov.box.x === 0.5 && ov.box.y === 0.25 && (await dee.inputValue('#optPos')) === 'custom', `dragged: ${JSON.stringify(ov)}`);
    await dee.$eval('#optScale', (el) => { el.value = 1.5; el.dispatchEvent(new Event('input')); });
    await dee.evaluate(() => lpcClient.emit('overlay-moved', { done: true }));
    ov = await lastOverlay();
    assert(ov.scale === 1.5 && !ov.edit && (await dee.textContent('#moveBtn')) === 'Move it', `bigger, and done from the overlay's own button: ${JSON.stringify(ov)}`);
    console.log('hurt voice; the overlay moved and resized');

    // Chaos (Legends, Immersive and Gibberish) from League's game data: Dee's own voice changes for everyone
    const host = (await dee.evaluate(() => lpc.slot())) === 0 ? dee : eve;
    await host.$eval('#modeSel', (el) => { el.value = 'chaos'; el.dispatchEvent(new Event('change')); });
    for (const p of [dee, eve]) await waitFor(p, () => lpc.mode().mode === 'chaos', null, 'Chaos mode');
    const ev = (e, t, more) => ({ e, t, team: 'ORDER', me: false, alive: true, ...more });
    const big = [ev('dragon', 300, { type: 'Water' }), ev('dragon', 500, { type: 'Water' }), ev('dragon', 700, { type: 'Water' }), ev('dragon', 900, { type: 'Water' }),
      ev('kill', 950, { me: true, on: false }), ev('kill', 960, { me: true, on: false }), ev('dragon', 980, { type: 'Water', me: true, stolen: true, team: 'ORDER' }),
      ev('baron', 990), ev('ace', 998)];
    const legend = (more, me) => ({ ...game('Testchamp', 'ORDER'), t: 1000, events: big, ...more, me: { ...game('Testchamp', 'ORDER').me, speed: 600, ...me } });
    await dee.evaluate((g) => lpc.league(g), legend());
    const fxOn = (p) => p.evaluate(() => lpc.fx());
    let f = await fxOn(dee);
    assert.deepStrictEqual(f.on, ['ocean', 'spree2', 'baron', 'steal', 'speed', 'ace'], `Ocean soul, a killing spree, Baron, a steal, speed and an Ace: ${JSON.stringify(f)}`);
    assert(Math.abs(f.mix.pitch - 0.8 * 0.95) < 0.001 && f.mix.mod[3] === 0.75 && f.mix.echo[0] === 0.3, `deep (Baron and the spree), the whoosh over the soul's water, the Ace's stadium echo: ${JSON.stringify(f.mix)}`);
    await waitFor(eve, () => /Ocean soul \+ Killing spree \+ Baron \+ Steal \+ Speed \+ Ace voice/.test(document.querySelector('.player .pstate').textContent), null, 'Dee\'s voice effects on Eve\'s card');
    await waitFor(dee, () => /^Dee \(you\)In game · 16 minEveIn game/.test(document.getElementById('statusRows').textContent), null, 'in game on Dee\'s status window, with League\'s clock');
    const [p160, p200] = await dee.evaluate(() => lpc.tone('pitch', 200, 0.8, [160, 200]));
    console.log(`pitch shift: a 200 Hz tone at 0.8 comes out at 160 Hz (${p160.toFixed(3)}), ${p200.toFixed(3)} left at 200`);
    assert(p160 > 0.3 && p160 > 5 * p200, 'pitch shift down');
    // a multikill booms; dying ends Baron and the spree, the soul stays, and the voice turns ghostly
    await dee.evaluate((g) => lpc.league(g), legend({ events: [...big, ev('multi', 999, { me: true, n: 2 })] }));
    assert((await fxOn(dee)).on.includes('multi') && !(await fxOn(dee)).on.includes('spree2'), 'multikill boom');
    await dee.evaluate((g) => lpc.league(g), legend({ t: 1010, events: [...big, ev('kill', 1005, { on: true })] }, { dead: true }));
    f = await fxOn(dee);
    assert.deepStrictEqual(f.on, ['ocean', 'steal', 'ghost'], `dead: ${JSON.stringify(f.on)}`);
    // the river, and the result after the game
    await dee.evaluate((g) => lpc.league(g), { ...game('Testchamp', 'ORDER'), t: 1500, events: [], result: 'Win' });
    await dee.evaluate(() => setBox(0.39, 0.375));
    await waitFor(dee, () => lpc.fx().on.includes('river') && lpc.fx().on.includes('win'), null, 'river and victory voices');
    await dee.evaluate(() => setBox(0.4, 0.6));
    console.log('Legends and Immersive: Baron, soul, spree, steal, Ace, speed, multikill, ghost, river and victory voices');

    // the overlay: room chat, who can hear you and your voice's effects
    await eve.evaluate(() => { document.getElementById('chatText').value = 'gank top'; document.getElementById('chatForm').requestSubmit(); });
    await waitFor(dee, () => { const s = lpcClient.calls.filter(([k]) => k === 'overlay').pop()[1]; return s.chat.some((c) => c.name === 'Eve' && c.text === 'gank top') && s.hear && s.hear.includes('Eve') && s.fx.includes('Victory'); }, null, 'chat, who hears you and your voice on Dee\'s overlay');
    assert(!(await dee.evaluate(() => lpc.toasts().some((t) => t.includes('gank top')))), 'chat on the overlay, not as a popup');
    // voice swap's countdown on the overlay
    await host.$eval('#modeSel', (el) => { el.value = 'swap'; el.dispatchEvent(new Event('change')); });
    await waitFor(dee, () => lpc.swap().on, null, 'voice swap for Dee and Eve');
    await dee.evaluate(() => lpc.swapSoon(6000));
    await waitFor(dee, () => { const s = lpcClient.calls.filter(([k]) => k === 'overlay').pop()[1]; return s.swapIn > 0 && s.swapIn <= 6; }, null, 'the countdown on the overlay');
    // ready check with the app's window mode: Eve's app says League is in Borderless; Dee's old app can't tell
    await dee.evaluate(() => document.getElementById('readyBtn').click());
    await waitFor(dee, () => [...document.querySelectorAll('#readyRows tr')].some((r) => /Eve.*App 1\.5\.0.*Borderless/.test(r.textContent)), null, 'Eve\'s row in Dee\'s ready check');
    assert(/Old app/.test(await dee.textContent('#readyRows tr:first-child')), 'Dee\'s old app');
    await host.$eval('#modeSel', (el) => { el.value = 'classic'; el.dispatchEvent(new Event('change')); });
    await dee.evaluate((g) => lpc.league(g), game('Testchamp', 'ORDER'));
    console.log('overlay: chat, who can hear you, your voice and the swap countdown; ready check with the window mode');

    // room awards from League's scoreboard: Dee's game ends with Dee on 8/1/5 and 150 CS, Eve on 2/6/9 and 40
    const board = [{ name: 'Dee#1', team: 'ORDER', champ: 'Testchamp', champName: 'Test Champ', pos: 'MIDDLE', lvl: 11, k: 8, d: 1, a: 5, cs: 150, items: [] },
      { name: 'Eve#2', team: 'ORDER', champ: 'Annie', champName: 'Annie', pos: 'UTILITY', lvl: 9, k: 2, d: 6, a: 9, cs: 40, items: [] }];
    await dee.evaluate((g) => lpc.league(g), { ...game('Testchamp', 'ORDER'), players: board });
    await dee.waitForTimeout(1500);
    await dee.evaluate(() => lpc.endGame());
    const deeAw = (await dee.evaluate(() => lpc.games()))[0].awards;
    assert(deeAw.some(([t, n, w]) => t === 'Playmaker' && n === 'Dee' && w === '13 kills and assists') && deeAw.some(([t, n, w]) => t === 'Farmer' && n === 'Dee' && w === '150 CS') && !deeAw.some(([t]) => t === 'Survivor'), `awards from the scoreboard: ${JSON.stringify(deeAw)}`);
    await dee.evaluate((g) => lpc.league(g), game('Testchamp', 'ORDER'));
    console.log(`room awards: ${JSON.stringify(aw)} for Ana's game, ${JSON.stringify(deeAw)} for Dee's`);

    // app updates: Dee's is an old portable app, so it gets a link to the installer; Eve's installs its own
    assert(await dee.isVisible('#getNew') && await eve.isHidden('#getNew'), 'old app: link to the installer');
    assert.strictEqual(await eve.textContent('#appVersion'), '1.5.0');
    await eve.evaluate(() => lpcClient.emit('update', { version: '1.3.1' }));
    await eve.click('#restartBtn');
    assert(await eve.evaluate(() => lpcClient.calls.some(([k]) => k === 'update')), 'restart installs the update');
    // Discord status on Eve's profile: in a game as Annie, 2 in voice, no Join button for a game's room
    await waitFor(eve, () => lpcClient.calls.some(([k, s]) => k === 'discord' && s && s.clientId === '123456789012345678' && s.activity.details === 'In a game as Annie' && s.activity.party.size[0] === 2 && !s.activity.buttons), null, 'Eve\'s Discord status');
    assert(!(await eve.$eval('#discordRow', (el) => el.hidden)), 'Discord setting shown');
    await eve.$eval('#optDiscord', (el) => el.click());
    assert.strictEqual(await eve.evaluate(() => lpcClient.calls.filter(([k]) => k === 'discord').pop()[1]), null, 'turned off: cleared');
    console.log('app updates: installer link for the old app, restart for the new one; Discord status');

    await dee.evaluate(() => lpc.league(null));
    assert(await dee.evaluate(() => lpcClient.calls.filter(([k]) => k === 'compact').pop()[1] === 0 && !document.body.classList.contains('compact')), 'full view again when the game ended');

    // What's new: once for someone who had the app before this update, only what's new, then not again; never on a first launch
    const gus = await player(browser, 'Gus', [1280, 720], { setup: false });
    await gus.goto(URL_);
    assert(await gus.evaluate(() => document.getElementById('setup').open && !document.getElementById('newsDlg').open), 'a first launch: setup, not What’s new');
    await gus.evaluate(() => { localStorage.setItem('lpc-setup', '1'); localStorage.removeItem('lpc-news'); });
    await gus.reload();
    await waitFor(gus, () => document.getElementById('newsDlg').open, null, 'What’s new after an update');
    assert.deepStrictEqual(await gus.$$eval('#newsList h3', (h) => h.map((x) => x.textContent)), ['October 19: red and black, the draft, past ranks and how you played'], 'only what’s new since');
    await gus.click('#newsClose');
    await gus.reload();
    await gus.waitForFunction(() => window.lpc);
    assert(!(await gus.evaluate(() => document.getElementById('newsDlg').open)), 'not again');
    await gus.context().close();
    console.log('What’s new: once after an update, not on a first launch');
    console.log('League data: overlay, compact view and client shortcuts');
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer && peerServer.close && peerServer.close();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });

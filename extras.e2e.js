// What's new 120-122 in headless Chromium, three players in a room with a local PeerServer: a file of any size offered
// in the chat and downloaded straight to a save picker (every byte checked), a download that resumes after its
// connection broke, a file dropped on a friend's card reaching only them, pins (also for someone who joins later),
// search and the Files list, past sessions' search, screens side by side and zoomed, and who's talking in any game on the overlay (a stand-in for the desktop app 1.38, window.lpcClient). Also that the
// page's memory stays flat after three 30 MB downloads.
//   NODE_PATH=/path/to/node_modules node extras.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PORT = 8091, PEER = 9011;
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${PORT}/index.html?peer=127.0.0.1:${PEER}&debug`;
const OPEN_ROOMS = new Map();

const peerServer = PeerServer({ host: '127.0.0.1', port: PEER, path: '/' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// In the page before its scripts: a moving canvas as the screen, and a save picker whose file only keeps a checksum
// and its length (so the test's own copy doesn't count in the page's memory)
function fakes() {
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  let t = 0;
  setInterval(() => { g.fillStyle = `hsl(${(t += 7) % 360} 60% 40%)`; g.fillRect(0, 0, 1280, 720); }, 100);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(10);
  window.saved = [];
  window.showSaveFilePicker = async ({ suggestedName }) => ({
    createWritable: async () => {
      const f = { name: suggestedName, len: 0, sum: 0, closed: false, aborted: false };
      window.saved.push(f);
      return {
        write: async (d) => { const b = new Uint8Array(d); for (let i = 0; i < b.length; i++) f.sum = (f.sum * 31 + b[i]) | 0; f.len += b.length; },
        close: async () => { f.closed = true; },
        abort: async () => { f.aborted = true; },
      };
    },
  });
}
// the desktop app 1.38, as far as the overlay needs it: the window in front is a full-screen game (window.front)
function fakeClient() {
  const on = {};
  window.front = { full: true, mine: false };
  window.lpcClient = {
    calls: [], version: '1.38.0',
    screens: async () => [{ id: '1', main: true, thumb: '' }],
    useScreen() {}, keys: async () => ({}), compact() {}, windowMode: async () => 'borderless', update() {}, discord() {},
    ducking: async () => 3, soundSettings() {}, attenuate() {},
    overlay(s) { this.calls.push(s); if (this.calls.length > 400) this.calls.shift(); },
    frontApp: async () => window.front,
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
  };
}
// a file's bytes, the same in the page and here: byte i is (i * 7 + (i >> 16)) & 255
const pattern = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 7 + (i >> 16)) & 255; return b; };
const sumOf = (b) => { let s = 0; for (let i = 0; i < b.length; i++) s = (s * 31 + b[i]) | 0; return s; };
// picks a file in the page as if from + (or drops it on sel, a player's card)
const offer = (page, name, size, sel) => page.evaluate(([name, size, sel]) => {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 7 + (i >> 16)) & 255;
  const dt = new DataTransfer();
  dt.items.add(new File([b], name, { type: 'application/octet-stream' }));
  if (sel) return void document.querySelector(sel).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  const input = document.getElementById('chatFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
}, [name, size, sel]);
const download = (page, name) => page.evaluate((name) => [...document.querySelectorAll('#chatLog li')].find((li) => li.textContent.includes(name)).querySelector('.chatfile button').click(), name);
const savedAs = (page, name) => page.evaluate((name) => window.saved.filter((f) => f.name === name).pop(), name);

async function player(browser, name, client) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com/, (r) => r.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('**/hello', (r) => r.fulfill({ status: 204, headers: cors }));
  await ctx.route(/\/rooms(\?|$)/, (r) => { // GET asks with ?me= (your Riot IDs, for hidden rooms)
    if (r.request().method() === 'GET') return r.fulfill({ json: [...OPEN_ROOMS.values()], headers: cors });
    const b = JSON.parse(r.request().postData() || '{}');
    if (b.remove || b.locked) OPEN_ROOMS.delete(b.room);
    else OPEN_ROOMS.set(b.room, { room: b.room, count: b.count, playing: b.playing });
    r.fulfill({ json: { ok: true }, headers: cors });
  });
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoShare: false })); }, name);
  await ctx.addInitScript(fakes);
  if (client) await ctx.addInitScript(fakeClient);
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
const waitFor = (page, fn, arg, what, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  const chat = await page.evaluate(() => document.getElementById('chatLog').textContent.slice(-400)).catch(() => '?');
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; chat: ${chat}`);
});
const inRoom = (page, n) => waitFor(page, (n) => lpc.peers().length === n && lpc.peers().every((p) => p.conns > 0), n, `${n} others in the room`);

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  try {
    const ana = await player(browser, 'Ana', true), ben = await player(browser, 'Ben');
    await ana.goto(URL_);
    await ana.click('#createBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 15000 });
    const ROOM = await ana.evaluate(() => lpc.room());
    await join(ben, ROOM);
    await inRoom(ana, 1);
    await inRoom(ben, 1);

    // 17: a 30 MB file offered in the chat; Ben downloads it to the save picker, every byte in order
    const SIZE = 30e6, SUM = sumOf(pattern(SIZE));
    await offer(ana, 'replay.rofl', SIZE);
    await waitFor(ben, () => /replay\.rofl · 30\.0 MB/.test(document.getElementById('chatLog').textContent) && !!document.querySelector('#chatLog .chatfile button'), null, 'Ana’s file offered to Ben');
    assert(/Friends can download it/.test(await ana.textContent('#chatLog')), 'Ana’s side says friends can download it');
    let since = Date.now();
    await download(ben, 'replay.rofl');
    await waitFor(ben, () => window.saved.some((f) => f.name === 'replay.rofl' && f.closed), null, 'the 30 MB file saved', 120000);
    const got = await savedAs(ben, 'replay.rofl');
    assert.deepStrictEqual([got.len, got.sum], [SIZE, SUM], 'every byte, in order');
    console.log(`big file: 30 MB from Ana straight to Ben's disk in ${((Date.now() - since) / 1000).toFixed(1)} s, every byte checked`);

    // 57: the connection breaks halfway; the download waits, then carries on where it stopped
    await offer(ana, 'big.zip', SIZE);
    await waitFor(ben, () => /big\.zip/.test(document.getElementById('chatLog').textContent), null, 'the second file offered');
    await download(ben, 'big.zip');
    await waitFor(ben, () => { const f = window.saved.find((x) => x.name === 'big.zip'); return f && f.len > 6e6; }, null, 'part of it in', 60000);
    const anaId = (await ben.evaluate(() => lpc.peers()))[0].id;
    await ben.evaluate((id) => lpc.kick(id), anaId);
    await waitFor(ben, () => /Paused at \d+%: waiting for Ana/.test(document.getElementById('chatLog').textContent) || window.saved.find((x) => x.name === 'big.zip').closed, null, 'paused while Ana is gone', 15000);
    await waitFor(ben, () => window.saved.some((f) => f.name === 'big.zip' && f.closed), null, 'the rest after the reconnect', 120000);
    const resumed = await savedAs(ben, 'big.zip');
    assert.deepStrictEqual([resumed.len, resumed.sum, resumed.aborted], [SIZE, SUM, false], 'resumed without a byte missing or twice');
    console.log('resume: the connection broke halfway, the download waited and finished where it stopped, every byte checked');

    // memory: three more 30 MB downloads leave the pages' memory where it was
    const heap = (p) => p.evaluate(async () => { let min = Infinity; for (let i = 0; i < 3; i++) { window.gc(); await new Promise((r) => setTimeout(r, 300)); min = Math.min(min, performance.memory.usedJSHeapSize); } return min; });
    const heap0 = [await heap(ana), await heap(ben)];
    for (let i = 0; i < 3; i++) {
      await offer(ana, `again${i}.bin`, SIZE);
      await waitFor(ben, (n) => [...document.querySelectorAll('#chatLog li')].some((li) => li.textContent.includes(n) && li.querySelector('.chatfile button')), `again${i}.bin`, 'offered again');
      await download(ben, `again${i}.bin`);
      await waitFor(ben, (n) => window.saved.some((f) => f.name === n && f.closed), `again${i}.bin`, 'saved again', 120000);
    }
    await new Promise((r) => setTimeout(r, 1000));
    const heap1 = [await heap(ana), await heap(ben)];
    const grew = heap1.map((h, i) => (h - heap0[i]) / 1e6);
    assert(grew.every((g) => g < 25), `pages' memory flat after three 30 MB files (a kept copy would be 30 MB each): grew ${grew.map((g) => g.toFixed(1)).join(' and ')} MB`);
    console.log(`memory: after three more 30 MB files Ana's page grew ${grew[0].toFixed(1)} MB, Ben's ${grew[1].toFixed(1)} MB`);

    // 18 + 26: a pin, the search box, and Cat joining later gets the pin
    await ana.fill('#chatText', 'meet at https://example.com/plan tonight');
    await ana.press('#chatText', 'Enter');
    await ana.fill('#chatText', 'unrelated');
    await ana.press('#chatText', 'Enter');
    await waitFor(ben, () => /unrelated/.test(document.getElementById('chatLog').textContent), null, 'Ana’s messages');
    await ben.evaluate(() => [...document.querySelectorAll('#chatLog li')].find((li) => /meet at/.test(li.textContent)).querySelector('.acts button[title="Pin"]').click());
    await waitFor(ana, () => !document.getElementById('chatPins').hidden && /📌Anameetat/.test(document.getElementById('chatPins').textContent.replace(/\s/g, '')) && !!document.querySelector('#chatPins a[href="https://example.com/plan"]'), null, 'Ben’s pin above Ana’s chat, its link clickable');
    await ana.fill('#chatFind', 'tonight');
    const shownNow = await ana.evaluate(() => [...document.querySelectorAll('#chatLog li')].filter((li) => !li.hidden).map((li) => li.textContent));
    assert(shownNow.length === 1 && /meet at/.test(shownNow[0]), `search shows only the match: ${JSON.stringify(shownNow)}`);
    await ana.fill('#chatFind', '');
    const cat = await player(browser, 'Cat');
    await join(cat, ROOM);
    await inRoom(cat, 2);
    await waitFor(cat, () => /meet at/.test(document.getElementById('chatPins').textContent), null, 'the pin for Cat, who came later');
    console.log('pins and search: Ben pinned a message for everyone, the link works from the pin, search hides the rest, Cat got the pin on joining');

    // 56: a file dropped on Cat's card reaches Cat only
    await inRoom(ana, 2);
    const catSlot = await ana.evaluate(() => lpc.peers().find((p) => p.name === 'Cat').slot);
    await offer(ana, 'for-cat.txt', 2000, `#players [data-slot="${catSlot}"]`);
    await waitFor(cat, () => [...document.querySelectorAll('#chatLog li')].some((li) => /for-cat\.txt/.test(li.textContent) && /to you/.test(li.textContent)), null, 'the file to Cat, marked to you');
    await new Promise((r) => setTimeout(r, 1500));
    assert(!/for-cat/.test(await ben.textContent('#chatLog')), 'Ben never sees it');
    assert(/to Cat/.test(await ana.evaluate(() => [...document.querySelectorAll('#chatLog li')].find((li) => /for-cat/.test(li.textContent)).textContent)), 'Ana’s copy says to Cat');
    await download(cat, 'for-cat.txt');
    await waitFor(cat, () => window.saved.some((f) => f.name === 'for-cat.txt' && f.closed && f.len === 2000), null, 'Cat saved it');
    console.log('drop on a card: the file went to Cat alone, Ben never saw it');

    // 60: Files lists what was shared in the room
    await ben.click('#chatFilesBtn');
    await waitFor(ben, () => /again2\.bin/.test(document.getElementById('chatFiles').textContent), null, 'Files on Ben’s page');
    const files = await ben.textContent('#chatFiles');
    assert(/replay\.rofl/.test(files) && !/for-cat/.test(files) && (await ben.isHidden('#chatLog')), `Files lists the room's files: ${files.slice(0, 200)}`);
    await ben.click('#chatFilesBtn');
    console.log('Files: every file shared in the room in one list');

    // 26: past sessions' search finds Ana's message and opens the session there
    await new Promise((r) => setTimeout(r, 2500)); // saved two seconds after a change
    await ben.evaluate(() => { document.getElementById('histBox').open = true; });
    await ben.fill('#histFind', 'tonight');
    await waitFor(ben, () => /Ana: meet at/.test(document.getElementById('histHits').textContent), null, 'a hit in Ben’s past sessions');
    await ben.click('#histHits button');
    await waitFor(ben, () => document.getElementById('histDlg').open && !!document.querySelector('#histLog li.flash'), null, 'the session open at the message');
    await ben.click('#histClose');
    console.log('past sessions: search found the message and opened its session there');

    // 58 + 59: Ben and Cat share; Ana watches both side by side and zooms into one
    for (const p of [ben, cat]) await p.click('#generalShareBtn');
    await waitFor(ana, () => document.querySelectorAll('#screenGrid .screentile video').length === 2 && [...document.querySelectorAll('#screenGrid video')].every((v) => v.videoWidth > 0), null, 'both screens on Ana’s page', 45000);
    assert(await ana.isVisible('#sideBtn'), 'Side by side with two screens');
    await ana.click('#sideBtn');
    await waitFor(ana, () => document.fullscreenElement === document.getElementById('screenGrid') && getComputedStyle(document.getElementById('screenGrid')).gridTemplateColumns.split(' ').length === 2, null, 'both full screen, 2 across');
    await ana.keyboard.press('Escape');
    await ana.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    const zoom = await ana.evaluate(() => {
      const wrap = document.querySelector('#screenGrid .scrwrap'), r = wrap.getBoundingClientRect();
      wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: r.left + r.width / 4, clientY: r.top + r.height / 4, bubbles: true, cancelable: true }));
      return { t: wrap.querySelector('video').style.transform, b: wrap.parentElement.querySelector('.unzoom').textContent };
    });
    assert(/scale\(2\.7/.test(zoom.t) && /2\.7x · Reset/.test(zoom.b), `zoomed in at the pointer: ${JSON.stringify(zoom)}`);
    await ana.click('#screenGrid .unzoom');
    assert.strictEqual(await ana.$eval('#screenGrid video', (v) => v.style.transform), '', 'Reset goes back');
    console.log('screens: side by side full screen, Ctrl + scroll zoomed in where the pointer was, Reset');

    // 25 + 50 + 61: who's talking over a full-screen game outside League, chat lines too, then it fades and hides
    await waitFor(ana, () => lpcClient.calls.some((s) => s.visible && s.any && s.talkers && s.talkers.length > 0), null, 'who’s talking on the overlay over the game');
    await ana.evaluate(() => document.querySelectorAll('#players .player .mute').forEach((b) => b.click())); // both quiet for Ana
    await waitFor(ana, () => lpcClient.calls.some((s) => s.fade && s.any) && !lpcClient.calls[lpcClient.calls.length - 1].visible, null, 'the overlay fading, then hidden, once nobody talks');
    await ben.fill('#chatText', 'push mid');
    await ben.press('#chatText', 'Enter');
    await waitFor(ana, () => lpcClient.calls.some((s) => s.any && (s.chat || []).some((c) => c.text === 'push mid')), null, 'Ben’s chat line on the overlay');
    await ana.evaluate(() => { window.front = { full: false, mine: false }; }); // a normal window in front: nothing, once the app says so (each second)
    await new Promise((r) => setTimeout(r, 1500));
    await ana.evaluate(() => { lpcClient.calls.length = 0; });
    await new Promise((r) => setTimeout(r, 2500));
    assert(await ana.evaluate(() => lpcClient.calls.every((s) => !s.any)), 'nothing over a window that isn’t full screen');
    console.log('any game: who’s talking and room chat over a full-screen game, fading out, nothing over other windows');
    console.log('ok');
  } finally {
    await browser.close();
    web.close();
    peerServer.close && peerServer.close();
  }
})().catch((e) => { console.error(e); process.exit(1); }).then(() => process.exit(0));

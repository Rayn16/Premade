// Test of Ask Premade (What's new 248) in site/index.html, in Chromium with a stand-in for the desktop app and a game
// fed as League's data: the word matcher (“Premade” then a word, not the 242 call “Premade, go Dragon”), the Settings
// card and its Test outside a game (an example answer), the speech recognition loaded in a game once ticked, and each
// answer said out loud (speechSynthesis stubbed) from a game's state, with nothing new on the overlay.
//   NODE_PATH=/path/to/node_modules node ask.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site'), PORT = 8097, URL_ = `http://127.0.0.1:${PORT}/index.html?debug`;
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');
const shot = (pg, name, sel) => process.env.SHOTS && (sel ? pg.locator(sel) : pg).screenshot({ path: path.join(process.env.SHOTS, name + '.png') });

const CHAMPS = [['Ahri', 103, [130, 105, 80]], ['Zed', 238, [120, 100, 80]], ['Garen', 86, [120, 100, 80]], ['LeeSin', 64, [85, 70, 55]], ['Jinx', 222, [90, 75, 60]]];
const DDATA = Object.fromEntries(CHAMPS.map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
const champFull = (id) => ({ data: { [id]: { id, allytips: [], enemytips: [], spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: `${id} ${k}`, cooldown: i === 3 ? CHAMPS.find((c) => c[0] === id)[2] : [8, 8, 8, 8, 8] })) } } });
const item = (name, total) => ({ name, gold: { total }, description: '<mainText></mainText>', maps: { 11: true }, tags: [] });
const ITEMS = { data: { 3158: item('Ionian Boots of Lucidity', 900), 3071: item('Black Cleaver', 3000), 1101: item('Gustwalker Hatchling', 450) } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// the desktop app as far as the overlay goes, and the computer's voice written down instead of spoken
function fakeApp() {
  const on = {};
  window.lpcClient = {
    version: '1.57.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; if (s.call) (window.calls = window.calls || []).push(s.call); },
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, lcu: async () => ({ status: 0, data: null }),
  };
  window.spoken = [];
  speechSynthesis.speak = (u) => window.spoken.push(u.text);
  speechSynthesis.cancel = () => {};
  localStorage.setItem('lpc-setup', '1');
  localStorage.setItem('lpc-name', 'Rayan');
  localStorage.setItem('lpc-news', '9999');
  if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoRoom: false, autoShare: false, foeTimers: true }));
}
const P = (name, team, champ, pos, more = {}) => ({ name: name + '#EUW', team, champ, champName: '', pos, lvl: 6, k: 0, d: 0, a: 0, cs: 30, items: [], dead: false, respawn: 0, ...more });
const players = (over = {}) => [P('Rayan', 'ORDER', 'Ahri', 'MIDDLE', over.Rayan), P('Friend', 'ORDER', 'Jinx', 'BOTTOM'), P('Zedd', 'CHAOS', 'Zed', 'MIDDLE', { items: [[3158, 1]], ...over.Zedd }),
  P('Jungler', 'CHAOS', 'LeeSin', '', { items: [[1101, 1]], ...over.Jungler }), P('Topper', 'CHAOS', 'Garen', 'TOP', { lvl: 11, items: [[3071, 1]] })];
const game = (t, over) => ({ inGame: true, phase: 'InProgress', mode: 'CLASSIC', t, room: 'g0123456789a', result: '', events: [],
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330, gold: 500 }, players: players(over) });
const wait = (page, fn, what, timeout = 20000) => page.waitForFunction(fn, null, { timeout, polling: 100 }).catch((e) => { throw new Error(`waiting for ${what}: ${e.message.split('\n')[0]}`); });

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|workers\.dev|github\.io|jsdelivr/, (r) => r.abort());
    await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
      const u = r.request().url(), cors = { 'access-control-allow-origin': '*' };
      let m;
      if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
      if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
      if ((m = /\/data\/en_US\/champion\/(\w+)\.json$/.exec(u))) return r.fulfill({ json: champFull(m[1]), headers: cors });
      if (u.endsWith('item.json')) return r.fulfill({ json: ITEMS, headers: cors });
      if (u.endsWith('.json')) return r.fulfill({ json: [], headers: cors });
      r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
    });
    await ctx.addInitScript(fakeApp);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(URL_);
    await wait(page, () => window.lpc, 'the page');
    const ask = (t) => page.evaluate((x) => lpc.askOf(x), t);
    const heard = async (t) => { const n = await page.evaluate(() => spoken.length); await page.evaluate((x) => lpc.said(x), t); return page.evaluate((k) => spoken.slice(k), n); };

    // ---- the word matcher: “Premade” then a word within 4, anything in between; not the shotcaller call, not a word alone
    assert.strictEqual(await ask('premade [unk] dragon'), 'dragon', '“Premade, when’s Dragon?”');
    assert.strictEqual(await ask('premade go dragon'), null, '242’s call asks nothing');
    assert.strictEqual(await ask('dragon'), null, 'a word alone asks nothing');
    assert.strictEqual(await ask('premade [unk] [unk] [unk] [unk] [unk] dragon'), null, 'too far from “Premade”');
    const WORDS = { dragon: 'dragon', baron: 'baron', herald: 'herald', grubs: 'herald', 'their flash': 'flash', 'their ult': 'ults', 'their ultimate': 'ults', jungle: 'jungler', buy: 'buy', winning: 'winning', lane: 'lane', dead: 'dead' };
    for (const [w, q] of Object.entries(WORDS)) assert.strictEqual(await ask(`premade ${w}`), q, w);
    console.log('Ask Premade: the word matcher');

    // ---- Settings, Callouts: the card, off until ticked; Test outside a game says an example
    await page.evaluate(() => lpc.league(null));
    if (!(await page.isVisible('.nav[data-view="settings"]'))) await page.click('#leagueNav');
    await page.click('.nav[data-view="settings"]');
    await page.click('#setList [data-sec="callouts"]');
    assert(await page.isVisible('#optAskVoice') && !(await page.isChecked('#optAskVoice')), 'Listen for questions, off');
    assert.deepStrictEqual(await page.$$eval('.askwords .tag', (l) => l.map((x) => x.textContent)), ['Dragon', 'Baron', 'Herald', 'their Flash', 'their ults', 'jungler', 'buy', 'winning', 'lane', 'dead']);
    await shot(page, 'ask-settings', '#h-ask >> xpath=..');
    await page.click('#askTest');
    await wait(page, () => lpc.voice().on, 'the speech recognition for Test', 90000);
    await wait(page, () => /^Say “Premade” and a word/.test(document.getElementById('askNote').textContent), 'Test listening');
    assert.deepStrictEqual(await heard('premade [unk] dragon'), ['Dragon in 3:00'], 'outside a game: the example');
    await wait(page, () => document.getElementById('askNote').textContent === 'Heard “Premade, Dragon”.', 'Heard');
    await wait(page, () => !lpc.voice().loaded, 'the speech recognition let go after Test', 30000);
    console.log('Ask Premade: the Settings card, Test outside a game says an example');

    // ---- in a game, ticked: loads the recognizer; each answer from the game's state, nothing new on the overlay
    await page.check('#optAskVoice');
    await page.evaluate((g) => lpc.league(g), game(120));
    await wait(page, () => lpc.voice().on && lpc.cooldown('r:Garen') > 0, 'the speech recognition in a game, and Data Dragon', 90000);
    const before = await page.evaluate(() => (window.calls || []).length);
    assert.deepStrictEqual(await heard('premade go dragon'), [], 'the call: nothing said');
    assert.deepStrictEqual(await heard('dragon'), [], 'no “Premade”: nothing said');
    assert.match((await heard('premade [unk] dragon')).join(), /^Dragon in (3:00|2:59)$/);
    assert.deepStrictEqual(await heard('premade baron'), ['Baron at 20:00']);
    assert.match((await heard('premade grubs')).join(), /^Voidgrubs in (6:00|5:59)$/);
    assert.deepStrictEqual(await heard('premade their flash'), ['No Flash timers running']);
    assert.deepStrictEqual(await heard('premade their ult'), ['No ult timers running']);
    await heard('premade mid flash'); // the enemy timer phrase still starts Zed's Flash: Ionian Boots, 300 × 100/110 s
    await heard('premade top ultimate');
    assert.match((await heard('premade their flash')).join(), /^Zed Flash down, (4:[3-5]\d|5:0\d)\. The rest up$/);
    assert.match((await heard('premade [unk] their ultimate')).join(), /^Garen ult down, 1:[2-4]\d$/);
    assert.deepStrictEqual(await heard('premade jungle'), ['Lee Sin not seen yet'], 'never a guess');
    assert.match((await heard('premade buy')).join(), /^(You can buy .+|.+, \d+ short|Premade has no build for you this game)$/);
    assert.match((await heard('premade winning')).join(), /^\d{1,2} percent, (gold even|(up|down) \d+\.\dk)$/);
    assert.deepStrictEqual(await heard('premade lane'), ['Level 6 against 6, even CS']);
    assert.deepStrictEqual(await heard('premade dead'), ['Nobody on their team is dead']);
    await page.evaluate((g) => lpc.league(g), game(130, { Rayan: { cs: 45, lvl: 7 }, Zedd: { dead: true, respawn: 22 }, Jungler: { dead: true, respawn: 8 } }));
    assert.deepStrictEqual(await heard('premade lane'), ['Level 7 against 6, 15 CS ahead']);
    assert.deepStrictEqual(await heard('premade dead'), ['Lee Sin back in 8 seconds, Zed in 22 seconds']);
    assert.deepStrictEqual(await heard('premade jungle'), ['Lee Sin is dead, back in 8 seconds']);
    await page.waitForTimeout(1500);
    const ov = await page.evaluate(() => ({ calls: (window.calls || []).length, o: JSON.stringify(lpcClient.lastOverlay || {}) }));
    assert.strictEqual(ov.calls, before, 'nothing new at the top of the screen');
    assert(!/percent|not seen yet|CS ahead|back in 8/.test(ov.o), 'no answer on the overlay');
    console.log('Ask Premade: in a game, each answer out loud from the game, nothing on the overlay');

    // ---- the game ends: it lets go of the speech recognition (enemy timers off too)
    await page.evaluate(() => lpc.league({ inGame: false, phase: 'EndOfGame' }));
    await page.click('#setList [data-sec="overlay"]').catch(() => {});
    await page.evaluate(() => { document.getElementById('optFoeTimers').checked = false; document.getElementById('optFoeTimers').dispatchEvent(new Event('change')); });
    await wait(page, () => !lpc.voice().loaded, 'the speech recognition let go after the game', 30000);
    console.log('ask.e2e: all passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit();
  }
})();

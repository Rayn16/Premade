// Test of the TFT page in site/index.html, in headless Chromium: on the website, the comp builder from the Team
// Planner's champions (CommunityDragon's copy of League's game data, faked here), its traits, Riot's team code for it,
// Copy team code onto the clipboard with where to paste it, a pasted code opened (and one from another set refused),
// My comps saved, opened and deleted, Riot's shop odds, and a comp sent to a voice room, where the chat gives it a
// Copy team code button; then with a stand-in for the desktop app 1.13 and a fake League client behind it: your TFT
// ranks, your last games with your average place, top 4s and traits, each Set 18 board's team code (champions matched
// by name when match history and the Team Planner name them differently), none for an older set's board, and only
// calls the desktop app lets through (client/main.js LCU_OK).
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node tft.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8084/index.html?peer=127.0.0.1:9004&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true });

PeerServer({ host: '127.0.0.1', port: 9004, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8084, '127.0.0.1');

// ---- the Team Planner's champions (tftchampions-teamplanner.json): Set 18's under ids like TFT18_Xayah, with their
// Team Planner numbers, and Set 17's; a row with no number and the tutorial's set are left out
const unit = (set, id, name, tier, code, traits) => ({ character_id: id, display_name: name, tier, team_planner_code: code, path: '', traits: traits.map((t) => ({ id: `TFT${set}_${t}`, name: t })),
  squareIconPath: `/lol-game-data/assets/ASSETS/Characters/${id}/HUD/${id}_Square.TFT_Set${set}.png` });
const PLAN = {
  TFTSet18: [unit(18, 'TFT18_Xayah', 'Xayah', 1, 1043, ['Solar', 'Sniper']), unit(18, 'TFT18_Rakan', 'Rakan', 1, 1065, ['Solar', 'Vanguard']), unit(18, 'TFT18_Ornn', 'Ornn', 1, 1100, ['Vanguard']),
    unit(18, 'TFT18_Hecarim', 'Hecarim', 3, 1200, ['Vanguard']), unit(18, 'TFT18_Ahri', 'Ahri', 4, 1300, ['Solar', 'Mage']), unit(18, 'TFT18_Ashe', 'Ashe', 5, 1400, ['Sniper']),
    unit(18, 'TFT18_Lux_Sunbeam', 'Lux (Solar)', 5, 2049, ['Solar']), unit(18, 'TFT18_Training', 'Training Dummy', 1, 0, [])],
  TFTSet17: [unit(17, 'TFT17_Ahri', 'Ahri', 2, 5, ['Arcana'])],
  TFTTutorial: [unit(0, 'TFTTutorial_Zed', 'Zed', 2, 9, [])],
};
// Data Dragon's TFT files: Set 18 under League's new ids (DA_18_Xayah), and the shop odds (patch 18.3's)
const DD_TFT = {
  champion: Object.fromEntries([['DA_18_Xayah', 'Xayah'], ['DA_18_Rakan', 'Rakan'], ['DA_18_Ahri', 'Ahri'], ['TFT17_Ahri', 'Ahri']].map(([id, name]) => [`Maps/Shipping/Map22/Sets/TFTSet18/Shop/${id}`, { id, name, image: { full: id + '.png', group: 'tft-champion' } }])),
  trait: Object.fromEntries([['DA_18_Solar', 'Solar'], ['DA_18_Vanguard', 'Vanguard'], ['TFT17_Arcana', 'Arcana']].map(([id, name]) => [id, { id, name, image: { full: id + '.png', group: 'tft-trait' } }])),
};
const ODDS = [[1, 100, 0, 0, 0, 0], [2, 100, 0, 0, 0, 0], [3, 75, 25, 0, 0, 0], [4, 55, 30, 15, 0, 0], [5, 45, 33, 20, 2, 0], [6, 30, 40, 25, 5, 0], [7, 19, 30, 40, 10, 1], [8, 15, 20, 32, 30, 3],
  [9, 10, 17, 25, 33, 15], [10, 5, 10, 20, 40, 25], [11, 1, 2, 12, 50, 35]].map(([level, ...r]) => ({ level, dropRatesByTier: r.map((rate, i) => ({ cost: i + 1, rate })) }));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const CODE = (...hex) => '02' + hex.join('') + '000'.repeat(10 - hex.length) + 'TFTSet18'; // Riot's team code: 02, three hex digits a champion, the set

// ---- the fake League client: Rayan, Gold II in TFT, unranked in Double Up, Blue in Hyper Roll; three Set 18 games
// (2nd, 5th, 1st) and an older Set 17 one, with units as match history names them (DA_18_...) and a summon the Team
// Planner doesn't have
const ME = { puuid: 'me-puuid', gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 300, profileIconId: 1 };
const RANKS = { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'I', leaguePoints: 10, wins: 5, losses: 5 }, RANKED_TFT: { tier: 'GOLD', division: 'II', leaguePoints: 40, wins: 6, losses: 24 },
  RANKED_TFT_TURBO: { ratedTier: 'BLUE', ratedRating: 3200, wins: 2, losses: 8 } };
const tftGame = (k, set, place, traits, units) => ({ metadata: { match_id: `EUW1_${7000 + k}`, timestamp: Date.now() - k * 36e5 },
  json: JSON.stringify({ game_datetime: Date.now() - k * 36e5, game_length: 1900, queue_id: 1100, tft_set_number: set, participants: [{ puuid: 'me-puuid', placement: place, level: 8,
    traits: traits.map(([name, num_units, style]) => ({ name, num_units, style })), units: units.map(([character_id, tier]) => ({ character_id, tier, itemNames: [] })), augments: [] },
  { puuid: 'other', placement: 8, level: 5, traits: [], units: [], augments: [] }] }) });
const GAMES = [tftGame(1, 18, 2, [['DA_18_Solar', 4, 2], ['DA_18_Vanguard', 2, 1], ['DA_18_Mage', 1, 0]], [['DA_18_Xayah', 2], ['DA_18_Rakan', 2], ['DA_18_Ahri', 1], ['DA_18_Summon', 1]]),
  tftGame(2, 18, 5, [['DA_18_Solar', 2, 1]], [['DA_18_Xayah', 1], ['DA_18_Rakan', 1]]),
  tftGame(3, 18, 1, [['DA_18_Solar', 4, 2], ['DA_18_Vanguard', 2, 1]], [['DA_18_Rakan', 3], ['DA_18_Ahri', 2]]),
  tftGame(4, 17, 6, [['TFT17_Arcana', 2, 1]], [['TFT17_Ahri', 2]])];
const L = { calls: [], refused: [] };
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p) {
  L.calls.push(`${method} ${p}`);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok(ME);
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: RANKS });
  if (p === '/lol-match-history/v1/products/tft/me-puuid/matches?begin=0&count=20') return ok({ games: GAMES });
  if (/^\/lol-match-history\/v1\/products\/lol\//.test(p)) return ok({ games: { games: [] } });
  return { status: 404, data: null };
}
function fakeApp() { // the desktop app 1.13 (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.lpcClient = { version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}

async function context(browser, { app = false, name = 'Rayan' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8084' });
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/127\.0\.0\.1:9004\/(riot|stats)/, (r) => r.fulfill({ status: 404, json: {}, headers: cors }));
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    let m;
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    if ((m = /\/tft-(champion|trait)\.json$/.exec(u))) return r.fulfill({ json: { data: DD_TFT[m[1]] }, headers: cors });
    if (u.endsWith('/tft-shop-drop-rates-data.json')) return r.fulfill({ json: { type: 'tft-shop-drop-rates', version: '1.1', data: { Shop: ODDS } }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.route(/raw\.communitydragon\.org/, (r) => {
    const u = r.request().url();
    if (u.endsWith('/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json')) return r.fulfill({ json: PLAN, headers: cors });
    r.fulfill({ status: /\/assets\/characters\/tft18_[a-z_]+\/hud\/tft18_[a-z_]+_square\.tft_set18\.png$/.test(u) ? 200 : 404, body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.addInitScript((n) => {
    if (localStorage.getItem('lpc-setup')) return;
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', n);
    localStorage.setItem('lpc-news', '9999'); // no What's new
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false }));
  }, name);
  if (app) { await ctx.addInitScript(fakeApp); await ctx.exposeFunction('fakeLcu', fakeLcu); }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  await page.goto(URL_);
  await wait(page, () => window.lpc, null, 'the page');
  return [ctx, page];
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; page ${JSON.stringify(await page.evaluate(() => document.querySelector('main > .view:not([hidden])').innerText.slice(0, 600)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).textContent();
const texts = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.textContent));
const pool = (page, name) => page.locator('#tftPool .tftunit', { hasText: name });
async function join(page) { // a voice room by its invite link, which the page reads when it loads
  await page.goto(`${URL_}#tftr`);
  await page.reload();
  await page.click('#joinBtn');
  await wait(page, () => lpc.slot() >= 0, null, 'in the room');
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    // ---- the website: build a comp, copy its code, open a pasted one, save comps, the shop odds
    const [actx, ana] = await context(browser, { name: 'Ana' });
    await ana.click('.nav[data-view="tft"]');
    await wait(ana, () => document.querySelectorAll('#tftPool .tftunit').length === 7, null, 'Set 18’s Team Planner champions');
    assert.deepStrictEqual(await texts(ana, '#tftPool .tftunit span'), ['Ornn', 'Rakan', 'Xayah', 'Hecarim', 'Ahri', 'Ashe', 'Lux (Solar)'], 'by cost, then name; no row without a number');
    assert.deepStrictEqual(await ana.$$eval('#tftPool .tftunit', (l) => l.map((b) => b.dataset.cost).join('')), '1113455');
    assert.strictEqual(await ana.getAttribute('#tftPool .tftunit:nth-child(3) img', 'src'),
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/tft18_xayah/hud/tft18_xayah_square.tft_set18.png', 'its CommunityDragon picture');
    assert.match(await text(ana, '#tftNote'), /^Your TFT ranks and games come from League’s client/);
    assert(await ana.locator('#tftGamesBox').isHidden(), 'no games on the website');
    assert(await ana.locator('#tftCopy').isDisabled(), 'nothing to copy yet');
    await pool(ana, 'Xayah').click();
    await pool(ana, 'Rakan').click();
    assert.strictEqual(await ana.inputValue('#tftCode'), CODE('413', '429'), 'Xayah 1043 and Rakan 1065 in hex');
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftunit span'), ['Xayah', 'Rakan']);
    assert.deepStrictEqual(await texts(ana, '#tftTraits .tag'), ['2 Solar', '1 Sniper', '1 Vanguard']);
    assert.strictEqual(await pool(ana, 'Xayah').getAttribute('aria-pressed'), 'true');
    await ana.fill('#tftFind', 'sniper');
    assert.deepStrictEqual(await texts(ana, '#tftPool .tftunit span'), ['Xayah', 'Ashe'], 'found by trait');
    await pool(ana, 'Ashe').click();
    await ana.fill('#tftFind', '');
    await pool(ana, 'Lux (Solar)').click();
    assert.strictEqual(await ana.inputValue('#tftCode'), CODE('413', '429', '578', '801'), 'Ashe 1400 and Lux 2049');
    await ana.locator('#tftBoard .tftunit', { hasText: 'Ashe' }).click();
    assert.strictEqual(await ana.inputValue('#tftCode'), CODE('413', '429', '801'), 'Ashe taken off');
    await ana.click('#tftCopy');
    await wait(ana, () => lpc.toasts().includes('Team code copied. In League, open the Team Planner and press Paste.'), null, 'where to paste it');
    assert.strictEqual(await ana.evaluate(() => navigator.clipboard.readText()), CODE('413', '429', '801'), 'on the clipboard');
    await shot(ana, 'tft-page');
    console.log('website: a comp from Set 18’s champions with its traits, its team code copied with where to paste it');
    // saved, cleared, a code pasted in, then the saved one opened again
    await ana.click('#tftSave');
    assert.deepStrictEqual(await texts(ana, '#tftMine li b'), ['3 Solar, 1 Sniper']);
    assert.strictEqual(await ana.locator('#tftMine li img').count(), 3);
    await ana.click('#tftClear');
    assert.strictEqual(await ana.locator('#tftBoard .tftunit').count(), 0);
    await ana.fill('#tftCode', CODE('514', '44c'));
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftunit span'), ['Ahri', 'Ornn'], 'a pasted code opens');
    assert.strictEqual(await text(ana, '#tftCodeNote'), 'Opened a comp of 2 champions.');
    await ana.fill('#tftCode', '02005000000000000000000000000000TFTSet17');
    assert.strictEqual(await text(ana, '#tftCodeNote'), 'That code is for Set 17. League’s Team Planner takes Set 18 codes.');
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftunit span'), ['Ahri', 'Ornn'], 'and nothing changes');
    await ana.fill('#tftCode', '02413');
    assert.match(await text(ana, '#tftCodeNote'), /^That isn’t a whole team code/);
    await ana.locator('#tftMine li').getByRole('button', { name: 'Open' }).click();
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftunit span'), ['Xayah', 'Rakan', 'Lux (Solar)'], 'the saved comp back');
    await ana.reload();
    await ana.click('.nav[data-view="tft"]');
    await wait(ana, () => document.querySelectorAll('#tftBoard .tftunit').length === 3 && document.querySelectorAll('#tftMine li').length === 1, null, 'the comp and My comps after a restart');
    await ana.locator('#tftMine li').getByRole('button', { name: 'Delete' }).click();
    assert.strictEqual(await ana.locator('#tftMine li').count(), 0);
    // Riot's shop odds
    assert.deepStrictEqual(await ana.$$eval('#tftOdds tr', (l) => [l.length, ...[l[6], l[10]].map((r) => [...r.cells].map((c) => c.textContent).join(' '))]), [11, 'Level 7 19% 30% 40% 10% 1%', 'Level 11 1% 2% 12% 50% 35%']);
    console.log('website: My comps saved, opened and deleted, kept over a restart; a pasted code opens, another set’s refused; the shop odds');

    // ---- a comp sent to a voice room: Ben's chat has a Copy team code button for it
    await join(ana);
    const [bctx, ben] = await context(browser, { name: 'Ben' });
    await join(ben);
    await wait(ana, () => lpc.peers().some((p) => p.name === 'Ben'), null, 'Ben in Ana’s room', 30000);
    await ana.click('.nav[data-view="tft"]');
    await wait(ana, () => document.querySelectorAll('#tftBoard .tftunit').length === 3, null, 'Ana’s comp');
    await ana.click('#tftShare');
    await wait(ana, () => lpc.toasts().includes('Sent to your room'), null, 'sent');
    await wait(ben, () => [...document.querySelectorAll('#chatLog li')].some((li) => li.textContent.includes('TFT comp, 3 Solar, 1 Sniper: ') && li.querySelector('button')), null, 'the comp in Ben’s chat');
    const btn = ben.locator('#chatLog li button', { hasText: 'Copy team code' });
    assert.strictEqual(await btn.getAttribute('title'), CODE('413', '429', '801'), 'the code behind the button');
    await ben.click('.nav[data-view="voice"]');
    await btn.click();
    await wait(ben, () => lpc.toasts().includes('Team code copied. In League, open the Team Planner and press Paste.'), null, 'copied from the chat');
    assert.strictEqual(await ben.evaluate(() => navigator.clipboard.readText()), CODE('413', '429', '801'));
    await bctx.close();
    await actx.close();
    console.log('room: a comp sent from TFT shows in a friend’s chat with Copy team code');

    // ---- the desktop app with League open: ranks, games, traits, and each Set 18 board's team code
    const [pctx, pc] = await context(browser, { app: true });
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(pc, () => lpc.lcu().me0, null, 'you in League');
    await pc.click('.nav[data-view="tft"]');
    await wait(pc, () => document.querySelectorAll('#tftGames > li').length === 4 && document.querySelectorAll('#tftGames .gbody button').length === 3, null, 'your TFT games with their team codes');
    assert(await pc.locator('#tftNote').isHidden(), 'no note with League open');
    assert.match(await text(pc, '#tftRanks'), /TFT[\s\S]*Gold II[\s\S]*Double Up[\s\S]*Unranked[\s\S]*Hyper Roll[\s\S]*Blue[\s\S]*3200 rating/);
    assert.strictEqual(await text(pc, '#h-tftgames'), 'Your last 4 TFT games');
    assert.deepStrictEqual(await texts(pc, '#tftForm > span'), ['Average place3.5', 'Top 42 of 4 · 50%', 'Firsts1']);
    assert.deepStrictEqual(await pc.$$eval('#tftTraitRows tr', (l) => l.map((r) => [...r.cells].map((c) => c.textContent).join(' '))), ['Solar 3 2.7 67%', 'Vanguard 2 1.5 100%'], 'the traits you played twice or more');
    assert.deepStrictEqual(await pc.$$eval('#tftGames > li', (l) => l.map((li) => li.querySelector('.gbody button') ? 'code' : '')), ['code', 'code', 'code', ''], 'no code for the Set 17 game');
    await pc.click('#tftGames > li:first-child summary');
    await pc.click('#tftGames > li:first-child .gbody button');
    await wait(pc, () => lpc.toasts().includes('Team code copied. In League, open the Team Planner and press Paste.'), null, 'the board copied');
    assert.strictEqual(await pc.evaluate(() => navigator.clipboard.readText()), CODE('514', '413', '429'), 'Ahri first (4 cost), then Xayah and Rakan; the summon left out');
    await shot(pc, 'tft-app');
    // the same boards on Profile's TFT tab
    await pc.click('.nav[data-view="profile"]');
    await pc.click('#proQueues .tab[data-q="tft"]');
    await wait(pc, () => document.querySelectorAll('#proGames .gbody button').length === 3, null, 'Profile’s TFT boards with their codes');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    await pctx.close();
    console.log('desktop app: TFT ranks, your last games with your traits, a team code for each Set 18 board (here and on Profile), none for Set 17');
  } finally {
    await browser.close();
  }
  console.log('TFT tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

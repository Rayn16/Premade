// Test of the TFT page in site/index.html, in headless Chromium: on the website, the comp builder from the Team
// Planner's champions (CommunityDragon's copy of League's game data, faked here), its traits, Riot's team code for it,
// Copy team code onto the clipboard with where to paste it, a pasted code opened (and one from another set refused),
// My comps saved, opened and deleted, Riot's shop odds, and a comp sent to a voice room, where the chat gives it a
// Copy team code button; the roll calculator's odds, the item recipes (CommunityDragon's TFT data, faked here: this
// set's items and every set's, an old item with a current one's recipe, another set's emblem) and My comps closest to
// the board first with who's still needed; then with a stand-in for the desktop app 1.13 and a fake League client
// behind it: your TFT ranks, your last games with your average place, top 4s, traits and augments, each Set 18 board's
// team code (champions matched by name when match history and the Team Planner name them differently), none for an
// older set's board, gold rings on the items you put on your comp's champions, the recipes on the overlay in a TFT
// game, the ratings on the augment cards (a pick drawn on the screen the app shares by itself, read by the vendored
// Tesseract, and overlay.html putting them on the cards): tiers from our server's counts, else your own average, and
// each ranked game's places and augments sent to it; ARAM: Mayhem's cards (read anywhere in the middle of the screen)
// with how often Premade players took each on your champion, and a Mayhem game's augments sent; and only calls the
// desktop app lets through (client/main.js LCU_OK).
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
  item: Object.fromEntries([['DA_InfinityEdge', 'Infinity Edge'], ['DA_BlueBuff', 'Blue Buff']].map(([id, name]) => [id, { id, name, image: { full: id + '.png', group: 'tft-item' } }])),
  augments: Object.fromEntries([['TFT18_Augment_Rich', 'Rich Get Richer'], ['TFT18_Augment_Cluster', 'Cluster']].map(([id, name]) => [id, { id, name, image: { full: id + '.png', group: 'tft-augment' } }])),
};
// CommunityDragon's TFT data (cdragon/tft/en_us.json) as it comes: each set's own item list (setData), Set 18's with the
// old engine's items (TFT_Item_...) beside the new ones (DA_...), which only combine among themselves. The new ones:
// four components; Deathblade, Spear of Shojin, Infinity Edge and Blue Buff, with Seraph's Embrace (an old item with Blue Buff's recipe,
// which Data Dragon doesn't have), this set's Fae Emblem, last set's Arcana Emblem from the same pair (only in Set 17's
// list), a radiant item and an augment, which aren't recipes. And Set 18's augments (setData's augments), their tier in
// their icon's name: gold ones (-ii, -t2, 2.tex) and a silver one
const cd = (apiName, name, composition = []) => ({ apiName, name, composition, desc: '', effects: {}, tags: [], icon: `ASSETS/Maps/TFT/Icons/Items/Hexcore/${apiName}.TFT_Set13.tex` });
const aug = (apiName, name, icon) => ({ ...cd(apiName, name), icon: `ASSETS/Maps/TFT/Icons/Augments/Hexcore/${icon}.tex` });
const CD_AUGS = [aug('DA_18_Cluster', 'Cluster', 'missing-t2'), aug('DA_18_ClusterPlus', 'Cluster+', 'cluster-ii'), aug('DA_18_GoldDestiny', 'Gold Destiny', 'golddestiny2'), aug('DA_18_GoldDestinyI', 'Gold Destiny I', 'golddestiny-i')];
const CD_ITEMS = [cd('TFT_Item_BFSword', 'B.F. Sword'), cd('TFT_Item_SparringGloves', 'Sparring Gloves'), cd('TFT_Item_Deathblade', 'Deathblade', ['TFT_Item_BFSword', 'TFT_Item_BFSword']),
  cd('TFT_Item_InfinityEdge', 'Infinity Edge', ['TFT_Item_SparringGloves', 'TFT_Item_BFSword']),
  cd('DA_Component_Spatula', 'Spatula'), cd('DA_Component_SparringGloves', 'Sparring Gloves'), cd('DA_Component_BFSword', 'B.F. Sword'), cd('DA_Component_TearOfTheGoddess', 'Tear of the Goddess'),
  cd('DA_Deathblade', 'Deathblade', ['DA_Component_BFSword', 'DA_Component_BFSword']), cd('DA_SpearOfShojin', 'Spear of Shojin', ['DA_Component_TearOfTheGoddess', 'DA_Component_BFSword']),
  cd('DA_InfinityEdge', 'Infinity Edge', ['DA_Component_SparringGloves', 'DA_Component_BFSword']),
  cd('DA_SeraphsEmbrace', 'Seraph’s Embrace', ['DA_Component_TearOfTheGoddess', 'DA_Component_TearOfTheGoddess']), cd('DA_BlueBuff', 'Blue Buff', ['DA_Component_TearOfTheGoddess', 'DA_Component_TearOfTheGoddess']),
  cd('TFT17_Item_ArcanaEmblemItem', 'Arcana Emblem', ['DA_Component_Spatula', 'DA_Component_BFSword']), cd('DA_18_EmblemFae', 'Fae Emblem', ['DA_Component_BFSword', 'DA_Component_Spatula']),
  cd('DA_InfinityEdgeRadiant', 'Radiant Infinity Edge', ['DA_InfinityEdge']), aug('DA_18_Augment_Rich', 'Rich Get Richer', 'rich-get-richer-ii'), { apiName: 'DA_EmptyBag', name: null, composition: [] }];
const CDRAGON = { sets: { 17: { champions: [] }, 18: { champions: [] } }, items: [...CD_ITEMS, ...CD_AUGS], setData: [{ mutator: 'TFTSet17', items: ['TFT17_Item_ArcanaEmblemItem', 'DA_Component_Spatula', 'DA_Component_BFSword'] },
  { mutator: 'TFTSet18', items: CD_ITEMS.map((x) => x.apiName).filter((id) => !id.startsWith('TFT17_')), augments: ['DA_18_Augment_Rich', ...CD_AUGS.map((x) => x.apiName)] }] };
const ODDS = [[1, 100, 0, 0, 0, 0], [2, 100, 0, 0, 0, 0], [3, 75, 25, 0, 0, 0], [4, 55, 30, 15, 0, 0], [5, 45, 33, 20, 2, 0], [6, 30, 40, 25, 5, 0], [7, 19, 30, 40, 10, 1], [8, 15, 20, 32, 30, 3],
  [9, 10, 17, 25, 33, 15], [10, 5, 10, 20, 40, 25], [11, 1, 2, 12, 50, 35]].map(([level, ...r]) => ({ level, dropRatesByTier: r.map((rate, i) => ({ cost: i + 1, rate })) }));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let cdragonLoads = 0; // CommunityDragon's TFT data, fetched once a patch
const CODE = (...hex) => '02' + hex.join('') + '000'.repeat(10 - hex.length) + 'TFTSet18'; // Riot's team code: 02, three hex digits a champion, the set

// ---- the fake League client: Rayan, Gold II in TFT, unranked in Double Up, Blue in Hyper Roll; three Set 18 games
// (2nd, 5th, 1st) and an older Set 17 one, with units as match history names them (DA_18_...) and a summon the Team
// Planner doesn't have
const ME = { puuid: 'me-puuid', gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 300, profileIconId: 1 };
const RANKS = { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'I', leaguePoints: 10, wins: 5, losses: 5 }, RANKED_TFT: { tier: 'GOLD', division: 'II', leaguePoints: 40, wins: 6, losses: 24 },
  RANKED_TFT_TURBO: { ratedTier: 'BLUE', ratedRating: 3200, wins: 2, losses: 8 } };
const tftGame = (k, set, place, traits, units, augments = []) => ({ metadata: { match_id: `EUW1_${7000 + k}`, timestamp: Date.now() - k * 36e5 },
  json: JSON.stringify({ game_datetime: Date.now() - k * 36e5, game_length: 1900, queue_id: 1100, tft_set_number: set, participants: [{ puuid: 'me-puuid', placement: place, level: 8,
    traits: traits.map(([name, num_units, style]) => ({ name, num_units, style })), units: units.map(([character_id, tier, itemNames = []]) => ({ character_id, tier, itemNames })), augments },
  ...[1, 2, 3, 4, 5, 6, 7, 8].filter((p) => p !== place).map((p, i) => ({ puuid: 'other' + i, placement: p, level: 5, traits: [], units: [], augments: [] }))] }) });
const GAMES = [tftGame(1, 18, 2, [['DA_18_Solar', 4, 2], ['DA_18_Vanguard', 2, 1], ['DA_18_Mage', 1, 0]], [['DA_18_Xayah', 2, ['DA_InfinityEdge', 'DA_BlueBuff']], ['DA_18_Rakan', 2], ['DA_18_Ahri', 1], ['DA_18_Summon', 1]],
    ['TFT18_Augment_Rich', 'TFT18_Augment_Cluster']),
  tftGame(2, 18, 5, [['DA_18_Solar', 2, 1]], [['DA_18_Xayah', 1, ['DA_InfinityEdge']], ['DA_18_Rakan', 1]], ['TFT18_Augment_Cluster']),
  tftGame(3, 18, 1, [['DA_18_Solar', 4, 2], ['DA_18_Vanguard', 2, 1]], [['DA_18_Rakan', 3], ['DA_18_Ahri', 2]], ['TFT18_Augment_Rich']),
  tftGame(4, 17, 6, [['TFT17_Arcana', 2, 1]], [['TFT17_Ahri', 2]])];
const L = { calls: [], refused: [] };
// our server's augment ratings (/riot/tftaug), and what the app sent it: Rich Get Richer's two ids have 30
// games of Set 18 at 3.33 on average, Cluster too few. And CommunityDragon's Arena and Mayhem augments; arammayhem.com's
// Mayhem pick rates (Sneakerhead has none) and Ahri's combos: Symphony of War a god combo, Mystic Punch a trap
const RATES = { 'tftaug?s=18': { s: 18, a: { TFT18_Augment_Rich: [12, 40, 9], DA_18_Augment_Rich: [18, 60, 14], DA_18_Cluster: [5, 25, 2] } } };
const SENT = [];
const AMD = { augments: { rows: [['Symphony of War', 40], ['Mystic Punch', 5]].map(([en, pickRate]) => ({ name: { en }, pickRate })) },
  combos: { rows: [{ championId: 'Ahri', augmentNames: [{ en: 'Symphony of War' }], types: ['god'] }, { championId: 'Ahri', augmentNames: [{ en: 'Mystic Punch' }], types: ['trap'] }, { championId: 'Ashe', augmentNames: [{ en: 'Mystic Punch' }], types: ['god'] }] } };
const CHERRY = [[79, 'Symphony of War'], [1079, 'Symphony of War'], [58, 'Mystic Punch'], [1058, 'Mystic Punch'], [1343, 'Sneakerhead'], [1205, 'ADAPt']].map(([id, nameTRA]) => ({ id, nameTRA, rarity: 'kPrismatic' }));
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p) {
  L.calls.push(`${method} ${p}`);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok(ME);
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: RANKS });
  if (p === '/lol-match-history/v1/products/tft/me-puuid/matches?begin=0&count=20') return ok({ games: GAMES });
  if (p === '/lol-gameflow/v1/session') return ok({ phase: 'InProgress', gameData: { gameId: 8001, queue: { id: 1100, gameMode: 'TFT', isRanked: true }, teamOne: [], teamTwo: [] }, map: { id: 22, gameMode: 'TFT' } });
  if (/^\/lol-match-history\/v1\/products\/lol\//.test(p)) return ok({ games: { games: [] } });
  return { status: 404, data: null };
}
function fakeApp() { // the desktop app 1.13 (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.shares = 0;
  navigator.mediaDevices.getDisplayMedia = async () => { // the screen Settings picks, shared without asking: what the test draws on screenPic
    const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 }), g = c.getContext('2d');
    window.screenPic = window.screenPic || Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    setInterval(() => g.drawImage(window.screenPic, 0, 0), 200);
    window.shares++;
    return c.captureStream(5);
  };
  window.lpcClient = { version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay(s) { window.lastOverlay = s; }, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}

async function context(browser, { app = false, name = 'Rayan' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8084' });
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/127\.0\.0\.1:9004\/(riot|stats)/, (r) => {
    const q = r.request().url().split('/riot/')[1];
    if (r.request().method() === 'POST') { const b = JSON.parse(r.request().postData()); SENT.push([q, b]); return r.fulfill({ body: 'ok', headers: cors }); }
    r.fulfill(q && RATES[q] ? { json: RATES[q], headers: cors } : { status: 404, json: {}, headers: cors });
  });
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    let m;
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: { Ahri: { id: 'Ahri', key: '103', name: 'Ahri', tags: ['Mage', 'Assassin'], info: { attack: 3, magic: 8 } } } }, headers: cors });
    if ((m = /\/tft-(champion|trait|item|augments)\.json$/.exec(u))) return r.fulfill({ json: { data: DD_TFT[m[1]] }, headers: cors });
    if (u.endsWith('/tft-shop-drop-rates-data.json')) return r.fulfill({ json: { type: 'tft-shop-drop-rates', version: '1.1', data: { Shop: ODDS } }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.route(/arammayhem\.com\/data\/v1\/latest\/(augments|combos)\.json$/, (r) => r.fulfill({ json: AMD[/(augments|combos)\.json$/.exec(r.request().url())[1]], headers: cors }));
  await ctx.route(/raw\.communitydragon\.org/, (r) => {
    const u = r.request().url();
    if (u.endsWith('/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json')) return r.fulfill({ json: PLAN, headers: cors });
    if (u.endsWith('/latest/cdragon/tft/en_us.json')) { cdragonLoads++; return r.fulfill({ json: CDRAGON, headers: cors }); }
    if (u.endsWith('/v1/cherry-augments.json')) return r.fulfill({ json: CHERRY, headers: cors });
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
function drawPick(names) { // a Set 18 augment pick on screenPic, at 1280x720: three cards with gold icons over green name banners (no names: no pick)
  const g = window.screenPic.getContext('2d');
  g.fillStyle = '#0b1a24';
  g.fillRect(0, 0, 1280, 720);
  if (names) [366, 640, 913].forEach((x, i) => {
    g.fillStyle = '#0f2a1a'; g.fillRect(x - 116, 185, 232, 347);
    g.fillStyle = '#f0c040'; g.fillRect(x - 40, 245, 80, 72);
    g.fillStyle = '#1e4628'; g.fillRect(x - 110, 344, 220, 34);
    Object.assign(g, { fillStyle: '#f0e6c8', font: 'bold 20px serif', textAlign: 'center', textBaseline: 'middle' }).fillText(names[i], x, 361);
  });
}
function drawMayhem(names) { // an ARAM: Mayhem pick on screenPic: three dark cards with light names and lines of text under them
  const g = window.screenPic.getContext('2d');
  g.fillStyle = '#1a2a3a';
  g.fillRect(0, 0, 1280, 720);
  if (names) [290, 640, 990].forEach((x, i) => {
    g.fillStyle = '#d8c8f0'; g.fillRect(x - 150, 50, 300, 460); // the light frame
    g.fillStyle = '#05101a'; g.fillRect(x - 140, 60, 280, 440);
    Object.assign(g, { fillStyle: '#f4ecd8', font: '22px sans-serif', textAlign: 'center', textBaseline: 'middle' }).fillText(names[i], x, 300);
    Object.assign(g, { font: '13px sans-serif' }).fillText('Gain the Lethal Tempo rune.', x, 360);
  });
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

    // ---- the roll calculator, the item recipes, and My comps closest to the board first
    const [cctx, cam] = await context(browser, { name: 'Cam' });
    cdragonLoads = 0;
    await cam.click('.nav[data-view="tft"]');
    await wait(cam, () => !document.getElementById('tftRollBox').hidden && !document.getElementById('tftItemsBox').hidden, null, 'the roll calculator and the item recipes');
    assert.deepStrictEqual(await texts(cam, '#tftRollUnit option'), ['Ornn (1)', 'Rakan (1)', 'Xayah (1)', 'Hecarim (3)', 'Ahri (4)', 'Ashe (5)', 'Lux (Solar) (5)'], 'by cost, then name');
    assert.deepStrictEqual([await cam.inputValue('#tftRollUnit'), await cam.inputValue('#tftRollLvl')], ['TFT18_Ornn', '8'], 'the first champion and level 8 to start');
    await pool(cam, 'Xayah').click();
    assert.strictEqual(await cam.inputValue('#tftRollUnit'), 'TFT18_Xayah', 'the first champion on your board');
    await cam.selectOption('#tftRollLvl', '1');
    await cam.fill('#tftRollGold', '3');
    await cam.fill('#tftRollHave', '2');
    const roll = async () => [...await texts(cam, '#tftRoll > span'), await text(cam, '#tftRollNote')];
    // every slot a 1 cost at level 1, and 28 of the 88 1 cost copies left Xayah's: one roll (3 gold, 1 kept to buy) hits with 1 - (60/88)^5
    assert.deepStrictEqual(await roll(), ['2 star85%', '3 star0%', '28 of 30 copies left. A 1 cost fills 100% of shop slots at level 1. The 2 star needs 1 more, with 1 roll. Not enough gold to roll for the 3 star.']);
    await cam.fill('#tftRollTaken', '27');
    assert.deepStrictEqual(await roll(), ['2 star8%', '3 star0%', '1 of 30 copies left. A 1 cost fills 100% of shop slots at level 1. The 2 star needs 1 more, with 1 roll. Not enough copies left for the 3 star.'], '1 - (60/61)^5');
    await cam.fill('#tftRollTaken', '28');
    assert.deepStrictEqual((await roll()).slice(0, 2), ['2 star0%', '3 star0%'], 'none left');
    await cam.fill('#tftRollTaken', '0');
    await cam.fill('#tftRollHave', '9');
    assert.deepStrictEqual(await roll(), ['2 star100%', '3 star100%', '21 of 30 copies left. A 1 cost fills 100% of shop slots at level 1. You have the 2 star. You have the 3 star.']);
    await cam.selectOption('#tftRollUnit', 'TFT18_Ahri');
    await cam.selectOption('#tftRollLvl', '3');
    await cam.fill('#tftRollHave', '0');
    await cam.fill('#tftRollGold', '50');
    assert.deepStrictEqual(await roll(), ['2 star0%', '3 star0%', '10 of 10 copies left. A 4 cost doesn’t show in shops at level 3. The 2 star needs 3 more, with 19 rolls. The 3 star needs 9 more, with 7 rolls.']);
    await cam.selectOption('#tftRollLvl', '11');
    await cam.fill('#tftRollGold', '44');
    // Ahri is the only 4 cost here, so each slot is her half the time: 9 or more of 20 slots (4 rolls) is 74.8%
    assert.deepStrictEqual(await roll(), ['2 star100%', '3 star75%', '10 of 10 copies left. A 4 cost fills 50% of shop slots at level 11. The 2 star needs 3 more, with 16 rolls. The 3 star needs 9 more, with 4 rolls.']);
    // the item recipes: this set's and every set's items made of two components, in the game's order
    const grid = () => cam.$$eval('#tftRec tr', (l) => l.map((tr) => [...tr.cells].map((c) => { const i = c.querySelector('img'); return i ? i.alt + (c.classList.contains('want') ? '*' : '') : '-'; }).join(',')));
    assert.deepStrictEqual(await grid(), ['-,B.F. Sword,Tear of the Goddess,Sparring Gloves,Spatula', 'B.F. Sword,Deathblade,Spear of Shojin,Infinity Edge,Fae Emblem', 'Tear of the Goddess,Spear of Shojin,Blue Buff,-,-',
      'Sparring Gloves,Infinity Edge,-,-,-', 'Spatula,Fae Emblem,-,-,-'], 'this set’s items only: Blue Buff over Seraph’s Embrace (not in Data Dragon), no Arcana Emblem from last set');
    assert.deepStrictEqual(await cam.$$eval('#tftRec td img', (l) => ['Infinity Edge', 'Deathblade'].map((n) => l.find((i) => i.alt === n).src)),
      ['https://ddragon.leagueoflegends.com/cdn/1.1/img/tft-item/DA_InfinityEdge.png', 'https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/items/hexcore/da_deathblade.tft_set13.png'], 'Data Dragon’s picture, else CommunityDragon’s');
    assert.strictEqual(await cam.locator('#tftWant li').count(), 0, 'no games on the website, so no gold rings');
    await cam.reload();
    await cam.click('.nav[data-view="tft"]');
    await wait(cam, () => document.querySelectorAll('#tftRec img').length === 16, null, 'the recipes after a restart');
    assert.strictEqual(cdragonLoads, 1, 'kept for the patch');
    // My comps: with champions on the board, the comps sharing most of them first, with who's still needed
    for (const n of ['Rakan', 'Lux (Solar)']) await pool(cam, n).click();
    await cam.click('#tftSave');
    await cam.click('#tftClear');
    for (const n of ['Ahri', 'Ornn']) await pool(cam, n).click();
    await cam.click('#tftSave');
    await cam.click('#tftClear');
    assert.deepStrictEqual(await texts(cam, '#tftMine li > b'), ['1 Mage, 1 Solar', '3 Solar, 1 Sniper'], 'newest first with nothing on the board');
    assert.strictEqual(await cam.locator('#tftMine li .hint').count(), 0);
    await pool(cam, 'Rakan').click();
    assert.deepStrictEqual(await texts(cam, '#tftMine li > b'), ['3 Solar, 1 Sniper', '1 Mage, 1 Solar'], 'the closest first');
    assert.deepStrictEqual(await texts(cam, '#tftMine li .hint'), ['You have 1 of 3. Still need Xayah, Lux (Solar).', 'You have 0 of 2. Still need Ahri, Ornn.']);
    await cam.fill('#tftCode', CODE('413', '429', '801')); // a board's code, as the Team Planner's Snapshot gives it
    assert.strictEqual(await text(cam, '#tftMine li:first-child .hint'), 'You have all 3.');
    await shot(cam, 'tft-helpers');
    await cctx.close();
    console.log('website: roll odds for a 2 and 3 star, item recipes from CommunityDragon kept for the patch, My comps closest to your board first');

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
    assert.deepStrictEqual(await pc.$$eval('#tftAugRows tr', (l) => l.map((r) => [...r.cells].map((c) => c.textContent).join(' '))), ['Rich Get Richer 2 1.5 100%', 'Cluster 2 3.5 50%'], 'and the augments');
    assert.deepStrictEqual(await pc.$$eval('#tftGames > li', (l) => l.map((li) => li.querySelector('.gbody button') ? 'code' : '')), ['code', 'code', 'code', ''], 'no code for the Set 17 game');
    await pc.click('#tftGames > li:first-child summary');
    await pc.click('#tftGames > li:first-child .gbody button');
    await wait(pc, () => lpc.toasts().includes('Team code copied. In League, open the Team Planner and press Paste.'), null, 'the board copied');
    assert.strictEqual(await pc.evaluate(() => navigator.clipboard.readText()), CODE('514', '413', '429'), 'Ahri first (4 cost), then Xayah and Rakan; the summon left out');
    await shot(pc, 'tft-app');
    // gold rings on the items you put on your board's champions in your games: Xayah's Infinity Edges and Blue Buff
    await pool(pc, 'Xayah').click();
    await wait(pc, () => document.querySelectorAll('#tftRec td.want').length === 3, null, 'gold rings on Xayah’s items');
    assert.deepStrictEqual(await pc.$$eval('#tftRec td.want img', (l) => l.map((i) => i.alt)), ['Infinity Edge', 'Blue Buff', 'Infinity Edge']);
    assert.deepStrictEqual(await texts(pc, '#tftWant li b'), ['Xayah: Infinity Edge, Blue Buff']);
    await pc.locator('#tftItemsBox').scrollIntoViewIfNeeded();
    await shot(pc, 'tft-recipes');
    // the recipes over a TFT game, when the Overlay page says so: the Layout's sample, then a game from League's client
    await pc.click('.nav[data-view="overlay"]');
    await pc.check('#optOverlayTft');
    await wait(pc, () => [...document.querySelectorAll('#ovHandles .ovhandle')].some((b) => b.textContent === 'TFT items'), null, 'TFT items on the Layout');
    assert.strictEqual(await pc.frameLocator('#ovFrame').locator('.rec img.want').count(), 3, 'drawn by overlay.html');
    await shot(pc, 'tft-overlay');
    assert(!(await pc.evaluate(() => window.lastOverlay && window.lastOverlay.tft)), 'not outside a TFT game');
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'InProgress' }));
    await wait(pc, () => window.lastOverlay && window.lastOverlay.tft, null, 'the recipes on the overlay in a TFT game');
    const ov = await pc.evaluate(() => window.lastOverlay.tft);
    assert.deepStrictEqual([ov.c.map(([n]) => n), ...ov.g.map((r) => r.map((x) => (x ? x[0] + (x[2] ? '*' : '') : '-')).join(','))], [['B.F. Sword', 'Tear of the Goddess', 'Sparring Gloves', 'Spatula'],
      'Deathblade,Spear of Shojin,Infinity Edge*,Fae Emblem', 'Spear of Shojin,Blue Buff*,-,-', 'Infinity Edge*,-,-,-', 'Fae Emblem,-,-,-']);
    // the ratings on the augment cards, when the Overlay page says so: the app shares the screen by itself in the TFT
    // game, reads the pick's three names and puts on each card how you placed with it; none once the pick is gone
    assert.strictEqual(await pc.evaluate(() => window.shares), 0, 'no screen shared without it');
    await pc.check('#optTftAugs');
    await wait(pc, () => window.shares === 1, null, 'the screen shared in the TFT game');
    await pc.evaluate(drawPick, ['Rich Get Richer', 'Cluster', 'Gold Destiny']);
    await wait(pc, () => (lpc.augCards() || { names: [] }).names.every(Boolean) && window.lastOverlay.cards, null, 'the three cards read', 60000);
    assert.deepStrictEqual(await pc.evaluate(() => lpc.augCards().names), ['Rich Get Richer', 'Cluster', 'Gold Destiny'], 'Cluster, not Cluster+, and the gold Gold Destiny');
    assert.deepStrictEqual(await pc.evaluate(() => window.lastOverlay.cards), [{ x: 0.2859, y: 0.73, t: 'Tier S · 3.33 average place · 30 games', k: 'good' },
      { x: 0.5, y: 0.73, t: 'Your average: 3.5 in 2 games', k: 'good' }, { x: 0.7133, y: 0.73, t: 'Not in your last 4 games', k: '' }], 'its tier from Premade players’ games, else how you placed with it, at the foot of its card');
    assert.deepStrictEqual(SENT.filter(([q]) => q === 'tftaug').map(([q, b]) => [q, b.g, b.s, b.ps.map((p) => p.p).join(''), b.ps[0].a]), // you first, then the others
      [['tftaug', 'EUW1_7001', 18, '21345678', ['TFT18_Augment_Rich', 'TFT18_Augment_Cluster']], ['tftaug', 'EUW1_7002', 18, '51234678', ['TFT18_Augment_Cluster']], ['tftaug', 'EUW1_7003', 18, '12345678', ['TFT18_Augment_Rich']],
        ['tftaug', 'EUW1_7004', 17, '61234578', []]], 'each ranked game’s places and augments sent to our server once');
    assert.strictEqual(await pc.evaluate(() => window.lastOverlay.board), true, 'over the whole screen');
    await pc.evaluate(drawPick, null);
    await wait(pc, () => !window.lastOverlay.cards, null, 'none once the pick is gone');
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'EndOfGame' }));
    await wait(pc, () => !window.lastOverlay.tft && !lpc.augCards(), null, 'gone after the game, and the screen no longer read');
    // ARAM: Mayhem's cards: with its box ticked the app shares the screen in a Mayhem game, Tesseract reads the names
    // anywhere in the middle while a pick may be up (the start, levels 7, 11 and 15, while dead), and each card says how
    // many of Ahri's games took it, above its name; none between picks
    const mayhemAt = (t, dead = false, lvl = 3) => pc.evaluate(([t, dead, lvl]) => lpcClient.emit('league', { inGame: true, phase: 'InProgress', mode: 'KIWI', t, room: 'g0123456789b', result: '', events: [],
      me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead, respawn: 0, hp: 1, speed: 330 }, players: [{ name: 'Rayan#EUW', team: 'ORDER', champ: 'Ahri', champName: 'Ahri', pos: '', lvl, k: 0, d: 0, a: 0, cs: 0, items: [] }] }), [t, dead, lvl]);
    await pc.check('#optMayhemAugs');
    await mayhemAt(20);
    await wait(pc, () => window.shares === 2, null, 'the screen shared in the Mayhem game (30 s after the last share at most)', 45000);
    await pc.evaluate(drawMayhem, ['Symphony of War', 'Mystic Punch', 'Sneakerhead']);
    await wait(pc, () => (window.lastOverlay.cards || []).length === 3, null, 'the Mayhem cards read', 60000);
    assert.deepStrictEqual(await pc.evaluate(() => window.lastOverlay.cards.map((c, i) => [c.t, Math.abs(c.x * 1280 - [290, 640, 990][i]) <= 5, Math.abs(c.y * 720 - 466) <= 6])), // the frame's foot is at y 500, the name at y 300: 16% of the way up
      [['Symphony of War: picked 40% of the time on all champions (arammayhem.com)', true, true], ['Mystic Punch: picked 5% of the time on all champions (arammayhem.com)', true, true], ['Sneakerhead: no pick rate yet', true, true]], 'arammayhem.com’s pick rates, at the foot of each card');
    assert.deepStrictEqual(await pc.evaluate(() => window.lastOverlay.cards.map((c) => [c.p, c.v, c.k, c.s, c.g, c.gk])), [['40%', 1, 'good', 'all champions · arammayhem.com', 'God combo with Ahri', 'good'], ['5%', 0.125, '', 'all champions · arammayhem.com', 'Trap with Ahri', 'bad'], [undefined, undefined, '', undefined, undefined, undefined]],
      'a bar for each with a pick rate, as long as it against the most picked, which is marked; Ahri’s combos (not Ashe’s)');
    await shot(pc, 'mayhem-augment-cards');
    await mayhemAt(300);
    await wait(pc, () => !window.lastOverlay.cards, null, 'none between picks');
    // reaching level 7 alive: read again until the pick has gone, then not till the next level
    await mayhemAt(400, false, 7);
    await wait(pc, () => (window.lastOverlay.cards || []).length === 3, null, 'the level 7 pick read', 30000);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.cards, null, 'gone once picked', 30000);
    await pc.evaluate(drawMayhem, ['Symphony of War', 'Mystic Punch', 'Sneakerhead']);
    await new Promise((r) => setTimeout(r, 5000));
    assert(!(await pc.evaluate(() => window.lastOverlay.cards)), 'not read again after the pick');
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'EndOfGame' }));
    await new Promise((r) => setTimeout(r, 2000));
    assert.deepStrictEqual(SENT.filter(([q]) => q === 'mayhem'), [], 'no Mayhem games sent to our server');
    // the same boards on Profile's TFT tab
    await pc.click('.nav[data-view="profile"]');
    await pc.click('#proQueues .tab[data-q="tft"]');
    await wait(pc, () => document.querySelectorAll('#proGames .gbody button').length === 3, null, 'Profile’s TFT boards with their codes');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    await pctx.close();
    console.log('desktop app: TFT ranks, your last games with your traits and augments, a team code for each Set 18 board (here and on Profile), none for Set 17, your items ringed in the recipes and over TFT games, ratings on TFT’s and ARAM: Mayhem’s augment cards (arammayhem.com’s for Mayhem), TFT games sent for them');

    // ---- overlay.html puts each card's words at the foot of the card, as shares of the screen
    const ovp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await ovp.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
    await ovp.goto('http://127.0.0.1:8084/overlay.html');
    await ovp.evaluate(() => window.fire({ visible: true, board: true, pos: 'tl', scale: 1, opacity: 1, cards: [{ x: 0.2859, y: 0.73, t: 'Your average: 1.5 in 2 games', k: 'good' }, { x: 0.7133, y: 0.73, t: 'Not in your last 4 games', k: '' }] }));
    assert.deepStrictEqual(await ovp.$$eval('.augc', (l) => l.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), e.classList.contains('good')]; })),
      [['Your average: 1.5 in 2 games', 366, 526, true], ['Not in your last 4 games', 913, 526, false]]);
    await shot(ovp, 'tft-augment-cards');
    await ovp.close();
    console.log('overlay: the ratings at the foot of the augment cards');
  } finally {
    await browser.close();
  }
  console.log('TFT tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

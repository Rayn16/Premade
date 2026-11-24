// Test of the TFT page in site/index.html (What's new 204), in headless Chromium: on the website, the Team Planner style
// builder from the Team Planner's champions (CommunityDragon's copy of League's game data, faked here) in a row a cost,
// 10 slots, the board's traits with their breakpoints, a trait tapped to show only its champions, Riot's team code
// copied with where to paste it, Paste code from the clipboard (and another set's code refused), My comps saved,
// loaded and deleted; Rolling: your level's 5 cost odds as bars and a board champion's 2 and 3 star chances as rings;
// the item recipes by component (CommunityDragon's TFT data, faked here: this set's items and every set's, an old item
// with a current one's recipe, another set's emblem) and My comps closest to the board first; then with a stand-in for
// the desktop app 1.13 and a fake League client behind it: your TFT ranks, your last games as places with your average
// place, top 4s, traits and augments, each game's units with stars and items, each Set 18 board's team code (champions
// matched by name when match history and the Team Planner name them differently), none for an older set's board, gold
// rings on the items you built, the recipes on the overlay in a TFT
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
const openPage = async (p, v) => { if (!(await p.isVisible(`.nav[data-view="${v}"]`))) await p.click('#leagueNav'); await p.click(`.nav[data-view="${v}"]`); }; // the sidebar shows Premade's or League's list (What's new 178): swap it if the page isn't on it

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
const bp = (name, ...at) => ({ apiName: 'TFT18_' + name, name, effects: at.map((minUnits) => ({ minUnits })) }); // a trait and its breakpoints
const CDRAGON = { sets: { 17: { champions: [] }, 18: { champions: [], traits: [bp('Solar', 2, 4, 6), bp('Vanguard', 2, 4), bp('Sniper', 2, 3, 4, 5), bp('Mage', 1)] } }, items: [...CD_ITEMS, ...CD_AUGS], setData: [{ mutator: 'TFTSet17', items: ['TFT17_Item_ArcanaEmblemItem', 'DA_Component_Spatula', 'DA_Component_BFSword'] },
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
// Mayhem pick rates on all champions and Ahri's combos: Symphony of War
// a god combo, Mystic Punch a trap
const RATES = { 'tftaug?s=18': { s: 18, a: { TFT18_Augment_Rich: [12, 40, 9], DA_18_Augment_Rich: [18, 60, 14], DA_18_Cluster: [5, 25, 2] } } };
const SENT = [];
const DEEPARAM = { // our server's /mayhem/augments: DeepARAM's rows for a champion (Sneakerhead not listed; One Hit Wonder, new, not in CommunityDragon's list)
  Ahri: [['Symphony of War', 'prismatic', 0.4, 72, 'S', 3.2], ['Mystic Punch', 'prismatic', 0.05, 40, 'C', -1.5], ['Witchful Thinking', 'prismatic', 0.2, 60, 'A', 1],
    ['Escape Plan', 'gold', 0.3, 55, 'B', 2], ['One Hit Wonder', 'gold', 0.1, 41, 'C', 0.5], ['Bad Gold', 'gold', 0.01, 10, 'D', -3], ['Blunt Force', 'silver', 0.2, 35, 'C', 0.2], ['ADAPt', 'silver', 0.1, 20, 'D', -0.4]]
    .map(([name, rarity, pickRate, deepScore, tier, boost]) => ({ name, rarity, pickRate, deepScore, tier, boost })),
  MissFortune: [{ name: 'Symphony of War', rarity: 'silver', pickRate: 0.1, deepScore: 50, tier: 'B' }], // the server before its Nov 2026 update: no boost, pairs or items
};
// the server of 21 Nov (What's new 180): DeepARAM's Augment synergies with why, both core builds (Ahri's AP build has
// Escape Plan, id 1301, in its best augments) and Ahri's Mayhem changes
const DEEPARAM_MORE = { Ahri: { pairs: [['Symphony of War', 'Escape Plan'], ['Mystic Punch', 'One Hit Wonder'], ['ADAPt', 'Bad Gold']], why: ['Both hit harder in fights.', 'More casts, more hits.', ''], items: [3020, 6655, 3157],
  builds: [{ items: [3020, 6655, 3157], then: [], win: 48.2, pick: 5.1, boost: 1.2, augs: [1301] }, { items: [3006, 3031, 3046], then: [3157], win: 49.5, pick: 1.4, boost: -0.8, augs: [] }],
  changes: [['Q Orb of Deception', 'Damage', '40/65/90', '50/75/100']] } };
const ITEMS = { 1001: ['Boots', 300, ['Boots']], 3020: ['Sorcerer’s Shoes', 1100, ['Boots'], [1001]], 6655: ['Luden’s Echo', 2750], 3157: ['Zhonya’s Hourglass', 3250],
  3006: ['Berserker’s Greaves', 1100, ['Boots'], [1001]], 3031: ['Infinity Edge', 3450], 3046: ['Phantom Dancer', 2650] }; // Data Dragon's item.json, the few the Mayhem builds have
// a Mayhem game in your match history: the augments you took, in order (playerAugment1-6)
const MAY_GAME = { gameId: 8100, gameCreation: Date.now() - 3600e3, gameDuration: 1140, queueId: 2400, gameMode: 'KIWI', participants: [{ participantId: 1, teamId: 100, championId: 103, stats: { win: true, kills: 14, deaths: 6, assists: 22, totalMinionsKilled: 88, item0: 6655, playerAugment1: 1079, playerAugment2: 1301, playerAugment3: 1302, playerAugment4: 1205, playerAugment5: 1097, playerAugment6: 0 } }] };
const AMD = { augments: { rows: [['Symphony of War', 20], ['Mystic Punch', 50], ['Sneakerhead', 9]].map(([en, pickRate]) => ({ name: { en }, pickRate })) },
  combos: { rows: [{ championId: 'Ahri', augmentNames: [{ en: 'Symphony of War' }], types: ['god'] }, { championId: 'Ahri', augmentNames: [{ en: 'Mystic Punch' }], types: ['trap'] }, { championId: 'Ashe', augmentNames: [{ en: 'Mystic Punch' }], types: ['god'] }] } };
const CHERRY = [[79, 'Symphony of War'], [1079, 'Symphony of War'], [58, 'Mystic Punch'], [1058, 'Mystic Punch'], [1343, 'Sneakerhead'], [1205, 'ADAPt'], [97, 'Witchful Thinking'], [1097, 'Witchful Thinking'], [1301, 'Escape Plan'], [1302, 'Blunt Force']].map(([id, nameTRA]) => ({ id, nameTRA, rarity: 'kPrismatic' }));
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p) {
  L.calls.push(`${method} ${p}`);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok(ME);
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: RANKS });
  if (p === '/lol-match-history/v1/products/tft/me-puuid/matches?begin=0&count=20') return ok({ games: GAMES });
  if (p === '/lol-gameflow/v1/session') return ok({ phase: 'InProgress', gameData: { gameId: 8001, queue: { id: 1100, gameMode: 'TFT', isRanked: true }, teamOne: [], teamTwo: [] }, map: { id: 22, gameMode: 'TFT' } });
  if (p === '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19') return ok({ games: { games: [MAY_GAME] } });
  if (/^\/lol-match-history\/v1\/products\/lol\//.test(p)) return ok({ games: { games: [] } });
  return { status: 404, data: null };
}
function fakeApp() { // the desktop app 1.13 (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.shares = 0;
  navigator.mediaDevices.getDisplayMedia = async () => { // the screen Settings picks, shared without asking: what the test draws on screenPic
    const c = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 }), g = c.getContext('2d');
    window.screenPic = window.screenPic || Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    setInterval(() => { if (c.width !== window.screenPic.width) Object.assign(c, { width: window.screenPic.width, height: window.screenPic.height }); g.drawImage(window.screenPic, 0, 0); }, 200); // a 1920x1080 screen too
    window.shares++;
    return c.captureStream(5);
  };
  window.lpcClient = { version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay(s) { window.lastOverlay = s; }, front() {},
    mayCards(on) { window.mayOn = on; }, // app 1.51: Mayhem's cards are up (the test sends may-click as the app would)
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
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: { Ahri: { id: 'Ahri', key: '103', name: 'Ahri', tags: ['Mage', 'Assassin'], info: { attack: 3, magic: 8 } }, MissFortune: { id: 'MissFortune', key: '21', name: 'Miss Fortune', tags: ['Marksman'], info: { attack: 8, magic: 2 } }, Yasuo: { id: 'Yasuo', key: '157', name: 'Yasuo', tags: ['Fighter', 'Assassin'], info: { attack: 8, magic: 4 } } } }, headers: cors });
    if (u.endsWith('/item.json')) return r.fulfill({ json: { data: Object.fromEntries(Object.entries(ITEMS).map(([id, [name, total, tags = [], from = []]]) => [id, { name, gold: { total }, tags, from, maps: { 11: true } }])) }, headers: cors });
    if ((m = /\/tft-(champion|trait|item|augments)\.json$/.exec(u))) return r.fulfill({ json: { data: DD_TFT[m[1]] }, headers: cors });
    if (u.endsWith('/tft-shop-drop-rates-data.json')) return r.fulfill({ json: { type: 'tft-shop-drop-rates', version: '1.1', data: { Shop: ODDS } }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.route(/127\.0\.0\.1:9004\/mayhem\/augments/, (r) => { const c = new URL(r.request().url()).searchParams.get('champ'); r.fulfill(DEEPARAM[c] ? { json: { source: 'https://deeparam.com/tier-list', champion: c, patch: '26.21', rows: DEEPARAM[c], ...DEEPARAM_MORE[c] }, headers: cors } : { status: 502, json: {}, headers: cors }); });
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
function drawMayhem(arg) { // an ARAM: Mayhem pick on screenPic: three dark cards (or four, Maestro's) with light names and lines of text under them, on a 1280x720 screen or { n: names, w: 1920 }
  const [names, W] = Array.isArray(arg) || !arg ? [arg, 1280] : [arg.n, arg.w], k = W / 1280, pic = window.screenPic;
  if (pic.width !== W) Object.assign(pic, { width: W, height: (W * 9) / 16 });
  const g = pic.getContext('2d'), four = names && names.length === 4, half = four ? 100 : 150;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = '#1a2a3a';
  g.fillRect(0, 0, 1280, 720);
  if (names) (four ? [280, 520, 760, 1000] : [290, 640, 990]).forEach((x, i) => {
    g.fillStyle = '#d8c8f0'; g.fillRect(x - half, 50, half * 2, 460); // the light frame
    g.fillStyle = '#05101a'; g.fillRect(x - half + 10, 60, half * 2 - 20, 440);
    Object.assign(g, { fillStyle: '#f4ecd8', font: `${four ? 18 : 22}px sans-serif`, textAlign: 'center', textBaseline: 'middle' }).fillText(names[i], x, 300);
    Object.assign(g, { font: '13px sans-serif' }).fillText(four ? 'Gain Lethal Tempo.' : 'Gain the Lethal Tempo rune.', x, 360);
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; page ${JSON.stringify(await page.evaluate(() => document.querySelector('main > .view:not([hidden])').innerText.slice(0, 600)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).textContent();
const texts = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.textContent));
const pool = (page, name) => page.locator(`#tftPool .tftface[aria-label="${name}"]`);
const labels = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.getAttribute('aria-label')));
const copied = async (page) => { await page.click('#tftCopy'); return page.evaluate(() => navigator.clipboard.readText()); };
const paste = async (page, code) => { // the clipboard read is async: done when the note says what happened
  await page.evaluate((c) => { document.getElementById('tftCodeNote').textContent = ''; return navigator.clipboard.writeText(c); }, code);
  await page.click('#tftPaste');
  await wait(page, () => document.getElementById('tftCodeNote').textContent, null, 'the pasted code read');
};
const traitRows = (page) => page.$$eval('#tftTraits .tfttrait', (l) => l.map((b) => `${b.children[1].textContent} ${b.children[2].textContent} ${b.children[3].textContent || '-'} ${b.dataset.t || 'off'}`));

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    // ---- the website: build a team, copy its code, paste one, save comps
    const [actx, ana] = await context(browser, { name: 'Ana' });
    await openPage(ana, 'tft');
    await wait(ana, () => document.querySelectorAll('#tftPool .tftface').length === 7, null, 'Set 18’s Team Planner champions');
    assert.deepStrictEqual(await ana.$$eval('#tftPool .tftrow', (l) => l.map((r) => r.dataset.cost + ': ' + [...r.querySelectorAll('.tftface')].map((b) => b.getAttribute('aria-label')).join(', '))),
      ['1: Ornn, Rakan, Xayah', '3: Hecarim', '4: Ahri', '5: Ashe, Lux (Solar)'], 'a row a cost, by name; no row without a champion; none without a number');
    assert.strictEqual(await pool(ana, 'Xayah').locator('img').getAttribute('src'),
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/tft18_xayah/hud/tft18_xayah_square.tft_set18.png', 'its CommunityDragon picture');
    assert.strictEqual(await ana.locator('#tftBoard li').count(), 10, '10 slots');
    assert(await ana.locator('#tftGamesBox').isHidden(), 'no games on the website');
    assert(await ana.locator('#tftMineBox').isHidden(), 'no saved comps yet');
    assert(await ana.locator('#tftCopy').isDisabled(), 'nothing to copy yet');
    assert(await ana.locator('#tftNewSet').isHidden(), 'Data Dragon has no newer set');
    for (const id of ['tftNote', 'tftCode', 'tftFind', 'tftShare', 'tftOddsBox', 'tftRollUnit', 'tftRec']) assert.strictEqual(await ana.locator('#' + id).count(), 0, `no #${id}`);
    assert.strictEqual(await ana.locator('.view[data-view="tft"] .pagehead').count(), 0, 'no title');
    await pool(ana, 'Xayah').click();
    await pool(ana, 'Rakan').click();
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftslot span'), ['Xayah', 'Rakan']);
    assert.deepStrictEqual(await traitRows(ana), ['2 Solar 246 b', '1 Sniper 2345 off', '1 Vanguard 24 off'], 'with their breakpoints: Solar on at 2');
    assert.deepStrictEqual(await texts(ana, '#tftOther button'), ['Mage'], 'a pill for each trait not on the board');
    assert.strictEqual(await pool(ana, 'Xayah').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(await copied(ana), CODE('413', '429'), 'Xayah 1043 and Rakan 1065 in hex');
    await ana.locator('#tftTraits .tfttrait', { hasText: 'Sniper' }).click();
    assert.deepStrictEqual(await labels(ana, '#tftPool .tftface'), ['Xayah', 'Ashe'], 'a trait shows only its champions');
    await pool(ana, 'Ashe').click();
    await ana.locator('#tftTraits .tfttrait', { hasText: 'Sniper' }).click();
    assert.strictEqual(await ana.locator('#tftPool .tftface').count(), 7, 'tapped again: all of them');
    await pool(ana, 'Lux (Solar)').click();
    assert.strictEqual(await copied(ana), CODE('413', '429', '578', '801'), 'Ashe 1400 and Lux 2049');
    await ana.locator('#tftBoard .tftslot', { hasText: 'Ashe' }).click();
    assert.strictEqual(await copied(ana), CODE('413', '429', '801'), 'Ashe taken off');
    await wait(ana, () => lpc.toasts().includes('Team code copied. In TFT, open the Team Planner and press Paste.'), null, 'where to paste it');
    await shot(ana, 'tft-page');
    console.log('website: a team from Set 18’s cost rows with its traits and breakpoints, a trait filtering them, its team code copied with where to paste it');
    // saved, cleared, a code pasted in, then the saved one loaded again
    await ana.click('#tftSave');
    assert.deepStrictEqual(await texts(ana, '#tftMine li b'), ['3 Solar, 1 Sniper']);
    assert.deepStrictEqual(await texts(ana, '#tftMine li small'), ['3 Solar · 1 Sniper · 1 Vanguard'], 'its top 3 traits');
    assert.strictEqual(await ana.locator('#tftMine li img').count(), 3);
    await ana.click('#tftClear');
    assert.strictEqual(await ana.locator('#tftBoard .tftslot').count(), 0);
    await paste(ana, CODE('514', '44c'));
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftslot span'), ['Ahri', 'Ornn'], 'a pasted code opens');
    assert.strictEqual(await text(ana, '#tftCodeNote'), 'Opened a comp of 2 champions.');
    await paste(ana, '02005000000000000000000000000000TFTSet17');
    assert.strictEqual(await text(ana, '#tftCodeNote'), 'That code is for Set 17. TFT’s Team Planner takes Set 18 codes.');
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftslot span'), ['Ahri', 'Ornn'], 'and nothing changes');
    await paste(ana, '02413');
    assert.match(await text(ana, '#tftCodeNote'), /^That isn’t a whole team code/);
    await paste(ana, ' ');
    assert.strictEqual(await text(ana, '#tftCodeNote'), 'Copy a team code first, then press Paste code.');
    await ana.click('#tftMine .tftload');
    assert.deepStrictEqual(await texts(ana, '#tftBoard .tftslot span'), ['Xayah', 'Rakan', 'Lux (Solar)'], 'the saved comp back');
    await ana.reload();
    await openPage(ana, 'tft');
    await wait(ana, () => document.querySelectorAll('#tftBoard .tftslot').length === 3 && document.querySelectorAll('#tftMine li').length === 1, null, 'the comp and My comps after a restart');
    await ana.click('#tftMine .sx');
    assert.strictEqual(await ana.locator('#tftMine li').count(), 0);
    assert(await ana.locator('#tftMineBox').isHidden(), 'gone with the last comp');
    console.log('website: My comps saved, loaded and deleted, kept over a restart; a pasted code opens, another set’s refused');
    await actx.close();

    // ---- Rolling, the item recipes, and My comps closest to the board first
    const [cctx, cam] = await context(browser, { name: 'Cam' });
    cdragonLoads = 0;
    await openPage(cam, 'tft');
    await wait(cam, () => !document.getElementById('tftRollBox').hidden && !document.getElementById('tftItemsBox').hidden, null, 'Rolling and the item recipes');
    assert.deepStrictEqual(await texts(cam, '#tftLvls button'), ['3', '4', '5', '6', '7', '8', '9', '10'], 'levels 3 to 10');
    assert.deepStrictEqual(await texts(cam, '#tftLvls [aria-pressed="true"]'), ['8'], 'level 8 to start');
    const odds = () => cam.$$eval('#tftOdds li', (l) => l.map((li) => li.textContent));
    assert.deepStrictEqual(await odds(), ['1 cost15%', '2 cost20%', '3 cost32%', '4 cost30%', '5 cost3%']);
    await cam.locator('#tftLvls button', { hasText: /^7$/ }).click();
    assert.deepStrictEqual(await odds(), ['1 cost19%', '2 cost30%', '3 cost40%', '4 cost10%', '5 cost1%'], 'level 7’s');
    assert.strictEqual(await cam.locator('#tftRoll .tftring').count(), 0, 'no rings without a champion on the board');
    await pool(cam, 'Xayah').click();
    await pool(cam, 'Ahri').click();
    assert.deepStrictEqual(await labels(cam, '#tftRollPick [aria-pressed="true"]'), ['Xayah'], 'the first champion on your board');
    await cam.locator('#tftLvls button', { hasText: /^3$/ }).click();
    await cam.fill('#tftRollGold', '3');
    await cam.fill('#tftRollHave', '2');
    const roll = async () => [...await texts(cam, '#tftRoll .tftring'), await text(cam, '#tftRollNote')];
    // a slot is a 1 cost 75% of the time at level 3, and 28 of the 88 1 cost copies left are Xayah's: one roll (3 gold, 1 kept to buy) hits with 1 - (1 - 0.75 * 28/88)^5
    assert.deepStrictEqual(await roll(), ['74%2 star', '0%3 star', '28 of 30 Xayah left in the pool. Not enough gold to roll for the 3 star.']);
    await cam.fill('#tftRollTaken', '28');
    assert.deepStrictEqual(await roll(), ['0%2 star', '0%3 star', '0 of 30 Xayah left in the pool. Not enough copies left for the 2 star. Not enough copies left for the 3 star.'], 'none left');
    await cam.fill('#tftRollTaken', '0');
    await cam.fill('#tftRollHave', '9');
    assert.deepStrictEqual(await roll(), ['100%2 star', '100%3 star', '21 of 30 Xayah left in the pool. You have the 2 star. You have the 3 star.']);
    await cam.click('#tftRollPick [aria-label="Ahri"]');
    await cam.fill('#tftRollHave', '0');
    await cam.fill('#tftRollGold', '50');
    assert.deepStrictEqual(await roll(), ['0%2 star', '0%3 star', '10 of 10 Ahri left in the pool. A 4 cost doesn’t show at level 3.']);
    await cam.locator('#tftLvls button', { hasText: /^10$/ }).click();
    await cam.fill('#tftRollGold', '44');
    // Ahri is the only 4 cost here, so each slot is her 40% of the time: 9 or more of 20 slots (4 rolls)
    assert.deepStrictEqual((await roll()).slice(0, 2), ['>99%2 star', '40%3 star']);
    // the item recipes: the components in the game's order, the first one's items, each with the other component
    assert.deepStrictEqual(await labels(cam, '#tftParts button'), ['B.F. Sword', 'Tear of the Goddess', 'Sparring Gloves', 'Spatula']);
    const makes = () => cam.$$eval('#tftMakes li', (l) => l.map((li) => li.querySelector('b').textContent + ' ' + li.querySelector('small').textContent + (li.querySelector('img.used') ? '*' : '')));
    assert.deepStrictEqual(await makes(), ['Deathblade with B.F. Sword', 'Spear of Shojin with Tear of the Goddess', 'Infinity Edge with Sparring Gloves', 'Fae Emblem with Spatula'], 'this set’s items only, no Arcana Emblem from last set');
    await cam.click('#tftParts [aria-label="Tear of the Goddess"]');
    assert.deepStrictEqual(await makes(), ['Spear of Shojin with B.F. Sword', 'Blue Buff with Tear of the Goddess'], 'Blue Buff over Seraph’s Embrace (not in Data Dragon)');
    assert.deepStrictEqual(await cam.$$eval('#tftMakes li > img', (l) => l.map((i) => i.src)),
      ['https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/items/hexcore/da_spearofshojin.tft_set13.png', 'https://ddragon.leagueoflegends.com/cdn/1.1/img/tft-item/DA_BlueBuff.png'], 'Data Dragon’s picture, else CommunityDragon’s');
    await cam.reload();
    await openPage(cam, 'tft');
    await wait(cam, () => document.querySelectorAll('#tftParts img').length === 4, null, 'the recipes after a restart');
    assert.strictEqual(cdragonLoads, 1, 'kept for the patch');
    await cam.click('#tftClear');
    // My comps: with champions on the board, the comps sharing most of them first
    for (const n of ['Rakan', 'Lux (Solar)']) await pool(cam, n).click();
    await cam.click('#tftSave');
    await cam.click('#tftClear');
    for (const n of ['Ahri', 'Ornn']) await pool(cam, n).click();
    await cam.click('#tftSave');
    await cam.click('#tftClear');
    assert.deepStrictEqual(await texts(cam, '#tftMine li b'), ['1 Mage, 1 Solar', '2 Solar, 1 Vanguard'], 'newest first with nothing on the board');
    await pool(cam, 'Rakan').click();
    assert.deepStrictEqual(await texts(cam, '#tftMine li b'), ['2 Solar, 1 Vanguard', '1 Mage, 1 Solar'], 'the closest first');
    await shot(cam, 'tft-helpers');
    await cctx.close();
    console.log('website: Rolling, your level’s odds and a 2 and 3 star chance, item recipes by component from CommunityDragon kept for the patch, My comps closest to your board first');

    // ---- the desktop app with League open: ranks, games, traits, and each Set 18 board's team code
    const [pctx, pc] = await context(browser, { app: true });
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(pc, () => lpc.lcu().me0, null, 'you in League');
    await openPage(pc, 'tft');
    await wait(pc, () => document.querySelectorAll('#tftGames > li').length === 4 && document.querySelectorAll('#tftGames .btn').length === 3, null, 'your TFT games with their team codes');
    assert.match(await text(pc, '#tftRanks'), /TFT[\s\S]*Gold II[\s\S]*Double Up[\s\S]*Unranked[\s\S]*Hyper Roll[\s\S]*Blue[\s\S]*3200 rating/);
    assert.strictEqual(await pc.evaluate(() => document.getElementById('h-tftgames').firstChild.nodeValue), 'Your last 4 games ');
    assert.deepStrictEqual(await texts(pc, '#tftPlaces li'), ['2', '5', '1', '6'], 'a square a game, newest first');
    assert.deepStrictEqual(await pc.$$eval('#tftPlaces li', (l) => l.map((x) => x.dataset.r)), ['top', '', 'first', '']);
    assert.deepStrictEqual(await texts(pc, '#tftForm > span'), ['3.5Average place', '2 of 4Top 4', '1Firsts']);
    assert.deepStrictEqual(await pc.$$eval('#tftTraitRows tr', (l) => l.map((r) => [...r.cells].map((c) => c.textContent).join(' '))), ['Solar 3 2.7 67%', 'Vanguard 2 1.5 100%'], 'the traits you played twice or more');
    assert.deepStrictEqual(await pc.$$eval('#tftAugRows tr', (l) => l.map((r) => [...r.cells].map((c) => c.textContent).join(' '))), ['Rich Get Richer 2 1.5 100%', 'Cluster 2 3.5 50%'], 'and the augments');
    assert.deepStrictEqual(await pc.$$eval('#tftGames > li', (l) => l.map((li) => li.querySelector('.btn') ? 'code' : '')), ['code', 'code', 'code', ''], 'no code for the Set 17 game');
    assert.deepStrictEqual(await pc.$$eval('#tftGames > li:first-child', (l) => l.map((li) => [li.querySelector('.gp').textContent, li.querySelector('.gm b').textContent, [...li.querySelectorAll('.gu > span')].map((u) => u.querySelector('.st').textContent + u.querySelectorAll('.gi img').length)])),
      [['2nd', 'Ranked TFT', ['★★2', '★★0', '★0', '★0']]], 'units with their stars and items');
    assert(await pc.locator('#tftAll').isHidden(), 'Show all only past 6 games');
    await pc.click('#tftGames > li:first-child .btn');
    await wait(pc, () => lpc.toasts().includes('Team code copied. In TFT, open the Team Planner and press Paste.'), null, 'the board copied');
    assert.strictEqual(await pc.evaluate(() => navigator.clipboard.readText()), CODE('514', '413', '429'), 'Ahri first (4 cost), then Xayah and Rakan; the summon left out');
    await shot(pc, 'tft-app');
    // gold rings on the items you built in your last games: Infinity Edge and Blue Buff
    await wait(pc, () => document.querySelectorAll('#tftMakes img.used').length === 1, null, 'a gold ring on Infinity Edge');
    assert.deepStrictEqual(await pc.$$eval('#tftMakes img.used', (l) => l.map((i) => i.title)), ['Infinity Edge']);
    await pc.click('#tftParts [aria-label="Tear of the Goddess"]');
    assert.deepStrictEqual(await pc.$$eval('#tftMakes img.used', (l) => l.map((i) => i.title)), ['Blue Buff']);
    await pc.locator('#tftItemsBox').scrollIntoViewIfNeeded();
    await shot(pc, 'tft-recipes');
    await pool(pc, 'Xayah').click(); // for the overlay's gold rings: Xayah's items in your games
    // the recipes over a TFT game, when Settings, Overlay says so: the Layout's sample, then a game from League's client
    await openPage(pc, 'settings');
    await pc.click('#setList [data-sec="overlay"]');
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
    // ARAM: Mayhem's cards: with its box ticked the app shares the screen in a Mayhem game, and while a pick is due (1 at
    // the start, one more at levels 7, 11 and 15) Tesseract reads the names anywhere in the middle; each card gets its
    // tier over a DeepScore bar with its pick rate and Boost, the strongest glows and the weakest C or D says Reroll?
    const mayhemAt = (t, dead = false, lvl = 3, champ = 'Ahri', champName = champ, items = []) => pc.evaluate(([t, dead, lvl, champ, champName, items]) => lpcClient.emit('league', { inGame: true, phase: 'InProgress', mode: 'KIWI', t, room: 'g0123456789b', result: '', events: [],
      me: { champ, champName, team: 'ORDER', dead, respawn: 0, hp: 1, speed: 330 }, players: [{ name: 'Rayan#EUW', team: 'ORDER', champ, champName, pos: '', lvl, k: 0, d: 0, a: 0, cs: 0, items }] }), [t, dead, lvl, champ, champName, items]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), reads = () => pc.evaluate(() => lpc.mayState().reads);
    const cardsNow = () => pc.evaluate(() => (window.lastOverlay.mayhemCards || []).map((c) => [c.t.split(':')[0], c.p, c.s, c.v, c.k, (c.tags || []).map((t) => t[0]).join(' + ')]));
    const SET_A = ['Symphony of War', 'Mystic Punch', 'Sneakerhead'], SET_B = ['Escape Plan', 'One Hit Wonder', 'Blunt Force'];
    // the overlay's Best for Ahri box: [champion, the top 2 of each rarity with their tier, your picks, rings for picks to come]
    const boxOf = (a) => (a && typeof a === 'object' ? [a.champ, a.best.map(([r, l]) => `${r}: ${l.map((x) => `${x.n} ${x.t}`).join(', ')}`).join(' · '), (a.mine || []).map((x) => x.n).join(), a.due] : a);
    const boxNow = () => pc.evaluate(() => window.lastOverlay.aug).then(boxOf);
    const TOP = 'prismatic: Symphony of War S, Witchful Thinking A · gold: Escape Plan B, One Hit Wonder C · silver: Blunt Force C, ADAPt D';
    const BEST = JSON.stringify(['Ahri', TOP, '', 4]);
    await pc.evaluate(() => { const t = Worker.prototype.terminate; window.workersEnded = 0; Worker.prototype.terminate = function () { window.workersEnded++; return t.call(this); }; });
    await pc.check('#optMayhemAugs');
    await mayhemAt(20);
    await wait(pc, () => window.shares === 2, null, 'the screen shared in the Mayhem game (30 s after the last share at most)', 45000);
    assert.strictEqual(await pc.evaluate(() => lpc.mayhem()), true, 'League mode KIWI identifies ARAM: Mayhem independently of TFT');
    await wait(pc, (b) => { const a = window.lastOverlay.aug; return a && JSON.stringify([a.champ, a.best.map(([r, l]) => `${r}: ${l.map((x) => `${x.n} ${x.t}`).join(', ')}`).join(' · '), (a.mine || []).map((x) => x.n).join(), a.due]) === b; }, BEST, 'Ahri’s best augments of each rarity on the overlay at the start, as icons with their tier, and 4 rings for your picks');
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'the Mayhem cards read', 60000);
    assert.deepStrictEqual(await pc.evaluate(() => window.lastOverlay.mayhemCards.map((c, i) => [c.t, Math.abs(c.x * 1280 - [290, 640, 990][i]) <= 5, c.y > 0.58 && c.y < 0.7])),
      [['Symphony of War: S tier (72 DeepScore), 40% pick rate, +3.2 pts win rate on Ahri · DeepARAM patch 26.21', true, true], ['Mystic Punch: C tier (40 DeepScore), 5% pick rate, -1.5 pts win rate on Ahri · DeepARAM patch 26.21', true, true], ['Sneakerhead: no 26.21 champion data', true, true]], 'the rating stays on each augment card without drifting to unrelated screen edges');
    assert.deepStrictEqual(await cardsNow(), [['Symphony of War', 'S tier', '72 DeepScore · 40% picked · +3.2 pts', 0.72, 'good', 'Best pick'], ['Mystic Punch', 'C tier', '40 DeepScore · 5% picked · -1.5 pts', 0.4, '', 'Reroll?'], ['Sneakerhead', undefined, undefined, undefined, '', '']],
      'each card’s tier over a DeepScore bar, pick rate and Boost small; the strongest is the Best pick, the weakest (C) says Reroll?');
    await shot(pc, 'mayhem-augment-cards');
    // a reroll: only that card is read again, by itself, and its rating shows within a second; the others stay, and the
    // rerolled card never says Reroll? again
    const rerolledAt = Date.now();
    await pc.evaluate(drawMayhem, ['Symphony of War', 'Witchful Thinking', 'Sneakerhead']);
    await wait(pc, () => /^Witchful Thinking: /.test((window.lastOverlay.mayhemCards || [])[1]?.t), null, 'the rerolled card read', 10000);
    const rerollMs = Date.now() - rerolledAt;
    assert(rerollMs < 1000, `the rerolled card read in ${rerollMs} ms`);
    assert.deepStrictEqual(await cardsNow(), [['Symphony of War', 'S tier', '72 DeepScore · 40% picked · +3.2 pts', 0.72, 'good', 'Best pick'], ['Witchful Thinking', 'A tier', '60 DeepScore · 20% picked · +1.0 pts', 0.6, '', ''], ['Sneakerhead', undefined, undefined, undefined, '', '']],
      'the other cards kept; no hint once the weakest is A');
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => /^Mystic Punch: /.test((window.lastOverlay.mayhemCards || [])[1]?.t), null, 'rerolled back', 10000);
    assert.deepStrictEqual((await cardsNow())[1], ['Mystic Punch', 'C tier', '40 DeepScore · 5% picked · -1.5 pts', 0.4, '', ''], 'a rerolled card’s hint is gone for good');
    console.log(`Mayhem reroll read in ${rerollMs} ms`);
    // your pick (app 1.51): while cards are up the app sends where you click; a click under the card (League's reroll
    // button) isn't a pick, a click on the card is, and it's your pick once the cards go
    assert.strictEqual(await pc.evaluate(() => window.mayOn), true, 'the app asked for clicks while the cards are up');
    const click = (x, y) => pc.evaluate(([x, y]) => lpcClient.emit('may-click', { x, y }), [x, y]);
    await click(0.5, 0.95);
    assert.strictEqual(await pc.evaluate(() => lpc.mayState().click), undefined, 'a click on League’s reroll button under a card is no pick');
    await click(0.5, 0.6);
    assert.strictEqual(await pc.evaluate(() => lpc.mayState().click), 'Mystic Punch', 'a click on card 2');
    // the server before its update (Miss Fortune here): no Boost, pairs or build, and nothing breaks
    await mayhemAt(250, false, 3, '', 'Miss Fortune');
    await wait(pc, () => lpc.mayRate('Symphony of War').t === 'Symphony of War: B tier (50 DeepScore), 10% pick rate on Miss Fortune · DeepARAM patch 26.21', null, 'display names resolve to their champion-specific rates');
    assert.strictEqual(await pc.evaluate(() => lpc.mayRate('Symphony of War').s), '50 DeepScore · 10% picked', 'no Boost from the old server');
    assert.deepStrictEqual(boxOf(await pc.evaluate(() => lpc.mayBox())), ['Miss Fortune', 'silver: Symphony of War B', '', 4], 'the old server: its best augments, nothing else');
    await mayhemAt(260, false, 3, 'UnresolvedChampion', '');
    assert.strictEqual(await pc.evaluate(() => lpc.mayRate('Symphony of War').t), 'Symphony of War: no 26.21 champion data', 'an unresolved champion never gets another champion’s rate');
    await mayhemAt(265, false, 3, '', '');
    assert.strictEqual(await pc.evaluate(() => lpc.mayRate('Symphony of War').t), 'Symphony of War: no 26.21 champion data', 'a missing champion never gets another champion’s rate');
    // DeepARAM down for a champion (Yasuo: our server answers 502): no data on the cards, and the class tip instead
    await mayhemAt(30, false, 3, 'Yasuo');
    await wait(pc, () => window.lastOverlay.aug === 'Augments for Yasuo: look for attack damage, health, ability haste and healing; skip critical strikes and ability power.', null, 'the class tip without DeepARAM data');
    assert.strictEqual(await pc.evaluate(() => lpc.mayRate('Symphony of War').t), 'Symphony of War: no 26.21 champion data');
    // the first pick made in the first 3 minutes: none owed, so the screen isn't read even with cards on it
    await mayhemAt(100);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.mayhemCards && lpc.mayState().owed === 0, null, 'the first pick made: none owed', 15000);
    assert.deepStrictEqual(await pc.evaluate(() => [lpc.mayPicks(), window.mayOn]), [[{ name: 'Mystic Punch', at: 'Start' }], false], 'the card you clicked is your pick once the cards go; no clicks read with no cards up');
    const r0 = await reads();
    await pc.evaluate(drawMayhem, SET_A);
    await sleep(3000);
    assert.strictEqual(await reads(), r0, 'no screen reading in the first 3 minutes once the first pick is made');
    assert(!(await pc.evaluate(() => window.lastOverlay.mayhemCards)), 'none between picks');
    // levels 7 and 11 reached alive: two picks owed, the middle read every 3 s (you may walk back to the fountain)
    await pc.evaluate(drawMayhem, null);
    await mayhemAt(400, false, 7);
    await mayhemAt(410, false, 11);
    await wait(pc, () => lpc.mayState().owed === 2, null, 'two picks owed');
    const r1 = await reads();
    await sleep(6500);
    const slow = (await reads()) - r1;
    assert(slow >= 1 && slow <= 3, `alive with picks owed: the middle read every 3 s (${slow} reads in 6.5 s)`);
    // dead: both picks, one after the other, each with its ratings; the best augments and the next item of DeepARAM's
    // Mayhem build on the overlay (your boots in ARAM's own copy, 223020), and on Game the best pairs and the whole build
    // What to buy follows the build you're on: no items yet, the higher win rate (crit); with Sorcerer's Shoes (ARAM's own
    // copy, 223020), the AP build
    await mayhemAt(415, true, 11);
    await wait(pc, () => window.lastOverlay.buy && window.lastOverlay.buy.name === 'Berserker’s Greaves', null, 'no items: the build with the higher win rate');
    await mayhemAt(420, true, 11, 'Ahri', 'Ahri', [[223020, 1]]);
    await wait(pc, (b) => { const a = window.lastOverlay.aug; return a && JSON.stringify([a.champ, (a.mine || []).map((x) => x.n).join(), a.due]) === b; }, JSON.stringify(['Ahri', 'Mystic Punch', 3]), 'the best augments while dead, with your pick');
    await wait(pc, () => window.lastOverlay.buy && window.lastOverlay.buy.name === 'Luden’s Echo', null, 'the next item of the build you’re on while dead');
    assert.deepStrictEqual(await pc.evaluate(() => window.lastOverlay.buy), { name: 'Luden’s Echo', pic: 'https://ddragon.leagueoflegends.com/cdn/1.1/img/item/6655.png', why: 'DeepARAM’s Mayhem build' });
    // Game: your picks, the best augments as icons with tiers, the top pairs with why (yours marked), both builds (yours
    // marked) and Ahri's Mayhem changes, in place of the one line and the item list
    await openPage(pc, 'game');
    await wait(pc, () => !document.getElementById('mayBox').hidden && document.querySelector('#mayBox .maybld.sel'), null, 'the Mayhem part on Game');
    assert.deepStrictEqual(await pc.evaluate(() => { const q = (s, f) => [...document.querySelectorAll('#mayBox ' + s)].map(f), t = (e) => e.textContent; return [
      q('.mayslot', (e) => `${e.querySelector(':scope > b').textContent} ${e.querySelector('small').textContent}`),
      q('.mayone', (e) => `${e.querySelector('.maug').title} ${e.querySelector('.maug b').textContent}`),
      q('.maypair', (e) => [...e.querySelectorAll('b, i, .tag')].map(t).join(' | ')),
      q('.maybld', (e) => [e.classList.contains('sel'), [...e.querySelectorAll('.mayit')].map((i) => i.title + (i.classList.contains('have') ? ' (have)' : '')).join(', '), t(e.querySelector('.maywr'))]),
      q('.maychg span', t), document.getElementById('liveBuild').hidden]; }), [
      ['Mystic Punch Start', 'Next Level 7', 'Next Level 11', 'Next Level 15'],
      ['Symphony of War S', 'Witchful Thinking A', 'Escape Plan B', 'One Hit Wonder C', 'Blunt Force C', 'ADAPt D'],
      ['Symphony of War + Escape Plan | Both hit harder in fights.', 'Mystic Punch + One Hit Wonder | More casts, more hits. | You have Mystic Punch', 'ADAPt + Bad Gold'],
      [[true, 'Sorcerer’s Shoes (have), Luden’s Echo, Zhonya’s Hourglass', '48.2%5.1% picked · +1.2 pts'], [false, 'Berserker’s Greaves, Infinity Edge, Phantom Dancer, Zhonya’s Hourglass', '49.5%1.4% picked · −0.8 pts']],
      ['Change', 'Summoner’s Rift', 'Mayhem', 'Q Orb of Deception Damage', '40/65/90', '50/75/100'], true], 'Game as mockup board 3');
    assert(await pc.evaluate(() => /You’re on this one/.test(document.querySelector('#mayBox .maybld.sel').textContent)), 'the build you’re on marked');
    await shot(pc, 'mayhem-board3-game');
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'the first owed pick read', 30000);
    await pc.evaluate(drawMayhem, SET_B);
    await wait(pc, (n) => JSON.stringify((window.lastOverlay.mayhemCards || []).map((c) => c.t.split(':')[0])) === n, JSON.stringify(SET_B), 'the second pick read right after the first (One Hit Wonder only on DeepARAM)', 30000);
    assert.deepStrictEqual(await cardsNow(), [['Escape Plan', 'B tier', '55 DeepScore · 30% picked · +2.0 pts', 0.55, 'good', 'Best pick + Fits your build'], ['One Hit Wonder', 'C tier', '41 DeepScore · 10% picked · +0.5 pts', 0.41, '', 'Goes with Mystic Punch'], ['Blunt Force', 'C tier', '35 DeepScore · 20% picked · +0.2 pts', 0.35, '', 'Reroll?']],
      'gold, gold and silver: by Boost; Escape Plan is in the AP build’s best augments, and One Hit Wonder makes a pair with Mystic Punch, your pick');
    const scenes = [['mayhem-board1-pick', await pc.evaluate(() => ({ s: window.lastOverlay, bg: window.screenPic.toDataURL() }))]]; // drawn again on overlay.html at the end
    assert.strictEqual(await pc.evaluate(() => lpc.mayState().owed), 1, 'one pick left');
    await pc.evaluate(drawMayhem, ['Escape Plan', 'One Hit Wonder', 'Witchful Thinking']);
    await wait(pc, () => /^Witchful Thinking: /.test((window.lastOverlay.mayhemCards || [])[2]?.t), null, 'Blunt Force rerolled', 10000);
    assert.deepStrictEqual((await cardsNow()).map((c) => c[5].includes('Reroll?')), [false, true, false], 'the hint moves to the card that’s now the weakest, C and not rerolled');
    await shot(pc, 'mayhem-reroll-hint');
    // a reroll that raised a card's rarity (Command Line): gold Escape Plan (+2.0 pts) is the Best pick over prismatic
    // Witchful Thinking's higher DeepScore, and the silver D says Reroll?
    await pc.evaluate(drawMayhem, ['Escape Plan', 'Witchful Thinking', 'ADAPt']);
    await wait(pc, (n) => JSON.stringify((window.lastOverlay.mayhemCards || []).map((c) => c.t.split(':')[0])) === n, JSON.stringify(['Escape Plan', 'Witchful Thinking', 'ADAPt']), 'a set of three rarities', 30000);
    assert.deepStrictEqual((await cardsNow()).map((c) => [c[0], c[4], c[5]]), [['Escape Plan', 'good', 'Best pick + Fits your build'], ['Witchful Thinking', '', ''], ['ADAPt', '', 'Reroll?']], 'by Boost when the rarities differ');
    // a new augment of 26.23 (no row on DeepARAM): New in 26.23, no numbers
    await pc.evaluate(drawMayhem, ['Symphony of War', 'Steadfaster Presence', 'Mystic Punch']);
    await wait(pc, () => /^Steadfaster Presence: /.test((window.lastOverlay.mayhemCards || [])[1]?.t), null, 'a new augment read', 30000);
    assert.deepStrictEqual((await cardsNow())[1], ['Steadfaster Presence', 'No numbers yet', 'DeepARAM hasn’t got enough games', undefined, '', 'New in 26.23'], 'New in 26.23, not no data');
    // Maestro's four cards, on a 1280 and a 1920 wide screen: each rating under its own card
    for (const w of [1280, 1920]) {
      const names = ['Symphony of War', 'Mystic Punch', 'Escape Plan', 'Blunt Force'];
      await pc.evaluate(drawMayhem, { n: names, w });
      await wait(pc, (n) => JSON.stringify((window.lastOverlay.mayhemCards || []).map((c) => c.t.split(':')[0])) === n, JSON.stringify(names), `four cards at ${w} wide`, 30000);
      assert.deepStrictEqual(await pc.evaluate((w) => window.lastOverlay.mayhemCards.map((c, i) => Math.abs(c.x * w - [280, 520, 760, 1000][i] * (w / 1280)) <= 5), w), [true, true, true, true], `each rating within 5 px of its card’s name at ${w} wide`);
      if (w === 1920) scenes.push(['mayhem-board2-maestro', await pc.evaluate(() => ({ s: window.lastOverlay, bg: window.screenPic.toDataURL() }))]);
    }
    assert.deepStrictEqual((await cardsNow()).map((c) => c[5]), ['Best pick', 'Reroll?', 'Fits your build', ''], 'four cards, three rarities: by Boost (Symphony of War +3.2 pts)');
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'three cards again, at 1280', 30000);
    // memory: 50 more picks with rerolls in one game keep the page flat
    const cdp = await pc.context().newCDPSession(pc);
    await cdp.send('Performance.enable');
    const metrics = async () => {
      const best = [Infinity, Infinity, Infinity];
      for (let k = 0; k < 10; k++) {
        await sleep(800);
        await cdp.send('HeapProfiler.collectGarbage');
        const { metrics: m } = await cdp.send('Performance.getMetrics'), g = (n) => m.find((x) => x.name === n).value;
        [g('Nodes'), g('JSEventListeners'), g('JSHeapUsedSize')].forEach((v, i) => { best[i] = Math.min(best[i], v); });
      }
      return best;
    };
    const before = await metrics(), mayT0 = Date.now();
    for (let i = 0; i < 25; i++) for (const [set, rr] of [[SET_A, ['Symphony of War', 'Witchful Thinking', 'Sneakerhead']], [SET_B, ['Escape Plan', 'Witchful Thinking', 'Blunt Force']]]) {
      for (const names of [set, rr]) {
        await pc.evaluate(drawMayhem, names);
        await wait(pc, (n) => JSON.stringify((window.lastOverlay.mayhemCards || []).map((c) => c.t.split(':')[0])) === n, JSON.stringify(names), `pick ${i * 2 + 1}: ${names.join(', ')}`, 30000);
      }
    }
    const after = await metrics();
    assert(after[0] - before[0] < 300 && after[1] - before[1] < 20 && after[2] - before[2] < 3e6, `DOM nodes, listeners and JS heap flat over 50 picks: ${before} -> ${after}`);
    console.log(`Mayhem memory over 50 picks with rerolls (${Math.round((Date.now() - mayT0) / 1000)} s): nodes ${before[0]} -> ${after[0]}, listeners ${before[1]} -> ${after[1]}, heap ${(before[2] / 1e6).toFixed(1)} -> ${(after[2] / 1e6).toFixed(1)} MB`);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.mayhemCards && lpc.mayState().owed === 0, null, 'both picks made', 15000);
    // dead with no pick owed: the middle read every 10 s, so an extra pick (K/DA) is rated
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'an extra pick while dead with none owed, within 10 s', 15000);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.mayhemCards && lpc.mayState().owed === 0, null, 'the extra pick made', 15000);
    // level 15 reached alive, a pick waiting over 5 minutes, then a death: the cards come after the respawn and are read
    await pc.evaluate(drawMayhem, null);
    await mayhemAt(430, false, 15);
    await wait(pc, () => lpc.mayState().owed === 1, null, 'the level 15 pick owed');
    await mayhemAt(760, false, 15);
    await mayhemAt(770, true, 15);
    await sleep(1000);
    await mayhemAt(780, false, 15);
    await sleep(1000);
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'the late pick read after the respawn', 10000);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.mayhemCards && lpc.mayState().owed === 0, null, 'the late pick made', 15000);
    // level 21 (Superfans): one more pick owed, read like the others
    await mayhemAt(790, false, 21);
    await wait(pc, () => lpc.mayState().owed === 1, null, 'the level 21 pick owed');
    await pc.evaluate(drawMayhem, SET_A);
    await wait(pc, () => (window.lastOverlay.mayhemCards || []).length === 3, null, 'the level 21 pick read', 10000);
    await pc.evaluate(drawMayhem, null);
    await wait(pc, () => !window.lastOverlay.mayhemCards && lpc.mayState().owed === 0, null, 'the level 21 pick made', 15000);
    // Miss Fortune on the server before its update, dead: no Mayhem item, no build on Game
    await mayhemAt(800, true, 15, 'MissFortune', 'Miss Fortune');
    await wait(pc, () => window.lastOverlay.aug && window.lastOverlay.aug.champ === 'Miss Fortune', null, 'Miss Fortune’s best augments');
    assert.deepStrictEqual(await boxNow(), ['Miss Fortune', 'silver: Symphony of War B', 'Mystic Punch', 3], 'the old server: its best augments on the overlay, and your pick of this game');
    assert.strictEqual(await pc.evaluate(() => lpc.buyNext()), null, 'no Mayhem item without the build');
    await wait(pc, () => document.getElementById('liveBuild').hidden, null, 'no build on Game without it');
    await wait(pc, () => document.getElementById('mayBox').textContent.includes('Best for Miss Fortune'), null, 'Game on Miss Fortune');
    assert.deepStrictEqual(await pc.evaluate(() => [document.getElementById('mayBox').hidden, document.querySelectorAll('#mayBox .mayone').length, document.querySelectorAll('#mayBox .maypair, #mayBox .maybld, #mayBox .maychg').length]), [false, 1, 0], 'the old server on Game: the best augments only, no pairs, builds or changes');
    await mayhemAt(810, true, 15, 'Yasuo');
    await wait(pc, () => document.getElementById('mayBox').hidden && /^Augments for Yasuo: /.test(window.lastOverlay.aug), null, 'DeepARAM down (502): the class tip on the overlay, no Mayhem part on Game');
    await pc.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'EndOfGame' }));
    await wait(pc, () => !lpc.mayState() && window.workersEnded >= 1, null, 'the reader and its Tesseract worker ended with the game');
    assert.deepStrictEqual(SENT.filter(([q]) => q === 'mayhem'), [], 'no Mayhem games sent to our server');
    // Profile, Recent games: a Mayhem game shows the augments you took, in order (League's match history), with the name and when on hover
    await openPage(pc, 'profile');
    await wait(pc, () => document.querySelectorAll('#proGames .gaugs .maug').length === 5, null, 'your Mayhem game’s augments in your history');
    assert.deepStrictEqual(await pc.$$eval('#proGames .gaugs .maug', (l) => l.map((e) => e.title)), ['Symphony of War, at the start', 'Escape Plan, at 7', 'Blunt Force, at 11', 'ADAPt, at 15', 'Witchful Thinking, at 21']);
    await shot(pc, 'mayhem-board4-history');
    assert(!(await pc.$('#proQueues .tab[data-q="tft"]')), 'no TFT tab on Profile (What’s new 203)');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    await pctx.close();
    console.log('desktop app: TFT ranks, your last games with your traits and augments, a team code for each Set 18 board, none for Set 17, your items ringed in the recipes and over TFT games, ratings on TFT’s and ARAM: Mayhem’s augment cards (arammayhem.com’s for Mayhem), TFT games sent for them');

    // ---- overlay.html puts each card's words at the foot of the card, as shares of the screen
    const ovp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await ovp.addInitScript(() => { window.lpcClient = { on: (n, fn) => { window.fire = fn; }, overlayDone() {} }; });
    await ovp.goto('http://127.0.0.1:8084/overlay.html');
    await ovp.evaluate(() => window.fire({ visible: true, board: true, pos: 'tl', scale: 1, opacity: 1, cards: [{ x: 0.2859, y: 0.73, t: 'Your average: 1.5 in 2 games', k: 'good' }, { x: 0.7133, y: 0.73, t: 'Not in your last 4 games', k: '' }] }));
    assert.deepStrictEqual(await ovp.$$eval('.augc', (l) => l.map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), e.classList.contains('good')]; })),
      [['Your average: 1.5 in 2 games', 366, 526, true], ['Not in your last 4 games', 913, 526, false]]);
    await shot(ovp, 'tft-augment-cards');
    await ovp.evaluate(() => window.fire({ visible: true, board: true, pos: 'tl', scale: 1, opacity: 1, mayhemCards: [
      { x: 0.23, y: 0.66, v: 0.72, p: 'S tier', s: '72 DeepScore · 40% picked · +3.2 pts', tier: 'S', score: 72, k: 'good', tags: [['Best pick', 'best'], ['Fits your build', 'fit']] },
      { x: 0.5, y: 0.66, v: 0.4, p: 'C tier', s: '40 DeepScore · 5% picked · -1.5 pts', tier: 'C', score: 40, tags: [['Goes with Vulnerability', 'pair', ''], ['Reroll?', 'bad']] },
      { x: 0.77, y: 0.66, t: 'Sneakerhead: no 26.21 champion data' },
    ], aug: { champ: 'Ashe', best: [['prismatic', [{ n: 'Draw Your Sword', i: '', t: 'S' }, { n: 'Infinite Recursion', i: '', t: 'S' }]], ['gold', [{ n: 'Weapon of Destiny', i: '', t: 'S' }]]], mine: [{ n: 'Vulnerability', i: '', r: 'gold' }], due: 3 } }));
    assert.deepStrictEqual(await ovp.$$eval('.may-rate', (l) => l.map((e) => [e.classList.contains('good'), getComputedStyle(e).backgroundColor, getComputedStyle(e).borderTopWidth, e.textContent.includes('S tier') || e.textContent.includes('Sneakerhead')])),
      [[true, 'rgba(0, 0, 0, 0)', '0px', true], [false, 'rgba(0, 0, 0, 0)', '0px', false], [false, 'rgba(0, 0, 0, 0)', '0px', true]], 'Mayhem ratings have transparent backplates, including an augment without a rate');
    assert.deepStrictEqual(await ovp.$$eval('.may-rate', (l) => l.map((e) => [(e.querySelector('.augfill') || {}).style?.width || '', [...e.querySelectorAll('.augtag')].map((t) => `${t.textContent}:${getComputedStyle(t).borderTopColor}`).join(), (getComputedStyle(e.querySelector('.augp') || e).textShadow.match(/rgba?\([^)]*\)/g) || []).some((c) => c !== 'rgb(0, 0, 0)'), getComputedStyle(e.querySelector('.augfill') || e).backgroundImage])),
      [['72%', 'Best pick:rgb(232, 184, 74),Fits your build:rgb(233, 225, 226)', false, 'none'], ['40%', 'Goes with Vulnerability:rgb(60, 207, 142),Reroll?:rgb(255, 107, 107)', false, 'none'], ['', '', false, 'none']], 'a DeepScore bar, no glow and no gradient, the pills outlined in their colours');
    assert.deepStrictEqual(await ovp.$$eval('.maybox', (l) => l.map((b) => [b.querySelector('.mhead').textContent, [...b.querySelectorAll('.mrow .mau')].map((m) => `${m.title} ${m.className} ${m.querySelector('b').textContent}`), b.querySelectorAll('.mine .mau').length, b.querySelectorAll('.mine .mau.due').length])),
      [['Best for Ashe', ['Draw Your Sword mau prismatic S', 'Infinite Recursion mau prismatic S', 'Weapon of Destiny mau gold S'], 4, 3]], 'Best for Ashe as rarity rings with a tier, your pick and 3 to come');
    await shot(ovp, 'mayhem-transparent-cards');
    for (const [name, { s, bg }] of process.env.SHOTS ? scenes : []) { // the overlay as it was over the screen it read, for the mockup's boards 1 and 2
      const w = name.includes('maestro') ? 1920 : 1280;
      await ovp.setViewportSize({ width: w, height: (w * 9) / 16 });
      await ovp.evaluate(([s, bg]) => { document.documentElement.style.background = `url(${bg}) 0 0 / 100% 100%`; window.fire(s); }, [s, bg]);
      await shot(ovp, name);
    }
    await ovp.close();
    console.log('overlay: Mayhem ratings stay anchored under the augment names');
  } finally {
    await browser.close();
  }
  console.log('TFT tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

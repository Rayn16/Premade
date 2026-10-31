// Test of the desktop app's League features in site/index.html and site/remote.html, in headless Chromium, with a
// stand-in for the desktop app 1.10 (window.lpcClient with lcu, clips, the gallery and front) and a fake League client behind it.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node league.e2e.js
// Checks: the Pregame and Game pages only in the desktop app, with a note to restart an old one; the ready check (Accept here, on the
// phone, and accepted for you, with the phone's buzz); the queue (a Practice Tool game in one click, Find match, Stop
// from the phone); champ select: your turn's alarm, trades here and on the phone, your team's ranks, recent games and tags, nobody whose name Riot hides
// looked up, bans and the best picks for you (high elo, against their laner, your games), the tier list, the damage mix, Riot's recommended runes as a new page
// and then over it, summoner spells with Flash on the right key; the phone remote (QR code, accept, hover, lock in,
// auto-accept, and champ select as League shows it: both teams, bans, the clock, every champion by name or role, runes
// changed and saved, spells, skins, ARAM's bench and rerolls, dodge); the tips for your lane in champ select and on the loading screen; the loading screen: everyone's rank,
// record on their champion and tags on the overlay with the tips, hidden and back by its key; in game: all ten players
// scouted (one found by Riot ID), objective timers, kills, towers and the gold difference on the page, the overlay (what it
// shows, see-through, everyone's rank then hidden by its key) and the phone, your lane and CS a
// minute, the sound before Dragon; clips from the clip key and a multikill, cut to the last seconds and playable, and the
// gallery (keep, rename, drag, play, cut, bin); a clip by voice, with your own phrase recorded from the mic; after the game: the LP, the game report with MVP and ACE, how you played
// on the Game page (against your usual, high elo and your lane opponent, what stood out, the map of your fights, your
// deaths and the objectives), Stats' LP
// tracker and chart, match history with its reports and the spreadsheet export, the voice game history with the
// report; the patch check, the performance meter, test recordings, your version and What's new, an app link into a
// room, the phone remote from its home screen icon, backup and restore; the champ select helpers in app 1.13 (the tier
// list's arrows, bans and champion pages, the matchup explorer and hidden in a game, safe blind picks, the matchup's own
// rune page, tips against both bot laners, Borderless in one click from the ready check); and that every call to
// League's client is one the desktop app lets through (client/main.js LCU_OK).
// League stats: your games read in detail (one lane guessed from the timeline), Clash scouting, tags for players seen
// before, premades, off-role and smurfs, ban ideas, matchup notes, your build as an item set and your skill order,
// your own rune page, auto hover; the report's replay, laning and item timeline, Riot's extra numbers (from Riot's copy
// of the game) and High elo column, runes and items copied from it into League, and the replay rule from patch 26.21;
// Stats' tabs (trends with Riot's extra numbers, comebacks and throws, win rates by game length, hall of fame,
// best time, the recap picture, a champion's page, nemeses and allies, the collection, patch changes, player lookup,
// rank watch, talk and win); and a friend's rank, your record together and Watch on their card in the room. Room games:
// the balanced teams with ranks, and role roulette's role set in League's lobby.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8081/index.html?peer=127.0.0.1:9001&debug';
// the desktop app's allowlist, read from its source (main.js needs Electron to load)
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]);
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));

PeerServer({ host: '127.0.0.1', port: 9001, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.gz': 'application/gzip' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8081, '127.0.0.1');

// ---- Data Dragon
const CHAMPS = [['Ahri', 103, 3, 8, 'Mage'], ['Garen', 86, 7, 1, 'Fighter Tank'], ['LeeSin', 64, 8, 3, 'Fighter'], ['Jinx', 222, 9, 4, 'Marksman'], ['Thresh', 412, 5, 6, 'Support'],
  ['Lux', 99, 2, 9, 'Mage Support'], ['Darius', 122, 9, 1, 'Fighter Tank'], ['Zed', 238, 9, 1, 'Assassin'], ['Sona', 37, 5, 8, 'Support'], ['Vi', 254, 8, 3, 'Fighter'], ['Caitlyn', 51, 8, 2, 'Marksman']];
const RANGE = { Ahri: 550, Garen: 175, LeeSin: 125, Jinx: 525, Thresh: 450, Lux: 550, Darius: 175, Zed: 125, Sona: 550, Vi: 125, Caitlyn: 650 }; // attack range
const DDATA = Object.fromEntries(CHAMPS.map(([id, key, attack, magic, tags]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack, magic }, tags: tags.split(' '), stats: { attackrange: RANGE[id] } }]));
const ITEM = (name, total, tags = [], into) => ({ name, gold: { total }, tags, ...(into && { into }) });
const ITEMS = { data: {
  1001: ITEM('Boots', 300, ['Boots'], ['3020', '3047']), 3031: ITEM('Infinity Edge', 3400), 1056: ITEM('Doran’s Ring', 400), 1055: ITEM('Doran’s Blade', 450),
  2003: ITEM('Health Potion', 50, ['Consumable']), 3340: ITEM('Stealth Ward', 0, ['Trinket']), 3020: ITEM('Sorcerer’s Shoes', 1100, ['Boots']), 3047: ITEM('Plated Steelcaps', 1200, ['Boots']),
  6655: ITEM('Luden’s Companion', 2750), 3157: ITEM('Zhonya’s Hourglass', 3250), 3089: ITEM('Rabadon’s Deathcap', 3600), 3071: ITEM('Black Cleaver', 3000),
} };
// two of League's rune trees as Data Dragon has them, a keystone row then three more, with two runes in each row
const tree = (id, name, rows) => ({ id, key: name, name, icon: `perk-images/Styles/${id}.png`, slots: rows.map((row) => ({ runes: row.map(([rid, rname]) => ({ id: rid, name: rname, icon: `perk-images/${rid}.png` })) })) });
const RUNE_TREES = [
  tree(8100, 'Domination', [[[8112, 'Electrocute'], [8128, 'Dark Harvest']], [[8126, 'Cheap Shot'], [8139, 'Taste of Blood']], [[8138, 'Eyeball Collection'], [8136, 'Zombie Ward']], [[8135, 'Treasure Hunter'], [8105, 'Relentless Hunter']]]),
  tree(8200, 'Sorcery', [[[8229, 'Arcane Comet'], [8214, 'Summon Aery']], [[8226, 'Manaflow Band'], [8275, 'Nimbus Cloak']], [[8210, 'Transcendence'], [8234, 'Celerity']], [[8237, 'Scorch'], [8236, 'Gathering Storm']]]),
];
// summoner spells, and the modes each is in (Mark only in ARAM)
const SUMMONER = { data: Object.fromEntries([[4, 'Flash', 'CLASSIC ARAM'], [14, 'Ignite', 'CLASSIC ARAM'], [12, 'Teleport', 'CLASSIC'], [11, 'Smite', 'CLASSIC'], [7, 'Heal', 'CLASSIC ARAM'], [32, 'Mark', 'ARAM']]
  .map(([key, name, modes]) => [`Summoner${name}`, { id: `Summoner${name}`, key: String(key), name, modes: modes.split(' '), image: { full: `Summoner${name}.png` } }])) };
// a champion's full Data Dragon file, for patch changes: Ahri got more health and a shorter Q in 1.1; and Riot's tips
// for playing it (allytips) and against it (enemytips)
const TIPS = { Ahri: [['Use Charm to set up your combos.', 'Spirit Rush gets you in and out.'], ['Ahri is weak while Spirit Rush is down.']],
  Zed: [['Living Shadow first.'], ['Zed’s shadows copy his abilities: stand away from them.', 'Zhonya’s Hourglass stops Death Mark.', 'A third tip, not shown.']] };
const champFull = (id, v) => ({ data: { [id]: { id, allytips: (TIPS[id] || [[]])[0], enemytips: (TIPS[id] || [[], []])[1], stats: { hp: id === 'Ahri' && v === '1.1' ? 600 : 590, armor: 21 }, passive: { name: 'Passive', description: 'Same.' },
  spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: id === 'Ahri' ? ['Orb of Deception', 'Fox-Fire', 'Charm', 'Spirit Rush'][i] : k, cooldownBurn: id === 'Ahri' && !i && v === '1.1' ? '6' : '7', costBurn: '50', rangeBurn: '900', tooltip: '', description: '' })) } } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// Riot's rank emblems (Data Dragon's TFT ranked regalia), and which of them a page shows
const REGALIA = { type: 'tft-regalia', data: { RANKED_TFT: Object.fromEntries(['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger'].map((t) => [t, { id: t, image: { full: `TFT_Regalia_${t}.png` } }])) } };
const embs = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.src.replace(/^.*\//, '')));

// our server's high elo games (server/worker.js /riot/champ) of Ahri: 40 in the middle on patch 15.20, 22 won: the
// most popular runes in 30 (19 won), Luden's, Rabadon's then Zhonya's in 30, Black Cleaver in 14, start Q, E, W and
// max Q, E, W; against Zed (4 of 10 won, and 8 of 20 more in the last year: y), Lux (10 of 15) and Garen (8 of 15); 10
// of 23 minutes (4 won), 20 of 31 (15 won) and 10 of 40 (3 won), with 12,000 gold, 30 vision and 24,000 damage, their
// team's 24 kills and 80,000 damage (m). And 3 at the top.
function highElo(role) {
  const SEQ = [1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2];
  const games = role === 'TOP' ? [0, 1, 2].map((i) => ({ p: '15.20', t: 1000 + i, w: i % 2, o: 86, g: 0, s: [4, 12], rn: null, b: [], k: SEQ, x: [1, 1, 1, 100], l: null }))
    : Array.from({ length: 40 }, (_, i) => ({ p: '15.20', t: 2000 + i, w: +(i < 4 || (i >= 10 && i < 20) || (i >= 25 && i < 33)), o: i < 10 ? 238 : i < 25 ? 99 : 86, g: i < 10 ? -200 : i < 25 ? 150 : 50, s: [14, 4],
      rn: i < 30 ? [8100, 8200, 8112, 8139, 8138, 8135, 8226, 8237, 5008, 5008, 5011] : [8100, 8200, 8112, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5002],
      b: [[10, 1056], [10, 2003], [600, 6655], [700, 3020], [1200, i < 30 ? 3089 : 3157], [1500, i < 30 ? 3157 : 3089], ...(i % 3 ? [] : [[1800, 3071]])], k: SEQ, x: [6, 3, 8, 210], l: [5, 100],
      m: [i < 10 ? 1380 : i < 30 ? 1860 : 2400, 12000, 30, 24000, 24, 80000] }));
  return { patch: '15.20', role, roles: { MIDDLE: [40, 22], TOP: [3, 1] }, games, ...(role !== 'TOP' && { y: { n: 20, w: 8, vs: { 238: [20, 8] } } }) };
}

// and Zed in the middle: 10 games against Ahri (won 6) and 6 against Lux (won 1), 12 of them against Lee Sin (won 4)
const zedMid = () => ({ patch: '15.20', role: 'MIDDLE', roles: { MIDDLE: [16, 7] }, games: Array.from({ length: 16 }, (_, i) => ({ p: '15.20', t: 3000 + i, w: +(i < 6 || i === 10), o: i < 10 ? 103 : 99, g: 0, s: [4, 14], rn: null, b: [], k: null, x: null, l: null,
  e: i < 4 || (i >= 6 && i < 10) || (i >= 11 && i < 15) ? [64] : [] })) });
// and Garen at the top: 20 games with Lux, 15 won
const garenTop = () => ({ patch: '15.20', role: 'TOP', roles: { TOP: [20, 15] }, games: Array.from({ length: 20 }, (_, i) => ({ p: '15.20', t: 4000 + i, w: +(i < 15), o: null, g: 0, s: [4, 12], rn: null, b: [], k: null, x: null, l: null, a: [99] })) });

// for the champ select helpers (app 1.13): our server's high elo games this patch and the last, with bans; Ahri's in the
// middle: 20 against Zed on Arcane Comet with Teleport (6 won), 20 against Lux and 20 against Garen on Electrocute (10
// and 12 won); Zed's: 20 against Ahri (14 won) and 20 against Lux (8 won); Lux's: 20 against Ahri (10 won); Jinx's at
// the bottom, with each game's teams: 10 against Caitlyn and Sona (4 won), 10 against another with Sona (5 won) and 10
// against Caitlyn and Thresh (6 won)
const HSUM = { p: '15.20', c: { 103: { MIDDLE: [80, 52] }, 238: { MIDDLE: [60, 24] }, 99: { MIDDLE: [40, 21] }, 254: { MIDDLE: [20, 14] }, 86: { TOP: [100, 50] }, 122: { TOP: [100, 50] },
  222: { BOTTOM: [50, 25] }, 51: { BOTTOM: [50, 25] }, 37: { UTILITY: [40, 20] }, 412: { UTILITY: [40, 20] } }, b: { 238: 30, 103: 6 }, bn: 120,
  old: { p: '15.19', c: { 103: { MIDDLE: [80, 36] }, 238: { MIDDLE: [60, 36] }, 99: { MIDDLE: [40, 20] }, 254: { MIDDLE: [20, 10] }, 86: { TOP: [100, 50] }, 122: { TOP: [100, 50] } }, b: { 238: 10 }, bn: 80 },
  today: 5, total: 999, at: 0 };
const COMET = [8200, 8100, 8229, 8226, 8210, 8237, 8139, 8135, 5008, 5008, 5011], ELEC = [8100, 8200, 8112, 8139, 8138, 8135, 8226, 8210, 5008, 5008, 5002];
const hGame = (t, w, o, x = {}) => ({ p: '15.20', t, w, o, g: null, s: [4, 14], rn: ELEC, b: [], k: null, x: null, l: null, ...x });
const H_CHAMP = {
  '103/MIDDLE': Array.from({ length: 60 }, (_, i) => (i < 20 ? hGame(5000 + i, +(i < 6), 238, { rn: COMET, s: [4, 12], b: [[10, 1056], [10, 2003], [600, 6655], [700, 3020], [1200, 3157]] })
    : hGame(5000 + i, +(i < 30 || (i >= 40 && i < 52)), i < 40 ? 99 : 86))),
  '238/MIDDLE': Array.from({ length: 40 }, (_, i) => hGame(5100 + i, +(i < 14 || (i >= 20 && i < 28)), i < 20 ? 103 : 99, { rn: null, s: null })),
  '99/MIDDLE': Array.from({ length: 20 }, (_, i) => hGame(5200 + i, +(i < 10), 103, { rn: null, s: null })),
  '222/BOTTOM': Array.from({ length: 30 }, (_, i) => hGame(5300 + i, +(i < 4 || (i >= 10 && i < 15) || (i >= 20 && i < 26)), i < 10 || i >= 20 ? 51 : 21,
    { rn: null, s: null, e: [86, 64, 103, i < 10 || i >= 20 ? 51 : 21, i < 20 ? 37 : 412] })),
};

// ---- the fake League client
const ME = 'me-puuid', GAME = 5550001;
const TEAM1 = [[ME, 'Rayan', 103, 'MIDDLE'], ['ally1', 'Friend', 86, 'TOP'], ['ally2', 'Jungler', 64, 'JUNGLE'], ['ally3', 'Shooter', 222, 'BOTTOM'], ['ally4', 'Hooks', 412, 'UTILITY']];
const TEAM2 = [['enemy1', 'Axe', 122, 'TOP'], ['enemy2', 'Puncher', 254, 'JUNGLE'], ['enemy3', 'Shadow', 238, 'MIDDLE'], ['enemy4', 'Sniper', 51, 'BOTTOM'], ['', 'Singer', 37, 'UTILITY']];
let t0 = Date.now() - 3600e3;
// a match history: [champion, win, more] newest first, its games numbered from base; more: { id, lane, role, items,
// perks (the trees, then six runes), penta, vision, len (seconds, else 30 minutes) }
const hist = (games, base = 9000) => ({ games: { games: games.map(([champ, win, x = {}], i) => ({ gameId: x.id || base + i, platformId: 'EUW1', gameCreation: t0 - i * 3600e3, gameDuration: x.len || 1800, queueId: 420, gameMode: 'CLASSIC',
  participants: [{ championId: champ, teamId: 100, ...(x.lane && { timeline: { lane: x.lane, role: x.role || 'SOLO' } }), stats: { win, kills: 5, deaths: 3, assists: 7, totalMinionsKilled: 150, neutralMinionsKilled: 10,
    visionScore: x.vision || 20, totalDamageDealtToChampions: 20000, pentaKills: x.penta || 0, quadraKills: x.penta || 0, ...Object.fromEntries((x.items || []).map((id, k) => ['item' + k, id])),
    ...(x.perks && { perkPrimaryStyle: x.perks[0], perkSubStyle: x.perks[1], ...Object.fromEntries(x.perks.slice(2).map((id, k) => ['perk' + k, id])) }) } }] })) } });
const rep = (n, champ, win, more) => Array.from({ length: n }, (_, i) => [champ, typeof win === 'function' ? win(i) : win, typeof more === 'function' ? more(i) : more]);
const HIST = {
  ally1: hist([...rep(4, 86, true), ...rep(4, 86, (i) => i < 2), ...rep(12, 99, false)], 31000), // 4 wins in a row, Garen 6 of 8 won: a comfort pick
  ally2: hist([...rep(15, 64, (i) => i % 2 === 0), ...rep(5, 222, true)], 32000),                 // one-trick Lee Sin
  ally3: hist(rep(20, 222, (i) => i % 2 === 0, (i) => (i < 3 ? { id: 32000 + i } : {})), 36000),   // three of the same games as Lee Sin: a premade
  ally4: hist(rep(20, 412, (i) => i % 2 === 0, { lane: 'MIDDLE' }), 34000),                        // plays middle, not support: off-role
  enemy3: hist(rep(20, 103, (i) => i % 3 === 0), 33000),                                          // never played Zed
  enemy4: hist(rep(30, 51, (i) => i % 5 !== 0), 35000),                                           // won 80%, at level 30: a smurf?
};
const BASES = new Map(); // everyone else's games numbered apart, so nobody's a premade by chance
const histOf = (who) => HIST[who] || hist(rep(20, 86, (i) => i % 2 === 1), BASES.get(who) || BASES.set(who, 40000 + 100 * BASES.size).get(who));
const AHRI = { lane: 'MIDDLE', perks: [8100, 8200, 8112, 8139, 8138, 8135, 8226, 8210], items: [6655, 3157, 3089, 3020] };
const LUX = { lane: 'MIDDLE', perks: [8200, 8100, 8229, 8226, 8210, 8237, 8139, 8135], items: [6655, 3020], len: 1300 };
const MY_HIST = hist([[103, true, AHRI], ...rep(7, 103, (i) => i < 5, (i) => ({ ...AHRI, penta: i === 2 ? 1 : 0, vision: 15 + i })), ...rep(5, 99, (i) => i < 3, LUX),
  ...rep(4, 86, (i) => i < 1, { lane: 'TOP', items: [3071, 3047] }), ...rep(3, 37, true, { lane: 'BOTTOM', role: 'DUO_SUPPORT', len: 2300 })]); // 13 won; Lux's games short, Sona's long
MY_HIST.games.games[0].gameId = GAME;
// your TFT games in League's client (products/tft), newest first: 1st, 3rd, 6th (Double Up), 4th (normal), 8th; the
// same traits, units and augments each time
const TFT = [[1, 1100], [3, 1100], [6, 1160], [4, 1090], [8, 1100]].map(([placement, queue], i) => ({ metadata: { match_id: `EUW1_${8000 + i}`, timestamp: t0 - i * 3600e3 },
  json: { gameId: 8000 + i, game_datetime: t0 - i * 3600e3, game_length: 1900, queue_id: queue, participants: [{ puuid: 'other', placement: placement === 1 ? 2 : 1, level: 9, traits: [], units: [] },
    { puuid: ME, placement, level: 8, augments: ['TFT13_Augment_CyberneticBulk', 'TFT9_Augment_Ascension'],
      traits: [{ name: 'TFT13_Rebel', num_units: 3, style: 1 }, { name: 'TFT13_Sniper', num_units: 4, style: 2 }, { name: 'TFT13_Ambusher', num_units: 1, style: 0 }],
      units: [{ character_id: 'TFT13_Jinx', tier: 2, itemNames: ['TFT_Item_InfinityEdge', 'TFT_Item_GuinsoosRageblade'] }, { character_id: 'TFT13_Vi', tier: 1, itemNames: [] }] }] } }));
const MASTERY = { [ME]: [[103, 7, 120000], [99, 5, 40000], [86, 4, 20000], [238, 6, 50000]], enemy3: [[103, 5, 30000]] };
const mastery = (who) => (MASTERY[who] || [[86, 3, 5000]]).map(([championId, championLevel, championPoints]) => ({ championId, championLevel, championPoints }));
const POSITIONS = { 103: ['MIDDLE'], 99: ['MIDDLE', 'UTILITY'], 86: ['TOP'], 37: ['UTILITY'], 238: ['MIDDLE'] };
// your Ahri skins in League's skin picker: the base one, Dynasty Ahri with a chroma you own and one you don't, and
// Midnight Ahri, which you don't own
const skin = (id, name, more) => ({ championId: 103, id, name, isBase: id === 103000, unlocked: true, disabled: false, ownership: { owned: true }, childSkins: [], ...more });
const SKINS = [skin(103000, 'Ahri'), skin(103001, 'Dynasty Ahri', { childSkins: [skin(103020, 'Dynasty Ahri (Ruby)', { shortName: 'Ruby', colors: ['#9C1F2E', '#E0C080'] }),
  skin(103021, 'Dynasty Ahri (Pearl)', { shortName: 'Pearl', unlocked: false, ownership: { owned: false }, colors: ['#FFFFFF'] })] }), skin(103002, 'Midnight Ahri', { unlocked: false, ownership: { owned: false } })];
const RUNES = { primaryPerkStyleId: 8100, secondaryPerkStyleId: 8200, perks: [8112, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5002].map((id) => ({ id })), summonerSpellIds: [14, 4], keystone: { name: 'Electrocute' } };
// a finished game: you carried your team, Zed the best of the others. For a game in your match history you play the
// champion and lane you played there, and your team won if you did; the second has no lanes (the timeline tells them).
const LANE = { TOP: ['TOP', 'SOLO'], JUNGLE: ['JUNGLE', 'NONE'], MIDDLE: ['MIDDLE', 'SOLO'], BOTTOM: ['BOTTOM', 'DUO_CARRY'], UTILITY: ['BOTTOM', 'DUO_SUPPORT'] };
function report(id) {
  const g = MY_HIST.games.games.find((x) => x.gameId === id), mine = g && g.participants[0], won = mine ? mine.stats.win : true;
  const ps = [...TEAM1.map((p) => [...p, 100, won]), ...TEAM2.map((p) => [...p, 200, !won])];
  return {
    gameId: id, gameCreation: g ? g.gameCreation : t0, gameDuration: 1700, queueId: 420, gameMode: 'CLASSIC',
    participantIdentities: ps.map(([puuid, name], i) => ({ participantId: i + 1, player: { puuid: puuid || 'enemy5', gameName: name, tagLine: 'EUW' } })),
    participants: ps.map(([, , champ, pos, teamId, win], i) => {
      const star = i === 0 ? 3 : i === 7 ? 2 : 1, [lane, role] = i === 0 && mine && mine.timeline ? [mine.timeline.lane, mine.timeline.role] : LANE[pos];
      return { participantId: i + 1, teamId, championId: i === 0 && mine ? mine.championId : champ, ...(id !== 9001 && { timeline: { lane, role } }),
        stats: { win, kills: 2 * star, deaths: win ? 2 : 5, assists: 3 * star, totalDamageDealtToChampions: 9000 * star, goldEarned: 8000 + 2000 * star,
          visionScore: 20, totalMinionsKilled: 120 * star, neutralMinionsKilled: 0, totalDamageTaken: 15000, damageSelfMitigated: 5000,
          physicalDamageDealtToChampions: 1000 * star, magicDamageDealtToChampions: 7000 * star, trueDamageDealtToChampions: 1000 * star,
          wardsPlaced: 8 + star, wardsKilled: star, visionWardsBoughtInGame: 2, damageDealtToTurrets: 1500 * star, timeCCingOthers: 12 * star, item0: 3020, item1: 6655,
          perkPrimaryStyle: 8100, perkSubStyle: 8200, ...Object.fromEntries([8112, 8139, 8138, 8135, 8226, 8237].map((id, k) => ['perk' + k, id])) } };
    }),
  };
}
// Riot's copy of a game (match-v5, through our server): League's client's numbers, with what only Riot's has, the
// shards of everyone's rune page and the extra numbers (challenges). You hit 60 skillshots (10 fewer in each older
// game), dodged 20, saved 2 allies, took 3 turret plates and were dead a minute; Zed hit 40, dodged 25, saved none, took
// a plate and was dead 2:30; everyone else 30, 10, 1, none and 1:30.
function copy5(id) {
  const g = report(id), back = id === GAME ? 0 : id - 9000;
  return { metadata: { matchId: `EUW1_${id}` }, info: { gameId: id, platformId: 'EUW1', gameCreation: g.gameCreation, gameDuration: g.gameDuration, gameEndTimestamp: g.gameCreation + g.gameDuration * 1000, queueId: 420, gameMode: 'CLASSIC',
    participants: g.participants.map(({ participantId, teamId, championId, stats: s }, i) => {
      const [hit, dodged, saved, plates, dead] = i === 0 ? [60 - 10 * back, 20, 2, 3, 60] : i === 7 ? [40, 25, 0, 1, 150] : [30, 10, 1, 0, 90];
      return { ...s, participantId, teamId, championId, puuid: g.participantIdentities[i].player.puuid, totalTimeSpentDead: dead, challenges: { skillshotsHit: hit, skillshotsDodged: dodged, saveAllyFromDeath: saved, turretPlatesTaken: plates },
        perks: { statPerks: { offense: 5005, flex: 5008, defense: 5011 }, styles: [{ style: s.perkPrimaryStyle, selections: [0, 1, 2, 3].map((k) => ({ perk: s['perk' + k] })) }, { style: s.perkSubStyle, selections: [4, 5].map((k) => ({ perk: s['perk' + k] })) }] } };
    }) } };
}
// a game's timeline, a frame a minute: everyone in their lane's part of the map (you ahead of Zed in CS and gold, behind
// in XP), your buys, the order you levelled Q, W, E and R, and the fights and objectives: you kill Zed in the middle
// lane with Lee Sin, Zed and Vi kill you twice in the river, and you help Jinx kill Caitlyn; your team takes two
// dragons, Baron and three towers (and an inhibitor), theirs the Rift Herald and a tower. Riot's positions are game
// units from the blue base, bottom left; a tower's teamId is whose tower fell.
const FIGHTS = [[390, 'CHAMPION_KILL', 1, { victimId: 8, assistingParticipantIds: [3], position: { x: 7400, y: 7400 } }],
  [490, 'CHAMPION_KILL', 8, { victimId: 1, assistingParticipantIds: [7], position: { x: 5500, y: 9000 } }], [540, 'ELITE_MONSTER_KILL', 3, { monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' }],
  [760, 'CHAMPION_KILL', 8, { victimId: 1, assistingParticipantIds: [7], position: { x: 10000, y: 4500 } }], [840, 'ELITE_MONSTER_KILL', 7, { monsterType: 'RIFT_HERALD' }],
  [900, 'BUILDING_KILL', 1, { teamId: 200, buildingType: 'TOWER_BUILDING' }], [1000, 'BUILDING_KILL', 8, { teamId: 100, buildingType: 'TOWER_BUILDING' }],
  [1100, 'CHAMPION_KILL', 4, { victimId: 9, assistingParticipantIds: [1, 5], position: { x: 12000, y: 2500 } }], [1260, 'ELITE_MONSTER_KILL', 3, { monsterType: 'DRAGON', monsterSubType: 'WATER_DRAGON' }],
  [1500, 'ELITE_MONSTER_KILL', 3, { monsterType: 'BARON_NASHOR' }], [1560, 'BUILDING_KILL', 2, { teamId: 200, buildingType: 'TOWER_BUILDING' }],
  [1600, 'BUILDING_KILL', 4, { teamId: 200, buildingType: 'TOWER_BUILDING' }], [1620, 'BUILDING_KILL', 4, { teamId: 200, buildingType: 'INHIBITOR_BUILDING' }]];
const SPOT = { TOP: [2000, 12000], JUNGLE: [5000, 7000], MIDDLE: [7400, 7400], BOTTOM: [12500, 2500], UTILITY: [12000, 2300] };
const SKILLS = [1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3];
const SWING = { 9002: -2000, 9006: 3000 }; // your gold from 15 minutes on: you won 9002 from 1.3k behind and lost 9006 from 3.8k ahead
function timeline(id) {
  const g = MY_HIST.games.games.find((x) => x.gameId === id), champ = g ? g.participants[0].championId : 103;
  const buys = champ === 86 ? [[30, 1055], [30, 2003], [600, 3047], [900, 3071]] : [[25, 1056], [25, 2003], [26, 3340], [480, 3020], [720, 6655], [1200, 3157], [1680, 3089]];
  const ps = [...TEAM1, ...TEAM2];
  const frames = Array.from({ length: 31 }, (_, m) => ({ timestamp: m * 60000 + (m ? 300 : 0), events: [],
    participantFrames: Object.fromEntries(ps.map(([, , , pos], i) => [String(i + 1), { participantId: i + 1, position: { x: SPOT[pos][0], y: SPOT[pos][1] }, level: 1,
      minionsKilled: (i === 0 ? 8 : pos === 'UTILITY' ? 1 : pos === 'JUNGLE' ? 0 : 7) * m, jungleMinionsKilled: pos === 'JUNGLE' ? 4 * m : 0,
      totalGold: (i === 0 ? 400 : 350) * m + (i === 0 && m >= 15 ? SWING[id] || 0 : 0), currentGold: 0, xp: (i === 0 ? 500 : 520) * m }])) }));
  for (const [t, itemId] of buys) frames[Math.ceil(t / 60)].events.push({ type: 'ITEM_PURCHASED', timestamp: t * 1000, participantId: 1, itemId });
  SKILLS.forEach((skillSlot, k) => frames[1 + k].events.push({ type: 'SKILL_LEVEL_UP', timestamp: (1 + k) * 60000, participantId: 1, skillSlot, levelUpType: 'NORMAL' }));
  for (const [t, type, killerId, e] of FIGHTS) frames[Math.ceil(t / 60)].events.push({ type, timestamp: t * 1000, killerId, ...e });
  return { frames };
}
// Clash: your team's next match is against Night Owls, two of whom League names
const CLASH_SUMS = { 501: { puuid: 'clash1', gameName: 'Owl', tagLine: 'NA1' }, 502: { puuid: 'clash2', gameName: 'Hoot', tagLine: 'NA1' } };
const lcu = { phase: '', rc: null, cs: null, pages: [{ id: 1, name: 'My page', isEditable: true }], lpNote: null, lobby: null, search: null, calls: [], refused: [], general: { WindowMode: 0, Width: 1920, Height: 1080 }, saved: null,
  clash: true, lp: {}, replay: {}, version: '14.20.612.1234', replayBlocked: false, itemSets: { accountId: 77, timestamp: 1, itemSets: [{ uid: 'mine-1', title: 'My set', blocks: [] }] } };
const flatActions = () => lcu.cs.actions.flat();
function champSelect(gameId, me = {}) {
  const cell = (cellId, puuid, gameName, pos, extra) => ({ cellId, puuid, gameName, tagLine: gameName ? 'EUW' : '', nameVisibilityType: gameName ? 'VISIBLE' : 'HIDDEN', assignedPosition: pos, championId: 0, championPickIntent: 0, spell1Id: 4, spell2Id: 12, ...extra });
  lcu.cs = {
    gameId, localPlayerCellId: 2, timer: { adjustedTimeLeftInPhase: 30000 },
    myTeam: [cell(0, 'ally1', 'Friend', 'top', { championPickIntent: 86 }), cell(1, 'hidden1', '', 'jungle'), cell(2, ME, 'Rayan', 'middle', { spell2Id: 14, ...me }), cell(3, '', '', 'bottom'), cell(4, 'ally4', 'Hooks', 'utility', { championPickIntent: 412 })],
    theirTeam: [5, 6, 7, 8, 9].map((cellId) => ({ cellId, championId: 0 })),
    actions: [[{ id: 1, actorCellId: 0, type: 'ban', completed: true, isInProgress: false, championId: 157 }, { id: 3, actorCellId: 2, type: 'ban', completed: false, isInProgress: true, championId: 0 }],
      [{ id: 8, actorCellId: 2, type: 'pick', completed: !!me.championId, isInProgress: false, championId: me.championId || 0 }]],
    trades: [{ id: 5, cellId: 0, state: 'AVAILABLE' }], positionSwaps: [{ id: 6, cellId: 4, state: 'RECEIVED' }], pickOrderSwaps: [],
  };
}
// the games League has open (Arena isn't now, Practice Tool isn't a queue) and your friends: Friend's in your lobby, Duo
// is free, Gamer's in a game, Agent plays Valorant and Sleepy is offline
const QUEUE_LIST = [[420, 'CLASSIC', 'PvP', 'Ranked Solo/Duo', 30], [400, 'CLASSIC', 'PvP', 'Draft Pick', 40], [450, 'ARAM', 'PvP', 'ARAM', 0], [870, 'CLASSIC', 'VersusAi', 'Intro', 0], [1700, 'CHERRY', 'PvP', 'Arena', 0, 'PlatformDisabled'],
  [3140, 'PRACTICETOOL', 'Custom', 'Practice Tool', 0, 'Available', true]].map(([id, gameMode, category, description, gameSelectPriority, queueAvailability = 'Available', isCustom = false]) => ({ id, gameMode, category, description, name: description, gameSelectPriority, queueAvailability, isCustom, isVisible: true }));
const FRIENDS = [['ally1', 30, 'Friend', 'chat', 'league_of_legends', 'hosting_RANKED_SOLO_5x5'], ['duo1', 31, 'Duo', 'chat', 'league_of_legends', 'outOfGame'], ['gamer1', 32, 'Gamer', 'dnd', 'league_of_legends', 'inGame'],
  ['val1', 33, 'Agent', 'chat', 'valorant', ''], ['off1', 34, 'Sleepy', 'offline', '', '']].map(([puuid, summonerId, gameName, availability, product, gameStatus]) => ({ puuid, summonerId, gameName, gameTag: 'EUW', availability, product, lol: gameStatus ? { gameStatus } : {} }));
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p, body) {
  lcu.calls.push([method, p, body]);
  if (!allowed(method, p)) { lcu.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  let m;
  if (p === '/lol-gameflow/v1/session') return ok({ map: { id: 11 }, gameData: { gameId: lcu.cs && lcu.phase === 'ChampSelect' ? lcu.cs.gameId : GAME, queue: { id: 420, isRanked: true, mapId: 11 },
    teamOne: TEAM1.map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition })),
    teamTwo: TEAM2.map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition })) } });
  if (p === '/lol-matchmaking/v1/ready-check') return lcu.rc ? ok(lcu.rc) : { status: 404, data: null };
  if ((m = /^\/lol-matchmaking\/v1\/ready-check\/(accept|decline)$/.exec(p))) { if (lcu.rc) lcu.rc.playerResponse = m[1] === 'accept' ? 'Accepted' : 'Declined'; return { status: 204, data: null }; }
  if (p === '/lol-champ-select/v1/session') return lcu.cs && lcu.phase === 'ChampSelect' ? ok(lcu.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(CHAMPS.map((c) => c[1]));
  if ((m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)$/.exec(p))) {
    const a = flatActions().find((x) => x.id === +m[1]);
    a.championId = body.championId;
    if (a.type === 'pick') lcu.cs.myTeam[2].championPickIntent = body.championId;
    return { status: 204, data: null };
  }
  if ((m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)\/complete$/.exec(p))) {
    const a = flatActions().find((x) => x.id === +m[1]);
    Object.assign(a, { completed: true, isInProgress: false });
    if (a.type === 'ban') { flatActions().find((x) => x.id === 8).isInProgress = true; lcu.cs.theirTeam[2].championId = 238; } // their mid locked in Zed meanwhile
    else Object.assign(lcu.cs.myTeam[2], { championId: a.championId, selectedSkinId: a.championId * 1000 });
    return { status: 204, data: null };
  }
  if (p === '/lol-champ-select/v1/session/my-selection') { Object.assign(lcu.cs.myTeam[2], body); return { status: 204, data: null }; }
  if (p === '/lol-champ-select/v1/skin-carousel-skins') return ok(lcu.cs.myTeam[2].championId === 103 ? SKINS : []);
  if (p === '/lol-lobby-team-builder/champ-select/v1/session/quit') return { status: 204, data: null }; // a dodge (League stays in champ select here)
  if ((m = /^\/lol-champ-select\/v1\/session\/bench\/swap\/(\d+)$/.exec(p))) { // ARAM: yours goes to the bench
    const b = lcu.cs.benchChampions.find((x) => x.championId === +m[1]);
    [b.championId, lcu.cs.myTeam[2].championId] = [lcu.cs.myTeam[2].championId, b.championId];
    return { status: 204, data: null };
  }
  if (p === '/lol-champ-select/v1/session/my-selection/reroll') { lcu.cs.rerollsRemaining--; lcu.cs.myTeam[2].championId = 222; return { status: 204, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1234, summonerLevel: 300, profileIconId: 4568 });
  if ((m = /^\/lol-summoner\/v2\/summoners\/puuid\/([\w-]+)$/.exec(p))) return ok({ puuid: m[1], summonerLevel: m[1] === 'enemy4' ? 30 : 200 });
  if ((m = /^\/lol-summoner\/v1\/summoners\/(\d+)$/.exec(p))) return CLASH_SUMS[m[1]] ? ok({ ...CLASH_SUMS[m[1]], summonerId: +m[1] }) : { status: 404, data: null };
  if ((m = /alias\/lookup\?gameName=([^&]*)&tagLine=(.*)$/.exec(p))) {
    const who = { Singer: 'enemy5', Sniper: 'enemy4', Axe: 'enemy1' }[decodeURIComponent(m[1])];
    return who && m[2] === 'EUW' ? ok({ puuid: who }) : { status: 404, data: null };
  }
  if ((m = /^\/lol-ranked\/v1\/ranked-stats\/(.+)$/.exec(p))) return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: lcu.lp[m[1]] || 45, wins: 30, losses: 25 }, ...(m[1] === 'ally1' && { RANKED_FLEX_SR: { tier: 'SILVER', division: 'I', leaguePoints: 10, wins: 3, losses: 1 } }) } });
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: lcu.lpNote ? 63 : 45, wins: 31, losses: 25,
    highestTier: 'GOLD', highestDivision: 'I', previousSeasonEndTier: 'PLATINUM', previousSeasonEndDivision: 'IV', previousSeasonHighestTier: 'PLATINUM', previousSeasonHighestDivision: 'II' },
    RANKED_TFT: { tier: 'PLATINUM', division: 'I', leaguePoints: 77, wins: 9, losses: 51 }, RANKED_TFT_DOUBLE_UP: { tier: '', division: 'NA', wins: 0, losses: 0 }, RANKED_TFT_TURBO: { tier: '', ratedTier: 'PURPLE', ratedRating: 3200, wins: 2, losses: 10 } } });
  if (p === '/lol-ranked/v1/current-lp-change-notification') return lcu.lpNote ? ok(lcu.lpNote) : { status: 404, data: null };
  if ((m = /^\/lol-match-history\/v1\/products\/lol\/([\w-]+)\/matches\?begIndex=(\d+)&endIndex=(\d+)$/.exec(p))) { // both ends in, as League's client does
    const h = m[1] === 'current-summoner' ? MY_HIST : histOf(m[1]);
    return ok({ games: { games: h.games.games.slice(+m[2], +m[3] + 1) } });
  }
  if ((m = /^\/lol-match-history\/v1\/products\/tft\/([\w-]+)\/matches\?begin=(\d+)&count=(\d+)$/.exec(p))) return ok({ active_puuid: m[1], games: m[1] === ME ? TFT.slice(+m[2], +m[2] + +m[3]) : [] });
  if ((m = /^\/lol-match-history\/v1\/games\/(\d+)$/.exec(p))) return ok(report(+m[1]));
  if ((m = /^\/lol-match-history\/v1\/game-timelines\/(\d+)$/.exec(p))) return ok(timeline(+m[1]));
  if ((m = /^\/lol-item-sets\/v1\/item-sets\/(\d+)\/sets$/.exec(p))) {
    if (m[1] !== '1234') return { status: 404, data: null };
    if (method === 'GET') return ok(lcu.itemSets);
    lcu.itemSets = body;
    return { status: 201, data: null };
  }
  if ((m = /^\/lol-replays\/v1\/metadata\/(\d+)$/.exec(p))) return ok({ gameId: +m[1], state: lcu.replay[m[1]] || 'download', downloadProgress: 0 });
  if ((m = /^\/lol-replays\/v1\/rofls\/(\d+)\/(download|watch)$/.exec(p))) { if (lcu.replayBlocked) return { status: 403, data: null }; lcu.replay[m[1]] = 'watch'; return { status: 204, data: null }; }
  if (p === '/lol-spectator/v3/buddy/spectate') return ok({ availableForWatching: body.filter((u) => u === 'ally1') });
  if (p === '/lol-spectator/v1/spectate/launch') return { status: 204, data: null };
  if (p === '/lol-clash/v1/tournament-summary') return ok(lcu.clash ? [{ state: 'LOCK_IN', tournamentId: 1, rosterId: 'r-ours', bracketId: 42 }] : []);
  if (p === '/lol-clash/v1/bracket/42') return ok({ matches: [{ id: 1, round: 1, rosterId1: 7, rosterId2: 8, status: 'UPCOMING' }], rosters: [{ rosterId: 7, name: 'Our Team', shortName: 'OUR' }, { rosterId: 8, name: 'Night Owls', shortName: 'OWL' }] });
  if (p === '/lol-clash/v1/roster/r-ours') return ok({ id: 'r-ours', name: 'Our Team', members: [] });
  if (p === '/lol-clash/v1/roster/8') return ok({ id: '8', name: 'Night Owls', members: [{ summonerId: 501, position: 'TOP' }, { summonerId: 502, position: 'MIDDLE' }] });
  if ((m = /^\/lol-champion-mastery\/v1\/([\w-]+)\/champion-mastery$/.exec(p))) return ok(mastery(m[1] === 'local-player' ? ME : m[1]));
  if (p === '/lol-perks/v1/recommended-champion-positions') return ok(Object.fromEntries(Object.entries(POSITIONS).map(([k, v]) => [k, { recommendedPositions: v }])));
  if ((m = /^\/lol-perks\/v1\/recommended-pages\/champion\/(\d+)\/position\/([A-Z]+)\/map\/11$/.exec(p))) return ok((POSITIONS[m[1]] || []).includes(m[2]) ? [RUNES] : []);
  if (p === '/lol-perks/v1/pages' && method === 'GET') return ok(lcu.pages);
  if (p === '/lol-perks/v1/pages') { const page = { ...body, id: 49 + lcu.pages.length, isEditable: true }; for (const x of lcu.pages) x.current = false; lcu.pages.push(page); return ok(page); } // 50, then 51
  if ((m = /^\/lol-perks\/v1\/pages\/(\d+)$/.exec(p))) { Object.assign(lcu.pages.find((x) => x.id === +m[1]), body); return { status: 201, data: null }; }
  if (p === '/lol-perks/v1/currentpage') { for (const x of lcu.pages) x.current = x.id === body; return { status: 204, data: null }; }
  if (p === '/lol-patch/v1/game-version') return ok(lcu.version);
  if (p === '/lol-game-settings/v1/game-settings') { if (method === 'PATCH') Object.assign(lcu.general, body.General); return ok({ General: { ...lcu.general }, HUD: { MinimapScale: 1 } }); } // League in Fullscreen (0) at first
  if (p === '/lol-game-settings/v1/save') { lcu.saved = { ...lcu.general }; return ok(true); }
  if (p === '/lol-lobby/v2/lobby' && method === 'GET') return lcu.lobby ? ok(lcu.lobby) : { status: 404, data: null };
  if (p === '/lol-lobby/v2/lobby' && method === 'DELETE') { lcu.lobby = null; return { status: 204, data: null }; }
  if (p === '/lol-lobby/v2/lobby') return ok({ ...body, localMember: { isLeader: true } });
  if (p === '/lol-lobby/v2/lobby/invitations') { lcu.lobby.invitations.push(...body.map((i) => ({ ...i, state: 'Pending' }))); return ok(lcu.lobby.invitations); }
  if (p === '/lol-game-queues/v1/queues') return ok(QUEUE_LIST);
  if (p === '/lol-chat/v1/friends') return ok(FRIENDS);
  if (p === '/lol-matchmaking/v1/search') return lcu.search ? ok(lcu.search) : { status: 404, data: null };
  if (p === '/lol-lobby/v2/lobby/members/localMember/position-preferences') { if (lcu.lobby) Object.assign(lcu.lobby.localMember, { firstPositionPreference: body.firstPreference, secondPositionPreference: body.secondPreference }); return { status: 201, data: null }; }
  if (/^\/lol-lobby\/(v2\/lobby\/matchmaking\/search|v1\/lobby\/custom\/start-champ-select)$/.test(p)) return { status: 204, data: null };
  if ((m = /^\/lol-champ-select\/v1\/session\/(champion-swaps|position-swaps|pick-order-swaps)\/(\d+)\/(request|accept|decline|cancel)$/.exec(p))) {
    const k = { 'champion-swaps': 'trades', 'position-swaps': 'positionSwaps', 'pick-order-swaps': 'pickOrderSwaps' }[m[1]], t = lcu.cs[k].find((x) => x.id === +m[2]);
    t.state = { request: 'SENT', accept: 'ACCEPTED', decline: 'DECLINED', cancel: 'AVAILABLE' }[m[3]];
    return { status: 204, data: null };
  }
  return { status: 404, data: null };
}
const callsTo = (re, method, since = 0) => lcu.calls.slice(since).filter(([m, p]) => re.test(p) && (!method || m === method));
// a friend's League, on their own PC: just who they are and their rank
const friendLcu = (method, p) => (p === '/lol-summoner/v1/current-summoner' ? ok({ puuid: 'ally1', gameName: 'Friend', tagLine: 'EUW', summonerId: 999 })
  : p === '/lol-ranked/v1/current-ranked-stats' ? ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'PLATINUM', division: 'IV', leaguePoints: 12, wins: 40, losses: 30 } } }) : { status: 404, data: null });
const until = async (fn, what, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return;
  throw new Error('timed out waiting for ' + what);
};

// ---- the browser side
// Runs in the page before its own scripts: the desktop app 1.6 (client/preload.js), with League's client answering
// through fakeLcu and clips going to nodeClip; and a screen that changes every frame, with a tone as what you hear.
function fakeApp(version) {
  const on = {}, from = (v) => version.localeCompare(v, 'en', { numeric: true }) >= 0; // 1.10 is after 1.9
  window.lpcClient = {
    calls: [], version,
    screens: async () => [{ id: '1', main: true, thumb: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
    useScreen() {}, keys: async (k) => ({ mute: !!k.mute, show: !!k.show, clip: !!k.clip, overlay: !!k.overlay, ptt: !!k.ptt }), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; },
    re4: async (what, arg) => ({ role: 'host', tunnelIp: '10.66.0.1', mod: what === 'ours' ? 'ours' : 'theirs', modVersion: what === 'ours' ? '0.6.14-retarget' : '', build: '22377325', running: false, why: null, setup: what !== 'setup', firewallOn: false,
      friends: [{ ip: '10.66.0.2', name: 'cutiecatty' }], peers: [{ ip: '10.66.0.2', online: true, ms: 38, mod: 'theirs', modVersion: '', build: '22377325', running: true }],
      invite: what === 'invite' ? `RE4COOP1.for-${arg}` : null,
      note: { play: 'Saves backed up for 1 Steam account. Starting RE4...', setup: 'This PC is set up to host.', ours: 'Their mod is out and ours is back.', invite: `Invite for ${arg} ready.` }[what] || null,
      connection: [{ level: 'good', title: 'Tunnel running', detail: 're4coop, starts with Windows' }], privacy: [{ level: 'warn', title: 'Game port open to your friend', detail: 'UDP 39000' }],
      game: [{ level: 'idle', title: 'Not running', detail: 'Play starts it through Steam' }], saves: { level: 'good', title: 'Saves: last backup just now', detail: '' } }),
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    ...(from('1.6') && {
      lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b),
      async clip(data) {
        const u8 = new Uint8Array(data);
        window.lastClip = u8;
        let bin = '';
        for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode(...u8.subarray(i, i + 32768));
        return window.nodeClip(btoa(bin));
      },
      clipsFolder() { this.calls.push('clips-folder'); },
    }),
    // 1.7: the gallery, with the clips kept here (and saved by nodeClip), the performance meter and test recordings
    ...(from('1.7') && {
      async clip(data, pic, like) {
        const u8 = new Uint8Array(data);
        window.lastClip = u8;
        let bin = '';
        for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode(...u8.subarray(i, i + 32768));
        const name = await window.nodeClip(btoa(bin), like || '');
        let p = '';
        if (pic) { const b = new Uint8Array(pic); let s = ''; for (const v of b) s += String.fromCharCode(v); p = 'data:image/jpeg;base64,' + btoa(s); }
        fakeClips.set(name, { data: u8, pic: p, at: Date.now() });
        return name;
      },
      clips: async () => [...fakeClips].map(([name, c]) => ({ name, size: c.data.length, at: c.at, pic: c.pic })).sort((a, b) => b.at - a.at),
      clipRead: async (n) => (fakeClips.has(n) ? fakeClips.get(n).data.slice().buffer : null),
      async clipRename(n, to) {
        to = to.trim() + '.webm';
        if (!fakeClips.has(n) || fakeClips.has(to) || /[\\/:*?"<>|]/.test(to)) return '';
        fakeClips.set(to, fakeClips.get(n));
        fakeClips.delete(n);
        return to;
      },
      clipTrash: async (n) => fakeClips.delete(n),
      clipDrag(n) { this.calls.push('drag ' + n); },
      async clipsClean(limit, keep) { this.calls.push(['clean', limit, keep]); return []; },
      metrics: async () => ({ cpu: 3.2, mb: 412 }),
      record(on) { this.calls.push('record ' + on); },
      recordingsFolder() { this.calls.push('recordings-folder'); },
    }),
    ...(from('1.9') && { front() { this.calls.push('front'); } }), // 1.9: in front when a match is found
  };
  const fakeClips = new Map();
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const g = cv.getContext('2d');
  let n = 0;
  setInterval(() => { g.fillStyle = `hsl(${(n * 7) % 360} 60% 30%)`; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#fff'; g.font = '64px sans-serif'; g.fillText(String(n++), 40 + (n % 600), 300); }, 33);
  navigator.mediaDevices.getDisplayMedia = async (c) => {
    const s = cv.captureStream(30);
    if (c && c.audio) { const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.connect(d); o.start(); s.addTrack(d.stream.getAudioTracks()[0]); }
    return s;
  };
}
async function context(browser, { version = '', phone = false } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    let m;
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if ((m = /\/cdn\/([\d.]+)\/data\/en_US\/champion\/(\w+)\.json$/.exec(u))) return r.fulfill({ json: champFull(m[2], m[1]), headers: cors });
    if (u.endsWith('item.json')) return r.fulfill({ json: ITEMS, headers: cors });
    if (u.endsWith('runesReforged.json')) return r.fulfill({ json: RUNE_TREES, headers: cors });
    if (u.endsWith('summoner.json')) return r.fulfill({ json: SUMMONER, headers: cors });
    if (u.endsWith('/cdn/1.1/data/en_US/tft-regalia.json')) return r.fulfill({ json: REGALIA, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  if (phone) await ctx.addInitScript(() => { window.buzzes = []; navigator.vibrate = (p) => { buzzes.push(p); return true; }; }); // the phone's buzz
  ctx.hellos = []; // what the page tells our server about this device (/hello, who has Premade)
  await ctx.route('**/hello', (r) => { ctx.hellos.push(JSON.parse(r.request().postData())); r.fulfill({ status: 204, headers: cors }); });
  if (!phone) {
    await ctx.route('**/latest.yml', (r) => r.fulfill({ body: 'version: 2.0.0\npath: Premade-Setup.exe\n', contentType: 'text/yaml' })); // a newer app is out
    await ctx.addInitScript(() => {
      localStorage.setItem('lpc-setup', '1');
      localStorage.setItem('lpc-name', 'Rayan');
      localStorage.setItem('lpc-news', '9999'); // no What's new
      localStorage.setItem('lpc-btwarned', JSON.stringify(['Fake Default Audio Input'])); // its 16 kHz recording is a phone-quality mic: no popup
      if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false }));
      // a ranked game two days ago, for the LP chart
      if (!localStorage.getItem('lpc-lp')) localStorage.setItem('lpc-lp', JSON.stringify([{ id: 1, at: Date.now() - 2 * 86400e3, q: 'RANKED_SOLO_5x5', tier: 'GOLD', div: 'III', lp: 80, delta: -15, win: false }]));
    });
    if (version) await ctx.addInitScript(fakeApp, version);
  }
  const page = await ctx.newPage();
  const who = phone ? 'phone' : version || 'web';
  page.on('pageerror', (e) => console.log(`[${who}] page error:`, e.message));
  page.on('console', (m) => ((m.type() === 'error' && !m.text().startsWith('Failed to load resource')) || (m.type() === 'warning' && /^clips?:/.test(m.text()))) && console.log(`[${who}]`, m.text()));
  return [ctx, page];
}
const clips = process.env.CLIPS || fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-clips-')); // CLIPS=folder keeps them
const savedClips = [];
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => { // not on animation frames: a busy container holds those back
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; lcu ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.lcu()).catch(() => null))}; last calls ${JSON.stringify(lcu.calls.slice(-6))}; toasts ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.toasts().slice(-5)).catch(() => null))}; clips ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.clips && lpc.clips()).catch(() => null))}; page ${JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).innerText();
// the text of everything a selector finds, read in one go: champ select and the game redraw their rows every second, and
// a row read after a redraw replaced it has no layout, so its text runs together
const texts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true }); // SHOTS=folder saves screenshots
// the tips for Ahri against Zed in the middle (site/index.html tipsFor), after your note when you have one
const TIPS_AHRI_ZED = ['High elo: Ahri won 12 of 30 games against Zed, −200 gold and +5 CS at 10 minutes. A hard matchup for Ahri.',
  'You: 9 of 13 games won against Zed in your lane, 6 of 8 on Ahri.',
  'Zed is a melee assassin with mostly physical damage, so armor helps against them. You outrange Zed: 550 against 125.',
  'Riot’s tip against Zed: Zed’s shadows copy his abilities: stand away from them.', 'Riot’s tip against Zed: Zhonya’s Hourglass stops Death Mark.',
  'Against Zed, high elo Ahri players take Electrocute (10 of 10 games) and Flash + Ignite (10 of 10 games).',
  'Against Ahri, high elo Zed players take Flash + Ignite (10 of 10 games).', 'Riot’s tip for Ahri: Use Charm to set up your combos.'];
const tipsIn = (page, sel) => page.$$eval(`${sel} li`, (l) => l.map((e) => e.textContent));
const leagueData = (over = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 600, room: 'g0123456789a', result: '',
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 },
  players: [...TEAM1.map(([, n, c, pos], i) => ({ name: `${n}#EUW`, team: 'ORDER', champ: Object.values(DDATA).find((d) => +d.key === c).id, champName: '', pos, lvl: 11, k: [3, 2, 0, 0, 0][i], d: 1, a: 2, cs: 100, items: [[3031, 1]] })),
    ...TEAM2.map(([, n, c, pos], i) => ({ name: `${n}#EUW`, team: 'CHAOS', champ: Object.values(DDATA).find((d) => +d.key === c).id, champName: '', pos, lvl: 10, k: [1, 0, 2, 0, 0][i], d: 2, a: 1, cs: 90, items: [[1001, 1]] }))],
  events: [{ e: 'dragon', t: 400, team: 'ORDER', type: 'Fire', me: false, alive: true }, { e: 'tower', t: 500, of: 'CHAOS', name: 'Turret_T2_C_05_A', team: 'ORDER' }, { e: 'inhib', t: 550, of: 'CHAOS', name: 'Barracks_T2_C1', team: 'ORDER' }],
  ...over,
});

(async () => {
  const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH && { executablePath: process.env.PW_CHROMIUM_PATH }), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    `--use-file-for-fake-audio-capture=${path.join(__dirname, 'fixtures/that-was-sick.wav')}`] }); // the mic says “That was sick.” every 5 s, for clips by voice
  try {
    // ---- in a browser there's no Game page; an old app has it, with a note to restart for the update
    {
      const [ctx, page] = await context(browser);
      await page.goto(URL_);
      assert(!(await page.locator('.nav[data-view="game"]').isVisible()) && !(await page.locator('.nav[data-view="pregame"]').isVisible()), 'no Pregame or Game page in a browser');
      await ctx.close();
      const [ctx2, old] = await context(browser, { version: '1.5.0' });
      await old.goto(URL_);
      await old.click('#leagueNav'); await old.click('.nav[data-view="pregame"]');
      assert.match(await text(old, '#preNote'), /Restart the app to finish its update/);
      await old.click('#leagueNav'); await old.click('.nav[data-view="game"]');
      assert.match(await text(old, '#lcuNote'), /Restart the app to finish its update/);
      await old.click('#leagueNav'); await old.click('.nav[data-view="stats"]');
      assert(!(await old.locator('#lpQueue').isVisible()) && !(await old.locator('#clipsFolder').isVisible()), 'an old app has no Ranked, Match history or Clips');
      await ctx2.close();
      console.log('Pregame and Game pages: only in the desktop app; an old app is told to restart for its update');
    }

    // ---- Features: what the app can do and how to set it up, on the website and in the desktop app
    {
      const card = (p, name) => p.locator('.feat').filter({ has: p.locator('h3', { hasText: new RegExp(`^${name}`) }) });
      const [ctx, page] = await context(browser);
      await page.goto(URL_);
      await page.click('.nav[data-view="features"]');
      assert.deepStrictEqual(await texts(page, '#setupList h3'), ['Get the desktop app', 'Your name', 'Your mic', 'A room with your friends', 'Your League screen', 'League in Borderless']);
      assert.deepStrictEqual(await texts(page, '#setupList .sstate'), ['You’re on the website', 'Rayan', 'Not tested yet', 'Not in a room', 'Not shared', 'The desktop app checks it']);
      assert.strictEqual(await text(page, '#setupNote'), '1 of 6 done. Run setup again walks you through your name, mic and screen.');
      assert(await page.locator('#setupList a[href$="/Premade-Setup.exe"]').isVisible(), 'the installer, on the website');
      assert.match(await card(page, 'Auto hover').innerText(), /Desktop app/);
      assert.strictEqual(await card(page, 'Auto hover').locator('[data-go]').count(), 0, 'no Show me for what needs the desktop app');
      await page.fill('#featFind', 'push talk');
      assert.deepStrictEqual(await texts(page, '.feat:not([hidden]) h3'), ['Mute and push to talk']);
      assert.deepStrictEqual(await page.$$eval('.fgroup:not([hidden]) h2', (l) => l.map((e) => e.textContent)), ['Rooms']);
      await page.fill('#featFind', 'qwerty');
      assert(await page.locator('#featNone').isVisible(), 'nothing found');
      await page.fill('#featFind', '');
      await page.locator('#setupList li', { hasText: 'Your name' }).locator('[data-go]').click();
      assert(await page.evaluate(() => !document.querySelector('.view[data-view="voice"]').hidden && document.getElementById('voiceSet').open && document.activeElement.id === 'name'
        && document.getElementById('name').closest('label').classList.contains('flash')), 'Show me: your name, in Voice settings');
      await ctx.close();
      const [actx, app] = await context(browser, { version: '1.13.0' });
      await actx.exposeFunction('fakeLcu', () => ({ status: 0, data: null })); // League isn't running
      await app.goto(URL_);
      await wait(app, () => window.lpc, null, 'the page');
      await app.click('.nav[data-view="features"]');
      assert.deepStrictEqual(await app.evaluate(() => [...document.querySelectorAll('[data-go]')].flatMap((b) => b.dataset.go.split(',')).filter((s) => !document.querySelector(s))), [], 'every Show me has a spot to go to');
      assert.strictEqual(await app.locator('#featList .feat').count(), await app.locator('#featList [data-go]').count(), 'Show me on every feature in the desktop app');
      assert.strictEqual(await card(app, 'Install as an app').count(), 0, 'website only');
      assert.deepStrictEqual(await texts(app, '#setupList .sstate'), ['App 1.13.0: restart it to update', 'Rayan', 'Not tested yet', 'Not in a room', 'Not shared', 'Borderless']); // 2.0.0 is out here
      await card(app, 'Champion pool').locator('[data-go]').click();
      assert(await app.evaluate(() => !document.querySelector('.view[data-view="stats"]').hidden && document.querySelector('.tab[data-tab="champs"]').getAttribute('aria-selected') === 'true'
        && document.getElementById('h-pool').closest('.panel').classList.contains('flash')), 'Show me: Champion pool, on Stats, Champions');
      await app.click('.nav[data-view="features"]');
      await card(app, 'Auto hover').locator('[data-go]').click();
      assert(await app.evaluate(() => !document.querySelector('.view[data-view="pregame"]').hidden && document.getElementById('preSet').open && document.activeElement.id === 'optHoverPicks'), 'Show me: Auto hover, in Pregame settings');
      await app.click('.nav[data-view="features"]');
      await card(app, 'Tier list').locator('[data-go]').click();
      assert(await app.evaluate(() => !document.querySelector('.view[data-view="pregame"]').hidden && document.querySelector('main').scrollTop === 0), 'Show me: the top of Pregame while the tier list isn’t showing');
      await actx.close();
      console.log('Features: Get set up with what’s done (website and app), the desktop app’s features marked on the website, find a feature, and Show me to a setting, a Stats tab and Pregame settings');
    }

    // ---- Profile in a browser: from Riot, through our server, by Riot ID; the first one given is you
    {
      const [ctx, page] = await context(browser);
      const cors = { 'access-control-allow-origin': '*' }, riotCalls = [];
      const PU = (n) => n.padEnd(78, '0'), ANA = PU('ana-'), BOB = PU('bob-'), KIM = PU('kim-');
      const POSN = ['MIDDLE', 'TOP', 'JUNGLE', 'BOTTOM', 'UTILITY'];
      const match5 = (id, champ, win) => ({ metadata: { matchId: `EUW1_${id}` }, info: { gameId: id, gameCreation: Date.now() - (id % 10) * 3600e3, gameDuration: 1500, gameEndTimestamp: Date.now(), queueId: 420, gameMode: 'CLASSIC',
        participants: Array.from({ length: 10 }, (_, i) => ({ puuid: i ? PU(`p${i}-`) : ANA, riotIdGameName: i ? `P${i}` : 'Ana B', riotIdTagline: 'EUW', championId: i ? CHAMPS[i][1] : champ, teamId: i < 5 ? 100 : 200,
          teamPosition: POSN[i % 5], win: i < 5 ? win : !win, kills: i ? 3 : 8, deaths: 2, assists: 5, totalMinionsKilled: 180, neutralMinionsKilled: 10, visionScore: 22, totalDamageDealtToChampions: 20000,
          largestMultiKill: !i && id === 7000000001 ? 3 : 1, firstBloodKill: !i && id === 7000000001,
          goldEarned: 11000, totalDamageTaken: 15000, damageSelfMitigated: 4000, item0: 6655, item1: 3020, item6: 3340 })) } });
      const old5 = (id, champ, win, days, queueId = 420) => { const m = match5(id, champ, win); Object.assign(m.info, { gameCreation: Date.now() - days * 86400e3, queueId }); return m; }; // a game days ago
      const OLD = Array.from({ length: 19 }, (_, k) => 7000000010 + k); // her older games: 120 to 390 days ago, five of them ARAM
      // Cat: ten games made for Profile's tags, one a day back from yesterday, four of them after midnight
      const CAT = PU('cat-'), dayAt = (k, h) => { const d = new Date(); d.setDate(d.getDate() - k); d.setHours(h, 0, 0, 0); return d.getTime(); };
      const cat5 = (k, champ, win, hour, x = {}) => {
        const m = match5(7100000000 + k, champ, win), len = x.len || 1500;
        Object.assign(m.info, { gameCreation: dayAt(k + 1, hour), gameDuration: len });
        Object.assign(m.info.participants[0], { puuid: CAT, riotIdGameName: 'Cat', kills: 10, deaths: x.deaths ?? 4, assists: 6, visionScore: (2 * len) / 60, totalDamageDealtToChampions: x.dmg || (1000 * len) / 60,
          visionWardsBoughtInGame: 3, turretKills: 2, timeCCingOthers: 10, largestKillingSpree: x.spree || 3, largestMultiKill: x.multi || 2, quadraKills: x.multi === 4 ? 1 : 0, objectivesStolen: x.steal || 0,
          summoner1Id: 7, summoner2Id: 4, enemyMissingPings: 6, basicPings: 10, challenges: { killParticipation: 0.7, soloKills: 2 }, item2: x.mejai ? 3041 : 0 });
        return m;
      };
      const CAT_GAMES = [cat5(0, 222, true, 2), cat5(1, 222, true, 15, { len: 1100 }), cat5(2, 99, false, 1), cat5(3, 222, true, 15, { len: 1100, deaths: 0 }), cat5(4, 222, true, 15, { deaths: 0, multi: 4 }),
        cat5(5, 99, true, 3), cat5(6, 222, false, 15, { len: 2800, dmg: 52000 }), cat5(7, 222, true, 15, { spree: 9, steal: 1, mejai: true }), cat5(8, 99, false, 4, { mejai: true }), cat5(9, 222, true, 15)];
      const RIOT = {
        '/europe/riot/account/v1/accounts/by-riot-id/Ana%20B/EUW': { puuid: ANA, gameName: 'Ana B', tagLine: 'EUW' },
        '/europe/riot/account/v1/accounts/by-riot-id/Bob/EUW': { puuid: BOB, gameName: 'Bob', tagLine: 'EUW' },
        '/europe/riot/account/v1/accounts/by-riot-id/Kim/EUW': { puuid: KIM, gameName: 'Kim', tagLine: 'EUW' },
        [`/europe/riot/account/v1/region/by-game/lol/by-puuid/${ANA}`]: { puuid: ANA, game: 'lol', region: 'euw1' }, // the server each plays League on (Bob's isn't known)
        [`/europe/riot/account/v1/region/by-game/lol/by-puuid/${KIM}`]: { puuid: KIM, game: 'lol', region: 'kr' },
        [`/euw1/lol/summoner/v4/summoners/by-puuid/${ANA}`]: { profileIconId: 29, summonerLevel: 87 },
        [`/euw1/lol/summoner/v4/summoners/by-puuid/${BOB}`]: { profileIconId: 1, summonerLevel: 31 },
        [`/kr/lol/summoner/v4/summoners/by-puuid/${KIM}`]: { profileIconId: 7, summonerLevel: 120 },
        [`/euw1/lol/league/v4/entries/by-puuid/${ANA}`]: [{ queueType: 'RANKED_SOLO_5x5', tier: 'EMERALD', rank: 'III', leaguePoints: 12, wins: 40, losses: 35, hotStreak: true, veteran: true }, { queueType: 'CHERRY', tier: 'GOLD' }],
        [`/euw1/lol/league/v4/entries/by-puuid/${BOB}`]: [],
        [`/euw1/lol/champion-mastery/v4/champion-masteries/by-puuid/${ANA}/top?count=5`]: [{ championId: 103, championLevel: 12, championPoints: 251000 }, { championId: 99, championLevel: 40, championPoints: 1200000 }],
        [`/euw1/lol/champion-mastery/v4/champion-masteries/by-puuid/${BOB}/top?count=5`]: [],
        [`/euw1/lol/spectator/v5/active-games/by-summoner/${ANA}`]: { gameQueueConfigId: 420, gameStartTime: Date.now() - 5.5 * 60000, participants: [{ puuid: ANA, riotId: 'Ana B#EUW', championId: 103, teamId: 100 },
          { puuid: BOB, riotId: 'Bob#EUW', championId: 86, teamId: 200 }, { puuid: null, riotId: null, championId: 99, teamId: 100 }] }, // the last one in streamer mode
        [`/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?count=10`]: ['EUW1_7000000001', 'EUW1_7000000002', 'EUW1_7000000003', '../oops'],
        [`/europe/lol/match/v5/matches/by-puuid/${BOB}/ids?count=10`]: [],
        '/europe/lol/match/v5/matches/EUW1_7000000001': match5(7000000001, 103, true),
        '/europe/lol/match/v5/matches/EUW1_7000000002': match5(7000000002, 103, false),
        '/europe/lol/match/v5/matches/EUW1_7000000003': match5(7000000003, 99, true),
        [`/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?start=3&count=20`]: ['EUW1_7000000003', ...OLD.map((x) => `EUW1_${x}`)], // older: one already listed, then 19
        ...Object.fromEntries(OLD.map((x, k) => [`/europe/lol/match/v5/matches/EUW1_${x}`, old5(x, k % 2 ? 99 : 86, k % 3 === 0, 120 + 15 * k, k % 4 === 1 ? 450 : 420)])),
        [`/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?start=0&count=20&queue=420`]: ['EUW1_7000000001', 'EUW1_7000000002', 'EUW1_7000000003', 'EUW1_7000000050'], // Solo/Duo: one more
        '/europe/lol/match/v5/matches/EUW1_7000000050': old5(7000000050, 103, true, 30),
        '/europe/riot/account/v1/accounts/by-riot-id/Cat/EUW': { puuid: CAT, gameName: 'Cat', tagLine: 'EUW' },
        [`/euw1/lol/summoner/v4/summoners/by-puuid/${CAT}`]: { profileIconId: 1, summonerLevel: 612 },
        [`/euw1/lol/league/v4/entries/by-puuid/${CAT}`]: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'I', leaguePoints: 92, wins: 40, losses: 20, inactive: true }],
        [`/euw1/lol/champion-mastery/v4/champion-masteries/by-puuid/${CAT}/top?count=5`]: [],
        [`/europe/lol/match/v5/matches/by-puuid/${CAT}/ids?count=10`]: CAT_GAMES.map((m) => m.metadata.matchId),
        ...Object.fromEntries(CAT_GAMES.map((m) => [`/europe/lol/match/v5/matches/${m.metadata.matchId}`, m])),
      };
      const riotAt = []; // when each lookup got through: our server lets 15 a second through
      // the ranks our server kept for Ana: this season's highest (Diamond IV, higher than now), last season's
      // Solo/Duo and Flex the season before
      const Y = new Date().getFullYear(), at = Math.round(Date.now() / 1000);
      const ANA_PAST = { s: { [Y]: { RANKED_SOLO_5x5: { peak: ['DIAMOND', 'IV', 10], last: ['EMERALD', 'III', 12], at } }, [Y - 1]: { RANKED_SOLO_5x5: { peak: ['DIAMOND', 'I', 20], last: ['DIAMOND', 'III', 50], at: at - 300 * 86400 } },
        [Y - 2]: { RANKED_FLEX_SR: { peak: ['GOLD', 'I', 0], last: ['GOLD', 'I', 0], at: at - 650 * 86400 } } } };
      await ctx.route(/127\.0\.0\.1:9001\/riot\//, (r) => {
        const u = r.request().url().replace(/^.*?\/riot/, '');
        if (u === '/summary') return r.fulfill({ json: { p: '16.20', c: {}, old: null, today: 5, total: 50, at: Date.now() }, headers: cors });
        if (u.startsWith('/past?')) return r.fulfill({ json: u.endsWith(ANA) ? ANA_PAST : { s: {} }, headers: cors });
        if (u.startsWith('/champ?')) return r.fulfill({ json: { patch: '16.20', games: [] }, headers: cors }); // no high elo games, for the reports' High elo column
        if (u.startsWith('/places?')) return r.fulfill({ json: {}, headers: cors }); // no ladder counts yet, so no ladder place
        const p = u.replace(/^\/api/, '');
        riotCalls.push(p);
        if (p.includes('/Busy/') || riotAt.filter((t) => Date.now() - t < 1000).length >= 15) return r.fulfill({ status: 429, body: 'Too many lookups for now', headers: cors });
        riotAt.push(Date.now());
        return p in RIOT ? r.fulfill({ json: RIOT[p], headers: cors }) : r.fulfill({ status: 404, json: { status: { status_code: 404 } }, headers: cors });
      });
      await page.goto(URL_);
      await page.click('#leagueNav'); await page.click('.nav[data-view="profile"]');
      await wait(page, () => window.lpc && lpc.riotOn() && !document.getElementById('proFindBox').hidden, null, 'the Riot ID form');
      assert.match(await text(page, '#proNote'), /^Type your Riot ID above/);
      assert.strictEqual(await page.getAttribute('#proId', 'placeholder'), 'Your Riot ID: Name#TAG');
      assert.strictEqual(await text(page, '#proGo'), 'Show my profile');
      await page.fill('#proId', 'Nobody#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proFindNote').textContent === 'No League player is called Nobody#EUW.', null, 'nobody by that name');
      await page.fill('#proId', 'Busy#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proFindNote').textContent === 'Too many lookups right now. Try again in a minute.', null, 'our server busy');
      await page.fill('#proId', 'Ana B#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Ana B' && document.querySelectorAll('#proGames > li').length === 3 && /Ahri/.test(document.getElementById('proStatus').textContent), null, 'Ana’s profile from Riot');
      assert.strictEqual(await text(page, '#proTag'), '#EUW');
      assert.strictEqual(await text(page, '#proSub'), 'EUW · Level 87');
      assert.match(await page.getAttribute('#proIcon', 'src'), /\/cdn\/1\.1\/img\/profileicon\/29\.png$/);
      assert.match(await text(page, '#proStatus'), /^In game as Ahri · Ranked Solo\/Duo · [56] min$/);
      await wait(page, () => !document.getElementById('proPast').hidden, null, 'Ana’s past ranks');
      const rk = await page.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.ph, .rtier, .hint:not(.ladder):not(.mmr)')].map((x) => x.textContent).join('|')));
      assert.deepStrictEqual(rk, ['Solo/Duo|Emerald III|12 LP · 40W 35L · 53%|Peak this season: Diamond IV', 'Flex|Unranked|']);
      // past ranks our server kept, with their emblems; tags; her roles; and her triple kill and first blood
      assert.deepStrictEqual(await page.$$eval('#proPast .tag', (l) => l.map((e) => e.textContent)), [`S${Y - 1} Diamond III · peak Diamond I`, `S${Y - 2} Flex Gold I`]);
      assert.deepStrictEqual(await embs(page, '#proPast img'), ['TFT_Regalia_Diamond.png', 'TFT_Regalia_Gold.png']);
      assert.match(await page.getAttribute('#proPast .tag', 'title'), /^Season \d{4}, Solo\/Duo: Diamond III when our server last saw it \(.+\), highest it saw Diamond I\. From Riot, kept by our server\.$/);
      assert.deepStrictEqual(await page.$$eval('#proTags .tag', (l) => l.map((e) => [e.dataset.k, e.textContent])), [['good', 'Hot streak in Solo/Duo'], ['', 'Veteran of Emerald III'], ['fun', 'Millionaire: Lux']]);
      assert.deepStrictEqual(await page.$$eval('#proRoles tr', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ').trim())), ['Middle 3 2W 1L · 67%']);
      assert.strictEqual(await text(page, '#proRolesNote'), 'Last 3 games');
      assert.deepStrictEqual(await page.$$eval('#proGames > li', (l) => l.map((e) => [...e.querySelectorAll('summary .tag')].map((t) => t.textContent).join(', '))), ['Triple kill, First blood', '', '']);
      assert.deepStrictEqual(await embs(page, '#proRanks img.crest'), ['TFT_Regalia_Emerald.png'], 'Riot’s emblem for her rank');
      assert.strictEqual(await page.textContent('#h-proform'), 'Last 3 games');
      assert.match(await page.textContent('#proForm'), /^Record\s*2W 1L · 67%\s*KDA\s*8\.0 \/ 2\.0 \/ 5\.0 · 6\.5\s*CS a minute\s*7\.6\s*Main role\s*Middle, 3 of 3$/);
      assert.strictEqual(await page.$$eval('#proGames > li:first-child .gitems img', (l) => l.length), 2, 'items, not the trinket');
      assert.match(await text(page, '#proMastery'), /Ahri\s*Level 12 · 251k points/);
      assert(await page.locator('#proMastery .champ').first().isDisabled(), 'champion pages need League’s client');
      assert.strictEqual(await page.getAttribute('#proId', 'placeholder'), 'Look up a player: Name#TAG');
      // a game's report, from Riot's copy of the game
      await page.click('#proGames > li:first-child summary');
      await wait(page, () => document.querySelectorAll('#proGames > li:first-child .report > .tablewrap tbody tr').length === 10, null, 'the report from Riot');
      assert(await page.locator('#proGames > li:first-child .report tr[data-me]').count() === 1, 'Ana marked in it');
      assert(!riotCalls.some((c) => c.includes('oops')), 'only real match ids asked for');
      assert.strictEqual(riotCalls.length, 15, `Nobody, Busy (asked again after a second), Ana in 10 calls (her server from Riot), Bob's rank in her game and her game for the report, nothing twice: ${riotCalls.join(' ')}`);
      // her game right now: her team first, everyone's rank, the name hidden for streamer mode
      const liveRows = () => page.$$eval('#proLiveRows tr', (trs) => trs.map((tr) => [tr.dataset.team, tr.hasAttribute('data-me'), tr.innerText.replace(/\s+/g, ' ').trim()]));
      await wait(page, () => /Unranked/.test(document.getElementById('proLiveRows').textContent), null, 'Bob’s rank in her game');
      assert.deepStrictEqual(await liveRows(), [['ally', true, 'Ana B#EUW Ahri Emerald III · 12 LP · 53% of 75'], ['ally', false, 'Name hidden (streamer mode) Lux'], ['enemy', false, 'Bob#EUW Garen Unranked']]);
      // older games, from Riot: the next page, without the game already listed, 10 lookups a second at most; the open
      // report stays open
      await page.click('#proMore');
      await wait(page, () => document.querySelectorAll('#proGames > li').length === 22, null, '19 older games');
      const when = await page.$$eval('#proGames .gwhen', (l) => l.map((e) => e.textContent));
      assert(when[21].includes(String(new Date(Date.now() - 390 * 86400e3).getFullYear())) && !/\d{4}/.test(when[0]), `the year on a game from another year: ${when}`);
      assert(await page.$eval('#proGames > li:first-child details', (d) => d.open), 'the report still open');
      await page.click('#proMore');
      await wait(page, () => document.getElementById('proMoreNote').textContent === 'No older games.' && document.getElementById('proMore').hidden, null, 'no older games');
      assert.strictEqual(riotCalls.length, 36, `a page of 20 with 19 new games, then an empty page: ${riotCalls.slice(15).join(' ')}`);
      // the queues: Solo/Duo loads its own games (one more), ARAM has five and Riot no more, TFT needs League's client
      await page.click('#proQueues [data-q="solo"]');
      await wait(page, () => document.getElementById('h-proform').textContent === 'Last 18 Solo/Duo games' && document.querySelectorAll('#proGames > li').length === 18, null, 'her Solo/Duo games');
      assert.strictEqual(riotCalls.slice(36).join(' '), `/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?start=0&count=20&queue=420 /europe/lol/match/v5/matches/EUW1_7000000050`);
      await page.click('#proQueues [data-q="aram"]');
      await wait(page, () => document.getElementById('h-proform').textContent === 'Last 5 ARAM games' && document.getElementById('proMoreNote').textContent === 'No older games.', null, 'her ARAM games');
      assert.match(await page.textContent('#proForm'), /^Record\s*1W 4L · 20%/);
      assert.strictEqual(riotCalls.length, 39, 'Riot asked for her ARAM games once');
      await page.click('#proQueues [data-q="tft"]');
      assert.strictEqual(await text(page, '#proGames'), 'TFT games come from League’s client: open Profile in Premade’s desktop app while League is running.');
      assert(await page.locator('#proRanks').isHidden(), 'no TFT ranks from Riot');
      await page.click('#proQueues [data-q="all"]');
      await wait(page, () => document.getElementById('h-proform').textContent === 'Last 20 games' && document.querySelectorAll('#proGames > li').length === 20 && !document.getElementById('proMore').hidden, null, 'all her games');
      // someone else from her game: Bob, not in a game and unranked
      await page.click('#proLiveRows .plink');
      await wait(page, () => document.getElementById('proName').textContent === 'Bob' && !document.getElementById('proBack').hidden, null, 'Bob’s profile');
      assert.strictEqual(await text(page, '#proStatus'), 'Not in a game right now');
      assert.strictEqual(await text(page, '#proGames'), 'No recent games.');
      assert(await page.locator('#proMoreBar').isHidden(), 'no Show more games');
      assert(await page.locator('#proMasteryBox').isHidden(), 'no mastery to show');
      assert(await page.locator('#proPast').isHidden() && await page.locator('#proTagsBox').isHidden() && await page.locator('#proRolesBox').isHidden(), 'no past ranks, tags or roles');
      await page.click('#proBack');
      await wait(page, () => document.getElementById('proName').textContent === 'Ana B', null, 'back to Ana');
      // anyone by Riot ID alone: Riot says which server they play on (Kim on KR, whatever her tag says); until our
      // server passes that call, their tag says (Bob#EUW)
      await page.fill('#proId', 'Kim#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Kim', null, 'Kim’s profile');
      assert.strictEqual(await text(page, '#proSub'), 'KR · Level 120');
      await page.fill('#proId', 'Bob#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Bob', null, 'Bob by his tag');
      assert.strictEqual(await text(page, '#proSub'), 'EUW · Level 31');
      await page.click('#proBack');
      await wait(page, () => document.getElementById('proName').textContent === 'Ana B', null, 'back to Ana again');
      // the next visit: Ana as she was, then fresh from Riot; and Not you? forgets her
      assert(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('lpc-profile')); return p.n === 'Ana B#EUW' && p.plat === 'euw1' && !('live' in p); }), 'Ana kept, without whether she’s in a game');
      const before = riotCalls.length;
      await page.reload();
      await page.click('#leagueNav'); await page.click('.nav[data-view="profile"]');
      await wait(page, () => window.lpc && document.getElementById('proName').textContent === 'Ana B', null, 'Ana kept');

      await until(() => riotCalls.length === before + 10, 'Ana updated from Riot, with Bob’s rank in her game');
      await wait(page, () => /^In game as Ahri/.test(document.getElementById('proStatus').textContent), null, 'and in a game');
      assert.match(await text(page, '#proNote'), /^As of /);
      await page.click('#proForget');
      await wait(page, () => document.getElementById('proName').textContent === 'Your League profile' && document.getElementById('proGo').textContent === 'Show my profile', null, 'forgotten');
      // Cat's tags: green and red ones good to know, gold ones for fun (some only from Riot's match data: kill
      // participation, solo kills, steals and pings)
      await page.fill('#proId', 'Cat#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Cat' && document.querySelectorAll('#proGames > li').length === 10 && !document.getElementById('proTagsBox').hidden, null, 'Cat’s profile');
      assert.deepStrictEqual(await page.$$eval('#proTags .tag', (l) => l.map((e) => [e.dataset.k, e.textContent])), [['good', 'Best on Jinx: 6 of 7 won'], ['good', 'Kill hungry: 10.0 kills a game'],
        ['good', 'Lights up the map: 2.0 vision a minute'], ['good', 'Buys control wards: 3.0 a game'], ['good', 'Team player: 70% kill participation'], ['good', 'Duelist: 2.0 solo kills a game'],
        ['good', 'Big damage: 1011 a minute'], ['good', 'Tower taker: 2.0 towers a game'], ['good', 'Untouchable: 2 wins without dying'], ['good', 'Climbing: 67% won in Solo/Duo'],
        ['', 'One-trick: Jinx'], ['', 'Inactive in Solo/Duo'], ['fun', 'Speedrunner: 2 wins under 20 minutes'], ['fun', 'Big hitter: 52,000 damage in one game'], ['fun', 'Marathon: a 47-minute game'],
        ['fun', 'So close: a quadra kill on Jinx'], ['fun', 'Legendary: 9 kills without dying on Jinx'], ['fun', 'Objective thief: 1 steal'], ['fun', 'Mejai’s gambler: 2 games'], ['fun', 'Flash on F'],
        ['fun', 'Loves the ? ping: 6.0 a game'], ['fun', 'Night owl: 4 of 10 games after midnight'], ['fun', 'Dedicated: level 612']]);
      await ctx.close();
      console.log(`Profile in a browser: Ana B by Riot ID (in game with her game's ranks, Emerald III, 3 games and a report, 19 older ones, Solo/Duo and ARAM tabs), Bob opened from her game, Kim on KR and Bob by Riot ID alone, kept and refreshed; ${riotCalls.length} calls to Riot`);
    }

    const [ctx, pc] = await context(browser, { version: '1.11.0' });
    await ctx.exposeFunction('fakeLcu', fakeLcu);
    const highAsked = []; // our server's Riot data: the high elo games it counted, 50 this patch (each champion's games
    // and wins in each role), and each champion's games
    const SUM = { 103: { MIDDLE: [40, 22], TOP: [3, 1] }, 99: { MIDDLE: [12, 7], UTILITY: [20, 10] }, 238: { MIDDLE: [30, 16] }, 254: { MIDDLE: [18, 13], JUNGLE: [40, 21] },
      86: { TOP: [30, 17] }, 122: { TOP: [20, 9] }, 64: { TOP: [47, 23] } };
    const riotAsked = [], pastAsked = []; // Riot through our server: your account and Sniper's, with Riot's kind of puuid, Sniper in a game, and Riot's copies of four of your games
    const asked = () => riotAsked.filter((k) => !/\/matches\/EUW1_\d+$|\/status\/v4\/platform-data$/.test(k)); // without the copies and Riot's server notices (asked whenever your server is known)
    const MY_RIOT = 'riot-me-'.padEnd(78, '0'), SNIPER = 'riot-sniper-'.padEnd(78, '0'), FOE = 'riot-foe-'.padEnd(78, '0');
    const RIOT = {
      '/europe/riot/account/v1/accounts/by-riot-id/Rayan/EUW': { puuid: MY_RIOT, gameName: 'Rayan', tagLine: 'EUW' },
      '/europe/riot/account/v1/accounts/by-riot-id/Sniper/EUW': { puuid: SNIPER, gameName: 'Sniper', tagLine: 'EUW' },
      [`/euw1/lol/spectator/v5/active-games/by-summoner/${SNIPER}`]: { gameQueueConfigId: 420, gameStartTime: Date.now() - 5.5 * 60000, participants: [{ puuid: SNIPER, riotId: 'Sniper#EUW', championId: 51, teamId: 200 },
        { puuid: FOE, riotId: 'Foe#EUW', championId: 86, teamId: 100 }] },
      [`/euw1/lol/league/v4/entries/by-puuid/${FOE}`]: [{ queueType: 'RANKED_SOLO_5x5', tier: 'SILVER', rank: 'I', leaguePoints: 50, wins: 10, losses: 10 }],
      ...Object.fromEntries([GAME, 9001, 9002, 9003].map((id) => [`/europe/lol/match/v5/matches/EUW1_${id}`, copy5(id)])),
    };
    await ctx.route(/127\.0\.0\.1:9001\/riot\/(summary|champ|api|past)/, (r) => {
      const u = new URL(r.request().url()), cors = { 'access-control-allow-origin': '*' }, k = u.pathname.slice(9) + u.search;
      if (u.pathname.startsWith('/riot/api/')) return riotAsked.push(k), k in RIOT ? r.fulfill({ json: RIOT[k], headers: cors }) : r.fulfill({ status: 404, json: { status: { status_code: 404 } }, headers: cors });
      if (u.pathname.endsWith('/past')) return pastAsked.push(u.searchParams.get('u')), r.fulfill({ json: { s: {} }, headers: cors });
      if (u.pathname.endsWith('/summary')) return r.fulfill({ json: { p: '15.20', c: SUM, old: null, today: 12, total: 3456, at: 0 }, headers: cors });
      const c = +u.searchParams.get('c'), role = u.searchParams.get('r') || 'MIDDLE';
      highAsked.push(`${c}/${u.searchParams.get('r')}`);
      r.fulfill({ json: c === 103 ? highElo(role) : c === 238 && role === 'MIDDLE' ? zedMid() : c === 86 && role === 'TOP' ? garenTop() : { patch: '15.20', role, roles: {}, games: [] }, headers: cors });
    });
    await ctx.addInitScript(() => { // four games in voice last week: the two where the room talked a lot were won
      if (localStorage.getItem('lpc-games')) return;
      const g = (n, talk, result) => ({ at: Date.now() - (8 + n) * 86400e3, ms: 1800000, room: 'abcd', mode: 'CLASSIC', result, id: 0, me: { name: 'Rayan', champ: 'Ahri', talk }, players: [{ name: 'Fren', champ: 'Garen', talk }],
        map: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
      localStorage.setItem('lpc-games', JSON.stringify([g(0, 400, 'Win'), g(1, 20, 'Lose'), g(2, 350, 'Win'), g(3, 30, 'Lose')]));
    });
    await ctx.exposeFunction('nodeClip', (b64, like) => {
      const name = like ? like.replace(/\.webm$/, ' cut.webm') : `Clip ${savedClips.length + 1}.webm`;
      fs.writeFileSync(path.join(clips, name), Buffer.from(b64, 'base64'));
      savedClips.push(name);
      return name;
    });
    const league = (d) => pc.evaluate((d) => lpcClient.emit('league', d), d);
    const preSettings = async () => { await pc.click('#leagueNav'); await pc.click('.nav[data-view="pregame"]'); if (!(await pc.$eval('#preSet', (d) => d.open))) await pc.click('#preSet summary'); }; // Pregame settings, opened
    await pc.goto(URL_);
    await wait(pc, () => window.lpc, null, 'the page');
    lcu.phase = 'None';
    await league({ inGame: false, phase: 'None' });
    await wait(pc, () => lpc.lcu().me0 && lpc.lcu().hist === 20, null, 'your account and match history');
    // your games in detail, read now instead of one every 1.5 s: all ten players, and from the timelines your buys,
    // skill order and laning (game 9001 has no lanes, so they're guessed from where everyone was)
    assert.strictEqual(await pc.evaluate(() => lpc.crawlAll()), 20);
    const deep = await pc.evaluate(() => lpc.deep());
    assert(Object.values(deep).every((g) => g.ps.length === 10 && g.ps[g.me].u === ME && g.tl && g.tl.buys.length && g.tl.skills.length === 18), 'every game in detail, with its timeline');
    assert.deepStrictEqual(deep[9001].ps.map((p) => p.l), ['MIDDLE', 'TOP', 'JUNGLE', 'BOTTOM', 'UTILITY', 'TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'], 'lanes from the timeline');
    assert.deepStrictEqual(deep[9001].tl.lane, [[10, [80, 4000, 5000], [70, 3500, 5200]], [15, [120, 6000, 7500], [105, 5250, 7800]]]);
    console.log('your games in detail: 20 games with their timelines, one game’s lanes guessed right');
    // ---- Profile, under League: you in League like a stats site's profile, from League's client
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => !document.querySelector('.view[data-view="profile"]').hidden && document.getElementById('proName').textContent === 'Rayan' && /Gold II/.test(document.getElementById('proRanks').textContent), null, 'your profile');
    assert.strictEqual(await text(pc, '#proTag'), '#EUW');
    assert.strictEqual(await text(pc, '#proSub'), 'EUW · Level 300');
    assert.strictEqual(await text(pc, '#proLvl'), '300');
    assert.match(await pc.getAttribute('#proIcon', 'src'), /\/cdn\/1\.1\/img\/profileicon\/4568\.png$/);
    assert.strictEqual(await text(pc, '#proStatus'), 'In the client');
    // who has Premade: once when it opened, and once with your League account, from this device with the app's version
    for (let i = 0; i < 50 && !ctx.hellos.some((h) => h.riot.length); i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepStrictEqual(ctx.hellos.map(({ id, ...h }) => h), [{ v: '1.11.0', name: 'Rayan', riot: [] }, { v: '1.11.0', name: 'Rayan', riot: ['Rayan#EUW'] }], 'a hello when it opens and one with your account, not one each time your profile redraws');
    assert(ctx.hellos.every((h) => h.id === ctx.hellos[0].id) && ctx.hellos[0].id === await pc.evaluate(() => localStorage.getItem('lpc-device')), 'with this device\'s own id');
    // (without the ladder place and hidden MMR lines, which ranks.e2e.js checks)
    const proRanks = () => pc.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.ph, .rtier, .hint:not(.ladder):not(.mmr)')].map((x) => x.textContent).join('|')));
    assert.deepStrictEqual(await proRanks(), ['Solo/Duo|Gold II|45 LP · 31W 25L · 55%|Peak this season: Gold I', 'Flex|Unranked|']);
    // last season from League's client; tags from your games; your roles; the pentakill in your fourth game
    assert.deepStrictEqual(await pc.$$eval('#proPast .tag', (l) => l.map((e) => e.textContent)), [`S${new Date().getFullYear() - 1} Platinum IV · peak Platinum II`]);
    assert.match(await pc.getAttribute('#proPast .tag', 'title'), /^Season \d{4}, Solo\/Duo: ended at Platinum IV, highest Platinum II\. From League’s client\.$/);
    const steady = (l) => l.filter((t) => !/^(Night owl|Early bird|Weekend warrior|Grinder):/.test(t)); // the clock's tags depend on when this runs
    assert.deepStrictEqual(steady(await pc.$$eval('#proTags .tag', (l) => l.map((e) => e.textContent))), ['6 wins in a row', 'Best on Ahri: 6 of 8 won', 'Hard to kill: 3.0 deaths a game',
      'Struggles on Garen: 1 of 4 won', 'Ahri lover: 8 of 20 games', 'Pentakill on Ahri']);
    assert.deepStrictEqual(await pc.$$eval('#proRoles tr', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ').trim())), ['Middle 13 9W 4L · 69%', 'Top 4 1W 3L · 25%', 'Support 3 3W 0L · 100%']);
    assert.deepStrictEqual(await pc.$$eval('#proGames > li:nth-child(-n+4) summary', (l) => l.map((e) => [...e.querySelectorAll('.tag')].map((t) => t.textContent).join())), ['', '', '', 'Pentakill']);
    assert.strictEqual(await pc.textContent('#h-proform'), 'Last 20 games');
    assert.match(await pc.textContent('#proForm'), /^Record\s*13W 7L · 65%\s*KDA\s*5\.0 \/ 3\.0 \/ 7\.0 · 4\.0\s*CS a minute\s*5\.7\s*Main role\s*Middle, 13 of 20$/);
    assert.deepStrictEqual(await pc.$$eval('#proChamps .champ', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' '))), ['Ahri 8 games · 75% won · 4.0 KDA', 'Lux 5 games · 60% won · 4.0 KDA', 'Garen 4 games · 25% won · 4.0 KDA']);
    assert.deepStrictEqual(await pc.$$eval('#proMastery .sub', (l) => l.map((e) => e.textContent)), ['Level 7 · 120k points', 'Level 6 · 50k points', 'Level 5 · 40k points', 'Level 4 · 20k points']);
    assert.strictEqual(await pc.locator('#proGames > li').count(), 20);
    assert.strictEqual(await pc.$$eval('#proGames > li:first-child .gitems img', (l) => l.length), 4);
    await pc.click('#proGames > li:first-child summary');
    await wait(pc, () => document.querySelectorAll('#proGames > li:first-child .report > .tablewrap:not(.extra) tbody tr').length === 10, null, 'a game’s report on your profile');
    // Riot's extra numbers for all ten, from Riot's copy of the game, and how each game ranks among high elo games on
    // that champion in that role (only Ahri's are counted with their length here: you're at 75 of 100)
    await wait(pc, () => document.querySelectorAll('#proGames > li:first-child .report .extra tbody tr').length === 10, null, 'Riot’s extra numbers in the report');
    assert.deepStrictEqual(await pc.$$eval('#proGames > li:first-child .report .extra tr', (trs) => [0, 1, 8].map((i) => [...trs[i].children].map((c) => c.textContent).join(' | '))), [
      'More from Riot | Skillshots hit | Skillshots dodged | Allies saved | Turret plates | Time dead | Vision vs laner', 'Rayan | 60 | 20 | 2 | 3 | 1:00 | +0 (20 vs 20)', 'Shadow | 40 | 25 | 0 | 1 | 2:30 | +0 (20 vs 20)']);
    await wait(pc, () => document.querySelectorAll('#proGames > li:first-child .report th[title^="How this game ranks"]').length === 2, null, 'the High elo column');
    assert.deepStrictEqual(await pc.$$eval('#proGames > li:first-child .report > .tablewrap:not(.extra) tbody td:last-child', (l) => l.map((e) => e.textContent)), ['75', ...Array(9).fill('—')]);
    assert(await pc.locator('#profileBtn').isVisible() && await pc.locator('#proBack').isHidden() && await pc.locator('#proNote').isHidden(), 'Share, and nothing about it being old');
    const kept = await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-profile')));
    assert(kept.n === 'Rayan#EUW' && kept.plat === 'euw1' && kept.games.length === 20 && kept.icon === 4568 && kept.rk.RANKED_SOLO_5x5.tier === 'GOLD', 'kept for when League is closed');
    // someone on your server, through League's client
    await pc.fill('#proId', 'Sniper#EUW');
    await pc.click('#proGo');
    await wait(pc, () => document.getElementById('proName').textContent === 'Sniper' && document.querySelectorAll('#proGames > li').length === 20, null, 'Sniper’s profile');
    assert.strictEqual(await text(pc, '#proSub'), 'EUW · Level 30');
    // older games: from League's client while it has them, then Riot
    await pc.click('#proMore');
    await wait(pc, () => document.querySelectorAll('#proGames > li').length === 30, null, 'Sniper’s older games');
    await pc.click('#proMore');
    await wait(pc, () => document.getElementById('proMoreNote').textContent === 'No older games.' && document.getElementById('proMore').hidden, null, 'no older games');
    assert.deepStrictEqual([callsTo(/\/enemy4\/matches\?begIndex=20&endIndex=39$/).length, callsTo(/\/enemy4\/matches\?begIndex=30&endIndex=49$/).length], [1, 1]);
    assert.deepStrictEqual(riotAsked.filter((k) => !asked().includes(k) && !/\/status\/v4\//.test(k)), [`/europe/lol/match/v5/matches/EUW1_${GAME}`], 'Riot’s copy of the game in the report');
    assert.deepStrictEqual(asked(), ['/europe/riot/account/v1/accounts/by-riot-id/Rayan/EUW', `/euw1/lol/league/v4/entries/by-puuid/${MY_RIOT}`, '/europe/riot/account/v1/accounts/by-riot-id/Sniper/EUW',
      `/euw1/lol/spectator/v5/active-games/by-summoner/${SNIPER}`, `/euw1/lol/league/v4/entries/by-puuid/${FOE}`, `/europe/lol/match/v5/matches/by-puuid/${SNIPER}/ids?start=30&count=20`],
      'your puuid in Riot’s API (League’s client has its own kind) and your rank once, for our server to keep; Sniper’s puuid, game, his opponent’s rank and his older games');
    assert(pastAsked.includes(MY_RIOT) && !pastAsked.includes(ME), `our server’s record of your ranks asked for by Riot’s puuid: ${pastAsked}`);
    assert(/One-trick: Caitlyn/.test(await text(pc, '#proTags')), 'Sniper’s tags');
    // his game, from Riot (League's client doesn't say): him marked with his rank from League's client, his
    // opponent's from Riot, as League's client doesn't know Riot's puuids
    assert.match(await text(pc, '#proStatus'), /^In game as Caitlyn · Ranked Solo\/Duo · \d+ min$/);
    await wait(pc, () => /Silver I/.test(document.getElementById('proLiveRows').textContent), null, 'his opponent’s rank');
    assert.deepStrictEqual(await pc.$$eval('#proLiveRows tr', (trs) => trs.map((tr) => [tr.dataset.team, tr.hasAttribute('data-me'), !!tr.querySelector('.plink'), tr.innerText.replace(/\s+/g, ' ').trim()])),
      [['ally', true, false, 'Sniper#EUW Caitlyn Gold II · 45 LP · 55% of 55'], ['enemy', false, true, 'Foe#EUW Garen Silver I · 50 LP · 50% of 20']]);
    assert(!callsTo(/\/lol-ranked\/v1\/ranked-stats\/riot-/).length && await pc.locator('#profileBtn').isHidden(), 'no ranks asked of League’s client with Riot’s puuids, and no Share');
    await pc.click('#proBack');
    await wait(pc, () => document.getElementById('proName').textContent === 'Rayan', null, 'back to you');
    // your queues: Solo/Duo has all 20; Flex none here, in League's client (nothing older) or from Riot
    await pc.click('#proQueues [data-q="solo"]');
    await wait(pc, () => document.getElementById('h-proform').textContent === 'Last 20 Solo/Duo games', null, 'your Solo/Duo games');
    await pc.click('#proQueues [data-q="flex"]');
    await wait(pc, () => document.getElementById('h-proform').textContent === 'Recent Flex games' && document.getElementById('proGames').textContent === 'No recent Flex games.' && document.getElementById('proMoreBar').hidden, null, 'no Flex games');
    assert.deepStrictEqual(asked().slice(6), [`/europe/lol/match/v5/matches/by-puuid/${MY_RIOT}/ids?start=0&count=20&queue=440`]);
    // TFT from League's client: your ranks and games, with the place, traits, units, items and augments
    await pc.click('#proQueues [data-q="tft"]');
    await wait(pc, () => document.getElementById('h-proform').textContent === 'Last 5 TFT games' && document.querySelectorAll('#proGames > li').length === 5, null, 'your TFT games');
    assert.deepStrictEqual(await proRanks(), ['TFT|Platinum I|77 LP · 60 games', 'Double Up|Unranked|', 'Hyper Roll|Purple|3200 rating']);
    assert.match(await pc.textContent('#proForm'), /^Average place\s*4\.4\s*Top 4\s*3 of 5 · 60%\s*Firsts\s*1\s*Main trait\s*Sniper, 5 of 5$/);
    assert.deepStrictEqual(await pc.$$eval('#proGames .place', (l) => l.map((e) => e.textContent + (e.dataset.r ? ' ' + e.dataset.r : ''))), ['1st first', '3rd top', '6th', '4th top', '8th']);
    assert.strictEqual(await pc.textContent('#proGames > li:first-child .gwhat'), 'Ranked TFT · Level 8 · 32 min · 4 Sniper · 3 Rebel');
    await pc.click('#proGames > li:first-child summary');
    const said = (l) => l.map((e) => { const t = (n) => n.nodeType === 3 ? n.textContent : ' ' + [...n.childNodes].map(t).join('') + ' '; return t(e).replace(/\s+/g, ' ').trim(); }); // not innerText: it's empty while the list redraws
    await pc.waitForFunction((want) => [...document.querySelectorAll('#proGames > li:first-child .talk li')].map((e) => { const t = (n) => n.nodeType === 3 ? n.textContent : ' ' + [...n.childNodes].map(t).join('') + ' '; return t(e).replace(/\s+/g, ' ').trim(); }).join('|') === want, 'Traits 4 Sniper, 3 Rebel|Augments Cybernetic Bulk, Ascension|Jinx ★★ Infinity Edge, Guinsoos Rageblade|Vi ★ no items', { timeout: 10000 }).catch(() => {});
    assert.deepStrictEqual(await pc.$$eval('#proGames > li:first-child .talk li', said),
      ['Traits 4 Sniper, 3 Rebel', 'Augments Cybernetic Bulk, Ascension', 'Jinx ★★ Infinity Edge, Guinsoos Rageblade', 'Vi ★ no items']);
    await pc.click('#proMore');
    await wait(pc, () => document.getElementById('proMoreNote').textContent === 'No older games.' && document.getElementById('proMore').hidden, null, 'no older TFT games');
    assert.deepStrictEqual(callsTo(/\/products\/tft\//).map(([, p]) => p.split('?')[1]), ['begin=0&count=20', 'begin=5&count=20']);
    await pc.click('#proQueues [data-q="all"]');
    await wait(pc, () => document.getElementById('h-proform').textContent === 'Last 20 games' && /Gold II/.test(document.getElementById('proRanks').textContent), null, 'all your games again');
    console.log('Profile: Rayan#EUW, level 300, Gold II, in the client, 13W 7L in 20 games, Ahri first; a report; Sniper looked up with 10 older games; Solo/Duo, Flex and TFT tabs (Platinum I, 5 games)');
    assert.deepStrictEqual(await pc.$$eval('.nav', (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim())), ['Rooms', 'Friends', 'Remote help', 'Recording', 'Aion 2', 'RE4 co-op', 'Settings', 'Features', 'League', 'Proximity voice', 'Profile', 'Pregame', 'Game', 'Overlay', 'Stats', 'TFT', 'Clips'], 'the menu, and League’s tabs on Profile, in the app');
    // RE4 co-op: the helper's checks drawn as rows, and Play's answer
    await pc.click('.nav[data-view="re4"]');
    await wait(pc, () => document.getElementById('re4Role').textContent === 'Host · tunnel 10.66.0.1' && document.querySelectorAll('#re4Conn .re4row .dot[data-h="good"]').length === 1
      && document.querySelector('#re4Priv .dot').dataset.h === 'ok' && document.querySelector('#re4Game .dot').dataset.h === 'idle' && document.getElementById('re4Steps').textContent.includes('Host & Wait'), null, 'RE4 co-op checks');
    await pc.click('#re4Play');
    await wait(pc, () => document.getElementById('re4Note').textContent.endsWith('Starting RE4...'), null, 'RE4 Play');
    assert(await pc.evaluate(() => !document.getElementById('re4SetupBox').hidden && !document.getElementById('re4FwNote').hidden && document.getElementById('re4Theirs').getAttribute('aria-pressed') === 'true'), 'RE4 Set up shows, with the firewall note, and their mod is in');
    await pc.click('#re4Setup');
    await wait(pc, () => document.getElementById('re4SetupBox').hidden && document.getElementById('re4Note').textContent === 'This PC is set up to host.', null, 'RE4 Set up');
    assert(await pc.evaluate(() => document.querySelector('#re4FriendList .dot').dataset.h === 'good' && document.getElementById('re4FriendList').textContent.includes('cutiecatty: online, 38 ms, in RE4')
      && !document.getElementById('re4Friends').hidden && document.getElementById('re4HostBox').hidden && document.getElementById('re4JoinPart').hidden), 'RE4 Friends: cutiecatty online with her ping');
    await pc.fill('#re4Name', 'Leon');
    await pc.click('#re4Invite');
    await wait(pc, () => !document.getElementById('re4InviteBox').hidden && document.getElementById('re4InviteCode').value === 'RE4COOP1.for-Leon' && document.getElementById('re4Name').value === '', null, 'RE4 invite');
    await pc.click('#re4Ours');
    await wait(pc, () => document.getElementById('re4Ours').getAttribute('aria-pressed') === 'true' && document.getElementById('re4Steps').textContent.includes('Insert')
      && document.querySelector('#re4FriendList .dot').dataset.h === 'ok' && document.getElementById('re4FriendList').textContent.includes('a different co-op mod: they have their mod, you have our mod 0.6.14-retarget'), null, 'RE4 switch to our mod');
    console.log('RE4 co-op: host checks in green, amber and idle, the next clicks, Play, Set up, a friend online, an invite, and the mod switch warning about the friend’s mod');
    // Aion 2 on the overlay: out of a League game, the overlay key shows the card the Aion 2 page last wrote, and hides it
    await pc.evaluate(() => { localStorage.setItem('lpc-aion', '1'); localStorage.setItem('lpc-aion-card', JSON.stringify({ at: Date.now(), lines: ['Melted Danar in 4 min', 'Daily reset in 2 h 10 min'] })); });
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay && lpcClient.lastOverlay.visible && String(lpcClient.lastOverlay.aion) === 'Melted Danar in 4 min,Daily reset in 2 h 10 min' && lpc.toasts().includes('Aion 2 is on the overlay. Alt+V again hides it.'), null, 'the Aion 2 card on the overlay');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => !lpcClient.lastOverlay.aion && lpc.toasts().includes('Aion 2 is off the overlay.'), null, 'and off it');
    await pc.evaluate(() => localStorage.removeItem('lpc-aion'));
    console.log('Aion 2 on the overlay by its key, out of a League game');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="game"]');
    assert.match(await text(pc, '#lcuNote'), /^This page fills in when your game loads.* Before that, see Pregame\.$/);
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="pregame"]');
    assert.match(await text(pc, '#preNote'), /Find a match and this page fills in/);
    // Clash: the other team in your next match, with their ranks and best champions
    await wait(pc, () => !document.getElementById('clashBox').hidden && document.querySelectorAll('#clashRows tr').length === 2 && [...document.querySelectorAll('#clashRows tr')].every((tr) => /LP[\s\S]*Garen/.test(tr.textContent)), null, 'Clash scouting');
    assert.strictEqual(await text(pc, '#clashNote'), 'Your next Clash match is against Night Owls.');
    const clashRows = await pc.$$eval('#clashRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
    assert.match(clashRows[0], /^Owl#NA1 Top · Level 200 Gold II · 45 LP · 55% of 55 Last 20: 10W 10L .*Plays most: Garen 20 \(50%\) · Mastery: Garen 5k/);
    assert.match(clashRows[1], /^Hoot#NA1 Middle · Level 200/);
    console.log('Clash: Night Owls scouted');
    // the tier list from our server's high elo games: Middle, the role you play most, then Top
    const tierRows = () => pc.$$eval('#tierRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()));
    const tierTab = () => pc.$eval('#tierRoles [aria-selected="true"]', (b) => b.textContent);
    await wait(pc, () => !document.getElementById('tierBox').hidden && document.querySelectorAll('#tierRows tr').length === 4, null, 'the tier list');
    assert.strictEqual(await tierTab(), 'Middle');
    assert.strictEqual(await text(pc, '#tierNote'), 'Middle in 50 Challenger and Grandmaster games our server counted from Riot, patch 25.20.');
    assert.deepStrictEqual(await tierRows(), ['Vi S 72% 18 · 36% picked', 'Ahri S 55% 40 · 80% picked', 'Lux S 58% 12 · 24% picked', 'Zed A 53% 30 · 60% picked']);
    await pc.click('#tierRoles [data-role="TOP"]');
    await wait(pc, () => document.querySelectorAll('#tierRows tr').length === 3, null, 'the tier list for top');
    assert.deepStrictEqual(await tierRows(), ['Garen S 57% 30 · 60% picked', 'Lee Sin C 49% 47 · 94% picked', 'Darius D 45% 20 · 40% picked']);
    await shot(pc, 'pregame');
    console.log('tier list: Middle (Vi, Ahri, Lux, Zed), then Top (Garen, Lee Sin, Darius)');
    await pc.click('.nav[data-view="settings"]');
    // its boxes stack with no holes: each is at the top or 16px under the one above it in its column
    const holes = await pc.$$eval('.view[data-view="settings"] .settings > *', (l) => {
      const r = l.filter((p) => p.offsetParent).map((p) => p.getBoundingClientRect()), top = Math.min(...r.map((b) => b.top));
      return r.filter((b) => b.top > top && !r.some((a) => a.left === b.left && b.top - a.bottom >= 16 && b.top - a.bottom < 17.5)).length;
    });
    assert.strictEqual(holes, 0, 'Settings boxes with a hole above them');
    await preSettings();
    await pc.check('#optRemote');
    await pc.click('.nav[data-view="voice"]');
    await pc.click('#createBtn'); // a room, for the mic: clips mix it in
    await wait(pc, () => lpc.slot() >= 0, null, 'a room');

    // ---- the phone remote on Pregame: a QR code and a link, and the phone connects
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="pregame"]');
    await wait(pc, () => !document.getElementById('remoteBox').hidden && /remote\.html/.test(document.getElementById('remoteLink').href), null, 'the phone remote panel');
    const dark = await pc.evaluate(() => { const d = document.getElementById('qr').getContext('2d').getImageData(0, 0, 232, 232).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) n++; return n; });
    assert(dark > 3000, `the QR code is drawn (${dark} dark pixels)`);
    const link = await pc.getAttribute('#remoteLink', 'href');
    assert.match(link, /^http:\/\/127\.0\.0\.1:8081\/remote\.html\?peer=127\.0\.0\.1:9001&debug#[a-z0-9]{12}$/);
    const phoneBrowser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : { channel: 'chromium' }); // use the full Chromium build: headless shell says no to notifications
    const [pctx, phone] = await context(phoneBrowser, { phone: true });
    // the phone's notifications: our server's /push/ (faked here, for the phone and the PC), and a stand-in for the
    // phone's push service, which headless Chromium hasn't got
    const code = link.split('#')[1], pushes = []; // what our server was sent: [method, path, body]
    const PUSH_KEY = 'BPRtml7aY9aXxuIEjvAWzWTtivwu5AyxXa3tRnx3M4uIfyrkb_9JLjqGzydBfmmyV0iNHoejtyG88FGOqCnsdCU';
    const fakePush = (r) => {
      const q = r.request(), u = new URL(q.url());
      pushes.push([q.method(), u.pathname, q.postData() || '']);
      r.fulfill({ json: q.method() === 'GET' ? { key: PUSH_KEY } : u.pathname.endsWith('/ring') ? { sent: 1 } : { ok: true }, headers: { 'access-control-allow-origin': '*' } });
    };
    await pctx.route(/127\.0\.0\.1:9001\/push\//, fakePush);
    await ctx.route(/127\.0\.0\.1:9001\/push\//, fakePush);
    await pctx.grantPermissions(['notifications']);
    await pctx.addInitScript(() => {
      let sub = localStorage.getItem('test-sub');
      const made = (endpoint) => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'phone-key', auth: 'phone-secret' } }), unsubscribe: async () => { sub = null; localStorage.removeItem('test-sub'); return true; } });
      PushManager.prototype.subscribe = async function (o) {
        window.pushKey = btoa(String.fromCharCode(...new Uint8Array(o.applicationServerKey)));
        localStorage.setItem('test-sub', (sub = 'https://fcm.googleapis.com/fcm/send/phone-1'));
        return made(sub);
      };
      PushManager.prototype.getSubscription = async function () { return sub ? made(sub) : null; };
    });
    await phone.goto(link);
    await wait(phone, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone to connect');
    await wait(pc, () => document.getElementById('remoteState').textContent === 'Your phone is connected.', null, 'the PC to see the phone');
    await wait(phone, () => /client/.test(document.getElementById('phase').textContent), null, 'the phone to show League');
    console.log(`phone remote: QR code (${dark} dark pixels) and link, the phone connected`);
    // notifications on: subscribed with our server's key for this code, its push address and keys sent there; a push shows
    // Match found (remote-sw.js, through Chromium's own way in for push messages); then off again
    await wait(phone, () => !document.getElementById('pushRow').hidden && document.getElementById('pushNote').hidden, null, 'the notification setting on the phone');
    await phone.check('#push');
    await wait(phone, () => document.getElementById('push').checked && !document.getElementById('push').disabled && /^On: /.test(document.getElementById('pushNote').textContent), null, 'notifications on');
    assert.deepStrictEqual(pushes, [['GET', `/push/${code}`, ''], ['POST', `/push/${code}`, JSON.stringify({ add: 'https://fcm.googleapis.com/fcm/send/phone-1', keys: { p256dh: 'phone-key', auth: 'phone-secret' } })]]);
    assert.strictEqual(await phone.evaluate(() => window.pushKey), Buffer.from(PUSH_KEY, 'base64url').toString('base64'), 'subscribed with our server’s key');
    const cdp = await pctx.newCDPSession(phone), regs = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable');
    await until(() => regs.some((g) => g.scopeURL.endsWith('/remote.html')), 'the remote’s service worker');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://127.0.0.1:8081', registrationId: regs.find((g) => g.scopeURL.endsWith('/remote.html')).registrationId, data: '' });
    let shown = [];
    await until(async () => (shown = await phone.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title} ${n.body}`))).length, 'the notification');
    assert.deepStrictEqual(shown, ['Match found! Tap to open the phone remote.']);
    await phone.uncheck('#push');
    await until(() => pushes.length === 3, 'the push address taken back');
    assert.deepStrictEqual(pushes[2], ['POST', `/push/${code}`, JSON.stringify({ drop: 'https://fcm.googleapis.com/fcm/send/phone-1' })]);
    assert(!(await phone.evaluate(() => localStorage.getItem('test-sub'))), 'unsubscribed');
    // room chat: you're in a room, so it's on the phone, and what the phone writes goes to the room as yours
    await wait(phone, () => !document.getElementById('chat').hidden && document.getElementById('chatLog').children.length === 0, null, 'room chat on the phone');
    await phone.fill('#chatText', 'brb, in queue');
    await phone.click('#chatForm button');
    await wait(pc, () => /Rayan\s*brb, in queue/.test(document.getElementById('chatLog').textContent), null, 'the phone’s message in the room chat');
    await wait(phone, () => /Rayan\s*brb, in queue/.test(document.getElementById('chatLog').textContent) && document.getElementById('chatText').value === '', null, 'the message on the phone');
    console.log('phone remote: notifications on (a push shows Match found) and off, room chat written from the phone');

    // ---- the queue: a Practice Tool game in one click outside a lobby, Find match in a lobby you lead, Stop from the phone
    await wait(pc, () => !document.getElementById('queueBox').hidden && !document.getElementById('practiceBtn').hidden && document.getElementById('queueBtn').hidden, null, 'Practice Tool offered outside a lobby');
    await pc.click('#practiceBtn');
    await until(() => callsTo(/custom\/start-champ-select$/, 'POST').length === 1, 'the Practice Tool game started');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST')[0][2], { isCustom: true, customGameLobby: { lobbyName: 'Premade practice', lobbyPassword: '',
      configuration: { gameMode: 'PRACTICETOOL', gameMutator: '', gameServerRegion: '', mapId: 11, mutators: { id: 1 }, spectatorPolicy: 'AllAllowed', teamSize: 5 } } });
    // the game picked here makes a lobby for it: League's open queues, by kind
    assert.strictEqual(await text(pc, '#queueState'), 'Not in a lobby. Pick a game to make one, or try a Practice Tool game.');
    await wait(pc, () => [...document.querySelectorAll('#queuePick optgroup')].map((g) => g.label).join() === 'Summoner’s Rift,ARAM,Co-op vs. AI', null, 'the games to pick');
    assert.deepStrictEqual(await pc.$$eval('#queuePick option', (l) => l.map((o) => o.textContent)), ['Pick a game', 'Draft Pick', 'Ranked Solo/Duo', 'ARAM', 'Intro']);
    assert(await pc.locator('#pos1Label').isHidden() && await pc.locator('#inviteBox').isHidden() && await pc.locator('#lobbyLeave').isHidden(), 'no roles, friends or Leave outside a lobby');
    await pc.selectOption('#queuePick', '420');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST').length === 2, 'a Ranked Solo/Duo lobby');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST')[1][2], { queueId: 420 });
    lcu.lobby = { localMember: { isLeader: true, puuid: ME, firstPositionPreference: 'MIDDLE', secondPositionPreference: 'UNSELECTED' }, gameConfig: { isCustom: false, queueId: 420, showPositionSelector: true },
      members: [{ puuid: ME }, { puuid: 'ally1' }], invitations: [] };
    lcu.phase = 'Lobby';
    await league({ inGame: false, phase: 'Lobby' });
    await wait(pc, () => document.getElementById('queueState').textContent === 'In a lobby for Ranked Solo/Duo.' && document.getElementById('practiceBtn').hidden && !document.getElementById('queueBtn').hidden, null, 'the lobby, with a friend in it');
    // your roles: Top second, then Top first swaps Middle into second
    await wait(pc, () => !document.getElementById('pos1Label').hidden && document.getElementById('pos1').value === 'MIDDLE', null, 'your roles');
    assert.strictEqual(await pc.inputValue('#queuePick'), '420');
    const put1 = lcu.calls.length;
    await pc.selectOption('#pos2', 'TOP');
    await until(() => callsTo(/position-preferences$/, 'PUT', put1).length === 1, 'Top second');
    assert.deepStrictEqual(callsTo(/position-preferences$/, 'PUT', put1)[0][2], { firstPreference: 'MIDDLE', secondPreference: 'TOP' });
    await wait(pc, () => document.getElementById('pos2').value === 'TOP', null, 'Top second, shown');
    await pc.selectOption('#pos1', 'TOP');
    await until(() => callsTo(/position-preferences$/, 'PUT', put1).length === 2, 'Top first');
    assert.deepStrictEqual(callsTo(/position-preferences$/, 'PUT', put1)[1][2], { firstPreference: 'TOP', secondPreference: 'MIDDLE' });
    await wait(pc, () => document.getElementById('pos1').value === 'TOP' && document.getElementById('pos2').value === 'MIDDLE', null, 'the roles swapped');
    // friends to invite: online on League and not in the lobby, free ones first; invite Duo
    await wait(pc, () => document.querySelectorAll('#friendRows tr').length === 2, null, 'friends to invite');
    assert.deepStrictEqual(await texts(pc, '#friendRows tr'), ['Duo#EUW Online Invite', 'Gamer#EUW In a game Invite']);
    await pc.click('#friendRows tr:first-child button');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST').length === 1, 'Duo invited');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST')[0][2], [{ toSummonerId: 31, toPuuid: 'duo1' }]);
    await wait(pc, () => document.querySelector('#friendRows tr:first-child button').textContent === 'Invited' && document.querySelector('#friendRows tr:first-child button').disabled, null, 'Invited');
    await shot(pc, 'pregame-lobby');
    await pc.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'POST').length === 1, 'Find match');
    lcu.search = { timeInQueue: 65.4, estimatedQueueTime: 120 };
    lcu.phase = 'Matchmaking';
    await league({ inGame: false, phase: 'Matchmaking' });
    await wait(pc, () => document.getElementById('queueState').textContent === 'Finding a match: 1:05, usually about 2:00.' && document.getElementById('queueBtn').textContent === 'Stop', null, 'finding a match');
    await wait(phone, () => document.getElementById('queueState').textContent === 'Finding a match: 1:05, usually about 2:00.' && document.getElementById('queueBtn').textContent === 'Stop', null, 'the queue on the phone');
    await phone.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'DELETE').length === 1, 'Stop from the phone');
    // and Leave lobby
    lcu.phase = 'Lobby';
    await league({ inGame: false, phase: 'Lobby' });
    await wait(pc, () => !document.getElementById('lobbyLeave').hidden, null, 'Leave lobby');
    await pc.click('#lobbyLeave');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby$/, 'DELETE').length === 1, 'the lobby left');
    console.log('queue: a Practice Tool game in one click, a lobby for the game picked here, your roles, a friend invited, Find match here, Stop from the phone, Leave lobby');

    // ---- ready checks: accepted here, on the phone, then for you
    await pc.click('.nav[data-view="voice"]');
    const readyCheck = async () => { lcu.rc = { state: 'InProgress', playerResponse: 'None', timer: 2 }; lcu.phase = 'ReadyCheck'; await league({ inGame: false, phase: 'ReadyCheck' }); };
    const backToQueue = async () => { lcu.rc = null; lcu.phase = 'Matchmaking'; await league({ inGame: false, phase: 'Matchmaking' }); };
    await readyCheck();
    await wait(pc, () => !document.querySelector('.view[data-view="pregame"]').hidden && !document.getElementById('rcBox').hidden, null, 'Pregame with the ready check');
    assert.deepStrictEqual(await pc.evaluate(() => lpcClient.calls.filter((c) => c === 'front')), ['front'], 'the app in front');
    assert.match(await text(pc, '#rcState'), /\d+ s left/);
    await pc.click('#acceptBtn');
    await wait(pc, () => /You accepted/.test(document.getElementById('rcState').textContent), null, 'accepted');
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 1);
    await backToQueue();
    await readyCheck();
    await wait(phone, () => !document.getElementById('rc').hidden, null, 'the ready check on the phone');
    await phone.click('#accept');
    await wait(phone, () => /You accepted/.test(document.getElementById('rcLeft').textContent), null, 'accepted from the phone');
    assert(await phone.evaluate(() => buzzes.length >= 1 && buzzes.every((b) => b.length === 7)), 'the phone buzzed for the match');
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 2);
    await backToQueue();
    await phone.check('#auto');
    await wait(pc, () => document.getElementById('optAutoAccept').checked, null, 'auto-accept turned on from the phone');
    assert(!pushes.some(([, p]) => p.endsWith('/ring')), 'no notification for a phone that has the remote on its screen');
    const onScreen = (v) => phone.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    await onScreen('hidden'); // the phone locked
    await wait(pc, () => lpc.lcu().phones === 1 && lpc.lcu().seen === 0, null, 'the PC to know the phone isn’t looking');
    // the PC's 1 s tick back in the queue first (the phone shows the queue only after it), so it sees a new match found
    await wait(phone, () => !document.getElementById('queue').hidden && /^Finding a match/.test(document.getElementById('queueState').textContent), null, 'the PC back in the queue');
    await readyCheck();
    await wait(pc, () => lpc.toasts().includes('Match found: accepted it for you'), null, 'accepted for you');
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 3);
    await until(() => pushes.some(([m, p]) => m === 'POST' && p === `/push/${code}/ring`), 'the notification for a phone that isn’t looking');
    assert.strictEqual(pushes.filter(([, p]) => p.endsWith('/ring')).length, 1);
    await onScreen('visible');
    await pc.evaluate(() => { const c = document.getElementById('optAutoAccept'); c.checked = false; c.dispatchEvent(new Event('change')); });
    console.log('ready check: accepted on the PC, on the phone, and for you (turned on from the phone)');

    // ---- champ select
    champSelect(777);
    lcu.rc = null;
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await wait(pc, () => !document.getElementById('csBox').hidden && /Friend#EUW\s+Top/.test(document.querySelector('#csRows tr').innerText) && [...document.querySelectorAll('#csRows tr')].filter((tr) => /Gold II · 45 LP · 55% of 55/.test(tr.textContent)).length === 3 && /hovering Garen/.test(document.getElementById('csRows').textContent), null, 'champ select with ranks');
    const rows = await texts(pc, '#csRows tr');
    assert.strictEqual(rows.length, 5);
    assert.match(rows[0], /Friend#EUW .*Top.*hovering Garen.*Gold II · 45 LP.*Flex: Silver I · 10 LP.*Last 20: 6W 14L.*Garen: 8 games, 75% won.*6 wins in a row.*Comfort pick.*Seen before: 20 with you \(13W 7L\)/);
    assert.match(rows[4], /Hooks#EUW .*Off-role: rarely plays support \(0 of 20\)/);
    assert.deepStrictEqual(await embs(pc, '#csRows .emb'), Array(3).fill('TFT_Regalia_Gold.png'), 'an emblem by each rank');
    assert.doesNotMatch(rows.join(), /Premade|smurf/);
    assert.match(rows[1], /Name hidden by Riot/);
    assert.match(rows[3], /Name hidden by Riot/);
    assert(!lcu.calls.some(([, p]) => /hidden1/.test(p)), 'nobody whose name Riot hides is looked up');
    assert.match(await text(pc, '#csTurn'), /Your turn to ban: \d+ s left/);
    await wait(pc, () => lpc.toasts().includes('Your turn to ban!'), null, 'the turn alarm');
    await wait(phone, () => buzzes.some((b) => b.length === 3), null, 'the turn alarm on the phone');
    // the phone: both teams as League shows them (no name Riot hides), whose turn it is, the bans and the seconds left;
    // bans for you, and every champion found by name or role
    const seats = (id) => phone.$$eval(`#${id} li`, (l) => l.map((li) => li.innerText.replace(/\s+/g, ' ').trim() + (li.hasAttribute('data-now') ? ' (now)' : '') + (li.hasAttribute('data-locked') ? ' (locked)' : '')));
    const grid = () => phone.$$eval('#grid button', (l) => l.map((b) => b.textContent + (b.disabled ? ' (off)' : '')));
    await wait(phone, () => document.querySelectorAll('#team li').length === 5 && /^\d+$/.test(document.getElementById('clock').textContent), null, 'champ select on the phone');
    assert.deepStrictEqual(await seats('team'), ['Friend top · hovering Garen', 'Teammate jungle', 'You mid · banning… (now)', 'Teammate bot', 'Hooks support · hovering Thresh']);
    assert.deepStrictEqual(await seats('them'), Array(5).fill('Opponent'));
    assert.deepStrictEqual([await text(phone, '#stage'), await text(phone, '#turn')], ['Ban phase', 'Your turn to ban.']);
    assert(+(await text(phone, '#clock')) <= 30);
    assert.strictEqual(await phone.locator('#ourBans > *').count(), 1, 'Friend’s ban');
    await wait(phone, () => [...document.querySelectorAll('#picks button')].map((b) => b.textContent).join() === 'Darius,Vi,Zed', null, 'bans for you on the phone');
    assert.match(await text(phone, '#picksHead'), /^Bans for you/);
    assert.strictEqual(await text(phone, '#lock'), 'Ban');
    assert(await phone.locator('#lock').isDisabled(), 'nothing hovered yet');
    assert.deepStrictEqual(await grid(), ['Ahri', 'Caitlyn', 'Darius', 'Garen', 'Jinx', 'Lee Sin', 'Lux', 'Sona', 'Thresh', 'Vi', 'Zed']);
    await phone.fill('#q', 'lu');
    await wait(phone, () => [...document.querySelectorAll('#grid button')].map((b) => b.textContent).join() === 'Lux', null, 'the search on the phone');
    await phone.fill('#q', '');
    await phone.selectOption('#role', 'm');
    await wait(phone, () => [...document.querySelectorAll('#grid button')].map((b) => b.textContent).join() === 'Ahri,Lux,Zed', null, 'middles on the phone');
    await phone.selectOption('#role', '');
    // trades: ask Friend for their champion here, take Hooks's position swap on the phone
    await pc.click('#csRows tr:first-child button:has-text("Ask to swap champions")');
    await until(() => callsTo(/champion-swaps\/5\/request$/, 'POST').length === 1, 'the champion trade asked');
    await wait(pc, () => /Cancel the champions swap/.test(document.getElementById('csRows').textContent), null, 'the trade sent');
    await wait(phone, () => [...document.querySelectorAll('#trades button')].some((b) => b.textContent === 'Swap positions'), null, 'the trade on the phone');
    assert.match(await text(phone, '#trades'), /Hooks|support/);
    await phone.click('#trades button:has-text("Swap positions")');
    await until(() => callsTo(/position-swaps\/6\/accept$/, 'POST').length === 1, 'the position trade taken from the phone');
    assert.strictEqual(await text(pc, '#pickLock'), 'Ban');
    assert(await pc.locator('#picks').isHidden(), 'no picks while banning');
    // bans for you: the champion you lose to most, then the strongest middles in high elo (not Ahri or Lux: you play
    // them); hover Darius by name, then ban him from his button
    assert.strictEqual(await pc.locator('#bansHead').textContent(), 'Bans for you');
    assert.deepStrictEqual(await texts(pc, '#bans button'), ['Darius You lost 3 of 4 against it', 'Vi High elo: 72% of 18 games, middle', 'Zed High elo: 53% of 30 games, middle']);
    await pc.fill('#anyChamp', 'Darius');
    await pc.click('#hoverBtn');
    await wait(pc, () => /hovering Darius/.test(document.getElementById('csTurn').textContent), null, 'the ban hovered');
    await pc.click('#bans button:has-text("Darius")');
    await wait(pc, () => /Your turn to pick/.test(document.getElementById('csTurn').textContent), null, 'my pick');
    assert.deepStrictEqual(flatActions().find((a) => a.id === 3), { id: 3, actorCellId: 2, type: 'ban', completed: true, isInProgress: false, championId: 122 });
    // the best picks for you, with why: Lux beat Zed (their middle now) in high elo, Ahri's your best, Vi's strong in
    // high elo but new to you. Garen and Sona aren't middle, Zed is taken
    await wait(pc, () => /Beat Zed in 5 of 6/.test(document.getElementById('picks').textContent), null, 'the best picks against Zed');
    const picks = await texts(pc, '#picks button');
    assert.deepStrictEqual(picks, ['Lux High elo: 58% of 12 games · Beat Zed in 5 of 6 · You: 5 games, 60% won', 'Ahri High elo: 55% of 40 games · Beat Zed in 4 of 10 · You: 8 games, 75% won', 'Vi High elo: 72% of 18 games']);
    assert(highAsked.includes('238/MIDDLE'), 'Zed’s high elo games in the middle asked for');
    // the draft: both teams by role with their scores, and every champion ranked for your role, middle: Lux beat Zed in
    // high elo and won with Garen, Vi's strong in high elo, Zed's taken and Ahri lost to Zed
    const dGrid = () => pc.$$eval('#dGrid .dchamp', (l) => l.map((b) => `${b.querySelector('img').alt} ${b.querySelector('.dsc').textContent}${b.getAttribute('aria-disabled') === 'true' ? ' (off)' : ''}${b.hasAttribute('data-fav') ? ' (favorite)' : ''}`));
    const slots = (id) => pc.$$eval(`#${id} .dslot`, (l) => l.map((s) => (s.querySelector('img') ? `${s.querySelector('img').alt} ${s.querySelector('.dsc').textContent}` : '?') + (s.hasAttribute('data-hover') ? ' (hovering)' : '') + (s.hasAttribute('data-me') ? ' (you)' : '')));
    const dRole = () => pc.textContent('#dRoles [aria-selected="true"]');
    await wait(pc, () => /With Garen/.test((document.querySelector('#dGrid .dchamp') || {}).title), null, 'the draft, with the pairs');
    assert.deepStrictEqual(await dGrid(), ['Lux +24.1', 'Vi +10.5', 'Zed +2.0 (off)', 'Ahri −2.3']);
    assert.strictEqual(await pc.getAttribute('#dGrid .dchamp', 'title'), 'Lux\nHigh elo middle: 58% won in 12 games\nAgainst Zed in lane: won 5 of 6 (+12.1)\nWith Garen: won 15 of 20 (+8.9)');
    assert.strictEqual(await dRole(), 'Middle');
    assert.deepStrictEqual(await slots('dUs'), ['Garen +4.0 (hovering)', '?', '? (you)', '?', 'Thresh +0.0 (hovering)']);
    assert.deepStrictEqual(await slots('dThem'), ['?', '?', 'Zed +2.0', '?', '?'], 'Zed guessed in the middle');
    assert.deepStrictEqual([await text(pc, '#dUsScore'), await text(pc, '#dThemScore')], ['+4.0', '+2.0']);
    assert.match(await text(pc, '#csTurn'), /^Your turn to pick: \d+ s left\.$/);
    // another role: top, where Lee Sin did well against Zed; by high elo win rate alone Garen's first
    await pc.click('#dRoles [data-role="TOP"]');
    await wait(pc, () => /Lee Sin/.test(document.getElementById('dGrid').textContent + [...document.querySelectorAll('#dGrid img')].map((i) => i.alt).join()), null, 'the draft for top');
    assert.strictEqual(await dRole(), 'Top');
    assert.deepStrictEqual(await dGrid(), ['Lee Sin +6.5', 'Garen +4.0', 'Darius −2.5 (off)']);
    assert.match(await pc.getAttribute('#dGrid .dchamp', 'title'), /\nAgainst Zed: won 8 of 12 \(\+7\.3\)$/);
    await pc.click('#dModes [data-mode="meta"]');
    await wait(pc, () => document.querySelector('#dGrid img').alt === 'Garen', null, 'meta');
    assert.deepStrictEqual(await dGrid(), ['Garen +4.0', 'Lee Sin −0.7', 'Darius −2.5 (off)']);
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-draft'))), { mode: 'meta' });
    await pc.click('#dModes [data-mode="balanced"]');
    await pc.click('#dRoles [data-role="MIDDLE"]');
    await wait(pc, () => document.querySelectorAll('#dGrid .dchamp').length === 4, null, 'middle again');
    // type anywhere to find a champion, and Enter hovers it; right-click makes a favorite, first in the list
    await pc.evaluate(() => document.activeElement.blur());
    await pc.keyboard.type('lu');
    await wait(pc, () => document.getElementById('dFind').value === 'lu' && document.querySelectorAll('#dGrid .dchamp').length === 1, null, 'the search');
    await pc.keyboard.press('Enter');
    await wait(pc, () => /hovering Lux/.test(document.getElementById('csTurn').textContent), null, 'Lux hovered from the search');
    await pc.keyboard.press('Escape');
    await wait(pc, () => document.querySelectorAll('#dGrid .dchamp').length === 4, null, 'the search cleared');
    assert.deepStrictEqual(await slots('dUs'), ['Garen +4.0 (hovering)', '?', 'Lux +24.1 (hovering) (you)', '?', 'Thresh +0.0 (hovering)']);
    assert.strictEqual(await text(pc, '#dUsScore'), '+28.1');
    await pc.click('#dGrid .dchamp:has(img[alt="Ahri"])', { button: 'right' });
    await wait(pc, () => document.querySelector('#dGrid .dchamp').hasAttribute('data-fav'), null, 'a favorite');
    assert.deepStrictEqual(await dGrid(), ['Ahri −2.3 (favorite)', 'Lux +24.1', 'Vi +10.5', 'Zed +2.0 (off)']);
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-favs'))), [103]);
    await pc.click('#dGrid .dchamp:has(img[alt="Ahri"])', { button: 'right' });
    await wait(pc, () => !document.querySelector('#dGrid [data-fav]'), null, 'no favorite');
    assert.match(await text(pc, '#csTheirs'), /Their picks: Zed \(likely in your lane\)\. Banned: a champion, Darius\./);
    assert.match(await text(pc, '#mixNote'), /^Your team so far: 1 physical, 2 magic damage\. Theirs: 1 physical, 0 magic\.$/); // Garen, Thresh and your Lux hovered
    assert.strictEqual(await tierTab(), 'Middle', 'the tier list on your role');
    await pc.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await shot(pc, 'pregame-picks');
    // on the phone: their Zed, and Darius banned, so neither can be picked
    await wait(phone, () => document.getElementById('stage').textContent === 'Your team is picking' && /Zed/.test(document.getElementById('them').textContent), null, 'their Zed on the phone');
    assert.deepStrictEqual(await seats('them'), ['Opponent', 'Opponent', 'Zed (locked)', 'Opponent', 'Opponent']);
    assert.deepStrictEqual(await phone.$$eval('#ourBans img', (l) => l.map((i) => i.alt)), ['Darius']);
    await wait(phone, () => /Darius \(off\)/.test([...document.querySelectorAll('#grid button')].map((b) => b.textContent + (b.disabled ? ' (off)' : '')).join()), null, 'Darius off on the phone');
    assert.deepStrictEqual(await grid(), ['Ahri', 'Caitlyn', 'Darius (off)', 'Garen', 'Jinx', 'Lee Sin', 'Lux', 'Sona', 'Thresh', 'Vi', 'Zed (off)']);
    await shot(phone, 'phone-pick');
    // hover from the phone, lock in here
    await wait(phone, () => [...document.querySelectorAll('#picks button')].some((b) => b.textContent === 'Ahri'), null, 'the picks on the phone');
    await phone.click('#picks button:has-text("Ahri")');
    await wait(pc, () => /hovering Ahri/.test(document.getElementById('csTurn').textContent), null, 'Ahri hovered from the phone');
    await pc.click('#picks button:has-text("Ahri")');
    await wait(pc, () => /Runes: the most popular page/.test(document.getElementById('runesNote').textContent), null, 'the runes');
    assert.strictEqual(await text(pc, '#runesNote'), 'Runes: the most popular page for Ahri, middle, in high elo (Electrocute: 63% won in 30 games). Spells: Flash on D, Ignite on F.');
    const page1 = callsTo(/^\/lol-perks\/v1\/pages$/, 'POST');
    assert.strictEqual(page1.length, 1);
    assert.deepStrictEqual(page1[0][2], { name: 'LPC Ahri', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8237, 5008, 5008, 5011], current: true });
    assert(highAsked.includes('103/MIDDLE'), 'high elo Ahri in the middle asked for');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH').pop()[2], { spell1Id: 4, spell2Id: 14 });
    assert.match(await text(pc, '#csTurn'), /You’re playing Ahri/);
    // your usual build in League's shop, your skill order, and a matchup note against Zed
    await wait(pc, () => document.getElementById('buildNote').textContent === 'Items: the high elo build on Ahri (from 40 games) and yours (from 8 of your games) are in League’s shop as “LPC Ahri”.', null, 'the item set');
    const sets = callsTo(/^\/lol-item-sets\/v1\/item-sets\/1234\/sets$/, 'PUT');
    assert.strictEqual(sets.length, 1);
    const set = sets[0][2], lpcSet = set.itemSets[1];
    assert.deepStrictEqual(set.itemSets.map((s) => s.title), ['My set', 'LPC Ahri']);
    assert.deepStrictEqual(lpcSet.blocks.map((b) => [b.type, b.items.map((i) => i.id).join()]), [['High elo start', '1056,2003'], ['High elo first items, in order', '6655,3089,3157'], ['High elo boots', '3020'], ['High elo also build', '3071'],
      ['Your start', '1056,2003'], ['Your first items, in order', '6655,3157,3089'], ['Your boots', '3020']]);
    assert.deepStrictEqual([lpcSet.uid, lpcSet.associatedChampions, lpcSet.associatedMaps, set.accountId], ['lpc-103', [103], [11], 77]);
    assert.strictEqual(await text(pc, '#skillNote'), 'Your skill order on Ahri (from 8 games): start Q, W, E, then max Q, then W, then E. In high elo: start Q, E, W, then max Q, then E, then W.');
    assert.strictEqual(await text(pc, '#topNote'), 'In high elo, Ahri middle won 55% of 40 games. Against their picks: Zed, 40% won in 30 games (−200 gold at 10).');
    assert.strictEqual(await text(pc, '#runesOther'), 'Use my own usual runes instead');
    // the tips for your lane: how Ahri does against Zed in high elo and in your games, the two champions, what high elo
    // players take in the matchup, and Riot's own tips
    await wait(pc, () => !document.getElementById('csTips').hidden && /Riot’s tip for Ahri/.test(document.getElementById('csTips').textContent), null, 'the tips for your lane');
    assert.strictEqual(await pc.textContent('#csTips h3'), 'Tips: Ahri against Zed');
    assert.deepStrictEqual(await tipsIn(pc, '#csTips'), TIPS_AHRI_ZED);
    await pc.click('#csNotes summary');
    await pc.fill('#csNotes input', 'Zed');
    await pc.fill('#csNotes textarea', 'Respect his level 6. Ward the side bushes.');
    await pc.click('#csNotes button[type="submit"]');
    await wait(pc, () => document.querySelector('#csNotes .notelist').textContent === 'Ahri against Zed: Respect his level 6. Ward the side bushes.', null, 'the matchup note');
    assert(await pc.evaluate(() => lpc.toasts().includes('Saved your note on Ahri against Zed.')));
    await wait(pc, () => document.querySelector('#csTips li').textContent === 'Your note: Respect his level 6. Ward the side bushes.', null, 'your note first in the tips');
    await shot(pc, 'champ-select');
    // ---- on the phone once you've locked in: your runes (the page in use changed rune by rune and saved over it,
    // Riot's page saved as a new one, then another page picked), your summoner spells and your skin
    await wait(phone, () => document.getElementById('turn').textContent === 'You’re playing Ahri.' && !document.getElementById('tab-runes').hidden && !document.getElementById('tab-skins').hidden, null, 'the runes and skins tabs on the phone');
    assert(await phone.locator('#lock').isHidden(), 'nothing left to pick');
    await shot(phone, 'phone-champ-select');
    await phone.click('#tab-runes');
    await wait(phone, () => document.getElementById('pageSel').selectedOptions[0].textContent === 'LPC Ahri' && document.querySelectorAll('#recs button').length === 2, null, 'your rune page on the phone');
    const pressed = () => phone.$$eval('#editor [aria-pressed="true"]', (l) => l.map((b) => b.textContent || b.querySelector('img').alt));
    assert.deepStrictEqual(await pressed(), ['Domination', 'Electrocute', 'Taste of Blood', 'Eyeball Collection', 'Treasure Hunter', 'Sorcery', 'Manaflow Band', 'Scorch', 'Adaptive force', 'Adaptive force', 'Health']);
    assert.deepStrictEqual(await texts(phone, '#recs button'), ['Most popular in high elo', 'Riot’s Electrocute']);
    await phone.click('#editor button:has(img[alt="Dark Harvest"])');
    await phone.click('#editor button:has(img[alt="Celerity"])'); // a third row: Manaflow Band, picked first, goes
    await phone.locator('#editor .chips').first().locator('button', { hasText: 'Attack speed' }).click();
    assert.deepStrictEqual(await pressed(), ['Domination', 'Dark Harvest', 'Taste of Blood', 'Eyeball Collection', 'Treasure Hunter', 'Sorcery', 'Celerity', 'Scorch', 'Attack speed', 'Adaptive force', 'Health']);
    await shot(phone, 'phone-runes');
    const fromPhone = lcu.calls.length;
    await phone.click('#pageSave');
    await wait(phone, () => document.getElementById('csNote').textContent === 'Saved “LPC Ahri”, and it’s your rune page now.', null, 'the page saved from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', fromPhone).map((c) => [c[2].name, c[2].primaryStyleId, c[2].subStyleId, c[2].selectedPerkIds]), [['LPC Ahri', 8100, 8200, [8128, 8139, 8138, 8135, 8234, 8237, 5005, 5008, 5011]]]);
    assert.deepStrictEqual(callsTo(/currentpage$/, 'PUT', fromPhone).map((c) => c[2]), [50]);
    await phone.click('#recs button:has-text("Riot’s Electrocute")');
    await phone.fill('#pageName', 'From my phone');
    await phone.click('#pageNew');
    await wait(phone, () => document.getElementById('pageSel').selectedOptions[0].textContent === 'From my phone', null, 'the new page in use');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', fromPhone).map((c) => c[2]), [{ name: 'From my phone', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5002], current: true }]);
    await phone.selectOption('#pageSel', { label: 'My page' });
    await until(() => callsTo(/currentpage$/, 'PUT', fromPhone).map((c) => c[2]).join() === '50,1', 'My page picked on the phone');
    lcu.pages = lcu.pages.filter((x) => x.id !== 51); // deleted in League again, so the page made later is 51 too
    // spells: Teleport on F, then on D (Flash goes to F, as in League); only the ones in this mode (no ARAM's Mark)
    await phone.click('#tab-spells');
    const spellGrid = () => phone.$$eval('#spellGrid button', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    await wait(phone, () => document.getElementById('slotD').textContent === 'DFlash' && document.getElementById('slotF').textContent === 'FIgnite', null, 'your spells on the phone');
    assert.deepStrictEqual(await spellGrid(), ['Flash (on)', 'Heal', 'Ignite', 'Smite', 'Teleport']);
    await phone.click('#slotF');
    await wait(phone, () => document.querySelector('#spellGrid [aria-pressed="true"]').textContent === 'Ignite', null, 'F picked');
    await phone.click('#spellGrid button:has-text("Teleport")');
    await wait(phone, () => document.getElementById('slotF').textContent === 'FTeleport', null, 'Teleport on F');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', fromPhone).map((c) => c[2]), [{ spell1Id: 4, spell2Id: 12 }]);
    await phone.click('#slotD');
    await phone.click('#spellGrid button:has-text("Teleport")');
    await wait(phone, () => document.getElementById('slotD').textContent === 'DTeleport' && document.getElementById('slotF').textContent === 'FFlash', null, 'Teleport on D, Flash on F');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', fromPhone).pop()[2], { spell1Id: 12, spell2Id: 4 });
    // skins: the ones you own, then a chroma you own
    await phone.click('#tab-skins');
    const skins = () => phone.$$eval('#skins .skin', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    await wait(phone, () => document.querySelectorAll('#skins .skin').length === 2, null, 'your skins on the phone');
    assert.deepStrictEqual(await skins(), ['Ahri (on)', 'Dynasty Ahri']);
    assert.match(await phone.getAttribute('#skins .skin img', 'src'), /\/cdn\/img\/champion\/loading\/Ahri_0\.jpg$/);
    await phone.click('#skins .skin:has-text("Dynasty Ahri")');
    await wait(phone, () => document.querySelectorAll('#chromas .chroma').length === 1, null, 'Dynasty Ahri and its chroma');
    assert.deepStrictEqual([await skins(), await phone.getAttribute('#chromas .chroma', 'aria-label')], [['Ahri', 'Dynasty Ahri (on)'], 'Ruby']);
    await phone.click('#chromas .chroma');
    await wait(phone, () => document.querySelector('#chromas .chroma').getAttribute('aria-pressed') === 'true', null, 'the Ruby chroma');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', fromPhone).slice(-2).map((c) => c[2]), [{ selectedSkinId: 103001 }, { selectedSkinId: 103020 }]);
    assert.deepStrictEqual(await skins(), ['Ahri', 'Dynasty Ahri (on)']);
    await shot(phone, 'phone-skins');
    // Dodge from the phone: only on a second tap
    await phone.click('#dodge');
    assert.strictEqual(await text(phone, '#dodge'), 'Tap again to dodge');
    assert.strictEqual(callsTo(/session\/quit$/).length, 0, 'not on the first tap');
    await phone.click('#dodge');
    await until(() => callsTo(/session\/quit$/, 'POST').length === 1, 'a dodge from the phone');
    assert.strictEqual(await text(phone, '#dodge'), 'Dodge');
    console.log(`champ select: ranks, recent games and tags (${rows[0].match(/6 wins in a row|Comfort pick/g).join(', ')}), hidden names never looked up, a ban, picks for middle, hover from the phone, lock in, high elo's runes, spells, build, skill order and matchup; on the phone both teams, bans, the clock, the champions by name or role, runes saved over a page and as a new one, spells, a skin with its chroma and a dodge`);

    // ---- the loading screen: everyone's rank on the overlay, your team first, each team top to support, with their
    // record on their champion and tags; and the tips for your lane, there and on the Game page. Settings turns it off;
    // the overlay key hides it and brings it back.
    lcu.cs = null;
    lcu.phase = 'InProgress';
    await league({ inGame: false, phase: 'InProgress' });
    await wait(pc, () => { const b = lpcClient.lastOverlay && lpcClient.lastOverlay.board; return !!b && b.us.length === 5 && b.them.length === 5 && [...b.us, ...b.them].every((p) => /LP|Unranked/.test(p.rank)) && !!b.tips && b.tips.lines.length === 9; }, null, 'everyone’s rank on the loading screen');
    const board = await pc.evaluate(() => lpcClient.lastOverlay.board);
    const cardOf = (p) => ({ ...p, pic: /\/img\/champion\/\w+\.png$/.test(p.pic), emb: p.emb.replace(/^.*\//, '') });
    assert.deepStrictEqual(cardOf(board.them[2]), { name: 'Shadow', sub: 'Zed · Middle', pic: true, me: false, ally: false, lane: true, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: 'TFT_Regalia_Gold.png',
      rec: 'Zed: not in the last 20', tags: [['bad', 'First time on this champion'], ['', 'One-trick: Ahri'], ['', 'Seen before']] });
    assert.deepStrictEqual(cardOf(board.us[0]), { name: 'Friend', sub: 'Garen · Top', pic: true, me: false, ally: true, lane: false, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: 'TFT_Regalia_Gold.png',
      rec: 'Garen: 8 of the last 20, 75% won · mastery 3', tags: [['good', '6 wins in a row'], ['good', 'Comfort pick'], ['', 'Seen before']] });
    assert.deepStrictEqual([board.us.map((p) => p.me), board.them.map((p) => p.lane)], [[false, false, true, false, false], [false, false, true, false, false]], 'you, and who’s in your lane');
    assert.deepStrictEqual([...board.us, ...board.them].map((p) => p.tags.map(([, t]) => t).filter((t) => /Premade|smurf|Off-role/.test(t)).join()),
      ['', 'Premade with Shooter', '', 'Premade with Jungler', 'Off-role', '', '', '', 'Maybe a smurf', '']);
    assert.deepStrictEqual([board.us.map((p) => p.name), board.them.map((p) => p.name)], [['Friend', 'Jungler', 'Rayan', 'Shooter', 'Hooks'], ['Axe', 'Puncher', 'Shadow', 'Sniper', 'Singer']]);
    assert.deepStrictEqual(board.tips, { title: 'Ahri against Zed', lines: ['Your note: Respect his level 6. Ward the side bushes.', ...TIPS_AHRI_ZED] });
    await wait(pc, () => !document.querySelector('.view[data-view="game"]').hidden && !document.getElementById('gameTips').hidden, null, 'the tips on the Game page');
    assert.strictEqual(await pc.textContent('#gameTips h3'), 'Tips: Ahri against Zed');
    assert.deepStrictEqual(await tipsIn(pc, '#gameTips'), board.tips.lines);
    await shot(pc, 'loading-screen');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="overlay"]');
    await pc.uncheck('#optOverlayBoard');
    await wait(pc, () => !lpcClient.lastOverlay.board, null, 'no ranks on the loading screen when Settings says so');
    await pc.check('#optOverlayBoard');
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false && lpc.toasts().includes('Overlay hidden. Alt+V brings it back.'), null, 'the loading screen’s overlay hidden by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => !!lpcClient.lastOverlay.board && lpc.toasts().includes('Overlay back on.'), null, 'and back');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="game"]');
    console.log('loading screen: everyone’s rank, record and tags on the overlay with the tips for your lane, also on the Game page; off on the Overlay page, hidden by the key');

    // ---- in game: everyone scouted, timers, gold, the overlay and the phone
    await league(leagueData());
    await wait(pc, () => !document.querySelector('.view[data-view="game"]').hidden && !document.getElementById('liveBox').hidden && document.querySelectorAll('#liveRows tr').length === 10 && /Dragon/i.test(document.getElementById('timers').textContent), null, 'the Game page in game');
    await wait(pc, () => lpc.lcu().scouted.includes('enemy5') && [...document.querySelectorAll('#liveRows tr')].every((tr) => /LP|Unranked/.test(tr.textContent)), null, 'all ten scouted');
    assert.strictEqual(callsTo(/alias\/lookup\?gameName=Singer&tagLine=EUW/).length, 1, 'the player League gave no puuid is found by Riot ID');
    const live = await pc.evaluate(() => [...document.querySelectorAll('#liveRows tr')].map((tr) => [tr.dataset.team, tr.hasAttribute('data-me'), tr.innerText.replace(/\s+/g, ' ')]));
    assert.deepStrictEqual(live.map(([t]) => t), [...Array(5).fill('ally'), ...Array(5).fill('enemy')]);
    assert(live[0][1] && /Rayan#EUW/.test(live[0][2]), 'you are marked');
    const row = (n) => live.find(([, , t]) => t.startsWith(`${n}#`))[2];
    assert.match(row('Shadow'), /First time on this champion/);
    assert.match(row('Jungler'), /One-trick: Lee Sin.*Premade with Shooter \(3 recent games\)/);
    assert.match(row('Shooter'), /Premade with Jungler \(3 recent games\)/);
    assert.match(row('Shadow'), /Seen before: 20 against you \(you won 13\)/);
    assert.match(row('Sniper'), /Maybe a smurf: level 30, 80% won/);
    assert.match(row('Hooks'), /Off-role: rarely plays support/);
    assert.strictEqual(live.filter(([, , t]) => /Premade|smurf/.test(t)).length, 3, 'nobody else premade or a smurf');
    assert.strictEqual(await pc.evaluate(() => document.querySelector('#liveNotes .notelist').textContent), 'Ahri against Zed: Respect his level 6. Ward the side bushes.');
    const timers = await text(pc, '#timers');
    assert.match(timers.replace(/\s+/g, ' '), /DRAGON 1:[0-4]\d BARON (10:00|9:[1-5]\d) THEIR MID INHIBITOR (4:[01]\d|3:[3-5]\d) KILLS 5–3 TOWERS 1–0 GOLD \+15\.5k/i); // counting down since the game data came: up to 50 s on a busy container
    await wait(pc, () => lpcClient.lastOverlay && /^Dragon 1:\d\d · Baron \d+:\d\d · Their mid inhibitor 4:\d\d · Kills 5–3 · Gold \+15\.5k · Win chance 9\d%$/.test(lpcClient.lastOverlay.game), null, 'the overlay line, ending with the chance to win');
    assert(await pc.evaluate(() => !lpcClient.lastOverlay.board && document.getElementById('gameTips').hidden), 'no ranks on the overlay and no tips once the game is on');
    await wait(phone, () => /Dragon1:\d\dBaron.*Gold\+15\.5k/.test(document.getElementById('timers').textContent), null, 'the timers on the phone');
    // your lane and CS a minute: on the Game page and the overlay, against your usual on Ahri
    await wait(pc, () => /^Your lane against Zed: level 11 vs 10 · CS 100 vs 90 · kills 3 vs 2\. CS 100 · \d+\.\d a minute \(usual 5\.3\)$/.test(document.getElementById('laneStats').textContent) && !document.getElementById('laneStats').hidden, null, 'lane stats');
    await wait(pc, () => /^CS 100 · \d+\.\d a minute \(usual 5\.3\)$/.test(lpcClient.lastOverlay.cs), null, 'the CS counter on the overlay');
    await wait(pc, () => lpcClient.lastOverlay.lane === 'vs Zed: CS +10 · gold +3.1k', null, 'your lane on the overlay: CS and item gold against Zed');
    // the overlay picker, see-through slider and key
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="overlay"]');
    await pc.uncheck('#optOverlayCs');
    await wait(pc, () => lpcClient.lastOverlay.cs === '' && !!lpcClient.lastOverlay.game, null, 'the CS counter off the overlay');
    await pc.check('#optOverlayCs');
    await pc.$eval('#optOpacity', (el) => { el.value = 0.6; el.dispatchEvent(new Event('input')); });
    await wait(pc, () => lpcClient.lastOverlay.opacity === 0.6 && document.getElementById('opacityOut').textContent === '60%', null, 'a see-through overlay');
    assert.strictEqual(await text(pc, '#kOverlay'), 'Alt+V');
    // its key: everyone's rank (no tips in a game), then hidden, then back
    await pc.evaluate(() => { lpcClient.emit('key', 'overlay'); lpcClient.emit('key', 'overlay'); }); // held: Windows repeats it
    await wait(pc, () => { const b = lpcClient.lastOverlay.board; return !!b && b.us.length === 5 && b.them.length === 5 && !b.tips && !!lpcClient.lastOverlay.cs && lpc.toasts().includes('Everyone’s rank is on the overlay. Alt+V again hides the overlay.'); }, null, 'everyone’s rank on the overlay by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false && lpc.toasts().slice(-1)[0] === 'Overlay hidden. Alt+V brings it back.', null, 'the overlay hidden by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible && lpcClient.lastOverlay.cs && !lpcClient.lastOverlay.board, null, 'the overlay back');
    // the sound 30 seconds before Dragon (the last one was at 6:40, so the next at 11:40)
    await league(leagueData({ t: 672 }));
    await wait(pc, () => lpc.toasts().includes('Dragon in 30 seconds') && lpc.played().includes('spawn'), null, 'the Dragon warning');
    // ARAM: Mayhem: what kind of augment suits Ahri, on the overlay at the start and while dead, on the Game page all game
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="game"]');
    assert(await pc.evaluate(() => !lpcClient.lastOverlay.aug && document.getElementById('augTips').hidden), 'no augment tips in a ranked game');
    const AHRI_AUG = 'Augments for Ahri: look for ability power, ability haste, magic penetration and mana; skip attack speed and critical strikes.';
    await league(leagueData({ mode: 'KIWI', t: 30 }));
    await wait(pc, (a) => lpcClient.lastOverlay.aug === a && document.getElementById('augTips').textContent === a, AHRI_AUG, 'augment tips in Mayhem');
    await league(leagueData({ mode: 'KIWI', t: 300 }));
    await wait(pc, () => lpcClient.lastOverlay.aug === '' && !document.getElementById('augTips').hidden, null, 'off the overlay between augments');
    await league(leagueData({ mode: 'KIWI', t: 300, me: { ...leagueData().me, dead: true } }));
    await wait(pc, (a) => lpcClient.lastOverlay.aug === a, AHRI_AUG, 'back on the overlay while dead');
    await league(leagueData());
    await shot(pc, 'in-game');
    await shot(phone, 'phone-in-game');
    console.log(`in game: all ten scouted (one found by Riot ID), timers and gold: ${await pc.evaluate(() => lpcClient.lastOverlay.game)}`);
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => /^In game as Ahri · 1\d min$/.test(document.getElementById('proStatus').textContent), null, 'in game on your profile');

    // ---- clips: the key saves what was recorded, a multikill saves a clip by itself; both play
    await wait(pc, () => lpc.clips().on && lpc.clips().parts >= 9, null, 'ten seconds of recording', 20000);
    const keyAge = await pc.evaluate(() => { lpcClient.emit('key', 'clip'); return lpc.clips().age; });
    await wait(pc, () => lpc.clips().saved.length === 1, null, 'the clip from the key', 30000); // slow on a busy 4-CPU container
    const full = await pc.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([window.lastClip], { type: 'video/webm' }));
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error ' + (v.error && v.error.message))); });
      const d = v.duration;
      v.currentTime = Math.max(0, d - 1);
      await new Promise((res) => { v.onseeked = res; });
      return { d, start: v.seekable.length ? v.seekable.start(0) : -1, w: v.videoWidth };
    });
    assert(full.d >= 9 && full.d <= keyAge + 3 && full.w === 1280, `the clip holds the whole recording so far: ${JSON.stringify({ ...full, keyAge })}`);
    // a busy PC can hand the WebM header over in pieces (once its first byte alone): the head waits for the first Cluster
    const split = await pc.evaluate(async () => {
      const whole = window.lastClip, r = { pre: [], parts: [] };
      const c = whole.findIndex((x, i) => x === 0x1f && whole[i + 1] === 0x43 && whole[i + 2] === 0xb6 && whole[i + 3] === 0x75);
      for (const [a, b] of [[0, 1], [1, c + 100], [c + 100, whole.length]]) lpc.headChunk(r, new Blob([whole.subarray(a, b)]));
      await new Promise((res) => setTimeout(res, 500));
      return { c, head: r.head ? r.head.size : 0, rest: r.parts.reduce((n, p) => n + p.blob.size, 0), all: whole.length, left: r.pre.length };
    });
    assert(split.head >= split.c + 100 && split.head + split.rest === split.all, `the whole header kept, nothing lost: ${JSON.stringify(split)}`);
    // the last 4 s only, through the same cut as the 30 s one
    await pc.evaluate(() => lpc.saveClip('key', 4));
    await wait(pc, () => lpc.clips().saved.length === 2, null, 'the short clip');
    const short = await pc.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([window.lastClip], { type: 'video/webm' }));
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error')); });
      await v.play().catch(() => {});
      for (const t0 = performance.now(); v.currentTime <= 0.2 && performance.now() - t0 < 5000;) await new Promise((r) => setTimeout(r, 100)); // slow to start on a busy container
      return { d: v.duration, played: v.currentTime, start: v.seekable.length ? v.seekable.start(0) : -1 };
    });
    assert(short.d >= 4 && short.d < 7.5 && short.start === 0 && short.played > 0.2, `a 4 s cut starts at 0 and plays: ${JSON.stringify(short)}`);
    for (const n of savedClips) {
      const b = fs.readFileSync(path.join(clips, n));
      assert(b.readUInt32BE(0) === 0x1a45dfa3 && b.includes('V_VP8') && b.includes('A_OPUS') && b.includes(Buffer.from([0x44, 0x89, 0x88])), `${n} is a WebM with video, sound and a duration`);
    }
    await league(leagueData({ t: 610, events: [...leagueData().events, { e: 'multi', t: 609, n: 2, me: true, team: 'ORDER' }] }));
    await wait(pc, () => lpc.toasts().some((t) => /^Clip saved of your multikill: Clip 3\.webm$/.test(t)), null, 'the multikill clip', 15000);
    console.log(`clips: the key (${full.d.toFixed(1)} s), a 4 s cut (${short.d.toFixed(1)} s, plays from 0) and a multikill, all WebM with video and sound`);
    // the gallery: each clip with its picture; keep one, rename one, drag one out, play and cut one, bin one
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="clips"]');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .clip .cname')].map((e) => e.textContent).join() === 'Clip 3,Clip 2,Clip 1', null, 'the gallery');
    assert(await pc.$$eval('#clipGrid .shot', (imgs) => imgs.every((i) => i.src.startsWith('data:image/jpeg;base64,') && i.naturalWidth === 320)), 'a picture of the screen with each clip');
    const card = (n) => `:is(#clipGrid, #savedGrid) .clip:has(.cname:text-is("${n}"))`;
    await wait(pc, () => document.querySelector('#clipGrid .clip .kda img'), null, 'the champion on each card');
    assert.strictEqual(await text(pc, `${card('Clip 3')} .kda`), 'Ahri 3/1/2', 'your champion and K/D/A on the card');
    await pc.click(`${card('Clip 1')} .star`);
    assert(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-clip-favs')).includes('Clip 1.webm')) && (await text(pc, `${card('Clip 1')} .star`)) === '★ Saved', 'saved');
    await wait(pc, () => [...document.querySelectorAll('#savedGrid .cname')].map((e) => e.textContent).join() === 'Clip 1' && [...document.querySelectorAll('#clipGrid .cname')].map((e) => e.textContent).join() === 'Clip 3,Clip 2', null, 'Clip 1 in Saved');
    await pc.click(`${card('Clip 2')} .ren`);
    await pc.fill(`#clipGrid form input`, 'Baron steal');
    await pc.press(`#clipGrid form input`, 'Enter');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Baron steal'), null, 'the clip renamed');
    await pc.dispatchEvent(`${card('Clip 3')} .shot`, 'dragstart');
    assert(await pc.evaluate(() => lpcClient.calls.includes('drag Clip 3.webm')), 'dragged out (to Discord)');
    await pc.click(`${card('Clip 1')} .play`);
    await wait(pc, () => document.getElementById('clipDlg').open && document.getElementById('clipVideo').readyState >= 1 && +document.getElementById('trimTo').max > 8, null, 'the clip playing, with the trimmer');
    // the player's timeline: timestamps from 0:00, pictures along the strip, and the white handles are the cut
    await wait(pc, () => !document.getElementById('tl').hidden && document.querySelector('#tlRuler .tk[data-t]').dataset.t === '0:00' && document.querySelectorAll('#tlRuler .tk[data-t]').length >= 4, null, 'the timestamps under the clip');
    await wait(pc, () => { const d = document.getElementById('tlShots').getContext('2d').getImageData(1100, 30, 1, 1).data; return d[3] > 0; }, null, 'pictures along the strip');
    const box = (sel) => pc.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.x, w: r.width }; });
    const [stripBox, handle] = [await box('#tlStrip'), await box('#tlSel .h.a')];
    await pc.mouse.move(handle.x, handle.y);
    await pc.mouse.down();
    await pc.mouse.move(stripBox.l + stripBox.w / 2, handle.y, { steps: 4 });
    await pc.mouse.up();
    const half = await pc.evaluate(() => [+document.getElementById('trimFrom').value, document.getElementById('clipVideo').duration]);
    assert(Math.abs(half[0] - half[1] / 2) <= 1, `the start handle dragged to the middle: ${half}`);
    await pc.click('#pPlay');
    await wait(pc, () => !document.getElementById('clipVideo').paused && document.getElementById('pPlay').textContent === '❚❚', null, 'played from the bar');
    await pc.click('#pPlay');
    await shot(pc, 'clip-player');
    await pc.$eval('#trimFrom', (el) => { el.value = 2; el.dispatchEvent(new Event('input')); });
    await pc.$eval('#trimTo', (el) => { el.value = 6; el.dispatchEvent(new Event('input')); });
    assert.strictEqual(await text(pc, '#trimFromOut'), '0:02.0');
    await pc.click('#trimSave');
    await wait(pc, () => document.getElementById('trimNote').textContent === 'Saved the cut as “Clip 1 cut”.', null, 'the cut saved');
    const cutLen = await pc.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([window.lastClip], { type: 'video/webm' }));
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error')); });
      return v.duration;
    });
    assert(cutLen > 2.5 && cutLen < 7, `the cut is about 4 s, from the key frame before its start: ${cutLen}`);
    // full screen, or the whole window where it's refused
    await pc.click('#pFull');
    await wait(pc, () => document.fullscreenElement || document.getElementById('player').hasAttribute('data-full'), null, 'full screen');
    await pc.click('#pFull');
    await wait(pc, () => !document.fullscreenElement && !document.getElementById('player').hasAttribute('data-full'), null, 'out of full screen');
    // the editor, in Premade: 2× speed, phone-shaped, a caption, saved as a new clip
    await pc.click('#clipEdit');
    assert(await pc.locator('#edit').isVisible() && (await text(pc, '#clipEdit')) === '🎬 Close the editor', 'the editor opens in Premade');
    await pc.selectOption('#edSpeed', '2');
    await pc.selectOption('#edCrop', '0.5625');
    await pc.fill('#edText', 'Outplayed');
    await wait(pc, () => { const c = document.getElementById('edView'); return c.height > c.width && document.getElementById('clipVideo').playbackRate === 2; }, null, 'the preview at 9:16 and 2×');
    await shot(pc, 'clip-editor');
    await pc.click('#trimSave');
    await wait(pc, () => /^Saved the edit as “Clip 1 cut.*”\.$/.test(document.getElementById('trimNote').textContent), null, 'the edit saved', 30000);
    const edit = await pc.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([window.lastClip], { type: 'video/webm' }));
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error')); });
      return { d: v.duration, w: v.videoWidth, h: v.videoHeight };
    });
    assert(edit.h > edit.w && edit.d > 1 && edit.d < 3.5, `the edit is 9:16 and about 2 s (4 s at 2×): ${JSON.stringify(edit)}`);
    await pc.click('#clipClose');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Clip 1 cut'), null, 'the cut in the gallery');
    assert.strictEqual(await text(pc, `${card('Clip 1 cut')} .kda`), 'Ahri 3/1/2', 'the cut and the edit keep the champion and K/D/A');
    pc.once('dialog', (d) => d.accept());
    await pc.click(`${card('Clip 3')} .bin`);
    await wait(pc, () => ![...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Clip 3'), null, 'Clip 3 binned');
    await pc.click('#clipsFolder');
    assert(await pc.evaluate(() => lpcClient.calls.includes('clips-folder')));
    await shot(pc, 'clips');
    console.log(`clip gallery: pictures, kept, renamed, dragged out, a ${cutLen.toFixed(1)} s cut from the trimmer, binned`);
    // Clip settings, under the gallery; clips by voice: Record my phrase writes down what the mic says, and then saying it
    // saves a clip. (Vosk, in a worker, slow on a busy container.)
    await pc.click('#clipSet > summary');
    assert.strictEqual(await text(pc, '#kClip'), 'Ctrl+Shift+K');
    await pc.click('#phraseRec');
    await wait(pc, () => document.getElementById('voiceNote').textContent === 'Your phrase is “that was sick”. Press Test to try it.', null, 'your phrase recorded', 90000);
    assert.strictEqual(await pc.inputValue('#optClipPhrase'), 'that was sick');
    await pc.check('#optClipVoice');
    await wait(pc, () => lpc.toasts().includes('Clip saved when you said “that was sick”: Clip 6.webm'), null, 'the clip by voice', 60000);
    await wait(pc, () => lpc.checks().bt && lpc.checks().btNote, null, 'the mic (a 16 kHz recording) spotted as phone quality', 60000);
    assert.strictEqual(await text(pc, '#voiceNote'), 'Listening for “Premade, clip that” and “that was sick”.');
    await shot(pc, 'clip-settings');
    await pc.uncheck('#optClipVoice');
    await wait(pc, () => !lpc.voice().loaded && !lpc.voice().ears, null, 'the speech recognition let go');
    console.log('clips by voice: your phrase recorded from the mic (“that was sick”), and saying it saved a clip');

    // ---- after the game: LP, the report, and Stats
    await league(leagueData({ t: 1700, result: 'Win' }));
    await pc.waitForTimeout(700);
    await pc.evaluate(() => lpcClient.emit('key', 'overlay')); // everyone's rank, then hidden for the rest of this game only: the card below still comes
    await pc.waitForTimeout(650);
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false, null, 'the overlay hidden at the end of the game');
    lcu.phase = 'EndOfGame';
    lcu.lpNote = { gameId: GAME, queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 63, leaguePointsDelta: 18 };
    await league({ inGame: false, phase: 'EndOfGame' });
    await wait(pc, () => lpc.toasts().some((t) => /^\+18 LP: Gold II · 63 LP$/.test(t)), null, 'the LP toast');
    await wait(pc, () => lpc.toasts().some((t) => /^Game report ready: you scored \d+ \(MVP\)\. See how you played on the Game page\.$/.test(t)), null, 'the report toast');
    await wait(pc, () => { const a = lpcClient.lastOverlay.after; return !!a && a.title === 'Victory · Ahri' && a.win === true && a.lines[0] === '+18 LP: Gold II · 63 LP' && /^Score \d+ · MVP$/.test(a.lines[1]); }, null, 'the card over League’s end screen');
    const endCard = await pc.evaluate(() => lpcClient.lastOverlay);
    assert(endCard.board === true && endCard.parts.after.ay === 't' && /^\d+ clips? saved$/.test(endCard.after.lines[2]), `the whole screen, with the clips saved in the game: ${JSON.stringify(endCard.after)}`);
    const r = await pc.evaluate((id) => lpc.reports()[id], GAME);
    const badges = r.players.filter((p) => p.badge).map((p) => `${p.name} ${p.badge}`);
    assert.deepStrictEqual(badges, ['Rayan#EUW MVP', 'Shadow#EUW ACE']);
    assert(r.players.every((p) => p.score >= 0 && p.score <= 100) && r.players[0].score === Math.max(...r.players.map((p) => p.score)), 'scores out of 100, yours the best');
    assert(r.gold && r.gold.length >= 1, 'the gold over the game was kept');
    assert.deepStrictEqual(await pc.evaluate(() => lpc.lpLog().map((e) => [e.id, e.delta, e.win])), [[1, -15, false], [GAME, 18, true]]);
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="game"]');
    await wait(pc, () => document.querySelector('#postBox .analysis .duo'), null, 'how you played, on the Game page');
    // how you played, against your usual Ahri games, high elo Ahri players and Zed: what stood out, the table (▲ better
    // and ▼ worse than your usual, else high elo, else Zed), your damage and wards, your gold and CS against Zed, the
    // map with your kill (a green dot) and deaths (red crosses), your deaths and the objectives
    assert.match(await text(pc, '#postHead'), /^Victory · Ahri · 6\/2\/9 · 28 min · Ranked Solo\/Duo · \+18 LP · score 100 \(MVP\) · /);
    const post = (sel) => pc.$$eval(`#postBox ${sel}`, (l) => l.map((e) => e.textContent));
    assert.deepStrictEqual(await post('.analysis > .takeaways li'), ['Your best: CS a minute, 12.7 against your usual 5.3.', 'To work on: skillshots dodged, 20 against 25 for Zed.', 'High elo Ahri players won 40% of 30 games against Zed: a hard matchup.',
      'You died twice before 14 minutes, both in the river.', 'Your first item, Luden’s Companion, was done at 12:00: 2:00 later than high elo Ahri players (10:00).']);
    assert.deepStrictEqual(await pc.$$eval('#postBox .bench tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent + ({ good: ' ▲', bad: ' ▼' }[c.dataset.k] || '')).join(' | '))), [
      ' | This gameAhri, 28 min | Your usual7 games on Ahri | High eloAhri middle, 40 games | Zedtheir middle', 'KDA | 7.5 ▲ | 4.0 | 4.7 | 2.0', 'Deaths | 2 | 3 | 3 | 5',
      'Kill participation | 100% ▲ | — | 58% | 83%', 'Damage a minute | 953 ▲ | 667 | 768 | 635', 'Share of team damage | 43% ▲ | — | 30% | 33%', 'CS a minute | 12.7 ▲ | 5.3 | 6.7 | 8.5',
      'Gold a minute | 494 ▲ | — | 384 | 424', 'Vision score a minute | 0.71 ▲ | 0.60 | 0.96 | 0.71', 'Skillshots hit | 60 ▲ | — | — | 40', 'Skillshots dodged | 20 ▼ | — | — | 25',
      'Allies saved | 2 ▲ | — | — | 0', 'Turret plates | 3 ▲ | — | — | 1', 'Time dead | 1:00 ▲ | — | — | 2:30', 'Gold at 10 minutes against Zed | +500 | +500 | +25 | —',
      'CS at 10 minutes against Zed | +10 | +10 | +5 | —', 'XP at 10 minutes against Zed | −200 | −200 | +100 | —', 'First item done | 12:00 | 12:00 | 10:00 | —']);
    assert.deepStrictEqual(await post('.analysis .timers span'), ['Your damage11% physical · 78% magic · 11% true', 'Wards11 placed · 3 destroyed · 2 control bought', 'Damage to towers4,500', 'Crowd control36 s']);
    assert.deepStrictEqual((await post('.analysis .trends figcaption')), ['Your gold against Zed, ahead above the line: up to 1.5k ahead, never behind.', 'Your CS against Zed: up to 30 CS ahead, never behind.']);
    assert.deepStrictEqual(await pc.$eval('#postBox .fightmap', (cv) => [cv.getAttribute('aria-label'), ...[[7400, 7400], [5500, 9000], [10000, 4500]].map(([x, y]) => [...cv.getContext('2d').getImageData(Math.round(x / 14870 * 480), Math.round((1 - y / 14870) * 480), 1, 1).data].join())]),
      ['Where on Summoner’s Rift you got kills (1), assists (1) and died (2)', '60,207,142,255', '255,107,107,255', '255,107,107,255']);
    assert.deepStrictEqual(await post('.duo ol li'), ['8:10: Zed with Vi, in the river', '12:40: Zed with Vi, in the river']);
    assert.strictEqual(await text(pc, '#postBox .duo .stack .hint'), 'Objectives: your team took 2 dragons, 1 Baron, 3 towers; theirs 1 Rift Herald, 1 tower.');
    assert(await pc.evaluate(() => document.querySelector('#postBody .report').firstElementChild.matches('.rmore')), 'how you played first, then everyone’s scores');
    await shot(pc, 'post-game');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await wait(pc, () => /Gold II · 63 LP/.test(document.getElementById('rankNow').textContent), null, 'the rank');
    assert.deepStrictEqual(await embs(pc, '#rankNow .emb'), ['TFT_Regalia_Gold.png']);
    assert.strictEqual(await text(pc, '#lpToday'), 'Today: 1W 0L, +18 LP.');
    assert(await pc.locator('#lpChart polyline').isVisible(), 'the LP chart');
    assert.match((await pc.$$eval('#lpList li', (l) => l.map((x) => x.textContent)))[0], /Win · \+18 LP · Gold II · 63 LP/);
    // the You tab: trends, with Riot's extra numbers once Riot's copies of your games came in (one every 4 s: four
    // here, as Riot has no copy of the next two, so it stops), comebacks and throws, short and long games, hall of
    // fame, best time to play and the season recap
    await wait(pc, () => /Skillshots hit: 45 on average, 45 in your last 4/.test(document.getElementById('trends').textContent), null, 'Riot’s extra numbers in your trends', 20000);
    assert.deepStrictEqual(await pc.$$eval('#trends figcaption', (l) => l.map((e) => e.textContent)), ['CS a minute: 5.7 on average, 5.3 in your last 5', 'Vision score: 19 on average, 17 in your last 5',
      'Deaths: 3.0 on average, 3.0 in your last 5', 'Skillshots hit: 45 on average, 45 in your last 4', 'Skillshots dodged: 20 on average, 20 in your last 4', 'Allies saved: 2 on average, 2 in your last 4',
      'Turret plates: 3 on average, 3 in your last 4', 'Minutes dead: 1.0 on average, 1.0 in your last 4']);
    assert.strictEqual(await text(pc, '#swingNote'), 'Of your last 20 games on Summoner’s Rift: 1 won from 1k gold or more behind at 15 minutes, and 1 lost from 1k or more ahead.');
    assert.deepStrictEqual(await pc.$$eval('#comebacks > li, #throws > li', (l) => l.map((e) => `${e.querySelector('.tags').textContent}: ${e.querySelector('.gwhat').textContent}`)),
      ['1.3k gold behind at 15 min: Ahri · 5/3/7 · 160 CS · 30 min · Ranked Solo/Duo', '3.8k gold ahead at 15 min: Ahri · 5/3/7 · 160 CS · 30 min · Ranked Solo/Duo']);
    await wait(pc, () => /High elo 75%/.test(document.getElementById('lens').textContent), null, 'high elo players’ win rate by game length');
    assert.strictEqual(await text(pc, '#lensNote'), 'Your win rate by game length in your last 20 games on Summoner’s Rift. Under yours, high elo players’ win rate on that champion in your role.');
    assert.deepStrictEqual(await pc.$$eval('#lens tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent).join(' | '))), ['Champion | Under 25 min | 25 to 35 min | Over 35 min',
      'All champions | 60% of 5 | 58% of 12 | 100% of 3', 'Ahri | —High elo 40% | 75% of 8High elo 75% | —High elo 30%', 'Lux | 60% of 5 | — | —']);
    assert.match((await text(pc, '#fame')).replace(/\s+/g, ' '), /Pentakills ?1: Ahri .*Best KDA ?5\/3\/7 \(4\.0\) on Ahri.*Longest win streak ?6 games in a row/);
    assert((await pc.locator('#times tbody tr').count()) >= 2, 'wins by time of day and day of the week');
    await pc.click('#recapBtn');
    await wait(pc, () => !document.getElementById('recapSave').hidden && document.getElementById('recapSave').href.startsWith('data:image/png'), null, 'the season recap');
    // your profile with today's LP; and the profile link: your rank, record and top champions on a page anyone can
    // open, all of it in the link
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => /\+18 LP/.test(document.getElementById('proRanks').textContent), null, 'today’s LP on your profile');
    assert.deepStrictEqual((await proRanks())[0], 'Solo/Duo|Gold II|63 LP · 31W 25L · 55% · today 1W 0L, +18 LP|Peak this season: Gold I');
    await pc.click('#profileBtn');
    await wait(pc, () => !document.getElementById('profileOut').hidden && /^http:\/\/127\.0\.0\.1:8081\/profile\.html#[\w-]+$/.test(document.getElementById('profileLink').value), null, 'the profile link');
    const plink = await pc.inputValue('#profileLink');
    const [vctx, viewer] = await context(browser, { phone: true }); // a friend opens it on their phone
    await viewer.goto(plink);
    await wait(viewer, () => !document.getElementById('top').hidden && document.querySelectorAll('#champs li').length, null, 'the profile page');
    const pt = (sel) => viewer.$$eval(sel, (l) => l.map((e) => e.textContent));
    assert.strictEqual(await viewer.title(), 'Rayan#EUW · League profile');
    assert.deepStrictEqual(await pt('#ranks .tile'), ['Solo/DuoGold II63 LP · 55% of 56', 'FlexUnranked']);
    await wait(viewer, () => document.querySelectorAll('#ranks img').length === 1, null, 'Riot’s emblem for the rank');
    assert.strictEqual(await viewer.getAttribute('#ranks img', 'src'), 'https://ddragon.leagueoflegends.com/cdn/1.1/img/tft-regalia/TFT_Regalia_Gold.png');
    assert.match((await pt('#champs li'))[0], /^Ahri8 games · [\d.]+ \/ [\d.]+ \/ [\d.]+75%$/);
    assert.match(await viewer.getAttribute('#champs li img', 'src'), /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/1\.1\/img\/champion\/Ahri\.png$/);
    assert.match((await pt('#nums .tile'))[0], /^Record\d+W \d+L\d+% won$/);
    assert((await pt('#fame .tile')).some((t) => /^Pentakills1$/.test(t)), 'the pentakill');
    await viewer.goto('about:blank');
    await viewer.goto(plink.slice(0, -20));
    await wait(viewer, () => !document.getElementById('bad').hidden, null, 'a cut-off link said so');
    await vctx.close();
    console.log(`profile link: ${plink.length} characters, opened on a phone`);
    await shot(pc, 'profile');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await shot(pc, 'stats-you');
    // the Champions tab: your champions, nemeses and allies, the collection, patch changes, and a champion's page
    await pc.click('.tab[data-tab="champs"]');
    await wait(pc, () => !document.getElementById('champTable').hidden, null, 'the champion table');
    assert.match((await pc.$$eval('#champRows tr', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' '))))[0], /^Ahri 8 6W 2L · 75% 4\.0$/);
    assert.deepStrictEqual(await pc.$$eval('#nemeses .champ', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' '))), ['Darius You lost 3 of 4']);
    assert.deepStrictEqual(await pc.$$eval('#allies .champ b', (bs) => bs.map((b) => b.textContent)), ['Garen', 'Lee Sin', 'Jinx', 'Thresh']);
    assert.strictEqual(await text(pc, '#collNote'), 'Played 5 of 11 champions, won with 4. Gold rims are champions you won with.');
    assert.strictEqual(await pc.locator('#collection img[data-s="won"]').count(), 4);
    await wait(pc, () => /Health 590 → 600/.test(document.getElementById('patchList').textContent), null, 'patch changes');
    assert.match(await text(pc, '#patchHead'), /^Patch 1\.1 against 1\.0 for the champions you play most/);
    assert.match((await text(pc, '#patchList')).replace(/\s+/g, ' '), /^Ahri Health 590 → 600 Q \(Orb of Deception\) cooldown 7 → 6 Lux No changes/);
    await pc.click('#champRows tr:first-child .champlink');
    await wait(pc, () => document.getElementById('champDlg').open && /Your build/.test(document.getElementById('champDlgBody').textContent) && /Worst against/.test(document.getElementById('champDlgBody').textContent), null, 'Ahri’s page');
    const champPage = (await text(pc, '#champDlgBody')).replace(/\s+/g, ' ');
    for (const re of [/^8 games in your last 20: 6W 2L \(75%\), KDA 4\.0\. Mastery 7, 120,000 points\./, /By role Middle: 8 games, 6 won/i,
      /Your runes Electrocute, Taste of Blood, Eyeball Collection, Treasure Hunter, Manaflow Band, Transcendence \(Domination with Sorcery\): in 8 of your 8 games with runes on it\./i,
      /Your build \(from 8 games\) Start Doran’s Ring Health Potion First items, in order Luden’s Companion Zhonya’s Hourglass Rabadon’s Deathcap Boots Sorcerer’s Shoes/i,
      /Skill order Your skill order on Ahri \(from 8 games\): start Q, W, E, then max Q, then W, then E\./i, /Against your lane opponents Zed: 6W 2L/i,
      /Your matchup notes Against Zed: Respect his level 6\. Ward the side bushes\. Delete/i, /Patch 1\.1 Health 590 → 600 Q \(Orb of Deception\) cooldown 7 → 6$/i,
      /In high elo Role\s.*Ahri middle won 55% of 40 Challenger and Grandmaster games on patch 25\.20\. Runes: Electrocute, Taste of Blood, Eyeball Collection, Treasure Hunter, Manaflow Band, Scorch \(Domination with Sorcery\): 63% won in 30 games\. Spells: Flash and Ignite\. Start Doran’s Ring Health Potion First items, in order Luden’s Companion Rabadon’s Deathcap Zhonya’s Hourglass Boots Sorcerer’s Shoes Also Black Cleaver Skill order: start Q, E, W, then max Q, then E, then W\. Best against: Lux, 67% won in 15 games \(\+150 gold at 10\); Garen, 53% won in 15 games \(\+50 gold at 10\)\. Worst against: Zed, 40% won in 30 games \(−200 gold at 10\)\. Your runes/i]) assert.match(champPage, re);
    assert.deepStrictEqual(await pc.$$eval('#champDlgBody select option', (o) => o.map((x) => [x.value, x.textContent])), [['MIDDLE', 'Middle (40 games)'], ['TOP', 'Top (3 games)']]);
    await pc.selectOption('#champDlgBody select', 'TOP');
    await wait(pc, () => /Not enough Challenger and Grandmaster games with Ahri top counted yet/.test(document.getElementById('champDlgBody').textContent), null, 'too few games at the top');
    assert(highAsked.includes('103/') && highAsked.includes('103/TOP'), 'Ahri’s most played role, then the top');
    await shot(pc, 'champion-page');
    await pc.click('#champDlgClose');
    // the Games tab: match history, each report with its replay, your laning and when everyone bought each item
    await pc.click('.tab[data-tab="games"]');
    assert.strictEqual(await pc.locator('#matches li').count(), 20);
    await pc.click('#matches li:first-child summary');
    await wait(pc, () => document.querySelector('#matches li:first-child .report'), null, 'the report in match history');
    const first = '#matches li:first-child';
    await wait(pc, () => document.querySelector('#matches li:first-child .replay').textContent === 'Download the replay', null, 'the replay button');
    await pc.click(`${first} .replay`);
    await wait(pc, () => document.querySelector('#matches li:first-child .replay').textContent === 'Watch the replay', null, 'the replay downloaded');
    await pc.click(`${first} .replay`);
    await until(() => callsTo(/^\/lol-replays\/v1\/rofls\/5550001\/watch$/, 'POST').length === 1, 'the replay started');
    assert.deepStrictEqual(callsTo(/^\/lol-replays\/v1\/rofls\/5550001\/download$/, 'POST')[0][2], { componentType: 'replay-button_match-history' });
    await wait(pc, () => document.querySelector('#matches li:first-child .laning tbody tr') && document.querySelector('#matches li:first-child .buyrow'), null, 'the laning and the item timeline');
    assert.match(await text(pc, `${first} .laning h3`), /^Your laning against Zed$/i);
    assert.deepStrictEqual(await pc.$$eval(`${first} .laning tbody tr`, (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' '))),
      ['At 10 minutes 80 vs 70 (+10) 4.0k vs 3.5k (+500) 5.0k vs 5.2k (−200)', 'At 15 minutes 120 vs 105 (+15) 6.0k vs 5.3k (+750) 7.5k vs 7.8k (−300)']);
    assert.deepStrictEqual(await pc.$$eval(`${first} .buyrow[data-me] .buy`, (bs) => bs.map((b) => `${b.querySelector('img').alt} ${b.querySelector('time').textContent}`)),
      ['Doran’s Ring 0:25', 'Sorcerer’s Shoes 8:00', 'Luden’s Companion 12:00', 'Zhonya’s Hourglass 20:00', 'Rabadon’s Deathcap 28:00']);
    assert.strictEqual(await pc.locator(`${first} .buyrow`).count(), 10);
    // copied from a report into League: Zed's runes as the app's own page, with the shards from Riot's copy of the game,
    // then yours over it; your items as an item set for Ahri, in the order you bought them
    const copied = lcu.calls.length;
    await pc.click(`${first} button[aria-label="Save Shadow’s runes on Zed in League"]`);
    await wait(pc, () => lpc.toasts().includes('Shadow’s runes on Zed are your rune page “Copy: Shadow’s Zed” in League.'), null, 'Zed’s runes in League');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', copied).map((c) => c[2]), [{ name: 'Copy: Shadow’s Zed', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8237, 5005, 5008, 5011], current: true }]);
    await pc.click(`${first} button[aria-label="Save Rayan’s runes on Ahri in League"]`);
    await wait(pc, () => lpc.toasts().includes('Rayan’s runes on Ahri are your rune page “Copy: Rayan’s Ahri” in League.'), null, 'your runes over it');
    assert.deepStrictEqual([callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', copied).length, callsTo(/^\/lol-perks\/v1\/pages\/51$/, 'PUT', copied).length, callsTo(/currentpage$/, 'PUT', copied).map((c) => c[2])], [1, 1, [51]]);
    assert.strictEqual(lcu.pages.find((x) => x.id === 51).name, 'Copy: Rayan’s Ahri');
    await pc.click(`${first} button[aria-label="Save Rayan’s items on Ahri in League"]`);
    await wait(pc, () => lpc.toasts().includes('Rayan’s items on Ahri are in League’s shop as “Rayan’s Ahri”.'), null, 'your items in League');
    const copySet = lcu.itemSets.itemSets.find((x) => x.uid === 'lpc-copy-103');
    assert.deepStrictEqual([copySet.title, copySet.associatedChampions, copySet.associatedMaps, copySet.blocks.map((b) => [b.type, b.items.map((x) => +x.id)])],
      ['Rayan’s Ahri', [103], [11], [['Start', [1056, 2003]], ['Then, in order', [3020, 6655, 3157, 3089]], ['Ended the game with', [3020, 6655]]]]);
    assert(lcu.itemSets.itemSets.some((x) => x.uid === 'lpc-103'), 'the app’s own Ahri set kept');
    await pc.click('#matches li:nth-child(2) summary');
    await wait(pc, () => document.querySelector('#matches li:nth-child(2) .report tbody tr'), null, 'an older game’s report, from Riot');
    await wait(pc, () => document.querySelector('#matches li:nth-child(2) .laning h3'), null, 'laning in a game with no lanes');
    assert.match(await text(pc, '#matches li:nth-child(2) .laning h3'), /^Your laning against Zed$/i);
    assert(callsTo(/\/lol-match-history\/v1\/games\/9001$/).length >= 1);
    await shot(pc, 'stats');
    // the export: your match history as a spreadsheet file
    const [dl] = await Promise.all([pc.waitForEvent('download'), pc.click('#exportBtn')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
    assert(dl.suggestedFilename().startsWith('Match history ') && csv[0] === '\ufeffDate,Champion,Queue,Result,Kills,Deaths,Assists,CS,Minutes,Game ID' && csv.length === 21, `the spreadsheet: ${csv.slice(0, 2)}`);
    assert.match(csv[1], /^\d{4}-\d\d-\d\d \d\d:\d\d,Ahri,Ranked Solo\/Duo,Win,5,3,7,160,30,5550001$/);
    await pc.evaluate(() => lpc.endGame());
    await wait(pc, () => document.querySelector('#games li .report'), null, 'the report in the voice game history');
    assert.match(await pc.locator('#games li').first().innerText(), /\+18 LP/);
    assert.strictEqual(await text(pc, '#talkWin'), 'Talk and win: when the room talked more than usual, you won 2 of 2 games (100%). When it was quieter, 0 of 2 (0%).');
    console.log(`after the game: +18 LP, the report (${badges.join(', ')}) with Riot's extra numbers and high elo, how you played on the Game page, Stats with the LP chart, trends, comebacks and throws, short or long games, hall of fame, the recap, champion pages, match history and reports with the replay, laning and buys, runes and items copied into League`);
    // the Players tab: look anyone up, and follow their rank
    await pc.click('.tab[data-tab="players"]');
    await pc.fill('#lookupId', 'Sniper#EUW');
    await pc.click('#lookupForm button');
    await wait(pc, () => /Gold II/.test(document.getElementById('lookupOut').textContent), null, 'the player looked up');
    assert.match((await text(pc, '#lookupOut tbody tr')).replace(/\s+/g, ' '), /^Sniper#EUW Level 30 Gold II · 45 LP · 55% of 55 Last 20: 16W 4L .*Plays most: Caitlyn 20 \(80%\) · Mastery: Garen 5k.*Maybe a smurf: level 30, 80% won/);
    await pc.click('#lookupOut button');
    await wait(pc, () => document.querySelectorAll('#watchList li').length === 1, null, 'Sniper followed');
    await pc.fill('#watchId', 'Axe#EUW');
    await pc.click('#watchForm button');
    await wait(pc, () => document.querySelectorAll('#watchList li').length === 2, null, 'Axe followed');
    lcu.lp.enemy4 = 61;
    await pc.evaluate(() => lpc.watchNow());
    await wait(pc, () => lpc.toasts().includes('Sniper: +16 LP, now Gold II · 61 LP'), null, 'the LP popup');
    assert.match((await text(pc, '#watchList li:first-child')).replace(/\s+/g, ' '), /^Sniper#EUW Gold II · 61 LP · 55% of 55 · \+16 LP today Unfollow$/);
    assert(await pc.locator('#watchList li:first-child polyline').count(), 'a line of their LP');
    assert.deepStrictEqual(await embs(pc, '#watchList li:first-child .emb'), ['TFT_Regalia_Gold.png']);
    await shot(pc, 'stats-players');
    console.log('players: Sniper looked up (a smurf?) and followed with Axe, +16 LP noticed');
    // a friend in the room: their rank and your record together on their card, and Watch while they play
    const room = await pc.evaluate(() => lpc.room());
    const [fctx, fr] = await context(browser, { version: '1.7.0' });
    await fctx.exposeFunction('fakeLcu', friendLcu);
    await fctx.addInitScript(() => { localStorage.setItem('lpc-name', 'Fren'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, clips: false })); });
    await fr.goto(URL_);
    await wait(fr, () => window.lpc, null, 'the friend’s page');
    await fr.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    await fr.click('.nav[data-view="voice"]');
    await fr.fill('#code', room);
    await fr.click('#joinBtn');
    await pc.click('.nav[data-view="voice"]');
    await wait(pc, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Platinum IV · 12 LP · With you: 13W 7L'), null, 'the friend’s rank and your record together');
    await wait(fr, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Gold II · 63 LP, +18 today'), null, 'your rank on the friend’s card for you');
    assert(await pc.locator('#players .watch').isHidden(), 'no Watch while the friend isn’t playing');
    await fr.fill('#chatText', 'gg wp');
    await fr.press('#chatText', 'Enter');
    await wait(phone, () => /Fren\s*gg wp/.test(document.getElementById('chatLog').textContent), null, 'the friend’s message on the phone');
    assert((await embs(pc, '#players .plol .emb')).includes('TFT_Regalia_Platinum.png'), 'the emblem on the friend’s card');
    await fr.evaluate((d) => lpcClient.emit('league', d), leagueData({ me: { champ: 'Garen', champName: 'Garen', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 } }));
    await wait(pc, () => { const b = document.querySelector('#players .watch'); return b && !b.hidden; }, null, 'Watch on the friend’s card');
    await pc.click('#players .watch');
    await wait(pc, () => lpc.toasts().includes('League is opening Fren’s game. Spectating runs a few minutes behind.'), null, 'spectating the friend');
    assert.deepStrictEqual(callsTo(/^\/lol-spectator\/v1\/spectate\/launch$/, 'POST')[0][2], { allowObserveMode: 'ALL', dropInSpectateGameId: 'Friend', gameQueueType: '', puuid: 'ally1', spectatorKey: '' });
    // room games with League's ranks: the balanced teams show everyone's Solo/Duo rank, and role roulette's role goes
    // into League's lobby in one click
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="prox"]'); // Balance teams and Role roulette are on Proximity voice
    await pc.click('#teamsBtn');
    await wait(pc, () => { const t = document.getElementById('teamsBox').textContent; return /Rayan \(you\): Gold II · 63 LP/.test(t) && /Fren: Platinum IV · 12 LP/.test(t) && /about Gold II/.test(t) && /about Platinum IV/.test(t); }, null, 'the teams with ranks');
    await wait(fr, () => /Rayan: Gold II · 63 LP/.test(document.getElementById('teamsBox').textContent), null, 'the teams on the friend’s page');
    assert.deepStrictEqual((await embs(pc, '#teamsBox .emb')).sort(), ['TFT_Regalia_Gold.png', 'TFT_Regalia_Platinum.png']);
    lcu.lobby = { localMember: { isLeader: true }, gameConfig: { isCustom: false, queueId: 400, showPositionSelector: true }, members: [{}, {}] };
    lcu.phase = 'Lobby';
    await league({ inGame: false, phase: 'Lobby' });
    await pc.click('#rolesBtn');
    await wait(pc, () => !document.getElementById('rolesSet').hidden, null, 'Set it in League’s lobby');
    const role = await pc.evaluate(() => lpc.roles().map[lpc.slot()]), put0 = lcu.calls.length;
    await pc.click('#rolesSet');
    await until(() => callsTo(/position-preferences$/, 'PUT', put0).length === 1, 'the role set in League');
    assert.deepStrictEqual(callsTo(/position-preferences$/, 'PUT', put0)[0][2], { firstPreference: role, secondPreference: 'FILL' });
    const ROLE = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Middle', BOTTOM: 'Bottom', UTILITY: 'Support' }[role];
    await wait(pc, (r) => lpc.toasts().includes(`League: ${r} first, Fill second.`), ROLE, 'the role toast');
    console.log(`room games: teams with ranks, and ${ROLE} set in League’s lobby`);
    await shot(pc, 'room-friend');
    await fctx.close();
    console.log('a friend in the room: Platinum IV, 13W 7L together, and Watch opens their game');

    // ---- another champ select: over the app's own rune page, Flash on F
    await preSettings();
    await pc.selectOption('#optFlash', 'F');
    lcu.lpNote = null;
    const cs2 = lcu.calls.length;
    champSelect(778, { championId: 99 });
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await wait(pc, () => /Runes: Riot’s page for Lux/.test(document.getElementById('runesNote').textContent), null, 'the second runes', 20000);
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', cs2).length, 0, 'no second page');
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', cs2).length, 1);
    assert.strictEqual(callsTo(/currentpage$/, 'PUT', cs2)[0][2], 50);
    assert.strictEqual(lcu.pages.find((x) => x.id === 50).name, 'LPC Lux');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH').pop()[2], { spell1Id: 14, spell2Id: 4 });
    // your own usual rune page for Lux instead of Riot's, from its button
    await wait(pc, () => !document.getElementById('runesOther').hidden, null, 'the button for your own runes');
    await pc.click('#runesOther');
    await wait(pc, () => document.getElementById('runesNote').textContent === 'Runes: your own page for Lux from 5 of your games (Arcane Comet). Spells: Ignite on D, Flash on F.', null, 'your own runes');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT').pop()[2].selectedPerkIds, [8229, 8226, 8210, 8237, 8139, 8135, 5008, 5008, 5002]);
    assert.strictEqual(await text(pc, '#runesOther'), 'Use Riot’s recommended runes instead');
    console.log('second champ select: the app’s rune page reused for Lux, Flash on F, then your own usual page');
    // auto hover: your first pick that's free and fits your role, and your first free ban, once each
    await preSettings();
    await pc.fill('#optHoverPicks', 'Zed, Ahri, Ahrii');
    await pc.press('#optHoverPicks', 'Tab');
    assert.strictEqual(await text(pc, '#hoverNote'), 'Not a champion: Ahrii.');
    await pc.fill('#optHoverPicks', 'Zed, Ahri');
    await pc.press('#optHoverPicks', 'Tab');
    await pc.fill('#optHoverBans', 'Garen, Darius');
    await pc.press('#optHoverBans', 'Tab');
    assert.strictEqual(await text(pc, '#hoverNote'), 'The first one that’s free and fits your role gets hovered; you still lock in yourself.');
    lcu.phase = 'None';
    await league({ inGame: false, phase: 'None' });
    await pc.waitForTimeout(1500);
    const since = lcu.calls.length, hovers = () => callsTo(/^\/lol-champ-select\/v1\/session\/actions\/\d+$/, 'PATCH', since);
    champSelect(779);
    lcu.cs.theirTeam[2].championId = 238; // Zed's taken, and Garen is Friend's
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await until(() => hovers().length === 2, 'auto hover');
    assert.deepStrictEqual(hovers().map(([, p, b]) => [p.split('/').pop(), b.championId]), [['3', 122], ['8', 103]]);
    await pc.waitForTimeout(2500);
    assert.strictEqual(hovers().length, 2, 'once each');
    console.log('auto hover: Darius banned for you (Garen is Friend’s), Ahri hovered (Zed is taken)');
    // ARAM: the bench, best for you first (your games and mastery), taken with a click; then a reroll
    lcu.phase = 'None';
    await league({ inGame: false, phase: 'None' });
    await pc.waitForTimeout(1500);
    champSelect(780, { championId: 86 });
    Object.assign(lcu.cs, { actions: [], benchEnabled: true, allowRerolling: true, rerollsRemaining: 1, benchChampions: [{ championId: 37, isPriority: false }, { championId: 103, isPriority: false }] });
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="pregame"]');
    const BENCH = [['Ahri You: 8 games, 75% won · Mastery 7', 'false'], ['Garen Yours now · You: 4 games, 25% won · Mastery 4', 'true'], ['Sona You: 3 games, 100% won', 'false']];
    await wait(pc, (b) => !document.getElementById('rerollBtn').hidden && b === JSON.stringify([...document.querySelectorAll('#bench .champ')].map((e) => [e.innerText.replace(/\s+/g, ' '), e.getAttribute('aria-pressed')])), JSON.stringify(BENCH), 'the bench'); // as shown: innerText needs it on screen
    assert.strictEqual(await text(pc, '#rerollBtn'), 'Reroll (1 left)');
    await pc.click('#bench .champ:first-child');
    await until(() => callsTo(/bench\/swap\/103$/, 'POST').length === 1, 'Ahri taken from the bench');
    await wait(pc, () => document.querySelector('#bench .champ[aria-pressed="true"] b').textContent === 'Ahri', null, 'Ahri yours');
    await pc.click('#rerollBtn');
    await until(() => callsTo(/my-selection\/reroll$/, 'POST').length === 1, 'a reroll');
    await wait(pc, () => document.getElementById('rerollBtn').hidden && /You’re playing Jinx/.test(document.getElementById('csTurn').textContent), null, 'no rerolls left');
    // and on the phone: the bench, Garen taken back from it, and a reroll
    await wait(phone, () => document.getElementById('turn').textContent === 'You’re playing Jinx.' && [...document.querySelectorAll('#bench button')].map((b) => b.textContent).join() === 'Sona,Garen' && document.getElementById('reroll').hidden, null, 'the bench on the phone');
    await phone.click('#bench button:has-text("Garen")');
    await until(() => callsTo(/bench\/swap\/86$/, 'POST').length === 1, 'Garen taken from the bench on the phone');
    lcu.cs.rerollsRemaining = 1; // another one earned
    await wait(phone, () => document.getElementById('reroll').textContent === 'Reroll (1 left)' && !document.getElementById('reroll').hidden, null, 'a reroll on the phone');
    await phone.click('#reroll');
    await until(() => callsTo(/my-selection\/reroll$/, 'POST').length === 2, 'a reroll from the phone');
    lcu.cs = null;
    lcu.phase = 'None';
    await league({ inGame: false, phase: 'None' });
    console.log('ARAM: the bench with Ahri first, taken with a click, then a reroll; on the phone too');
    // Clip anywhere: outside a League game the clip key saves a "Screen clip", listed on the Recording page, not on Clips
    await pc.click('.nav[data-view="record"]');
    await pc.check('#optClipsAll');
    await wait(pc, () => lpc.clips().on && lpc.clips().head, null, 'the screen kept outside League', 30000);
    await pc.evaluate(() => lpcClient.emit('key', 'clip'));
    await wait(pc, () => [...document.querySelectorAll('#anyGrid .cname')].some((e) => /^Screen clip /.test(e.textContent)), null, 'the clip on the Recording page', 30000);
    assert(!(await pc.$$eval('#clipGrid .cname', (e) => e.some((x) => /^Screen clip /.test(x.textContent)))), 'not on the Clips page');
    await pc.uncheck('#optClipsAll');
    await wait(pc, () => !lpc.clips().on, null, 'Clip anywhere off lets the screen go');
    console.log('clip anywhere: the clip key outside League saved a Screen clip, listed on the Recording page');
    await pc.click('.nav[data-view="settings"]');
    await shot(pc, 'settings');
    // the patch check, the performance meter and test recordings
    await wait(pc, () => /^Patch check for League 14\.20: League’s game data ✓, champ select ✓, match history ✓/.test(document.getElementById('patchNote').textContent), null, 'the patch check');
    await wait(pc, () => /^Right now the app uses 3\.2% of your CPU and 412 MB of memory\. Recording for clips: (on|only during a game)\. Smart noise removal: off\.$/.test(document.getElementById('perf').textContent), null, 'the performance meter');
    await pc.check('#optRecord');
    await pc.click('#recordingsBtn');
    assert(await pc.evaluate(() => lpcClient.calls.includes('record false') && lpcClient.calls.includes('record true') && lpcClient.calls.includes('recordings-folder')), 'test recordings on, and their folder');
    assert(await pc.evaluate(() => document.getElementById('optWithLeague').disabled), 'Start with League waits for app 1.18');
    // your version in the status bar, and What's new from it
    assert.strictEqual(await text(pc, '#sbVersion'), 'App 1.11.0 (2.0.0 is out)');
    await pc.click('#sbVersion');
    assert(await pc.evaluate(() => document.getElementById('newsDlg').open), 'What’s new');
    assert.match(await text(pc, '#newsList'), /^October 31: RE4 co-op with your friends\s+RE4 co-op: Set up makes this PC ready to host[\s\S]*October 31: an RE4 co-op page[\s\S]*October 30: rooms friends can always find, and instant invites\s+Open rooms no longer drop off the Rooms page[\s\S]*October 29: “Premade, clip that” anywhere\s+Clip anywhere, on the Recording page[\s\S]*October 29: record your screen, like OBS\s+A new Recording page in the menu[\s\S]*October 29: Aion 2 DPS tracker, timers, a daily checklist and a gear checkup\s+A DPS tracker on the Aion 2 page[\s\S]*October 29: Premade is now a place to hang out, with League on its own page\s+Premade now opens on Rooms[\s\S]*October 28: voice and screens for friends who couldn’t connect\s+Friends whose home routers can’t reach each other[\s\S]*October 28: smoother screen shares for everyone watching\s+Each friend now gets your screen at the size they watch it[\s\S]*October 28: a friend’s screen share no longer stays stuck loading\s+When your screen’s connection to a friend broke[\s\S]*October 28: no more muffled sound in voice chat\s+A Bluetooth headset plays everything in phone quality[\s\S]*October 28: friends no longer hear themselves on your screen share\s+Your screen share’s sound used to pick up[\s\S]*October 28: screen share stays sharp\s+A room screen share no longer turns blurry[\s\S]*October 27: your main screen shared by itself\s+Share my screen by itself now shares your main screen[\s\S]*October 27: Remote help\s+Remote control is now its own page[\s\S]*October 27: Aion 2\s+A new Aion 2 page[\s\S]*October 27: faster Mayhem augment ratings\s+ARAM: Mayhem’s augment cards are read faster[\s\S]*October 23: Mayhem ratings inside the cards\s+Mayhem pick rates now sit inside each augment card near its bottom edge[\s\S]*October 23: a dedicated ARAM: Mayhem overlay\s+Premade detects ARAM: Mayhem from League’s game mode or queue[\s\S]*October 23: Mayhem rates use your champion\s+The overlay now matches champion pick-rate data by Riot ID or display name[\s\S]*October 23: smaller Mayhem ratings on the augment cards\s+Mayhem ratings now sit higher on the augment cards and take up less space[\s\S]*October 23: Mayhem augment rates show zero clearly\s+When ARAM: Mayhem has no recorded pick rate for an augment on your champion[\s\S]*October 23: share any screen, and cleaner Mayhem overlay ratings\s+In a voice room, Share screen or app lets you share an open app window or an entire display[\s\S]*October 23: remembered voice controls and easier room and screen sharing[\s\S]*October 22: clearer voice recovery, room status and louder voices\s+Voice cards now show when someone is reconnecting[\s\S]*October 22: Windows voice invites and open rooms\s+Voice-room invites can now arrive as Windows notifications[\s\S]*October 22: Discord audio filtered from screen shares\s+In the Windows app, screen-share sound now keeps game and other system audio while excluding the Discord desktop app and its child processes[\s\S]*October 22: screen-share sound controls and voice recovery\s+Screen-share sound is now off by default[\s\S]*October 22: sound with screen share, and sharing as you join\s+A shared screen can come with its sound[\s\S]*October 22: a clip editor in Premade, and K\/D\/A on your clips\s+Open in Editor, in the clip player[\s\S]*October 22: past voice sessions\s+Past sessions, under the chat[\s\S]*October 22: match videos as cards, and highlight icons\s+Each match video on the Clips page is now a card[\s\S]*October 22: only friends who are online\s+Friends on the Voice page lists only friends with Premade online now[\s\S]*October 22: room chat like Discord\s+Send pictures, GIFs and videos in the room chat[\s\S]*October 22: friends with League closed, and who’s online\s+Friends on the Voice page now keeps your League friends[\s\S]*October 22: ARAM: Mayhem pick rates from arammayhem\.com\s+The bars on ARAM: Mayhem’s augment cards now show[\s\S]*October 21: a new video player, and sharper, smoother recordings\s+Clips and match videos now play in a new player[\s\S]*October 21: who has Premade, in Settings\s+Whoever runs Premade can now see who has it right in Settings[\s\S]*October 21: more ARAM: Mayhem games for the augment pick rates\s+Premade now also sends[\s\S]*October 21: watch each other’s screens in the room\s+While you share your screen, everyone in your room[\s\S]*October 21: your friends, and invites to your room\s+Your group, on the Voice page, has a Friends tab[\s\S]*October 21: your League screen shared by itself\s+In the desktop app your League screen is now shared[\s\S]*October 21: overlay fixes\s+Hiding the overlay with Alt\+V now lasts for that game only[\s\S]*October 21: a voice for your callouts\s+Spoken callouts can use any voice[\s\S]*October 21: see and change your build\s+What to buy next no longer suggests[\s\S]*October 21: Premade starts with League\s+Tick “Start with League”[\s\S]*October 21: every match recorded, with its highlights\s+The Clips page has Whole matches and highlights[\s\S]*October 20: righter callouts, and Alt\+V for the overlay\s+Alt\+V now shows everyone’s rank[\s\S]*October 20: augment ratings for TFT and ARAM: Mayhem\s+TFT’s augment cards now show each augment’s tier[\s\S]*October 20: Premade moves to GitHub\s+Premade’s site is now at rayn16\.github\.io\/Premade[\s\S]*October 20: ratings on TFT’s augment cards\s+When you pick an augment in a TFT game[\s\S]*October 20: your chance to win in a surrender vote\s+When a surrender vote starts, your team’s chance to win pops up[\s\S]*October 20: champ select on your phone\s+After you accept a match, the phone remote shows champ select[\s\S]*October 20: practice tools, whole games on video and champion colours\s+Combo trainer: in Practice Tool[\s\S]*October 20: your group, League chat and Discord\s+Your group, on the Voice page: make a squad[\s\S]*October 20: builds at your rank, one-tricks and pros\s+Builds at your rank: our server now counts Emerald and Diamond games[\s\S]*October 20: help while you’re dead, and your chance to win\s+While you’re dead on Summoner’s Rift[\s\S]*October 20: dodge, an avoid list and ladder places\s+Dodge leaves champ select in one click[\s\S]*October 20: timers, a coach and customs\s+Enemy timers: say “Premade, mid flash”[\s\S]*October 20: TFT helpers\s+A roll calculator on TFT[\s\S]*October 20: who has Premade\s+Our server now keeps a list of who has Premade[\s\S]*October 20: the Overlay page\s+The overlay has a page of its own[\s\S]*October 20: a TFT page\s+TFT has a page of its own[\s\S]*October 20: the Features page\s+Features, the new page at the bottom of the menu[\s\S]*October 20: minimap reminders and their jungler\s+New to League\? The Overlay page can remind you[\s\S]*October 20: voice fixes\s+Unplug or switch your headset mid-game[\s\S]*October 20: room passwords, host mutes and new modes\s+Locked rooms are safer[\s\S]*October 20: Profile and Stats\s+Pick a rank goal in Stats > You[\s\S]*October 20: app 1\.13 and the test version\s+Settings > App has “Use the test version”[\s\S]*October 20: more in your game reports and trends\s+Game reports have Riot’s extra numbers for everyone[\s\S]*October 20: champ select helpers\s+The draft board ranks safe blind picks higher[\s\S]*October 20: phone notifications, chat on your phone and a CS drill\s+The phone remote can tell you when a match is found[\s\S]*October 20: the minimap tracker\s+Premade finds your minimap on the left side[\s\S]*October 20: clips by voice\s+Say “Premade, clip that” in a game[\s\S]*October 19: a Custom theme, App size and a new logo\s+Settings > Look has a Custom theme[\s\S]*October 19: app 1\.11, your lobby on Pregame\s+Pregame runs your lobby now[\s\S]*October 19: red and black, the draft, past ranks and how you played\s+Premade is red and black now[\s\S]*October 19: everyone’s rank on the loading screen, and tips for your lane\s+On League’s loading screen the overlay shows all ten players[\s\S]*October 19: queues, TFT and live games\s+Profile has a tab for each queue[\s\S]*October 19: older games on Profile\s+Profile lists your last 20 games[\s\S]*October 19: Pregame\s+Pregame is a new page in the app[\s\S]*October 19: voice in one place\s+Room, Players and Map are now one Voice page[\s\S]*October 19: high elo runes and builds\s+In champ select you now get the most popular runes[\s\S]*October 19: your League profile first\s+Premade now opens on your League profile[\s\S]*October 19: League Proximity Chat is now Premade\s+Same app, new name[\s\S]*October 19: profile link and server stats\s+Profile link on the Stats page[\s\S]*October 19: room games\s+Room games on the Voice page[\s\S]*October 19: League stats\s+Champ select: your own runes[\s\S]*October 19: app 1\.7[\s\S]*Clips page/i);
    assert.strictEqual(await text(pc, '#newsVersion'), 'You have: App 1.11.0 (2.0.0 is out).');
    await pc.click('#newsClose');
    console.log('patch check, performance meter, test recordings, your version and What’s new');
    // patch 26.21: Riot keeps replay downloads for League's own match history. A download League refuses says where to
    // get it and marks the patch check; a replay League won't offer says so on its button
    lcu.version = '16.21.612.1';
    lcu.replayBlocked = true;
    lcu.replay[9003] = 'error';
    await pc.evaluate(() => lpc.patchNow());
    await wait(pc, () => /^Patch check for League 16\.21: .*, replays \(not seen yet\)\.$/.test(document.getElementById('patchNote').textContent), null, 'the new patch');
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="stats"]');
    await pc.click('.tab[data-tab="games"]');
    await pc.click('#matches li:nth-child(3) summary');
    await wait(pc, () => document.querySelector('#matches li:nth-child(3) .replay')?.textContent === 'Download the replay', null, 'a replay to download');
    await pc.click('#matches li:nth-child(3) .replay');
    await wait(pc, () => lpc.toasts().includes('Riot didn’t let the app download a replay. From patch 26.21 Riot keeps replay downloads for League’s own match history, so download it there: Profile, Match History, then the game’s download button.'), null, 'where to get the replay');
    await pc.click('#matches li:nth-child(4) summary');
    await wait(pc, () => document.querySelector('#matches li:nth-child(4) .replay')?.textContent === 'No replay here: since patch 26.21, download it in League’s match history', null, 'why there’s no replay');
    assert(await pc.locator('#matches li:nth-child(4) .replay').isDisabled(), 'nothing to click');
    await pc.click('.nav[data-view="settings"]');
    assert.match(await text(pc, '#patchNote'), /, replays ✗\.$/);
    console.log('patch 26.21: a replay League won’t download points to League’s match history, also in the patch check');
    // an app link: lolprox://join/<room> brings the app into that room, after asking to leave the one you're in
    pc.once('dialog', (d) => d.accept());
    await pc.evaluate(() => lpcClient.emit('join', 'wxyz'));
    await wait(pc, () => lpc.room() === 'wxyz' && lpc.slot() >= 0 && !document.querySelector('.view[data-view="voice"]').hidden, null, 'the room from the app link');
    console.log('app link: joined room WXYZ');
    // the phone remote from its home screen icon: remote.html with no code connects with the one it kept
    const [p2ctx, phone2] = await context(browser, { phone: true });
    await p2ctx.addInitScript((c) => { if (!localStorage.getItem('lpc-remote-code')) localStorage.setItem('lpc-remote-code', c); }, link.split('#')[1]);
    await phone2.goto(link.split('#')[0]);
    await wait(phone2, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone remote from the home screen');
    assert.strictEqual(await phone.evaluate(() => localStorage.getItem('lpc-remote-code')), link.split('#')[1], 'the phone kept its code');
    assert.strictEqual(await phone2.getAttribute('link[rel="manifest"]', 'href'), 'remote-manifest.json');
    await p2ctx.close();
    const [p3ctx, phone3] = await context(browser, { phone: true });
    await phone3.goto(link.split('#')[0]);
    assert(await phone3.isVisible('#linkForm'), 'no code yet: paste the link');
    await phone3.fill('#link', link);
    await phone3.click('#linkForm button');
    await wait(phone3, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone remote from a pasted link');
    await p3ctx.close();
    console.log('phone remote: from the home screen with its kept code, and from a pasted link');
    // ---- CS drill: Practice Tool games to 10:00 saved with their CS (not one first seen after 10:00), the next one
    // counted down on the page and the overlay against your best run, its exact CS typed in, and the chart of all three
    const practice = (room, t, cs) => league(leagueData({ mode: 'PRACTICETOOL', room, t, events: [],
      players: [{ name: 'Rayan#EUW', team: 'ORDER', champ: 'Ahri', champName: 'Ahri', pos: '', lvl: 9, k: 0, d: 0, a: 0, cs, items: [] }] }));
    lcu.phase = 'InProgress';
    await pc.click('#leagueNav'); await pc.click('.nav[data-view="game"]');
    for (const [t, cs] of [[300, 30], [480, 60], [601, 80]]) await practice('gdrill000001', t, cs);
    await wait(pc, () => lpc.toasts().includes('CS drill: 80+ CS at 10:00. You can type your exact CS on the Game page.'), null, 'the first drill');
    for (const [t, cs] of [[300, 40], [450, 60], [602, 90]]) await practice('gdrill000001', t, cs); // the same champion again: the same room code, its clock started again
    await wait(pc, () => lpc.toasts().includes('CS drill: 90+ CS at 10:00, your best yet. You can type your exact CS on the Game page.'), null, 'the second, your best yet');
    await practice('gdrill000003', 700, 100);
    await wait(pc, () => /^This game was past 10:00 when Premade saw it\./.test(document.getElementById('drillNow').textContent), null, 'too late for a drill');
    await practice('gdrill000004', 290, 40);
    await wait(pc, () => /^Last-hit until 10:00 on the game clock: 5:\d\d left, CS 40\. Your best run had 40 by 5:00\.$/.test(document.getElementById('drillNow').textContent), null, 'the drill on the Game page');
    await wait(pc, () => /^CS 40 · \d+\.\d a minute · drill 5:\d\d left$/.test(lpcClient.lastOverlay.cs), null, 'the drill on the overlay');
    await practice('gdrill000004', 600.5, 70);
    await wait(pc, () => lpc.toasts().includes('CS drill: 70+ CS at 10:00, your best is 90. You can type your exact CS on the Game page.'), null, 'the third drill');
    await wait(pc, () => document.getElementById('drillNow').textContent === 'Done: 70+ CS at 10:00. For another drill, start a new Practice Tool game.' && !document.getElementById('drillExact').hidden, null, 'the exact CS asked');
    await pc.fill('#drillCs', '74');
    await pc.click('#drillExact button');
    await wait(pc, () => document.getElementById('drillExact').hidden, null, 'the exact CS saved');
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-drills')).map((d) => [d.champ, d.cs, d.exact || 0, d.steps.length])), [['Ahri', 80, 0, 3], ['Ahri', 90, 0, 3], ['Ahri', 70, 74, 2]]);
    lcu.phase = 'None';
    await league({ inGame: false, phase: 'None' });
    await wait(pc, () => /^Your CS at 10:00 in Practice Tool games\./.test(document.getElementById('drillNow').textContent), null, 'your drills after the game');
    assert.deepStrictEqual(await pc.$$eval('#drillList li', (l) => l.map((e) => e.textContent.split(' · ').slice(1).join(' · '))), ['Ahri · 74 CS', 'Ahri · 90+ CS · your best', 'Ahri · 80+ CS']);
    assert.strictEqual(await pc.textContent('#drillTrend figcaption'), 'CS at 10:00: 81 on average, 81 in your last 3');
    await shot(pc, 'cs-drill');
    console.log('CS drill: 80+ and 90+ saved, none for a game seen after 10:00, a drill counted down against your best, 74 typed in, the chart');
    // backup and restore: everything but the phone remote's code, back in after a reload
    await pc.click('.nav[data-view="settings"]');
    const [bk] = await Promise.all([pc.waitForEvent('download'), pc.click('#backupBtn')]);
    const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
    assert(backup.app === 'league-proxchat' && backup.data['lpc-name'] === 'Rayan' && backup.data['lpc-lp'] && backup.data['lpc-clip-favs'] && backup.data['lpc-notes'] && backup.data['lpc-watch'] && backup.data['lpc-drills'] && !('lpc-remote' in backup.data) && !('lpc-device' in backup.data), `the backup: ${Object.keys(backup.data)}`);
    backup.data['lpc-range'] = '2000';
    pc.once('dialog', (d) => d.accept());
    await Promise.all([pc.waitForEvent('load'), pc.setInputFiles('#restoreFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })]);
    await wait(pc, () => window.lpc && document.getElementById('range').value === '2000', null, 'the backup loaded');
    console.log(`backup and restore: ${Object.keys(backup.data).length} things kept`);

    // League closed: the app shows your profile as it was last time, with the past ranks and peak League's client gave,
    // even once your rank from Riot (which has none of them) took its place
    const saved = JSON.parse(await pc.evaluate(() => localStorage.getItem('lpc-profile'))), past = await pc.evaluate(() => localStorage.getItem('lpc-past'));
    for (const q of Object.values(saved.rk)) for (const k of Object.keys(q)) if (/^(previousSeason|highest)/.test(k)) delete q[k];
    saved.u = MY_RIOT; // and Riot's kind of puuid
    const [sctx, sp] = await context(browser, { version: '1.7.0' });
    await sctx.exposeFunction('fakeLcu', () => ({ status: 0, data: null }));
    await sctx.addInitScript(([s, p]) => { localStorage.setItem('lpc-profile', s); localStorage.setItem('lpc-past', p); }, [JSON.stringify(saved), past]);
    await sp.goto(URL_);
    await wait(sp, () => window.lpc, null, 'the page');
    await sp.evaluate(() => lpcClient.emit('league', { inGame: false, phase: '' }));
    await sp.click('#leagueNav'); await sp.click('.nav[data-view="profile"]');
    await wait(sp, () => document.getElementById('proName').textContent === 'Rayan' && document.getElementById('proStatus').textContent === 'League isn’t running', null, 'your saved profile with League closed');
    assert.match(await text(sp, '#proNote'), /^As of .+\. Start League to update it\.$/);
    await wait(sp, () => !document.getElementById('proPast').hidden, null, 'your past ranks kept');
    assert.deepStrictEqual(await sp.$$eval('#proPast .tag', (l) => l.map((e) => e.textContent)), [`S${new Date().getFullYear() - 1} Platinum IV · peak Platinum II`]);
    assert.match(await sp.$eval('#proRanks .rank', (e) => e.textContent), /Peak this season: Gold I$/);
    assert.strictEqual(await sp.locator('#proGames > li').count(), 20);
    assert(await sp.locator('#profileBtn').isHidden() && await sp.locator('#proFindBox').isHidden(), 'no Share or lookups without League');
    await sctx.close();
    console.log('Profile with League closed: as it was last time');
    await ctx.close();

    // ---- champ select helpers, in app 1.13: the tier list's arrows, bans and champion pages, the matchup explorer,
    // safe blind picks, the matchup's own rune page, tips against both bot laners and Borderless in one click
    {
      const [hctx, hp] = await context(browser, { version: '1.13.0' });
      await hctx.exposeFunction('fakeLcu', fakeLcu);
      await hctx.route(/127\.0\.0\.1:9001\/riot\/(summary|champ|api|past)/, (r) => {
        const u = new URL(r.request().url()), cors = { 'access-control-allow-origin': '*' }, role = u.searchParams.get('r') || 'MIDDLE';
        if (u.pathname.endsWith('/summary')) return r.fulfill({ json: HSUM, headers: cors });
        if (!u.pathname.endsWith('/champ')) return r.fulfill({ status: 404, json: {}, headers: cors });
        const c = +u.searchParams.get('c'), games = H_CHAMP[`${c}/${role}`] || [];
        r.fulfill({ json: { patch: '15.20', role, roles: games.length ? { [role]: [games.length, games.filter((g) => g.w).length] } : {}, games }, headers: cors });
      });
      const hl = (d) => hp.evaluate((d) => lpcClient.emit('league', d), d);
      lcu.cs = null;
      lcu.phase = 'None';
      await hp.goto(URL_);
      await wait(hp, () => window.lpc, null, 'the page');
      await hl({ inGame: false, phase: 'None' });
      await wait(hp, () => lpc.lcu().me0 && lpc.lcu().hist === 20, null, 'your account and match history');
      await hp.click('#leagueNav'); await hp.click('.nav[data-view="pregame"]');
      await wait(hp, () => !document.getElementById('winFix').hidden, null, 'League in Fullscreen, on Pregame');
      // the tier list: arrows for Ahri, rising since last patch, and Zed, falling; how often each was banned; a row
      // opens that champion's page in the role
      await wait(hp, () => !document.getElementById('tierBox').hidden && document.querySelectorAll('#tierRows tr').length === 4, null, 'the tier list');
      assert.strictEqual(await text(hp, '#tierNote'), 'Middle in 200 Challenger and Grandmaster games our server counted from Riot, patch 25.20 and 25.19.');
      assert.deepStrictEqual(await hp.$$eval('#tierRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())),
        ['Vi S 60% 40 · 20% picked 0%', 'Ahri S 55%▲ 160 · 80% picked 3%', 'Lux B 51% 80 · 40% picked 0%', 'Zed B 50%▼ 120 · 60% picked 20%']);
      assert.deepStrictEqual(await hp.$$eval('#tierRows .trend', (l) => l.map((e) => e.title)), ['Rising: 65% won in 80 games this patch, 45% in 80 last patch', 'Falling: 40% won in 60 games this patch, 60% in 60 last patch']);
      assert(await hp.isVisible('#tierBan'), 'the Banned column');
      await hp.click('#tierRows tr:nth-child(2) td:nth-child(3)');
      await wait(hp, () => document.getElementById('champDlg').open && /Ahri middle won 47% of 60 Challenger and Grandmaster games on patch 25\.20/.test(document.getElementById('champDlgBody').textContent), null, 'Ahri’s page from the tier list');
      await hp.click('#champDlgClose');
      console.log('tier list 2.0: Ahri rising, Zed falling, ban rates, and a row opens the champion’s page');
      // the matchup explorer: Ahri against Zed in the middle, Ahri's most played role
      await hp.fill('#mxA', 'Ahri');
      await hp.fill('#mxB', 'Zed');
      await wait(hp, () => document.getElementById('mxNote').textContent === 'Ahri middle against Zed:' && document.querySelectorAll('#mxBuild > *').length === 4 && /Arcane Comet/.test(document.getElementById('mxBuild').textContent)
        && /Riot’s tip for Ahri/.test(document.getElementById('mxTips').textContent), null, 'the matchup explorer');
      assert.strictEqual(await hp.textContent('#mxTips h3'), 'Tips: Ahri against Zed');
      assert.deepStrictEqual((await tipsIn(hp, '#mxTips')).filter((t) => !t.startsWith('You:')), ['High elo: Ahri won 6 of 20 games against Zed. A hard matchup for Ahri.',
        'Zed is a melee assassin with mostly physical damage, so armor helps against them. You outrange Zed: 550 against 125.',
        'Riot’s tip against Zed: Zed’s shadows copy his abilities: stand away from them.', 'Riot’s tip against Zed: Zhonya’s Hourglass stops Death Mark.',
        'Against Zed, high elo Ahri players take Arcane Comet (20 of 20 games; usually Electrocute) and Flash + Teleport (20 of 20 games; usually Flash + Ignite).', 'Riot’s tip for Ahri: Use Charm to set up your combos.']);
      assert.deepStrictEqual(await texts(hp, '#mxBuild > *'), ['Runes in this matchup: Arcane Comet, Manaflow Band, Transcendence, Scorch, Taste of Blood, Treasure Hunter (Sorcery with Domination), in 20 of 20 games, 6 won. Spells: Flash and Teleport.',
        'Start Doran’s Ring Health Potion', 'First items, in order Luden’s Companion Zhonya’s Hourglass', 'Boots Sorcerer’s Shoes']);
      console.log('matchup explorer: Ahri against Zed, with its tips, rune page, spells and build');
      // champ select, middle, before their laner is known: Ahri, whom Zed beats in high elo, ranks below the safe picks
      champSelect(6660001);
      lcu.phase = 'ChampSelect';
      await hl({ inGame: false, phase: 'ChampSelect' });
      const hGrid = () => hp.$$eval('#dGrid .dchamp', (l) => l.map((b) => `${b.querySelector('img').alt} ${b.querySelector('.dsc').textContent}`));
      await wait(hp, () => /Blind pick, their counters/.test((document.querySelector('#dGrid .dchamp:has(img[alt="Ahri"])') || {}).title), null, 'the draft with safe blind picks');
      assert.deepStrictEqual(await hGrid(), ['Vi +6.7', 'Lux +1.0', 'Zed +0.0', 'Ahri −5.3']);
      assert.strictEqual(await hp.getAttribute('#dGrid .dchamp:has(img[alt="Ahri"])', 'title'), 'Ahri\nHigh elo middle: 55% won in 160 games\nBlind pick, their counters: won 6 of 20 games against Zed (−9.8)');
      assert.match(await text(hp, '#dNote'), /Their laner isn’t picked yet, so champions they can counter rank lower\./);
      // their Zed in, you lock in Ahri: the most popular page first, then one click for the page against Zed
      Object.assign(flatActions().find((a) => a.id === 3), { completed: true, isInProgress: false });
      Object.assign(flatActions().find((a) => a.id === 8), { completed: true, isInProgress: false, championId: 103 });
      lcu.cs.myTeam[2].championId = 103;
      lcu.cs.theirTeam[2].championId = 238;
      await wait(hp, () => /^Runes: the most popular page for Ahri, middle, in high elo \(Electrocute: 55% won in 40 games\)\./.test(document.getElementById('runesNote').textContent) && !document.getElementById('runesVs').hidden, null, 'the matchup runes button');
      assert.strictEqual(await text(hp, '#runesVs'), 'Use what high elo players take against Zed: Arcane Comet (20 of 20 games)');
      assert.deepStrictEqual(await hGrid(), ['Lux +7.0', 'Vi +6.7', 'Zed +0.0', 'Ahri −11.9'], 'Zed known: the lane matchup counts instead of the blind pick');
      const since = lcu.calls.length;
      await hp.click('#runesVs');
      await wait(hp, () => document.getElementById('runesNote').textContent === 'Runes: the page high elo players take on Ahri against Zed (Arcane Comet in 20 of 20 games, 6 won). Spells: Flash on D, Teleport on F.', null, 'the page against Zed');
      const pg = callsTo(/^\/lol-perks\/v1\/pages(\/\d+)?$/, null, since).filter(([m]) => m !== 'GET').pop();
      assert(pg && pg[2].primaryStyleId === 8200 && pg[2].subStyleId === 8100 && JSON.stringify(pg[2].selectedPerkIds) === JSON.stringify(COMET.slice(2)), `the page against Zed: ${JSON.stringify(pg)}`);
      assert.deepStrictEqual([lcu.cs.myTeam[2].spell1Id, lcu.cs.myTeam[2].spell2Id], [4, 12]);
      assert(await hp.locator('#runesVs').isHidden() && (await text(hp, '#runesOther')) === 'Use the most popular runes instead', 'and back to the usual page');
      console.log('safe blind picks: Ahri, beaten by Zed, lower until Zed is picked; matchup runes: Arcane Comet and Teleport against Zed in one click');
      // at the bottom on Jinx: tips against their Caitlyn and their Sona
      Object.assign(lcu.cs.myTeam[2], { assignedPosition: 'bottom', championId: 222 });
      flatActions().find((a) => a.id === 8).championId = 222;
      lcu.cs.theirTeam[3] = { cellId: 8, championId: 51, assignedPosition: 'bottom' };
      lcu.cs.theirTeam[4] = { cellId: 9, championId: 37, assignedPosition: 'utility' };
      await wait(hp, () => !document.getElementById('csTips').hidden && document.querySelector('#csTips h3').textContent === 'Tips: Jinx against Caitlyn and Sona' && /Sona on the other team/.test(document.getElementById('csTips').textContent), null, 'tips against both bot laners');
      assert.deepStrictEqual((await tipsIn(hp, '#csTips')).filter((t) => !t.startsWith('You:')), ['High elo: Jinx won 10 of 20 games against Caitlyn. An even matchup.',
        'Caitlyn is a ranged marksman with mostly physical damage, so armor helps against them. Caitlyn outranges you: 650 against 525.',
        'High elo: Jinx won 9 of 20 games with Sona on the other team, 4 of 10 against Caitlyn and Sona together.', 'Sona is a ranged support with mostly magic damage, so magic resist helps against them.']);
      console.log('bot lane: Jinx’s tips against Caitlyn and Sona');
      // champ select over, League still in Fullscreen: the ready check switches it to Borderless through League's own settings
      lcu.cs = null;
      lcu.phase = 'None';
      await hl({ inGame: false, phase: 'None' });
      assert(await hp.isVisible('#winFix'), 'the Fullscreen fix on Pregame');
      await hp.click('.nav[data-view="voice"]');
      await hp.click('#createBtn');
      await wait(hp, () => lpc.slot() >= 0, null, 'a room');
      await hp.click('#leagueNav'); await hp.click('.nav[data-view="prox"]');
      await hp.click('#readyBtn');
      await wait(hp, () => (document.querySelector('#readyRows tr td:last-child') || {}).textContent === 'Fullscreen: no overlay Switch to Borderless', null, 'Fullscreen in the ready check, with its button');
      await hp.click('#readyRows tr td:last-child button');
      await wait(hp, () => document.querySelector('#readyRows tr td:last-child').textContent === 'Borderless', null, 'Borderless now');
      assert.deepStrictEqual([lcu.general, lcu.saved], [{ WindowMode: 2, Width: 1920, Height: 1080 }, { WindowMode: 2, Width: 1920, Height: 1080 }], 'League’s own settings, saved');
      await hp.click('#leagueNav'); await hp.click('.nav[data-view="pregame"]');
      await wait(hp, () => document.getElementById('winFix').hidden, null, 'no Fullscreen fix any more');
      console.log('Fullscreen fix: Borderless in one click from the ready check, through League’s own settings');
      // in a game the explorer hides, like all advice
      await hl(leagueData());
      await wait(hp, () => document.getElementById('mxBox').hidden, null, 'no matchup explorer in a game');
      await hl({ inGame: false, phase: 'None' });
      await hctx.close();
      console.log('matchup explorer: hidden in a game');
    }

    // ---- builds at your rank: for your Gold II, Emerald and Diamond's games (ed) in champ select, on the tier list and
    // on champion pages, with one-tricks, pro players and champions to try; and when to stop, in Stats
    {
      // Emerald and Diamond: 40 games, Ahri's 30 in the middle (18 won) on Arcane Comet with Teleport, and Zed's 12 (5 won)
      const ED = { p: '15.20', c: { 103: { MIDDLE: [30, 18] }, 238: { MIDDLE: [12, 5] }, 99: { MIDDLE: [4, 2] }, 86: { TOP: [40, 20] }, 122: { TOP: [40, 20] } }, old: null, today: 4, total: 40, by: { euw1: 25, na1: 15 }, at: 0 };
      const edAhri = Array.from({ length: 30 }, (_, i) => hGame(7000 + i, +(i < 18), 238, { rn: COMET, s: [4, 12], b: [[10, 1056], [600, 6655], [700, 3020], [1200, 3157]] }));
      // high elo Ahri with each player's code: one on 8 games (6 won, Arcane Comet), one on 4 (all won, Electrocute), the
      // rest once; Faker (T1) and Chovy (GEN) played the newest two
      const oct18 = Math.floor(new Date(2026, 9, 18, 20).getTime() / 1000);
      const hiAhri = H_CHAMP['103/MIDDLE'].map((g, i) => ({ ...g, u: i < 8 ? 'aaaa1111' : i >= 20 && i < 24 ? 'bbbb2222' : `c${i}`, ...(i < 2 && { t: oct18, pro: [['Faker', 'T1'], ['Chovy', 'GEN']][i] }) }));
      const champAsked = [];
      const [ectx, ep] = await context(browser, { version: '1.13.0' });
      await ectx.exposeFunction('fakeLcu', fakeLcu);
      await ectx.route(/127\.0\.0\.1:9001\/stats/, (r) => r.fulfill({ json: { days: [] }, headers: { 'access-control-allow-origin': '*' } }));
      await ectx.route(/127\.0\.0\.1:9001\/riot\/(summary|champ|alike|api|past)/, (r) => {
        const u = new URL(r.request().url()), cors = { 'access-control-allow-origin': '*' }, c = +u.searchParams.get('c'), role = u.searchParams.get('r') || 'MIDDLE', t = u.searchParams.get('t') || '';
        if (u.pathname.endsWith('/summary')) return r.fulfill({ json: { ...HSUM, ed: ED, ...(u.searchParams.has('more') && { pros: 2, lp: { at: Date.now(), ok: true }, pools: 1234 }) }, headers: cors });
        if (u.pathname.endsWith('/alike')) return r.fulfill({ json: c === 103 ? { n: 30, of: 900, list: [[238, 12], [254, 9], [122, 5]] } : { n: 0, of: 900, list: [] }, headers: cors });
        if (!u.pathname.endsWith('/champ')) return r.fulfill({ status: 404, json: {}, headers: cors });
        champAsked.push(`${c}/${u.searchParams.get('r')}/${t}`);
        const games = c === 103 && role === 'MIDDLE' ? (t ? edAhri : hiAhri) : t ? [] : H_CHAMP[`${c}/${role}`] || [];
        r.fulfill({ json: { t, patch: '15.20', role, roles: games.length ? { [role]: [games.length, games.filter((g) => g.w).length] } : {}, games }, headers: cors });
      });
      // your last 20 games, on four days, oldest first: WLLLW, WLLWW, LLWLL, WWLWL (9 won)
      const mine = MY_HIST.games.games, tpl = mine[0];
      MY_HIST.games.games = ['WLLLW', 'WLLWW', 'LLWLL', 'WWLWL'].flatMap((day, d) => [...day].map((r, i) => ({ ...tpl, gameId: 77000 + 10 * d + i, gameCreation: new Date(2026, 9, 10 + d, 12 + i).getTime(),
        participants: [{ ...tpl.participants[0], stats: { ...tpl.participants[0].stats, win: r === 'W' } }] }))).reverse();
      const el = (d) => ep.evaluate((d) => lpcClient.emit('league', d), d);
      lcu.cs = null;
      lcu.phase = 'None';
      await ep.goto(URL_);
      await wait(ep, () => window.lpc, null, 'the page');
      await el({ inGame: false, phase: 'None' });
      await wait(ep, () => lpc.lcu().me0 && lpc.lcu().hist === 20, null, 'your account and match history');
      await ep.click('#leagueNav'); await ep.click('.nav[data-view="pregame"]');
      // the tier list on Emerald and Diamond's games, for your rank; Challenger and Grandmaster's a click away
      await wait(ep, () => !document.getElementById('tierBox').hidden && !document.getElementById('tierEloBox').hidden && document.querySelectorAll('#tierRows tr').length === 2, null, 'the tier list for your rank');
      assert.strictEqual(await ep.inputValue('#tierElo'), 'ed');
      assert.strictEqual(await text(ep, '#tierNote'), 'Middle in 40 Emerald and Diamond games our server counted from Riot, patch 25.20.');
      assert.deepStrictEqual(await ep.$$eval('#tierRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())), ['Ahri S 60% 30 · 75% picked', 'Zed D 42% 12 · 30% picked']);
      await ep.selectOption('#tierElo', '');
      await wait(ep, () => document.getElementById('tierNote').textContent === 'Middle in 200 Challenger and Grandmaster games our server counted from Riot, patch 25.20 and 25.19.', null, 'Challenger and Grandmaster’s tier list');
      await ep.selectOption('#tierElo', 'ed');
      await wait(ep, () => /Emerald and Diamond/.test(document.getElementById('tierNote').textContent), null, 'and back');
      // Ahri's page from it: Emerald and Diamond's games, with high elo's one-tricks and pro players, and champions to try
      await ep.click('#tierRows tr:first-child td:nth-child(3)');
      await wait(ep, () => document.getElementById('champDlg').open && /Pro players/.test(document.getElementById('champDlgBody').textContent) && /Champions to try/.test(document.getElementById('champDlgBody').textContent), null, 'Ahri’s page');
      const ePage = (await text(ep, '#champDlgBody')).replace(/\s+/g, ' ');
      for (const re of [/In Emerald and Diamond Games from .*Ahri middle won 60% of 30 Emerald and Diamond games on patch 25\.20\. Runes: Arcane Comet, Manaflow Band, Transcendence, Scorch, Taste of Blood, Treasure Hunter \(Sorcery with Domination\): 60% won in 30 games\. Spells: Flash and Teleport\. Start Doran’s Ring First items, in order Luden’s Companion Zhonya’s Hourglass Boots Sorcerer’s Shoes Best against: Zed, 60% won in 30 games\. One-tricks/i,
        /One-tricks The players with the most of these games on Ahri, and what they take\. Player 1: 8 games, 75% won\. Arcane Comet \(Sorcery with Domination\), Flash and Teleport\. Luden’s Companion Zhonya’s Hourglass Sorcerer’s Shoes Player 2: 4 games, 100% won\. Electrocute \(Domination with Sorcery\), Flash and Ignite\. Pro players/i,
        /Pro players Their latest solo queue games on Ahri, with their items in the order they bought them\. Faker \(T1\), Oct 18: won against Zed\. Arcane Comet \(Sorcery with Domination\), Flash and Teleport\. Luden’s Companion Sorcerer’s Shoes Zhonya’s Hourglass Chovy \(GEN\), Oct 18: won against Zed\. .* Pro players and their teams from Leaguepedia, under CC BY-SA\. Champions to try/i,
        /Champions to try If you like Ahri, try these: the champions high elo Ahri players also play most\. Zed 40% of Ahri players play it Vi 30% of Ahri players play it Darius 17% of Ahri players play it/i]) assert.match(ePage, re);
      assert.deepStrictEqual(await ep.$$eval('#champDlgBody select option', (o) => o.map((x) => [x.value, x.textContent])), [['', 'Challenger and Grandmaster'], ['ed', 'Emerald and Diamond']]);
      await ep.selectOption('#champDlgBody select', '');
      await wait(ep, () => /In high elo .*Ahri middle won 47% of 60 Challenger and Grandmaster games on patch 25\.20/i.test(document.getElementById('champDlgBody').innerText.replace(/\s+/g, ' ')), null, 'Challenger and Grandmaster’s games on Ahri’s page');
      await shot(ep, 'champion-page-one-tricks');
      await ep.click('#champDlgClose');
      console.log('builds at your rank: the tier list and Ahri’s page on Emerald and Diamond’s games, with one-tricks, pro players and champions to try');
      // champ select: Ahri's runes, spells and build from Emerald and Diamond's games
      champSelect(6670001);
      lcu.phase = 'ChampSelect';
      await el({ inGame: false, phase: 'ChampSelect' });
      await wait(ep, () => !document.getElementById('csBox').hidden, null, 'champ select');
      Object.assign(flatActions().find((a) => a.id === 3), { completed: true, isInProgress: false });
      Object.assign(flatActions().find((a) => a.id === 8), { completed: true, isInProgress: false, championId: 103 });
      lcu.cs.myTeam[2].championId = 103;
      lcu.cs.theirTeam[2].championId = 238;
      await wait(ep, () => /^Runes: the most popular page for Ahri, middle, in Emerald and Diamond/.test(document.getElementById('runesNote').textContent), null, 'Emerald and Diamond’s runes');
      assert.strictEqual(await text(ep, '#runesNote'), 'Runes: the most popular page for Ahri, middle, in Emerald and Diamond (Arcane Comet: 60% won in 30 games). Spells: Flash on D, Teleport on F.');
      await wait(ep, () => /^Items: the Emerald and Diamond build on Ahri \(from 30 games\)/.test(document.getElementById('buildNote').textContent), null, 'Emerald and Diamond’s build');
      assert.deepStrictEqual(lcu.itemSets.itemSets.find((s) => s.uid === 'lpc-103').blocks.slice(0, 3).map((b) => [b.type, b.items.map((i) => i.id).join()]),
        [['Emerald and Diamond start', '1056'], ['Emerald and Diamond first items, in order', '6655,3157'], ['Emerald and Diamond boots', '3020']]);
      assert.strictEqual(await text(ep, '#topNote'), 'In Emerald and Diamond, Ahri middle won 60% of 30 games. Against their picks: Zed, 60% won in 30 games.');
      assert(champAsked.includes('103/MIDDLE/ed'), 'Emerald and Diamond’s Ahri in the middle asked for');
      lcu.cs = null;
      lcu.phase = 'None';
      await el({ inGame: false, phase: 'None' });
      console.log('builds at your rank: Arcane Comet, Teleport and the build from Emerald and Diamond’s games in champ select');
      // Pregame settings: Challenger and Grandmaster's games instead
      assert(await ep.isVisible('#eloBox') || (await ep.click('#preSet summary'), await ep.isVisible('#eloBox')), 'Most popular in, in Pregame settings');
      assert.strictEqual(await ep.inputValue('#optElo'), 'auto');
      // Stats: when to stop, then champions to try for Ahri (you play Zed already)
      await ep.click('#leagueNav'); await ep.click('.nav[data-view="stats"]');
      await ep.click('.tab[data-tab="you"]');
      await wait(ep, () => !document.getElementById('stops').hidden, null, 'when to stop');
      assert.deepStrictEqual(await texts(ep, '#stops tbody tr'), ['After a win 7 2W 5L · 29%', 'After a loss 5 1W 4L · 20%', 'After 2 losses in a row 3 2W 1L · 67%', 'After 3 or more in a row 1 1W 0L · 100%',
        'First game of the day 4 3W 1L · 75%', 'Second game 4 1W 3L · 25%', 'Third game 4 1W 3L · 25%', 'Fourth game 4 2W 2L · 50%', 'Fifth game or later 4 2W 2L · 50%']);
      assert.strictEqual(await text(ep, '#stopNote'), 'Stop after a loss: you won 20% of the 5 games right after, against 45% in all. Your first game of the day: 75% won; your fifth or later: 50%.');
      await ep.click('.tab[data-tab="champs"]');
      await wait(ep, () => document.querySelectorAll('#tryList .champ').length === 2, null, 'champions to try');
      assert.deepStrictEqual((await texts(ep, '#tryList h3')).map((s) => s.toLowerCase()), ['if you like ahri']);
      assert.deepStrictEqual(await texts(ep, '#tryList .champ'), ['Vi 30% of Ahri players play it', 'Darius 17% of Ahri players play it']);
      assert.strictEqual(await text(ep, '#tryNote'), '');
      await shot(ep, 'stats-champions-to-try');
      // Settings > Our server: Emerald and Diamond's games, the pro players and the ladder players' champions
      await ep.click('.nav[data-view="settings"]');
      await wait(ep, () => !document.getElementById('serverMore').hidden, null, 'our server’s counts');
      assert.match(await text(ep, '#serverMore'), /^Emerald and Diamond games counted from Riot: 40 \(EUW 25, NA 15\), 4 games today\. Pro players found from Leaguepedia’s player list: 2, read \w+ \d+\. High elo players asked which champions they play, for Champions to try: 1,234\.$/);
      await ectx.close();
      MY_HIST.games.games = mine;
      console.log('when to stop: after a loss, 20% won against 45%; champions to try: Vi and Darius for Ahri; our server’s Emerald and Diamond, pro and champion counts');
    }

    assert.deepStrictEqual(lcu.refused, [], 'every call is one the desktop app lets through');
    console.log(`all ${lcu.calls.length} calls to League's client are on the desktop app's list`);
    await phoneBrowser.close(); // and the phone's context with it (ctx is closed after the matchup explorer)
    console.log('ok');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (!process.env.CLIPS) fs.rmSync(clips, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
  }
})().catch((err) => { console.error(err); process.exit(1); });

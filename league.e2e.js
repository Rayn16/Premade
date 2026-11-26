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
const openSet = async (p, sec) => { await openPage(p, 'settings'); await p.click(`#setList [data-sec="${sec}"]`); }; // a section of Settings (What's new 207)
const openPage = async (p, v) => { if (!(await p.isVisible(`.nav[data-view="${v}"]`))) await p.click('#leagueNav'); await p.click(`.nav[data-view="${v}"]`); }; // the sidebar shows Premade's or League's list (What's new 178): swap it if the page isn't on it

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
const champFull = (id, v) => ({ data: { [id]: { id, skins: id === 'Ahri' ? [{ num: 0, name: 'default' }, { num: 1, name: 'Dynasty Ahri' }, { num: 4, name: 'Popstar Ahri' }] : [{ num: 0, name: 'default' }], allytips: (TIPS[id] || [[]])[0], enemytips: (TIPS[id] || [[], []])[1], stats: { hp: id === 'Ahri' && v === '1.1' ? 600 : 590, armor: 21 }, passive: { name: 'Passive', description: 'Same.' },
  spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: id === 'Ahri' ? ['Orb of Deception', 'Fox-Fire', 'Charm', 'Spirit Rush'][i] : k, cooldownBurn: id === 'Ahri' && !i && v === '1.1' ? '6' : '7', costBurn: '50', rangeBurn: '900', tooltip: '', description: '' })) } } });
// a 4x4 picture in one colour (Popstar Ahri's splash here), for the page to take a hue from (What's new 177)
function solidPng(r, g, b) {
  const zlib = require('zlib'), chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(4, 0); head.writeUInt32BE(4, 4); head[8] = 8; head[9] = 2;
  const rows = Buffer.concat([0, 1, 2, 3].map(() => Buffer.from([0, r, g, b, r, g, b, r, g, b, r, g, b])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const PINK = solidPng(200, 40, 120); // hue 337.5 to the page's 24 bins
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
    gameId: id, gameCreation: g ? g.gameCreation : t0, gameDuration: 1700, queueId: 420, gameMode: 'CLASSIC', gameVersion: '16.23.712.3456', // patch 26.23
    teams: [{ teamId: 100, towerKills: 3, dragonKills: 2, baronKills: 1 }, { teamId: 200, towerKills: 1, dragonKills: 0, baronKills: 0 }],
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
// dragons, Baron and three towers (and an inhibitor), theirs the Rift Herald and a tower; you and Zed take a turret plate
// each (Riot's copy says 3 for you: your team's); late on, Lee Sin kills two and dies in a fight.  Riot's positions are game units from the blue base, bottom left; a
// tower's teamId is whose tower fell.
const FIGHTS = [[390, 'CHAMPION_KILL', 1, { victimId: 8, assistingParticipantIds: [3], position: { x: 7400, y: 7400 } }],
  [490, 'CHAMPION_KILL', 8, { victimId: 1, assistingParticipantIds: [7], position: { x: 5500, y: 9000 } }], [330, 'ELITE_MONSTER_KILL', 7, { monsterType: 'HORDE' }], [540, 'ELITE_MONSTER_KILL', 3, { monsterType: 'DRAGON', monsterSubType: 'FIRE_DRAGON' }],
  [760, 'CHAMPION_KILL', 8, { victimId: 1, assistingParticipantIds: [7], position: { x: 10000, y: 4500 } }], [840, 'ELITE_MONSTER_KILL', 7, { monsterType: 'RIFT_HERALD' }],
  [900, 'BUILDING_KILL', 1, { teamId: 200, buildingType: 'TOWER_BUILDING' }], [1000, 'BUILDING_KILL', 8, { teamId: 100, buildingType: 'TOWER_BUILDING' }],
  [1100, 'CHAMPION_KILL', 4, { victimId: 9, assistingParticipantIds: [1, 5], position: { x: 12000, y: 2500 } }], [1260, 'ELITE_MONSTER_KILL', 3, { monsterType: 'DRAGON', monsterSubType: 'WATER_DRAGON' }],
  [1500, 'ELITE_MONSTER_KILL', 3, { monsterType: 'BARON_NASHOR' }], [1560, 'BUILDING_KILL', 2, { teamId: 200, buildingType: 'TOWER_BUILDING' }],
  [1600, 'BUILDING_KILL', 4, { teamId: 200, buildingType: 'TOWER_BUILDING' }], [1620, 'BUILDING_KILL', 4, { teamId: 200, buildingType: 'INHIBITOR_BUILDING' }],
  [1700, 'CHAMPION_KILL', 2, { victimId: 9, position: { x: 9000, y: 9000 } }], [1710, 'CHAMPION_KILL', 2, { victimId: 10, position: { x: 9000, y: 9000 } }], [1720, 'CHAMPION_KILL', 6, { victimId: 3, position: { x: 9000, y: 9000 } }],
  [300, 'TURRET_PLATE_DESTROYED', 1, { teamId: 200, laneType: 'MID_LANE' }], [600, 'TURRET_PLATE_DESTROYED', 8, { teamId: 100, laneType: 'MID_LANE' }]];
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
  if (!lcu.noBuys) for (const [t, itemId] of buys) frames[Math.ceil(t / 60)].events.push({ type: 'ITEM_PURCHASED', timestamp: t * 1000, participantId: 1, itemId });
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
    teamTwo: TEAM2.map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition })),
    playerChampionSelections: [...TEAM1, ...TEAM2].filter(([, n]) => n !== 'Sniper').map(([puuid, , championId]) => ({ puuid, championId, selectedSkinIndex: puuid === ME ? 7 : 0, spell1Id: 4, spell2Id: puuid === ME ? 14 : 12 })) } }); // Sniper: not listed
  if (p === '/lol-matchmaking/v1/ready-check') return lcu.rc ? ok(lcu.rc) : { status: 404, data: null };
  if ((m = /^\/lol-matchmaking\/v1\/ready-check\/(accept|decline)$/.exec(p))) { if (lcu.rc) lcu.rc.playerResponse = m[1] === 'accept' ? 'Accepted' : 'Declined'; return { status: 204, data: null }; }
  if (p === '/lol-champ-select/v1/session') return lcu.cs && lcu.phase === 'ChampSelect' ? ok(lcu.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(lcu.pickable && p.endsWith('/pickable-champion-ids') ? lcu.pickable : CHAMPS.map((c) => c[1])); // lcu.pickable: fewer you can pick (What's new 231)
  if ((m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)$/.exec(p))) {
    const a = flatActions().find((x) => x.id === +m[1]);
    a.championId = body.championId;
    if (a.type === 'pick') lcu.cs.myTeam[2].championPickIntent = body.championId;
    if (!body.completed) return { status: 204, data: null };
  }
  if ((m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)(\/complete)?$/.exec(p))) { // a lock in: the PATCH with completed (What's new 192), or the older POST
    if (lcu.noLock) return { status: 500, data: { errorCode: 'RPC_ERROR', httpStatus: 500, message: 'Invalid action' } };
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
  if (p === '/lol-summoner/v1/current-summoner/summoner-profile') return ok({ backgroundSkinId: 103001 }); // your League background: Dynasty Ahri
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1234, summonerLevel: 300, profileIconId: 4568 });
  if ((m = /^\/lol-summoner\/v2\/summoners\/puuid\/([\w-]+)$/.exec(p))) return ok({ puuid: m[1], summonerLevel: m[1] === 'enemy4' ? 30 : 200, ...(m[1] === 'enemy3' && { gameName: 'Shadow', tagLine: 'EUW' }) });
  if ((m = /^\/lol-summoner\/v1\/summoners\/(\d+)$/.exec(p))) return CLASH_SUMS[m[1]] ? ok({ ...CLASH_SUMS[m[1]], summonerId: +m[1] }) : { status: 404, data: null };
  if ((m = /alias\/lookup\?gameName=([^&]*)&tagLine=(.*)$/.exec(p))) {
    const who = { Singer: 'enemy5', Sniper: 'enemy4', Axe: 'enemy1' }[decodeURIComponent(m[1])];
    return who && m[2] === 'EUW' ? ok({ puuid: who }) : { status: 404, data: null };
  }
  // Shadow's as League's client gives someone else's: their wins, never their losses (What's new 194)
  if ((m = /^\/lol-ranked\/v1\/ranked-stats\/(.+)$/.exec(p))) return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: lcu.lp[m[1]] || 45, wins: 30, losses: m[1] === 'enemy3' ? 0 : 25 }, ...(m[1] === 'ally1' && { RANKED_FLEX_SR: { tier: 'SILVER', division: 'I', leaguePoints: 10, wins: 3, losses: 1 } }) } });
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
  if (p === '/lol-perks/v1/pages' && lcu.full) return { status: 400, data: { message: 'Max pages reached' } };
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
    useScreen() {}, keys: async (k) => ({ mute: !!k.mute, show: !!k.show, clip: !!k.clip, overlay: !!k.overlay, board: !!k.board, ptt: !!k.ptt }), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; },
    re4: async (what, arg) => (what === 'status' && await new Promise((r) => setTimeout(r, 500)), { role: 'host', tunnelIp: '100.101.102.103', tailscale: what === 'setup' ? 'Running' : 'NeedsLogin', mod: what === 'ours' ? 'ours' : 'theirs', modVersion: what === 'ours' ? '0.6.14-retarget' : '', build: '22377325', running: false, why: null, setup: what !== 'setup', firewallOn: false,
      friends: [{ name: 'cutiecatty' }], peers: [{ ip: '100.90.1.2', name: 'cutiecatty', online: true, ms: 38, mod: 'theirs', modVersion: '', build: '22377325', running: true }],
      invite: what === 'invite' ? `RE4COOP2.for-${arg.replace('\n', '-')}` : null,
      inGame: window.lpcClient.inRe4 ? { connected: what === 'char', character: what === 'char' ? `Now playing as ${arg}` : '' } : null,
      note: { char: `Switching you to ${arg}.`, play: 'Saves backed up for 1 Steam account. Starting RE4...', setup: 'This PC is set up to host.', ours: 'Their mod is out and ours is back.', invite: `Invite for ${arg.split('\n')[0]} ready.` }[what] || null,
      connection: [{ level: 'good', title: 'Tailscale connected', detail: 'this PC is 100.101.102.103' }], privacy: [{ level: 'warn', title: 'Game port open to your friend', detail: 'UDP 39000' }],
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
      stems: [], // 1.48: the name the page asks for (this stand-in keeps "Clip N")
      async clip(data, pic, like, stem) {
        const u8 = new Uint8Array(data);
        window.lastClip = u8;
        if (!like) this.stems.push(stem);
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
      async clipsClean(limit, keep, first) { this.calls.push(['clean', limit, keep]); this.cleanFirst = first; return []; },
      async clipCopy(n) { this.calls.push('copy ' + n); return fakeClips.has(n); },
      async clipReel(names, stem) { this.calls.push('reel ' + names.join()); fakeClips.set(stem + '.mp4', { ...fakeClips.get(names[0]), at: Date.now() }); return stem + '.mp4'; },
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
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: process.env.SHOTS ? 2 : 1 } : { viewport: { width: 1280, height: 900 } });
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
    if (u.endsWith('/splash/Ahri_4.jpg')) return r.fulfill({ body: PINK, contentType: 'image/png', headers: cors });
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
  page.on('pageerror', (e) => console.log(`[${who}] page error:`, e.message, process.env.STACK ? e.stack : ''));
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
// the Runes tab's rows in a group (What's new 213): name and sub · its numbers · on when League uses that page
const ruRows = (page, sel) => page.$$eval(`${sel} .rurow`, (l) => l.map((b) => `${b.querySelector('.runame').innerText.replace(/\s+/g, ' ').trim()} · ${b.querySelector('.rustat').innerText.replace(/\s+/g, ' ').trim()}${b.getAttribute('aria-pressed') === 'true' ? ' · on' : ''}`.trim()));
const texts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
// a report fits its box: nothing wider than the report, each player's row inside it (What's new 186: the scoreboard's
// rows had slid off to the right)
async function sideways(page, sel, what) {
  const bad = await page.$eval(`${sel} .report`, (rep) => {
    const box = rep.getBoundingClientRect(), out = [];
    for (const e of rep.querySelectorAll('*')) if (e.checkVisibility() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis') out.push(`${e.className} scrolls`); // a name or tag cut with … is fine
    for (const r of rep.querySelectorAll('.pside[data-i]')) { const b = r.getBoundingClientRect(); if (r.checkVisibility() && (b.left < box.left - 1 || b.right > box.right + 1)) out.push(`row ${r.dataset.i} at ${b.left}-${b.right} outside ${box.left}-${box.right}`); }
    if (rep.scrollWidth > rep.clientWidth + 1) out.push(`the report ${rep.scrollWidth} > ${rep.clientWidth}`);
    return out;
  });
  assert.deepStrictEqual(bad, [], `nothing sideways: ${what}`);
}
// a report on its own, whole: the window made tall enough, then put back (SHOTS=folder)
async function repShot(page, sel, name) {
  if (!process.env.SHOTS) return;
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 3200 });
  await page.waitForTimeout(400);
  await page.locator(`${sel} .report`).first().screenshot({ path: path.join(process.env.SHOTS, name + '.png') });
  await page.setViewportSize(vp);
}
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true }); // SHOTS=folder saves screenshots
// the tips for Ahri against Zed in the middle (site/index.html tipsFor), after your note when you have one
const TIPS_AHRI_ZED = ['High elo: Ahri won 12 of 30 games against Zed, −200 gold and +5 CS at 10 minutes. A hard matchup for Ahri.',
  'You: 9 of 13 games won against Zed in your lane, 6 of 8 on Ahri.',
  'Zed is a melee assassin with mostly physical damage, so armor helps against them. You outrange Zed: 550 against 125.',
  'Riot’s tip against Zed: Zed’s shadows copy his abilities: stand away from them.', 'Riot’s tip against Zed: Zhonya’s Hourglass stops Death Mark.',
  'Against Ahri, high elo Zed players take Flash + Ignite (10 of 10 games).', 'Riot’s tip for Ahri: Use Charm to set up your combos.'];
const POS_N = ['Top', 'Jungle', 'Middle', 'Bottom', 'Support'];
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
    // ---- What's new 177: Premade opens on Rooms or Profile, whichever was used last (other pages don't count), and an
    // invite link always opens Rooms
    {
      const [ctx, page] = await context(browser);
      const shown = () => page.evaluate(() => document.querySelector('main > .view:not([hidden])').dataset.view);
      await page.goto(URL_);
      assert.strictEqual(await shown(), 'voice', 'Rooms the first time');
      await openPage(page, 'profile');
      await page.reload();
      assert.strictEqual(await shown(), 'profile', 'Profile, used last');
      await openPage(page, 'voice'); await openPage(page, 'settings');
      await page.reload();
      assert.strictEqual(await shown(), 'voice', 'Rooms, then Settings: Rooms');
      await openPage(page, 'profile');
      await page.goto(URL_ + '&invite#abcd');
      assert.strictEqual(await shown(), 'voice', 'an invite link: Rooms');
      await ctx.close();
      console.log('Opens where you left off: Profile after Profile, Rooms after Rooms then Settings, Rooms for an invite link');
    }
    // ---- in a browser there's no Game page; an old app has it, with a note to restart for the update
    {
      const [ctx, page] = await context(browser);
      await page.goto(URL_);
      assert(!(await page.locator('.nav[data-view="game"]').isVisible()) && !(await page.locator('.nav[data-view="pregame"]').isVisible()), 'no Pregame or Game page in a browser');
      await ctx.close();
      const [ctx2, old] = await context(browser, { version: '1.5.0' });
      await old.goto(URL_);
      await openPage(old, 'pregame');
      assert.match(await text(old, '#preNote'), /Restart the app to finish its update/);
      await openPage(old, 'stats');
      assert(!(await old.locator('#lpQueue').isVisible()) && !(await old.locator('#clipsFolder').isVisible()), 'an old app has no Ranked, Match history or Clips');
      await ctx2.close();
      console.log('Pregame and Game pages: only in the desktop app; an old app is told to restart for its update');
    }

    // ---- Features: every feature's spots are in the desktop app (a click in one counts as its use for Who has Premade)
    {
      const [actx, app] = await context(browser, { version: '1.13.0' });
      await actx.exposeFunction('fakeLcu', () => ({ status: 0, data: null })); // League isn't running
      await app.goto(URL_);
      await wait(app, () => window.lpc, null, 'the page');
      assert.deepStrictEqual(await app.evaluate(() => lpc.features().flatMap(([, , list]) => list.flatMap((f) => (f[3] ? f[3].split(',') : []))).filter((s) => !document.querySelector(s))), [], 'every feature has a spot');
      assert.strictEqual(await app.locator('.nav[data-view="features"], .view[data-view="features"]').count(), 0, 'no Features page (What’s new 185)');
      await actx.close();
      console.log('Features: every feature has a spot in the desktop app, and no Features page');
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
      await openPage(page, 'profile');
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
      await wait(page, () => document.querySelectorAll('#proGames > li:first-child .report button.pside').length === 10, null, 'the report from Riot');
      assert(await page.locator('#proGames > li:first-child .report .pside[data-me]').count() === 1, 'Ana marked in it');
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
      // the queues: Solo/Duo loads its own games (one more), ARAM has five and Riot no more
      await page.click('#proQueues [data-q="solo"]');
      await wait(page, () => document.getElementById('h-proform').textContent === 'Last 18 Solo/Duo games' && document.querySelectorAll('#proGames > li').length === 18, null, 'her Solo/Duo games');
      assert.strictEqual(riotCalls.slice(36).join(' '), `/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?start=0&count=20&queue=420 /europe/lol/match/v5/matches/EUW1_7000000050`);
      await page.click('#proQueues [data-q="aram"]');
      await wait(page, () => document.getElementById('h-proform').textContent === 'Last 5 ARAM games' && document.getElementById('proMoreNote').textContent === 'No older games.', null, 'her ARAM games');
      assert.match(await page.textContent('#proForm'), /^Record\s*1W 4L · 20%/);
      assert.strictEqual(riotCalls.length, 39, 'Riot asked for her ARAM games once');
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
      await openPage(page, 'profile');
      await wait(page, () => window.lpc && document.getElementById('proName').textContent === 'Ana B', null, 'Ana kept');

      await until(() => riotCalls.length === before + 10, 'Ana updated from Riot, with Bob’s rank in her game');
      await wait(page, () => /^In game as Ahri/.test(document.getElementById('proStatus').textContent), null, 'and in a game');
      assert.match(await text(page, '#proNote'), /^As of /);
      await page.click('#proMenu > summary'); // Not you? is in the ⋯ menu
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
    // and wins in each role), and each champion's games. Zed's 10 at the bottom are off-role: League lists him for the
    // middle only, so no bottom list shows him (What's new 216)
    const SUM = { 103: { MIDDLE: [40, 22], TOP: [3, 1] }, 99: { MIDDLE: [12, 7], UTILITY: [20, 10] }, 238: { MIDDLE: [30, 16], BOTTOM: [10, 9] }, 254: { MIDDLE: [18, 13], JUNGLE: [40, 21] },
      86: { TOP: [30, 17] }, 122: { TOP: [20, 9] }, 64: { TOP: [47, 23] } };
    const riotAsked = [], pastAsked = []; // Riot through our server: your account and Sniper's, with Riot's kind of puuid, Sniper in a game, and Riot's copies of four of your games
    const asked = () => riotAsked.filter((k) => !/\/matches\/EUW1_\d+$/.test(k)); // without the copies
    const MY_RIOT = 'riot-me-'.padEnd(78, '0'), SNIPER = 'riot-sniper-'.padEnd(78, '0'), FOE = 'riot-foe-'.padEnd(78, '0'), SHADOW = 'riot-shadow-'.padEnd(78, '0');
    const RIOT = {
      '/europe/riot/account/v1/accounts/by-riot-id/Shadow/EUW': { puuid: SHADOW, gameName: 'Shadow', tagLine: 'EUW' }, // Shadow's wins and losses (League's client gives no losses)
      [`/euw1/lol/league/v4/entries/by-puuid/${SHADOW}`]: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 45, wins: 30, losses: 25 }],
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
    await ctx.exposeFunction('nodeClip', (b64, like) => {
      const name = like ? like.replace(/\.webm$/, ' cut.webm') : `Clip ${savedClips.length + 1}.webm`;
      fs.writeFileSync(path.join(clips, name), Buffer.from(b64, 'base64'));
      savedClips.push(name);
      return name;
    });
    const league = (d) => pc.evaluate((d) => lpcClient.emit('league', d), d);
    const preSettings = () => openSet(pc, 'champ'); // Settings, Champ select (Pregame settings until What's new 207)
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
    await openPage(pc, 'profile');
    await wait(pc, () => !document.querySelector('.view[data-view="profile"]').hidden && document.getElementById('proName').textContent === 'Rayan' && /Gold II/.test(document.getElementById('proRanks').textContent), null, 'your profile');
    assert.strictEqual(await text(pc, '#proTag'), '#EUW');
    assert.strictEqual(await text(pc, '#proSub'), 'EUW · Level 300');
    assert.strictEqual(await text(pc, '#proLvl'), '300');
    assert.match(await pc.getAttribute('#proIcon', 'src'), /\/cdn\/1\.1\/img\/profileicon\/4568\.png$/);
    assert.strictEqual(await text(pc, '#proStatus'), 'In the client');
    // who has Premade: once when it opened, and once with your League account, from this device with the app's version
    for (let i = 0; i < 50 && !ctx.hellos.some((h) => h.skin); i++) await new Promise((r) => setTimeout(r, 100));
    const pm = await pc.evaluate(() => localStorage.getItem('lpc-code')); // this device's Premade code, always last
    assert.match(pm, /^Rayan#P-[a-z]{6}$/);
    assert.deepStrictEqual(ctx.hellos.map(({ id, ...h }) => h), [{ v: '1.11.0', name: 'Rayan', riot: [pm] }, { v: '1.11.0', name: 'Rayan', riot: ['Rayan#EUW', pm] }, { v: '1.11.0', name: 'Rayan', riot: ['Rayan#EUW', pm], skin: 103001 }],
      'a hello when it opens, one with your account and one with the skin your profile shows (League’s background, What’s new 177), not one each time your profile redraws');
    assert(ctx.hellos.every((h) => h.id === ctx.hellos[0].id) && ctx.hellos[0].id === await pc.evaluate(() => localStorage.getItem('lpc-device')), 'with this device\'s own id');
    // (without the ladder place and hidden MMR lines, which ranks.e2e.js checks)
    const proRanks = () => pc.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.ph, .rtier, .hint:not(.ladder):not(.mmr)')].map((x) => x.textContent).join('|')));
    assert.deepStrictEqual(await proRanks(), ['Solo/Duo|Gold II|45 LP · 31W 25L · 55%|Peak this season: Gold I', 'Flex|Unranked|']);
    // ---- What's new 177: your profile over the background you set in League (Dynasty Ahri), ranks and mastery as pictures
    // along the bottom. Background picks Popstar Ahri (kept for this account) and Profile, only Profile, takes its colors;
    // the switch turns them off; Same as League goes back; Esc closes the picker with focus back on Background, and 50
    // opens leave nothing behind
    const proView = '.view[data-view="profile"]';
    await wait(pc, () => /\/splash\/Ahri_1\.jpg$/.test(document.getElementById('proArt').src) && document.getElementById('proBgName').textContent === 'Dynasty Ahri', null, 'League’s background behind your profile');
    assert.deepStrictEqual(await pc.$$eval('#proShow > div', (l) => l.map((d) => [d.querySelector('img').src.replace(/^.*\//, ''), d.querySelector('b').textContent, d.querySelector('small').textContent])),
      [['TFT_Regalia_Gold.png', 'Gold II', 'Solo/Duo · 45 LP'], ['Ahri.png', 'Mastery 22', 'Best: Ahri, 120k points']], 'Solo/Duo and mastery as pictures (Flex unranked)');
    await pc.click('#proBgBtn');
    await wait(pc, () => !document.getElementById('proBgBox').hidden && document.querySelectorAll('#proBgSkins button').length === 3, null, 'the picker with Ahri’s skins');
    assert.strictEqual(await pc.getAttribute('#proBgBtn', 'aria-expanded'), 'true');
    assert.strictEqual(await pc.getAttribute('#proBgLeague', 'aria-pressed'), 'true');
    assert.strictEqual(await text(pc, '#proBgLeague small'), 'Dynasty Ahri, the background you set in League');
    assert.deepStrictEqual(await pc.$$eval('#proBgSkins button', (l) => l.map((b) => [b.textContent, b.getAttribute('aria-pressed')])), [['Ahri', 'false'], ['Dynasty Ahri', 'true'], ['Popstar Ahri', 'false']]);
    assert.deepStrictEqual(await pc.$$eval('#proBgChamps button', (l) => l.map((b) => b.textContent)), ['Ahri', 'Zed', 'Lux', 'Garen'], 'your top champions first');
    const looks = () => pc.evaluate((v) => [getComputedStyle(document.querySelector(v)).getPropertyValue('--bg').trim(), getComputedStyle(document.body).getPropertyValue('--bg').trim(), getComputedStyle(document.querySelector('.view[data-view="voice"]')).getPropertyValue('--bg').trim()], proView);
    const usual = (await looks())[1];
    await pc.click('#proBgSkins button:nth-child(3)');
    await wait(pc, (v) => /\/splash\/Ahri_4\.jpg$/.test(document.getElementById('proArt').src) && document.querySelector(v).style.getPropertyValue('--bg'), proView, 'Popstar Ahri and its colors');
    assert.deepStrictEqual(await looks(), ['hsl(337.5 44% 5%)', usual, usual], 'the skin’s colors on Profile only');
    assert.strictEqual(await text(pc, '#proBgName'), 'Popstar Ahri');
    assert.strictEqual(await pc.getAttribute('#proBgLeague', 'aria-pressed'), 'false');
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-probg'))), { tint: true, picks: { [ME]: 103004 }, mine: 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_4.jpg' }, 'kept for this account');
    await pc.click('#proBgTint');
    assert.strictEqual(await pc.getAttribute('#proBgTint', 'aria-checked'), 'false');
    assert.deepStrictEqual(await looks(), [usual, usual, usual], 'switched off: Premade’s usual colors, the art stays');
    assert.match(await pc.getAttribute('#proArt', 'src'), /\/splash\/Ahri_4\.jpg$/);
    await pc.click('#proBgTint');
    // What's new 191: All of Profile puts the skin behind the whole page (not the hero), Every page behind all of Premade
    // with its colors everywhere, kept on Rooms; Top of Profile back as it was
    const reach = () => pc.evaluate(() => { const h = document.documentElement; return [h.classList.contains('skin-page'), h.classList.contains('skin-app'), h.style.getPropertyValue('--bg'), getComputedStyle(document.querySelector('.proback')).display]; });
    await pc.click('#proBgReach [data-reach="page"]');
    assert.deepStrictEqual(await reach(), [true, false, '', 'none'], 'All of Profile');
    assert.strictEqual((await looks())[0], 'hsl(337.5 44% 5%)');
    await pc.click('#proBgReach [data-reach="app"]');
    assert.deepStrictEqual(await reach(), [false, true, 'hsl(337.5 44% 5%)', 'none'], 'Every page');
    await openPage(pc, 'voice');
    assert.deepStrictEqual(await looks(), ['hsl(337.5 44% 5%)', 'hsl(337.5 44% 5%)', 'hsl(337.5 44% 5%)'], 'Rooms in the skin’s colors');
    await openPage(pc, 'profile');
    await pc.click('#proBgBtn');
    await pc.click('#proBgReach [data-reach="top"]');
    assert.deepStrictEqual(await reach(), [false, false, '', 'block'], 'Top of Profile');
    await pc.fill('#proBgFind', 'ga');
    await wait(pc, () => document.querySelector('#proBgChamps button') && document.querySelector('#proBgChamps button').textContent === 'Garen', null, 'a champion found by name');
    await pc.click('#proBgChamps button');
    await wait(pc, () => [...document.querySelectorAll('#proBgSkins button')].map((b) => b.textContent).join() === 'Garen', null, 'Garen’s skins');
    await pc.fill('#proBgFind', '');
    await pc.click('#proBgLeague');
    await wait(pc, () => /\/splash\/Ahri_1\.jpg$/.test(document.getElementById('proArt').src), null, 'Same as League: Dynasty Ahri again');
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-probg')).picks), {});
    await pc.keyboard.press('Escape');
    assert(await pc.evaluate(() => document.getElementById('proBgBox').hidden && document.activeElement.id === 'proBgBtn'), 'Esc closes it, focus back on Background');
    {
      const count = () => pc.evaluate(() => [document.querySelectorAll('*:not(#proFriends *)').length, document.querySelectorAll('canvas').length]); // not the friends column, which fills in on its own
      const before = await count();
      for (let i = 0; i < 50; i++) { await pc.click('#proBgBtn'); await pc.click('#proBgX'); }
      const after = await count();
      assert(after[0] - before[0] < 20 && after[1] === before[1], `50 opens leave nothing behind: ${before} then ${after}`);
    }
    console.log('What’s new 177: League’s background behind your profile, ranks and mastery as pictures, a skin picked and kept, its colors on Profile only, the switch, Same as League, Esc');
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
    await wait(pc, () => document.querySelectorAll('#proGames > li:first-child .report button.pside').length === 10, null, 'a game’s report on your profile');
    assert.deepStrictEqual(await pc.$$eval('#proGames > li:first-child .report .lrow', (l) => l.map((r) => [...r.querySelectorAll('.pside')].map((p) => `${p.dataset.side}${p.hasAttribute('data-me') ? ' me' : ''}`).join(' vs '))),
      ['us vs them', 'us vs them', 'us me vs them', 'us vs them', 'us vs them'], 'your team on the left, lane against lane');
    // What's new 219: every drawer starts closed, yours too. Pressing your side opens Your game: rings for how many high
    // elo Ahri middle games you beat (only Ahri's 40 have their length here), your best, your biggest leak and a target
    const R = '#proGames > li:first-child .report', open = `${R} .sbdrawer:not([hidden])`;
    assert.strictEqual(await pc.locator(open).count(), 0, 'every drawer starts closed, yours too');
    await pc.click(`${R} .pside[data-me] .c-pic`);
    await wait(pc, () => document.querySelector('#proGames > li:first-child .report .sbdrawer:not([hidden]) .ringb[data-area="lane"]'), null, 'your rings, Laning from the timeline');
    assert.strictEqual(await pc.getAttribute(`${R} .pside[data-me]`, 'aria-expanded'), 'true');
    assert.deepStrictEqual(await texts(pc, `${open} .povr, ${open} .ringb`), ['69 Your game against 40 high elo Ahri middle games', '100 Fighting', '88 Damage', '88 Farming', '0 Vision', '67 Laning']);
    assert.deepStrictEqual(await pc.$$eval(`${open} .sbring`, (l) => l.map((e) => e.dataset.k)), ['good', 'good', 'good', 'good', 'bad', 'good'], 'green 60 and up, red under 40');
    assert.deepStrictEqual(await texts(pc, `${open} .pcard`), ['Your best KDA: 7.5 Better than 100% of high elo Ahri games.', 'Biggest leak Vision score a minute: 0.71 Behind 100% of high elo Ahri games.',
      'Next game Aim for 0.97 vision score a minute That’s their middle. Zed had 0.71.']);
    assert.strictEqual(await pc.locator(`${open} .pdet`).count(), 0, 'no ring open yet');
    // a ring opens its numbers: bars against high elo and where you rank among the 10; Fighting adds the Rift and your deaths
    await pc.click(`${open} .ringb[data-area="fight"]`);
    assert.strictEqual(await pc.getAttribute(`${open} .ringb[data-area="fight"]`, 'aria-pressed'), 'true');
    assert.deepStrictEqual(await texts(pc, `${open} .pdet .prow, ${open} .pdet .pten`), ['KDA 7.5 middle 4.7', 'Deaths 2 middle 3', 'Kill participation 100% middle 58%', 'Time dead 1:00 1st of 10', 'Skillshots dodged 20 2nd of 10', 'Allies saved 2 1st of 10']);
    assert.strictEqual(await pc.$eval(`${open} .pten .pfaces img[data-me]`, (i) => i.alt), 'Ahri', 'you lit among the faces');
    assert.deepStrictEqual(await pc.$eval(`${open} .fightmap`, (cv) => [cv.getAttribute('aria-label'), ...[[7400, 7400], [5500, 9000], [10000, 4500]].map(([x, y]) => [...cv.getContext('2d').getImageData(Math.round(x / 14870 * 480), Math.round((1 - y / 14870) * 480), 1, 1).data].join())]),
      ['Where on Summoner’s Rift you got kills (1), assists (1) and died (2)', '60,207,142,255', '255,107,107,255', '255,107,107,255']);
    assert.deepStrictEqual(await texts(pc, `${open} .pdeaths li`), ['8:10 Zed with Vi, in the river', '12:40 Zed with Vi, in the river']);
    assert.deepStrictEqual(await pc.$$eval(`${open} .pdeaths time`, (l) => l.map((t) => t.dataset.k)), ['bad', 'bad'], 'red before 14:00');
    await pc.click(`${open} .ringb[data-area="dmg"]`);
    assert.deepStrictEqual(await texts(pc, `${open} .pdet .prow, ${open} .pdet .pmore, ${open} .pdet .pten`), ['Damage a minute 953 middle 774', 'Share of team damage 43% middle 30%', 'Your damage by kind 11% physical · 78% magic · 11% true',
      'Skillshots hit 60 1st of 10', 'Damage to towers 4,500 1st of 10']);
    await pc.click(`${open} .ringb[data-area="farm"]`);
    assert.deepStrictEqual(await texts(pc, `${open} .pdet .pten`), ['Turret plates 1 1st of 10'], 'your own plates from the timeline, not Riot’s 3 (your team’s)');
    await pc.click(`${open} .ringb[data-area="vis"]`);
    assert.deepStrictEqual(await texts(pc, `${open} .pdet .prow, ${open} .pdet .pmore, ${open} .pdet .pten`), ['Vision score a minute 0.71 middle 0.97', '20 Vision score against Zed 20', 'Wards placed 11 1st of 10', 'Control wards 2 1st of 10', 'Wards destroyed 3 1st of 10']);
    await pc.click(`${open} .ringb[data-area="vis"]`);
    assert.strictEqual(await pc.locator(`${open} .pdet`).count(), 0, 'pressed again, it closes');
    // the lanes: one tag at most, an arrow to who won the lane; the gold graph with what happened when, your deaths on it
    assert.deepStrictEqual(await pc.$$eval(`${R} .lrow`, (l) => l.map((r) => [r.getAttribute('aria-label'), r.querySelector('.lmid').title, ...[...r.querySelectorAll('.pside .sbname')].map((n) => n.querySelectorAll('.tag').length)].join(' '))),
      ['Top  1 1', 'Jungle  1 1', 'Middle Middle: Ahri won the lane, 700 more gold at 14:00 1 1', 'Bottom  1 1', 'Support  1 1']);
    assert.strictEqual(await pc.$eval(`${R} .lrow[data-lane="MIDDLE"] .larrow`, (a) => a.dataset.side), 'us', 'the arrow points at your side');
    assert.deepStrictEqual(await pc.$$eval(`${R} .when span`, (l) => l.map((e) => `${e.dataset.row}${e.dataset.side} ${e.title}`)), ['0us 9:00: Your team took a dragon',
      '0them 14:00: Their team took the Rift Herald', '0us 15:00: Your team took a tower', '0them 16:40: Their team took a tower', '0us 21:00: Your team took a dragon', '0us 25:00: Your team took Baron',
      '0us 26:00: Your team took a tower', '0us 26:40: Your team took a tower', '1us 28:20: a fight, 2 for 1 in the middle lane'], 'objectives on top, fights of 3 kills or more under them (no Voidgrubs)');
    assert.deepStrictEqual(await pc.$$eval(`${R} .ldeath`, (l) => l.map((e) => e.title)), ['8:10: you died to Zed', '12:40: you died to Zed']);
    // someone else's drawer: their rings (too few high elo Zed games here), Copy runes, Copy items, Avoid; yours closes
    await pc.click(`${R} .pside:has(.sbname b:text-is("Shadow")) .c-pic`);
    assert.deepStrictEqual(await texts(pc, `${open} > *`), ['Shadow’s game Not enough high elo Zed games to compare with yet', 'Copy runes Copy items Avoid']);
    assert.strictEqual(await pc.locator(open).count(), 1, 'one drawer at a time');
    await pc.click(`${R} .pside:has(.sbname b:text-is("Shadow")) .c-pic`);
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
    await pc.click('#proQueues [data-q="all"]');
    await wait(pc, () => document.getElementById('h-proform').textContent === 'Last 20 games' && /Gold II/.test(document.getElementById('proRanks').textContent), null, 'all your games again');
    console.log('Profile: Rayan#EUW, level 300, Gold II, in the client, 13W 7L in 20 games, Ahri first; a report; Sniper looked up with 10 older games; Solo/Duo and Flex tabs (no TFT tab: What’s new 203)');
    assert.deepStrictEqual(await pc.$$eval('.nav', (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim())), ['Profile', 'Squad', 'Pregame', 'Game', 'Stats', 'TFT', 'Clips', 'Settings', 'Premade'], 'League’s pages in the sidebar on Profile, in the app, and Settings (no Proximity voice or Overlay: What’s new 207; Settings: 229)');
    // RE4 co-op: the helper's checks drawn as rows, and Play's answer
    await openPage(pc, 're4');
    await wait(pc, () => document.getElementById('re4Role').textContent === 'Host · Tailscale 100.101.102.103' && !document.getElementById('re4SignIn').hidden && document.querySelectorAll('#re4Conn .re4row .dot[data-h="good"]').length === 1
      && document.querySelector('#re4Priv .dot').dataset.h === 'ok' && document.querySelector('#re4Game .dot').dataset.h === 'idle' && document.getElementById('re4Steps').textContent.includes('it hosts by itself'), null, 'RE4 co-op checks');
    await pc.click('#re4Play');
    await wait(pc, () => document.getElementById('re4Note').textContent.endsWith('Starting RE4...'), null, 'RE4 Play');
    assert(await pc.evaluate(() => !document.getElementById('re4SetupBox').hidden && !document.getElementById('re4FwNote').hidden), 'RE4 Set up shows, with the firewall note');
    await pc.click('#re4Setup');
    await wait(pc, () => document.getElementById('re4SetupBox').hidden && document.getElementById('re4Note').textContent === 'This PC is set up to host.' && document.getElementById('re4SignIn').hidden, null, 'RE4 Set up');
    assert(await pc.evaluate(() => document.querySelector('#re4FriendList .dot').dataset.h === 'good' && document.getElementById('re4FriendList').textContent.includes('cutiecatty: online, 38 ms, in RE4')
      && !document.getElementById('re4Friends').hidden && document.getElementById('re4HostBox').hidden && document.getElementById('re4JoinPart').hidden), 'RE4 Friends: cutiecatty online with her ping');
    await openPage(pc, 're4'); // a slow status check is running: the click waits for it instead of being dropped
    await wait(pc, () => [...document.getElementById('re4Pick').options].map((o) => o.value).join() === 'Duo,Friend,Gamer,Agent,Sleepy,*' && document.getElementById('re4NameField').hidden, null, 'RE4 invite: pick from your friends');
    await pc.selectOption('#re4Pick', 'Duo');
    await pc.click('#re4Invite'); // no share link yet: nothing goes, the link field gets the focus
    assert(await pc.evaluate(() => document.activeElement.id === 're4Link' && document.getElementById('re4InviteBox').hidden), 'RE4 invite waits for the Tailscale link');
    await pc.fill('#re4Link', 'https://login.tailscale.com/admin/invite/abc');
    await pc.click('#re4Invite');
    await wait(pc, () => !document.getElementById('re4InviteBox').hidden && document.getElementById('re4InviteCode').value === 'RE4COOP2.for-Duo-https://login.tailscale.com/admin/invite/abc' && document.getElementById('re4Link').value === '', null, 'RE4 invite for a picked friend');
    await pc.selectOption('#re4Pick', '*');
    await pc.fill('#re4Name', 'Leon');
    await pc.fill('#re4Link', 'https://login.tailscale.com/admin/invite/def');
    await pc.click('#re4Invite');
    await wait(pc, () => !document.getElementById('re4InviteBox').hidden && document.getElementById('re4InviteCode').value === 'RE4COOP2.for-Leon-https://login.tailscale.com/admin/invite/def' && document.getElementById('re4Name').value === '', null, 'RE4 invite');
    // Play as: off until RE4 runs, then it sends the pick to their mod and the In the game row says connected
    assert(await pc.evaluate(() => !document.getElementById('re4CharBox').hidden && document.getElementById('re4CharGo').disabled && document.getElementById('re4InGame').textContent.includes('RE4 isn’t running')), 'RE4 Play as waits for the game');
    await pc.evaluate(() => { lpcClient.inRe4 = true; });
    await openPage(pc, 're4');
    await wait(pc, () => !document.getElementById('re4CharGo').disabled && document.getElementById('re4InGame').textContent.includes('Not connected yet'), null, 'RE4 in game, not connected');
    await pc.selectOption('#re4Char', 'Ada');
    await pc.click('#re4CharGo');
    await wait(pc, () => document.getElementById('re4Note').textContent === 'Switching you to Ada.' && document.getElementById('re4InGame').textContent.includes('Your friend is connectedNow playing as Ada')
      && document.querySelector('#re4InGame .dot').dataset.h === 'good', null, 'RE4 Play as Ada');
    await pc.evaluate(() => { lpcClient.inRe4 = false; });
    console.log('RE4 co-op: host checks in green, amber and idle, the next clicks, Play, Set up and Tailscale sign-in, a friend online, invites with a Tailscale share link, and Play as Ada with the connected line');
    assert(await pc.locator('.view[data-view="game"] .pagehead, #lcuNote, #drillBox').count() === 0, 'Game: no title, status line or CS drill (What’s new 200)');
    await openPage(pc, 'pregame');
    assert(await pc.locator('#preNote').isHidden(), 'no Start League or status line on the idle page (What’s new 202)');
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
    await wait(pc, () => !document.getElementById('tierBox').hidden && document.querySelectorAll('#tierRows tr').length === 3, null, 'the tier list');
    assert.strictEqual(await tierTab(), 'Middle');
    assert.strictEqual(await pc.textContent('#tierTipNote'), 'Middle in 50 Challenger and Grandmaster games our server counted from Riot, patch 25.20.', 'the games sentence, in the ? tip (What’s new 202)');
    assert(await pc.locator('#tierNote').isHidden());
    assert.deepStrictEqual(await tierRows(), ['Vi S 72% 18 · 36% picked', 'Ahri S 55% 40 · 80% picked', 'Lux S 58% 12 · 24% picked'], 'S tier only');
    await shot(pc, 'pregame-empty-board-tier-folded');
    await pc.click('#tierMore');
    await wait(pc, () => document.querySelectorAll('#tierRows tr').length === 4 && document.getElementById('tierMore').textContent === 'See less', null, 'See more');
    assert.deepStrictEqual(await tierRows(), ['Vi S 72% 18 · 36% picked', 'Ahri S 55% 40 · 80% picked', 'Lux S 58% 12 · 24% picked', 'Zed A 53% 30 · 60% picked']);
    await pc.click('#tierRoles [data-role="TOP"]');
    await wait(pc, () => document.querySelectorAll('#tierRows tr').length === 3 && /Garen/.test(document.getElementById('tierRows').textContent), null, 'the tier list for top');
    assert.deepStrictEqual(await tierRows(), ['Garen S 57% 30 · 60% picked', 'Lee Sin C 49% 47 · 94% picked', 'Darius D 45% 20 · 40% picked'], 'one S tier: the top 3, folded again');
    assert(await pc.locator('#tierMore').isHidden(), 'nothing more to see');
    await shot(pc, 'pregame');
    console.log('tier list: Middle (Vi, Ahri, Lux, Zed), then Top (Garen, Lee Sin, Darius)');
    // What's new 202: the draft board, always there outside champ select: both teams, a helper on every role
    const tryCalls = lcu.calls.length;
    await wait(pc, () => !document.getElementById('tdBox').hidden && document.querySelectorAll('#tdUs .slot').length === 5 && document.querySelectorAll('#tdThem .slot').length === 5 && !document.getElementById('dTop').hidden, null, 'the draft board');
    assert(await pc.locator('#tdBtn, #mxBox').count() === 0, 'no Try a draft button, no Matchup explorer');
    assert.deepStrictEqual(await texts(pc, '#tdUs .slot[data-on] .tctext small'), ['Middle'], 'your usual role picked');
    const boardFaces = (team) => pc.$$eval(`${team} .slot`, (l) => l.map((s) => [...s.querySelectorAll('.face')].map((f) => `${f.querySelector('img').alt} ${f.textContent}`).join(', ')));
    assert.deepStrictEqual(await boardFaces('#tdUs'), ['Garen Great, Lee Sin Risky, Darius Risky', 'Vi Risky', 'Ahri Great, Vi Great, Zed Great', '', 'Lux Great, Sona Good'], 'each of your roles: its best (up to 3) as faces, none off-role (no Zed at the bottom)');
    assert.deepStrictEqual(await boardFaces('#tdThem'), ['Garen Great, Lee Sin OK, Darius Risky', 'Vi Good', 'Vi Great, Zed Good, Ahri OK', '', 'Lux OK'], 'and theirs, from their side');
    const tryPick = async (slot, name) => {
      await pc.click(`${slot} .tcard`);
      await pc.fill('#dFind', name);
      await wait(pc, () => document.querySelectorAll('#dGrid .dchamp').length === 1, null, `${name} found`);
      await pc.click('#dGrid .dchamp');
      await pc.fill('#dFind', '');
    };
    await tryPick('#tdThem .slot:nth-child(3)', 'zed');
    await pc.click('#tdUs .slot:nth-child(1) .tcard');
    await pc.click('#tdUs .slot:nth-child(1) .face:has(img[alt="Garen"])');
    await wait(pc, () => document.querySelector('#tdThem .slot:nth-child(3) .tcard')?.dataset.c === '238' && document.querySelector('#tdUs .slot:nth-child(1) .tcard')?.dataset.c === '86', null, 'their Zed, and your Garen from a face');
    assert.deepStrictEqual(await texts(pc, '#tdUs .slot[data-on] .tctext small'), ['Top'], 'the slot stays picked');
    await pc.click('#tdUs .slot:nth-child(3) .tcard');
    await wait(pc, () => document.getElementById('dTopHead').textContent === 'Middle for your team' && document.querySelectorAll('#dTopRows .bigrow').length === 3, null, 'your middle');
    assert.strictEqual(await text(pc, '#dSub'), 'Best picks');
    assert.deepStrictEqual(await pc.$$eval('#dTopRows .bigrow', (l) => l.map((b) => b.innerText.replace(/\s+/g, ' '))), ['Lux Great Lane Even gold at 10 With You 3W 2L', 'Vi Great Lane With You Not played', 'Ahri Great Lane Even gold at 10 With You 6W 2L']);
    assert.deepStrictEqual(await pc.$$eval('#dGrid .dchamp', (l) => l.slice(0, 6).map((b) => `${b.querySelector('img').alt}${b.querySelector('.dsc') ? '' : ' (no score)'}${b.getAttribute('aria-disabled') === 'true' ? ' (off)' : ''}`)),
      ['Lux', 'Vi', 'Ahri', 'Zed (off)', 'Caitlyn (no score)', 'Darius (no score)'], 'ranked first, then every other champion A to Z; their Zed taken');
    assert.strictEqual(await text(pc, '#dNote'), 'Ranked by their high elo win rate and how each does with your team and against theirs. No score: few high elo games as middle.');
    assert(await pc.locator('#draft').isHidden(), 'the slots stand in for the draft rows');
    await pc.click('#tdThem .slot:nth-child(1) .tcard');
    await wait(pc, () => document.getElementById('dTopHead').textContent === 'Top for their team' && document.querySelectorAll('#dTopRows .bigrow').length === 2, null, 'their top: your Garen taken');
    assert.strictEqual(await text(pc, '#dSub'), 'What beats your team here');
    assert.deepStrictEqual(await pc.$$eval('#dTopRows .bigrow', (l) => l.map((b) => b.innerText.replace(/\s+/g, ' '))), ['Lee Sin OK Lane With Tier C', 'Darius Risky Lane With Tier D'], 'their side: Tier, not your games');
    await shot(pc, 'pregame-draft-board');
    if (process.env.SHOTS) { const vp = pc.viewportSize(); await pc.setViewportSize({ width: 390, height: 844 }); await shot(pc, 'pregame-draft-board-phone'); await pc.setViewportSize(vp); }
    await pc.click('#tdUs .slot:nth-child(1) .tcx');
    await wait(pc, () => !document.querySelector('#tdUs .slot:nth-child(1) img.tart') && document.querySelector('#tdUs .slot[data-on]') === document.querySelector('#tdUs .slot:nth-child(1)'), null, 'the x took Garen out');
    assert(!lcu.calls.slice(tryCalls).some(([m, p]) => m !== 'GET' && /champ-select/.test(p)), 'nothing sent to League');
    await pc.click('#tdClear');
    await wait(pc, () => !document.querySelector('#tdUs img.tart, #tdThem img.tart, #tdBans .bq img') && document.getElementById('tdClear').disabled, null, 'cleared');
    console.log('draft board: 5 slots a side with their faces, a face and a search fill slots, your middle and their bottom ranked, x and Clear, nothing sent to League');
    // What's new 210: every slot a splash card, and your bans at the top with ideas from the team you build
    assert.strictEqual(await pc.locator('#tdUs .slot:nth-child(1) .tcard.none').count(), 1, 'an empty slot is a dashed card');
    assert.deepStrictEqual(await texts(pc, '#tdUs .slot:nth-child(1) .tctext small'), ['Top'], 'with its role');
    const ideaNames = () => pc.$$eval('#tdBans .bideas .face img', (l) => l.map((i) => i.alt));
    await wait(pc, () => document.querySelectorAll('#tdBans .bideas .face').length === 3 && document.querySelectorAll('#tdBans .bq.none').length === 5, null, 'your bans: 5 empty squares, 3 ideas');
    const emptyIdeas = await ideaNames();
    await tryPick('#tdUs .slot:nth-child(1)', 'garen');
    await wait(pc, () => document.querySelector('#tdUs .slot:nth-child(1) img.tart')?.src.endsWith('/cdn/img/champion/splash/Garen_0.jpg'), null, 'a filled slot shows its splash');
    assert.strictEqual(await pc.$eval('#tdUs .slot[data-on] .tcard', (b) => getComputedStyle(b).borderTopColor === getComputedStyle(document.body).color), true, 'the picked slot’s card has a white border');
    await pc.click('#tdBans .bansbtn');
    await wait(pc, () => document.getElementById('dTopHead').textContent === 'Bans for your team' && document.getElementById('dSub').textContent === 'Ban ideas' && document.querySelectorAll('#dTopRows .bigrow').length === 3, null, 'the bans in the middle');
    assert(await pc.locator('#tdBans[data-on]').count() === 1 && await pc.locator('#tdUs .slot[data-on]').count() === 0, 'the bans row picked, no slot');
    await shot(pc, 'pregame-draft-board-bans-picked');
    const withGaren = await ideaNames();
    assert(!withGaren.includes('Garen'), 'no idea on the board');
    assert.notDeepStrictEqual(withGaren, emptyIdeas, 'your Garen changed the ideas');
    assert.deepStrictEqual(await pc.$$eval('#dTopRows .bigrow', (l) => l.map((b) => b.querySelector('.bighead b').textContent)), withGaren, 'the big rows are the same 3');
    assert(await pc.$eval('#dTopRows .bigrow', (b) => /Picked/.test(b.textContent) && /^as (top|jungle|middle|bottom|support)$/.test(b.querySelector('.as').textContent)), 'its role and how often it’s picked');
    assert.match(await text(pc, '#dNote'), /^Ranked by win rate, how much each beats your team, how often it’s picked and your own games against it\./);
    const firstBan = withGaren[0];
    await pc.click('#tdBans .bideas .face');
    await wait(pc, (n) => document.querySelector('#tdBans .bq img') && document.querySelector('#tdBans .bq').title === `Take back the ${n} ban` && document.getElementById('dSub').textContent === 'Next ban ideas'
      && document.querySelector(`#dGrid .dchamp img[alt="${n}"]`)?.parentElement.getAttribute('aria-disabled') === 'true' && ![...document.querySelectorAll('#tdBox .face img')].some((i) => i.alt === n), firstBan, 'a ban fills a square and greys that champion out everywhere');
    assert(!(await ideaNames()).includes(firstBan), 'the next idea moves up');
    await shot(pc, 'pregame-draft-board-one-ban');
    await pc.click('#tdUs .slot:nth-child(3) .tcard');
    await wait(pc, (n) => document.getElementById('dTopHead').textContent === 'Middle for your team' && document.querySelector(`#dGrid .dchamp img[alt="${n}"]`)?.parentElement.getAttribute('aria-disabled') === 'true', firstBan, 'banned in the slot’s grid too');
    await pc.click('#tdBans .bq:not(.none)');
    await wait(pc, () => document.querySelectorAll('#tdBans .bq.none').length === 5, null, 'the x took the ban back');
    for (let i = 0; i < 5; i++) {
      const before = await pc.locator('#tdBans .bq:not(.none)').count();
      await pc.click('#tdBans .bideas .face');
      await wait(pc, (n) => document.querySelectorAll('#tdBans .bq:not(.none)').length === n, before + 1, `ban ${before + 1}`);
    }
    await pc.click('#tdBans .bansbtn');
    await wait(pc, () => !document.querySelector('#tdBans .bideas .face') && document.querySelector('#dTopRows .bempty')?.textContent === 'All 5 bans are in. Take one back with its x to try another.'
      && [...document.querySelectorAll('#dGrid .dchamp')].every((b) => b.getAttribute('aria-disabled') === 'true') && document.querySelector('#tdBans .bansbtn small').textContent === 'All 5 in', null, 'all 5 bans are in');
    await shot(pc, 'pregame-draft-board-all-bans');
    if (process.env.SHOTS) { const vp = pc.viewportSize(); await pc.setViewportSize({ width: 390, height: 844 }); await shot(pc, 'pregame-draft-board-all-bans-phone'); await pc.setViewportSize(vp); }
    await pc.click('#dModes [data-mode="meta"]');
    await wait(pc, () => /^Ranked by their high elo win rate and how often they’re picked\./.test(document.getElementById('dNote').textContent), null, 'Meta ban ideas');
    await pc.click('#dModes [data-mode="balanced"]');
    await pc.click('#tdClear');
    await wait(pc, () => document.querySelectorAll('#tdBans .bq.none').length === 5 && !document.querySelector('#tdUs img.tart') && document.getElementById('tdClear').disabled, null, 'Clear empties the bans too');
    console.log('ban ideas: 3 from the team you build, a ban greys out everywhere, its x takes it back, 5 in stops the ideas, Clear; slots as splash cards');
    // Settings (What's new 207): its sections down the left, one shown at a time, opening on the one used last; a
    // setting flipped in each, saved and doing what it says
    await openPage(pc, 'settings');
    const secShown = () => pc.$$eval('.setsec', (l) => l.filter((x) => !x.hidden).map((x) => x.dataset.sec)), optNow = (k) => pc.evaluate((k) => JSON.parse(localStorage.getItem('lpc-opts'))[k], k);
    assert.deepStrictEqual(await pc.$$eval('#setList [data-sec]', (b) => b.filter((x) => x.checkVisibility()).map((x) => x.textContent.trim())), ['Overlay', 'Callouts', 'Champ select', 'Clips', 'Voice', 'League', 'Look', 'App'], 'every section in the app with League’s client');
    assert.deepStrictEqual(await secShown(), ['overlay'], 'Overlay the first time');
    await pc.check('#optMayhemAugs');
    assert(await optNow('mayhemAugs') === true && await pc.isVisible('#optMayhemRating'), 'Overlay: Mayhem augment ratings on, saved, its choice showing');
    await pc.uncheck('#optMayhemAugs');
    await pc.click('#setList [data-sec="callouts"]');
    assert.deepStrictEqual(await secShown(), ['callouts'], 'one section at a time');
    await pc.check('#optSpeakCalls');
    assert(await optNow('speakCalls') === true && await pc.isVisible('#optCallVoice'), 'Callouts: Read them out loud on, saved, its voice showing');
    await pc.uncheck('#optSpeakCalls');
    await pc.click('#setList [data-sec="champ"]');
    await pc.uncheck('#optRunes');
    assert(await optNow('runes') === false && await pc.isHidden('#optRuneSrc'), 'Champ select: runes off, saved, their choices hidden');
    await pc.check('#optRunes');
    await pc.click('#setList [data-sec="clips"]');
    const [qWas, qNote] = [await pc.inputValue('#optClipQ'), await pc.textContent('#clipQNote')];
    await pc.selectOption('#optClipQ', '720');
    assert(await optNow('clipQ') === '720' && await pc.textContent('#clipQNote') !== qNote, 'Clips: 720p saved, and the size of 30 minutes follows');
    await pc.selectOption('#optClipQ', qWas);
    await pc.click('#setList [data-sec="voice"]');
    await pc.uncheck('#optSurround');
    assert.strictEqual(await optNow('surround'), false, 'Voice: 3D sound off, saved');
    await pc.check('#optSurround');
    const rangeWas = await pc.inputValue('#range'), setRange = (v) => pc.$eval('#range', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, v);
    await setRange('1500');
    assert(await pc.textContent('#rangeOut') === '1,500 units' && await pc.evaluate(() => localStorage.getItem('lpc-range')) === '1500', 'Voice: the hearing range kept, and shown');
    await setRange(rangeWas);
    await pc.click('#setList [data-sec="league"]');
    await pc.check('#optRecord');
    assert(await optNow('record') === true && await pc.evaluate(() => lpcClient.calls.includes('record true')), 'League: test recordings on, saved, and the app told');
    await pc.uncheck('#optRecord');
    await pc.click('#setList [data-sec="look"]');
    await pc.fill('#optZoom', '1.25');
    assert(await optNow('zoom') === 1.25 && await pc.evaluate(() => document.documentElement.style.getPropertyValue('--zoom')) === '1.25', 'Look: the app at 125%, saved');
    await pc.fill('#optZoom', '1');
    await pc.click('#setList [data-sec="app"]');
    await pc.check('#optJustLeague');
    assert(await optNow('justLeague') === true && await pc.evaluate(() => document.documentElement.classList.contains('just-league')) && await pc.isHidden('#setList [data-sec="voice"]'), 'App: Just League on, saved, and no Voice section');
    await pc.uncheck('#optJustLeague');
    assert(await pc.isVisible('#setList [data-sec="voice"]'), 'Voice back with rooms');
    await openPage(pc, 'profile');
    await openPage(pc, 'settings');
    assert.deepStrictEqual(await secShown(), ['app'], 'Settings opens on the section used last');
    console.log('Settings: 8 sections, one at a time, opening on the last; a setting in each saved and working');
    await preSettings();
    await pc.check('#optRemote');
    await openPage(pc, 'voice');
    await pc.click('#createBtn'); // a room, for the mic: clips mix it in
    await wait(pc, () => lpc.slot() >= 0, null, 'a room');

    // ---- the phone remote's QR card under its switch (What's new 215): the code and the link, Copy link, and a new code
    // only after Make a new code; then the phone connects
    await preSettings();
    await wait(pc, () => !document.getElementById('remoteCard').hidden && /remote\.html/.test(document.getElementById('remoteLink').href), null, 'the QR card');
    assert(await pc.evaluate(() => !document.getElementById('remoteBox') && document.getElementById('optRemote').closest('label').nextElementSibling === document.getElementById('remoteCard')), 'the QR card right under the switch, no panel of its own');
    const dark = await pc.evaluate(() => { const d = document.getElementById('qr').getContext('2d').getImageData(0, 0, 232, 232).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) n++; return n; });
    assert(dark > 3000, `the QR code is drawn (${dark} dark pixels)`);
    const oldLink = await pc.getAttribute('#remoteLink', 'href');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await pc.click('#remoteCopy');
    await wait(pc, () => document.getElementById('remoteCopy').textContent === 'Copied', null, 'Copied');
    assert.strictEqual(await pc.evaluate(() => navigator.clipboard.readText()), oldLink, 'the link copied');
    await wait(pc, () => document.getElementById('remoteCopy').textContent === 'Copy link', null, 'Copy link again after 2 s');
    await pc.click('#remoteNew');
    assert(await pc.isVisible('#remoteAsk') && await pc.isHidden('#remoteBtns'), 'New code asks first, in the card');
    assert.strictEqual(await text(pc, '#remoteAsk p'), 'A new code stops the old link. Phones using it scan again.');
    await pc.click('#remoteKeep');
    assert(await pc.isHidden('#remoteAsk') && (await pc.getAttribute('#remoteLink', 'href')) === oldLink, 'Keep this one: the same code');
    await pc.click('#remoteNew');
    await pc.click('#remoteRenew');
    await wait(pc, (o) => document.getElementById('remoteLink').href !== o && document.getElementById('remoteState').textContent === 'New code made. Scan it again on your phone.', oldLink, 'a new code');
    await shot(pc, 'settings-phone-remote-card');
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
    await wait(phone, () => !document.getElementById('play').hidden && !document.getElementById('menu').hidden && document.querySelector('#m-league').getAttribute('aria-current') === 'page', null, 'the phone on Play');
    assert(!(await phone.evaluate(() => [...document.querySelectorAll('h1, header')].some((e) => /Phone remote|Connected/.test(e.textContent)))), 'no Phone remote or Connected header');
    console.log(`phone remote: QR card (${dark} dark pixels), Copy link, a new code only after Make a new code, the phone connected`);
    // your colours on the phone (What's new 215): the PC's theme and its animations setting
    const phoneVar = (k) => phone.evaluate((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim(), k);
    assert.strictEqual(await phoneVar('--accent'), '#d9202d', 'red and black, as on the PC');
    const setPc = (sel, v) => pc.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (e.type === 'radio') e.checked = true; else e.value = v; e.dispatchEvent(new Event('change')); }, [sel, v]);
    await setPc('input[name="theme"][value="league"]');
    await wait(phone, () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#0ac8b9' && getComputedStyle(document.body).backgroundColor === 'rgb(1, 10, 19)', null, 'League blue and gold on the phone');
    await setPc('input[name="theme"][value="red"]');
    await wait(phone, () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#d9202d', null, 'red and black again');
    // a press shrinks a button a little; with Reduced motion on the PC nothing moves (Settings opens on the release)
    const press = async (moves) => {
      const b = await phone.locator('#m-settings').boundingBox();
      await phone.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await phone.mouse.down();
      await (moves ? wait(phone, () => getComputedStyle(document.getElementById('m-settings')).transform === 'matrix(0.96, 0, 0, 0.96, 0, 0)', null, 'the press') : phone.waitForTimeout(300));
      const t = await phone.$eval('#m-settings', (e) => getComputedStyle(e).transform);
      await phone.mouse.up();
      return t;
    };
    await press(true);
    await setPc('#optMotion', 'reduced');
    await wait(phone, () => document.documentElement.dataset.motion === 'reduced' && getComputedStyle(document.documentElement).getPropertyValue('--m').trim() === '0', null, 'reduced motion on the phone');
    assert.match(await press(false), /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/, 'no transforms with Reduced motion');
    await setPc('#optMotion', 'auto');
    await wait(phone, () => !document.documentElement.dataset.motion, null, 'the phone’s own motion setting again');
    console.log('phone remote: your theme (League blue and gold, then red) and reduced motion from the PC');
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
    assert.deepStrictEqual((await phone.$$eval('#settings .set:not([hidden]) b', (l) => l.map((b) => b.textContent))).slice(0, 3), ['Accept matches for me', 'Tell me when a match is found', 'Ring']);
    assert.strictEqual(await text(phone, '#settings .end'), 'Anyone with your link can use your League from their phone. Keep it to yourself.');
    await shot(phone, 'phone-settings');
    // room chat: you're in a room, so it's on the phone, and what the phone writes goes to the room as yours
    await phone.click('#m-chat');
    await wait(phone, () => !document.getElementById('chat').hidden && !document.getElementById('roomBox').hidden && document.getElementById('chatLog').children.length === 0, null, 'room chat on the phone');
    await phone.fill('#chatText', 'brb, in queue');
    await phone.click('#chatForm button');
    await wait(pc, () => /Rayan\s*brb, in queue/.test(document.getElementById('chatLog').textContent), null, 'the phone’s message in the room chat');
    await wait(phone, () => /^Rayan \d\d:\d\d( [AP]M)?brb, in queue$/.test(document.querySelector('#chatLog li:last-child')?.textContent) && document.getElementById('chatText').value === '', null, 'the message on the phone, with its time');
    await shot(phone, 'phone-chat');
    console.log('phone remote: notifications on (a push shows Match found) and off, room chat written from the phone');
    // Your League on the phone as pictures (What's new 215): each rank's crest in a ring of its LP, your last 10 games as
    // their champions with a win or a loss, and a link to your full profile
    await phone.click('#m-league');
    await wait(phone, () => !document.getElementById('me').hidden && document.querySelectorAll('#meRanks .crest').length === 2 && document.querySelectorAll('#last10 > span').length === 10
      && /profile\.html#./.test(document.getElementById('meProfile').href), null, 'your League on the phone');
    assert.deepStrictEqual(await phone.$$eval('#meRanks .crest', (l) => l.map((c) => c.getAttribute('aria-label'))), ['Solo/Duo: Gold II, 45 LP', 'Flex: Unranked']);
    assert.match(await phone.getAttribute('#meRanks .crest img', 'src'), /TFT_Regalia_Gold\.png$/, 'Gold’s crest');
    assert.match(await phone.getAttribute('#last10 > span', 'aria-label'), /^Ahri: (won|lost), \d+\/\d+\/\d+/);
    assert.strictEqual(await phone.locator('#last10 > span > img').count(), 10, 'their champions’ faces');
    assert(await phone.isHidden('#meToday'), 'no ranked games today');

    // ---- the queue: a Practice Tool game in one click outside a lobby, Find match in a lobby you lead, Stop from the phone
    await openPage(pc, 'pregame');
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
    // What's new 215, Play from your phone: League's games as pills, and outside a lobby a tap makes one
    await wait(phone, () => [...document.querySelectorAll('#games .pill')].map((b) => b.textContent).join() === 'Draft Pick,Ranked Solo/Duo,ARAM,Intro', null, 'the games on the phone');
    assert.strictEqual(await text(phone, '#playNote'), 'Pick a game to make a lobby.');
    assert(await phone.isHidden('#rolesBox') && await phone.isHidden('#inviteBox') && await phone.isHidden('#leave') && await phone.isHidden('#queueBtn'), 'no roles, friends, Leave or Find match outside a lobby');
    await phone.click('#games .pill:text-is("ARAM")');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST').length === 2, 'an ARAM lobby from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST')[1][2], { queueId: 450 });
    await pc.selectOption('#queuePick', '420');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST').length === 3, 'a Ranked Solo/Duo lobby');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST')[2][2], { queueId: 420 });
    lcu.lobby = { localMember: { isLeader: true, puuid: ME, firstPositionPreference: 'MIDDLE', secondPositionPreference: 'UNSELECTED' }, gameConfig: { isCustom: false, queueId: 420, showPositionSelector: true },
      members: [{ puuid: ME, gameName: 'Rayan', summonerIconId: 29 }, { puuid: 'ally1', gameName: 'Friend', summonerIconId: 30 }], invitations: [] };
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
    assert.deepStrictEqual(await texts(pc, '#friendRows tr'), ['Duo #EUW Online Invite', 'Gamer #EUW In a game Invite'], 'name, #tag beside it, what they’re doing');
    await pc.click('#friendRows tr:first-child button');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST').length === 1, 'Duo invited');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST')[0][2], [{ toSummonerId: 31, toPuuid: 'duo1' }]);
    await wait(pc, () => document.querySelector('#friendRows tr:first-child button').textContent === 'Invited' && document.querySelector('#friendRows tr:first-child button').disabled, null, 'Invited');
    await shot(pc, 'pregame-lobby');
    // the lobby on the phone: the game filled, your roles (the one in the other row swaps in; Fill needs no second),
    // your friends there and online, one invited from the phone, and Find match
    await wait(phone, () => document.querySelector('#games .pill[aria-pressed="true"]')?.textContent === 'Ranked Solo/Duo' && document.getElementById('roleLine').textContent === 'Top, then Middle', null, 'the lobby on the phone');
    const roleRows = () => phone.$$eval('#roleRows .rrow', (l) => l.map((r) => `${r.firstChild.textContent} ${[...r.querySelectorAll('[aria-pressed="true"]')].map((b) => b.title).join()}`));
    assert.deepStrictEqual(await roleRows(), ['First Top', 'Second Middle']);
    const put2 = lcu.calls.length, puts = () => callsTo(/position-preferences$/, 'PUT', put2).map((c) => c[2]);
    await phone.click('#roleRows [aria-label="Second role: Top"]');
    await until(() => puts().length === 1, 'the roles swapped from the phone');
    await wait(phone, () => document.getElementById('roleLine').textContent === 'Middle, then Top', null, 'the swap on the phone');
    await phone.click('#roleRows [aria-label="First role: Fill"]');
    await wait(phone, () => document.querySelectorAll('#roleRows .rrow').length === 1 && document.getElementById('roleLine').textContent === 'Fill', null, 'Fill, and no second');
    await phone.click('#roleRows [aria-label="First role: Middle"]');
    await until(() => puts().length === 3, 'Middle from the phone');
    assert.deepStrictEqual(puts(), [{ firstPreference: 'MIDDLE', secondPreference: 'TOP' }, { firstPreference: 'FILL', secondPreference: 'UNSELECTED' }, { firstPreference: 'MIDDLE', secondPreference: 'UNSELECTED' }]);
    const phoneFriends = () => phone.$$eval('#friends .friend', (l) => l.map((b) => b.innerText.replace(/\s+/g, ' ').trim() + (b.disabled ? ' (off)' : '')));
    await wait(phone, () => document.querySelectorAll('#friends .friend').length === 3, null, 'friends on the phone');
    assert.deepStrictEqual(await phoneFriends(), ['Duo Invited (off)', 'Friend Joined (off)', 'Gamer Invite']);
    await phone.click('#friends .friend:has-text("Gamer")');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST').length === 2, 'Gamer invited from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby\/invitations$/, 'POST')[1][2], [{ toSummonerId: 32, toPuuid: 'gamer1' }]);
    await wait(phone, () => document.querySelector('#friends .friend:last-child')?.innerText.replace(/\s+/g, ' ').trim() === 'Gamer Invited', null, 'Invited on the phone');
    assert.deepStrictEqual([await text(phone, '#queueBtn'), await phone.getAttribute('#queueBtn', 'class')], ['Find match', 'big red']);
    await shot(phone, 'phone-play');
    await pc.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'POST').length === 1, 'Find match');
    lcu.search = { timeInQueue: 65.4, estimatedQueueTime: 120 };
    lcu.phase = 'Matchmaking';
    await league({ inGame: false, phase: 'Matchmaking' });
    await wait(pc, () => document.getElementById('queueState').textContent === 'Finding a match: 1:05, usually about 2:00.' && document.getElementById('queueBtn').textContent === 'Stop', null, 'finding a match');
    await wait(phone, () => !document.getElementById('finding').hidden && document.getElementById('qTime').textContent === '1:05' && document.getElementById('queueBtn').textContent === 'Stop', null, 'the queue on the phone');
    assert.deepStrictEqual([await text(phone, '#qEst'), await text(phone, '#qLine')], ['Usually about 2:00', 'Ranked Solo/Duo · Middle']);
    await wait(phone, () => [...document.querySelectorAll('#party span')].map((e) => e.textContent).join() === 'Rayan,Friend', null, 'your party on the phone');
    await shot(phone, 'phone-finding');
    await phone.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'DELETE').length === 1, 'Stop from the phone');
    // and Leave lobby: here, and the phone's Leave
    lcu.phase = 'Lobby';
    await league({ inGame: false, phase: 'Lobby' });
    await wait(pc, () => !document.getElementById('lobbyLeave').hidden, null, 'Leave lobby');
    await wait(phone, () => !document.getElementById('leave').hidden && document.getElementById('finding').hidden, null, 'Leave on the phone');
    await phone.click('#leave');
    await until(() => callsTo(/^\/lol-lobby\/v2\/lobby$/, 'DELETE').length === 1, 'the lobby left from the phone');
    console.log('queue: a Practice Tool game in one click, a lobby for the game picked here or on the phone, your roles here and on the phone, friends invited from both, Find match here, Stop and Leave from the phone');

    // ---- ready checks: accepted here, on the phone, then for you
    await openPage(pc, 'voice');
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
    await wait(phone, () => !document.getElementById('found').hidden && /^\d+$/.test(document.getElementById('rcLeft').textContent) && !document.getElementById('accept').hidden, null, 'the new ready check on the phone'); // not the last one's accepted
    assert(await phone.isHidden('#menu'), 'Match found over everything: no menu');
    assert.deepStrictEqual([await phone.getAttribute('#accept', 'class'), await text(phone, '#rcGame')], ['big red', 'Ranked Solo/Duo']);
    await shot(phone, 'phone-match-found');
    await phone.click('#accept');
    await wait(phone, () => document.getElementById('rcWait').textContent === 'Waiting for everyone to accept' && !document.getElementById('accepted').hidden && document.getElementById('accept').hidden, null, 'accepted from the phone');
    assert(await phone.evaluate(() => buzzes.length >= 1 && buzzes.every((b) => b.length === 7)), 'the phone buzzed for the match');
    await until(() => callsTo(/ready-check\/accept$/, 'POST').length === 2, 'the accept from the phone sent to League');
    await backToQueue();
    await phone.click('#m-settings');
    await phone.check('#auto');
    await wait(pc, () => document.getElementById('optAutoAccept').checked, null, 'auto-accept turned on from the phone');
    await phone.click('#m-league');
    assert(!pushes.some(([, p]) => p.endsWith('/ring')), 'no notification for a phone that has the remote on its screen');
    const onScreen = (v) => phone.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    await onScreen('hidden'); // the phone locked
    await wait(pc, () => lpc.lcu().phones === 1 && lpc.lcu().seen === 0, null, 'the PC to know the phone isn’t looking');
    // the PC's 1 s tick back in the queue first (the phone shows the queue only after it), so it sees a new match found
    await wait(phone, () => !document.getElementById('finding').hidden && /^\d+:\d\d$/.test(document.getElementById('qTime').textContent), null, 'the PC back in the queue');
    await readyCheck();
    await pc.waitForTimeout(2500); // two of the PC's 1 s ticks at timer 2: not yet (What's new 233)
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 2, 'not accepted with 10 s left');
    lcu.rc.timer = 9; // 3 of League's 12 seconds left
    await wait(pc, () => lpc.toasts().includes('Match found: accepted it for you'), null, 'accepted for you with 3 s left');
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 3);
    await until(() => pushes.some(([m, p]) => m === 'POST' && p === `/push/${code}/ring`), 'the notification for a phone that isn’t looking');
    assert.strictEqual(pushes.filter(([, p]) => p.endsWith('/ring')).length, 1);
    await onScreen('visible');
    await backToQueue();
    await readyCheck();
    await wait(pc, () => /\d+ s left/.test(document.getElementById('rcState').textContent), null, 'the next ready check');
    await pc.click('#declineBtn');
    lcu.rc.timer = 9;
    await pc.waitForTimeout(2500);
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 3, 'not accepted over your Decline');
    await pc.evaluate(() => { const c = document.getElementById('optAutoAccept'); c.checked = false; c.dispatchEvent(new Event('change')); });
    console.log('ready check: accepted on the PC, on the phone, and for you with 3 s left (turned on from the phone), never over your Decline');

    // ---- champ select
    champSelect(777);
    lcu.rc = null;
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    // What's new 172: each a short card (champion and role, rank and last 20, spells, one tag); a click opens the rest
    await wait(pc, () => !document.getElementById('csBox').hidden && document.querySelectorAll('#csRows .cscard').length === 5 && [...document.querySelectorAll('#csRows .csline')].filter((l) => /^Gold II · \d+W \d+L$/.test(l.textContent)).length === 3 && /hovering/.test(document.getElementById('csRows').textContent), null, 'champ select with ranks');
    const faces = await texts(pc, '#csRows .csface');
    assert.strictEqual(faces.length, 5);
    // What's new 198: no page title, status box, heading or status line on show; Dodge, Hover and Lock in on one bar
    // along the window's bottom edge, the popups above it
    const top = await pc.evaluate(() => {
      const v = document.querySelector('.view[data-view="pregame"]'), shown = (e) => !!e && e.getBoundingClientRect().height > 1, bar = document.querySelector('#csBox .csbar').getBoundingClientRect();
      return { head: !!v.querySelector('.pagehead, h1, #h-cs'), note: shown(document.getElementById('preNote')), turn: shown(document.getElementById('csTurn')),
        dodge: !!document.querySelector('.csbar #dodgeBtn'), barAt: Math.round(document.querySelector('main').getBoundingClientRect().bottom - bar.bottom), toasts: Math.round(bar.top - document.getElementById('toasts').getBoundingClientRect().bottom) };
    });
    assert.deepStrictEqual([top.head, top.note, top.turn, top.dodge, top.barAt], [false, false, false, true, 0], JSON.stringify(top));
    assert(top.toasts >= 8, `the popups above the bar: ${top.toasts}`);
    assert.match(faces[0], /^Your duo Garen Top · hovering Gold II · 6W 14L$/, 'one tag, the most important: Friend is in 20 of your games, so your duo (What’s new 189)');
    assert.match(faces[4], /^Autofill: usually \w+ Thresh Support · hovering Gold II · \d+W \d+L$/);
    assert.doesNotMatch(faces.join(), /Premade|smurf|Comfort pick|Seen before/);
    assert.match(faces[1], /Name hidden by Riot/);
    assert.match(faces[3], /Name hidden by Riot/);
    assert.match(faces[2], /^You /);
    assert.deepStrictEqual(await pc.$$eval('#csRows .csface', (l) => l.map((b) => b.title)), ['Friend#EUW', '', 'Rayan#EUW', '', 'Hooks#EUW'], 'their Riot ID on a hover');
    assert.deepStrictEqual(await pc.$$eval('#csRows .cscard[data-me] .csspell', (l) => l.map((i) => i.alt)), ['Flash', 'Ignite'], 'your spells on your card');
    assert.strictEqual(await pc.locator('#csRows .csspell').count(), 10, 'everyone’s spells');
    await wait(pc, () => /Hooks#EUW .*Autofill: usually \w+ \(support in 0 of 20\).*Swap positions/.test(document.querySelector('#csRows .cscard:nth-child(5) .csmore').innerText.replace(/\s+/g, ' ')), null, 'Hooks asks for a swap: their card opens by itself');
    await pc.click('#csRows .cscard:nth-child(1) .csface');
    await wait(pc, () => document.querySelectorAll('#csRows .csmore').length === 1 && !!document.querySelector('#csRows .cscard:nth-child(1) .csmore'), null, 'Friend’s card open, Hooks’s closed');
    const friendMore = (await texts(pc, '#csRows .csmore'))[0];
    assert.match(friendMore, /Friend#EUW .*Top.*hovering Garen.*Gold II · 45 LP.*Flex: Silver I · 10 LP.*Last 20: 6W 14L.*Garen: 8 games, 75% won.*6 wins in a row.*Comfort pick.*Seen before: 20 with you \(13W 7L\)/);
    assert.deepStrictEqual(await embs(pc, '#csRows .emb'), ['TFT_Regalia_Gold.png'], 'the emblem by their rank');
    assert(!lcu.calls.some(([, p]) => /hidden1/.test(p)), 'nobody whose name Riot hides is looked up');
    // What's new 189: who is picking: your card lit with the time on it, the status line in words only
    assert.strictEqual(await text(pc, '#csTurn'), 'Your turn to ban.');
    assert.match(await text(pc, '#csRows .cscard[data-me][data-turn] .turnpill'), /^Your turn\s+0:(30|29|28)$/);
    assert.strictEqual(await pc.locator('#csRows .cscard[data-turn]').count(), 1);
    assert.strictEqual(await pc.locator('#csClock').count(), 0, 'no big clock');
    await shot(pc, 'pick-helper-ban-phase');
    await wait(pc, () => lpc.toasts().includes('Your turn to ban!'), null, 'the turn alarm');
    await wait(phone, () => buzzes.some((b) => b.length === 3), null, 'the turn alarm on the phone');
    // the phone: both teams over their champions' art as League shows them (no name Riot hides), whose turn it is, the
    // bans and the seconds left; bans for you, and every champion found by name
    const seats = (id) => phone.$$eval(`#${id} .tile`, (l, id) => l.map((t) => t.getAttribute('aria-label') + (t.hasAttribute('data-me') ? ' (me)' : '') + (id === 'team' && t.hasAttribute('data-locked') ? ' (locked)' : '')), id);
    const grid = () => phone.$$eval('#grid button', (l) => l.map((b) => b.textContent + (b.disabled ? ' (off)' : '')));
    await wait(phone, () => document.querySelectorAll('#team .tile').length === 5 && /^\d+$/.test(document.getElementById('clock').textContent), null, 'champ select on the phone');
    assert.deepStrictEqual(await seats('team'), ['Friend, Garen, Top', 'Jungle', 'You, Banning (me)', 'Bottom', 'Hooks, Thresh, Support']);
    assert.deepStrictEqual(await seats('them'), Array(5).fill('Nobody yet'));
    assert.match(await phone.getAttribute('#team .tile:first-child img', 'src'), /\/cdn\/img\/champion\/loading\/Garen_0\.jpg$/, 'Garen’s art on Friend’s tile');
    assert.strictEqual(await text(phone, '#turn'), 'Your turn to ban');
    assert(+(await text(phone, '#clock')) <= 30);
    assert.strictEqual(await phone.locator('#ourBans > *').count(), 1, 'Friend’s ban');
    await wait(phone, () => [...document.querySelectorAll('#picks button')].map((b) => b.textContent).join() === 'Darius,Vi,Zed', null, 'bans for you on the phone');
    assert.strictEqual(await text(phone, '#picksHead'), 'Bans for you');
    assert.strictEqual(await text(phone, '#lock'), 'Ban');
    assert(await phone.locator('#lock').isDisabled(), 'nothing hovered yet');
    assert(await phone.isHidden('#mine'), 'no role filter for bans');
    assert.deepStrictEqual(await grid(), ['Ahri', 'Caitlyn', 'Darius', 'Garen', 'Jinx', 'Lee Sin', 'Lux', 'Sona', 'Thresh', 'Vi', 'Zed']);
    await shot(phone, 'phone-ban');
    await phone.fill('#q', 'lu');
    await wait(phone, () => [...document.querySelectorAll('#grid button')].map((b) => b.textContent).join() === 'Lux', null, 'the search on the phone');
    await phone.fill('#q', 'qq');
    await wait(phone, () => !document.querySelector('#grid button') && !document.getElementById('noMatch').hidden, null, 'nothing found');
    await phone.fill('#q', '');
    // trades: ask Friend for their champion here, take Hooks's position swap on the phone
    await pc.click('#csRows .cscard:first-child button:has-text("Ask to swap champions")');
    await until(() => callsTo(/champion-swaps\/5\/request$/, 'POST').length === 1, 'the champion trade asked');
    await wait(pc, () => /Cancel the champions swap/.test(document.getElementById('csRows').textContent), null, 'the trade sent');
    await wait(phone, () => [...document.querySelectorAll('#trades button')].some((b) => b.textContent === 'Swap positions') && /You asked Friend to swap champions/.test(document.getElementById('trades').textContent), null, 'the trades on the phone');
    assert.match(await text(phone, '#trades'), /Hooks wants to swap positions/);
    await phone.click('#trades button:has-text("Swap positions")');
    await until(() => callsTo(/position-swaps\/6\/accept$/, 'POST').length === 1, 'the position trade taken from the phone');
    assert.strictEqual(await text(pc, '#pickLock'), 'Ban');
    assert(await pc.locator('#dTop').isHidden(), 'no top 3 while banning');
    assert(await pc.locator('#picks').isHidden(), 'no picks while banning');
    // bans for you: the champion you lose to most, then the strongest middles in high elo (not Ahri or Lux: you play
    // them); hover Darius by name, then ban him from his button
    assert.strictEqual(await pc.locator('#bansHead').textContent(), 'Bans for you');
    assert.deepStrictEqual(await texts(pc, '#bans button'), ['Darius You lost 3 of 4 against it', 'Vi High elo: 72% of 18 games, middle', 'Zed High elo: 53% of 30 games, middle']);
    await pc.fill('#anyChamp', 'Darius');
    await pc.click('#hoverBtn');
    await wait(pc, () => /hovering Darius/.test(document.getElementById('csTurn').textContent), null, 'the ban hovered');
    // What's new 192: League saying no to a ban or lock in shows its reason as a toast (and on the phone), not nothing
    lcu.noLock = true;
    await pc.click('#pickLock');
    await wait(pc, () => lpc.toasts().includes('League didn’t ban Darius: Invalid action.'), null, 'League’s reason for no ban');
    await wait(phone, () => document.getElementById('toast').textContent === 'League didn’t ban Darius: Invalid action.', null, 'the reason on the phone');
    lcu.noLock = false;
    const asksAt = lcu.calls.length;
    await pc.click('#bans button:has-text("Darius")');
    await wait(pc, () => /Your turn to pick/.test(document.getElementById('csTurn').textContent), null, 'my pick');
    assert.deepStrictEqual(callsTo(/^\/lol-champ-select\/v1\/session\/actions\/3$/, 'PATCH').pop()[2], { championId: 122, completed: true }, 'banned in one call: the champion and done together');
    assert.deepStrictEqual(flatActions().find((a) => a.id === 3), { id: 3, actorCellId: 2, type: 'ban', completed: true, isInProgress: false, championId: 122 });
    // What's new 222: once a ban goes in, League is asked again what you can pick and ban
    await until(() => callsTo(/pickable-champion-ids$/, 'GET', asksAt).length > 0 && callsTo(/bannable-champion-ids$/, 'GET', asksAt).length > 0, 'what you can pick and ban asked again after the ban');
    // the best picks for you, with why: Lux beat Zed (their middle now) in high elo, Ahri's your best, Vi's strong in
    // high elo but new to you. Garen and Sona aren't middle, Zed is taken
    // What's new 189: the top 3 first, above the draft rows, a word each and no numbers, why as pictures
    await wait(pc, () => document.querySelectorAll('#dTopRows .bigrow').length === 3 && /Against Zed in lane/.test(document.querySelector('#dTopRows .bigrow').title), null, 'the top 3 against Zed');
    assert(await pc.evaluate(() => !!(document.getElementById('dTop').compareDocumentPosition(document.getElementById('draft')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the top 3 above the draft rows');
    assert(await pc.locator('#picks').isHidden(), 'Best picks for you folds into the top 3');
    assert.strictEqual(await text(pc, '#dTopHead'), 'Top 3 for Middle');
    const top3 = await pc.$$eval('#dTopRows .bigrow', (l) => l.map((b) => [b.querySelector('.bighead').textContent, [...b.querySelectorAll('.wg > small:first-child')].map((x) => x.textContent).join('/'), b.querySelector('.blk') ? b.querySelector('.blk').childElementCount : 0, [...b.querySelectorAll('.wcap')].map((x) => x.textContent).join('/')].join(' | ')));
    assert.deepStrictEqual(top3, ['LuxGreat | Lane/Team/You/With Friend | 5 | Even gold at 10/3W 2L/3W 2L', 'AhriGreat | Lane/Team/You/With Friend | 8 | Even gold at 10/6W 2L/6W 2L', 'ViGreat | Lane/Team/You/With Friend | 0 | Not played/No games'],
      'Lux beat Zed in high elo, Ahri’s your best, Vi’s strong in high elo but new to you; your games with Friend, your duo');
    assert.doesNotMatch(top3.join(), /%/, 'no percentages');
    assert.deepStrictEqual(await pc.$$eval('#dTopRows .bigrow', (l) => l.map((b) => b.querySelector('.fm i').className)), ['up', '', ''], 'Lux won with Garen in high elo');
    assert(highAsked.includes('238/MIDDLE'), 'Zed’s high elo games in the middle asked for');
    // the draft: both teams by role with their scores, and every champion ranked for your role, middle: Lux beat Zed in
    // high elo and won with Garen, Vi's strong in high elo, Zed's taken and Ahri lost to Zed
    const dGrid = () => pc.$$eval('#dGrid .dchamp', (l) => l.map((b) => `${b.querySelector('img').alt} ${b.querySelector('.dsc').textContent}${b.getAttribute('aria-disabled') === 'true' ? ' (off)' : ''}${b.hasAttribute('data-fav') ? ' (favorite)' : ''}`));
    const slots = (id) => pc.$$eval(`#${id} .dslot`, (l) => l.map((s) => (s.querySelector('img') ? `${s.querySelector('img').alt} ${s.querySelector('.dsc').textContent}` : '?') + (s.hasAttribute('data-hover') ? ' (hovering)' : '') + (s.hasAttribute('data-me') ? ' (you)' : '')));
    const dRole = () => pc.textContent('#dRoles [aria-selected="true"]');
    await wait(pc, () => /With Garen/.test((document.querySelector('#dGrid .dchamp') || {}).title), null, 'the draft, with the pairs');
    // What's new 189: Balanced counts your own games (Ahri's your best) and your games with Friend, your duo, too
    assert.deepStrictEqual(await dGrid(), ['Lux +32.6', 'Ahri +10.7', 'Vi +5.5', 'Zed +4.0 (off)']);
    assert.strictEqual(await pc.getAttribute('#dGrid .dchamp', 'title'), 'Lux\nHigh elo middle: 58% won in 12 games\nAgainst Zed in lane: won 5 of 6 (+12.1)\nWith Garen: won 15 of 20 (+8.9)\nYou: won 3 of 5\nWith Friend: won 3 of 5');
    assert.strictEqual(await dRole(), 'Middle');
    assert.deepStrictEqual(await slots('dUs'), ['Garen +4.0 (hovering)', '?', '? (you)', '?', 'Thresh +0.0 (hovering)']);
    assert.deepStrictEqual(await slots('dThem'), ['?', '?', 'Zed +2.0', '?', '?'], 'Zed guessed in the middle');
    assert.deepStrictEqual([await text(pc, '#dUsScore'), await text(pc, '#dThemScore')], ['+4.0', '+2.0']);
    assert.strictEqual(await text(pc, '#csTurn'), 'Your turn to pick.');
    // another role: top, where Lee Sin did well against Zed, but you play Garen; by high elo win rate alone Garen's first too
    await pc.click('#dRoles [data-role="TOP"]');
    await wait(pc, () => /Lee Sin/.test(document.getElementById('dGrid').textContent + [...document.querySelectorAll('#dGrid img')].map((i) => i.alt).join()) && document.querySelector('#dGrid img').alt === 'Garen', null, 'the draft for top');
    assert.strictEqual(await dRole(), 'Top');
    assert.deepStrictEqual(await dGrid(), ['Garen +10.0', 'Lee Sin +1.5', 'Darius −7.5 (off)']);
    assert.match(await pc.getAttribute('#dGrid .dchamp:nth-child(2)', 'title'), /\nAgainst Zed: won 8 of 12 \(\+7\.3\)$/);
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
    assert.deepStrictEqual(await slots('dUs'), ['Garen +4.0 (hovering)', '?', 'Lux +24.1 (hovering) (you)', '?', 'Thresh +0.0 (hovering)'], 'the draft rows keep the draft’s own scores');
    assert.strictEqual(await text(pc, '#dUsScore'), '+28.1');
    await pc.click('#dGrid .dchamp:has(img[alt="Ahri"])', { button: 'right' });
    await wait(pc, () => document.querySelector('#dGrid .dchamp').hasAttribute('data-fav'), null, 'a favorite');
    assert.deepStrictEqual(await dGrid(), ['Ahri +10.7 (favorite)', 'Lux +32.6', 'Vi +5.5', 'Zed +4.0 (off)']);
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-favs'))), [103]);
    await pc.click('#dGrid .dchamp:has(img[alt="Ahri"])', { button: 'right' });
    await wait(pc, () => !document.querySelector('#dGrid [data-fav]'), null, 'no favorite');
    // What's new 189: a top 3 row hovers its champion; hold the mouse on a teammate for your best picks with theirs
    await pc.click('#dTopRows .bigrow:nth-child(2)');
    await wait(pc, () => /hovering Ahri/.test(document.getElementById('csTurn').textContent) && document.querySelector('#dTopRows .bigrow:nth-child(2)').getAttribute('aria-pressed') === 'true', null, 'Ahri hovered from the top 3');
    assert.strictEqual(await text(pc, '#dTopRows .bigrow:nth-child(2) .hov'), 'Hovering');
    await pc.click('#dTopRows .bigrow:nth-child(1)');
    await wait(pc, () => /hovering Lux/.test(document.getElementById('csTurn').textContent), null, 'Lux hovered from the top 3');
    await pc.hover('#csRows .cscard:nth-child(1) .csface');
    await wait(pc, () => !!document.querySelector('.csus .hbox[data-on]') && document.querySelectorAll('.csus .hbox .hrow').length === 3, null, 'the box beside Friend’s Garen');
    const palText = () => pc.$eval('.csus .hbox', (b) => [...b.children].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    assert.deepStrictEqual(await palText(), ['Best for you with Garen Middle · the whole draft counts', 'Lux Great', 'Ahri Great', 'Vi Good', 'Half how each goes with Garen, half the rest of the draft. Blocks: your games together on that pair.']);
    await shot(pc, 'pick-helper-teammate-box');
    await pc.mouse.move(2, 2);
    await wait(pc, () => !document.querySelector('.csus .hbox[data-on]'), null, 'the box closed');
    // who is picking: Hooks picks with you, their bottom picks too; the time from League's own clock, 10 s ago
    const csWas = JSON.stringify(lcu.cs);
    lcu.cs.actions.push([{ id: 30, actorCellId: 4, type: 'pick', completed: false, isInProgress: true, championId: 0 }, { id: 31, actorCellId: 8, type: 'pick', completed: false, isInProgress: true, championId: 0 }]);
    lcu.cs.timer = { adjustedTimeLeftInPhase: 30000, totalTimeInPhase: 30000, internalNowInEpochMs: Date.now() - 10000 };
    await wait(pc, () => document.querySelectorAll('#csRows .cscard[data-turn]').length === 2 && !!document.querySelector('#csThem .csfoe[data-turn]'), null, 'who is picking lit');
    assert.strictEqual(await text(pc, '#csTurn'), 'Your turn to pick (hovering Lux), with Hooks.');
    const secs = async (sel) => +(await pc.textContent(sel)).match(/0:(\d\d)$/)[1];
    const s1 = await secs('#csRows .cscard[data-me] .turnpill');
    assert(s1 <= 20 && s1 >= 16, `the time from League’s stamp, not from when the session came: ${s1}`);
    assert.match(await pc.textContent('#csRows .cscard:nth-child(5) .turnpill'), /^Picking\s*0:\d\d$/);
    assert.match(await pc.textContent('#csThem .csfoe[data-turn] .turnpill'), /^Picking\s*0:\d\d$/);
    assert.match(await pc.getAttribute('#csRows .cscard[data-me] .tbar', 'style'), /scaleX\(0\.[4-7]\d*\)/, 'the bar shrinks with the time');
    assert.strictEqual(await pc.$$eval('#dUs .dslot', (l) => l.map((x) => x.hasAttribute('data-turn')).join()), 'false,false,true,false,true', 'their slots in the draft rows too');
    await shot(pc, 'pick-helper-your-turn-with-duo');
    await pc.waitForTimeout(1200);
    assert((await secs('#csRows .cscard[data-me] .turnpill')) < s1, 'counting down between League’s answers');
    for (const x of lcu.cs.actions.flat()) x.isInProgress = x.id === 31; // their turn only
    await wait(pc, () => document.getElementById('csTurn').textContent === 'Their team is picking. Your pick comes later; hovering Lux.' && !document.querySelector('#csRows [data-turn]'), null, 'their turn');
    await shot(pc, 'pick-helper-their-turn');
    lcu.cs.timer = { phase: 'PLANNING', adjustedTimeLeftInPhase: 20000, internalNowInEpochMs: Date.now() };
    for (const x of lcu.cs.actions.flat()) x.isInProgress = false;
    await wait(pc, () => /^Planning: 0:(20|19|18) left\. Your pick comes later; hovering Lux\.$/.test(document.getElementById('csTurn').textContent), null, 'planning: the time in the status line');
    assert.strictEqual(await pc.locator('#csBox [data-turn]').count(), 0);
    Object.assign(lcu.cs, JSON.parse(csWas));
    await wait(pc, () => document.getElementById('csTurn').textContent === 'Your turn to pick (hovering Lux).', null, 'your turn again');
    // Bot lane first, for an ADC or a support: on by default, saved
    await pc.click('#dRoles [data-role="BOTTOM"]');
    await wait(pc, () => document.getElementById('dTopHead').textContent === 'Top 3 for Bottom' && !document.getElementById('dBotBox').hidden, null, 'bottom, with Bot lane first');
    assert(await pc.isChecked('#dBot'));
    assert.strictEqual(await text(pc, '#dBotNote'), 'Your lane with Thresh counts 4 times the rest of the draft.');
    await pc.click('#dBotBox');
    await wait(pc, () => document.getElementById('dBotNote').textContent === 'Every part of the draft counts the same.', null, 'Bot lane first off');
    assert.strictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-draft')).bot), false);
    await pc.click('#dBotBox');
    await pc.click('#dRoles [data-role="MIDDLE"]');
    await wait(pc, () => document.getElementById('dTopHead').textContent === 'Top 3 for Middle', null, 'middle again');
    assert.deepStrictEqual(await texts(pc, '#csBans span'), ['a champion', 'Darius'], 'bans as grey pictures in the Picks tab');
    assert.match((await texts(pc, '#csThem .csfoe'))[2], /^Zed Middle Shown below$/, 'their Zed, likely in your lane, with the abilities open');
    assert.deepStrictEqual(await pc.$$eval('#csThem .csfoe', (l) => l.map((b) => b.offsetHeight)), Array(5).fill(await pc.$eval('#csRows .cscard:not([data-me]) .csface', (b) => b.offsetHeight)), 'enemy cards as tall as your teammates’ (What’s new 206)');
    assert.match(await text(pc, '#mixNote'), /^Your team so far: 1 physical, 2 magic damage\. Theirs: 1 physical, 0 magic\.$/); // Garen, Thresh and your Lux hovered
    assert.strictEqual(await tierTab(), 'Middle', 'the tier list on your role');
    await pc.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await shot(pc, 'pregame-picks');
    // What's new 222: their ban of Vi in League's ban lists only (no finished ban of theirs in the draft): greyed out,
    // out of the top 3, with the bans in the Picks tab; and League's lists asked once since your ban, not every second
    lcu.cs.bans = { myTeamBans: [], theirTeamBans: [254], numBans: 10 };
    await wait(pc, () => document.querySelector('#dGrid .dchamp:has(img[alt="Vi"])')?.getAttribute('aria-disabled') === 'true', null, 'their ban of Vi greyed out');
    assert.deepStrictEqual(await texts(pc, '#dTopRows .bighead b'), ['Lux', 'Ahri'], 'no Vi in the top 3');
    assert.deepStrictEqual(await texts(pc, '#csBans span'), ['a champion', 'Darius', 'Vi'], 'their ban with yours in the Picks tab');
    assert.strictEqual(callsTo(/pickable-champion-ids$/, 'GET', asksAt).length, 1, 'what you can pick asked once since your ban');
    // on the phone: their Zed, Darius and their Vi banned, so none can be picked; your role's champions first (Middle), then all
    await wait(phone, () => document.getElementById('turn').textContent === 'Your turn to pick' && /Zed/.test(document.getElementById('them').innerHTML), null, 'their Zed on the phone');
    assert.deepStrictEqual(await seats('them'), ['Nobody yet', 'Nobody yet', 'Zed', 'Nobody yet', 'Nobody yet']);
    assert(await phone.evaluate(() => [...document.querySelectorAll('#ourBans img')].some((i) => i.alt === 'Darius')), 'Darius banned');
    await wait(phone, () => [...document.querySelectorAll('#theirBans img')].map((i) => i.alt).join() === 'Vi', null, 'their Vi ban on the phone');
    await wait(phone, () => /Zed \(off\)/.test([...document.querySelectorAll('#grid button')].map((b) => b.textContent + (b.disabled ? ' (off)' : '')).join()), null, 'Zed off on the phone');
    assert.deepStrictEqual([await text(phone, '#mine'), await phone.getAttribute('#mine', 'aria-pressed'), await grid()], ['Middle', 'true', ['Ahri', 'Lux', 'Zed (off)']]);
    await phone.click('#mine');
    await wait(phone, () => document.querySelectorAll('#grid button').length === 11, null, 'every champion');
    assert.deepStrictEqual(await grid(), ['Ahri', 'Caitlyn', 'Darius (off)', 'Garen', 'Jinx', 'Lee Sin', 'Lux', 'Sona', 'Thresh', 'Vi (off)', 'Zed (off)']);
    await phone.click('#mine');
    // the picks for you with the pick helper's word (What's new 189's colours)
    await wait(phone, () => [...document.querySelectorAll('#picks .pick b')].some((b) => b.textContent === 'Ahri'), null, 'the picks on the phone');
    const words = await phone.$$eval('#picks .pick', (l) => l.map((b) => [b.querySelector('b').textContent, (b.querySelector('.word') || {}).textContent || '', getComputedStyle(b.querySelector('.word') || b).color]));
    assert(words.length >= 2 && words.length <= 4 && words.every(([, w]) => ['Great', 'Good', 'OK', 'Risky'].includes(w)), JSON.stringify(words));
    for (const [, w, c] of words) if (w === 'Great' || w === 'Good') assert.strictEqual(c, w === 'Great' ? 'rgb(124, 179, 255)' : 'rgb(95, 212, 196)', `${w} in its colour`);
    await shot(phone, 'phone-pick');
    // hover from the phone, lock in here
    await phone.click('#picks .pick:has(b:text-is("Ahri"))');
    await wait(phone, () => document.getElementById('lock').textContent === 'Lock in Ahri' && !document.getElementById('lock').disabled && document.getElementById('lock').className === 'big red', null, 'Lock in Ahri, red, on the phone');
    await wait(pc, () => /hovering Ahri/.test(document.getElementById('csTurn').textContent), null, 'Ahri hovered from the phone');
    await wait(pc, () => document.querySelector('#dGrid .dchamp[aria-pressed="true"] img').alt === 'Ahri', null, 'Ahri hovered in the grid');
    // What's new 231: once you lock in, League lists neither Lux nor their banned Vi as yours to pick: Lux leaves the grid
    // (as in League's own grid), Vi stays greyed out as banned; only banned and picked champions are greyed
    lcu.pickable = CHAMPS.map((c) => c[1]).filter((c) => c !== 99 && c !== 254);
    await pc.click('#dGrid .dchamp:has(img[alt="Ahri"])');
    await wait(pc, () => [...document.querySelectorAll('#dGrid .dchamp')].map((b) => b.querySelector('img').alt + (b.getAttribute('aria-disabled') === 'true' ? ' (off)' : '')).sort().join() === 'Ahri (off),Vi (off),Zed (off)', null, 'Lux left out, banned Vi greyed');
    assert.match(await pc.getAttribute('#dGrid .dchamp:has(img[alt="Vi"])', 'title'), /^Vi: banned or picked\n/);
    lcu.pickable = null;
    await wait(pc, () => /Runes: the most popular page/.test(lpc.lcu().runesNote), null, 'the runes');
    assert.strictEqual(await pc.evaluate(() => lpc.lcu().runesNote), 'Runes: the most popular page for Ahri, middle, in high elo (Electrocute: 63% won in 30 games). Spells: Flash on D, Ignite on F.');
    const page1 = callsTo(/^\/lol-perks\/v1\/pages$/, 'POST');
    assert.strictEqual(page1.length, 1);
    assert.deepStrictEqual(page1[0][2], { name: 'LPC Ahri', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8237, 5008, 5008, 5011], current: true });
    assert(highAsked.includes('103/MIDDLE'), 'high elo Ahri in the middle asked for');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH').pop()[2], { spell1Id: 4, spell2Id: 14 });
    assert.match(await text(pc, '#csTurn'), /You’re playing Ahri/);
    // What's new 189: once you lock in, the box beside a teammate shows how your champion goes with theirs
    await pc.hover('#csRows .cscard:nth-child(1) .csface');
    await wait(pc, () => /^Your Ahri with Garen/.test((document.querySelector('.csus .hbox[data-on]') || {}).textContent || ''), null, 'your Ahri with Friend’s Garen');
    assert.match(await pc.$eval('.csus .hbox .hrow', (r) => r.innerText.replace(/\s+/g, ' ')), /^Ahri \+ Garen (Great|Good|OK|Risky)$/);
    assert.match(await pc.textContent('.csus .hbox .hfoot'), /You two: \d+W \d+L\.$/, 'your games with your duo');
    await shot(pc, 'pick-helper-after-lock-in');
    await pc.mouse.move(2, 2);
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
    // What's new 213: the Runes tab. Against Zed from the games our server keeps (no rune count yet: it answers 404), then
    // for Ahri: high elo's most taken (the page that went on, with the check), your usual and Riot's; and your pages
    await wait(pc, () => document.querySelectorAll('#ruVsList .rurow').length === 1 && document.querySelectorAll('#ruForList .rurow').length === 3 && !!document.querySelector('#ruForList .rurow[aria-pressed="true"]'), null, 'the Runes tab’s rows', 8000);
    assert.strictEqual(await text(pc, '#ruVsHead'), 'Against Zed');
    assert.strictEqual(await text(pc, '#ruVsNote'), 'Most taken first, from 10 high elo games against Zed');
    assert.deepStrictEqual(await ruRows(pc, '#ruVsList'), ['Electrocute + Sorcery · 10 of 10 games 4 won · on']);
    assert.deepStrictEqual(await ruRows(pc, '#ruForList'), ['Most taken in high elo Electrocute + Sorcery · 30 of 40 games 19 won · on', 'Your usual Electrocute + Sorcery · From your games', 'Riot’s pick Electrocute + Sorcery ·']);
    assert.deepStrictEqual(await pc.$$eval('#ruFaces button', (l) => l.map((b) => b.getAttribute('aria-label') + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : ''))), ['Zed (on)']);
    // the tips for your lane: how Ahri does against Zed in high elo and in your games, the two champions, what high elo
    // players take in the matchup, and Riot's own tips
    await wait(pc, () => !document.getElementById('csTips').hidden && /Riot’s tip for Ahri/.test(document.getElementById('csTips').textContent), null, 'the tips for your lane');
    assert.strictEqual(await pc.textContent('#csTips h3'), 'Tips: Ahri against Zed');
    assert.deepStrictEqual(await tipsIn(pc, '#csTips'), TIPS_AHRI_ZED);
    assert.strictEqual(await pc.textContent('#csTabs [aria-selected="true"]'), 'Runes', 'the Runes tab once you lock in');
    await pc.click('#csTabs [data-cs="tips"]');
    await pc.click('#csNotes summary');
    await pc.fill('#csNotes input', 'Zed');
    await pc.fill('#csNotes textarea', 'Respect his level 6. Ward the side bushes.');
    await pc.click('#csNotes button[type="submit"]');
    await wait(pc, () => document.querySelector('#csNotes .notelist').textContent === 'Ahri against Zed: Respect his level 6. Ward the side bushes.', null, 'the matchup note');
    assert(await pc.evaluate(() => lpc.toasts().includes('Saved your note on Ahri against Zed.')));
    await wait(pc, () => document.querySelector('#csTips li').textContent === 'Your note: Respect his level 6. Ward the side bushes.', null, 'your note first in the tips');
    await shot(pc, 'champ-select');
    // ---- on the phone once you've locked in: Locked in; your runes as the PC's Runes tab (What's new 213): pages against
    // Zed, for Ahri and your own, a tap puts one on in League; Edit runes changes the page in use rune by rune, saved over
    // it and as a new one; then Riot's pick and your own page tapped. Your summoner spells and your skin
    await wait(phone, () => document.getElementById('lock').textContent === 'Locked in' && !document.getElementById('tab-runes').hidden && !document.getElementById('tab-skins').hidden, null, 'the runes and skins tabs on the phone');
    assert(await phone.locator('#lock').isDisabled() && (await phone.getAttribute('#lock', 'class')) === 'big', 'Locked in, not red');
    await shot(phone, 'phone-champ-select');
    await phone.click('#tab-runes');
    const runs = () => phone.$$eval('#runeRows .run', (l) => l.map((b) => ((b.querySelector(':scope > b') || {}).textContent || 'Against') + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    await wait(phone, () => document.querySelectorAll('#runeRows .run').length === 5, null, 'the Runes tab’s rows on the phone');
    assert.deepStrictEqual(await runs(), ['Against (on)', 'Most taken in high elo (on)', 'Your usual', 'Riot’s pick', 'Your page: My page']);
    assert.deepStrictEqual(await texts(phone, '#runeRows h2'), ['Against Zed', 'For Ahri']);
    assert.match(await phone.getAttribute('#runeRows .run', 'aria-label'), /^Electrocute, .*, 10 of 10 games, 4 won, on in League$/);
    await shot(phone, 'phone-runes');
    await phone.click('#runeRows .wide'); // Edit runes
    await wait(phone, () => !document.getElementById('editBox').hidden && document.getElementById('pageName').value === 'LPC Ahri', null, 'your rune page in the editor');
    const pressed = () => phone.$$eval('#editor [aria-pressed="true"]', (l) => l.map((b) => b.textContent || b.querySelector('img').alt));
    assert.deepStrictEqual(await pressed(), ['Domination', 'Electrocute', 'Taste of Blood', 'Eyeball Collection', 'Treasure Hunter', 'Sorcery', 'Manaflow Band', 'Scorch', 'Adaptive force', 'Adaptive force', 'Health']);
    await phone.click('#editor button:has(img[alt="Dark Harvest"])');
    await phone.click('#editor button:has(img[alt="Celerity"])'); // a third row: Manaflow Band, picked first, goes
    await phone.locator('#editor .chips').first().locator('button', { hasText: 'Attack speed' }).click();
    assert.deepStrictEqual(await pressed(), ['Domination', 'Dark Harvest', 'Taste of Blood', 'Eyeball Collection', 'Treasure Hunter', 'Sorcery', 'Celerity', 'Scorch', 'Attack speed', 'Adaptive force', 'Health']);
    await shot(phone, 'phone-runes-editor');
    const fromPhone = lcu.calls.length;
    await phone.click('#pageSave');
    await wait(phone, () => document.getElementById('toast').textContent === 'Saved “LPC Ahri”, and it’s your rune page now.', null, 'the page saved from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', fromPhone).map((c) => [c[2].name, c[2].primaryStyleId, c[2].subStyleId, c[2].selectedPerkIds]), [['LPC Ahri', 8100, 8200, [8128, 8139, 8138, 8135, 8234, 8237, 5005, 5008, 5011]]]);
    assert.deepStrictEqual(callsTo(/currentpage$/, 'PUT', fromPhone).map((c) => c[2]), [50]);
    // back to the rows: none is League's page now; then the edited page again, as a new one
    await phone.click('#edBack');
    await wait(phone, () => !document.querySelector('#runeRows .run[aria-pressed="true"]'), null, 'the rows without the edited page');
    await phone.click('#runeRows .wide');
    await phone.fill('#pageName', 'From my phone');
    await phone.click('#pageNew');
    await until(() => callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', fromPhone).length === 1, 'the new page from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', fromPhone).map((c) => c[2]), [{ name: 'From my phone', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8128, 8139, 8138, 8135, 8234, 8237, 5005, 5008, 5011], current: true }]);
    await wait(phone, () => document.getElementById('pageName').value === 'From my phone', null, 'the new page in use');
    // a row tapped: Riot's pick goes on as Premade's page (over LPC Ahri), then your own page
    await phone.click('#edBack');
    await phone.click('#runeRows .run:has(b:text-is("Riot’s pick"))');
    await until(() => callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', fromPhone).length === 2, 'Riot’s pick from the phone');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', fromPhone)[1][2].selectedPerkIds, [8112, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5002]);
    await wait(phone, () => document.querySelector('#runeRows .run[aria-pressed="true"] > b')?.textContent === 'Riot’s pick', null, 'Riot’s pick on, on the phone');
    await phone.click('#runeRows .run:has(b:text-is("Your page: My page"))');
    await until(() => callsTo(/currentpage$/, 'PUT', fromPhone).map((c) => c[2]).join() === '50,50,1', 'My page picked on the phone');
    lcu.pages = lcu.pages.filter((x) => x.id !== 51); // deleted in League again, so the page made later is 51 too
    // spells: Teleport on F, then on D (Flash goes to F, as in League); only the ones in this mode (no ARAM's Mark)
    await phone.click('#tab-spells');
    await shot(phone, 'phone-spells');
    const spellGrid = () => phone.$$eval('#spellGrid button', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    const spellSlots = () => phone.$$eval('#slots .slot', (l) => l.map((b) => b.getAttribute('aria-label') + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    await wait(phone, () => document.getElementById('slotD')?.getAttribute('aria-label') === 'D: Flash' && document.getElementById('slotF')?.getAttribute('aria-label') === 'F: Ignite', null, 'your spells on the phone');
    assert.deepStrictEqual(await spellGrid(), ['Flash (on)', 'Heal', 'Ignite (on)', 'Smite', 'Teleport'], 'the two you have greyed out');
    await phone.click('#slotF');
    await wait(phone, () => document.getElementById('spellNote').textContent === 'Now pick a spell for F', null, 'F picked');
    assert.deepStrictEqual(await spellSlots(), ['D: Flash', 'F: Ignite (on)']);
    await phone.click('#spellGrid button:has-text("Teleport")');
    await wait(phone, () => document.getElementById('slotF').getAttribute('aria-label') === 'F: Teleport', null, 'Teleport on F');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', fromPhone).map((c) => c[2]), [{ spell1Id: 4, spell2Id: 12 }]);
    await phone.click('#slotD');
    await phone.click('#spellGrid button:has-text("Teleport")');
    await wait(phone, () => document.getElementById('slotD').getAttribute('aria-label') === 'D: Teleport' && document.getElementById('slotF').getAttribute('aria-label') === 'F: Flash', null, 'Teleport on D, Flash on F');
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
    // ---- What's new 162, the same on the PC: each card over its champion's splash in the skin picked (a chroma shows its
    // skin's), your runes changed and saved, then a new page League has no room for; spells D and F swapped; a skin, Random
    // skin and a favorite; and the enemy you click, with their abilities and Riot's tips against them
    await wait(pc, () => /splash\/Ahri_1\.jpg$/.test((document.querySelector('#csRows .cscard[data-me] .csart') || {}).src), null, 'your card in Dynasty Ahri (its Ruby chroma)');
    assert.match(await pc.getAttribute('#csRows .cscard:first-child .csart', 'src'), /splash\/Garen_0\.jpg$/, 'a teammate hovering Garen: Garen’s card');
    await wait(pc, () => document.querySelector('#csRows .cscard[data-me] .csline').textContent === 'Dynasty Ahri · Ruby', null, 'your skin and chroma on your card');
    await pc.click('#csTabs [data-cs="runes"]');
    await wait(pc, () => (document.querySelector('#ruMineList .rurow[aria-pressed="true"] .runame') || {}).firstChild?.textContent === 'My page' && document.getElementById('csPageName').value === 'My page', null, 'your rune page on the PC');
    assert(await pc.isDisabled('#csPageSave'), 'an empty page can’t be saved');
    // What's new 213's editor: trees and keystones with names, each row's pick named with what it does, a card on a
    // rune you rest on; the page built rune by rune, then saved over yours
    const csPressed = () => pc.$$eval('#csEditor [aria-pressed="true"]', (l) => l.map((b) => b.getAttribute('aria-label') || b.textContent));
    await pc.click('#csEditor .rucol:first-child .rutree:text-is("Domination")');
    for (const name of ['Dark Harvest', 'Cheap Shot', 'Eyeball Collection', 'Treasure Hunter']) await pc.click(`#csEditor button[aria-label="${name}"]`);
    await pc.click('#csEditor .rucol:last-child .rutree:text-is("Sorcery")');
    for (const name of ['Manaflow Band', 'Transcendence']) await pc.click(`#csEditor button[aria-label="${name}"]`);
    assert.deepStrictEqual(await texts(pc, '#csEditor .rucol:first-child .rutext b'), ['Cheap Shot', 'Eyeball Collection', 'Treasure Hunter']);
    assert(await pc.isVisible('#csDirty') && await pc.isDisabled('#csPageSave'), 'not saved yet, and no shards yet');
    for (let i = 0; i < 3; i++) await pc.locator('#csEditor .rucol:last-child .rubrow').nth(3 + i).locator('button').nth(i === 2 ? 2 : 0).click();
    assert.deepStrictEqual(await csPressed(), ['Domination', 'Dark Harvest', 'Cheap Shot', 'Eyeball Collection', 'Treasure Hunter', 'Sorcery', 'Manaflow Band', 'Transcendence', 'Adaptive force', 'Adaptive force', 'Health scaling']);
    assert.deepStrictEqual(await texts(pc, '#csEditor .rucol:last-child .rutext b'), ['Manaflow Band', 'Transcendence', 'Pick one', 'Adaptive force', 'Adaptive force', 'Health scaling']);
    await pc.hover('#csEditor button[aria-label="Electrocute"]');
    await wait(pc, () => getComputedStyle(document.querySelector('#csEditor button[aria-label="Electrocute"] .rucard')).opacity === '1', null, 'the card on Electrocute');
    assert.strictEqual(await text(pc, '#csEditor button[aria-label="Electrocute"] .rucard b'), 'Electrocute');
    await pc.mouse.move(2, 2);
    await pc.fill('#csPageName', 'PC page');
    const fromPc = lcu.calls.length;
    await pc.click('#csPageSave');
    await wait(pc, () => /Saved to League/.test((document.querySelector('.rutoast') || {}).textContent), null, 'the page saved from the PC');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/1$/, 'PUT', fromPc).map((c) => [c[2].name, c[2].selectedPerkIds]), [['PC page', [8128, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5001]]]);
    lcu.full = true;
    await pc.click('#csPageNew');
    await wait(pc, () => document.getElementById('csRunesNote').textContent === 'League has no room for another rune page: change one of yours instead.', null, 'no room for a page');
    lcu.full = false;
    assert.strictEqual(lcu.pages.find((x) => x.current).name, 'PC page', 'and nothing else changed');
    await wait(pc, () => (document.querySelector('#csRows .cscard[data-me] .cskey') || {}).alt === 'Dark Harvest', null, 'your keystone on your card');
    await shot(pc, 'cs-runes');
    await pc.click('#csTabs [data-cs="spells"]');
    await wait(pc, () => document.getElementById('csSlotD').textContent === 'DTeleport' && document.getElementById('csSlotF').textContent === 'FFlash', null, 'your spells on the PC');
    assert.deepStrictEqual(await pc.$$eval('#csSpellGrid button', (l) => l.map((b) => b.textContent)), ['Barrier', 'Cleanse', 'Exhaust', 'Flash', 'Ghost', 'Heal', 'Ignite', 'Smite', 'Teleport']);
    await pc.click('#csSlotF');
    await pc.click('#csSpellGrid button:has-text("Ignite")');
    await wait(pc, () => document.getElementById('csSlotF').textContent === 'FIgnite', null, 'Ignite on F');
    await pc.click('#csSlotD');
    await pc.click('#csSpellGrid button:has-text("Ignite")');
    await wait(pc, () => document.getElementById('csSlotD').textContent === 'DIgnite' && document.getElementById('csSlotF').textContent === 'FTeleport', null, 'Ignite on D swaps Teleport over');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', fromPc).map((c) => c[2]), [{ spell1Id: 12, spell2Id: 14 }, { spell1Id: 14, spell2Id: 12 }]);
    assert.strictEqual(await text(pc, '#csSpellsNote'), 'Your own pick. Premade won’t change your spells when you lock in.');
    { // memory: champ select redrawn 300 times (each click redraws it: tabs, the spell keys) keeps no nodes or listeners
      const cdp = await pc.context().newCDPSession(pc);
      await cdp.send('Performance.enable');
      const metrics = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        const { metrics: m } = await cdp.send('Performance.getMetrics'), g = (n) => m.find((x) => x.name === n).value;
        return [g('Nodes'), g('JSEventListeners')];
      };
      const redraw = (n) => pc.evaluate((n) => { const q = (s) => document.querySelector(s); for (let i = 0; i < n; i++) { q(`#csTabs [data-cs="${['runes', 'skins', 'spells'][i % 3]}"]`).click(); q(i % 2 ? '#csSlotD' : '#csSlotF').click(); } }, n);
      await redraw(60);
      const before = await metrics();
      await redraw(300);
      const after = await metrics();
      assert(after[0] - before[0] < 200 && after[1] - before[1] < 20, `champ select leaks nothing: ${before} then ${after}`);
      await cdp.detach();
      console.log(`champ select, 300 redraws: nodes and listeners ${before} then ${after}`);
      await pc.click('#csSlotD');
    }
    await pc.click('#csTabs [data-cs="skins"]');
    const csSkinsNow = () => pc.$$eval('#csSkinGrid button', (l) => l.map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? ' (on)' : '')));
    await wait(pc, () => document.querySelectorAll('#csSkinGrid button').length === 2, null, 'your skins on the PC');
    assert.deepStrictEqual(await csSkinsNow(), ['Ahri', 'Dynasty Ahri (on)']);
    assert.deepStrictEqual(await pc.$$eval('#csChromas button', (l) => l.map((b) => b.getAttribute('aria-label') || b.textContent)), ['Base', 'Ruby']);
    await pc.click('#csSkinGrid button:has-text("Ahri") >> nth=0');
    await wait(pc, () => /splash\/Ahri_0\.jpg$/.test(document.querySelector('#csRows .cscard[data-me] .csart').src), null, 'your card follows the skin');
    await pc.click('#csSkinRandom');
    await wait(pc, () => document.querySelector('#csSkinGrid [aria-pressed="true"]').textContent === 'Dynasty Ahri', null, 'Random skin: the other one you own');
    await pc.click('#csSkinFav');
    await wait(pc, () => document.getElementById('csFavNote').textContent === 'Dynasty Ahri goes on by itself the next time you lock in Ahri.', null, 'a favorite skin');
    assert.deepStrictEqual(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-favskins'))), { 103: 103001 });
    await shot(pc, 'cs-skins');
    await pc.click('#csChromas button[aria-label="Ruby"]');
    await wait(pc, () => document.querySelector('#csChromas [aria-pressed="true"]').getAttribute('aria-label') === 'Ruby', null, 'the Ruby chroma again, from the PC');
    await wait(pc, () => document.getElementById('h-sheet').textContent === 'Zed: abilities', null, 'Zed’s abilities, open from the start: your lane');
    assert.deepStrictEqual(await pc.$$eval('#csSheet li.ab', (l) => l.map((li) => [li.querySelector('.abtop').textContent, !!li.querySelector('.watch')])), [['PassivePassive', false], ['QQ7 s', false], ['WW7 s', false], ['EE7 s', false], ['RR7 s', true]]);
    assert.deepStrictEqual(await texts(pc, '#csSheet .cssheettips li'), TIPS.Zed[1]);
    assert(await pc.locator('#csThem li:nth-child(1) button').isDisabled(), 'no sheet for an enemy still choosing');
    await shot(pc, 'cs-sheet');
    await pc.click('#csThem li:nth-child(3) button');
    await wait(pc, () => document.getElementById('csSheet').hidden, null, 'closed with a click');
    // the draft verdict once both teams are in, in words: theirs lacks magic damage
    const wasCs = JSON.stringify([lcu.cs.myTeam, lcu.cs.theirTeam]);
    assert(await pc.locator('#csVerdict').isHidden(), 'no verdict while they pick');
    [86, 64, 103, 222, 412].forEach((c, i) => { lcu.cs.myTeam[i].championId = c; });
    [122, 254, 238, 51, 64].forEach((c, i) => { lcu.cs.theirTeam[i].championId = c; });
    await wait(pc, () => !document.getElementById('csVerdict').hidden, null, 'the draft verdict');
    assert.match(await text(pc, '#csVerdict'), /^Draft: (you’re ahead|even|you’re behind)\s*Your team has a frontline, magic damage, crowd control and engage\s*Their team lacks magic damage$/);
    assert(!/%/.test(await text(pc, '#csVerdict')), 'no percentage');
    await shot(pc, 'cs-verdict');
    [lcu.cs.myTeam, lcu.cs.theirTeam] = JSON.parse(wasCs);
    // Dodge from the phone: only on a second tap
    await phone.click('#dodge');
    assert.strictEqual(await text(phone, '#dodge'), 'Tap again to dodge. You lose LP.');
    assert.strictEqual(callsTo(/session\/quit$/).length, 0, 'not on the first tap');
    await phone.click('#dodge');
    await until(() => callsTo(/session\/quit$/, 'POST').length === 1, 'a dodge from the phone');
    assert.strictEqual(await text(phone, '#dodge'), 'Dodge');
    console.log(`champ select: ranks, recent games and tags (one on the card, ${friendMore.match(/6 wins in a row|Comfort pick/g).join(', ')} when opened), hidden names never looked up, a ban, picks for middle, hover from the phone, lock in, high elo's runes, spells, build, skill order and matchup; on the phone both teams, bans, the clock, the champions by name or role, runes saved over a page and as a new one, spells, a skin with its chroma and a dodge`);

    // ---- the loading screen: everyone's rank on the overlay, your team first, each team top to support, with their
    // record on their champion and tags; and the tips for your lane, there and on the Game page. Settings turns it off;
    // the overlay key hides it and brings it back.
    lcu.cs = null;
    lcu.phase = 'InProgress';
    await league({ inGame: false, phase: 'InProgress' });
    await wait(pc, () => { const b = lpcClient.lastOverlay && lpcClient.lastOverlay.board; return !!b && b.us.length === 5 && b.them.length === 5 && [...b.us, ...b.them].every((p) => /LP|Unranked/.test(p.rank)) && !!b.tips && b.tips.lines.length === 8; }, null, 'everyone’s rank on the loading screen');
    // What's new 194: League's client gave Shadow 30 wins and no losses (100%); the record is Riot's, never League's 30W 0L
    assert(await pc.evaluate(() => !/100%/.test(lpcClient.lastOverlay.board.them[2].rank)), 'no 100% from League’s client');
    await wait(pc, () => / · 55% of 55$/.test(lpcClient.lastOverlay.board.them[2].rank), null, 'Shadow’s record from Riot');
    const board = await pc.evaluate(() => lpcClient.lastOverlay.board);
    const cardOf = ({ art, spells, stats, runes, mp, ...p }) => ({ ...p, pic: /\/img\/champion\/\w+\.png$/.test(p.pic), emb: p.emb.replace(/^.*\//, '') });
    assert.deepStrictEqual(cardOf(board.them[2]), { name: 'Shadow', id: 'Shadow#EUW', ch: 'Zed', pic: true, me: false, ally: false, lane: true, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: 'TFT_Regalia_Gold.png',
      on: [0, 0, 0], tags: [['bad', 'First time on Zed'], ['', 'One-trick: Ahri']] });
    assert.deepStrictEqual(cardOf(board.us[0]), { name: 'Friend', id: 'Friend#EUW', ch: 'Garen', pic: true, me: false, ally: true, lane: false, rank: 'Gold II · 45 LP · 55% of 55', tc: '#d9ad55', emb: 'TFT_Regalia_Gold.png',
      on: [8, 6, 3], tags: [['good', '6 wins in a row']] });
    // What's new 166-168: your side (blue: your team at the bottom), everyone's skin and spells, the three stats with
    // their boxes' lines, and only the key tags, 2 at most; What's new 205: one look, no queue line, the mini profile
    assert.deepStrictEqual([board.side, board.load, 'look' in board, 'title' in board], ['blue', true, false, false]);
    const mp = (x) => x && [x.tag, x.lvl, x.ban.replace(/^.*\//, ''), x.other && x.other.map((v) => (typeof v === 'string' ? v.replace(/^.*\//, '') : v)), x.last, x.mastery];
    assert.deepStrictEqual([mp(board.them[2].mp), mp(board.us[0].mp)], [['EUW', 200, 'Ahri_0.jpg', null, null, [['Ahri', 5, 30000]]], ['EUW', 200, 'Garen_0.jpg', ['Silver I', 'TFT_Regalia_Silver.png', '#a9b9c4', 10, 3, 1], null, [['Garen', 3, 5000]]]],
      'the mini: no Premade skin pick, so the top mastery splash; Flex beside Solo/Duo');
    const me = board.us.find((p) => p.me), sniper = board.them.find((p) => p.name === 'Sniper');
    assert.deepStrictEqual([me.art.replace(/^.*\//, ''), me.spells.map((x) => x.replace(/^.*\//, '')), sniper.art.replace(/^.*\//, ''), sniper.spells], [`Ahri_7.jpg`, ['SummonerFlash.png', 'SummonerDot.png'], 'Caitlyn_0.jpg', []]);
    const st = board.them[2].stats;
    assert.deepStrictEqual([st.l20.w + st.l20.l, st.l20.games.length, st.sea.w, st.sea.l], [20, 20, 30, 25]);
    const roled = board.us.concat(board.them).map((p) => p.stats.role).filter(Boolean);
    assert(roled.length && roled.every((x) => POS_N.includes(x.name) && x.list[0][0] === x.pos && x.list.every(([r, n, w]) => r && n >= w && w >= 0)), JSON.stringify(roled[0]));
    // What's new 174: the data the overlay draws pictures from: champion ids, 6 item slots, queue, how long ago
    const g0 = st.l20.games[0];
    assert(/^\w+$/.test(g0.c) && g0.it.length === 6 && typeof g0.win === 'boolean' && /^\d+[hdw]$/.test(g0.ago) && g0.q && [g0.k, g0.d, g0.a].every(Number.isInteger), JSON.stringify(g0));
    assert(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[\d.]+$/.test(board.dd), board.dd);
    assert(st.sea.now && /^Gold/.test(st.sea.now[0]) && /TFT_Regalia_Gold\.png$/.test(st.sea.now[1]) && st.sea.now[2] === '#d9ad55' && st.sea.champs.length <= 5 && !('end' in st.sea) && !('mastery' in st.sea), JSON.stringify(st.sea));
    assert(board.us.concat(board.them).every((p) => p.tags.length <= 2), 'two tags at most');
    assert.deepStrictEqual([board.us.map((p) => p.me), board.them.map((p) => p.lane)], [[false, false, true, false, false], [false, false, true, false, false]], 'you, and who’s in your lane');
    assert.deepStrictEqual([...board.us, ...board.them].map((p) => p.tags.map(([, t]) => t).filter((t) => /Premade|smurf|Autofill/.test(t)).join()),
      ['', 'Premade with Shooter', '', 'Premade with Jungler', 'Autofill: usually middle', '', '', '', 'Maybe a smurf', '']);
    assert.deepStrictEqual([board.us.map((p) => p.name), board.them.map((p) => p.name)], [['Friend', 'Jungler', 'Rayan', 'Shooter', 'Hooks'], ['Axe', 'Puncher', 'Shadow', 'Sniper', 'Singer']]);
    assert.deepStrictEqual(board.tips, { title: 'Ahri against Zed', lines: ['Your note: Respect his level 6. Ward the side bushes.', ...TIPS_AHRI_ZED] });
    await wait(pc, () => !document.querySelector('.view[data-view="game"]').hidden, null, 'Game opens by itself on the loading screen');
    await shot(pc, 'loading-screen');
    // What's new 195: a name clicked on the overlay opens that player's profile, with Premade in front
    const fronts = await pc.evaluate(() => lpcClient.calls.filter((c) => c === 'front').length);
    await pc.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'player', go: 'no tag' } })); // not a Riot ID: nothing
    await pc.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'player', go: 'Sniper#EUW' } }));
    await wait(pc, () => document.querySelector('.nav[data-view="profile"]').getAttribute('aria-current') === 'page' && document.getElementById('proName').textContent === 'Sniper', null, 'Sniper’s profile from his name on the overlay');
    assert.strictEqual(await pc.evaluate(() => lpcClient.calls.filter((c) => c === 'front').length), fronts + 1, 'Premade in front once');
    // What's new 198: everyone's rank (over every window) steps aside while Premade is in front, back once you leave it
    assert(!(await pc.evaluate(() => (lpcClient.lastOverlay.board || {}).us)), 'everyone’s rank off Premade’s window');
    await pc.evaluate(() => dispatchEvent(new Event('blur')));
    await wait(pc, () => !!(lpcClient.lastOverlay.board || {}).us, null, 'everyone’s rank back once you go back to League');
    await pc.click('#proBack');
    await openSet(pc, 'overlay');
    await wait(pc, () => lpcClient.lastOverlay.board && lpcClient.lastOverlay.prog === true, null, 'the mouse reaches the overlay for the stats’ boxes');
    assert.strictEqual(await pc.locator('#optBoardLook').count(), 0, 'What’s new 205: no Look picker, one look');
    await pc.uncheck('#optOverlayBoard');
    await wait(pc, () => !lpcClient.lastOverlay.board, null, 'no ranks on the loading screen when Settings says so');
    await pc.check('#optOverlayBoard');
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false && lpc.toasts().includes('Overlay hidden. Alt+V brings it back.'), null, 'the loading screen’s overlay hidden by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => !!lpcClient.lastOverlay.board && lpc.toasts().includes('Overlay back on.'), null, 'and back');
    await pc.evaluate(() => lpcClient.emit('key', 'board'));
    await wait(pc, () => !(lpcClient.lastOverlay.board || {}).us && lpc.toasts().includes('Everyone’s rank hidden. Alt+X brings it back.'), null, 'Premade’s loading screen hidden by its own key (Alt+X)');
    await pc.waitForTimeout(650);
    await pc.evaluate(() => lpcClient.emit('key', 'board'));
    await wait(pc, () => !!lpcClient.lastOverlay.board && lpcClient.lastOverlay.board.load, null, 'and back');
    await openPage(pc, 'game');
    // the new tags' rules (What's new 168), and the overlay's key tags in their order, 2 or 1 of them
    const tagsBy = (st, champ, p = {}) => pc.evaluate(([a, b, c]) => lpc.tags(a, b, c).map(([, t]) => t), [st, champ, p]);
    const top10 = Array.from({ length: 10 }, () => ({ champ: 86, lane: 'TOP', win: false, at: Date.now(), k: 1, d: 1, a: 1, cs: 100, len: 1800 }));
    const gold = (lp, end) => ({ RANKED_SOLO_5x5: { tier: 'GOLD', division: 'I', leaguePoints: lp, wins: 10, losses: 10, previousSeasonEndTier: end } });
    assert.deepStrictEqual(await tagsBy({ ranked: gold(92, 'DIAMOND'), games: top10, mastery: [{ championId: 103, championLevel: 7, championPoints: 1.2e6, lastPlayTime: Date.now() - 100 * 864e5 }] }, 103, { pos: 'MIDDLE' }),
      ['10 losses in a row', 'One-trick: Garen', 'Millionaire: Ahri', 'Autofill: usually top (middle in 0 of 10)', 'Almost promoted: 92 LP', 'Diamond last season', 'Rusty on Ahri', 'Patch pick: S tier']);
    assert.deepStrictEqual(await tagsBy({ ranked: gold(60, 'GOLD'), games: top10, mastery: [{ championId: 103, championPoints: 500, lastPlayTime: Date.now() }] }, 103, { pos: 'TOP' }), ['10 losses in a row', 'First time on Ahri', 'One-trick: Garen'], 'not almost, same tier last season, not rusty');
    assert.deepStrictEqual(await pc.evaluate(() => [2, 1].map((n) => lpc.keyTags([['', 'Seen before: 2 against you'], ['bad', '3 losses in a row'], ['', 'One-trick: Zed'], ['good', 'Comfort pick'], ['bad', 'Autofill: usually top (mid in 1 of 12)'], ['', 'Maybe a smurf: level 30, 80% won']], n))),
      [[['bad', 'Autofill: usually top'], ['', 'One-trick: Zed']], [['bad', 'Autofill: usually top']]], 'the key tags in order, 2 on the loading screen and 1 in a game');
    console.log('loading screen: everyone’s rank, record and tags on the overlay with the tips for your lane; off on the Overlay page, hidden by the key');
    console.log('loading screen (What’s new 166-168): your side, the look picked on the Overlay page, skins and spells, the three stats and their boxes, the key tags only, and the new tags’ rules');

    // ---- in game: everyone scouted, timers, gold, the overlay and the phone
    await league(leagueData());
    await wait(pc, () => !document.querySelector('.view[data-view="game"]').hidden && !document.getElementById('liveBox').hidden, null, 'the Game page in game');
    await wait(pc, () => lpc.lcu().scouted.includes('enemy5'), null, 'all ten scouted');
    assert.strictEqual(callsTo(/alias\/lookup\?gameName=Singer&tagLine=EUW/).length, 1, 'the player League gave no puuid is found by Riot ID');
    assert.strictEqual(await pc.evaluate(() => document.querySelector('#liveNotes .notelist').textContent), 'Ahri against Zed: Respect his level 6. Ward the side bushes.');
    assert(await pc.locator('#liveRows, #timers, #laneStats, #gameTips, #liveAvg, #augTips, #liveBox h2').count() === 0, 'Game in a game: no ranks, timers, lane or tips, the overlay has them (What’s new 227)');
    await wait(pc, () => lpcClient.lastOverlay && /^Dragon 1:\d\d · Voidgrubs up · Herald \d+:\d\d · Baron \d+:\d\d · Their mid inhibitor 4:\d\d · Kills 5–3 · Gold \+15\.5k · Win chance 9\d%$/.test(lpcClient.lastOverlay.game), null, 'the overlay line, ending with the chance to win');
    assert(await pc.evaluate(() => typeof lpcClient.lastOverlay.board !== 'object' && !lpcClient.lastOverlay.tips), 'no ranks on the overlay and no tips once the game is on');
    // the phone as a second screen (What's new 215): the clock, the score, the objectives' timers
    await wait(phone, () => !document.getElementById('game').hidden && [...document.querySelectorAll('#objs .obj > span')].map((e) => e.textContent).join() === 'Dragon,Voidgrubs,Herald,Baron,Their mid inhibitor', null, 'the timers on the phone');
    assert.match(await text(phone, '#gClock'), /^1\d:\d\d$/);
    assert.deepStrictEqual(await phone.$$eval('#stats > span', (l) => l.map((e) => `${e.querySelector('b').textContent} ${e.querySelector('small').textContent}`)), ['5 – 3 Kills', '1 – 0 Towers', '+15.5k Gold']);
    assert.match(await phone.$eval('#objs .obj:first-child b', (b) => b.textContent), /^1:\d\d$/, 'Dragon’s time left');
    // your lane and CS a minute on the overlay, against your usual on Ahri
    await wait(pc, () => /^CS 100 · \d+\.\d a minute \(usual 5\.3\)$/.test(lpcClient.lastOverlay.cs), null, 'the CS counter on the overlay');
    await wait(pc, () => lpcClient.lastOverlay.lane === 'vs Zed: CS +10 · gold +3.1k', null, 'your lane on the overlay: CS and item gold against Zed');
    // and the chance to win, your CS and gold against Zed, and all ten players with their rank, folded away
    await wait(phone, () => /^9\d%$/.test((document.querySelector('#winRing b') || {}).textContent) && /^\d+(\.\d)? CS a minute, your usual is 5\.3\. Gold \+3\.1k on Zed\.$/.test(document.getElementById('laneLine').textContent), null, 'the game on the phone');
    assert.deepStrictEqual(await phone.$$eval('#lane .lrow', (l) => l.map((r) => `${r.firstChild.textContent} ${r.lastChild.textContent}`)), ['You 100 CS', 'Zed 90 CS']);
    assert(await phone.isHidden('#players'), 'everyone folded away');
    await phone.click('#fold');
    await wait(phone, () => document.querySelectorAll('#players li').length === 10 && /Gold/.test(document.getElementById('players').textContent), null, 'everyone with their rank on the phone');
    assert.strictEqual(await phone.$eval('#players li[data-me] .who b', (b) => b.textContent), 'You', 'you are marked on the phone');
    await phone.click('#fold');
    await shot(phone, 'phone-in-game');
    // the overlay picker, see-through slider and key
    await openSet(pc, 'overlay');
    await pc.uncheck('#optOverlayCs');
    await wait(pc, () => lpcClient.lastOverlay.cs === '' && !!lpcClient.lastOverlay.game, null, 'the CS counter off the overlay');
    await pc.check('#optOverlayCs');
    await pc.$eval('#optOpacity', (el) => { el.value = 0.6; el.dispatchEvent(new Event('input')); });
    await wait(pc, () => lpcClient.lastOverlay.opacity === 0.6 && document.getElementById('opacityOut').textContent === '60%', null, 'a see-through overlay');
    assert.deepStrictEqual([await text(pc, '#kOverlay'), await text(pc, '#kBoard')], ['Alt+V', 'Alt+X']);
    // keys another app took (NVIDIA's Alt+Z) reach the page only from the app, as 'combo:'
    await pc.$eval('#kOverlay + button', (b) => b.click());
    await pc.evaluate(() => lpcClient.emit('key', 'combo:Alt+Z'));
    await wait(pc, () => document.getElementById('kOverlay').textContent === 'Alt+Z', null, 'a key another app took, picked through the app');
    await pc.$eval('#kOverlay + button', (b) => b.click());
    await pc.evaluate(() => lpcClient.emit('key', 'combo:Alt+V'));
    await wait(pc, () => document.getElementById('kOverlay').textContent === 'Alt+V', null, 'Alt+V back');
    await pc.$eval('#kOverlay + button', (b) => b.click());
    await pc.keyboard.press('PageUp');
    await wait(pc, () => document.getElementById('kOverlay').textContent === 'PageUp', null, 'PageUp alone as the overlay key');
    await pc.$eval('#kOverlay + button', (b) => b.click());
    await pc.keyboard.press('Delete'); // alone it would be taken from typing everywhere
    assert.strictEqual(await text(pc, '#kOverlay + button'), 'Hold Ctrl, Alt or Shift too…');
    await pc.keyboard.press('Alt+V');
    await wait(pc, () => document.getElementById('kOverlay').textContent === 'Alt+V', null, 'Alt+V back again');
    // everyone's rank on its own key, Alt+X (no tips in a game); Alt+V hides the whole overlay, then brings it back without the ranks
    await pc.evaluate(() => { lpcClient.emit('key', 'board'); lpcClient.emit('key', 'board'); }); // held: Windows repeats it
    await wait(pc, () => { const b = lpcClient.lastOverlay.board; return !!b && b.us.length === 5 && b.them.length === 5 && !b.tips && !!lpcClient.lastOverlay.cs && lpc.toasts().includes('Everyone’s rank is on the overlay. Alt+X again hides it.'); }, null, 'everyone’s rank on the overlay by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'board'));
    await wait(pc, () => lpcClient.lastOverlay.visible && typeof lpcClient.lastOverlay.board !== 'object' && lpc.toasts().slice(-1)[0] === 'Everyone’s rank hidden. Alt+X brings it back.', null, 'and hidden by it, the rest still on');
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false && lpc.toasts().slice(-1)[0] === 'Overlay hidden. Alt+V brings it back.', null, 'the overlay hidden by its key');
    await pc.waitForTimeout(650); // apart, as a held key's repeats within 0.6 s count as one press
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible && lpcClient.lastOverlay.cs && typeof lpcClient.lastOverlay.board !== 'object', null, 'the overlay back');
    // the sound 30 seconds before Dragon (the last one was at 6:40, so the next at 11:40)
    await league(leagueData({ t: 672 }));
    await wait(pc, () => lpc.toasts().includes('Dragon in 30 seconds') && lpc.played().includes('spawn'), null, 'the Dragon warning');
    // ARAM: Mayhem: what kind of augment suits Ahri, on the overlay at the start and while dead
    assert(await pc.evaluate(() => !lpcClient.lastOverlay.aug), 'no augment tips in a ranked game');
    const AHRI_AUG = 'Augments for Ahri: look for ability power, ability haste, magic penetration and mana; skip attack speed and critical strikes.';
    await league(leagueData({ mode: 'KIWI', t: 30 }));
    await wait(pc, (a) => lpcClient.lastOverlay.aug === a, AHRI_AUG, 'augment tips in Mayhem');
    await league(leagueData({ mode: 'KIWI', t: 300 }));
    await wait(pc, () => lpcClient.lastOverlay.aug === '', null, 'off the overlay between augments');
    await league(leagueData({ mode: 'KIWI', t: 300, me: { ...leagueData().me, dead: true } }));
    await wait(pc, (a) => lpcClient.lastOverlay.aug === a, AHRI_AUG, 'back on the overlay while dead');
    await league(leagueData());
    await shot(pc, 'in-game');
    console.log(`in game: all ten scouted (one found by Riot ID), timers and gold: ${await pc.evaluate(() => lpcClient.lastOverlay.game)}`);
    await openPage(pc, 'profile');
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
      assert(b.readUInt32BE(0) === 0x1a45dfa3 && (b.includes('V_MPEG4/ISO/AVC') || b.includes('V_VP8')) && b.includes('A_OPUS') && b.includes(Buffer.from([0x44, 0x89, 0x88])), `${n} is a WebM with video, sound and a duration`);
    }
    await league(leagueData({ t: 610, events: [...leagueData().events, { e: 'multi', t: 609, n: 2, me: true, team: 'ORDER' }] }));
    await wait(pc, () => lpc.toasts().some((t) => /^Clip saved of your multikill: Clip 3\.webm$/.test(t)), null, 'the multikill clip', 15000);
    // What's new 157: named after the champion and the moment; a solo kill clips by itself, and
    // not with its box off; each clip remembers its game and why it was saved
    const extra = [...leagueData().events, { e: 'multi', t: 609, n: 2, me: true, team: 'ORDER' }];
    await league(leagueData({ t: 640, events: [...extra, { e: 'kill', t: 639, me: true, solo: true, team: 'ORDER' }] }));
    await wait(pc, () => lpc.toasts().some((t) => /^Clip saved of your solo kill: Clip 4\.webm$/.test(t)), null, 'the solo kill clip', 15000);
    await pc.evaluate(() => document.getElementById('optClipSolo').click());
    await league(leagueData({ t: 660, events: [...extra, { e: 'kill', t: 659, me: true, solo: true, team: 'ORDER' }] }));
    await pc.waitForTimeout(6500);
    await pc.evaluate(() => document.getElementById('optClipSolo').click());
    const named = await pc.evaluate(() => ({ stems: lpcClient.stems, saved: lpc.clips().saved.length, meta: JSON.parse(localStorage.getItem('lpc-clip-meta')), games: JSON.parse(localStorage.getItem('lpc-clip-games')) }));
    assert(named.saved === 4 && [/^Ahri clip \d\d-\d\d$/, /^Ahri clip \d\d-\d\d$/, /^Ahri double kill \d\d-\d\d$/, /^Ahri solo kill \d\d-\d\d$/].every((re, i) => re.test(named.stems[i])), `clips named after the champion and the moment, none with Solo kills off: ${JSON.stringify(named.stems)}`);
    assert(named.meta['Clip 3.webm'].w === 'multi' && named.meta['Clip 3.webm'].n === 2 && named.meta['Clip 4.webm'].w === 'solo' && Object.values(named.meta).every((m) => m.g === GAME) && named.games[GAME].c === 'Ahri' && named.games[GAME].k === 3,
      `each clip keeps its game and why: ${JSON.stringify(named)}`);
    assert.deepStrictEqual(await pc.evaluate(() => lpcClient.cleanFirst), ['Clip 3.webm', 'Clip 4.webm'], 'the clean-up takes the clips made by themselves, never played, first');
    console.log(`clips: the key (${full.d.toFixed(1)} s), a 4 s cut (${short.d.toFixed(1)} s, plays from 0), a multikill and a solo kill, all WebM with video and sound, named ${named.stems.join(', ')}`);
    // the gallery: each clip with its picture; keep one, rename one, drag one out, play and cut one, bin one
    await openPage(pc, 'clips');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .clip .cname')].map((e) => e.textContent).join() === 'Clip 4,Clip 3,Clip 2,Clip 1', null, 'the gallery');
    // one row for the game: the champion, the K/D/A and its clips, each tagged with what saved it
    const gameRow = await pc.evaluate(() => ({ rows: document.querySelectorAll('#clipGrid .cgame').length, head: document.querySelector('#clipGrid .cghead').textContent, tags: [...document.querySelectorAll('#clipGrid .ctag')].map((e) => e.textContent + (e.hasAttribute('data-auto') ? '*' : '')).join() }));
    assert(gameRow.rows === 1 && /^Ahri3 \/ 1 \/ 2 · Ranked · .* · 4 clips$/.test(gameRow.head) && gameRow.tags === 'Solo kill*,Double kill*,Key,Key', `the game's row: ${JSON.stringify(gameRow)}`);
    assert(await pc.$$eval('#clipGrid .shot', (imgs) => imgs.every((i) => i.src.startsWith('data:image/jpeg;base64,') && i.naturalWidth === 320)), 'a picture of the screen with each clip');
    // What's new 160: the row over the champion's splash in the skin picked in champ select (Dynasty Ahri's Ruby chroma, 103020),
    // a chroma's missing art falling back to the base splash; up to 4 clip pictures; a label for the day
    const look = await pc.evaluate(() => ({ art: document.querySelector('#clipGrid .cgart').getAttribute('src'), pics: document.querySelectorAll('#clipGrid .cgpics img').length, day: document.querySelector('#clipGrid .cgday').textContent, s: JSON.parse(localStorage.getItem('lpc-clip-games'))[5550001].s }));
    assert(look.art.endsWith('/cdn/img/champion/splash/Ahri_20.jpg') && look.s === 20 && look.pics === 4 && look.day === 'Today 1', `the row's look: ${JSON.stringify(look)}`);
    await pc.$eval('#clipGrid .cgart', (i) => i.dispatchEvent(new Event('error')));
    assert.match(await pc.getAttribute('#clipGrid .cgart', 'src'), /\/splash\/Ahri_0\.jpg$/, 'no art for that skin: the base splash');
    // the strip: Record every match, Keep only the highlights and the clip key at the top, Settings, Clips for the rest
    assert(await pc.evaluate(() => ['optGameVideo', 'optGameHigh', 'kClip'].every((id) => document.getElementById(id).closest('.clipstrip'))), 'the key switches in the strip');
    await pc.click('#clipGrid .cghead'); // the game's row, clicked open
    const card = (n) => `#clipGrid .clip:has(.cname:text-is("${n}"))`, menu = async (n, b) => { await pc.click(`${card(n)} .cmore > summary`); await pc.click(`${card(n)} .${b}`); };
    await wait(pc, () => document.querySelector('#clipGrid .clip .kda img'), null, 'the champion on each card');
    assert.strictEqual(await text(pc, `${card('Clip 3')} .kda`), 'Ahri 3/1/2', 'your champion and K/D/A on the card');
    await pc.click(`${card('Clip 1')} .star`);
    assert(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-clip-favs')).includes('Clip 1.webm')) && (await text(pc, `${card('Clip 1')} .star`)) === 'Saved', 'saved');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .clip[data-fav] .cname')].map((e) => e.textContent).join() === 'Clip 1' && [...document.querySelectorAll('#clipGrid .cname')].map((e) => e.textContent).join() === 'Clip 4,Clip 3,Clip 2,Clip 1', null, 'Clip 1 saved, still in its game');
    await pc.click('[data-cf="saved"]');
    assert.strictEqual(await pc.$$eval('#clipGrid .clip:not([hidden]) .cname', (l) => l.map((e) => e.textContent).join()), 'Clip 1', 'Saved: only the saved clip');
    await pc.click('[data-cf="all"]');
    assert.strictEqual(await pc.$$eval('#clipGrid .clip:not([hidden])', (l) => l.length), 4, 'All: every clip again');
    await menu('Clip 2', 'ren');
    await pc.fill(`#clipGrid form input`, 'Baron steal');
    await pc.press(`#clipGrid form input`, 'Enter');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Baron steal'), null, 'the clip renamed');
    await pc.dispatchEvent(`${card('Clip 3')} .shot`, 'dragstart');
    assert(await pc.evaluate(() => lpcClient.calls.includes('drag Clip 3.webm')), 'dragged out (to Discord)');
    await pc.click(`${card('Clip 1')} .shot`); // the picture plays it
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
    await wait(pc, () => !document.getElementById('clipVideo').paused && document.getElementById('pPlay').getAttribute('aria-label') === 'Pause', null, 'played from the bar');
    await pc.click('#pPlay');
    await shot(pc, 'clip-player');
    await pc.$eval('#trimFrom', (el) => { el.value = 2; el.dispatchEvent(new Event('input')); });
    await pc.$eval('#trimTo', (el) => { el.value = 6; el.dispatchEvent(new Event('input')); });
    assert.deepStrictEqual(await pc.evaluate(() => ['trimFromOut', 'cutA', 'cutB', 'cutLen'].map((id) => document.getElementById(id).textContent || document.getElementById(id).value)), ['0:02.0', '0:02.0', '0:06.0', '4.0 s'], 'the cut’s times under the handles and in Cut’s options');
    await pc.fill('#cutA', '0:01.5'); // typed, to the tenth of a second
    await pc.press('#cutA', 'Enter');
    assert.strictEqual(await pc.$eval('#trimFrom', (el) => +el.value), 1.5, 'Start typed');
    await pc.$eval('#trimFrom', (el) => { el.value = 2; el.dispatchEvent(new Event('input')); });
    // in Premade's smallest window, Save clip is in view without scrolling: the video gives way (What's new 211)
    const size = pc.viewportSize();
    for (const [w, h] of [[1180, 800], [1440, 900]]) {
      await pc.setViewportSize({ width: w, height: h });
      const fit = await pc.evaluate(() => { const r = document.getElementById('trimSave').getBoundingClientRect(), d = document.getElementById('clipDlg'); return r.bottom <= innerHeight && d.scrollHeight <= d.clientHeight + 1 && document.getElementById('clipVideo').getBoundingClientRect().height > 200; });
      assert(fit, `Save clip in view at ${w} x ${h}`);
    }
    await pc.setViewportSize(size);
    await pc.click('#trimSave');
    await wait(pc, () => lpc.toasts().includes('Saved the cut as “Clip 1 cut”.'), null, 'the cut saved');
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
    // the editor's tools under the video (What's new 211): Cut picked when it opens, one line of options for the picked one
    assert.deepStrictEqual(await pc.$$eval('#clipDlg .vtool[data-tool]', (l) => l.map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`)), ['Cut*', 'Speed', 'Shape', 'Text', 'Sound'], 'one row of tools, Cut picked');
    assert(await pc.evaluate(() => [...document.querySelectorAll('#clipDlg button, #clipGrid button, #clipGrid summary')].every((b) => !/[▶❚🔊🔇⚙⛶☆★📁🗑⋯]/u.test(b.textContent))), 'line icons only, no emoji or text-glyph icons');
    await pc.click('#clipDlg [data-tool="speed"]');
    await pc.click('#clipDlg [data-speed="2"]');
    await pc.click('#clipDlg [data-tool="shape"]');
    await pc.click('#clipDlg [data-shape="0.5625"]');
    await pc.click('#clipDlg [data-tool="text"]');
    await pc.fill('#edText', 'Outplayed');
    assert(await pc.evaluate(() => document.querySelectorAll('#clipDlg .vopts:not([hidden])').length === 1 && document.getElementById('player').hasAttribute('data-drag')), 'Text’s options on one line, the caption draggable on the video');
    await wait(pc, () => !document.getElementById('edView').hidden && document.getElementById('clipVideo').playbackRate === 2, null, 'the frame shown on the video, playing at 2×');
    await shot(pc, 'clip-editor');
    await pc.click('#trimSave');
    await wait(pc, () => lpc.toasts().some((t) => /^Saved the edit as “Clip 1 cut.*”\.$/.test(t)), null, 'the edit saved', 30000);
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
    await menu('Clip 3', 'bin');
    await wait(pc, () => ![...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Clip 3'), null, 'Clip 3 binned');
    // Copy puts the file on the clipboard; Make a reel joins the game's clips, oldest first, into one more in its row;
    // a binned clip's notes go with it
    await pc.click(`${card('Clip 4')} .copy`);
    await wait(pc, () => lpcClient.calls.includes('copy Clip 4.webm') && lpc.toasts().some((t) => /^Copied “Clip 4”\. Paste it with Ctrl\+V/.test(t)), null, 'the clip copied');
    await pc.click('#clipGrid .cgame button:has-text("Make a reel")');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => /^Ahri reel \d\d-\d\d$/.test(e.textContent)) && [...document.querySelectorAll('#clipGrid .ctag')].some((e) => e.textContent === 'Reel'), null, 'the reel in the game’s row');
    if (process.env.SHOTS) await pc.locator('#clipGrid').screenshot({ path: path.join(process.env.SHOTS, 'clips-by-game.png') });
    const reel = await pc.evaluate(() => ({ call: lpcClient.calls.find((c) => typeof c === 'string' && c.startsWith('reel ')), meta: Object.keys(JSON.parse(localStorage.getItem('lpc-clip-meta'))) }));
    assert(/^reel Clip 1\.webm,Baron steal\.webm,/.test(reel.call) && reel.call.includes('Clip 4.webm') && !reel.meta.includes('Clip 3.webm'), `the reel's clips in order (the saved one too, in its game since What's new 160), and Clip 3's notes gone with it: ${JSON.stringify(reel)}`);
    await pc.click('#clipsFolder');
    assert(await pc.evaluate(() => lpcClient.calls.includes('clips-folder')));
    { // memory: the rows (splash, pictures, menus, the opened row) drawn 300 times keep no nodes or listeners
    const cdp = await pc.context().newCDPSession(pc);
    await cdp.send('Performance.enable');
    // listeners counted on the page and window, not Chrome's JSEventListeners: that one also counts something outside
    // the page that comes and goes by 72 every few seconds, on the old version too (it failed this check by timing)
    const listeners = async (expression) => {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: true })).listeners.length;
    };
    const metrics = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics: m } = await cdp.send('Performance.getMetrics');
      return [m.find((x) => x.name === 'Nodes').value, await listeners('document') + await listeners('window')];
    };
    await pc.evaluate(() => { for (let i = 0; i < 100; i++) lpc.clipsDraw(); });
    const before = await metrics();
    await pc.evaluate(() => { for (let i = 0; i < 300; i++) lpc.clipsDraw(); });
    const after = await metrics();
    assert(after[0] - before[0] < 200 && after[1] - before[1] < 20, `the clips rows leak nothing: ${before} then ${after}`);
    await cdp.detach();
    console.log(`clips rows, 300 redraws: nodes and listeners ${before} then ${after}`);
    }
    await shot(pc, 'clips');
    console.log(`clip gallery: pictures, kept, renamed, dragged out, a ${cutLen.toFixed(1)} s cut from the trimmer, binned`);
    // Settings, Clips (What's new 207); clips by voice: Record my phrase writes down what the mic says, and then saying it
    // saves a clip. (Vosk, in a worker, slow on a busy container.)
    assert.strictEqual(await text(pc, '#kClip'), 'Ctrl+Shift+K');
    await openSet(pc, 'clips');
    assert(await pc.isVisible('#optClipLen') && await pc.isVisible('#optClipVoice'), 'Settings, Clips has the rest');
    await pc.click('#phraseRec');
    await wait(pc, () => document.getElementById('voiceNote').textContent === 'Your phrase is “that was sick”. Press Test to try it.', null, 'your phrase recorded', 90000);
    assert.strictEqual(await pc.inputValue('#optClipPhrase'), 'that was sick');
    await pc.check('#optClipVoice');
    await wait(pc, () => lpc.toasts().includes('Clip saved when you said “that was sick”: Clip 7.webm'), null, 'the clip by voice', 60000);
    assert(await pc.evaluate(() => !lpc.checks().bt && !lpc.checks().btNote), 'the fake mic is not a Bluetooth headset (only its label says so; voice.e2e checks the labels)');
    assert.strictEqual(await text(pc, '#voiceNote'), 'Listening for “Premade, clip that” and “that was sick”.');
    await shot(pc, 'clip-settings');
    await pc.uncheck('#optClipVoice');
    await wait(pc, () => !lpc.voice().loaded && !lpc.voice().ears, null, 'the speech recognition let go');
    console.log('clips by voice: your phrase recorded from the mic (“that was sick”), and saying it saved a clip');

    // ---- after the game: LP, the report, and Stats
    await league(leagueData({ t: 1700, result: 'Win' }));
    await wait(pc, () => lpc.lcu().curGame && lpc.lcu().curGame.result === 'Win', null, 'the win read in the game'); // the 1 s tick, not a fixed wait
    await pc.evaluate(() => lpcClient.emit('key', 'overlay')); // hidden for the rest of this game only: the card below still comes
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
    await openPage(pc, 'game');
    await wait(pc, () => document.querySelector('#postBox .when') && document.querySelector('#postBox .rtabs:not([hidden])'), null, 'the report on the Game page, with its timeline');
    // one head (What's new 187): the report's own, over Ahri's art, with the result, LP, the queue, length and patch,
    // your numbers; the Game page opens on Overview (What's new 200)
    assert(await pc.locator('#postHead').isHidden(), 'the old hero is gone');
    assert.strictEqual(await text(pc, '#postBox .rhead .sbres'), 'Victory');
    assert.match(await text(pc, '#postBox .rhead .rline'), /^Victory\s*\+18 LP\s*Gold II · 63 LP$/);
    assert.match(await text(pc, '#postBox .rhead .rme .sub'), /^Ranked Solo\/Duo · 28:20 · .+ · Patch 26\.23$/);
    assert.match(await text(pc, '#postBox .rhead .rnums'), /^6 \/ 2 \/ 9 · 7\.5 KDA\s*\d+% of kills\s*\d+ CS · [\d.]+ a minute\s*100 score$/);
    assert.match(await pc.getAttribute('#postBox .rart', 'src'), /splash\/Ahri_\d+\.jpg$/);
    assert.deepStrictEqual(await pc.$$eval('#postBox .rtabs .tab', (l) => l.map((b) => [b.textContent, b.getAttribute('aria-selected')])), [['Overview', 'true'], ['Laning', 'false'], ['Builds', 'false']], 'no How you played tab (What’s new 219)');
    assert(await pc.locator('#postBox .rpane[data-tab="overview"]').isVisible() && await pc.locator('#postBox .rpane[data-tab="how"]').count() === 0, 'Overview first');
    // What's new 219: your row starts closed like the others; pressed, Your game with its rings and 3 cards, and the
    // Laning ring opens the Laning tab
    const post = (sel) => pc.$$eval(`#postBox ${sel}`, (l) => l.map((e) => e.textContent));
    assert.strictEqual(await pc.locator('#postBox .sbdrawer:not([hidden])').count(), 0, 'every drawer closed after a game, yours too');
    await pc.click('#postBox .pside[data-me] .c-pic');
    await wait(pc, () => document.querySelectorAll('#postBox .sbdrawer:not([hidden]) .pcard').length === 3, null, 'your game: rings and cards');
    assert.deepStrictEqual(await texts(pc, '#postBox .sbdrawer:not([hidden]) .povr'), ['69 Your game against 40 high elo Ahri middle games']);
    await repShot(pc, '#postBox', 'report-your-game');
    await pc.click('#postBox .sbdrawer:not([hidden]) .ringb[data-area="fight"]');
    await repShot(pc, '#postBox', 'report-your-game-fighting');
    await pc.click('#postBox .sbdrawer:not([hidden]) .ringb[data-area="lane"]');
    assert(await pc.locator('#postBox .rpane[data-tab="laning"]').isVisible(), 'the Laning ring opens Laning');
    // Laning: at 10 and 15 minutes against Zed, your gold and CS leads filled, with minute marks
    assert.strictEqual(await text(pc, '#postBox .laning > p'), 'High elo Ahri players won 40% of 30 games against Zed: a hard matchup.');
    assert.deepStrictEqual(await post('.laning .lead figcaption'), ['Your gold against ZedUp to 1.5k ahead at 30:00, 1.5k ahead at the end', 'Your CS against ZedUp to 30 CS ahead at 30:00, 30 CS ahead at the end']);
    assert.deepStrictEqual(await post('.laning .lead:first-child .ticks span'), ['0:00', '5:00', '10:00', '15:00', '20:00', '25:00', '30:00']);
    assert(await pc.$eval('#postBox .laning .lead .up', (p) => p.getAttribute('d').split('L').length > 20), 'your gold lead filled above the line');
    await repShot(pc, '#postBox', 'report-laning');
    // Overview: the gold on top, the teams side by side, then lane against lane, your side lit
    await pc.click('#postBox .rtabs .tab:text-is("Overview")');
    assert.deepStrictEqual(await pc.$eval('#postBox .rpane[data-tab="overview"]', (p) => [...p.children].map((e) => e.className.split(' ').pop()).slice(0, 5)), ['lead', 'sbvs', 'sbhead', 'lrow', 'sbdrawer'], 'the gold graph first');
    assert.match(await text(pc, '#postBox .sbhead'), /^Blue side\s*Victory\s*Your team\s*Their team\s*Defeat\s*Red side$/);
    assert.strictEqual(await pc.locator('#postBox .lrow:has(.pside[data-me])').getAttribute('aria-label'), 'Middle', 'you against Zed in the middle');
    assert(await pc.$$eval('#postBox .pside[data-me] .sbit img', (l) => l.length) > 0, 'your items');
    assert.deepStrictEqual(await pc.$$eval('#postBox .sbvs .vs', (l) => l.map((v) => v.title)), ['Kills: yours 14, theirs 12', 'Gold: yours 54.0k, theirs 52.0k', 'Towers: yours 3, theirs 1', 'Dragons: yours 2, theirs 0', 'Barons: yours 1, theirs 0', 'Voidgrubs: yours 0, theirs 1'], 'the teams side by side, Voidgrubs from the timeline');
    await repShot(pc, '#postBox', 'report-overview-game-page');
    // What's new 218: a player's name opens their profile, without opening their drawer
    assert.strictEqual(await pc.locator('#postBox .pside .sbname b.plink').count(), 10, 'every name a link');
    await pc.click('#postBox .plink:text-is("Sniper")');
    await wait(pc, () => document.querySelector('.nav[data-view="profile"]').getAttribute('aria-current') === 'page' && document.getElementById('proName').textContent === 'Sniper', null, 'Sniper’s profile from his name after the game');
    assert.strictEqual(await pc.getAttribute('#postBox .pside:has(.plink:text-is("Sniper"))', 'aria-expanded'), 'false', 'his drawer still closed');
    await pc.click('#proBack');
    await openPage(pc, 'stats');
    await pc.evaluate(() => lpcClient.emit('overlay-moved', { prog: { id: 'after', go: 'scoreboard' } }));
    await wait(pc, () => document.querySelector('.nav[data-view="game"]').getAttribute('aria-current') === 'page', null, 'Scoreboard on the end-screen card opens the Game page');
    await shot(pc, 'post-game');
    await openPage(pc, 'stats');
    // the You tab (What's new 203): your last 20 as five numbers with lines, Ranked climb with today's game, When you
    // win, Highlights with comebacks and throws (each opens its report), and the season recap
    await wait(pc, () => /Gold II · 63 LP/.test(document.getElementById('lpRank').textContent), null, 'the rank');
    assert.strictEqual(await text(pc, '#lpTodayText'), '1W 0L · +18 LP');
    assert.strictEqual(await pc.locator('#lpBlocks i.w').count(), 1, 'today as a win block');
    assert(await pc.locator('#lpChart polyline').isVisible(), 'the LP line');
    assert.strictEqual(await text(pc, '#statsWho'), 'Rayan#EUW · last 20 games');
    assert.deepStrictEqual(await pc.$$eval('#form > div', (l) => l.map((d) => d.firstChild.textContent + ' ' + d.querySelector('b').textContent)), ['KDA 4.00', 'CS a minute 5.7', 'Vision score 19.3', 'Kill participation —', 'Deaths a game 3.0']);
    assert.strictEqual(await pc.locator('#form svg:not([hidden]) polyline').count(), 4, 'a line for each, none for kill participation (not in League’s games)');
    const cbRows = await pc.$$eval('#comebacks .srow, #throws .srow', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    assert.ok(cbRows.every((r) => / [A-Z][a-z]{2} \d{1,2}$/.test(r)), 'each comeback/throw row ends with its game day: ' + cbRows); // the test games are dated from today
    assert.deepStrictEqual(cbRows.map((r) => r.replace(/ [A-Z][a-z]{2} \d{1,2}$/, '')), ['Victory 1.3k gold behind at 15', 'Defeat 3.8k gold ahead at 15']);
    assert.deepStrictEqual(await pc.$$eval('#fame .hcard', (l) => l.map((e) => e.querySelectorAll('small')[0].textContent)), ['Pentakill', 'Most kills', 'Best KDA', 'Most damage']);
    assert.strictEqual(await pc.locator('#times i[data-r]').count() > 0 && await pc.locator('#stops .barrow').count() > 0 && await pc.locator('#lens > div').count(), 3, 'when you win');
    await pc.click('#throws .srow');
    await wait(pc, () => document.querySelector('#hlGame li .report'), null, 'a throw opens its report');
    await pc.click('#recapBtn');
    await wait(pc, () => !document.getElementById('recapSave').hidden && document.getElementById('recapSave').href.startsWith('data:image/png'), null, 'the season recap');
    // your profile with today's LP; and the profile link: your rank, record and top champions on a page anyone can
    // open, all of it in the link
    await openPage(pc, 'profile');
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
    await openPage(pc, 'stats');
    await shot(pc, 'stats-you');
    // the Champions tab: your champions, nemeses and allies, the collection, patch changes, and a champion's page
    await pc.click('.view[data-view="stats"] .tab[data-tab="champs"]');
    await wait(pc, () => document.querySelectorAll('#champRows .crow').length, null, 'the champion table');
    assert.match((await pc.$$eval('#champRows .crow', (t) => t.map((x) => x.innerText.replace(/\s+/g, ' '))))[0], /^Ahri (Keep )?8 75% 4\.0 [\d.]+$/);
    assert.deepStrictEqual(await pc.$$eval('#nemeses .nrow', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ').trim())), ['Darius 1W 3L · 25%']);
    assert.deepStrictEqual(await pc.$$eval('#allies .nrow b', (bs) => bs.map((b) => b.textContent)), ['Garen', 'Lee Sin', 'Jinx', 'Thresh']);
    assert.strictEqual(await text(pc, '#collNote'), 'Played 5 of 11 · won with 4');
    assert.strictEqual(await pc.locator('#collection img[data-s="won"]').count(), 4);
    await wait(pc, () => /Health 590 → 600/.test(document.getElementById('patchList').textContent), null, 'patch changes');
    assert.strictEqual(await text(pc, '#h-patch'), 'Patch 1.1 for your champions');
    assert.match((await text(pc, '#patchList')).replace(/\s+/g, ' '), /^Ahri Health 590 → 600 Q \(Orb of Deception\) cooldown 7 → 6 Lux No changes/);
    assert.deepStrictEqual(await pc.$$eval('#patchList .nrow:first-child .plines span', (l) => l.map((e) => e.className)), ['up', 'up'], 'more health and a shorter cooldown are better');
    await pc.click('#champRows .crow:first-child');
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
    // Profile's Recent games (What's new 203: match history lives there): each report with its replay, your laning and when everyone bought each item
    await openPage(pc, 'profile');
    await wait(pc, () => document.querySelectorAll('#proGames > li').length === 20, null, 'your 20 games on Profile');
    await pc.click('#proGames li:first-child summary');
    await wait(pc, () => document.querySelector('#proGames li:first-child .report'), null, 'the report in match history');
    const first = '#proGames li:first-child';
    await wait(pc, () => document.querySelector('#proGames li:first-child .replay').textContent === 'Download the replay', null, 'the replay button');
    await pc.click(`${first} .replay`);
    await wait(pc, () => document.querySelector('#proGames li:first-child .replay').textContent === 'Watch the replay', null, 'the replay downloaded');
    await pc.click(`${first} .replay`);
    await until(() => callsTo(/^\/lol-replays\/v1\/rofls\/5550001\/watch$/, 'POST').length === 1, 'the replay started');
    assert.deepStrictEqual(callsTo(/^\/lol-replays\/v1\/rofls\/5550001\/download$/, 'POST')[0][2], { componentType: 'replay-button_match-history' });
    await wait(pc, () => document.querySelector('#proGames li:first-child .laning .latrow') && document.querySelector('#proGames li:first-child .buyrow'), null, 'the laning and the builds');
    assert(await pc.locator(`${first} > details > summary`).isHidden() && await pc.locator(`${first} .rclose`).isVisible(), 'the row grew into the head, with its arrow');
    assert.strictEqual(await pc.getAttribute(`${first} .rtabs .tab[aria-selected="true"]`, 'data-tab'), 'overview', 'an opened game starts on Overview');
    await sideways(pc, first, 'a game at the window’s width');
    await repShot(pc, first, 'report-overview');
    if (process.env.SHOTS) { // Rayan's navy theme
      const navy = { '--bg': '#0d161c', '--panel': '#182127', '--raised': '#232b31', '--line': '#2c3a44', '--muted': '#9fb0ba', '--fg': '#f4eeee' };
      await pc.evaluate((v) => { for (const [k, x] of Object.entries(v)) document.documentElement.style.setProperty(k, x); }, navy);
      await repShot(pc, first, 'report-overview-navy');
      await pc.click(`${first} .pside[data-me] .c-pic`);
      await pc.click(`${first} .ringb[data-area="fight"]`);
      await repShot(pc, first, 'report-your-game-navy');
      await pc.click(`${first} .pside[data-me] .c-pic`);
      await pc.click(`${first} .rtabs .tab:text-is("Overview")`);
      await pc.evaluate((v) => { for (const k of Object.keys(v)) document.documentElement.style.removeProperty(k); }, navy);
    }
    // a 1040 px window (lane rows without items, the tabs on one line), a smaller one, and the app at 200% size, with
    // your drawer open on Fighting
    await pc.click(`${first} .pside[data-me] .c-pic`);
    await pc.click(`${first} .ringb[data-area="fight"]`);
    for (const w of [1040, 820]) {
      await pc.setViewportSize({ width: w, height: 900 });
      await sideways(pc, first, `a ${w} px window`);
      assert.strictEqual(await pc.$eval(`${first} .rtabs`, (t) => new Set([...t.children].map((b) => Math.round(b.getBoundingClientRect().top))).size), 1, `the tabs on one line at ${w} px`);
      if (w === 1040) {
        assert(await pc.locator(`${first} .pside[data-me] .c-items`).isHidden() && await pc.locator(`${first} .pside[data-me] .c-kda`).isVisible(), 'lane rows drop items in a smaller window');
        await repShot(pc, first, 'report-1040');
      }
    }
    await pc.setViewportSize({ width: 1280, height: 900 });
    await pc.evaluate(() => document.documentElement.style.setProperty('--zoom', 2));
    await sideways(pc, first, 'the app at 200% size');
    await pc.evaluate(() => document.documentElement.style.setProperty('--zoom', 1));
    await pc.click(`${first} .pside[data-me] .c-pic`);
    await pc.click(`${first} .rtabs .tab:text-is("Laning")`);
    assert.match(await text(pc, `${first} .lhead`), /^You\s*against\s*Zed\s*Shadow, middle lane$/);
    assert.deepStrictEqual(await pc.$$eval(`${first} .lat`, (l) => l.map((x) => [x.querySelector('h3').textContent, ...[...x.querySelectorAll('.latrow')].map((r) => `${r.title} ${r.querySelector('.gap').textContent}`)])),
      [['At 10 minutes', 'CS at 10 minutes: 80 vs 70 +10', 'Gold at 10 minutes: 4.0k vs 3.5k +500', 'XP at 10 minutes: 5.0k vs 5.2k −200'],
        ['At 15 minutes', 'CS at 15 minutes: 120 vs 105 +15', 'Gold at 15 minutes: 6.0k vs 5.3k +750', 'XP at 15 minutes: 7.5k vs 7.8k −300']]);
    assert(await pc.locator(`${first} .laning ~ .analysis .fightmap`).count() === 1, 'their jungler’s map under it');
    // Builds: yours and Zed's by shop trip (buys within a minute together), finished items ringed; Everyone shows all 10
    await pc.click(`${first} .rtabs .tab:text-is("Builds")`);
    const post2 = (sel) => pc.$$eval(sel, (l) => l.map((e) => e.textContent));
    const trips = (sel) => pc.$$eval(sel, (l) => l.map((t) => `${t.querySelector('time').textContent} ${[...t.querySelectorAll('img')].map((i) => i.alt + (i.classList.contains('done') ? ' (done)' : '')).join(', ')}`));
    assert.deepStrictEqual(await trips(`${first} .bduo .buyrow[data-me] .trip`), ['0:25 Doran’s Ring', '8:00 Sorcerer’s Shoes', '12:00 Luden’s Companion (done)', '20:00 Zhonya’s Hourglass (done)', '28:00 Rabadon’s Deathcap (done)']);
    assert.deepStrictEqual(await post2(`${first} .bduo .buyrow .bwho b`), ['You, Ahri', 'Shadow, Zed']);
    assert.match(await text(pc, `${first} .bfirst`), /^First item done\s*You 12:00\s*Luden’s Companion\s*High elo Ahri 10:00$/);
    assert.strictEqual(await pc.locator(`${first} .ball .buyrow`).count(), 10);
    assert(await pc.locator(`${first} .ball`).isHidden(), 'Everyone shows all 10 when picked');
    await pc.click(`${first} .bswitch .tab:text-is("Everyone")`);
    assert(await pc.locator(`${first} .ball`).isVisible() && await pc.locator(`${first} .bduo`).isHidden(), 'all 10');
    await repShot(pc, first, 'report-builds-everyone');
    await pc.click(`${first} .bswitch .tab:text-is("You and Zed")`);
    await repShot(pc, first, 'report-builds');
    await pc.click(`${first} .rtabs .tab:text-is("Overview")`);
    await pc.click(`${first} .pside:has(.sbname b:text-is("Shadow")) .c-pic`); // Shadow's drawer
    // copied from a report into League: Zed's runes as the app's own page, with the shards from Riot's copy of the game,
    // then yours over it; your items as an item set for Ahri, in the order you bought them
    const copied = lcu.calls.length;
    await pc.click(`${first} button[aria-label="Save Shadow’s runes on Zed in League"]`);
    await wait(pc, () => lpc.toasts().includes('Shadow’s runes on Zed are your rune page “Copy: Shadow’s Zed” in League.'), null, 'Zed’s runes in League');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', copied).map((c) => c[2]), [{ name: 'Copy: Shadow’s Zed', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8138, 8135, 8226, 8237, 5005, 5008, 5011], current: true }]);
    await pc.click(`${first} .pside[data-me] .c-pic`); // your drawer (one open at a time)
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
    await pc.click('#proGames li:nth-child(2) summary');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(2) .report .pside'), null, 'an older game’s report, from Riot');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(2) .laning .lhead'), null, 'laning in a game with no lanes');
    assert.match(await text(pc, '#proGames li:nth-child(2) .lhead'), /against\s*Zed/);
    // buy times when League's copy of the game has none: Riot's copy of the timeline through our server (an undone buy
    // taken out), kept with the report so the next open asks nobody; without Riot's, the final items and a hint
    lcu.noBuys = true;
    const [g5, g6] = [4, 5].map((k) => MY_HIST.games.games[k].gameId), tl5 = `/europe/lol/match/v5/matches/EUW1_${g5}/timeline`;
    RIOT[tl5] = { info: { participants: report(g5).participantIdentities.map((x) => ({ participantId: x.participantId, puuid: x.player.puuid })),
      frames: [{ timestamp: 0, events: [] }, { timestamp: 60000, events: [[25, 1056], [26, 2003], [27, 1055]].map(([t, itemId]) => ({ type: 'ITEM_PURCHASED', timestamp: t * 1000, participantId: 1, itemId })).concat([{ type: 'ITEM_UNDO', timestamp: 28000, participantId: 1, beforeId: 1055, afterId: 0 }]) },
        { timestamp: 720000, events: [{ type: 'ITEM_PURCHASED', timestamp: 700000, participantId: 1, itemId: 6655 }, { type: 'ITEM_PURCHASED', timestamp: 640000, participantId: 8, itemId: 3142 }] }] } };
    await pc.click('#proGames li:nth-child(5) summary');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(5) .bduo .trip'), null, 'buy times from Riot’s copy');
    assert.deepStrictEqual(await trips('#proGames li:nth-child(5) .bduo .buyrow[data-me] .trip'), ['0:25 Doran’s Ring', '11:40 Luden’s Companion (done)'], 'the undone Doran’s Blade taken out');
    assert.strictEqual(riotAsked.filter((k) => k === tl5).length, 1);
    await pc.click('#proGames li:nth-child(6) summary');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(6) .builds'), null, 'Builds without buy times');
    assert.strictEqual(await text(pc, '#proGames li:nth-child(6) .bhead > .sub'), 'Buy times show once Riot has this game’s timeline.');
    assert(await pc.locator('#proGames li:nth-child(6) .bduo .buyrow[data-me] .bfinal img').count() > 0 && await pc.locator('#proGames li:nth-child(6) .trip').count() === 0, 'final items only');
    lcu.noBuys = false;
    assert(callsTo(/\/lol-match-history\/v1\/games\/9001$/).length >= 1);
    await shot(pc, 'stats');
    // the export: your match history as a spreadsheet file
    const [dl] = await Promise.all([pc.waitForEvent('download'), pc.click('#exportBtn')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
    assert(dl.suggestedFilename().startsWith('Match history ') && csv[0] === '\ufeffDate,Champion,Queue,Result,Kills,Deaths,Assists,CS,Minutes,Game ID' && csv.length === 21, `the spreadsheet: ${csv.slice(0, 2)}`);
    assert.match(csv[1], /^\d{4}-\d\d-\d\d \d\d:\d\d,Ahri,Ranked Solo\/Duo,Win,5,3,7,160,30,5550001$/);
    console.log('after the game: +18 LP, the report with Riot\'s extra numbers and high elo, how you played on the Game page, Stats (your last 20, Ranked climb, when you win, highlights, the recap, champions, patch) and Profile\'s match history with reports and the export');
    // a friend in the room: their rank and your record together on their card, and Watch while they play
    const room = await pc.evaluate(() => lpc.room());
    const [fctx, fr] = await context(browser, { version: '1.7.0' });
    await fctx.exposeFunction('fakeLcu', friendLcu);
    await fctx.addInitScript(() => { localStorage.setItem('lpc-name', 'Fren'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, clips: false })); });
    await fr.goto(URL_);
    await wait(fr, () => window.lpc, null, 'the friend’s page');
    await fr.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    await openPage(fr, 'voice');
    await fr.fill('#code', room);
    await fr.click('#joinBtn');
    await openPage(pc, 'voice');
    await wait(pc, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Platinum IV · 12 LP · With you: 13W 7L'), null, 'the friend’s rank and your record together');
    await wait(fr, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Gold II · 63 LP, +18 today'), null, 'your rank on the friend’s card for you');
    assert(await pc.locator('#players .watch').isHidden(), 'no Watch while the friend isn’t playing');
    await fr.evaluate(() => { document.getElementById('chatText').value = 'gg wp'; document.getElementById('chatForm').requestSubmit(); }); // off the room page since What's new 152; the phone remote still has it
    await wait(phone, () => !document.getElementById('chatDot').hidden, null, 'a dot on Chat for the friend’s message');
    await phone.click('#m-chat');
    await wait(phone, () => /Fren .*gg wp/.test(document.getElementById('chatLog').textContent) && document.getElementById('chatDot').hidden, null, 'the friend’s message on the phone');
    await phone.click('#m-league');
    assert((await embs(pc, '#players .plol .emb')).includes('TFT_Regalia_Platinum.png'), 'the emblem on the friend’s card');
    await fr.evaluate((d) => lpcClient.emit('league', d), leagueData({ me: { champ: 'Garen', champName: 'Garen', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 } }));
    await wait(pc, () => { const b = document.querySelector('#players .watch'); return b && !b.hidden; }, null, 'Watch on the friend’s card');
    await pc.click('#players .watch');
    await wait(pc, () => lpc.toasts().includes('League is opening Fren’s game. Spectating runs a few minutes behind.'), null, 'spectating the friend');
    assert.deepStrictEqual(callsTo(/^\/lol-spectator\/v1\/spectate\/launch$/, 'POST')[0][2], { allowObserveMode: 'ALL', dropInSpectateGameId: 'Friend', gameQueueType: '', puuid: 'ally1', spectatorKey: '' });
    // room games with League's ranks: the balanced teams show everyone's Solo/Duo rank, and role roulette's role goes
    // into League's lobby in one click
    await openPage(pc, 'voice');
    await pc.click('#lolBtn'); // League mode on: Balance teams and Role roulette are under the room in it (What's new 207)
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
    await pc.click('#lolBtn'); // League mode off again, as the room was
    await fctx.close();
    console.log('a friend in the room: Platinum IV, 13W 7L together, and Watch opens their game');

    // ---- another champ select: over the app's own rune page, Flash on F
    await preSettings();
    await pc.selectOption('#optFlash', 'F');
    await openPage(pc, 'pregame');
    lcu.lpNote = null;
    const cs2 = lcu.calls.length;
    champSelect(778, { championId: 99 });
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await wait(pc, () => /Runes: Riot’s page for Lux/.test(lpc.lcu().runesNote), null, 'the second runes', 20000);
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', cs2).length, 0, 'no second page');
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT', cs2).length, 1);
    assert.strictEqual(callsTo(/currentpage$/, 'PUT', cs2)[0][2], 50);
    assert.strictEqual(lcu.pages.find((x) => x.id === 50).name, 'LPC Lux');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH').pop()[2], { spell1Id: 14, spell2Id: 4 });
    // your own usual rune page for Lux instead of Riot's, from its row (What's new 213)
    await pc.click('#csTabs [data-cs="runes"]');
    await wait(pc, () => [...document.querySelectorAll('#ruForList .rurow')].some((b) => /^Your usual/.test(b.innerText)), null, 'the row for your own runes');
    await pc.click('#ruForList .rurow:has-text("Your usual")');
    await wait(pc, () => document.querySelector('#ruForList .rurow[aria-pressed="true"]')?.innerText.startsWith('Your usual'), null, 'your own runes');
    assert.deepStrictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT').pop()[2].selectedPerkIds, [8229, 8226, 8210, 8237, 8139, 8135, 5008, 5008, 5002]);
    console.log('second champ select: the app’s rune page reused for Lux, Flash on F, then your own usual page');
    // ---- a third: your rune page and spells picked by hand before you lock in stay, and your favorite skin goes on
    const cs3 = lcu.calls.length;
    champSelect(779);
    Object.assign(flatActions().find((x) => x.id === 3), { completed: true, isInProgress: false });
    flatActions().find((x) => x.id === 8).isInProgress = true;
    await wait(pc, () => /Your turn to pick/.test(document.getElementById('csTurn').textContent), null, 'the third champ select');
    await pc.click('#csTabs [data-cs="spells"]');
    await pc.click('#csSlotF');
    await pc.click('#csSpellGrid button:has-text("Heal")');
    await pc.click('#csTabs [data-cs="runes"]');
    await wait(pc, () => document.querySelectorAll('#ruMineList .rurow').length >= 1, null, 'the pages');
    await pc.click('#ruMineList .rurow:has-text("PC page")');
    await until(() => callsTo(/currentpage$/, 'PUT', cs3).length === 1, 'your page picked by hand');
    await pc.fill('#anyChamp', 'Ahri');
    await pc.click('#pickLock');
    await wait(pc, () => document.getElementById('csRunesNote').textContent === 'Runes and spells: your own picks, so Premade left them as they are.', null, 'the hand picks kept', 20000);
    await until(() => callsTo(/my-selection$/, 'PATCH', cs3).some((c) => c[2].selectedSkinId === 103001), 'your favorite skin on lock in');
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH', cs3).map((c) => c[2]), [{ spell1Id: 4, spell2Id: 7 }, { selectedSkinId: 103001 }], 'no automatic spells');
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages/, 'PUT', cs3).length + callsTo(/^\/lol-perks\/v1\/pages$/, 'POST', cs3).length, 0, 'no automatic rune page');
    console.log('third champ select: a page and spells picked by hand before lock in stay, and the favorite skin goes on');
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
    await openPage(pc, 'pregame');
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
    await wait(phone, () => /^You, Jinx/.test(document.querySelector('#team .tile[data-me]')?.getAttribute('aria-label')) && [...document.querySelectorAll('#bench button')].map((b) => b.textContent).join() === 'Sona,Garen' && document.getElementById('reroll').hidden, null, 'the bench on the phone');
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
    // Clip anywhere: outside a League game the clip key saves a "Screen clip", listed on the Recording page
    await openPage(pc, 'record');
    await pc.check('#optClipsAll');
    await wait(pc, () => lpc.clips().on && lpc.clips().head, null, 'the screen kept outside League', 30000);
    await pc.evaluate(() => lpcClient.emit('key', 'clip'));
    await wait(pc, () => [...document.querySelectorAll('#anyGrid .cname')].some((e) => /^Screen clip /.test(e.textContent)), null, 'the clip on the Recording page', 30000);
    // and since What's new 157 on the Clips page too, in a row of its own under its day (Rayan, 2026-11-16)
    assert(await pc.$$eval('#clipGrid .cgame', (rows) => rows.some((r) => r.querySelector('.cghead').textContent.startsWith('Screen clipsClip anywhere, outside League') && [...r.querySelectorAll('.cname')].every((x) => /^Screen clip /.test(x.textContent)))), 'in its own row on the Clips page');
    await pc.uncheck('#optClipsAll');
    await wait(pc, () => !lpc.clips().on, null, 'Clip anywhere off lets the screen go');
    console.log('clip anywhere: the clip key outside League saved a Screen clip, listed on the Recording page');
    await openSet(pc, 'league');
    await shot(pc, 'settings');
    // the patch check, the performance meter (Settings, App) and test recordings (Settings, League)
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
    // every NEWS entry, newest first, numbers going down with no clash (read from site/index.html, so no edit per release)
    const html = fs.readFileSync(path.join(__dirname, 'site/index.html'), 'utf8'), at = html.indexOf('  const NEWS = [');
    const NEWS = Function(`return ${html.slice(at + 15, html.indexOf('\n  ];\n', at) + 4)}`)();
    assert(NEWS.every(([n], i) => !i || n < NEWS[i - 1][0]), `What’s new numbers go down with no clash: ${NEWS.map(([n]) => n).join(' ')}`);
    assert.deepStrictEqual(await pc.$$eval('#newsList section', (l) => l.map((e) => [e.querySelector('h3').textContent, [...e.querySelectorAll('li')].map((li) => li.textContent)])), NEWS.map(([, t, items]) => [t, items]), 'What’s new lists every entry with its lines, newest first');
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
    await openPage(pc, 'profile');
    await pc.click('#proGames li:nth-child(3) summary');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(3) .replay')?.textContent === 'Download the replay', null, 'a replay to download');
    await pc.click('#proGames li:nth-child(3) .replay');
    await wait(pc, () => lpc.toasts().includes('Riot didn’t let the app download a replay. From patch 26.21 Riot keeps replay downloads for League’s own match history, so download it there: Profile, Match History, then the game’s download button.'), null, 'where to get the replay');
    await pc.click('#proGames li:nth-child(4) summary');
    await wait(pc, () => document.querySelector('#proGames li:nth-child(4) .replay')?.textContent === 'No replay here: since patch 26.21, download it in League’s match history', null, 'why there’s no replay');
    assert(await pc.locator('#proGames li:nth-child(4) .replay').isDisabled(), 'nothing to click');
    await openPage(pc, 'settings');
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
    // backup and restore: everything but the phone remote's code, back in after a reload
    await openSet(pc, 'app');
    const [bk] = await Promise.all([pc.waitForEvent('download'), pc.click('#backupBtn')]);
    const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
    assert(backup.app === 'league-proxchat' && backup.data['lpc-name'] === 'Rayan' && backup.data['lpc-lp'] && backup.data['lpc-clip-favs'] && backup.data['lpc-notes'] && !('lpc-remote' in backup.data) && !('lpc-device' in backup.data), `the backup: ${Object.keys(backup.data)}`);
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
    await openPage(sp, 'profile');
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
      let runeCount = null; // our server's rune count (What's new 213), 404 until it's deployed
      await hctx.route(/127\.0\.0\.1:9001\/riot\/(summary|champ|api|past|runes)/, (r) => {
        const u = new URL(r.request().url()), cors = { 'access-control-allow-origin': '*' }, role = u.searchParams.get('r') || 'MIDDLE';
        if (u.pathname.endsWith('/summary')) return r.fulfill({ json: HSUM, headers: cors });
        if (u.pathname.endsWith('/runes')) return runeCount && u.searchParams.get('c') === '103' ? r.fulfill({ json: { p: ['15.20', '15.19'], n: 400, r: runeCount }, headers: cors }) : r.fulfill({ status: 404, json: {}, headers: cors });
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
      await openPage(hp, 'pregame');
      await wait(hp, () => !document.getElementById('winFix').hidden, null, 'League in Fullscreen, on Pregame');
      // the tier list: arrows for Ahri, rising since last patch, and Zed, falling; how often each was banned; a row
      // opens that champion's page in the role
      await wait(hp, () => !document.getElementById('tierBox').hidden && document.querySelectorAll('#tierRows tr').length === 3, null, 'the tier list: two S tier, so the top 3');
      await hp.click('#tierMore');
      await wait(hp, () => document.querySelectorAll('#tierRows tr').length === 4, null, 'See more');
      assert.strictEqual(await hp.textContent('#tierTipNote'), 'Middle in 200 Challenger and Grandmaster games our server counted from Riot, patch 25.20 and 25.19.');
      assert.deepStrictEqual(await hp.$$eval('#tierRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())),
        ['Vi S 60% 40 · 20% picked 0%', 'Ahri S 55%▲ 160 · 80% picked 3%', 'Lux B 51% 80 · 40% picked 0%', 'Zed B 50%▼ 120 · 60% picked 20%']);
      assert.deepStrictEqual(await hp.$$eval('#tierRows .trend', (l) => l.map((e) => e.title)), ['Rising: 65% won in 80 games this patch, 45% in 80 last patch', 'Falling: 40% won in 60 games this patch, 60% in 60 last patch']);
      assert(await hp.isVisible('#tierBan'), 'the Banned column');
      await hp.click('#tierRows tr:nth-child(2) td:nth-child(3)');
      await wait(hp, () => document.getElementById('champDlg').open && /Ahri middle won 47% of 60 Challenger and Grandmaster games on patch 25\.20/.test(document.getElementById('champDlgBody').textContent), null, 'Ahri’s page from the tier list');
      await hp.click('#champDlgClose');
      console.log('tier list 2.0: Ahri rising, Zed falling, ban rates, and a row opens the champion’s page');
      // the matchup on the draft board (the Matchup explorer before What's new 202): your Ahri against their Zed in the middle
      for (const [slot, name] of [['#tdThem .slot:nth-child(3)', 'zed'], ['#tdUs .slot:nth-child(3)', 'ahri']]) {
        await hp.click(`${slot} .tcard`);
        await hp.fill('#dFind', name);
        await wait(hp, () => document.querySelectorAll('#dGrid .dchamp').length === 1, null, `${name} found`);
        await hp.click('#dGrid .dchamp');
        await hp.fill('#dFind', '');
      }
      await wait(hp, () => !document.getElementById('dMu').hidden && /Riot’s tip for Ahri/.test(document.getElementById('dMu').textContent) && document.querySelectorAll('#dMu .wg').length === 2, null, 'the matchup on the board');
      assert.deepStrictEqual(await hp.$$eval('#dMu .vscard img', (l) => l.map((i) => i.src.replace(/^.*\/splash\//, ''))), ['Ahri_0.jpg', 'Zed_0.jpg'], 'both laners side by side (What’s new 210)');
      assert.deepStrictEqual(await texts(hp, '#dMu .vsname'), ['Ahri', 'Zed']);
      assert.deepStrictEqual(await texts(hp, '#dMu .mutext > *'), ['Ahri against Zed', 'High elo: Ahri won 6 of 20 games against Zed. A hard matchup for Ahri.']);
      assert.deepStrictEqual(await hp.$$eval('#dMu .wg img', (l) => l.map((i) => i.alt)), ['Arcane Comet', 'Domination', 'Luden’s Companion', 'Zhonya’s Hourglass'], 'keystone and second tree, first items in order');
      assert.strictEqual(await text(hp, '#dMu .wg .wcap'), 'in 20 of 20');
      assert.deepStrictEqual((await texts(hp, '#dMu li')).filter((t) => !t.startsWith('You:')), ['Zed is a melee assassin with mostly physical damage, so armor helps against them. You outrange Zed: 550 against 125.',
        'Riot’s tip against Zed: Zed’s shadows copy his abilities: stand away from them.', 'Riot’s tip against Zed: Zhonya’s Hourglass stops Death Mark.',
        'Riot’s tip for Ahri: Use Charm to set up your combos.']);
      await shot(hp, 'pregame-draft-board-matchup');
      console.log('draft board matchup: Ahri against Zed, with the record, runes, first items and tips');
      // champ select, middle, before their laner is known: Ahri, whom Zed beats in high elo, ranks below the safe picks
      champSelect(6660001);
      lcu.phase = 'ChampSelect';
      await hl({ inGame: false, phase: 'ChampSelect' });
      const hGrid = () => hp.$$eval('#dGrid .dchamp', (l) => l.map((b) => `${b.querySelector('img').alt} ${b.querySelector('.dsc').textContent}`));
      await wait(hp, () => /Blind pick, their counters/.test((document.querySelector('#dGrid .dchamp:has(img[alt="Ahri"])') || {}).title), null, 'the draft with safe blind picks');
      await hp.click('#dModes [data-mode="matchups"]'); // What's new 189: Balanced counts your own games too, so the matchups alone here
      await wait(hp, () => document.querySelector('#dModes [aria-selected="true"]').dataset.mode === 'matchups', null, 'matchups');
      assert.deepStrictEqual(await hGrid(), ['Vi +0.0', 'Lux +0.0', 'Zed +0.0', 'Ahri −9.8']);
      assert.strictEqual(await hp.getAttribute('#dGrid .dchamp:has(img[alt="Ahri"])', 'title'), 'Ahri\nHigh elo middle: 55% won in 160 games\nBlind pick, their counters: won 6 of 20 games against Zed (−9.8)');
      assert.match(await text(hp, '#dNote'), /Their laner isn’t picked yet, so champions they can counter rank lower\./);
      // their Zed in, you lock in Ahri: the most popular page first, then one click for the page against Zed
      Object.assign(flatActions().find((a) => a.id === 3), { completed: true, isInProgress: false });
      Object.assign(flatActions().find((a) => a.id === 8), { completed: true, isInProgress: false, championId: 103 });
      lcu.cs.myTeam[2].championId = 103;
      lcu.cs.theirTeam[2].championId = 238;
      await wait(hp, () => /^Runes: the most popular page for Ahri, middle, in high elo \(Electrocute: 55% won in 40 games\)\./.test(lpc.lcu().runesNote) && document.querySelectorAll('#ruVsList .rurow').length === 1, null, 'the Runes tab against Zed');
      // What's new 213, before our server counts runes (404): Against Zed from the 20 games it keeps, with their spells
      assert.strictEqual(await text(hp, '#ruVsNote'), 'Most taken first, from 20 high elo games against Zed');
      assert.deepStrictEqual(await ruRows(hp, '#ruVsList'), ['Arcane Comet + Domination · 20 of 20 games 6 won']);
      assert.deepStrictEqual(await hp.$$eval('#ruVsList .ruspell', (l) => l.map((i) => i.alt)), ['Flash', 'Teleport']);
      assert.deepStrictEqual(await hGrid(), ['Lux +6.0', 'Vi +0.0', 'Zed +0.0', 'Ahri −16.3'], 'Zed known: the lane matchup counts instead of the blind pick');
      // a tap puts it on as Premade's page with its spells, and the check moves to it
      const since = lcu.calls.length;
      await hp.click('#ruVsList .rurow');
      await wait(hp, () => document.querySelector('#ruVsList .rurow').getAttribute('aria-pressed') === 'true' && !document.querySelector('#ruForList .rurow[aria-pressed="true"]'), null, 'the page against Zed');
      const pg = callsTo(/^\/lol-perks\/v1\/pages(\/\d+)?$/, null, since).filter(([m]) => m !== 'GET').pop();
      assert(pg && pg[2].primaryStyleId === 8200 && pg[2].subStyleId === 8100 && JSON.stringify(pg[2].selectedPerkIds) === JSON.stringify(COMET.slice(2)), `the page against Zed: ${JSON.stringify(pg)}`);
      assert.deepStrictEqual([lcu.cs.myTeam[2].spell1Id, lcu.cs.myTeam[2].spell2Id], [4, 12]);
      assert.deepStrictEqual(await hp.$$eval('#csEditor [aria-pressed="true"]', (l) => l.map((b) => b.getAttribute('aria-label') || b.textContent)).then((l) => l.slice(0, 2)), ['Sorcery', 'Arcane Comet'], 'and in the editor');
      // once our server counts runes: the most taken first, Electrocute's page Wins more (27 of 38 against 25 of 52),
      // Aery left out (no page with it in the kept games)
      runeCount = { MIDDLE: { 238: { '8229-8100': [52, 25], '8112-8200': [38, 27], '8214-8100': [15, 9] } } };
      await hp.evaluate(() => lpc.runeCountsAgain());
      await wait(hp, () => document.querySelectorAll('#ruVsList .rurow').length === 2, null, 'the rune count against Zed');
      assert.strictEqual(await text(hp, '#ruVsNote'), 'Most taken first, from 105 high elo games against Zed');
      assert.deepStrictEqual(await ruRows(hp, '#ruVsList'), ['Arcane Comet + Domination · 52 of 105 games 25 won · on', 'Electrocute + Sorcery Wins more · 38 of 105 games 27 won']);
      assert.deepStrictEqual(await hp.evaluate(() => [lpc.winsMore([38, 27], [52, 25]), lpc.winsMore([15, 11], [15, 5]), lpc.winsMore([52, 25], [38, 27])]), [true, false, false], 'Wins more: 2 standard errors, 30 games each');
      await shot(hp, 'runes-tab');
      // their Darius at the top: his face, tapped, shows how few games there are against him
      const top0 = lcu.cs.theirTeam[0].championId;
      lcu.cs.theirTeam[0].championId = 122;
      await wait(hp, () => !!document.querySelector('#ruFaces button[aria-label="Darius"]'), null, 'Darius’s face');
      await hp.click('#ruFaces button[aria-label="Darius"]');
      await wait(hp, () => /^Not enough games against Darius yet/.test(document.getElementById('ruVsList').innerText), null, 'not enough games against Darius');
      assert.match(await text(hp, '#ruVsList .ruempty span'), /^(\d+ high elo games so far|No high elo games so far)\. Pages show here from 5\.$/);
      assert(await hp.isHidden('#ruVsNote'));
      await shot(hp, 'runes-tab-not-enough');
      lcu.cs.theirTeam[0].championId = top0;
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
      await openPage(hp, 'voice');
      await hp.click('#createBtn');
      await wait(hp, () => lpc.slot() >= 0, null, 'a room');
      await hp.click('#lolBtn'); // League mode on: the ready check is under the room in it (What's new 207)
      await hp.click('#readyBtn');
      await wait(hp, () => (document.querySelector('#readyRows tr td:last-child') || {}).textContent === 'Fullscreen: no overlay Switch to Borderless', null, 'Fullscreen in the ready check, with its button');
      await hp.click('#readyRows tr td:last-child button');
      await wait(hp, () => document.querySelector('#readyRows tr td:last-child').textContent === 'Borderless', null, 'Borderless now');
      assert.deepStrictEqual([lcu.general, lcu.saved], [{ WindowMode: 2, Width: 1920, Height: 1080 }, { WindowMode: 2, Width: 1920, Height: 1080 }], 'League’s own settings, saved');
      await openPage(hp, 'pregame');
      await wait(hp, () => document.getElementById('winFix').hidden, null, 'no Fullscreen fix any more');
      console.log('Fullscreen fix: Borderless in one click from the ready check, through League’s own settings');
      // in a game the explorer hides, like all advice
      await hl(leagueData());
      await wait(hp, () => document.getElementById('tdBox').hidden && !document.getElementById('tierBox').hidden, null, 'no draft board in a game, the tier list stays');
      await hl({ inGame: false, phase: 'None' });
      await hctx.close();
      console.log('draft board: hidden in a game');
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
      await openPage(ep, 'pregame');
      // the tier list on Emerald and Diamond's games, for your rank; Challenger and Grandmaster's a click away
      await wait(ep, () => !document.getElementById('tierBox').hidden && !document.getElementById('tierEloBox').hidden && document.querySelectorAll('#tierRows tr').length === 2, null, 'the tier list for your rank');
      assert.strictEqual(await ep.inputValue('#tierElo'), 'ed');
      assert.strictEqual(await ep.textContent('#tierTipNote'), 'Middle in 40 Emerald and Diamond games our server counted from Riot, patch 25.20.');
      assert.deepStrictEqual(await ep.$$eval('#tierRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())), ['Ahri S 60% 30 · 75% picked', 'Zed D 42% 12 · 30% picked']);
      await ep.selectOption('#tierElo', '');
      await wait(ep, () => document.getElementById('tierTipNote').textContent === 'Middle in 200 Challenger and Grandmaster games our server counted from Riot, patch 25.20 and 25.19.', null, 'Challenger and Grandmaster’s tier list');
      await ep.selectOption('#tierElo', 'ed');
      await wait(ep, () => /Emerald and Diamond/.test(document.getElementById('tierTipNote').textContent), null, 'and back');
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
      await wait(ep, () => /^Runes: the most popular page for Ahri, middle, in Emerald and Diamond/.test(lpc.lcu().runesNote), null, 'Emerald and Diamond’s runes');
      assert.strictEqual(await ep.evaluate(() => lpc.lcu().runesNote), 'Runes: the most popular page for Ahri, middle, in Emerald and Diamond (Arcane Comet: 60% won in 30 games). Spells: Flash on D, Teleport on F.');
      await wait(ep, () => /^Items: the Emerald and Diamond build on Ahri \(from 30 games\)/.test(document.getElementById('buildNote').textContent), null, 'Emerald and Diamond’s build');
      assert.deepStrictEqual(lcu.itemSets.itemSets.find((s) => s.uid === 'lpc-103').blocks.slice(0, 3).map((b) => [b.type, b.items.map((i) => i.id).join()]),
        [['Emerald and Diamond start', '1056'], ['Emerald and Diamond first items, in order', '6655,3157'], ['Emerald and Diamond boots', '3020']]);
      assert.strictEqual(await text(ep, '#topNote'), 'In Emerald and Diamond, Ahri middle won 60% of 30 games. Against their picks: Zed, 60% won in 30 games.');
      assert(champAsked.includes('103/MIDDLE/ed'), 'Emerald and Diamond’s Ahri in the middle asked for');
      lcu.cs = null;
      lcu.phase = 'None';
      await el({ inGame: false, phase: 'None' });
      console.log('builds at your rank: Arcane Comet, Teleport and the build from Emerald and Diamond’s games in champ select');
      // Settings, Champ select: Challenger and Grandmaster's games instead
      await openSet(ep, 'champ');
      assert(await ep.isVisible('#eloBox'), 'Most popular in, in Settings, Champ select');
      assert.strictEqual(await ep.inputValue('#optElo'), 'auto');
      // Stats: when to stop (champions to try are on each champion's page, not Stats: What's new 203)
      await openPage(ep, 'stats');
      await ep.click('.view[data-view="stats"] .tab[data-tab="you"]');
      await wait(ep, () => document.querySelectorAll('#stops .barrow').length, null, 'when to stop');
      assert.deepStrictEqual(await texts(ep, '#stops .barrow'), ['After a win 29% of 7', 'After a loss 20% of 5', 'After 2 losses 75% of 4', '1st game of the day 75% of 4', '4th game or later 50% of 8']);
      assert.strictEqual(await text(ep, '#stopNote'), 'After a loss you win 20%. Call it there.');
      assert(!(await ep.$('#tryList')), 'no Champions to try on Stats');
      // Settings > Our server: Emerald and Diamond's games, the pro players and the ladder players' champions
      await openPage(ep, 'settings');
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

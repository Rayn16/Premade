// Test of the desktop app's League features in site/index.html and site/remote.html, in headless Chromium, with a
// stand-in for the desktop app 1.7 (window.lpcClient with lcu, clips and the gallery) and a fake League client behind it.
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node league.e2e.js
// Checks: the Game page only in the desktop app, with a note to restart an old one; the ready check (Accept here, on the
// phone, and accepted for you, with the phone's buzz); the queue (a Practice Tool game in one click, Find match, Stop
// from the phone); champ select: your turn's alarm, trades here and on the phone, your team's ranks, recent games and tags, nobody whose name Riot hides
// looked up, banning and picking, your champions for your role, the damage mix, Riot's recommended runes as a new page
// and then over it, summoner spells with Flash on the right key; the phone remote (QR code, accept, hover, lock in,
// auto-accept); in game: all ten players scouted (one found by Riot ID), objective timers, kills, towers and the gold
// difference on the page, the overlay (what it shows, see-through, hidden by its key) and the phone, your lane and CS a
// minute, the sound before Dragon; clips from the clip key and a multikill, cut to the last seconds and playable, and the
// gallery (keep, rename, drag, play, cut, bin); after the game: the LP, the game report with MVP and ACE, Stats' LP
// tracker and chart, match history with its reports and the spreadsheet export, the voice game history with the
// report; the patch check, the performance meter, test recordings, your version and What's new, an app link into a
// room, the phone remote from its home screen icon, backup and restore; and that every call to League's client is
// one the desktop app lets through (client/main.js LCU_OK).
// League stats: your games read in detail (one lane guessed from the timeline), Clash scouting, tags for players seen
// before, premades, off-role and smurfs, ban ideas, matchup notes, your build as an item set and your skill order,
// your own rune page, auto hover; the report's replay, laning and item timeline; Stats' tabs (trends, hall of fame,
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
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8081, '127.0.0.1');

// ---- Data Dragon
const CHAMPS = [['Ahri', 103, 3, 8, 'Mage'], ['Garen', 86, 7, 1, 'Fighter Tank'], ['LeeSin', 64, 8, 3, 'Fighter'], ['Jinx', 222, 9, 4, 'Marksman'], ['Thresh', 412, 5, 6, 'Support'],
  ['Lux', 99, 2, 9, 'Mage Support'], ['Darius', 122, 9, 1, 'Fighter Tank'], ['Zed', 238, 9, 1, 'Assassin'], ['Sona', 37, 5, 8, 'Support'], ['Vi', 254, 8, 3, 'Fighter'], ['Caitlyn', 51, 8, 2, 'Marksman']];
const DDATA = Object.fromEntries(CHAMPS.map(([id, key, attack, magic, tags]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack, magic }, tags: tags.split(' ') }]));
const ITEM = (name, total, tags = [], into) => ({ name, gold: { total }, tags, ...(into && { into }) });
const ITEMS = { data: {
  1001: ITEM('Boots', 300, ['Boots'], ['3020', '3047']), 3031: ITEM('Infinity Edge', 3400), 1056: ITEM('Doran’s Ring', 400), 1055: ITEM('Doran’s Blade', 450),
  2003: ITEM('Health Potion', 50, ['Consumable']), 3340: ITEM('Stealth Ward', 0, ['Trinket']), 3020: ITEM('Sorcerer’s Shoes', 1100, ['Boots']), 3047: ITEM('Plated Steelcaps', 1200, ['Boots']),
  6655: ITEM('Luden’s Companion', 2750), 3157: ITEM('Zhonya’s Hourglass', 3250), 3089: ITEM('Rabadon’s Deathcap', 3600), 3071: ITEM('Black Cleaver', 3000),
} };
const RUNE_TREES = [
  { id: 8100, name: 'Domination', slots: [[8112, 'Electrocute'], [8126, 'Cheap Shot'], [8139, 'Taste of Blood'], [8138, 'Eyeball Collection'], [8135, 'Treasure Hunter']].map(([id, name]) => ({ runes: [{ id, name }] })) },
  { id: 8200, name: 'Sorcery', slots: [[8229, 'Arcane Comet'], [8226, 'Manaflow Band'], [8210, 'Transcendence'], [8237, 'Scorch']].map(([id, name]) => ({ runes: [{ id, name }] })) },
];
// a champion's full Data Dragon file, for patch changes: Ahri got more health and a shorter Q in 1.1
const champFull = (id, v) => ({ data: { [id]: { id, stats: { hp: id === 'Ahri' && v === '1.1' ? 600 : 590, armor: 21 }, passive: { name: 'Passive', description: 'Same.' },
  spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: id === 'Ahri' ? ['Orb of Deception', 'Fox-Fire', 'Charm', 'Spirit Rush'][i] : k, cooldownBurn: id === 'Ahri' && !i && v === '1.1' ? '6' : '7', costBurn: '50', rangeBurn: '900', tooltip: '', description: '' })) } } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ---- the fake League client
const ME = 'me-puuid', GAME = 5550001;
const TEAM1 = [[ME, 'Rayan', 103, 'MIDDLE'], ['ally1', 'Friend', 86, 'TOP'], ['ally2', 'Jungler', 64, 'JUNGLE'], ['ally3', 'Shooter', 222, 'BOTTOM'], ['ally4', 'Hooks', 412, 'UTILITY']];
const TEAM2 = [['enemy1', 'Axe', 122, 'TOP'], ['enemy2', 'Puncher', 254, 'JUNGLE'], ['enemy3', 'Shadow', 238, 'MIDDLE'], ['enemy4', 'Sniper', 51, 'BOTTOM'], ['', 'Singer', 37, 'UTILITY']];
let t0 = Date.now() - 3600e3;
// a match history: [champion, win, more] newest first, its games numbered from base; more: { id, lane, role, items,
// perks (the trees, then six runes), penta, vision }
const hist = (games, base = 9000) => ({ games: { games: games.map(([champ, win, x = {}], i) => ({ gameId: x.id || base + i, platformId: 'EUW1', gameCreation: t0 - i * 3600e3, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
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
  enemy4: hist(rep(20, 51, (i) => i % 5 !== 0), 35000),                                           // won 80%, at level 30: a smurf?
};
const BASES = new Map(); // everyone else's games numbered apart, so nobody's a premade by chance
const histOf = (who) => HIST[who] || hist(rep(20, 86, (i) => i % 2 === 1), BASES.get(who) || BASES.set(who, 40000 + 100 * BASES.size).get(who));
const AHRI = { lane: 'MIDDLE', perks: [8100, 8200, 8112, 8139, 8138, 8135, 8226, 8210], items: [6655, 3157, 3089, 3020] };
const LUX = { lane: 'MIDDLE', perks: [8200, 8100, 8229, 8226, 8210, 8237, 8139, 8135], items: [6655, 3020] };
const MY_HIST = hist([[103, true, AHRI], ...rep(7, 103, (i) => i < 5, (i) => ({ ...AHRI, penta: i === 2 ? 1 : 0, vision: 15 + i })), ...rep(5, 99, (i) => i < 3, LUX),
  ...rep(4, 86, (i) => i < 1, { lane: 'TOP', items: [3071, 3047] }), ...rep(3, 37, true, { lane: 'BOTTOM', role: 'DUO_SUPPORT' })]); // 13 won
MY_HIST.games.games[0].gameId = GAME;
const MASTERY = { [ME]: [[103, 7, 120000], [99, 5, 40000], [86, 4, 20000], [238, 6, 50000]], enemy3: [[103, 5, 30000]] };
const mastery = (who) => (MASTERY[who] || [[86, 3, 5000]]).map(([championId, championLevel, championPoints]) => ({ championId, championLevel, championPoints }));
const POSITIONS = { 103: ['MIDDLE'], 99: ['MIDDLE', 'UTILITY'], 86: ['TOP'], 37: ['UTILITY'], 238: ['MIDDLE'] };
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
          visionScore: 20, totalMinionsKilled: 120 * star, neutralMinionsKilled: 0, totalDamageTaken: 15000, damageSelfMitigated: 5000 } };
    }),
  };
}
// a game's timeline, a frame a minute: everyone in their lane's part of the map (you ahead of Zed in CS and gold, behind
// in XP), your buys and the order you levelled Q, W, E and R
const SPOT = { TOP: [2000, 12000], JUNGLE: [5000, 7000], MIDDLE: [7400, 7400], BOTTOM: [12500, 2500], UTILITY: [12000, 2300] };
const SKILLS = [1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3];
function timeline(id) {
  const g = MY_HIST.games.games.find((x) => x.gameId === id), champ = g ? g.participants[0].championId : 103;
  const buys = champ === 86 ? [[30, 1055], [30, 2003], [600, 3047], [900, 3071]] : [[25, 1056], [25, 2003], [26, 3340], [480, 3020], [720, 6655], [1200, 3157], [1680, 3089]];
  const ps = [...TEAM1, ...TEAM2];
  const frames = Array.from({ length: 31 }, (_, m) => ({ timestamp: m * 60000 + (m ? 300 : 0), events: [],
    participantFrames: Object.fromEntries(ps.map(([, , , pos], i) => [String(i + 1), { participantId: i + 1, position: { x: SPOT[pos][0], y: SPOT[pos][1] }, level: 1,
      minionsKilled: (i === 0 ? 8 : pos === 'UTILITY' ? 1 : pos === 'JUNGLE' ? 0 : 7) * m, jungleMinionsKilled: pos === 'JUNGLE' ? 4 * m : 0, totalGold: (i === 0 ? 400 : 350) * m, currentGold: 0, xp: (i === 0 ? 500 : 520) * m }])) }));
  for (const [t, itemId] of buys) frames[Math.ceil(t / 60)].events.push({ type: 'ITEM_PURCHASED', timestamp: t * 1000, participantId: 1, itemId });
  SKILLS.forEach((skillSlot, k) => frames[1 + k].events.push({ type: 'SKILL_LEVEL_UP', timestamp: (1 + k) * 60000, participantId: 1, skillSlot, levelUpType: 'NORMAL' }));
  return { frames };
}
// Clash: your team's next match is against Night Owls, two of whom League names
const CLASH_SUMS = { 501: { puuid: 'clash1', gameName: 'Owl', tagLine: 'NA1' }, 502: { puuid: 'clash2', gameName: 'Hoot', tagLine: 'NA1' } };
const lcu = { phase: '', rc: null, cs: null, pages: [{ id: 1, name: 'My page', isEditable: true }], lpNote: null, lobby: null, search: null, calls: [], refused: [],
  clash: true, lp: {}, replay: {}, itemSets: { accountId: 77, timestamp: 1, itemSets: [{ uid: 'mine-1', title: 'My set', blocks: [] }] } };
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
    else lcu.cs.myTeam[2].championId = a.championId;
    return { status: 204, data: null };
  }
  if (p === '/lol-champ-select/v1/session/my-selection') { Object.assign(lcu.cs.myTeam[2], body); return { status: 204, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: ME, gameName: 'Rayan', tagLine: 'EUW', summonerId: 1234, summonerLevel: 300, profileIconId: 4568 });
  if ((m = /^\/lol-summoner\/v2\/summoners\/puuid\/([\w-]+)$/.exec(p))) return ok({ puuid: m[1], summonerLevel: m[1] === 'enemy4' ? 30 : 200 });
  if ((m = /^\/lol-summoner\/v1\/summoners\/(\d+)$/.exec(p))) return CLASH_SUMS[m[1]] ? ok({ ...CLASH_SUMS[m[1]], summonerId: +m[1] }) : { status: 404, data: null };
  if ((m = /alias\/lookup\?gameName=([^&]*)&tagLine=(.*)$/.exec(p))) {
    const who = { Singer: 'enemy5', Sniper: 'enemy4', Axe: 'enemy1' }[decodeURIComponent(m[1])];
    return who && m[2] === 'EUW' ? ok({ puuid: who }) : { status: 404, data: null };
  }
  if ((m = /^\/lol-ranked\/v1\/ranked-stats\/(.+)$/.exec(p))) return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: lcu.lp[m[1]] || 45, wins: 30, losses: 25 }, ...(m[1] === 'ally1' && { RANKED_FLEX_SR: { tier: 'SILVER', division: 'I', leaguePoints: 10, wins: 3, losses: 1 } }) } });
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: lcu.lpNote ? 63 : 45, wins: 31, losses: 25 } } });
  if (p === '/lol-ranked/v1/current-lp-change-notification') return lcu.lpNote ? ok(lcu.lpNote) : { status: 404, data: null };
  if ((m = /^\/lol-match-history\/v1\/products\/lol\/([\w-]+)\/matches\?begIndex=(\d+)&endIndex=(\d+)$/.exec(p))) { // both ends in, as League's client does
    const h = m[1] === 'current-summoner' ? MY_HIST : histOf(m[1]);
    return ok({ games: { games: h.games.games.slice(+m[2], +m[3] + 1) } });
  }
  if ((m = /^\/lol-match-history\/v1\/games\/(\d+)$/.exec(p))) return ok(report(+m[1]));
  if ((m = /^\/lol-match-history\/v1\/game-timelines\/(\d+)$/.exec(p))) return ok(timeline(+m[1]));
  if ((m = /^\/lol-item-sets\/v1\/item-sets\/(\d+)\/sets$/.exec(p))) {
    if (m[1] !== '1234') return { status: 404, data: null };
    if (method === 'GET') return ok(lcu.itemSets);
    lcu.itemSets = body;
    return { status: 201, data: null };
  }
  if ((m = /^\/lol-replays\/v1\/metadata\/(\d+)$/.exec(p))) return ok({ gameId: +m[1], state: lcu.replay[m[1]] || 'download', downloadProgress: 0 });
  if ((m = /^\/lol-replays\/v1\/rofls\/(\d+)\/(download|watch)$/.exec(p))) { lcu.replay[m[1]] = 'watch'; return { status: 204, data: null }; }
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
  if (p === '/lol-perks/v1/pages') { const page = { ...body, id: 50, isEditable: true }; lcu.pages.push(page); return ok(page); }
  if ((m = /^\/lol-perks\/v1\/pages\/(\d+)$/.exec(p))) { Object.assign(lcu.pages.find((x) => x.id === +m[1]), body); return { status: 201, data: null }; }
  if (p === '/lol-perks/v1/currentpage') return { status: 204, data: null };
  if (p === '/lol-patch/v1/game-version') return ok('14.20.612.1234');
  if (p === '/lol-lobby/v2/lobby' && method === 'GET') return lcu.lobby ? ok(lcu.lobby) : { status: 404, data: null };
  if (p === '/lol-lobby/v2/lobby') return ok({ ...body, localMember: { isLeader: true } });
  if (p === '/lol-matchmaking/v1/search') return lcu.search ? ok(lcu.search) : { status: 404, data: null };
  if (p === '/lol-lobby/v2/lobby/members/localMember/position-preferences') return { status: 201, data: null };
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
  const on = {};
  window.lpcClient = {
    calls: [], version,
    screens: async () => [{ id: '1', main: true, thumb: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
    useScreen() {}, keys: async (k) => ({ mute: !!k.mute, show: !!k.show, clip: !!k.clip, overlay: !!k.overlay, ptt: !!k.ptt }), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    ...(version >= '1.6' && {
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
    ...(version >= '1.7' && {
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
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  if (phone) await ctx.addInitScript(() => { window.buzzes = []; navigator.vibrate = (p) => { buzzes.push(p); return true; }; }); // the phone's buzz
  if (!phone) {
    await ctx.route('**/latest.yml', (r) => r.fulfill({ body: 'version: 1.8.0\npath: Premade-Setup.exe\n', contentType: 'text/yaml' })); // a newer app is out
    await ctx.addInitScript(() => {
      localStorage.setItem('lpc-setup', '1');
      localStorage.setItem('lpc-name', 'Rayan');
      localStorage.setItem('lpc-news', '9999'); // no What's new
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
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; lcu ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.lcu()).catch(() => null))}; last calls ${JSON.stringify(lcu.calls.slice(-6))}; toasts ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.toasts().slice(-5)).catch(() => null))}; page ${JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => ''))}`);
});
const text = (page, sel) => page.locator(sel).innerText();
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true }); // SHOTS=folder saves screenshots
const leagueData = (over = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t: 600, room: 'g0123456789a', result: '',
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 },
  players: [...TEAM1.map(([, n, c, pos], i) => ({ name: `${n}#EUW`, team: 'ORDER', champ: Object.values(DDATA).find((d) => +d.key === c).id, champName: '', pos, lvl: 11, k: [3, 2, 0, 0, 0][i], d: 1, a: 2, cs: 100, items: [[3031, 1]] })),
    ...TEAM2.map(([, n, c, pos], i) => ({ name: `${n}#EUW`, team: 'CHAOS', champ: Object.values(DDATA).find((d) => +d.key === c).id, champName: '', pos, lvl: 10, k: [1, 0, 2, 0, 0][i], d: 2, a: 1, cs: 90, items: [[1001, 1]] }))],
  events: [{ e: 'dragon', t: 400, team: 'ORDER', type: 'Fire', me: false, alive: true }, { e: 'tower', t: 500, of: 'CHAOS', name: 'Turret_T2_C_05_A', team: 'ORDER' }, { e: 'inhib', t: 550, of: 'CHAOS', name: 'Barracks_T2_C1', team: 'ORDER' }],
  ...over,
});

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    // ---- in a browser there's no Game page; an old app has it, with a note to restart for the update
    {
      const [ctx, page] = await context(browser);
      await page.goto(URL_);
      assert(!(await page.locator('.nav[data-view="game"]').isVisible()), 'no Game page in a browser');
      await ctx.close();
      const [ctx2, old] = await context(browser, { version: '1.5.0' });
      await old.goto(URL_);
      await old.click('.nav[data-view="game"]');
      assert.match(await text(old, '#lcuNote'), /Restart the app to finish its update/);
      await old.click('.nav[data-view="stats"]');
      assert(!(await old.locator('#lpQueue').isVisible()) && !(await old.locator('#clipsFolder').isVisible()), 'an old app has no Ranked, Match history or Clips');
      await ctx2.close();
      console.log('Game page: only in the desktop app; an old app is told to restart for its update');
    }

    // ---- Profile in a browser: from Riot, through our server, by Riot ID; the first one given is you
    {
      const [ctx, page] = await context(browser);
      const cors = { 'access-control-allow-origin': '*' }, riotCalls = [];
      const PU = (n) => n.padEnd(78, '0'), ANA = PU('ana-'), BOB = PU('bob-');
      const POSN = ['MIDDLE', 'TOP', 'JUNGLE', 'BOTTOM', 'UTILITY'];
      const match5 = (id, champ, win) => ({ metadata: { matchId: `EUW1_${id}` }, info: { gameId: id, gameCreation: Date.now() - (id % 10) * 3600e3, gameDuration: 1500, gameEndTimestamp: Date.now(), queueId: 420, gameMode: 'CLASSIC',
        participants: Array.from({ length: 10 }, (_, i) => ({ puuid: i ? PU(`p${i}-`) : ANA, riotIdGameName: i ? `P${i}` : 'Ana B', riotIdTagline: 'EUW', championId: i ? CHAMPS[i][1] : champ, teamId: i < 5 ? 100 : 200,
          teamPosition: POSN[i % 5], win: i < 5 ? win : !win, kills: i ? 3 : 8, deaths: 2, assists: 5, totalMinionsKilled: 180, neutralMinionsKilled: 10, visionScore: 22, totalDamageDealtToChampions: 20000,
          goldEarned: 11000, totalDamageTaken: 15000, damageSelfMitigated: 4000, item0: 6655, item1: 3020, item6: 3340 })) } });
      const RIOT = {
        '/europe/riot/account/v1/accounts/by-riot-id/Ana%20B/EUW': { puuid: ANA, gameName: 'Ana B', tagLine: 'EUW' },
        '/europe/riot/account/v1/accounts/by-riot-id/Bob/EUW': { puuid: BOB, gameName: 'Bob', tagLine: 'EUW' },
        [`/euw1/lol/summoner/v4/summoners/by-puuid/${ANA}`]: { profileIconId: 29, summonerLevel: 87 },
        [`/euw1/lol/summoner/v4/summoners/by-puuid/${BOB}`]: { profileIconId: 1, summonerLevel: 31 },
        [`/euw1/lol/league/v4/entries/by-puuid/${ANA}`]: [{ queueType: 'RANKED_SOLO_5x5', tier: 'EMERALD', rank: 'III', leaguePoints: 12, wins: 40, losses: 35 }, { queueType: 'CHERRY', tier: 'GOLD' }],
        [`/euw1/lol/league/v4/entries/by-puuid/${BOB}`]: [],
        [`/euw1/lol/champion-mastery/v4/champion-masteries/by-puuid/${ANA}/top?count=5`]: [{ championId: 103, championLevel: 12, championPoints: 251000 }],
        [`/euw1/lol/champion-mastery/v4/champion-masteries/by-puuid/${BOB}/top?count=5`]: [],
        [`/euw1/lol/spectator/v5/active-games/by-summoner/${ANA}`]: { gameQueueConfigId: 420, gameStartTime: Date.now() - 5.5 * 60000, participants: [{ puuid: ANA, championId: 103, teamId: 100 }, { puuid: BOB, championId: 86, teamId: 200 }] },
        [`/europe/lol/match/v5/matches/by-puuid/${ANA}/ids?count=10`]: ['EUW1_7000000001', 'EUW1_7000000002', 'EUW1_7000000003', '../oops'],
        [`/europe/lol/match/v5/matches/by-puuid/${BOB}/ids?count=10`]: [],
        '/europe/lol/match/v5/matches/EUW1_7000000001': match5(7000000001, 103, true),
        '/europe/lol/match/v5/matches/EUW1_7000000002': match5(7000000002, 103, false),
        '/europe/lol/match/v5/matches/EUW1_7000000003': match5(7000000003, 99, true),
      };
      await ctx.route(/127\.0\.0\.1:9001\/riot\//, (r) => {
        const u = r.request().url().replace(/^.*?\/riot/, '');
        if (u === '/summary') return r.fulfill({ json: { p: '16.20', c: {}, old: null, today: 5, total: 50, at: Date.now() }, headers: cors });
        const p = u.replace(/^\/api/, '');
        riotCalls.push(p);
        if (p.includes('/Busy/')) return r.fulfill({ status: 429, body: 'Too many lookups for now', headers: cors });
        return p in RIOT ? r.fulfill({ json: RIOT[p], headers: cors }) : r.fulfill({ status: 404, json: { status: { status_code: 404 } }, headers: cors });
      });
      await page.goto(URL_);
      await wait(page, () => window.lpc && lpc.riotOn() && !document.getElementById('proFindBox').hidden, null, 'the Riot ID form');
      assert.match(await text(page, '#proNote'), /^Type your Riot ID and server below/);
      assert.strictEqual(await page.textContent('#h-profind'), 'Your Riot ID');
      assert.strictEqual(await text(page, '#proGo'), 'Show my profile');
      await page.fill('#proId', 'Nobody#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proFindNote').textContent === 'Nobody called Nobody#EUW on EUW.', null, 'nobody by that name');
      await page.fill('#proId', 'Busy#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proFindNote').textContent === 'Too many lookups right now. Try again in a minute.', null, 'our server busy');
      await page.fill('#proId', 'Ana B#EUW');
      await page.selectOption('#proRegion', 'euw1');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Ana B' && document.querySelectorAll('#proGames > li').length === 3 && /Ahri/.test(document.getElementById('proStatus').textContent), null, 'Ana’s profile from Riot');
      assert.strictEqual(await text(page, '#proTag'), '#EUW');
      assert.strictEqual(await text(page, '#proSub'), 'EUW · Level 87');
      assert.match(await page.getAttribute('#proIcon', 'src'), /\/cdn\/1\.1\/img\/profileicon\/29\.png$/);
      assert.match(await text(page, '#proStatus'), /^In game as Ahri · Ranked Solo\/Duo · [56] min$/);
      const rk = await page.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.ph, .rtier, .hint')].map((x) => x.textContent).join('|')));
      assert.deepStrictEqual(rk, ['Solo/Duo|Emerald III|12 LP · 40W 35L · 53%', 'Flex|Unranked|']);
      assert.strictEqual(await page.textContent('#h-proform'), 'Last 3 games');
      assert.match(await page.textContent('#proForm'), /^Record\s*2W 1L · 67%\s*KDA\s*8\.0 \/ 2\.0 \/ 5\.0 · 6\.5\s*CS a minute\s*7\.6\s*Main role\s*Middle, 3 of 3$/);
      assert.strictEqual(await page.$$eval('#proGames > li:first-child .gitems img', (l) => l.length), 2, 'items, not the trinket');
      assert.match(await text(page, '#proMastery'), /Ahri\s*Level 12 · 251k points/);
      assert(await page.locator('#proMastery .champ').first().isDisabled(), 'champion pages need League’s client');
      assert.strictEqual(await page.textContent('#h-profind'), 'Look up a player');
      // a game's report, from Riot's copy of the game
      await page.click('#proGames > li:first-child summary');
      await wait(page, () => document.querySelectorAll('#proGames > li:first-child .report > .tablewrap tbody tr').length === 10, null, 'the report from Riot');
      assert(await page.locator('#proGames > li:first-child .report tr[data-me]').count() === 1, 'Ana marked in it');
      assert(!riotCalls.some((c) => c.includes('oops')), 'only real match ids asked for');
      assert.strictEqual(riotCalls.length, 12, `Nobody, Busy, Ana in 9 calls and her game for the report, nothing twice: ${riotCalls.join(' ')}`);
      // someone else: Bob, not in a game and unranked
      await page.fill('#proId', 'Bob#EUW');
      await page.click('#proGo');
      await wait(page, () => document.getElementById('proName').textContent === 'Bob' && !document.getElementById('proBack').hidden, null, 'Bob’s profile');
      assert.strictEqual(await text(page, '#proStatus'), 'Not in a game right now');
      assert.strictEqual(await text(page, '#proGames'), 'No recent games.');
      assert(await page.locator('#proMasteryBox').isHidden(), 'no mastery to show');
      await page.click('#proBack');
      await wait(page, () => document.getElementById('proName').textContent === 'Ana B', null, 'back to Ana');
      // the next visit: Ana as she was, then fresh from Riot; and Not you? forgets her
      assert(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('lpc-profile')); return p.n === 'Ana B#EUW' && p.plat === 'euw1' && !('live' in p); }), 'Ana kept, without whether she’s in a game');
      const before = riotCalls.length;
      await page.reload();
      await wait(page, () => window.lpc && document.getElementById('proName').textContent === 'Ana B', null, 'Ana kept');

      await until(() => riotCalls.length === before + 9, 'Ana updated from Riot');
      await wait(page, () => /^In game as Ahri/.test(document.getElementById('proStatus').textContent), null, 'and in a game');
      assert.match(await text(page, '#proNote'), /^As of /);
      await page.click('#proForget');
      await wait(page, () => document.getElementById('proName').textContent === 'Your League profile' && document.getElementById('proGo').textContent === 'Show my profile', null, 'forgotten');
      await ctx.close();
      console.log(`Profile in a browser: Ana B by Riot ID (in game, Emerald III, 3 games and a report), Bob looked up, kept and refreshed; ${riotCalls.length} calls to Riot`);
    }

    const [ctx, pc] = await context(browser, { version: '1.7.0' });
    await ctx.exposeFunction('fakeLcu', fakeLcu);
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
    // ---- Profile, the first page: you in League like a stats site's profile, from League's client
    await wait(pc, () => !document.querySelector('.view[data-view="profile"]').hidden && document.getElementById('proName').textContent === 'Rayan' && /Gold II/.test(document.getElementById('proRanks').textContent), null, 'your profile');
    assert.strictEqual(await text(pc, '#proTag'), '#EUW');
    assert.strictEqual(await text(pc, '#proSub'), 'EUW · Level 300');
    assert.strictEqual(await text(pc, '#proLvl'), '300');
    assert.match(await pc.getAttribute('#proIcon', 'src'), /\/cdn\/1\.1\/img\/profileicon\/4568\.png$/);
    assert.strictEqual(await text(pc, '#proStatus'), 'In the client');
    const proRanks = () => pc.$$eval('#proRanks .rank', (l) => l.map((e) => [...e.querySelectorAll('.ph, .rtier, .hint')].map((x) => x.textContent).join('|')));
    assert.deepStrictEqual(await proRanks(), ['Solo/Duo|Gold II|45 LP · 31W 25L · 55%', 'Flex|Unranked|']);
    assert.strictEqual(await pc.textContent('#h-proform'), 'Last 20 games');
    assert.match(await pc.textContent('#proForm'), /^Record\s*13W 7L · 65%\s*KDA\s*5\.0 \/ 3\.0 \/ 7\.0 · 4\.0\s*CS a minute\s*5\.3\s*Main role\s*Middle, 13 of 20$/);
    assert.deepStrictEqual(await pc.$$eval('#proChamps .champ', (l) => l.map((e) => e.innerText.replace(/\s+/g, ' '))), ['Ahri 8 games · 75% won · 4.0 KDA', 'Lux 5 games · 60% won · 4.0 KDA', 'Garen 4 games · 25% won · 4.0 KDA']);
    assert.deepStrictEqual(await pc.$$eval('#proMastery .sub', (l) => l.map((e) => e.textContent)), ['Level 7 · 120k points', 'Level 6 · 50k points', 'Level 5 · 40k points', 'Level 4 · 20k points']);
    assert.strictEqual(await pc.locator('#proGames > li').count(), 10);
    assert.strictEqual(await pc.$$eval('#proGames > li:first-child .gitems img', (l) => l.length), 4);
    await pc.click('#proGames > li:first-child summary');
    await wait(pc, () => document.querySelectorAll('#proGames > li:first-child .report > .tablewrap tbody tr').length === 10, null, 'a game’s report on your profile');
    assert(await pc.locator('#profileBtn').isVisible() && await pc.locator('#proBack').isHidden() && await pc.locator('#proNote').isHidden(), 'Share, and nothing about it being old');
    const kept = await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-profile')));
    assert(kept.n === 'Rayan#EUW' && kept.plat === 'euw1' && kept.games.length === 20 && kept.icon === 4568 && kept.rk.RANKED_SOLO_5x5.tier === 'GOLD', 'kept for when League is closed');
    // someone on your server, through League's client
    await pc.fill('#proId', 'Sniper#EUW');
    await pc.click('#proGo');
    await wait(pc, () => document.getElementById('proName').textContent === 'Sniper' && document.querySelectorAll('#proGames > li').length === 10, null, 'Sniper’s profile');
    assert.strictEqual(await text(pc, '#proSub'), 'EUW · Level 30');
    assert(await pc.locator('#proStatus').isHidden() && await pc.locator('#profileBtn').isHidden(), 'no status or Share for someone else');
    await pc.click('#proBack');
    await wait(pc, () => document.getElementById('proName').textContent === 'Rayan', null, 'back to you');
    console.log('Profile: Rayan#EUW, level 300, Gold II, in the client, 13W 7L in 20 games, Ahri first; a report; Sniper looked up');
    await pc.click('.nav[data-view="game"]');
    assert.match(await text(pc, '#lcuNote'), /Find a match and this page fills in/);
    // Clash: the other team in your next match, with their ranks and best champions
    await wait(pc, () => !document.getElementById('clashBox').hidden && document.querySelectorAll('#clashRows tr').length === 2 && [...document.querySelectorAll('#clashRows tr')].every((tr) => /LP[\s\S]*Garen/.test(tr.textContent)), null, 'Clash scouting');
    assert.strictEqual(await text(pc, '#clashNote'), 'Your next Clash match is against Night Owls.');
    const clashRows = await pc.$$eval('#clashRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
    assert.match(clashRows[0], /^Owl#NA1 Top · Level 200 Gold II · 45 LP · 55% of 55 Last 20: 10W 10L .*Plays most: Garen 20 \(50%\) · Mastery: Garen 5k/);
    assert.match(clashRows[1], /^Hoot#NA1 Middle · Level 200/);
    console.log('Clash: Night Owls scouted');
    await pc.click('.nav[data-view="settings"]');
    assert.strictEqual(await text(pc, '#kClip'), 'Ctrl+Shift+K');
    await pc.check('#optRemote');
    await pc.click('.nav[data-view="room"]');
    await pc.click('#createBtn'); // a room, for the mic: clips mix it in
    await wait(pc, () => lpc.slot() >= 0, null, 'a room');

    // ---- the phone remote: a QR code and a link, and the phone connects
    await pc.click('.nav[data-view="game"]');
    await wait(pc, () => !document.getElementById('remoteBox').hidden && /remote\.html/.test(document.getElementById('remoteLink').href), null, 'the phone remote panel');
    const dark = await pc.evaluate(() => { const d = document.getElementById('qr').getContext('2d').getImageData(0, 0, 232, 232).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 50) n++; return n; });
    assert(dark > 3000, `the QR code is drawn (${dark} dark pixels)`);
    const link = await pc.getAttribute('#remoteLink', 'href');
    assert.match(link, /^http:\/\/127\.0\.0\.1:8081\/remote\.html\?peer=127\.0\.0\.1:9001&debug#[a-z0-9]{12}$/);
    const [pctx, phone] = await context(browser, { phone: true });
    await phone.goto(link);
    await wait(phone, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone to connect');
    await wait(pc, () => document.getElementById('remoteState').textContent === 'Your phone is connected.', null, 'the PC to see the phone');
    await wait(phone, () => /client/.test(document.getElementById('phase').textContent), null, 'the phone to show League');
    console.log(`phone remote: QR code (${dark} dark pixels) and link, the phone connected`);

    // ---- the queue: a Practice Tool game in one click outside a lobby, Find match in a lobby you lead, Stop from the phone
    await wait(pc, () => !document.getElementById('queueBox').hidden && !document.getElementById('practiceBtn').hidden && document.getElementById('queueBtn').hidden, null, 'Practice Tool offered outside a lobby');
    await pc.click('#practiceBtn');
    await until(() => callsTo(/custom\/start-champ-select$/, 'POST').length === 1, 'the Practice Tool game started');
    assert.deepStrictEqual(callsTo(/^\/lol-lobby\/v2\/lobby$/, 'POST')[0][2], { isCustom: true, customGameLobby: { lobbyName: 'Premade practice', lobbyPassword: '',
      configuration: { gameMode: 'PRACTICETOOL', gameMutator: '', gameServerRegion: '', mapId: 11, mutators: { id: 1 }, spectatorPolicy: 'AllAllowed', teamSize: 5 } } });
    lcu.lobby = { localMember: { isLeader: true }, gameConfig: { isCustom: false, queueId: 420 }, members: [{}, {}] };
    lcu.phase = 'Lobby';
    await league({ inGame: false, phase: 'Lobby' });
    await wait(pc, () => document.getElementById('queueState').textContent === 'In a lobby for Ranked Solo/Duo.' && document.getElementById('practiceBtn').hidden && !document.getElementById('queueBtn').hidden, null, 'the lobby, with a friend in it');
    await pc.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'POST').length === 1, 'Find match');
    lcu.search = { timeInQueue: 65.4, estimatedQueueTime: 120 };
    lcu.phase = 'Matchmaking';
    await league({ inGame: false, phase: 'Matchmaking' });
    await wait(pc, () => document.getElementById('queueState').textContent === 'Finding a match: 1:05, usually about 2:00.' && document.getElementById('queueBtn').textContent === 'Stop', null, 'finding a match');
    await wait(phone, () => document.getElementById('queueState').textContent === 'Finding a match: 1:05, usually about 2:00.' && document.getElementById('queueBtn').textContent === 'Stop', null, 'the queue on the phone');
    await phone.click('#queueBtn');
    await until(() => callsTo(/matchmaking\/search$/, 'DELETE').length === 1, 'Stop from the phone');
    console.log('queue: a Practice Tool game in one click, Find match here, Stop from the phone');

    // ---- ready checks: accepted here, on the phone, then for you
    await pc.click('.nav[data-view="room"]');
    const readyCheck = async () => { lcu.rc = { state: 'InProgress', playerResponse: 'None', timer: 2 }; lcu.phase = 'ReadyCheck'; await league({ inGame: false, phase: 'ReadyCheck' }); };
    const backToQueue = async () => { lcu.rc = null; lcu.phase = 'Matchmaking'; await league({ inGame: false, phase: 'Matchmaking' }); };
    await readyCheck();
    await wait(pc, () => !document.querySelector('.view[data-view="game"]').hidden && !document.getElementById('rcBox').hidden, null, 'the Game page with the ready check');
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
    await readyCheck();
    await wait(pc, () => lpc.toasts().includes('Match found: accepted it for you'), null, 'accepted for you');
    assert.strictEqual(callsTo(/ready-check\/accept$/, 'POST').length, 3);
    await pc.evaluate(() => { const c = document.getElementById('optAutoAccept'); c.checked = false; c.dispatchEvent(new Event('change')); });
    console.log('ready check: accepted on the PC, on the phone, and for you (turned on from the phone)');

    // ---- champ select
    champSelect(777);
    lcu.rc = null;
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await wait(pc, () => !document.getElementById('csBox').hidden && [...document.querySelectorAll('#csRows tr')].filter((tr) => /Gold II · 45 LP · 55% of 55/.test(tr.textContent)).length === 3 && /hovering Garen/.test(document.getElementById('csRows').textContent), null, 'champ select with ranks');
    const rows = await pc.$$eval('#csRows tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
    assert.strictEqual(rows.length, 5);
    assert.match(rows[0], /Friend#EUW .*Top.*hovering Garen.*Gold II · 45 LP.*Flex: Silver I · 10 LP.*Last 20: 6W 14L.*Garen: 8 games, 75% won.*6 wins in a row.*Comfort pick.*Seen before: 20 with you \(13W 7L\)/);
    assert.match(rows[4], /Hooks#EUW .*Off-role: rarely plays support \(0 of 20\)/);
    assert.doesNotMatch(rows.join(), /Premade|smurf/);
    assert.match(rows[1], /Name hidden by Riot/);
    assert.match(rows[3], /Name hidden by Riot/);
    assert(!lcu.calls.some(([, p]) => /hidden1/.test(p)), 'nobody whose name Riot hides is looked up');
    assert.match(await text(pc, '#csTurn'), /Your turn to ban: \d+ s left/);
    await wait(pc, () => lpc.toasts().includes('Your turn to ban!'), null, 'the turn alarm');
    await wait(phone, () => buzzes.some((b) => b.length === 3), null, 'the turn alarm on the phone');
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
    // the champions you lose to most, to ban: hover Darius by name, then ban him from his button
    assert.strictEqual(await pc.locator('#bansHead').textContent(), 'Champions you lose to most');
    assert.deepStrictEqual(await pc.$$eval('#bans button', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' '))), ['Darius You lost 3 of 4 against it']);
    await pc.fill('#anyChamp', 'Darius');
    await pc.click('#hoverBtn');
    await wait(pc, () => /hovering Darius/.test(document.getElementById('csTurn').textContent), null, 'the ban hovered');
    await pc.click('#bans button:has-text("Darius")');
    await wait(pc, () => /Your turn to pick/.test(document.getElementById('csTurn').textContent), null, 'my pick');
    assert.deepStrictEqual(flatActions().find((a) => a.id === 3), { id: 3, actorCellId: 2, type: 'ban', completed: true, isInProgress: false, championId: 122 });
    await wait(pc, () => document.querySelectorAll('#picks button').length === 2, null, 'my champions for middle');
    const picks = await pc.$$eval('#picks button', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ')));
    assert.match(picks[0], /^Ahri 8 games, 75% · KDA 4\.0$/);
    assert.match(picks[1], /^Lux 5 games, 60%/); // Garen and Sona aren't middle, Zed is taken by them
    assert.match(await text(pc, '#csTheirs'), /Their picks: Zed\. Banned: a champion, Darius\./);
    assert.match(await text(pc, '#mixNote'), /Your team so far: 1 physical, 1 magic damage\./); // Garen and Thresh hovered
    // hover from the phone, lock in here
    await wait(phone, () => [...document.querySelectorAll('#picks button')].some((b) => b.textContent === 'Ahri'), null, 'the picks on the phone');
    await phone.click('#picks button:has-text("Ahri")');
    await wait(pc, () => /hovering Ahri/.test(document.getElementById('csTurn').textContent), null, 'Ahri hovered from the phone');
    await pc.click('#picks button:has-text("Ahri")');
    await wait(pc, () => /Runes: Riot’s page/.test(document.getElementById('runesNote').textContent), null, 'the runes');
    assert.strictEqual(await text(pc, '#runesNote'), 'Runes: Riot’s page for Ahri, middle (Electrocute). Spells: Flash on D, Ignite on F.');
    const page1 = callsTo(/^\/lol-perks\/v1\/pages$/, 'POST');
    assert.strictEqual(page1.length, 1);
    assert.deepStrictEqual(page1[0][2], { name: 'LPC Ahri', primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8126, 8138, 8135, 8226, 8210, 5008, 5008, 5002], current: true });
    assert.deepStrictEqual(callsTo(/my-selection$/, 'PATCH').pop()[2], { spell1Id: 4, spell2Id: 14 });
    assert.match(await text(pc, '#csTurn'), /You’re playing Ahri/);
    // your usual build in League's shop, your skill order, and a matchup note against Zed
    await wait(pc, () => document.getElementById('buildNote').textContent === 'Items: your build on Ahri from 8 of your games is in League’s shop as “LPC Ahri”.', null, 'the item set');
    const sets = callsTo(/^\/lol-item-sets\/v1\/item-sets\/1234\/sets$/, 'PUT');
    assert.strictEqual(sets.length, 1);
    const set = sets[0][2], lpcSet = set.itemSets[1];
    assert.deepStrictEqual(set.itemSets.map((s) => s.title), ['My set', 'LPC Ahri']);
    assert.deepStrictEqual(lpcSet.blocks.map((b) => [b.type, b.items.map((i) => i.id).join()]), [['Your start', '1056,2003'], ['Your first items, in order', '6655,3157,3089'], ['Your boots', '3020']]);
    assert.deepStrictEqual([lpcSet.uid, lpcSet.associatedChampions, lpcSet.associatedMaps, set.accountId], ['lpc-103', [103], [11], 77]);
    assert.strictEqual(await text(pc, '#skillNote'), 'Your skill order on Ahri (from 8 games): start Q, W, E, then max Q, then W, then E.');
    assert.strictEqual(await text(pc, '#runesOther'), 'Use my own usual runes instead');
    await pc.click('#csNotes summary');
    await pc.fill('#csNotes input', 'Zed');
    await pc.fill('#csNotes textarea', 'Respect his level 6. Ward the side bushes.');
    await pc.click('#csNotes button[type="submit"]');
    await wait(pc, () => document.querySelector('#csNotes .notelist').textContent === 'Ahri against Zed: Respect his level 6. Ward the side bushes.', null, 'the matchup note');
    assert(await pc.evaluate(() => lpc.toasts().includes('Saved your note on Ahri against Zed.')));
    await shot(pc, 'champ-select');
    await shot(phone, 'phone-champ-select');
    console.log(`champ select: ranks, recent games and tags (${rows[0].match(/6 wins in a row|Comfort pick/g).join(', ')}), hidden names never looked up, a ban, picks for middle, hover from the phone, lock in, Riot's runes and spells`);

    // ---- in game: everyone scouted, timers, gold, the overlay and the phone
    lcu.cs = null;
    lcu.phase = 'InProgress';
    await league(leagueData());
    await wait(pc, () => !document.getElementById('liveBox').hidden && document.querySelectorAll('#liveRows tr').length === 10, null, 'the game page');
    await wait(pc, () => lpc.lcu().scouted.includes('enemy5') && [...document.querySelectorAll('#liveRows tr')].every((tr) => /LP|Unranked/.test(tr.textContent)), null, 'all ten scouted');
    assert.strictEqual(callsTo(/alias\/lookup\?gameName=Singer&tagLine=EUW/).length, 1, 'the player League gave no puuid is found by Riot ID');
    const live = await pc.$$eval('#liveRows tr', (trs) => trs.map((tr) => [tr.dataset.team, tr.hasAttribute('data-me'), tr.innerText.replace(/\s+/g, ' ')]));
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
    assert.match(timers.replace(/\s+/g, ' '), /DRAGON 1:[34]\d BARON (10:00|9:[45]\d) THEIR MID INHIBITOR 4:[01]\d KILLS 5–3 TOWERS 1–0 GOLD \+15\.5k/i);
    await wait(pc, () => lpcClient.lastOverlay && /^Dragon 1:\d\d · Baron \d+:\d\d · Their mid inhibitor 4:\d\d · Kills 5–3 · Gold \+15\.5k$/.test(lpcClient.lastOverlay.game), null, 'the overlay line');
    await wait(phone, () => /Dragon1:\d\dBaron.*Gold\+15\.5k/.test(document.getElementById('timers').textContent), null, 'the timers on the phone');
    // your lane and CS a minute: on the Game page and the overlay, against your usual on Ahri
    await wait(pc, () => /^Your lane against Zed: level 11 vs 10 · CS 100 vs 90 · kills 3 vs 2\. CS 100 · \d+\.\d a minute \(usual 5\.3\)$/.test(document.getElementById('laneStats').textContent) && !document.getElementById('laneStats').hidden, null, 'lane stats');
    await wait(pc, () => /^CS 100 · \d+\.\d a minute \(usual 5\.3\)$/.test(lpcClient.lastOverlay.cs), null, 'the CS counter on the overlay');
    // the overlay picker, see-through slider and key
    await pc.click('.nav[data-view="settings"]');
    await pc.uncheck('#optOverlayCs');
    await wait(pc, () => lpcClient.lastOverlay.cs === '' && !!lpcClient.lastOverlay.game, null, 'the CS counter off the overlay');
    await pc.check('#optOverlayCs');
    await pc.$eval('#optOpacity', (el) => { el.value = 0.6; el.dispatchEvent(new Event('input')); });
    await wait(pc, () => lpcClient.lastOverlay.opacity === 0.6 && document.getElementById('opacityOut').textContent === '60%', null, 'a see-through overlay');
    assert.strictEqual(await text(pc, '#kOverlay'), 'Ctrl+Shift+O');
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible === false && lpc.toasts().includes('Overlay hidden. Ctrl+Shift+O brings it back.'), null, 'the overlay hidden by its key');
    await pc.evaluate(() => lpcClient.emit('key', 'overlay'));
    await wait(pc, () => lpcClient.lastOverlay.visible && lpcClient.lastOverlay.cs, null, 'the overlay back');
    // the sound 30 seconds before Dragon (the last one was at 6:40, so the next at 11:40)
    await league(leagueData({ t: 672 }));
    await wait(pc, () => lpc.toasts().includes('Dragon in 30 seconds') && lpc.played().includes('spawn'), null, 'the Dragon warning');
    await league(leagueData());
    await shot(pc, 'in-game');
    await shot(phone, 'phone-in-game');
    console.log(`in game: all ten scouted (one found by Riot ID), timers and gold: ${await pc.evaluate(() => lpcClient.lastOverlay.game)}`);
    await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => /^In game as Ahri · 1\d min$/.test(document.getElementById('proStatus').textContent), null, 'in game on your profile');

    // ---- clips: the key saves what was recorded, a multikill saves a clip by itself; both play
    await wait(pc, () => lpc.clips().on && lpc.clips().parts >= 9, null, 'ten seconds of recording', 20000);
    await pc.evaluate(() => lpcClient.emit('key', 'clip'));
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
    assert(full.d >= 9 && full.d < 15 && full.w === 1280, `the clip holds the whole recording so far: ${JSON.stringify(full)}`);
    // the last 4 s only, through the same cut as the 30 s one
    await pc.evaluate(() => lpc.saveClip('key', 4));
    await wait(pc, () => lpc.clips().saved.length === 2, null, 'the short clip');
    const short = await pc.evaluate(async () => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([window.lastClip], { type: 'video/webm' }));
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error')); });
      await v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
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
    await pc.click('.nav[data-view="clips"]');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .clip .cname')].map((e) => e.textContent).join() === 'Clip 3,Clip 2,Clip 1', null, 'the gallery');
    assert(await pc.$$eval('#clipGrid .shot', (imgs) => imgs.every((i) => i.src.startsWith('data:image/jpeg;base64,') && i.naturalWidth === 320)), 'a picture of the screen with each clip');
    const card = (n) => `#clipGrid .clip:has(.cname:text-is("${n}"))`;
    await pc.click(`${card('Clip 1')} .star`);
    assert(await pc.evaluate(() => JSON.parse(localStorage.getItem('lpc-clip-favs')).includes('Clip 1.webm')) && (await text(pc, `${card('Clip 1')} .star`)) === '★ Kept', 'kept');
    await pc.click(`${card('Clip 2')} .ren`);
    await pc.fill(`#clipGrid form input`, 'Baron steal');
    await pc.press(`#clipGrid form input`, 'Enter');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Baron steal'), null, 'the clip renamed');
    await pc.dispatchEvent(`${card('Clip 3')} .shot`, 'dragstart');
    assert(await pc.evaluate(() => lpcClient.calls.includes('drag Clip 3.webm')), 'dragged out (to Discord)');
    await pc.click(`${card('Clip 1')} .play`);
    await wait(pc, () => document.getElementById('clipDlg').open && document.getElementById('clipVideo').readyState >= 1 && +document.getElementById('trimTo').max > 8, null, 'the clip playing, with the trimmer');
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
    await pc.click('#clipClose');
    await wait(pc, () => [...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Clip 1 cut'), null, 'the cut in the gallery');
    pc.once('dialog', (d) => d.accept());
    await pc.click(`${card('Clip 3')} .bin`);
    await wait(pc, () => ![...document.querySelectorAll('#clipGrid .cname')].some((e) => e.textContent === 'Clip 3'), null, 'Clip 3 binned');
    await pc.click('#clipsFolder');
    assert(await pc.evaluate(() => lpcClient.calls.includes('clips-folder')));
    await shot(pc, 'clips');
    console.log(`clip gallery: pictures, kept, renamed, dragged out, a ${cutLen.toFixed(1)} s cut from the trimmer, binned`);

    // ---- after the game: LP, the report, and Stats
    await league(leagueData({ t: 1700, result: 'Win' }));
    await pc.waitForTimeout(1500);
    lcu.phase = 'EndOfGame';
    lcu.lpNote = { gameId: GAME, queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 63, leaguePointsDelta: 18 };
    await league({ inGame: false, phase: 'EndOfGame' });
    await wait(pc, () => lpc.toasts().some((t) => /^\+18 LP: Gold II · 63 LP$/.test(t)), null, 'the LP toast');
    await wait(pc, () => lpc.toasts().some((t) => /^Game report ready: you scored \d+ \(MVP\)\. It’s in Stats\.$/.test(t)), null, 'the report toast');
    const r = await pc.evaluate((id) => lpc.reports()[id], GAME);
    const badges = r.players.filter((p) => p.badge).map((p) => `${p.name} ${p.badge}`);
    assert.deepStrictEqual(badges, ['Rayan#EUW MVP', 'Shadow#EUW ACE']);
    assert(r.players.every((p) => p.score >= 0 && p.score <= 100) && r.players[0].score === Math.max(...r.players.map((p) => p.score)), 'scores out of 100, yours the best');
    assert(r.gold && r.gold.length >= 1, 'the gold over the game was kept');
    assert.deepStrictEqual(await pc.evaluate(() => lpc.lpLog().map((e) => [e.id, e.delta, e.win])), [[1, -15, false], [GAME, 18, true]]);
    await pc.click('.nav[data-view="game"]');
    await pc.click('.nav[data-view="stats"]');
    await wait(pc, () => /Gold II · 63 LP/.test(document.getElementById('rankNow').textContent), null, 'the rank');
    assert.strictEqual(await text(pc, '#lpToday'), 'Today: 1W 0L, +18 LP.');
    assert(await pc.locator('#lpChart polyline').isVisible(), 'the LP chart');
    assert.match((await pc.$$eval('#lpList li', (l) => l.map((x) => x.textContent)))[0], /Win · \+18 LP · Gold II · 63 LP/);
    // the You tab: trends, hall of fame, best time to play and the season recap
    assert.strictEqual(await pc.locator('#trends figure').count(), 3);
    assert.match(await text(pc, '#trends'), /CS a minute: 5\.3 on average, 5\.3 in your last 5/);
    assert.match((await text(pc, '#fame')).replace(/\s+/g, ' '), /Pentakills ?1: Ahri .*Best KDA ?5\/3\/7 \(4\.0\) on Ahri.*Longest win streak ?6 games in a row/);
    assert((await pc.locator('#times tbody tr').count()) >= 2, 'wins by time of day and day of the week');
    await pc.click('#recapBtn');
    await wait(pc, () => !document.getElementById('recapSave').hidden && document.getElementById('recapSave').href.startsWith('data:image/png'), null, 'the season recap');
    // your profile with today's LP; and the profile link: your rank, record and top champions on a page anyone can
    // open, all of it in the link
    await pc.click('.nav[data-view="profile"]');
    await wait(pc, () => /\+18 LP/.test(document.getElementById('proRanks').textContent), null, 'today’s LP on your profile');
    assert.deepStrictEqual((await proRanks())[0], 'Solo/Duo|Gold II|63 LP · 31W 25L · 55% · today 1W 0L, +18 LP');
    await pc.click('#profileBtn');
    await wait(pc, () => !document.getElementById('profileOut').hidden && /^http:\/\/127\.0\.0\.1:8081\/profile\.html#[\w-]+$/.test(document.getElementById('profileLink').value), null, 'the profile link');
    const plink = await pc.inputValue('#profileLink');
    const [vctx, viewer] = await context(browser, { phone: true }); // a friend opens it on their phone
    await viewer.goto(plink);
    await wait(viewer, () => !document.getElementById('top').hidden && document.querySelectorAll('#champs li').length, null, 'the profile page');
    const pt = (sel) => viewer.$$eval(sel, (l) => l.map((e) => e.textContent));
    assert.strictEqual(await viewer.title(), 'Rayan#EUW · League profile');
    assert.deepStrictEqual(await pt('#ranks .tile'), ['Solo/DuoGold II63 LP · 55% of 56', 'FlexUnranked']);
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
    await pc.click('.nav[data-view="stats"]');
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
    await wait(pc, () => document.getElementById('champDlg').open && /Your build/.test(document.getElementById('champDlgBody').textContent), null, 'Ahri’s page');
    const champPage = (await text(pc, '#champDlgBody')).replace(/\s+/g, ' ');
    for (const re of [/^8 games in your last 20: 6W 2L \(75%\), KDA 4\.0\. Mastery 7, 120,000 points\./, /By role Middle: 8 games, 6 won/i,
      /Your runes Electrocute, Taste of Blood, Eyeball Collection, Treasure Hunter, Manaflow Band, Transcendence \(Domination with Sorcery\): in 8 of your 8 games with runes on it\./i,
      /Your build \(from 8 games\) Start Doran’s Ring Health Potion First items, in order Luden’s Companion Zhonya’s Hourglass Rabadon’s Deathcap Boots Sorcerer’s Shoes/i,
      /Skill order Your skill order on Ahri \(from 8 games\): start Q, W, E, then max Q, then W, then E\./i, /Against your lane opponents Zed: 6W 2L/i,
      /Your matchup notes Against Zed: Respect his level 6\. Ward the side bushes\. Delete/i, /Patch 1\.1 Health 590 → 600 Q \(Orb of Deception\) cooldown 7 → 6$/i]) assert.match(champPage, re);
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
    console.log(`after the game: +18 LP, the report (${badges.join(', ')}), Stats with the LP chart, trends, hall of fame, the recap, champion pages, match history and reports with the replay, laning and buys`);
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
    await fr.click('.nav[data-view="room"]');
    await fr.fill('#code', room);
    await fr.click('#joinBtn');
    await pc.click('.nav[data-view="room"]');
    await wait(pc, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Platinum IV · 12 LP · With you: 13W 7L'), null, 'the friend’s rank and your record together');
    await wait(fr, () => [...document.querySelectorAll('#players .plol')].some((e) => e.textContent === 'Gold II · 63 LP, +18 today'), null, 'your rank on the friend’s card for you');
    assert(await pc.locator('#players .watch').isHidden(), 'no Watch while the friend isn’t playing');
    await fr.evaluate((d) => lpcClient.emit('league', d), leagueData({ me: { champ: 'Garen', champName: 'Garen', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330 } }));
    await wait(pc, () => { const b = document.querySelector('#players .watch'); return b && !b.hidden; }, null, 'Watch on the friend’s card');
    await pc.click('#players .watch');
    await wait(pc, () => lpc.toasts().includes('League is opening Fren’s game. Spectating runs a few minutes behind.'), null, 'spectating the friend');
    assert.deepStrictEqual(callsTo(/^\/lol-spectator\/v1\/spectate\/launch$/, 'POST')[0][2], { allowObserveMode: 'ALL', dropInSpectateGameId: 'Friend', gameQueueType: '', puuid: 'ally1', spectatorKey: '' });
    // room games with League's ranks: the balanced teams show everyone's Solo/Duo rank, and role roulette's role goes
    // into League's lobby in one click
    await pc.click('#teamsBtn');
    await wait(pc, () => { const t = document.getElementById('teamsBox').textContent; return /Rayan \(you\): Gold II · 63 LP/.test(t) && /Fren: Platinum IV · 12 LP/.test(t) && /about Gold II/.test(t) && /about Platinum IV/.test(t); }, null, 'the teams with ranks');
    await wait(fr, () => /Rayan: Gold II · 63 LP/.test(document.getElementById('teamsBox').textContent), null, 'the teams on the friend’s page');
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
    await pc.click('.nav[data-view="settings"]');
    await pc.selectOption('#optFlash', 'F');
    lcu.lpNote = null;
    champSelect(778, { championId: 99 });
    lcu.phase = 'ChampSelect';
    await league({ inGame: false, phase: 'ChampSelect' });
    await wait(pc, () => /Runes: Riot’s page for Lux/.test(document.getElementById('runesNote').textContent), null, 'the second runes', 20000);
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages$/, 'POST').length, 1, 'no second page');
    assert.strictEqual(callsTo(/^\/lol-perks\/v1\/pages\/50$/, 'PUT').length, 1);
    assert.strictEqual(callsTo(/currentpage$/, 'PUT')[0][2], 50);
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
    await pc.click('.nav[data-view="settings"]');
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
    await pc.click('.nav[data-view="settings"]');
    await shot(pc, 'settings');
    // the patch check, the performance meter and test recordings
    await wait(pc, () => /^Patch check for League 14\.20: League’s game data ✓, champ select ✓, match history ✓/.test(document.getElementById('patchNote').textContent), null, 'the patch check');
    await wait(pc, () => /^Right now the app uses 3\.2% of your CPU and 412 MB of memory\. Recording for clips: (on|only during a game)\. Smart noise removal: off\.$/.test(document.getElementById('perf').textContent), null, 'the performance meter');
    await pc.check('#optRecord');
    await pc.click('#recordingsBtn');
    assert(await pc.evaluate(() => lpcClient.calls.includes('record false') && lpcClient.calls.includes('record true') && lpcClient.calls.includes('recordings-folder')), 'test recordings on, and their folder');
    // your version in the status bar, and What's new from it
    assert.strictEqual(await text(pc, '#sbVersion'), 'App 1.7.0 (1.8.0 is out)');
    await pc.click('#sbVersion');
    assert(await pc.evaluate(() => document.getElementById('newsDlg').open), 'What’s new');
    assert.match(await text(pc, '#newsList'), /^October 19: your League profile first\s+Premade now opens on your League profile[\s\S]*October 19: League Proximity Chat is now Premade\s+Same app, new name[\s\S]*October 19: profile link and server stats\s+Profile link on the Stats page[\s\S]*October 19: room games\s+Room games on the Room page[\s\S]*October 19: League stats\s+Champ select: your own runes[\s\S]*October 19: app 1\.7[\s\S]*Clips page/i);
    assert.strictEqual(await text(pc, '#newsVersion'), 'You have: App 1.7.0 (1.8.0 is out).');
    await pc.click('#newsClose');
    console.log('patch check, performance meter, test recordings, your version and What’s new');
    // an app link: lolprox://join/<room> brings the app into that room, after asking to leave the one you're in
    pc.once('dialog', (d) => d.accept());
    await pc.evaluate(() => lpcClient.emit('join', 'wxyz'));
    await wait(pc, () => lpc.room() === 'wxyz' && lpc.slot() >= 0 && !document.querySelector('.view[data-view="room"]').hidden, null, 'the room from the app link');
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
    await pc.click('.nav[data-view="settings"]');
    const [bk] = await Promise.all([pc.waitForEvent('download'), pc.click('#backupBtn')]);
    const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
    assert(backup.app === 'league-proxchat' && backup.data['lpc-name'] === 'Rayan' && backup.data['lpc-lp'] && backup.data['lpc-clip-favs'] && backup.data['lpc-notes'] && backup.data['lpc-watch'] && !('lpc-remote' in backup.data), `the backup: ${Object.keys(backup.data)}`);
    backup.data['lpc-range'] = '2000';
    pc.once('dialog', (d) => d.accept());
    await Promise.all([pc.waitForEvent('load'), pc.setInputFiles('#restoreFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })]);
    await wait(pc, () => window.lpc && document.getElementById('range').value === '2000', null, 'the backup loaded');
    console.log(`backup and restore: ${Object.keys(backup.data).length} things kept`);

    // League closed: the app shows your profile as it was last time
    const saved = await pc.evaluate(() => localStorage.getItem('lpc-profile'));
    const [sctx, sp] = await context(browser, { version: '1.7.0' });
    await sctx.exposeFunction('fakeLcu', () => ({ status: 0, data: null }));
    await sctx.addInitScript((s) => localStorage.setItem('lpc-profile', s), saved);
    await sp.goto(URL_);
    await wait(sp, () => window.lpc, null, 'the page');
    await sp.evaluate(() => lpcClient.emit('league', { inGame: false, phase: '' }));
    await wait(sp, () => document.getElementById('proName').textContent === 'Rayan' && document.getElementById('proStatus').textContent === 'League isn’t running', null, 'your saved profile with League closed');
    assert.match(await text(sp, '#proNote'), /^As of .+\. Start League to update it\.$/);
    assert.strictEqual(await sp.locator('#proGames > li').count(), 10);
    assert(await sp.locator('#profileBtn').isHidden() && await sp.locator('#proFindBox').isHidden(), 'no Share or lookups without League');
    await sctx.close();
    console.log('Profile with League closed: as it was last time');

    assert.deepStrictEqual(lcu.refused, [], 'every call is one the desktop app lets through');
    console.log(`all ${lcu.calls.length} calls to League's client are on the desktop app's list`);
    await pctx.close();
    await ctx.close();
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

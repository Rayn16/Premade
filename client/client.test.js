// xvfb-run -a npx electron --no-sandbox --use-fake-device-for-media-stream client.test.js (not --use-fake-ui-for-media-stream:
// it skips the client's own screen choice): opens the client on a local copy of site/ while a fake League
// game runs (on a self-signed certificate, like League's), and checks what the client adds: screen sharing without a
// picker, full speed in the background, the screen list, League's data on the page (with the game's big moments, the
// window mode from League's settings file and where you are in League's client, from a fake client API), the page's
// calls to League's client (only those on the list, with League's password, and nothing else), saving clips in Videos,
// the clip gallery (pictures, rename, the Recycle Bin, the clean-up), the compact strip, the overlay window (the game's
// objective timers and kills from the page, moved and resized, with chat, who hears you, your voice effects and voice
// swap's countdown, and everyone's rank over the whole screen), the shortcuts, coming to the front when a match is found, Discord status (against a fake Discord
// pipe), the performance meter, app links, the window kept where you left it, test recordings with names hidden, and the
// test version of the page (Settings > App).
// Prints ok.
const http = require('http'), https = require('https'), net = require('net'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
const SITE = path.join(__dirname, '..', 'site');
const TYPES = { js: 'text/javascript', json: 'application/json', png: 'image/png', html: 'text/html' };
let testCopy = true; // the site has a test/ copy of the page (Settings > App: the test version)
const web = http.createServer((q, r) => {
  let p = new URL(q.url, 'http://x').pathname;
  if (p.startsWith('/test/')) { if (!testCopy) { r.writeHead(404); return r.end(); } p = p.slice(5); }
  const f = path.join(SITE, p.replace(/\/$/, '/index.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(8083, '127.0.0.1');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-days', '1', '-keyout', `${tmp}/key.pem`, '-out', `${tmp}/cert.pem`], { stdio: 'ignore' });
const player = (riotId, team, championName, raw, isDead = false, respawnTimer = 0) => ({ riotId, summonerName: riotId, team, championName, rawChampionName: `game_character_displayname_${raw}`, isDead, respawnTimer });
const GAME = {
  activePlayer: { riotId: 'Rayan#EUW', summonerName: 'Rayan#EUW', currentGold: 1234.7, championStats: { currentHealth: 150, maxHealth: 600, moveSpeed: 345.6 } },
  allPlayers: [player('Rayan#EUW', 'ORDER', 'Wukong', 'MonkeyKing', true, 12.4), player('Friend#EUW', 'CHAOS', 'Annie', 'Annie')],
  events: { Events: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] },
  gameData: { gameMode: 'CLASSIC', gameTime: 100 },
};
const tls = { key: fs.readFileSync(`${tmp}/key.pem`), cert: fs.readFileSync(`${tmp}/cert.pem`) };
let gameOn = true; // the fake game is running
const league = https.createServer(tls, (q, r) => {
  r.writeHead(gameOn && q.url === '/liveclientdata/allgamedata' ? 200 : 404, { 'Content-Type': 'application/json' });
  r.end(JSON.stringify(GAME));
}).listen(8084, '127.0.0.1');
// A fake League client API: the port and password in its lockfile, the gameflow phase it says you're in, who you are,
// and your summoner spells; it keeps every other call the page makes through the client
let lcuPhase = 'InProgress';
const lcuGot = [];
const lcu = https.createServer(tls, (q, r) => {
  let body = '';
  q.on('data', (d) => { body += d; });
  q.on('end', () => {
    const auth = q.headers.authorization === 'Basic ' + Buffer.from('riot:s3cret').toString('base64');
    if (q.url !== '/lol-gameflow/v1/gameflow-phase') lcuGot.push([q.method, q.url, body, q.headers['content-type'] || '']);
    const [code, out] = !auth ? [401, { message: 'nope' }] : q.url === '/lol-gameflow/v1/gameflow-phase' ? [200, lcuPhase]
      : q.url === '/lol-summoner/v1/current-summoner' ? [200, { puuid: 'p-1', gameName: 'Rayan', tagLine: 'EUW' }] : q.url.endsWith('/my-selection') ? [204, null] : [404, { message: 'no' }];
    r.writeHead(code, { 'Content-Type': 'application/json' });
    r.end(code === 204 ? '' : JSON.stringify(out));
  });
}).listen(8085, '127.0.0.1');
fs.writeFileSync(path.join(tmp, 'lockfile'), 'LeagueClient:4242:8085:s3cret:https');
// A fake Discord: answers the handshake with READY and keeps what the client sends
const frame = (op, d) => { const j = Buffer.from(JSON.stringify(d)), h = Buffer.alloc(8); h.writeUInt32LE(op, 0); h.writeUInt32LE(j.length, 4); return Buffer.concat([h, j]); };
const discordGot = [];
let discordClosed = false;
const discord = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    for (buf = Buffer.concat([buf, d]); buf.length >= 8 && buf.length >= 8 + buf.readUInt32LE(4);) {
      const op = buf.readUInt32LE(0), len = buf.readUInt32LE(4);
      discordGot.push([op, JSON.parse(buf.subarray(8, 8 + len))]);
      buf = buf.subarray(8 + len);
      if (op === 0) sock.write(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }));
    }
  });
  sock.on('close', () => { discordClosed = true; });
}).listen(path.join(tmp, 'discord-ipc-0'));

process.env.LPC_SITE = 'http://127.0.0.1:8083/';
process.env.LPC_LEAGUE = 'https://127.0.0.1:8084';
process.env.LPC_LEAGUE_DIR = tmp; // League's folder, for the window mode in Config/
fs.mkdirSync(path.join(tmp, 'Config'));
const { app, BrowserWindow, globalShortcut, screen, shell } = require('electron');
const { summary, vk, lcuOk, linkRoom, hider } = require('./main.js');
assert(app.getPath('userData').endsWith(path.sep + 'League Proximity Chat'), 'settings stay in the folder from before the rename to Premade');
app.setPath('videos', path.join(tmp, 'Videos')); // where clips go
app.setPath('documents', path.join(tmp, 'Documents')); // where test recordings go
fs.mkdirSync(path.join(tmp, 'Videos', 'League Proximity Chat'), { recursive: true }); // clips from before the rename
fs.writeFileSync(path.join(tmp, 'Videos', 'League Proximity Chat', 'Old clip.webm'), 'old');
app.setPath('userData', path.join(tmp, 'profile')); // a first launch every time
const opened = [], binned = [];
shell.openPath = async (p) => { opened.push(p); return ''; }; // the clips folder, instead of a file window
shell.trashItem = async (p) => { binned.push(path.basename(p)); fs.rmSync(p); }; // the Recycle Bin

// League's data, as the page gets it
const s = summary(GAME);
assert.deepStrictEqual(s.me, { champ: 'MonkeyKing', champName: 'Wukong', team: 'ORDER', dead: true, respawn: 12, hp: 0.25, speed: 346, gold: 1234 });
assert(/^g[0-9a-f]{11}$/.test(s.room) && s.mode === 'CLASSIC' && s.result === '' && s.t === 100 && s.events.length === 0, JSON.stringify(s));
// the big moments for the Legends voices: your kills and deaths, multikills, dragons and Baron with the team that took
// them (by the killer's name), Aces. Rayan is dead, so what happened in the last 5 s happened to a dead Rayan.
const ev = (EventID, EventName, EventTime, more) => ({ EventID, EventName, EventTime, ...more });
const BIG = { ...GAME, events: { Events: [ev(0, 'GameStart', 0),
  ev(1, 'ChampionKill', 50, { KillerName: 'Rayan', VictimName: 'Friend' }), ev(2, 'Multikill', 51, { KillerName: 'Rayan', KillStreak: 2 }),
  ev(3, 'DragonKill', 60, { KillerName: 'Friend', DragonType: 'Water', Stolen: 'True' }), ev(4, 'BaronKill', 98, { KillerName: 'Rayan', Stolen: 'False' }),
  ev(5, 'Ace', 99, { Acer: 'Friend', AcingTeam: 'CHAOS' }), ev(6, 'ChampionKill', 99.5, { KillerName: 'Friend', VictimName: 'Rayan' })] } };
assert.deepStrictEqual(summary(BIG).events, [
  { t: 50, team: 'ORDER', me: true, alive: true, e: 'kill', on: false }, { t: 51, team: 'ORDER', me: true, alive: true, e: 'multi', n: 2 },
  { t: 60, team: 'CHAOS', me: false, alive: true, e: 'dragon', type: 'Water', stolen: true }, { t: 98, team: 'ORDER', me: true, alive: false, e: 'baron', type: '', stolen: false },
  { t: 99, team: 'CHAOS', me: false, alive: false, e: 'ace' }, { t: 99.5, team: 'CHAOS', me: false, alive: false, e: 'kill', on: true }]);
const later = { ...BIG, allPlayers: [player('Rayan#EUW', 'ORDER', 'Wukong', 'MonkeyKing'), GAME.allPlayers[1]], gameData: { gameMode: 'CLASSIC', gameTime: 130 } };
assert.strictEqual(summary(later).events.find((e) => e.e === 'baron').alive, false, 'dead when the team took Baron: still no Baron voice after respawning');
const swapped = { ...GAME, allPlayers: [...GAME.allPlayers].reverse(), activePlayer: { riotId: 'Friend#EUW' } };
assert.strictEqual(summary(swapped).room, s.room, 'everyone in the game gets the same room');
assert.notStrictEqual(summary({ ...GAME, allPlayers: [GAME.allPlayers[0]] }).room, s.room, 'another game, another room');
assert.strictEqual(summary({ ...GAME, events: { Events: [{ EventName: 'GameEnd', Result: 'Win' }] } }).result, 'Win');
// everyone's scoreboard, for the Game page and the gold difference
const G2 = { ...GAME, allPlayers: [{ ...GAME.allPlayers[0], level: 9, position: 'MIDDLE', scores: { kills: 3, deaths: 1, assists: 4, creepScore: 120 }, items: [{ itemID: 3031, count: 1 }, { itemID: 2003, count: 2 }] }, GAME.allPlayers[1]] };
assert.deepStrictEqual(summary(G2).players, [
  { name: 'Rayan#EUW', team: 'ORDER', champ: 'MonkeyKing', champName: 'Wukong', pos: 'MIDDLE', lvl: 9, k: 3, d: 1, a: 4, cs: 120, items: [[3031, 1], [2003, 2]], dead: true, respawn: 12 },
  { name: 'Friend#EUW', team: 'CHAOS', champ: 'Annie', champName: 'Annie', pos: '', lvl: 0, k: 0, d: 0, a: 0, cs: 0, items: [], dead: false, respawn: 0 }]);
// towers and inhibitors with whose they were, Herald and Voidgrubs, for the objective timers
const OBJ = { ...GAME, events: { Events: [ev(1, 'TurretKilled', 300, { TurretKilled: 'Turret_T2_L_03_A', KillerName: 'Rayan' }), ev(2, 'InhibKilled', 900, { InhibKilled: 'Barracks_T1_C1', KillerName: 'Friend' }),
  ev(3, 'InhibRespawned', 1200, { InhibRespawned: 'Barracks_T1_C1' }), ev(4, 'HordeKill', 400, { KillerName: 'Friend' }), ev(5, 'HeraldKill', 800, { KillerName: 'Rayan' })] } };
assert.deepStrictEqual(summary(OBJ).events.map(({ e, t, of, name, team }) => [e, t, of, name, team]), [['tower', 300, 'CHAOS', 'Turret_T2_L_03_A', 'ORDER'], ['inhib', 900, 'ORDER', 'Barracks_T1_C1', 'CHAOS'],
  ['inhib-back', 1200, 'ORDER', 'Barracks_T1_C1', ''], ['grubs', 400, undefined, undefined, 'CHAOS'], ['herald', 800, undefined, undefined, 'ORDER']]);
// the calls the page may make to League's client
assert(lcuOk('GET', '/lol-ranked/v1/ranked-stats/abc-123') && lcuOk('POST', '/lol-champ-select/v1/session/actions/7/complete') && lcuOk('PUT', '/lol-perks/v1/pages/42'));
assert(lcuOk('GET', '/lol-match-history/v1/products/tft/abc-123/matches?begin=20&count=20') && lcuOk('POST', '/lol-champ-select/v1/session/bench/swap/86')
  && lcuOk('POST', '/lol-champ-select/v1/session/my-selection/reroll') && !lcuOk('POST', '/lol-champ-select/v1/session/bench/swap/86/x'), 'TFT games, ARAM’s bench and rerolls');
assert(lcuOk('GET', '/lol-game-queues/v1/queues') && lcuOk('GET', '/lol-chat/v1/friends') && lcuOk('POST', '/lol-lobby/v2/lobby/invitations') && lcuOk('DELETE', '/lol-lobby/v2/lobby')
  && !lcuOk('DELETE', '/lol-lobby/v2/lobby/members/abc') && !lcuOk('POST', '/lol-chat/v1/friends'), 'the lobby: games, friends, invites and leaving');
assert(lcuOk('GET', '/lol-game-settings/v1/game-settings') && lcuOk('PATCH', '/lol-game-settings/v1/game-settings') && lcuOk('POST', '/lol-game-settings/v1/save')
  && !lcuOk('PUT', '/lol-game-settings/v1/game-settings') && !lcuOk('PATCH', '/lol-game-settings/v1/input-settings'), 'League’s window mode, and nothing else in its settings');
assert(!lcuOk('DELETE', '/lol-perks/v1/pages') && !lcuOk('get', '/lol-gameflow/v1/session') && !lcuOk('GET', '/lol-chat/v1/me') && !lcuOk('POST', '/lol-store/v1/purchase')
  && !lcuOk('GET', '/lol-ranked/v1/ranked-stats/../../lol-chat/v1/me') && !lcuOk('GET', '/lol-summoner/v1/current-summoner?x=1') && !lcuOk('GET', null), 'nothing else');
assert.deepStrictEqual(summary(null), { inGame: false });
assert.deepStrictEqual(summary({ allPlayers: GAME.allPlayers }), { inGame: false }, 'spectating is not playing');
// app links: lolprox://join/<room>[.<password>] on the command line, nothing else
assert.strictEqual(linkRoom(['Premade.exe', '--allow-file-access', 'lolprox://join/ABCD.qwerty/']), 'abcd.qwerty');
assert.strictEqual(linkRoom(['x', 'lolprox://join/g0123456789a']), 'g0123456789a');
assert.deepStrictEqual(['lolprox://join/', 'lolprox://join/ab cd', 'lolprox://join/abcd.12', 'lolprox://join/abcd/x', 'lolprox://evil/abcd', 'https://join/abcd'].map((a) => linkRoom([a])), ['', '', '', '', '', '']);
// test recordings: names and account ids become stand-ins, the same all through a game; champions stay
const hide = hider();
assert.deepStrictEqual(hide({ riotId: 'Rayan#EUW', puuid: 'abc-123-def', summonerId: 4242, championName: 'Rayan', stats: { k: 3 }, note: 'Rayan' }),
  { riotId: 'Player 1#Player 2', puuid: 'id-3', summonerId: 1003, championName: 'Rayan', stats: { k: 3 }, note: 'Player 1' });
assert.deepStrictEqual(hide([{ gameName: 'Rayan', tagLine: 'EUW', summonerId: 4242 }]), [{ gameName: 'Player 1', tagLine: 'Player 2', summonerId: 1003 }], 'the same stand-ins later on');
assert.strictEqual(hide.path('/lol-ranked/v1/ranked-stats/abc-123-def'), '/lol-ranked/v1/ranked-stats/id-3');
assert.strictEqual(hide.path('/lol-summoner/v1/alias/lookup?gameName=Rayan&tagLine=EUW'), '/lol-summoner/v1/alias/lookup?gameName=Player%201&tagLine=Player%202');
assert.strictEqual(hide.path('/lol-summoner/v2/summoners/puuid/0123456789abcdef0123456789abcdef'), '/lol-summoner/v2/summoners/puuid/id-5', 'an account id not seen before');
// push-to-talk keys as Windows numbers them, and F2 to F5 (the camera on a teammate)
assert.deepStrictEqual(['KeyV', 'Digit4', 'Numpad0', 'F13', 'Mouse4', 'CapsLock', 'AltLeft', 'Nope', 'F2', 'F5'].map(vk), [0x56, 0x34, 0x60, 0x7c, 5, 0x14, 0xa4, 0, 0x71, 0x74]);

const until = async (fn, what, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return;
  throw new Error('timed out waiting for ' + what);
};
app.once('browser-window-created', (e, win) => win.webContents.once('did-finish-load', async () => {
  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => { throw new Error(`${code.slice(0, 70)}: ${(e && e.message) || e}`); });
  try {
    const share = await js('navigator.mediaDevices.getDisplayMedia({ video: true }).then((s) => s.getVideoTracks()[0].getSettings().displaySurface || "screen")');
    const mic = await js('navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getAudioTracks().length)');
    assert.strictEqual(share, 'monitor', 'whole screen shared without a picker');
    // a clip's recording asks for sound too (Windows gives what you hear); elsewhere it gets the screen alone
    const clipShare = await js('navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }).then((s) => [s.getVideoTracks().length, s.getAudioTracks().length])');
    assert.deepStrictEqual(clipShare, [1, process.platform === 'win32' ? 1 : 0], `the screen for clips, with sound on Windows: ${clipShare}`);
    assert.strictEqual(mic, 1, 'microphone allowed');
    assert.strictEqual(win.webContents.getBackgroundThrottling(), false, 'not slowed down behind League');
    const screens = await js('lpcClient.screens()');
    assert(screens.length >= 1 && screens[0].thumb.startsWith('data:image/png') && screens.some((s) => s.main), 'screens to pick from, with pictures');
    assert(/^\d+\.\d+\.\d+/.test(await js('lpcClient.version')), 'the app version for the page');
    // League's window mode for the ready check: game.cfg, else PersistedSettings.json
    assert.strictEqual(await js('lpcClient.windowMode()'), '', 'no League settings: unknown');
    fs.writeFileSync(path.join(tmp, 'Config', 'PersistedSettings.json'), JSON.stringify({ files: [{ name: 'Game.cfg', sections: [{ name: 'General', settings: [{ name: 'WindowMode', value: '1' }] }] }] }, null, 4));
    assert.strictEqual(await js('lpcClient.windowMode()'), 'windowed');
    fs.writeFileSync(path.join(tmp, 'Config', 'game.cfg'), '[General]\r\nCfgVersion=1\r\nWindowMode=2\r\n');
    assert.strictEqual(await js('lpcClient.windowMode()'), 'borderless');

    // the page's calls to League's client: those on the list go through with League's password; nothing else does
    assert.deepStrictEqual(await js(`lpcClient.lcu('GET', '/lol-summoner/v1/current-summoner')`), { status: 200, data: { puuid: 'p-1', gameName: 'Rayan', tagLine: 'EUW' } });
    assert.deepStrictEqual(await js(`lpcClient.lcu('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id: 4, spell2Id: 14 })`), { status: 204, data: null });
    for (const [m, p, b] of [['DELETE', '/lol-perks/v1/pages'], ['GET', '/lol-chat/v1/me'], ['get', '/lol-summoner/v1/current-summoner'], ['POST', '/lol-perks/v1/pages', 'x'.repeat(400000)],
      ['GET', '/lol-summoner/v1/alias/lookup?gameName=a\r\nX-Evil: 1&tagLine=b']]) {
      assert.deepStrictEqual(await js(`lpcClient.lcu(${JSON.stringify(m)}, ${JSON.stringify(p)}, ${JSON.stringify(b)})`), { status: 0, data: null }, `${m} ${p} refused`);
    }
    const onList = () => assert(lcuGot.length && lcuGot.every(([m, p]) => lcuOk(m, p)), `only listed calls reached League: ${JSON.stringify(lcuGot)}`);
    onList();
    assert(lcuGot.some((c) => c.join() === 'PATCH,/lol-champ-select/v1/session/my-selection,{"spell1Id":4,"spell2Id":14},application/json'), 'the body as JSON');
    // clips go to Videos\Premade (the old Videos\League Proximity Chat moved there), a new name each time; anything but bytes is refused
    const c1 = await js('lpcClient.clip(new Uint8Array([26, 69, 223, 163]).buffer)'), c2 = await js('lpcClient.clip(new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 3))');
    assert(/^Clip \d{4}-\d\d-\d\d \d\d-\d\d-\d\d( \(\d\))?\.webm$/.test(c1) && c1 !== c2, `clip names: ${c1}, ${c2}`);
    const dir = path.join(tmp, 'Videos', 'Premade');
    assert(fs.readFileSync(path.join(dir, 'Old clip.webm'), 'utf8') === 'old' && !fs.existsSync(path.join(tmp, 'Videos', 'League Proximity Chat')), 'the old clips folder moved to the new name');
    fs.unlinkSync(path.join(dir, 'Old clip.webm'));
    assert.deepStrictEqual([...fs.readFileSync(path.join(dir, c1))], [26, 69, 223, 163]);
    assert.deepStrictEqual([...fs.readFileSync(path.join(dir, c2))], [2, 3]);
    assert.strictEqual(await js('lpcClient.clip("not a video")'), '');
    await js('lpcClient.clipsFolder()');
    await until(() => opened.length === 1, 'the clips folder opened');
    assert.strictEqual(opened[0], dir);
    console.log(`League's client: only listed calls go through; clips saved as "${c1}" and "${c2}"`);
    // the clip gallery: a picture with each clip, a cut named after its clip, rename (never over another clip, never
    // out of the folder, the picture with it), the Recycle Bin, and the clean-up that keeps the starred ones
    const g1 = await js('lpcClient.clip(new Uint8Array(1000).buffer, new Uint8Array([255, 216, 255, 217]).buffer)');
    const cut = await js(`lpcClient.clip(new Uint8Array(10).buffer, null, ${JSON.stringify(g1)})`);
    assert.strictEqual(cut, g1.replace('.webm', ' cut.webm'));
    assert.strictEqual(await js(`lpcClient.clip(new Uint8Array(10).buffer, null, ${JSON.stringify(g1)})`), g1.replace('.webm', ' cut (2).webm'), 'a second cut');
    let list = await js('lpcClient.clips()');
    assert.deepStrictEqual(list.map((c) => c.name).sort(), [c1, c2, g1, cut, g1.replace('.webm', ' cut (2).webm')].sort());
    assert(list.find((c) => c.name === g1).pic === 'data:image/jpeg;base64,/9j/2Q==' && list.find((c) => c.name === cut).pic === '' && list.every((c) => c.size > 0 && c.at > 0), `pictures: ${JSON.stringify(list)}`);
    assert.strictEqual(await js(`lpcClient.clipRename(${JSON.stringify(g1)}, ' Baron steal ')`), 'Baron steal.webm');
    assert.strictEqual(await js(`lpcClient.clipRename(${JSON.stringify(c1)}, 'Baron steal')`), '', 'never over another clip');
    for (const bad of ['a/b', '..\\\\x', '.hidden', 'con?']) assert.strictEqual(await js(`lpcClient.clipRename(${JSON.stringify(c1)}, ${JSON.stringify(bad)})`), '', `no ${bad}`);
    assert.strictEqual((await js('lpcClient.clips()')).find((c) => c.name === 'Baron steal.webm').pic, 'data:image/jpeg;base64,/9j/2Q==', 'the picture follows the rename');
    assert.strictEqual(await js(`lpcClient.clipRead('Baron steal.webm').then((b) => b.byteLength)`), 1000);
    assert.strictEqual(await js(`lpcClient.clipRead('../profile/window.json')`), null);
    assert.strictEqual(await js(`lpcClient.clipTrash(${JSON.stringify(c2)})`), true);
    const gone = await js(`lpcClient.clipsClean(1005, [${JSON.stringify(c1)}, ${JSON.stringify(cut)}])`);
    assert(gone.includes('Baron steal.webm') && gone.every((n) => n === 'Baron steal.webm' || n === g1.replace('.webm', ' cut (2).webm')), `cleaned the oldest unstarred: ${gone}`);
    list = await js('lpcClient.clips()');
    assert(list.reduce((n, c) => n + c.size, 0) <= 1005 && list.some((c) => c.name === c1) && list.some((c) => c.name === cut), `under the limit, starred ones kept: ${JSON.stringify(list.map((c) => c.name))}`);
    assert(binned.includes(c2) && binned.includes('Baron steal.webm') && !fs.existsSync(path.join(tmp, 'profile', 'Clip pictures', 'Baron steal.webm.jpg')), `to the Recycle Bin, pictures gone: ${binned}`);
    assert.strictEqual(await js('typeof lpcClient.clipDrag'), 'function');
    console.log(`clip gallery: pictures, cuts, rename, the Recycle Bin and the clean-up (binned ${binned.join(', ')})`);
    // the performance meter
    const perf = await js('lpcClient.metrics()');
    assert(perf.cpu >= 0 && perf.cpu <= 100 && perf.mb > 30 && perf.mb < 5000, `the app's CPU and memory: ${JSON.stringify(perf)}`);
    // test recordings: on from here until League closes
    await js('lpcClient.record(true)');

    // the fake game reaches the page, and the window shrinks to the strip for it
    await until(() => js('document.getElementById("sbLeague").textContent === "League: Wukong, dead"'), 'League data on the page');
    await until(() => win.getContentSize()[1] < 200, 'the compact strip');
    await until(() => js('document.getElementById("statusRows").textContent.includes("(you)In game · 1 min")'), 'in game on the League status window');
    console.log(`League data on the page; compact strip ${win.getContentSize().join('x')}`);
    await js('document.getElementById("compactBtn").click()');
    await until(() => win.getContentSize()[1] >= 480, 'full size again');
    // the window is kept where you left it (not as the strip)
    win.setBounds({ x: 40, y: 30, width: 1000, height: 700 });
    const winJson = path.join(tmp, 'profile', 'window.json');
    await until(() => { try { return JSON.parse(fs.readFileSync(winJson, 'utf8')).width === 1000; } catch { return false; } }, 'window.json'); // not mid-write
    const wb = JSON.parse(fs.readFileSync(winJson, 'utf8'));
    assert(wb.height === 700 && wb.max === false && Number.isFinite(wb.x), `the window remembered: ${JSON.stringify(wb)}`);

    // the page's own overlay in a game: the objective timers and kills (no gold here: Riot's item prices don't load)
    const ovWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('overlay.html'));
    let ov;
    await until(async () => (ov = ovWin()) && ov.isVisible() && /Dragon \d:\d\d · Baron \d+:\d\d · Kills 0–0\nCS 0 · 0\.0 a minute/.test(await ov.webContents.executeJavaScript('document.body.innerText')), 'the game line and CS counter on the overlay');
    console.log(`the page's overlay: ${JSON.stringify(await ov.webContents.executeJavaScript('document.body.innerText'))}`);
    await js('document.getElementById("optOverlayGame").click(); document.getElementById("optOverlayCs").click()'); // off in Settings: the page hides it, and the rest is set by hand
    await until(() => !ov.isVisible(), 'the overlay hidden with the game line off');
    // the overlay: on the right of the screen, see-through, showing who's talking and that you're muted
    await js(`lpcClient.overlay({ visible: true, pos: 'mr', muted: true, talkers: [{ name: 'Friend', pic: '', team: 'enemy' }], toasts: ['Friend joined the room'],
      chat: [{ name: 'Friend', text: 'gank top' }], hear: ['Friend'], fx: ['Baron', 'Killing spree'], swapIn: 7 })`);
    await until(() => ov.isVisible(), 'the overlay window');
    const b = ov.getBounds(), d = screen.getPrimaryDisplay().bounds;
    assert(b.x + b.width > d.x + d.width - 30 && ov.isAlwaysOnTop() && !ov.isFocusable(), `overlay on the right, on top, never focused: ${JSON.stringify(b)}`);
    await until(() => ov.webContents.executeJavaScript('document.body.innerText.includes("You’re muted") && !!document.querySelector(".pill.enemy") && document.body.innerText.includes("Friend joined")'), 'overlay pills');
    const text = await ov.webContents.executeJavaScript('document.body.innerText');
    for (const t of ['Friendgank top', 'Heard by Friend', 'Your voice: Baron, Killing spree', 'Voices swap in 7…']) assert(text.includes(t), `overlay shows ${JSON.stringify(t)}: ${JSON.stringify(text)}`);
    // Move it: 1.5 times bigger and taking the mouse; where it's dragged goes back to the page as fractions of the screen
    await js(`lpcClient.overlay({ visible: true, pos: 'mr', scale: 1.5, edit: true, muted: true, talkers: [], toasts: [] })`);
    await until(() => ov.getBounds().width === 450 && ov.getBounds().height === 540 && ov.isFocusable(), 'the overlay bigger, in move mode');
    await until(() => ov.webContents.executeJavaScript('document.body.classList.contains("edit") && document.body.innerText.includes("Drag this")'), 'the move frame');
    await js('window.moved = []; lpcClient.on("overlay-moved", (m) => moved.push(m))');
    await new Promise((r) => setTimeout(r, 400));
    ov.setPosition(d.x + 100, d.y + 200);
    await until(() => js('moved.length > 0'), 'the new place sent to the page');
    const m = (await js('moved'))[0];
    assert(Math.abs(m.x - 100 / d.width) < 0.002 && Math.abs(m.y - 200 / d.height) < 0.002, `dragged to ${JSON.stringify(m)}`);
    await ov.webContents.executeJavaScript('document.querySelector("button").click()');
    await until(() => js('moved.some((m) => m.done)'), 'Done on the overlay itself');
    await js(`lpcClient.overlay({ visible: true, pos: 'custom', box: { x: 0.25, y: 0.5 }, scale: 1, muted: true })`);
    await until(() => { const o = ov.getBounds(); return o.x === d.x + Math.round(0.25 * d.width) && o.y === d.y + Math.round(0.5 * d.height) && o.width === 300 && !ov.isFocusable(); }, 'the overlay where it was dragged');
    console.log(`overlay moved and resized: ${JSON.stringify(ov.getBounds())}`);
    // everyone's rank (board, app 1.10): over the whole screen, still click-through, then back where it was
    await js(`lpcClient.overlay({ visible: true, pos: 'custom', box: { x: 0.25, y: 0.5 }, scale: 1, toasts: ['Overlay back on.'], board: {
      us: [{ name: 'Rayan', sub: 'Ahri · Middle', me: true, ally: true, rank: 'Gold II · 45 LP', tc: '#d9ad55', emb: 'https://ddragon.leagueoflegends.com/cdn/1.1/img/tft-regalia/TFT_Regalia_Gold.png', rec: 'Ahri: 8 of the last 20, 75% won', tags: [['good', '3 wins in a row']] }],
      them: [{ name: 'Shadow', sub: 'Zed · Middle', lane: true, rank: 'Unranked', tc: 'red;x', tags: [['bad', 'First time on this champion'], ['', 'Seen before']] }],
      tips: { title: 'Ahri against Zed', lines: ['High elo: Ahri won 4 of 10 games against Zed.'] } } })`);
    await until(() => { const o = ov.getBounds(); return o.x === d.x && o.y === d.y && o.width === d.width && o.height === d.height && !ov.isFocusable(); }, 'the overlay over the whole screen');
    const boardText = await ov.webContents.executeJavaScript('document.body.innerText');
    for (const t of ['Overlay back on.', 'Your team', 'Rayan', 'Gold II · 45 LP', 'Ahri: 8 of the last 20, 75% won', '3 wins in a row', 'Their team', 'Shadow', 'Your lane', 'First time on this champion', 'Tips: Ahri against Zed', 'High elo: Ahri won 4 of 10'])
      assert(boardText.toLowerCase().includes(t.toLowerCase()), `the board shows ${JSON.stringify(t)}: ${JSON.stringify(boardText)}`);
    assert.deepStrictEqual(await ov.webContents.executeJavaScript('[...document.querySelectorAll(".rk")].map((e) => e.style.color)'), ['rgb(217, 173, 85)', ''], 'the tier’s color, and nothing that isn’t a color');
    assert.deepStrictEqual(await ov.webContents.executeJavaScript('[...document.querySelectorAll(".card .emb")].map((e) => e.src)'), ['https://ddragon.leagueoflegends.com/cdn/1.1/img/tft-regalia/TFT_Regalia_Gold.png'], 'the rank’s emblem');
    await js(`lpcClient.overlay({ visible: true, pos: 'custom', box: { x: 0.25, y: 0.5 }, scale: 1, muted: true })`);
    await until(() => { const o = ov.getBounds(); return o.x === d.x + Math.round(0.25 * d.width) && o.width === 300 && o.height === 360; }, 'the overlay back in its box');
    console.log(`everyone's rank over the whole screen: ${JSON.stringify(boardText.slice(0, 120))}`);
    await js('lpcClient.overlay({ visible: false })');
    await until(() => !ov.isVisible(), 'the overlay hidden');

    // shortcuts: mute and show/hide register system-wide; push to talk needs Windows
    const keys = await js(`lpcClient.keys({ mute: 'Ctrl+Shift+M', show: 'Ctrl+Shift+L', clip: 'Ctrl+Shift+K', overlay: 'Ctrl+Shift+O', ptt: 'KeyV' })`);
    assert.deepStrictEqual(keys, { mute: true, clip: true, overlay: true, show: true, ptt: process.platform === 'win32' }, JSON.stringify(keys));
    assert(['M', 'L', 'K', 'O'].every((k) => globalShortcut.isRegistered('Ctrl+Shift+' + k)));
    // a match found (Pregame settings): the window in front of League's client, on top for a moment only
    await js('lpcClient.front()');
    await until(() => win.isVisible() && win.isAlwaysOnTop(), 'the window in front');
    await until(() => !win.isAlwaysOnTop(), 'and not kept on top');

    // Discord status through Discord's local pipe; null closes it, which clears the status
    process.env.XDG_RUNTIME_DIR = tmp; // where the fake Discord listens (here, not for the whole app: Chromium reads it too)
    await js(`lpcClient.discord({ clientId: '123456789012345678', activity: { details: 'In the lobby', state: 'In proximity voice chat' } })`);
    await until(() => discordGot.some(([op, m]) => op === 1 && m.cmd === 'SET_ACTIVITY' && m.args.activity.details === 'In the lobby'), 'the Discord status');
    assert(discordGot[0][0] === 0 && discordGot[0][1].client_id === '123456789012345678', `handshake with the app id: ${JSON.stringify(discordGot[0])}`);
    await js('lpcClient.discord(null)');
    await until(() => discordClosed, 'the Discord pipe closed');

    // the game ends and you're picking champions for the next: League's client says so
    gameOn = false;
    lcuPhase = 'ChampSelect';
    await until(() => js('document.getElementById("statusRows").textContent.includes("(you)In champ select") && document.getElementById("sbLeague").textContent === "League: in champ select"'), 'champ select from the League client');
    fs.rmSync(path.join(tmp, 'lockfile'));
    await until(() => js('document.getElementById("statusRows").textContent.includes("(you)League isn’t running")'), 'League closed: no lockfile');
    onList(); // the page's own calls during the game and champ select too
    console.log('League status: in game, then champ select from the League client, then closed');
    // the test recording of that game, saved once League closed: game data and the page's calls, no names or ids
    const recDir = path.join(tmp, 'Documents', 'Premade', 'Test recordings');
    await until(() => fs.existsSync(recDir) && fs.readdirSync(recDir).length === 1, 'the test recording');
    const recName = fs.readdirSync(recDir)[0], rec = require('zlib').gunzipSync(fs.readFileSync(path.join(recDir, recName))).toString();
    const take = JSON.parse(rec);
    assert(/^Game \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\.json\.gz$/.test(recName) && take.frames.some((f) => f.game) && take.frames.some((f) => f.lcu) && take.frames.some((f) => f.phase === 'ChampSelect'), `a recording: ${recName}, ${take.frames.length} frames`);
    assert(!/Rayan|Friend|"p-1"/.test(rec) && rec.includes('Wukong') && rec.includes('Player 1#Player 2'), 'names and ids hidden, champions kept');
    await js('lpcClient.recordingsFolder()');
    await until(() => opened.includes(recDir), 'the recordings folder opened');
    console.log(`test recording: ${recName}, ${take.frames.length} frames, names hidden`);

    // Test version first (Settings > App): the test/ copy of the page, kept for next time (test-version in the app's
    // folder) with the overlay from the same copy; the status bar's link goes back. No test copy: the normal page.
    const flag = path.join(tmp, 'profile', 'test-version'), went = [];
    win.webContents.on('did-navigate', (e, url, code) => went.push(`${code} ${url.slice(process.env.LPC_SITE.length - 1)}`));
    const at = (where, what) => until(async () => win.webContents.getURL() === process.env.LPC_SITE + where && fs.existsSync(flag) === !!where
      && ovWin().webContents.getURL() === process.env.LPC_SITE + where + 'overlay.html' && await win.webContents.executeJavaScript(`document.readyState === 'complete' && document.getElementById('optTest').checked === ${!!where}`).catch(() => false), what); // not while it loads
    await js('setTimeout(() => document.getElementById("optTest").click())');
    await at('test/', 'the test version');
    assert(await js('getComputedStyle(document.getElementById("sbTest")).display !== "none"'), 'the status bar says it’s the test version');
    await js('setTimeout(() => document.getElementById("sbTest").click())');
    await at('', 'back to the normal page');
    assert(await js('getComputedStyle(document.getElementById("sbTest")).display === "none"'));
    testCopy = false;
    await js('setTimeout(() => location.assign("/test/"))');
    await until(() => went.length === 4, 'no test copy');
    await at('', 'the normal page again');
    assert.deepStrictEqual(went, ['200 /test/', '200 /', '404 /test/', '200 /'], 'the test version, back, and a missing test copy');
    console.log(`test version: ${went.join(', ')}`);
    console.log('ok');
  } catch (err) { console.error(err); process.exitCode = 1; }
  web.close();
  league.close();
  lcu.close();
  discord.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
}));

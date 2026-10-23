// Premade desktop client: the live site in its own window, plus what a browser tab can't do: League's
// own game data, League's client (scouting, runes, champ select, the queue, trades, ranked and match history), sharing
// the screen picked in Settings without a picker, the in-game overlay, the compact strip, shortcuts that work while
// League is in front, push to talk, clips (saving, the gallery, dragging into Discord, cleaning up), whole games on
// video, starting with League, the combo trainer's key presses, Discord status, lolprox:// app links, test recordings, a performance meter
// and installing its own updates. It keeps tracking and audio at full speed while League has focus, opens where you
// left it, and opens other sites in your browser.
// preload.js hands all this to the page as window.lpcClient.
const { app, BrowserWindow, session, desktopCapturer, dialog, shell, ipcMain, screen, globalShortcut, nativeImage, Notification } = require('electron');
const crypto = require('crypto'), fs = require('fs'), https = require('https'), net = require('net'), path = require('path'), zlib = require('zlib');
const { execFileSync, spawn } = require('child_process');

// Premade was called League Proximity Chat before 1.8.0. Its settings, the site's saved data and the clip pictures stay
// in the folder of that name; its Videos and Documents folders move to the new name the first time they're used.
const OLD_NAME = 'League Proximity Chat';
app.setPath('userData', path.join(app.getPath('appData'), OLD_NAME));
function appDir(where) {
  const dir = path.join(app.getPath(where), 'Premade'), old = path.join(app.getPath(where), OLD_NAME);
  if (!fs.existsSync(dir) && fs.existsSync(old)) try { fs.renameSync(old, dir); } catch { return old; } // in use: keep using it
  return dir;
}

const SITE = process.env.LPC_SITE || 'https://rayn16.github.io/Premade/'; // LPC_SITE: a local copy, for client.test.js
const OLD_SITE = process.env.LPC_OLD_SITE || 'https://league-proxchat.netlify.app/'; // where the site was before 1.16
const LEAGUE = process.env.LPC_LEAGUE || 'https://127.0.0.1:2999'; // League's Live Client Data API, up during a game
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // voice plays in a room joined for your game

if (!app.requestSingleInstanceLock()) return app.quit();

const webPreferences = { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, additionalArguments: ['--lpc-version=' + app.getVersion()] };
const fromSite = (e) => !!e.senderFrame && e.senderFrame.url.startsWith(SITE);
const openOut = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
let win = null, overlay = null, screenId = '', captureSourceId = '', shareAudioMode = false, shareAudioFiltered = false, shareDiscordPid = 0, filteredDiscordPid = 0, filteredCapture = null, pendingNotificationAction = null;

ipcMain.on('notify', (e, title, body, action) => {
  if (!fromSite(e) || process.platform !== 'win32' || !Notification.isSupported()) return;
  const n = new Notification({ title: String(title || 'Premade').slice(0, 80), body: String(body || '').slice(0, 240), silent: false });
  if (action && action.type === 'room-invite' && /^[a-z0-9]{4,20}$/.test(action.room) && /^[a-z0-9]{0,20}$/.test(action.key || '')) {
    n.on('click', () => {
      pendingNotificationAction = { type: 'room-invite', room: action.room, key: action.key || '' };
      if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); if (win.webContents.isLoading()) return; win.webContents.send('notification-action', pendingNotificationAction); pendingNotificationAction = null; }
    });
  }
  n.show();
});

// ---- screens: the one picked in Settings is shared and gets the overlay; until then the main one
async function screens(thumbs) {
  const list = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbs ? { width: 320, height: 180 } : { width: 0, height: 0 } });
  const main = String(screen.getPrimaryDisplay().id);
  for (const s of list) s.main = s.display_id === main;
  return list;
}
const chosen = (list) => list.find((s) => s.id === screenId) || list.find((s) => s.main) || list[0];
function discordRootPid() {
  try {
    const out = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
    const rows = [...out.matchAll(/^("Discord(?:PTB|Canary|Development)?\.exe"),"(\d+)"/gim)];
    if (new Set(rows.map((m) => m[1].toLowerCase())).size > 1) return { pid: 0, error: true };
    const pids = rows.map((m) => +m[2]);
    return { pid: pids.length ? Math.min(...pids) : 0, error: false };
  } catch { return { pid: 0, error: true }; }
}
ipcMain.on('share-audio-mode', (e) => {
  if (!fromSite(e)) return;
  const found = process.platform === 'win32' ? discordRootPid() : { pid: 0, error: false };
  shareAudioMode = true;
  shareAudioFiltered = !!found.pid;
  shareDiscordPid = found.pid;
  e.returnValue = { filter: shareAudioFiltered, warning: found.error };
});
ipcMain.on('share-audio-cancel', (e) => { if (fromSite(e)) { shareAudioMode = false; shareAudioFiltered = false; shareDiscordPid = 0; filteredDiscordPid = 0; stopFilteredCapture(); } });
function stopFilteredCapture() {
  if (!filteredCapture) return;
  clearTimeout(filteredCapture.timer);
  filteredCapture.child.kill();
  filteredCapture = null;
}
ipcMain.handle('filtered-audio-start', async (e) => {
  if (!fromSite(e) || process.platform !== 'win32' || !filteredDiscordPid || filteredCapture) return false;
  const child = spawn(path.join(__dirname, 'audio-capture.exe'), [String(filteredDiscordPid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let pending = Buffer.alloc(0), ready = false, resolveReady, rejectReady;
  const result = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const capture = filteredCapture = { child, timer: setTimeout(() => { if (!ready) { stopFilteredCapture(); rejectReady(new Error('Audio filter timed out')); } }, 4000) };
  const sendPcm = (data) => { if (data.length && win && !win.isDestroyed()) win.webContents.send('filtered-audio-data', data); };
  child.stdout.on('data', (chunk) => {
    if (!ready) {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length < 4) return;
      if (pending.subarray(0, 4).toString() !== 'PCM1') { stopFilteredCapture(); rejectReady(new Error('Audio filter failed')); return; }
      ready = true;
      clearTimeout(capture.timer);
      resolveReady(true);
      const pcm = pending.subarray(4);
      pending = Buffer.alloc(0);
      sendPcm(pcm);
      return;
    }
    sendPcm(chunk);
  });
  child.once('error', (err) => { if (!ready) rejectReady(err); stopFilteredCapture(); });
  child.once('exit', () => { if (!ready) rejectReady(new Error('Audio filter stopped')); if (filteredCapture === capture) filteredCapture = null; });
  return result;
});
ipcMain.on('filtered-audio-stop', (e) => { if (fromSite(e)) { stopFilteredCapture(); filteredDiscordPid = 0; } });
ipcMain.handle('screens', async (e) => (!fromSite(e) ? [] : (await screens(true)).map((s) => ({ id: s.id, main: s.main, thumb: s.thumbnail.toDataURL() }))));
ipcMain.handle('capture-sources', async (e) => {
  if (!fromSite(e)) return [];
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 280, height: 158 } });
  const main = String(screen.getPrimaryDisplay().id);
  return list.map((s) => ({ id: s.id, name: s.name, type: s.id.startsWith('screen:') ? 'screen' : 'window', main: s.id.startsWith('screen:') && s.display_id === main, thumb: s.thumbnail.toDataURL() }));
});
ipcMain.handle('capture-source', (e, id) => {
  if (!fromSite(e) || typeof id !== 'string') return false;
  captureSourceId = id;
  return true;
});
ipcMain.on('screen', (e, id) => {
  if (!fromSite(e) || typeof id !== 'string' || id === screenId) return;
  screenId = id;
  replaceOverlay(); // the overlay goes to the new screen now, not at its next change
});

// ---- League's window mode for the ready check, from its settings file (the overlay only shows over Borderless).
// LPC_LEAGUE_DIR: a stand-in League folder, for client.test.js.
function leagueDirs() {
  const dirs = [process.env.LPC_LEAGUE_DIR];
  try {
    const installs = JSON.parse(fs.readFileSync(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games', 'RiotClientInstalls.json'), 'utf8'));
    dirs.push(...Object.keys(installs.associated_client || {}).filter((k) => /league of legends/i.test(k)));
  } catch {}
  return [...dirs, 'C:\\Riot Games\\League of Legends'].filter(Boolean);
}
ipcMain.handle('window-mode', async (e) => {
  if (!fromSite(e)) return '';
  for (const dir of leagueDirs()) for (const f of ['game.cfg', 'PersistedSettings.json']) {
    try {
      const m = /WindowMode\W*(?:value\W*)?(\d)/.exec(await fs.promises.readFile(path.join(dir, 'Config', f), 'utf8'));
      if (m) return ['fullscreen', 'windowed', 'borderless'][+m[1]] || '';
    } catch {}
  }
  return '';
});

// ---- League's own data, from the Live Client Data API that League runs on this computer during a game
// (developer.riotgames.com/docs/lol#game-client-api), and from the League client's own local API. Their certificates
// are Riot's own, so they can't be checked.
// ask: { status, data } (status 0 when nothing answered); getJson: the data of a 200, else null
function ask(method, url, headers, body, ms = 1500) {
  return new Promise((resolve) => {
    const json = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(url, { method, headers: { ...headers, ...(json && { 'Content-Type': 'application/json', 'Content-Length': json.length }) }, rejectUnauthorized: false, timeout: ms }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let data = null; try { data = text ? JSON.parse(text) : null; } catch {} resolve({ status: res.statusCode, data }); });
      res.on('error', () => resolve({ status: 0, data: null }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ status: 0, data: null }));
    req.end(json);
  });
}
const getJson = async (url, headers) => { const r = await ask('GET', url, headers); return r.status === 200 ? r.data : null; };
// What the page uses: your champion, team, deaths, health, speed and gold, the game mode and clock, the big moments of
// the game, the result once it's over, and a room code that's the same for everyone in this game, made from its
// players, so no one has to send it around. Then everyone's scoreboard (what Tab shows: champion, level, score, items
// and who's dead), for the gold difference, the game report and the coach.
const health = (s) => (s && s.maxHealth > 0 ? Math.round(Math.min(1, Math.max(0, s.currentHealth / s.maxHealth)) * 100) / 100 : 1);
function summary(d) {
  const all = d && Array.isArray(d.allPlayers) ? d.allPlayers : [];
  const id = (p) => String(p.riotId || p.summonerName || '');
  const me = d && d.activePlayer && all.find((p) => id(p) === id(d.activePlayer));
  if (!me) { seenGame = ''; return { inGame: false }; } // between games: the next one starts its moments afresh
  // ponytail: rawChampionName is "game_character_displayname_<Data Dragon id>" today; if Riot changes it, the page
  // just shows no champion picture
  const champ = (p) => String(p.rawChampionName || '').replace('game_character_displayname_', '');
  const end = ((d.events && d.events.Events) || []).find((e) => e.EventName === 'GameEnd');
  const players = all.map((p) => `${p.team}/${champ(p)}/${id(p)}`).sort().join('\n');
  const room = 'g' + crypto.createHash('sha256').update(players).digest('hex').slice(0, 11);
  const stats = d.activePlayer.championStats || {};
  return {
    inGame: true,
    mode: String((d.gameData && d.gameData.gameMode) || ''),
    t: Math.round((+(d.gameData && d.gameData.gameTime) || 0) * 10) / 10,
    me: { champ: champ(me), champName: String(me.championName || ''), team: me.team, dead: !!me.isDead, respawn: Math.round(+me.respawnTimer || 0), hp: health(stats), speed: Math.round(+stats.moveSpeed || 0), gold: Math.floor(+d.activePlayer.currentGold || 0) },
    room,
    result: end ? String(end.Result || '') : '',
    events: moments(d, all, me, room + id(me)),
    players: all.map((p) => {
      const s = p.scores || {};
      return { name: id(p), team: String(p.team || ''), champ: champ(p), champName: String(p.championName || ''), pos: String(p.position || ''), lvl: +p.level || 0,
        k: +s.kills || 0, d: +s.deaths || 0, a: +s.assists || 0, cs: +s.creepScore || 0, items: (Array.isArray(p.items) ? p.items : []).map((i) => [+i.itemID || 0, +i.count || 1]),
        dead: !!p.isDead, respawn: Math.round(+p.respawnTimer || 0) };
    }),
  };
}
// The game's big moments, for the voice effects of the Legends mode, clips and the objective timers: Baron, Elder and
// the other dragons with the team that took them, Aces, your own kills, deaths, assists, multikills and steals, Herald,
// Voidgrubs, and towers and inhibitors with whose they were (of). alive: whether you were alive when it happened, as
// seen on the first look after it (Baron and Elder only go to the living); moments from before the app was watching
// count you as alive.
let seen = new Map(), seenGame = '';
function moments(d, all, me, game) {
  if (seenGame !== game) { seen = new Map(); seenGame = game; }
  const names = new Map(), now = +(d.gameData && d.gameData.gameTime) || 0, out = [];
  for (const p of all) for (const n of [p.riotIdGameName, p.riotId, p.summonerName, String(p.riotId || '').split('#')[0]]) if (n) names.set(String(n).toLowerCase(), p);
  const who = (n) => names.get(String(n || '').toLowerCase());
  for (const e of (d.events && d.events.Events) || []) {
    if (!seen.has(e.EventID)) seen.set(e.EventID, !me.isDead || now - e.EventTime > 5);
    const by = who(e.KillerName), t = Math.round((+e.EventTime || 0) * 10) / 10;
    const base = { t, team: by ? String(by.team) : '', me: by === me, alive: seen.get(e.EventID) };
    if (e.EventName === 'ChampionKill' && (by === me || who(e.VictimName) === me)) out.push({ ...base, e: 'kill', on: who(e.VictimName) === me });
    else if (e.EventName === 'ChampionKill' && Array.isArray(e.Assisters) && e.Assisters.some((n) => who(n) === me)) out.push({ ...base, e: 'assist' }); // for a match's highlights (app 1.20)
    else if (e.EventName === 'Multikill' && by === me) out.push({ ...base, e: 'multi', n: +e.KillStreak || 2 });
    else if (e.EventName === 'DragonKill' || e.EventName === 'BaronKill') {
      const what = e.EventName === 'BaronKill' ? 'baron' : e.DragonType === 'Elder' ? 'elder' : 'dragon';
      out.push({ ...base, e: what, type: String(e.DragonType || ''), stolen: String(e.Stolen) === 'True' });
    } else if (e.EventName === 'Ace') out.push({ ...base, e: 'ace', team: String(e.AcingTeam || ''), me: who(e.Acer) === me });
    else if (e.EventName === 'HeraldKill' || e.EventName === 'HordeKill') out.push({ ...base, e: e.EventName === 'HeraldKill' ? 'herald' : 'grubs' });
    else if (['TurretKilled', 'InhibKilled', 'InhibRespawned'].includes(e.EventName)) {
      const name = String(e.TurretKilled || e.InhibKilled || e.InhibRespawned || ''); // Turret_T1_L_03_A, Barracks_T2_C1: T1 is ORDER's, T2 CHAOS's
      out.push({ ...base, e: { TurretKilled: 'tower', InhibKilled: 'inhib', InhibRespawned: 'inhib-back' }[e.EventName], of: /_T1_/.test(name) ? 'ORDER' : /_T2_/.test(name) ? 'CHAOS' : '', name });
    }
  }
  return out;
}
let leagueWas = '', practiceTool = false; // practiceTool: the combo trainer reads its keys only in a Practice Tool game
// League's client API, while League's client runs: its port and password are in the lockfile it writes in its folder
async function lcuAuth() {
  for (const dir of leagueDirs()) {
    let lock;
    try { lock = (await fs.promises.readFile(path.join(dir, 'lockfile'), 'utf8')).split(':'); } catch { continue; }
    const [, , port, password] = lock;
    if (/^\d+$/.test(port)) return { base: `https://127.0.0.1:${port}`, headers: { Authorization: 'Basic ' + Buffer.from('riot:' + password).toString('base64') } };
  }
  return null;
}
// Where you are in League's client (None, Lobby, Matchmaking, ReadyCheck, ChampSelect, InProgress, EndOfGame...), for
// the status window, or '' when it isn't running
async function clientPhase() {
  const a = await lcuAuth();
  const phase = a && (await getJson(a.base + '/lol-gameflow/v1/gameflow-phase', a.headers));
  return typeof phase === 'string' ? phase : '';
}
// The calls the page may make to League's client, for scouting players (Clash opponents too), Riot's recommended runes
// and spells, your item sets, hovering, banning and locking in champions, trades, the ready check, starting and
// stopping the queue, your role, a Practice Tool game, ranked LP, match history with timelines and replays, spectating,
// the patch, League's window mode (Borderless in one click: the overlay only shows over it), and League chat: your
// conversations and their messages, sending one, your status message and party invites you got. Nothing else goes
// through, so the page can't do anything else with your account (deleting all your rune pages, buying, friends).
const LCU_OK = [
  ['GET', /^\/lol-gameflow\/v1\/(gameflow-phase|session)$/],
  ['GET', /^\/lol-champ-select\/v1\/(session|pickable-champion-ids|bannable-champion-ids|skin-carousel-skins)$/], // skins: the phone remote's Skins tab
  ['PATCH', /^\/lol-champ-select\/v1\/session\/(actions\/\d+|my-selection)$/],
  ['POST', /^\/lol-champ-select\/v1\/session\/actions\/\d+\/complete$/],
  ['POST', /^\/lol-champ-select\/v1\/session\/(champion-swaps|position-swaps|pick-order-swaps)\/\d+\/(request|accept|decline|cancel)$/], // trades
  ['POST', /^\/lol-champ-select\/v1\/session\/(bench\/swap\/\d+|my-selection\/reroll)$/], // ARAM's bench and rerolls
  ['POST', /^\/lol-lobby-team-builder\/champ-select\/v1\/session\/quit$/], // Dodge: leaves champ select, which League counts as a dodge
  ['GET', /^\/lol-matchmaking\/v1\/(ready-check|search)$/],
  ['POST', /^\/lol-matchmaking\/v1\/ready-check\/(accept|decline)$/],
  ['GET', /^\/lol-lobby\/v2\/lobby$/],
  ['POST', /^\/lol-lobby\/v2\/lobby$/], // a Practice Tool game, or the game picked on Pregame
  ['DELETE', /^\/lol-lobby\/v2\/lobby$/], // Leave lobby
  ['POST', /^\/lol-lobby\/v2\/lobby\/invitations$/], // inviting a friend
  ['GET', /^\/lol-game-queues\/v1\/queues$/],
  ['GET', /^\/lol-chat\/v1\/friends$/], // your friends, to invite and to message
  ['GET', /^\/lol-chat\/v1\/(me|conversations)$/], // League chat: you (your status message) and your conversations
  ['PUT', /^\/lol-chat\/v1\/me$/], // your status message, with your Premade room in it
  ['GET', /^\/lol-chat\/v1\/conversations\/\w[\w.@-]*\/messages$/], // a conversation's messages (its id can't start with a dot)
  ['POST', /^\/lol-chat\/v1\/conversations\/\w[\w.@-]*\/messages$/], // sending one
  ['GET', /^\/lol-lobby\/v2\/received-invitations$/], // party invites you got
  ['POST', /^\/lol-lobby\/v2\/received-invitations\/[\w-]+\/(accept|decline)$/],
  ['POST', /^\/lol-lobby\/v1\/lobby\/custom\/start-champ-select$/],
  ['POST', /^\/lol-lobby\/v2\/lobby\/matchmaking\/search$/],
  ['DELETE', /^\/lol-lobby\/v2\/lobby\/matchmaking\/search$/],
  ['PUT', /^\/lol-lobby\/v2\/lobby\/members\/localMember\/position-preferences$/],
  ['GET', /^\/lol-summoner\/v1\/(current-summoner|summoners\/\d+|alias\/lookup\?gameName=[\w.!~*'()%-]*&tagLine=[\w.!~*'()%-]*)$/], // encoded names only
  ['GET', /^\/lol-summoner\/v2\/summoners\/puuid\/[\w-]+$/],
  ['GET', /^\/lol-ranked\/v1\/(current-ranked-stats|current-lp-change-notification|ranked-stats\/[\w-]+)$/],
  ['GET', /^\/lol-match-history\/v1\/(products\/lol\/[\w-]+\/matches\?begIndex=\d+&endIndex=\d+|products\/tft\/[\w-]+\/matches\?begin=\d+&count=\d+|games\/\d+|game-timelines\/\d+)$/],
  ['GET', /^\/lol-champion-mastery\/v1\/[\w-]+\/champion-mastery$/],
  ['GET', /^\/lol-perks\/v1\/(pages|recommended-champion-positions|recommended-pages\/champion\/\d+\/position\/[A-Z]+\/map\/\d+|recommended-pages-position\/champion\/\d+)$/],
  ['POST', /^\/lol-perks\/v1\/pages$/],
  ['PUT', /^\/lol-perks\/v1\/(pages\/\d+|currentpage)$/],
  ['GET', /^\/lol-item-sets\/v1\/item-sets\/\d+\/sets$/],
  ['PUT', /^\/lol-item-sets\/v1\/item-sets\/\d+\/sets$/],
  ['GET', /^\/lol-replays\/v1\/(configuration|metadata\/\d+)$/],
  ['POST', /^\/lol-replays\/v1\/rofls\/\d+\/(download|watch)$/],
  ['POST', /^\/lol-spectator\/v1\/spectate\/launch$/],
  ['POST', /^\/lol-spectator\/v3\/buddy\/spectate$/],
  ['GET', /^\/lol-patch\/v1\/game-version$/],
  ['GET', /^\/lol-clash\/v1\/(tournament-summary|bracket\/\d+|roster\/[\w-]+)$/],
  ['GET', /^\/lol-game-settings\/v1\/game-settings$/],
  ['PATCH', /^\/lol-game-settings\/v1\/game-settings$/],
  ['POST', /^\/lol-game-settings\/v1\/save$/],
];
const lcuOk = (method, p) => typeof method === 'string' && typeof p === 'string' && LCU_OK.some(([m, re]) => m === method && re.test(p));
ipcMain.handle('lcu', async (e, method, p, body) => {
  if (!fromSite(e) || !lcuOk(method, p) || (body !== undefined && JSON.stringify(body).length > 300000)) return { status: 0, data: null }; // item sets can be big
  const a = await lcuAuth();
  const r = a ? await ask(method, a.base + p, a.headers, body, 8000) : { status: 0, data: null }; // match history comes from Riot's servers, so it can take a while
  if (take) recordLcu(method, p, body, r);
  return r;
});
async function pollLeague() {
  const game = await getJson(LEAGUE + '/liveclientdata/allgamedata'), phase = await clientPhase();
  const s = JSON.stringify({ ...summary(game), phase });
  if (s !== leagueWas && win && !win.isDestroyed()) { leagueWas = s; win.webContents.send('league', JSON.parse(s)); }
  if (phase && !clientWas) withLeagueOpen();
  clientWas = phase;
  recordTick(game, phase);
  practiceTool = !!(game && game.gameData && game.gameData.gameMode === 'PRACTICETOOL');
  setTimeout(pollLeague, practiceTool ? 500 : 2000); // the jungle clear's camps to half a second
}

// ---- start with League (Settings > App): Windows starts the app hidden when you sign in (--with-league), and the
// window opens when League's client does, or comes back from the taskbar if it was already open. Off: neither.
const WITH_LEAGUE = { args: ['--with-league'] }, waiting = process.argv.includes('--with-league');
let clientWas = '';
const withLeague = () => app.getLoginItemSettings(WITH_LEAGUE).openAtLogin;
function withLeagueOpen() {
  if (!win || win.isDestroyed() || !withLeague()) return;
  if (win.isMinimized()) win.restore();
  else if (!win.isVisible()) { const last = lastBounds(); if (last && last.max) win.maximize(); win.show(); }
}
ipcMain.handle('with-league', (e, on) => {
  if (!fromSite(e)) return false;
  if (typeof on === 'boolean') app.setLoginItemSettings({ openAtLogin: on, ...WITH_LEAGUE });
  return withLeague();
});

// ---- test recordings (Settings, League): what League sends during your games, its game data every 10 s and what the
// page asked League's client, so new features can be tried on real games. Every name and account id in it becomes a
// stand-in (Player 1, id-2...), the same one all through the game, and the real ones aren't kept. One file per game in
// Documents\Premade\Test recordings, the newest 20 kept.
let recording = false, take = null;
const recDir = () => path.join(appDir('documents'), 'Test recordings');
ipcMain.on('record', (e, on) => { if (fromSite(e)) { recording = !!on; if (!recording) take = null; } });
ipcMain.on('recordings-folder', async (e) => {
  if (!fromSite(e)) return;
  await fs.promises.mkdir(recDir(), { recursive: true }).catch(() => {});
  shell.openPath(recDir());
});
const BUSY = /^(ChampSelect|GameStart|InProgress|Reconnect|WaitingForStats|PreEndOfGame|EndOfGame)$/;
function recordTick(game, phase) {
  const busy = recording && (BUSY.test(phase) || !!game);
  if (busy && !take) take = { at: Date.now(), hide: hider(), frames: [], last: new Map(), gameAt: 0, phase: '' };
  if (!take) return;
  if (!busy) return saveTake();
  if (game && Date.now() - take.gameAt >= 10000) { take.gameAt = Date.now(); addFrame({ phase, game: take.hide(game) }); }
  else if (phase !== take.phase) addFrame({ phase });
  take.phase = phase;
}
const addFrame = (f) => { if (take.frames.length < 5000) take.frames.push({ t: Date.now() - take.at, ...f }); };
function recordLcu(method, p, body, r) {
  const key = method + ' ' + p, seen = JSON.stringify([body, r]);
  if (take.last.get(key) === seen) return; // the same answer as last time
  take.last.set(key, seen);
  const [data, sent] = [r.data, body].map((v) => (v === undefined ? undefined : take.hide(v)));
  addFrame({ lcu: { method, path: take.hide.path(p), status: r.status, data, ...(sent !== undefined && { body: sent }) } });
}
function saveTake() {
  const t = take;
  take = null;
  if (!t || !t.frames.length) return;
  const d = new Date(t.at), two = (n) => String(n).padStart(2, '0');
  const name = `Game ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}.json.gz`;
  try {
    fs.mkdirSync(recDir(), { recursive: true });
    fs.writeFileSync(path.join(recDir(), name), zlib.gzipSync(JSON.stringify({ app: app.getVersion(), at: t.at, frames: t.frames })));
    const old = fs.readdirSync(recDir()).filter((f) => /^Game [\d -]+\.json\.gz$/.test(f)).sort().slice(0, -20);
    for (const f of old) fs.unlinkSync(path.join(recDir(), f));
  } catch (err) { console.error('test recording:', err.message); }
}
// hider(): a function that gives a copy of League's data with names and account ids swapped for stand-ins, and
// .path for a client address with one in it
function hider() {
  const NAMES = /^(riotId|riotIdGameName|riotIdTagLine|summonerName|gameName|tagLine|internalName|summonerInternalName|playerName)$/;
  const IDS = /^(puuid|summonerId|accountId|currentAccountId|obfuscatedPuuid|obfuscatedSummonerId|playerId)$/;
  const ids = new Map();
  const stand = (v, id) => { const k = String(v); if (!ids.has(k)) ids.set(k, typeof v === 'number' ? 1000 + ids.size : id ? `id-${ids.size + 1}` : `Player ${ids.size + 1}`); return ids.get(k); };
  const learn = (x) => {
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if (IDS.test(k) && (typeof v === 'number' ? v > 0 : typeof v === 'string' && v)) stand(v, true);
      else if (NAMES.test(k) && typeof v === 'string') for (const part of v.split('#')) { if (part) stand(part); }
      else learn(v);
    }
  };
  const swap = (s) => (ids.has(s) ? ids.get(s) : s.includes('#') && s.split('#').every((part) => ids.has(part)) ? s.split('#').map((part) => ids.get(part)).join('#') : s);
  const hide = (x, k = '') => typeof x === 'string' ? swap(x)
    : typeof x === 'number' ? (IDS.test(k) && ids.has(String(x)) ? ids.get(String(x)) : x)
    : Array.isArray(x) ? x.map((v) => hide(v, k))
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([kk, v]) => [kk, /champion|skin/i.test(kk) ? v : hide(v, kk)])) : x;
  const un = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const out = (v) => { learn(v); return hide(v); };
  out.path = (p) => p.replace(/(gameName|tagLine)=([^&]*)/g, (m, k, v) => `${k}=${encodeURIComponent(stand(un(v)))}`)
    .replace(/[^/?&=]+/g, (s) => (ids.has(un(s)) ? encodeURIComponent(String(ids.get(un(s)))) : /^[\w-]{30,}$/.test(s) ? stand(s, true) : s));
  return out;
}

// ---- the in-game overlay: see-through and click-through, over League when it runs in Borderless mode. Its size is
// 300x360 times the page's scale, at a corner (pos) or where it was dragged (box: fractions of the screen). While the
// page moves it (edit) it takes the mouse so it can be dragged, and says where it was left (overlay-moved). With
// everyone's rank on it (board: the loading screen, or the overlay shortcut in a game) it covers the whole screen.
let overlayState = { visible: false }, placed = '', placedShape = '', placedAt = null, editing = false, moveTimer = null, overlayRevision = 0;
const display = async () => { const s = chosen(await screens(false)); return screen.getAllDisplays().find((d) => s && String(d.id) === s.display_id) || screen.getPrimaryDisplay(); };
ipcMain.on('overlay', (e, s) => {
  if (!fromSite(e) || !s || typeof s !== 'object') return;
  const revision = ++overlayRevision;
  overlayState = s;
  if (overlay) overlay.webContents.send('overlay', s);
  if (!s.visible) { if (overlay) overlay.hide(); placed = placedShape = ''; return; }
  placeOverlay(s, revision);
});
// where it goes again once the screens change (League switching resolution, a screen plugged in or out): Windows may
// have moved or cut it
const replaceOverlay = () => { if (overlay && overlayState.visible) { placed = placedShape = ''; placeOverlay(overlayState, ++overlayRevision); } };
async function placeOverlay(s, revision = ++overlayRevision) {
  if (!overlay) {
    overlay = new BrowserWindow({
      width: 300, height: 360, show: false, frame: false, transparent: true, resizable: false, focusable: false,
      skipTaskbar: true, hasShadow: false, alwaysOnTop: true, webPreferences,
    });
    for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, replaceOverlay);
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setIgnoreMouseEvents(true);
    overlay.webContents.on('did-finish-load', () => overlay.webContents.send('overlay', overlayState));
    overlay.on('move', () => {
      if (!editing) return; // only a drag in Move it: Windows moving it (a resolution change) mustn't make it "where I dragged it"
      clearTimeout(moveTimer);
      moveTimer = setTimeout(async () => {
        const b = overlay.getBounds(), d = (await display()).bounds, f = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
        if (placedAt && b.x === placedAt.x && b.y === placedAt.y) return; // where we put it
        if (win && !win.isDestroyed()) win.webContents.send('overlay-moved', { x: f((b.x - d.x) / d.width), y: f((b.y - d.y) / d.height) });
      }, 250);
    });
    overlay.loadURL(freshPageUrl(base + 'overlay.html'));
  }
  if (editing !== !!s.edit) {
    editing = !!s.edit;
    overlay.setIgnoreMouseEvents(!editing);
    overlay.setFocusable(editing);
  }
  const k = Math.min(2, Math.max(0.7, +s.scale || 1)), box = s.pos === 'custom' && s.box && Number.isFinite(s.box.x) && Number.isFinite(s.box.y) ? s.box : null;
  const board = !!s.board && !editing, key = JSON.stringify([s.pos, k, box, board]), shape = JSON.stringify([s.pos, k, board]);
  if (placed === key) return;
  const dragged = editing && s.pos === 'custom' && shape === placedShape; // the page keeping where it was dragged: it's there
  const { x, y, width, height } = (await display()).bounds;
  if (revision !== overlayRevision || !overlayState.visible) return;
  placed = key;
  placedShape = shape;
  if (dragged) return;
  const fit = Math.min(k, width / 300, height / 360);
  const w = board ? width : Math.round(300 * fit), h = board ? height : Math.round(360 * fit);
  const at = board ? { x, y } : box ? { x: x + Math.round(box.x * width), y: y + Math.round(box.y * height) }
    : { x: s.pos === 'mr' ? x + width - w - 16 : x + 16, y: s.pos === 'ml' || s.pos === 'mr' ? y + Math.round((height - h) / 2) : y + 16 };
  placedAt = { x: Math.min(Math.max(at.x, x), x + width - w), y: Math.min(Math.max(at.y, y), y + height - h) };
  overlay.setBounds({ ...placedAt, width: w, height: h });
  overlay.showInactive();
}
ipcMain.on('overlay-done', (e) => { if (fromSite(e) && win) win.webContents.send('overlay-moved', { done: true }); }); // its Done button

// ---- Discord status, through Discord's local pipe (what games use for "Playing"). The page sends { clientId,
// activity } or null to clear it; while Discord isn't running it tries again every 20 s.
let rpc = null, rpcWant = null, rpcTrying = false;
const frame = (op, data) => { const j = Buffer.from(JSON.stringify(data)), h = Buffer.alloc(8); h.writeUInt32LE(op, 0); h.writeUInt32LE(j.length, 4); return Buffer.concat([h, j]); };
const pipe = (i) => (process.platform === 'win32' ? `\\\\?\\pipe\\discord-ipc-${i}` : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${i}`));
const rpcSend = () => { if (rpc && rpc.ready && rpcWant) rpc.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: rpcWant.activity }, nonce: String(Date.now()) })); };
function rpcConnect(i = 0) {
  if (!i && rpcTrying) return; // a try is under way
  if (!rpcWant || rpc) { rpcTrying = false; return; }
  rpcTrying = true;
  const sock = net.connect(pipe(i)), id = rpcWant.clientId;
  let buf = Buffer.alloc(0);
  sock.on('connect', () => { rpcTrying = false; rpc = sock; sock.clientId = id; sock.write(frame(0, { v: 1, client_id: id })); });
  sock.on('error', () => { if (rpc === sock) return; if (i < 9) rpcConnect(i + 1); else rpcTrying = false; });
  sock.on('data', (d) => {
    for (buf = Buffer.concat([buf, d]); buf.length >= 8 && buf.length >= 8 + buf.readUInt32LE(4);) {
      const op = buf.readUInt32LE(0), body = buf.subarray(8, 8 + buf.readUInt32LE(4));
      buf = buf.subarray(8 + body.length);
      let msg = null;
      try { msg = JSON.parse(body); } catch {}
      if (op === 1 && msg && msg.evt === 'READY') { sock.ready = true; rpcSend(); }
      else if (op === 3) sock.write(frame(4, msg)); // ping
      else if (op === 2) sock.destroy(); // Discord closed it, e.g. an unknown app id
    }
  });
  sock.on('close', () => { if (rpc === sock) rpc = null; });
}
setInterval(rpcConnect, 20000);
ipcMain.on('discord', (e, s) => {
  if (!fromSite(e)) return;
  rpcWant = s && typeof s.clientId === 'string' && /^\d{15,22}$/.test(s.clientId) && s.activity && typeof s.activity === 'object' ? s : null;
  if (rpc && (!rpcWant || rpc.clientId !== rpcWant.clientId)) { rpc.destroy(); rpc = null; } // closing the pipe clears it
  if (rpc) rpcSend(); else rpcConnect();
});

// ---- updates: the installed app looks for a newer installer on the site (latest.yml), downloads it in the background
// and tells the page, which offers a restart; otherwise it installs when you quit
let updateReady = null;
function checkUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('update-downloaded', (info) => { updateReady = { version: info.version }; if (!win.isDestroyed()) win.webContents.send('update', updateReady); });
  autoUpdater.on('error', (err) => console.error('update:', err.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 3600e3);
  ipcMain.on('update', (e) => { if (fromSite(e) && updateReady) autoUpdater.quitAndInstall(true, true); });
}

// ---- a match found (Pregame settings): the window in front of League's client. Windows hands the keyboard only to
// the window you use, so it's kept on top for a moment instead.
ipcMain.on('front', (e) => {
  if (!fromSite(e)) return;
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true);
  win.show();
  win.focus();
  setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 1000);
});

// ---- compact view: the window shrinks to the strip's height (h, from the page), and grows back with h = 0
let full = null;
ipcMain.on('compact', (e, h) => {
  if (!fromSite(e)) return;
  if (h > 0) {
    if (!full) full = { bounds: win.getNormalBounds(), max: win.isMaximized() };
    win.unmaximize();
    win.setMinimumSize(320, 40);
    win.setContentSize(win.getContentSize()[0], Math.min(400, Math.round(h)));
  } else if (full) {
    win.setMinimumSize(420, 480);
    win.setBounds(full.bounds);
    if (full.max) win.maximize();
    full = null;
  }
});

// ---- clips: while you play, the page keeps the last part of your screen, with the sound you hear and your mic, and
// sends it here when you press the clip key or something big happens (or a cut from the trimmer, named after its
// clip). Saved in Videos\Premade, each with a small picture for the gallery in the app's own folder.
// The gallery plays, renames, drags (into Discord) and bins them, and the folder stays under the size you pick by
// binning the oldest clips that aren't favorites. Bin: the Recycle Bin, so nothing is gone for good.
// The clips folder (games in its Games folder): Videos\Premade, or the one you picked (Clip settings, Change folder),
// kept in Video folder.txt. Clips and games already saved stay where they were.
const whereFile = () => path.join(app.getPath('userData'), 'Video folder.txt');
let clipsAt = null; // read once: '' for Videos\Premade
const clipDir = () => {
  if (clipsAt === null) try { clipsAt = fs.readFileSync(whereFile(), 'utf8').trim(); } catch { clipsAt = ''; }
  return clipsAt || appDir('videos');
};
ipcMain.handle('video-folder', async (e, what) => { // get, pick or reset; says the folder, or '' while a game records
  if (!fromSite(e)) return '';
  if (what !== 'get' && vids.size) return '';
  if (what === 'pick') {
    const r = await dialog.showOpenDialog(win, { title: 'Where Premade saves clips and games', defaultPath: clipDir(), properties: ['openDirectory', 'createDirectory'] });
    if (!r.canceled && r.filePaths[0]) { clipsAt = r.filePaths[0]; await fs.promises.writeFile(whereFile(), clipsAt).catch(() => {}); }
  } else if (what === 'reset') { clipsAt = ''; await fs.promises.rm(whereFile(), { force: true }).catch(() => {}); }
  return clipDir();
});
const picDir = () => path.join(app.getPath('userData'), 'Clip pictures');
const bytes = (d) => (d instanceof ArrayBuffer ? Buffer.from(d) : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength) : null);
const clipOk = (n) => typeof n === 'string' && n.length <= 120 && /^[^\\/:*?"<>|\x00-\x1f.][^\\/:*?"<>|\x00-\x1f]*\.webm$/i.test(n);
const clipAt = (n) => path.join(clipDir(), n), picAt = (n) => path.join(picDir(), n + '.jpg');
ipcMain.handle('clip', async (e, data, pic, like) => {
  const buf = fromSite(e) && bytes(data);
  if (!buf || !buf.length || buf.length > 500e6) return '';
  const d = new Date(), two = (n) => String(n).padStart(2, '0');
  const stem = clipOk(like) ? like.replace(/\.webm$/i, '').slice(0, 100) + ' cut'
    : `Clip ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
  await fs.promises.mkdir(clipDir(), { recursive: true });
  for (let n = 1; n < 10; n++) {
    const name = `${stem}${n > 1 ? ` (${n})` : ''}.webm`;
    try { await fs.promises.writeFile(clipAt(name), buf, { flag: 'wx' }); } catch (err) { if (err.code === 'EEXIST') continue; throw err; }
    const jpg = bytes(pic);
    if (jpg && jpg.length < 2e6) await fs.promises.mkdir(picDir(), { recursive: true }).then(() => fs.promises.writeFile(picAt(name), jpg)).catch(() => {});
    return name;
  }
  return '';
});
// the clips, newest first: { name, size, at, pic (a data: URL, or '') }
async function clipList() {
  const out = [];
  for (const name of (await fs.promises.readdir(clipDir()).catch(() => [])).filter(clipOk)) {
    const st = await fs.promises.stat(clipAt(name)).catch(() => null);
    if (!st || !st.isFile()) continue;
    const jpg = await fs.promises.readFile(picAt(name)).catch(() => null);
    out.push({ name, size: st.size, at: st.mtimeMs, pic: jpg ? 'data:image/jpeg;base64,' + jpg.toString('base64') : '' });
  }
  return out.sort((a, b) => b.at - a.at);
}
ipcMain.handle('clips', (e) => (fromSite(e) ? clipList() : []));
ipcMain.handle('clip-read', (e, n) => (fromSite(e) && clipOk(n) ? fs.promises.readFile(clipAt(n)).catch(() => null) : null));
ipcMain.handle('clip-rename', async (e, n, to) => {
  if (!fromSite(e) || !clipOk(n) || typeof to !== 'string') return '';
  to = to.trim().replace(/\.webm$/i, '') + '.webm';
  if (!clipOk(to)) return '';
  if (to.toLowerCase() !== n.toLowerCase() && (await fs.promises.access(clipAt(to)).then(() => true, () => false))) return ''; // rename would replace it
  try { await fs.promises.rename(clipAt(n), clipAt(to)); } catch { return ''; }
  await fs.promises.rename(picAt(n), picAt(to)).catch(() => {});
  return to;
});
async function binClip(n) {
  try { await shell.trashItem(clipAt(n)); } catch { return false; }
  await fs.promises.unlink(picAt(n)).catch(() => {});
  return true;
}
ipcMain.handle('clip-trash', (e, n) => (fromSite(e) && clipOk(n) ? binClip(n) : false));
// the oldest clips that aren't favorites (keep) go to the bin until the folder is under limit bytes; says which went
ipcMain.handle('clips-clean', async (e, limit, keep) => {
  if (!fromSite(e) || !(limit > 0)) return [];
  const list = await clipList(), fav = new Set(Array.isArray(keep) ? keep : []), out = [];
  let total = list.reduce((n, c) => n + c.size, 0);
  for (const c of list.reverse()) {
    if (total <= limit) break;
    if (!fav.has(c.name) && (await binClip(c.name))) { total -= c.size; out.push(c.name); }
  }
  return out;
});
// dragging a clip out of the gallery, into Discord or a folder: the page starts it on dragstart
ipcMain.on('clip-drag', (e, n) => {
  if (!fromSite(e) || !clipOk(n) || !fs.existsSync(clipAt(n))) return;
  let icon = nativeImage.createFromPath(picAt(n));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  e.sender.startDrag({ file: clipAt(n), icon: icon.resize({ width: 120 }) });
});
ipcMain.on('clips-folder', async (e) => {
  if (!fromSite(e)) return;
  await fs.promises.mkdir(clipDir(), { recursive: true }).catch(() => {});
  shell.openPath(clipDir());
});

// ---- whole games on video (app 1.15): the page records each game at lower quality than clips and sends it here a few
// seconds at a time, written to Videos\Premade\Games as it comes, so a crash keeps all but the last seconds. When the
// game is over, its Duration and Cues (where each video key frame starts) go in (seekable), so a video player can skip
// around in it. The page lists them, opens one in your video player or in its folder, bins one, and bins the ones
// older than the days you pick (the Recycle Bin, as with clips).
// ponytail: a game the app closed during keeps its recording as it was: it plays, but can't skip around
const vidDir = () => path.join(clipDir(), 'Games'), vidAt = (n) => path.join(vidDir(), n);
const vids = new Map(); // the one being recorded: its name -> { fh, q (its writes, in order) }
async function vidEnd(n) {
  const v = vids.get(n);
  if (!v) return false;
  vids.delete(n);
  await v.q;
  await v.fh.close().catch(() => {});
  await seekable(vidAt(n)).catch((err) => console.error('game video:', err.message));
  return true;
}
// A clip or game video for the page's player, from a server on this PC only (127.0.0.1, with a random key in each
// address), in parts (Range), so a long 1440p game is never read into memory. Chromium skips around only in http(s)
// media: app 1.19's premade:// played from the start whatever you clicked.
const mediaKey = require('crypto').randomBytes(16).toString('hex');
let mediaBase = '';
const mediaServer = require('http').createServer(async (req, res) => {
  const [, key, kind, n] = new URL(req.url, 'http://x').pathname.split('/').map((x) => { try { return decodeURIComponent(x); } catch { return ''; } });
  const at = kind === 'clip' ? clipAt : kind === 'game' ? vidAt : null, size = (st) => st && st.isFile() && st.size;
  const cors = { 'Access-Control-Allow-Origin': new URL(SITE).origin, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length', 'Accept-Ranges': 'bytes' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  const all = key === mediaKey && at && clipOk(n) && size(await fs.promises.stat(at(n)).catch(() => null));
  if (!all) return res.writeHead(404, cors).end();
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let a = 0, z = all - 1;
  if (m && m[1]) { a = +m[1]; if (m[2]) z = Math.min(+m[2], all - 1); } else if (m && m[2]) a = Math.max(0, all - +m[2]);
  if (a > z) return res.writeHead(416, { ...cors, 'Content-Range': `bytes */${all}` }).end();
  res.writeHead(m ? 206 : 200, { ...cors, 'Content-Type': 'video/webm', 'Content-Length': String(z - a + 1), ...(m && { 'Content-Range': `bytes ${a}-${z}/${all}` }) });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(at(n), { start: a, end: z }).on('error', () => res.destroy()).pipe(res);
}).listen(0, '127.0.0.1', () => { mediaBase = `http://127.0.0.1:${mediaServer.address().port}/${mediaKey}/`; });
ipcMain.on('media-base', (e) => { e.returnValue = fromSite(e) ? mediaBase : ''; });
ipcMain.handle('game-video', async (e, what, a, b) => {
  if (!fromSite(e)) return null;
  if (what === 'start') { // a: your champion's name, for the file's
    for (const n of [...vids.keys()]) await vidEnd(n); // one left open by a page that reloaded
    const d = new Date(), two = (x) => String(x).padStart(2, '0'), champ = typeof a === 'string' && /^[\w .'&-]{1,30}$/.test(a) ? ' ' + a : '';
    const stem = `Game ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}${champ}`;
    await fs.promises.mkdir(vidDir(), { recursive: true });
    for (let n = 1; n < 10; n++) { // a new name each time, as with clips
      const name = `${stem}${n > 1 ? ` (${n})` : ''}.webm`, fh = await fs.promises.open(vidAt(name), 'wx').catch(() => null);
      if (fh) { vids.set(name, { fh, q: Promise.resolve() }); return name; }
    }
    return '';
  }
  if (what === 'add') { // a: its name, b: the next part
    const v = vids.get(a), buf = bytes(b);
    if (!v || !buf || buf.length > 100e6) return false;
    await (v.q = v.q.then(() => v.fh.write(buf)).catch(() => {}));
    return true;
  }
  if (what === 'end') return vidEnd(a);
  const list = async () => { // newest first: { name, size, at, rec (being recorded) }
    const out = [];
    for (const name of (await fs.promises.readdir(vidDir()).catch(() => [])).filter(clipOk)) {
      const st = await fs.promises.stat(vidAt(name)).catch(() => null);
      if (st && st.isFile()) out.push({ name, size: st.size, at: st.mtimeMs, rec: vids.has(name) });
    }
    return out.sort((x, y) => y.at - x.at);
  };
  if (what === 'list') return list();
  if (what === 'clean') { // the ones older than a days go to the bin; says which went
    const out = [];
    for (const v of await list()) if (a > 0 && !v.rec && Date.now() - v.at > a * 864e5 && (await shell.trashItem(vidAt(v.name)).then(() => true, () => false))) out.push(v.name);
    return out;
  }
  if (what === 'folder') { await fs.promises.mkdir(vidDir(), { recursive: true }).catch(() => {}); return (await shell.openPath(vidDir())) === ''; }
  if (!clipOk(a) || vids.has(a)) return false;
  if (what === 'open') return (await shell.openPath(vidAt(a))) === ''; // in your video player
  // ponytail: the whole video (about 300 MB for 30 minutes) goes to the page at once; a stream if that's too much
  if (what === 'read') return fs.promises.readFile(vidAt(a)).catch(() => null); // for its highlights in the page
  if (what === 'show') { shell.showItemInFolder(vidAt(a)); return true; }
  if (what === 'trash') return shell.trashItem(vidAt(a)).then(() => true, () => false);
  return null;
});
// A WebM from Chrome's MediaRecorder, made seekable: its EBML header, then a Segment of known size with a SeekHead (to
// Info, Tracks and the Cues), Info with a Duration, Tracks, every Cluster as recorded up to the last whole one (with its
// size, where Chrome left it unknown), and Cues with each cluster whose first video frame is a key frame. The sizes and
// places it writes take 8 bytes each, so none of them moves another. Written to a .part file that then takes its place,
// so a failure leaves the recording as it was.
// ponytail: reads what Chrome writes (Info and Tracks before the clusters, which may be of unknown size, as cutClip in
// index.html does); a file laid out otherwise is left as it was
async function seekable(file) {
  const fh = await fs.promises.open(file, 'r'), size = (await fh.stat()).size;
  try {
    let from = 0, buf = Buffer.alloc(0); // a window on the file, from byte from
    const get = async (at, n) => {
      n = Math.max(0, Math.min(n, size - at));
      if (at < from || at + n > from + buf.length) { from = at; buf = Buffer.alloc(Math.min(size - at, Math.max(n, 4 << 20))); await fh.read(buf, 0, buf.length, at); }
      return buf.subarray(at - from, at - from + n);
    };
    const vint = (b, o, id) => { // [value, length] of an ID (id: with its length bits) or a size (-1: unknown)
      let n = 1;
      while (n < 8 && !(b[o] & (0x80 >> (n - 1)))) n++;
      let v = id ? b[o] : b[o] & (0xff >> n), ones = v === 0xff >> n;
      for (let k = 1; k < n; k++) { v = v * 256 + b[o + k]; ones = ones && b[o + k] === 0xff; }
      return [!id && ones ? -1 : v, n];
    };
    const el = async (at) => { // { id, at, data (where its insides start), len (-1: unknown), end }
      const b = await get(at, 12);
      if (b.length < 2) return null;
      const [id, n] = vint(b, 0, true), [len, sn] = vint(b, n);
      return { id, at, data: at + n + sn, len, end: len < 0 ? size : at + n + sn + len };
    };
    const kids = async (e) => { const out = []; for (let at = e.data; at < e.end;) { const k = await el(at); if (!k || k.len < 0 || k.end > e.end) break; out.push(k); at = k.end; } return out; };
    const uint = async (e) => (await get(e.data, e.len)).reduce((v, x) => v * 256 + x, 0);
    const ebml = await el(0), seg = ebml && ebml.id === 0x1a45dfa3 && (await el(ebml.end));
    if (!seg || seg.id !== 0x18538067) return false;
    let info = null, tracks = null, first = 0, last = 0, end = 0, video = 1, scale = 1e6;
    const cues = [], fix = []; // [a cluster's timecode, where it is in the file]; [where a cluster's unknown size is, its size]
    for (let at = seg.data; at < size;) {
      const e = await el(at);
      if (!e) break;
      if (e.id !== 0x1f43b675) { // Info, Tracks and the like before the clusters; after them, the end
        if (first || e.len < 0 || e.end > size) break;
        if (e.id === 0x1549a966) info = e;
        if (e.id === 0x1654ae6b) tracks = e;
        at = e.end;
        continue;
      }
      if (!info || !tracks) return false;
      if (!first) {
        first = e.at;
        for (const t of (await kids(tracks)).filter((k) => k.id === 0xae)) {
          const f = {};
          for (const k of await kids(t)) if (k.id === 0x83 || k.id === 0xd7) f[k.id] = await uint(k);
          if (f[0x83] === 1) video = f[0xd7]; // TrackType 1 is video; its TrackNumber
        }
      }
      let tc = 0, key = null, k = e.data;
      while (k < e.end) { // its Timecode, SimpleBlocks and BlockGroups, up to the next cluster (or a cut-off end)
        const c = await el(k);
        if (!c || ![0xe7, 0xa3, 0xa0, 0xa7, 0xab, 0xbf, 0xec].includes(c.id) || c.len < 0 || c.end > size) break;
        let blk = c.id === 0xa3 ? c : null, isKey = true;
        if (c.id === 0xe7) tc = await uint(c);
        if (c.id === 0xa0) for (const g of await kids(c)) { if (g.id === 0xa1) blk = g; if (g.id === 0xfb) isKey = false; } // a Block, a key frame unless there's a ReferenceBlock
        if (blk) {
          const h = await get(blk.data, 4), [track, tn] = vint(h, 0);
          end = Math.max(end, tc + h.readInt16BE(tn));
          if (track === video && key === null) key = c.id === 0xa3 ? !!(h[tn + 2] & 0x80) : isKey;
        }
        k = c.end;
      }
      if (key) cues.push([tc, e.at]);
      if (e.len < 0 && e.data - e.at === 12) fix.push([e.at + 4, k - e.data]); // Chrome's 8-byte unknown size: its own in its place
      last = at = k;
      if (k === e.data) break; // nothing whole in it
    }
    const after = last < size && (await el(last));
    if (!first || !cues.length || (after && ![0x1c53bb6b, 0xec].includes(after.id))) return false; // something it doesn't know at the end
    const parts = [];
    for (const k of await kids(info)) {
      if (k.id === 0x2ad7b1) scale = (await uint(k)) || 1e6;
      if (k.id !== 0x4489) parts.push(Buffer.from(await get(k.at, k.end - k.at))); // all but any Duration
    }
    const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.max(0, Math.round(v)))); return b; };
    const size8 = (n) => { const b = u64(n); b[0] = 0x01; return b; }; // an EBML size in 8 bytes
    const elem = (id, ...body) => { const b = Buffer.concat(body); return Buffer.concat([Buffer.from(id), size8(b.length), b]); };
    const num = (id, v) => Buffer.concat([Buffer.from(id), Buffer.of(0x88), u64(v)]);
    const dur = Buffer.alloc(11);
    dur.set([0x44, 0x89, 0x88]);
    dur.writeDoubleBE(end + 33e6 / scale, 3); // to the end of its last frame, about
    const head = Buffer.from(await get(0, ebml.end)), infoOut = elem([0x15, 0x49, 0xa9, 0x66], ...parts, dur), tracksOut = Buffer.from(await get(tracks.at, tracks.end - tracks.at));
    const seek = (id, at) => elem([0x4d, 0xbb], Buffer.of(0x53, 0xab, 0x84, ...id), num([0x53, 0xac], at));
    const seekLen = 12 + 3 * 28, infoAt = seekLen, tracksAt = infoAt + infoOut.length, clustersAt = tracksAt + tracksOut.length, cuesAt = clustersAt + last - first;
    const seekHead = elem([0x11, 0x4d, 0x9b, 0x74], seek([0x15, 0x49, 0xa9, 0x66], infoAt), seek([0x16, 0x54, 0xae, 0x6b], tracksAt), seek([0x1c, 0x53, 0xbb, 0x6b], cuesAt));
    const cuesOut = elem([0x1c, 0x53, 0xbb, 0x6b], ...cues.map(([t, at]) => elem([0xbb], num([0xb3], t), elem([0xb7], Buffer.of(0xf7, 0x81, video), num([0xf1], clustersAt + at - first)))));
    const segHead = Buffer.concat([Buffer.of(0x18, 0x53, 0x80, 0x67), size8(cuesAt + cuesOut.length)]);
    const out = await fs.promises.open(file + '.part', 'w');
    try {
      await out.write(Buffer.concat([head, segHead, seekHead, infoOut, tracksOut]));
      for (let at = first; at < last; at += 4 << 20) { const b = Buffer.alloc(Math.min(4 << 20, last - at)); await fh.read(b, 0, b.length, at); await out.write(b); }
      await out.write(cuesOut);
      const to = head.length + segHead.length + clustersAt - first; // where a byte of the clusters goes
      for (const [at, n] of fix) await out.write(size8(n), 0, 8, to + at);
    } finally { await out.close(); }
  } finally { await fh.close(); }
  await fs.promises.rename(file + '.part', file);
  return true;
}

// ---- the performance meter: how much of the computer this app uses now, all its parts together. CPU is a share of
// the whole computer, as Task Manager shows it; memory in MB.
ipcMain.handle('metrics', (e) => {
  if (!fromSite(e)) return null;
  const m = app.getAppMetrics();
  return { cpu: Math.round(m.reduce((n, p) => n + p.cpu.percentCPUUsage, 0) * 10) / 10, mb: Math.round(m.reduce((n, p) => n + p.memory.workingSetSize, 0) / 1024) };
});

// ---- app links: lolprox://join/<room>[.<password>] (the site's "Open in the app") opens the app in that room.
// Windows hands it over on the command line, to a new app or to the one already running (second-instance).
const linkRoom = (argv) => {
  for (const a of argv || []) { const m = /^lolprox:\/\/join\/([a-z0-9]{1,20}(?:\.[a-z]{1,12})?)\/?$/i.exec(String(a)); if (m) return m[1].toLowerCase(); }
  return '';
};
let linkWaiting = linkRoom(process.argv);
const join = (r) => { if (r && win && !win.isDestroyed()) win.webContents.send('join', r); };

// ---- Test version first (Settings > App): the site's test/ folder holds the next version of the page before everyone
// gets it. The app opens the copy its window was on last time (test-version in the app's folder), and the overlay
// comes from the same copy. With no test copy on the site, it's the normal page again.
const testFile = () => path.join(app.getPath('userData'), 'test-version');
let base = SITE;
const freshPageUrl = (url) => { const u = new URL(url); u.searchParams.set('_lpc_reload', String(Date.now())); return u.href; };
function navigated(e, url, code) {
  const test = url.startsWith(SITE + 'test/');
  if (test && code >= 400) return void win.loadURL(freshPageUrl(SITE));
  if (!url.startsWith(SITE) || test === (base !== SITE)) return;
  base = test ? SITE + 'test/' : SITE;
  (test ? fs.promises.writeFile(testFile(), '') : fs.promises.rm(testFile(), { force: true })).catch(() => {});
  if (overlay) overlay.loadURL(freshPageUrl(base + 'overlay.html'));
}

// ---- the window opens where and how big you left it (window.json in the app's folder), if that's still on a screen
const winFile = () => path.join(app.getPath('userData'), 'window.json');
function lastBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(winFile(), 'utf8'));
    const seen = [b.x, b.y, b.width, b.height].every(Number.isFinite) && screen.getAllDisplays().some(({ workArea: a }) =>
      b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x && b.y >= a.y - 20 && b.y + 40 < a.y + a.height); // its title bar is on a screen
    return seen ? b : null;
  } catch { return null; }
}
let boundsTimer = null;
function saveBounds() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || full || win.isMinimized()) return; // not the compact strip, not minimized
    fs.promises.writeFile(winFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })).catch(() => {});
  }, 500);
}

// ---- shortcuts that work while League is in front: mute, clip and show/hide are Windows hotkeys; push to talk asks
// Windows every 15 ms whether its key is down (GetAsyncKeyState reads the key, it doesn't hook or block it), and so do
// F2 to F5, League's keys for the camera on a teammate, so the page doesn't learn your champion from it meanwhile.
// The combo trainer (app 1.15) asks the same of League's usual keys while the page wants it in a Practice Tool game:
// abilities, summoner spells, items and right clicks, each press sent as { k, t } (t in ms), but not Ctrl+Q and the
// like, which level up an ability.
const VK = { Mouse3: 4, Mouse4: 5, Mouse5: 6, Tab: 9, CapsLock: 0x14, Space: 0x20, Backquote: 0xc0, ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5 };
function vk(code) {
  let m;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1].charCodeAt(0);
  if ((m = /^(Digit|Numpad)(\d)$/.exec(code))) return (m[1] === 'Digit' ? 0x30 : 0x60) + +m[2];
  if ((m = /^F(\d{1,2})$/.exec(code))) return 0x6f + +m[1];
  return VK[code] || 0;
}
const COMBO = { Q: 0x51, W: 0x57, E: 0x45, R: 0x52, D: 0x44, F: 0x46, 1: 0x31, 2: 0x32, 3: 0x33, 4: 0x34, 5: 0x35, 6: 0x36, 7: 0x37, Click: 2 };
let keyState = null, pttTimer = null, comboOn = false;
ipcMain.on('combo', (e, on) => { if (fromSite(e)) comboOn = !!on; });
ipcMain.handle('keys', (e, k) => {
  if (!fromSite(e) || !k) return {};
  globalShortcut.unregisterAll();
  clearInterval(pttTimer);
  const reg = (keys, fn) => { try { return typeof keys === 'string' && !!keys && globalShortcut.register(keys, fn); } catch { return false; } };
  const ok = {
    mute: reg(k.mute, () => win.webContents.send('key', 'mute')),
    clip: reg(k.clip, () => win.webContents.send('key', 'clip')),
    overlay: false, // below
    show: reg(k.show, () => {
      if (win.isMinimized() || !win.isFocused()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else win.minimize();
    }),
    ptt: false,
  };
  const code = typeof k.ptt === 'string' && vk(k.ptt), ally = ['F2', 'F3', 'F4', 'F5'].map(vk);
  // the overlay key on Windows is read like push to talk, not as a hotkey: Windows fires a hotkey only with exactly its
  // modifiers down, so Alt+V did nothing while Shift or Ctrl was also held (attack move, levelling up an ability) or
  // when another app had taken it. Its keys down, others allowed, counts once per press.
  const hot = typeof k.overlay === 'string' && /^((Ctrl|Alt|Shift)\+)*([A-Z]|\d|F\d{1,2})$/.test(k.overlay) ? k.overlay.split('+') : [];
  const hotKey = hot.length ? vk(hot[hot.length - 1].replace(/^([A-Z])$/, 'Key$1').replace(/^(\d)$/, 'Digit$1')) : 0;
  const hotMods = hot.slice(0, -1).map((m) => ({ Ctrl: 0x11, Alt: 0x12, Shift: 0x10 })[m]);
  if (process.platform === 'win32') {
    try {
      keyState = keyState || require('koffi').load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)');
      let down = false, onAlly = false, hotDown = false;
      const held = new Set();
      pttTimer = setInterval(() => {
        if (win.isDestroyed()) return; // closed, the app is quitting
        const now = !!code && (keyState(code) & 0x8000) !== 0;
        if (now !== down) { down = now; win.webContents.send('key', now ? 'ptt-down' : 'ptt-up'); }
        const look = ally.some((c) => (keyState(c) & 0x8000) !== 0);
        if (look !== onAlly) { onAlly = look; win.webContents.send('key', look ? 'ally-down' : 'ally-up'); }
        const hotNow = !!hotKey && [hotKey, ...hotMods].every((c) => (keyState(c) & 0x8000) !== 0);
        if (hotNow && !hotDown) win.webContents.send('key', 'overlay');
        hotDown = hotNow;
        if (comboOn && practiceTool) for (const [name, c] of Object.entries(COMBO)) {
          if (!(keyState(c) & 0x8000)) { held.delete(name); continue; }
          if (!held.has(name) && !(keyState(0x11) & 0x8000)) win.webContents.send('press', { k: name, t: Math.round(performance.now()) }); // 0x11: Ctrl
          held.add(name);
        }
      }, 15);
      ok.ptt = !!code;
      ok.overlay = !!hotKey;
    } catch (err) { console.error('push to talk:', err); }
  }
  if (!ok.overlay) ok.overlay = reg(k.overlay, () => win.webContents.send('key', 'overlay')); // elsewhere, or without user32
  return ok;
});

app.whenReady().then(async () => {
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler(async (req, done) => {
    const requestedId = captureSourceId;
    captureSourceId = '';
    const s = requestedId
      ? (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })).find((x) => x.id === requestedId)
      : chosen(await screens(false));
    const filtered = shareAudioMode && shareAudioFiltered;
    shareAudioMode = false;
    shareAudioFiltered = false;
    filteredDiscordPid = filtered ? shareDiscordPid : 0;
    shareDiscordPid = 0;
    done(s ? { video: s, ...(req.audioRequested && process.platform === 'win32' && !filtered && { audio: 'loopback' }) } : {}); // clips keep normal loopback; screen-share audio is filtered separately when Discord is active
  });
  ses.setPermissionRequestHandler((wc, perm, ok) => ok(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'].includes(perm)));

  const last = lastBounds();
  win = new BrowserWindow({
    width: 1180, height: 800, ...(last && { x: last.x, y: last.y, width: last.width, height: last.height }), minWidth: 420, minHeight: 480,
    title: 'Premade', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#010a13', webPreferences, show: !waiting,
  });
  if (last && last.max && !waiting) win.maximize();
  for (const ev of ['resize', 'move']) win.on(ev, saveBounds);
  if (app.isPackaged) app.setAsDefaultProtocolClient('lolprox');
  win.removeMenu();
  await moveSaved(ses); // once, from 1.16 (win first: closing the only window would quit)
  if (fs.existsSync(testFile())) base = SITE + 'test/';
  win.loadURL(freshPageUrl(base));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }; // the tracker page
    openOut(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SITE)) { e.preventDefault(); openOut(url); } });
  win.webContents.on('did-navigate', navigated);
  win.webContents.on('did-finish-load', () => { // a reloaded page hears it all again
    leagueWas = '';
    if (updateReady) win.webContents.send('update', updateReady);
    join(linkWaiting);
    linkWaiting = '';
    if (pendingNotificationAction) { win.webContents.send('notification-action', pendingNotificationAction); pendingNotificationAction = null; }
  });
  win.on('closed', () => app.quit());
  app.on('second-instance', (e, argv) => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); join(linkRoom(argv)); });
  pollLeague();
  checkUpdates();
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); saveTake(); stopFilteredCapture(); });

// ---- the move to GitHub (app 1.16): what the page saves (settings, LP and game history, notes, the avoid list...)
// belongs to the address it was saved at, so the first start copies it from OLD_SITE to SITE. Both pages are made up
// here while it copies, so it works with the old site gone. Keys SITE already has stay as they are.
async function moveSaved(ses = session.defaultSession) {
  const done = path.join(app.getPath('userData'), 'moved-to-github');
  if (OLD_SITE === SITE || fs.existsSync(done)) return;
  const from = OLD_SITE + 'premade-move', to = SITE + 'premade-move', schemes = [...new Set([from, to].map((u) => new URL(u).protocol.slice(0, -1)))];
  for (const s of schemes) ses.protocol.handle(s, (req) => (req.url === from || req.url === to ? new Response('<!doctype html><title>Premade</title>', { headers: { 'content-type': 'text/html' } })
    : require('electron').net.fetch(req, { bypassCustomProtocolHandlers: true })));
  const w = new BrowserWindow({ show: false });
  const copy = (async () => {
    await w.loadURL(from);
    const saved = await w.webContents.executeJavaScript('JSON.stringify(Object.entries(localStorage))');
    await w.loadURL(to);
    const n = await w.webContents.executeJavaScript(`(() => { let n = 0; for (const [k, v] of ${saved}) if (localStorage.getItem(k) === null) { localStorage.setItem(k, v); n++; } return n; })()`);
    fs.writeFileSync(done, `${n} of ${JSON.parse(saved).length} copied from ${OLD_SITE} ${new Date().toISOString()}\n`);
  })();
  copy.catch(() => {});
  try { await Promise.race([copy, new Promise((res, rej) => setTimeout(rej, 15000, new Error('took over 15 s')))]); }
  catch (err) { console.error('moving the saved data:', err.message); } // again next time
  finally { w.destroy(); for (const s of schemes) ses.protocol.unhandle(s); }
}

module.exports = { summary, vk, lcuOk, linkRoom, hider, moveSaved }; // for client.test.js

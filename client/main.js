// Premade desktop client: the live site in its own window, plus what a browser tab can't do: League's
// own game data, League's client (scouting, runes, champ select, the queue, trades, ranked and match history), sharing
// the screen picked in Settings without a picker, the in-game overlay, the compact strip, shortcuts that work while
// League is in front, push to talk, clips (saving, the gallery, dragging into Discord, cleaning up), whole games on
// video, starting with League, the combo trainer's key presses, Discord status, lowering other apps while friends talk, lolprox:// app links, test recordings, a performance meter
// and installing its own updates. It keeps tracking and audio at full speed while League has focus, opens where you
// left it, and opens other sites in your browser.
// preload.js hands all this to the page as window.lpcClient.
const { app, BrowserWindow, session, desktopCapturer, dialog, shell, ipcMain, screen, globalShortcut, nativeImage, Notification, clipboard, powerMonitor } = require('electron');
const crypto = require('crypto'), fs = require('fs'), https = require('https'), net = require('net'), os = require('os'), path = require('path'), zlib = require('zlib');
const { execFile, execFileSync, spawn } = require('child_process');

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
// League in front makes Windows count Premade as hidden (occluded) even with the two above, and Chromium then slows it
// down like a minimized window, which dropped screen shares while the app was in the background
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // voice plays in a room joined for your game
// Windows itself also puts the programs of a window that's minimized or fully covered on its slow, power-saving cores
// (Low QoS), whatever Chromium is told, so with another app in front voice, screen shares and the minimap reading
// could fall behind. Each of Premade's processes asks Windows to treat it like the app in front instead (HighQoS),
// again every 10 s and on minimize, for new processes and as Chromium resets it now and then. Says how many it reached.
let qos = null;
function fullSpeed() {
  if (process.platform !== 'win32') return 0;
  try {
    if (!qos) {
      const k = require('koffi').load('kernel32.dll');
      qos = { open: k.func('void* __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'), close: k.func('int __stdcall CloseHandle(void* h)'),
        set: k.func('int __stdcall SetProcessInformation(void* h, int cls, void* info, uint32_t size)') };
    }
    const high = new Uint32Array([1, 1 | 4, 0]); // version 1; execution speed and timer resolution: ours to say, and not throttled
    let n = 0;
    for (const { pid } of app.getAppMetrics()) {
      const h = qos.open(0x200, 0, pid); // PROCESS_SET_INFORMATION
      if (!h) continue;
      if (qos.set(h, 4, high, 12)) n++; // ProcessPowerThrottling
      qos.close(h);
    }
    return n;
  } catch { return 0; }
}

if (!app.requestSingleInstanceLock()) return app.quit();

const webPreferences = { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, additionalArguments: ['--lpc-version=' + app.getVersion()] };
const fromSite = (e) => !!e.senderFrame && e.senderFrame.url.startsWith(SITE);
const openOut = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
let win = null, overlay = null, screenId = '', captureSourceId = '', shareAudioMode = false, shareAudioFiltered = false, shareLeaveOut = [], filteredLeaveOut = [], filteredCapture = null;

// ---- the log file (app 1.41): the page's connection log, the app's own events (a window that crashed, hung or couldn't
// load, a part of the app that ended) and its memory per process every 10 minutes, in the app's folder as
// logs\YYYY-MM-DD.log (UTC days), the last 3 days kept, so a drop or a crash can still be read after a restart. Lines
// are written every 2 s; Copy connection log copies the last 24 hours.
const logDir = () => path.join(app.getPath('userData'), 'logs');
let logBuf = [], logTimer = null, logDay = '', logBytes = 0, logQ = Promise.resolve(); // logQ: the writes, in order
function logLine(line) {
  logBuf.push(`${new Date().toISOString()} ${String(line).replace(/[\r\n]+/g, ' ').slice(0, 2000)}\n`);
  if (logBuf.length > 5000) logBuf.splice(0, logBuf.length - 5000); // a disk that won't take them: the newest
  logTimer ||= setTimeout(logFlush, 2000);
}
function logFlush(sync) { // sync: Premade is quitting
  clearTimeout(logTimer);
  logTimer = null;
  if (!logBuf.length) return;
  const text = logBuf.join(''), day = text.slice(0, 10); // ponytail: a batch over midnight goes in the day it started
  logBuf = [];
  try {
    if (day !== logDay) {
      fs.mkdirSync(logDir(), { recursive: true });
      const keep = new Date(Date.parse(day) - 2 * 864e5).toISOString().slice(0, 10);
      for (const f of fs.readdirSync(logDir())) if (/^\d{4}-\d\d-\d\d\.log$/.test(f) && f.slice(0, 10) < keep) fs.unlinkSync(path.join(logDir(), f));
      logBytes = fs.existsSync(path.join(logDir(), day + '.log')) ? fs.statSync(path.join(logDir(), day + '.log')).size : 0;
      logDay = day;
    }
    if (logBytes > 50e6) return; // something writes in a loop: the rest of that day isn't kept, so the disk doesn't fill
    logBytes += Buffer.byteLength(text);
    const file = path.join(logDir(), day + '.log');
    if (sync) fs.appendFileSync(file, text);
    else logQ = logQ.then(() => fs.promises.appendFile(file, text)).catch(() => {});
  } catch {}
}
// the page's lines (index.html clog), and its last 24 hours for Copy connection log
ipcMain.on('log', (e, line) => { if (fromSite(e) && typeof line === 'string') logLine(line); });
ipcMain.handle('log-read', async (e) => {
  if (!fromSite(e)) return '';
  logFlush();
  await logQ;
  const since = new Date(Date.now() - 864e5).toISOString();
  let text = '';
  for (const day of new Set([since.slice(0, 10), new Date().toISOString().slice(0, 10)])) text += await fs.promises.readFile(path.join(logDir(), day + '.log'), 'utf8').catch(() => '');
  return text.split('\n').filter((l) => l >= since).join('\n').slice(-4e6); // ISO times sort as text; the newest 4 MB
});
// the app's own events: in the log file, and to the page's connection log (as before 1.41)
const diag = (line) => { logLine(`app: ${line}`); if (win && !win.isDestroyed()) win.webContents.send('diag', line); };
setInterval(() => logLine(`memory MB: ${app.getAppMetrics().map((p) => `${p.name || p.type} ${Math.round(p.memory.workingSetSize / 1024)}`).join(', ')}`), 600e3);

// ---- a window picks itself back up (app 1.41): its page crashed, was killed or hung for 30 s, and it loads again (the
// main window's page rejoins the room it was in: its address ends in #room[.password] while it's in one); its page couldn't load (no internet, the site down), and it tries again,
// the main window with a small page that says so and goes back as soon as Windows says the internet is back. Each try
// within 2 minutes of the last waits longer, up to a minute, so a page that keeps crashing doesn't spin.
const offlinePage = (url, wait) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><title>Premade</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#010a13;color:#f0e6d2;font:16px 'Segoe UI',sans-serif;text-align:center"><div><b style="font-size:20px">Can’t reach Premade</b><p style="color:#a09b8c">Check your internet. Trying again in ${wait / 1000} s, or as soon as it’s back.</p></div><script>addEventListener('online', () => location.replace(${JSON.stringify(url)}))</script>`);
function keepUp(w, page, name, notice) { // page(): the address it belongs on; notice: show the offline page meanwhile
  const wc = w.webContents;
  let tries = 0, lastAt = 0, retry = null, hung = null, killed = false; // killed: its page hung, and was ended here
  const again = (why, failed) => {
    if (w.isDestroyed()) return;
    clearTimeout(retry);
    clearTimeout(hung); // a page that hung, then crashed: its new page isn't the hung one
    killed = false;
    tries = Date.now() - lastAt > 120e3 ? 1 : tries + 1;
    lastAt = Date.now();
    const wait = failed || tries > 1 ? Math.min(60, 2 ** tries) * 1000 : 0;
    diag(`${name}: ${why}, ${wait ? `loading it again in ${wait / 1000} s` : 'loading it again'}`);
    if (w === win) { for (const n of [...vids.keys()]) vidEnd(n); if (!linkWaiting) linkWaiting = linkRoom(['lolprox://join/' + (wc.getURL().split('#')[1] || '')]); } // its game video ends as a crash would; its room after
    if (failed && notice) wc.loadURL(offlinePage(page(), wait)).catch(() => {});
    retry = setTimeout(() => { if (!w.isDestroyed()) loadFresh(w, page()); }, wait);
  };
  wc.on('render-process-gone', (e, d) => { if (d.reason !== 'clean-exit' || killed) again(killed ? 'page not answering for 30 s' : `page ${d.reason}, exit code ${d.exitCode}`); });
  w.on('unresponsive', () => {
    clearTimeout(hung);
    hung = setTimeout(() => { // loaded again once its process is gone (or in 5 s if Electron never says)
      if (w.isDestroyed()) return;
      killed = true;
      wc.forcefullyCrashRenderer();
      hung = setTimeout(() => { if (killed) again('page not answering for 30 s'); }, 5000);
    }, 30000);
  });
  w.on('responsive', () => clearTimeout(hung));
  wc.on('did-fail-load', (e, code, desc, url, main) => { if (main && code !== -3 && !url.startsWith('data:')) again(`couldn’t load (${desc})`, true); }); // -3: replaced by another load
  wc.on('did-navigate', (e, url, code) => { // back on its own (the offline page saw the internet come back): no second load
    if (!url.startsWith(SITE)) return;
    if (code >= 500) again(`the site answered ${code}`, true);
    else clearTimeout(retry);
  });
  w.once('closed', () => { clearTimeout(retry); clearTimeout(hung); });
}

// An invite's notification opens lolprox://join/<room>[.<password>] when it or its Join button is clicked, so Windows
// hands it to the app (second-instance, or a new app) even from the notification centre, after Electron forgot the toast.
const xml = (t) => t.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
ipcMain.on('notify', (e, title, body, action) => {
  if (!fromSite(e) || process.platform !== 'win32' || !Notification.isSupported()) return;
  title = String(title || 'Premade').slice(0, 80);
  body = String(body || '').slice(0, 240);
  const invite = action && action.type === 'room-invite' && /^[a-z0-9]{4,20}$/.test(action.room) && /^[a-z]{0,12}$/.test(action.key || '');
  const link = invite && xml(`lolprox://join/${action.room}${action.key ? '.' + action.key : ''}`);
  new Notification(!invite ? { title, body, silent: false } : {
    toastXml: `<toast activationType="protocol" launch="${link}"><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual>`
      + `<actions><action content="Join" activationType="protocol" arguments="${link}"/></actions></toast>`,
  }).show();
});

// ---- screens: the one picked in Settings is shared and gets the overlay; until then the main one
async function screens(thumbs) {
  const list = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbs ? { width: 320, height: 180 } : { width: 0, height: 0 } });
  const main = String(screen.getPrimaryDisplay().id);
  for (const s of list) s.main = s.display_id === main;
  return list;
}
const chosen = (list) => list.find((s) => s.id === screenId) || list.find((s) => s.main) || list[0];
// Discord, and Elgato Wave Link: when Wave Link mixes in its own process, it plays Premade's voices again as its own sound
function leaveOutPids() {
  try {
    const out = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
    const rows = [...out.matchAll(/^"(Discord(?:PTB|Canary|Development)?|WaveLink\w*)\.exe","(\d+)"/gim)];
    return { pids: rows.map((m) => +m[2]), discord: rows.some((m) => /^discord/i.test(m[1])), error: false };
  } catch { return { pids: [], discord: false, error: true }; }
}
ipcMain.on('share-audio-mode', (e) => {
  if (!fromSite(e)) return;
  const found = process.platform === 'win32' ? leaveOutPids() : { pids: [], discord: false, error: false };
  shareAudioMode = true;
  shareAudioFiltered = process.platform === 'win32'; // Premade's own sound (friends' voices and shares) always stays out, so they don't hear themselves
  shareLeaveOut = [process.pid, ...found.pids];
  e.returnValue = { filter: shareAudioFiltered, discord: found.discord, warning: found.error };
});
ipcMain.on('share-audio-cancel', (e) => { if (fromSite(e)) { shareAudioMode = false; shareAudioFiltered = false; shareLeaveOut = []; filteredLeaveOut = []; stopFilteredCapture(); } });
const AUDIO_CAPTURE = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'audio-capture.exe');
function stopFilteredCapture() {
  if (!filteredCapture) return;
  clearTimeout(filteredCapture.timer);
  filteredCapture.child.kill();
  filteredCapture = null;
}
ipcMain.handle('filtered-audio-start', async (e) => {
  if (!fromSite(e) || process.platform !== 'win32' || !filteredLeaveOut.length || filteredCapture) return false;
  const child = spawn(AUDIO_CAPTURE, filteredLeaveOut.map(String), { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
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
ipcMain.on('filtered-audio-stop', (e) => { if (fromSite(e)) { stopFilteredCapture(); filteredLeaveOut = []; } });
ipcMain.handle('screens', async (e) => (!fromSite(e) ? [] : (await screens(true)).map((s) => ({ id: s.id, main: s.main, thumb: s.thumbnail.toDataURL() }))));
// thumbs false: names only. On Windows each picture is a Windows Graphics Capture of that window, and with an NVIDIA
// card every capture left its driver threads behind in this process (~13 threads and ~30 MB each time), so the Aion 2
// window lookup every 30 s grew it ~55 MB a minute (Rayan, 3 Nov: 5.5 GB, 2,842 threads)
ipcMain.handle('capture-sources', async (e, thumbs = true) => {
  if (!fromSite(e)) return [];
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: thumbs ? { width: 280, height: 158 } : { width: 0, height: 0 } });
  const main = String(screen.getPrimaryDisplay().id);
  return list.map((s) => ({ id: s.id, name: s.name, type: s.id.startsWith('screen:') ? 'screen' : 'window', main: s.id.startsWith('screen:') && s.display_id === main, thumb: thumbs ? s.thumbnail.toDataURL() : '' }));
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
// LPC_LEAGUE_DIR: a stand-in League folder, for client.test.js. League's folders first, then every other Riot game's:
// TFT has its own app since 4 Nov 2026, and its client API (a lockfile in its folder, if it writes one like League's)
// is found there too.
function leagueDirs() {
  const dirs = [process.env.LPC_LEAGUE_DIR];
  try {
    const installs = JSON.parse(fs.readFileSync(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games', 'RiotClientInstalls.json'), 'utf8'));
    const all = Object.keys(installs.associated_client || {}), lol = (k) => /league of legends/i.test(k);
    dirs.push(...all.filter(lol), 'C:\\Riot Games\\League of Legends', ...all.filter((k) => !lol(k)));
  } catch { dirs.push('C:\\Riot Games\\League of Legends'); }
  return [...new Set(dirs.filter(Boolean))];
}
// For the connection log: which Riot apps run and which Riot folders have a client lockfile, a line each time that
// changes (checked every 30 s), so one TFT game in TFT's own app shows how Premade can find it
let riotSeen = '';
async function riotCheck(diag) {
  let apps = '';
  try { apps = [...new Set([...(await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 2500 })).matchAll(/^"([^"]*(?:riot|league|tft|teamfight)[^"]*)\.exe"/gim)].map((m) => m[1]))].sort().join(', '); } catch {}
  const locks = [];
  for (const d of leagueDirs()) if (await fs.promises.access(path.join(d, 'lockfile')).then(() => true, () => false)) locks.push(d);
  const line = `Riot apps running: ${apps || 'none'}; client lockfile in: ${locks.join(', ') || 'none'}`;
  if (line !== riotSeen) { riotSeen = line; diag(line); }
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

// ---- Windows' Communications setting (Sound control panel): while an app has a mic open for voice chat, as Chromium
// marks Premade's, Windows turns every other sound down. 0 mutes them, 1 (the default, also when never set) is 80%, 2
// is 50% and 3 is Do nothing. The page's note by the mic opens that tab.
ipcMain.handle('ducking', (e) => (fromSite(e) && process.platform === 'win32' ? ducking() : 3));
function ducking() {
  return new Promise((res) => execFile('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Multimedia\\Audio', '/v', 'UserDuckingPreference'], { windowsHide: true, timeout: 2500 }, (err, out) => {
    const m = /0x([0-9a-f]+)/i.exec(out || '');
    res(m ? parseInt(m[1], 16) : 1);
  }));
}
// ---- lowering other apps while friends talk (Voice settings), as Discord's attenuation: volume-helper.exe (client/volume)
// turns every app's sound down but Premade's (and its helpers') and Discord's. Each line it gets is the share of their
// volume the apps keep; when Premade quits its input closes and it puts them back. One killed with Premade (a crash)
// left its list in %TEMP%, so a helper started now puts those back too.
const VOLUME_HELPER = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'volume-helper.exe');
let volume = null;
function volumeHelper() {
  if (volume || process.platform !== 'win32' || !fs.existsSync(VOLUME_HELPER)) return volume;
  volume = spawn(VOLUME_HELPER, [path.basename(process.execPath), 'audio-capture', 're4-helper', 'Discord', 'DiscordPTB', 'DiscordCanary'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  volume.stdin.on('error', () => {});
  volume.on('exit', () => { volume = null; });
  return volume;
}
ipcMain.on('attenuate', (e, by) => {
  if (!fromSite(e)) return;
  by = Math.min(0.9, Math.max(0, +by || 0));
  const v = by || volume ? volumeHelper() : null;
  if (v) v.stdin.write(`${1 - by}
`);
});
if (process.platform === 'win32' && fs.existsSync(path.join(app.getPath('temp'), 'premade-volume.txt')) && volumeHelper()) volume.stdin.end();
// ---- Aion 2 live fight (Aion 2 page, off until turned on past its ban warning): client/aionlive.js reads the game's
// traffic through Npcap and the fight goes to the page twice a second. 'npcap' when Npcap isn't installed.
let aionLive = null;
ipcMain.handle('aion-live', (e, on, partyOnly) => {
  if (!fromSite(e) || process.platform !== 'win32') return 'error';
  if (!on) { if (aionLive) aionLive.stop(); aionLive = null; return 'off'; }
  if (aionLive) { aionLive.partyOnly = !!partyOnly; return 'on'; }
  if (!fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'Npcap', 'wpcap.dll'))) return 'npcap';
  const send = (name, v) => { if (win && !win.isDestroyed()) win.webContents.send(name, v); };
  try { aionLive = require('./aionlive').start((s) => send('aion-live', s), { partyOnly: !!partyOnly, onFight: (f) => { saveAionFight(f); send('aion-fight', f); } }); return 'on'; }
  catch (err) { console.error('aion live:', err.message); return 'error'; }
});
// ---- Aion 2 meter: the live fight in its own small window over the game, like Abyss DPS Meter (Aion 2 in Borderless
// or Windowed mode). meter.html reads the fight from the site's storage (lpc-aion-live, as the Aion 2 tabs do), so here
// it's only opened, kept on top and put back where it was left, sized as it was.
let aionMeter = null;
const meterFile = () => path.join(app.getPath('userData'), 'aion-meter.json');
ipcMain.handle('aion-meter', (e, on) => {
  if (!fromSite(e)) return false;
  if (!on) { if (aionMeter && !aionMeter.isDestroyed()) aionMeter.close(); return false; }
  if (aionMeter && !aionMeter.isDestroyed()) { aionMeter.showInactive(); return true; }
  let at = {};
  try { at = JSON.parse(fs.readFileSync(meterFile(), 'utf8')); } catch {}
  const fits = screen.getAllDisplays().some((d) => at.x >= d.bounds.x && at.y >= d.bounds.y && at.x < d.bounds.x + d.bounds.width - 40 && at.y < d.bounds.y + d.bounds.height - 40);
  aionMeter = new BrowserWindow({
    ...(fits ? { x: at.x, y: at.y } : {}), width: Math.max(260, +at.width || 340), height: Math.max(120, +at.height || 300), minWidth: 260, minHeight: 120,
    show: false, frame: false, resizable: true, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true, backgroundColor: '#0b0809', title: 'Aion 2 meter', webPreferences,
  });
  aionMeter.setAlwaysOnTop(true, 'screen-saver');
  aionMeter.setOpacity(0.94);
  let saveTimer = null;
  meterTall = 0;
  const keep = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!aionMeter || aionMeter.isDestroyed()) return; const b = aionMeter.getBounds(); try { fs.writeFileSync(meterFile(), JSON.stringify(meterTall ? { ...b, height: meterTall } : b)); } catch {} }, 400); };
  aionMeter.on('move', keep);
  aionMeter.on('resize', keep);
  aionMeter.on('closed', () => { aionMeter = null; if (win && !win.isDestroyed()) win.webContents.send('aion-meter', false); });
  aionMeter.once('ready-to-show', () => aionMeter.showInactive());
  keepUp(aionMeter, () => base + 'meter.html', 'Aion 2 meter');
  loadFresh(aionMeter, base + 'meter.html');
  return true;
});
// minimize: h > 0 shrinks the meter to its title bar (h px), 0 grows it back to the height it had (meterTall, also what's
// saved while it's small, so it opens full size)
let meterTall = 0;
ipcMain.handle('aion-meter-small', (e, h) => {
  if (!fromSite(e) || !aionMeter || aionMeter.isDestroyed()) return false;
  const b = aionMeter.getBounds();
  if (h > 0 && !meterTall) { meterTall = b.height; aionMeter.setMinimumSize(260, 20); aionMeter.setBounds({ ...b, height: Math.min(120, Math.max(20, Math.round(h))) }); }
  else if (!(h > 0) && meterTall) { aionMeter.setBounds({ ...b, height: meterTall }); meterTall = 0; aionMeter.setMinimumSize(260, 120); }
  return !!meterTall;
});
// finished fights (a boss killed, or 20 s or more of fighting), the newest 200, in the app's own folder
const aionFightsFile = () => path.join(app.getPath('userData'), 'aion-fights.json');
const aionFights = () => { try { const l = JSON.parse(fs.readFileSync(aionFightsFile(), 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; } };
function saveAionFight(f) { try { fs.writeFileSync(aionFightsFile(), JSON.stringify([f, ...aionFights()].slice(0, 200))); } catch (err) { console.error('aion fights:', err.message); } }
ipcMain.handle('aion-fights', (e) => (fromSite(e) ? aionFights() : []));
// Aion 2's own plain log (NC's crash reporter breadcrumbs: each map loaded, some dungeon clears), newest file, from a
// byte on; the page notices dungeon runs in it (Record each Aion 2 dungeon run)
const crumbDir = () => path.join(process.env.LOCALAPPDATA || '', 'NCSOFT', 'NccrData', 'com.ncsoft.aion2global');
ipcMain.handle('aion-log', async (e, file, from) => {
  if (!fromSite(e)) return null;
  const dir = crumbDir(), all = (await fs.promises.readdir(dir).catch(() => [])).filter((n) => n.endsWith('.breadcrumb.log'));
  const st = await Promise.all(all.map((n) => fs.promises.stat(path.join(dir, n)).then((s) => ({ n, at: s.mtimeMs, size: s.size }), () => null)));
  const files = st.filter(Boolean).sort((a, b) => b.at - a.at);
  if (file === '*') return Promise.all(files.slice(0, 400).map((f) => fs.promises.readFile(path.join(dir, f.n), 'utf8').catch(() => ''))); // every game start's, for the runs list and the week
  const last = files[0];
  if (!last) return null;
  const at = last.n === file ? Math.min(Math.max(0, +from || 0), last.size) : 0, buf = Buffer.alloc(Math.min(last.size - at, 1e6));
  const fh = await fs.promises.open(path.join(dir, last.n), 'r').catch(() => null);
  if (!fh) return null;
  try { await fh.read(buf, 0, buf.length, at); } finally { await fh.close(); }
  return { file: last.n, size: at + buf.length, text: buf.toString('utf8') };
});
// a party member's combat power, gear and skill names from NC's own character pages (what the Aion 2 tracker reads),
// found by name and server id; kept 10 minutes
const aionChars = new Map();
const plaync = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': 'Premade (Aion 2 party card)' }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
// The party's server can be wrong (Baba's 3zo, a level 45 Gladiator, came as Odar's 3zo, a level 32 Assassin), so a name's matches must also have
// the party's class (pcId); then the one on that server, else the only one left, else the only one at the party's level.
ipcMain.handle('aion-char', async (e, name, server, cls, level) => {
  if (!fromSite(e) || typeof name !== 'string' || !/^[\p{L}\p{N}$#_.-]{2,32}$/u.test(name) || !(server >= 1000 && server <= 9999)) return null;
  const key = `${name}@${server}`, kept = aionChars.get(key);
  if (kept && Date.now() - kept.at < 600e3) return kept.v;
  try {
    const found = await plaync(`https://api-search.plaync.com/aion2global/search/v2/character?keyword=${encodeURIComponent(name)}&region=eu&localeInfo=en-US&page=1&size=20`);
    const same = (found.list || []).filter((x) => String(x.name).replace(/<[^>]+>/g, '').toLowerCase() === name.toLowerCase() && (!cls || x.pcId === cls));
    const lv = same.filter((x) => x.level === level); // NC's search can lag a level behind, so only to choose
    const c = same.find((x) => x.serverId === server) || (!cls ? null : same.length === 1 ? same[0] : lv.length === 1 ? lv[0] : null);
    if (!c) return null;
    const q = `region=eu&lang=en-US&characterId=${c.characterId}&serverId=${c.serverId}`; // characterId comes URL-encoded already
    const [info, equip] = await Promise.all([plaync(`https://aion2.plaync.com/api/character/info?${q}`), plaync(`https://aion2.plaync.com/api/character/equipment?${q}`)]);
    const v = {
      server: c.serverName, className: info.profile.className, cp: info.profile.combatPower,
      il: ((info.stat && info.stat.statList) || []).find((s) => s.type === 'ItemLevel')?.value ?? null,
      gear: ((equip.equipment && equip.equipment.equipmentList) || []).map((g) => ({ slot: g.slotPosName, name: g.name, grade: g.grade, enchant: g.enchantLevel })),
      skills: Object.fromEntries(((equip.skill && equip.skill.skillList) || []).map((s) => [s.id, s.name])),
    };
    aionChars.set(key, { at: Date.now(), v });
    return v;
  } catch (err) { console.error('aion char:', err.message); return null; }
});
ipcMain.on('sound-settings', (e) => { if (fromSite(e) && process.platform === 'win32') spawn('rundll32.exe', ['shell32.dll,Control_RunDLL', 'mmsys.cpl,,3'], { detached: true, stdio: 'ignore' }).unref(); });
// ---- RE4 co-op page: re4-helper.exe (client/re4) reads Tailscale, the firewall, game and saves without admin, backs
// up saves, starts RE4, switches the co-op mod, sets the PC up to host, makes invites and joins a host (it asks Windows
// for admin itself when needed). Only these commands go through; it answers with JSON. An invite, and the share link
// that goes in one, travel on its stdin, never in its command line. re4link.js adds which friends are online.
const re4link = require('./re4link');
ipcMain.handle('re4', (e, what, arg) => {
  if (!fromSite(e) || process.platform !== 'win32' || !['status', 'backup', 'play', 'backups', 'setup', 'signin', 'share', 'theirs', 'ours', 'char', 'invite', 'unfriend', 'join', 'remove'].includes(what)) return null;
  arg = String(arg || '').slice(0, 400);
  const args = what === 'setup' ? [what, process.execPath] : what === 'unfriend' || what === 'char' ? [what, arg] : [what];
  const slow = ['setup', 'join', 'remove'].includes(what);
  return new Promise((res) => {
    const p = execFile(path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 're4-helper.exe'), args, { windowsHide: true, timeout: slow ? 600000 : 90000, maxBuffer: 1 << 20 }, (err, out) => {
      try { res(re4link.update(JSON.parse(out))); } catch { res(null); }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(what === 'join' || what === 'invite' ? arg : '');
  });
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
// With Aion 2's panels on it (prog, app 1.46) the mouse still goes through to the game, but the page hears it move and
// takes it while it's over a panel (overlay-mouse), so a panel can be opened, closed, dragged and clicked.
let overlayState = { visible: false }, placed = '', placedShape = '', placedAt = null, editing = false, passing = false, moveTimer = null, overlayRevision = 0;
const display = async () => {
  if (overlayState.any && frontDisplay) return frontDisplay; // who's talking in another game: on that game's screen
  const s = chosen(await screens(false));
  return screen.getAllDisplays().find((d) => s && String(d.id) === s.display_id) || screen.getPrimaryDisplay();
};
// ---- who's talking in other games (app 1.38): the page asks each second, only while it's in a room outside League,
// whether the window in front is Premade's (mine) or fills its screen (full: a game in Borderless or full screen, not
// the desktop), and the overlay goes on that screen. Buffers made once, so asking every second allocates nothing native.
let frontApi = null, frontDisplay = null;
ipcMain.handle('front-app', (e) => {
  if (!fromSite(e) || process.platform !== 'win32') return null;
  try {
    if (!frontApi) {
      const l = require('koffi').load('user32.dll');
      frontApi = { rect: l.func('int __stdcall GetWindowRect(void* w, _Out_ int32_t* r)'), cls: l.func('int __stdcall GetClassNameW(void* w, _Out_ uint16_t* buf, int max)'), r: new Int32Array(4), buf: new Uint16Array(64) };
    }
    const u = ctlUser32(), w = u.fg();
    if (!w) return { full: false, mine: false };
    if (u.thread(w) === process.pid) return { full: false, mine: true };
    const n = frontApi.cls(w, frontApi.buf, 64), name = String.fromCharCode(...frontApi.buf.subarray(0, Math.max(0, n)));
    if (!frontApi.rect(w, frontApi.r) || name === 'Progman' || name === 'WorkerW') return { full: false, mine: false }; // the desktop fills the screen too
    const [left, top, right, bottom] = frontApi.r, b = screen.screenToDipRect(null, { x: left, y: top, width: right - left, height: bottom - top }), d = screen.getDisplayMatching(b);
    const full = b.x <= d.bounds.x + 1 && b.y <= d.bounds.y + 1 && b.x + b.width >= d.bounds.x + d.bounds.width - 1 && b.y + b.height >= d.bounds.y + d.bounds.height - 1;
    if (full && (!frontDisplay || frontDisplay.id !== d.id)) { frontDisplay = d; replaceOverlay(); }
    return { full, mine: false };
  } catch (err) { console.error('front-app:', err.message); return null; }
});
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
    keepUp(overlay, () => base + 'overlay.html', 'overlay');
    loadFresh(overlay, base + 'overlay.html');
  }
  if (editing !== !!s.edit || passing !== !!s.prog) {
    editing = !!s.edit;
    passing = !!s.prog;
    overlay.setIgnoreMouseEvents(!editing, { forward: passing && !editing });
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
ipcMain.on('overlay-mouse', (e, on) => { if (fromSite(e) && overlay && passing && !editing) overlay.setIgnoreMouseEvents(!on, { forward: true }); });
// a panel dragged, opened or closed, or a line clicked: the page keeps it
ipcMain.on('overlay-prog', (e, m) => { if (fromSite(e) && win && !win.isDestroyed() && m && typeof m === 'object') win.webContents.send('overlay-moved', { prog: m }); });

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
  autoUpdater.on('error', (err) => { console.error('update:', err.message); if (!win.isDestroyed()) win.webContents.send('update', { error: err.message }); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 3600e3);
  // the page's Update button: installs a downloaded update, or (app 1.34.3) fetches one now instead of at the next 4-hour check
  ipcMain.on('update', (e) => { if (!fromSite(e)) return; if (updateReady) autoUpdater.quitAndInstall(true, true); else check(); });
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
const clipOk = (n) => typeof n === 'string' && n.length <= 120 && /^[^\\/:*?"<>|\x00-\x1f.][^\\/:*?"<>|\x00-\x1f]*\.webm$/i.test(n) && !/\.part\.webm$/i.test(n); // not a cut being made (1.41)
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
// App 1.41: one the app or the PC closed during is made seekable at the next start (Videos to finish.json), and
// quitting waits for one being finished.
const vidDir = () => path.join(clipDir(), 'Games'), vidAt = (n) => path.join(vidDir(), n), jsonAt = (n) => vidAt(n).replace(/\.webm$/i, '.json'); // app 1.42: an Aion 2 run's timeline beside it
const vids = new Map(); // the one being recorded: its name -> { fh, q (its writes, in order), room (seekable's room not yet added) }
const finishing = new Set(); // names being made seekable at the start
const working = new Set(), work = (p) => { working.add(p); p.finally(() => working.delete(p)).catch(() => {}); return p; }; // what quitting waits for
const toFinishFile = () => path.join(app.getPath('userData'), 'Videos to finish.json');
const toFinish = () => { try { const l = JSON.parse(fs.readFileSync(toFinishFile(), 'utf8')); return Array.isArray(l) ? l.filter((f) => typeof f === 'string' && clipOk(path.basename(f))) : []; } catch { return []; } };
const setToFinish = (f, on) => { const l = toFinish().filter((x) => x !== f); try { fs.writeFileSync(toFinishFile(), JSON.stringify(on ? [...l, f] : l)); } catch {} };
async function vidEnd(n) {
  const v = vids.get(n);
  if (!v) return false;
  vids.delete(n);
  await v.q;
  await v.fh.close().catch(() => {});
  await work(seekable(v.file).catch((err) => diag(`game video: ${err.message}`)));
  setToFinish(v.file, false);
  return true;
}
// at the start: the videos left unfinished, then the leftovers of one being made seekable or cut when Premade closed
// (Rayan had 10.9 GB of .part files, 25-26 Oct): a day old, they go to the Recycle Bin
async function videosLeft() {
  for (const f of toFinish()) {
    const n = path.basename(f);
    if (vids.has(n)) continue; // being recorded now (its game started before this ran)
    finishing.add(n);
    if (fs.existsSync(f)) await seekable(f).then((ok) => diag(`finished ${n}: ${ok ? 'seekable' : 'left as it was'}`), (err) => diag(`finishing ${n}: ${err.message}`));
    setToFinish(f, false);
    finishing.delete(n);
  }
  await partsClean();
}
const PART = /\.webm(\.part|\.\w+\.part\.webm|\.list\.txt)$/i; // half-made: being recorded, made seekable or cut
async function partsClean() { // says which went
  const out = [];
  for (const dir of new Set([clipDir(), vidDir()])) for (const n of await fs.promises.readdir(dir).catch(() => [])) {
    if (!PART.test(n)) continue;
    const f = path.join(dir, n), st = await fs.promises.stat(f).catch(() => null);
    if (st && st.isFile() && Date.now() - st.mtimeMs > 864e5 && (await shell.trashItem(f).then(() => true, () => false))) out.push(n);
  }
  if (out.length) diag(`binned ${out.length} half-made video file${out.length > 1 ? 's' : ''}`);
  return out;
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
      if (fh) { vids.set(name, { fh, file: vidAt(name), q: Promise.resolve(), room: true }); setToFinish(vidAt(name), true); return name; }
    }
    return '';
  }
  if (what === 'add') { // a: its name, b: the next part
    const v = vids.get(a), buf = bytes(b);
    if (!v || !buf || buf.length > 100e6) return false;
    const part = v.room ? withRoom(buf) : buf;
    v.room = false;
    await (v.q = v.q.then(() => v.fh.write(part)).catch(() => {}));
    return true;
  }
  if (what === 'end') return vidEnd(a);
  const list = async () => { // newest first: { name, size, at, rec (being recorded) }
    const out = [];
    for (const name of (await fs.promises.readdir(vidDir()).catch(() => [])).filter(clipOk)) {
      const st = await fs.promises.stat(vidAt(name)).catch(() => null);
      if (st && st.isFile()) out.push({ name, size: st.size, at: st.mtimeMs, rec: vids.has(name) || finishing.has(name) });
    }
    return out.sort((x, y) => y.at - x.at);
  };
  if (what === 'list') return list();
  if (what === 'clean') { // the ones older than a days go to the bin (and day-old half-made files); says which went
    await partsClean();
    const out = [];
    for (const v of await list()) if (a > 0 && !v.rec && Date.now() - v.at > a * 864e5 && (await shell.trashItem(vidAt(v.name)).then(() => true, () => false))) { out.push(v.name); shell.trashItem(jsonAt(v.name)).catch(() => {}); }
    return out;
  }
  if (what === 'folder') { await fs.promises.mkdir(vidDir(), { recursive: true }).catch(() => {}); return (await shell.openPath(vidDir())) === ''; }
  if (!clipOk(a) || vids.has(a) || finishing.has(a)) return false;
  if (what === 'open') return (await shell.openPath(vidAt(a))) === ''; // in your video player
  // ponytail: the whole video (about 300 MB for 30 minutes) goes to the page at once; a stream if that's too much
  if (what === 'read') return fs.promises.readFile(vidAt(a)).catch(() => null); // for its highlights in the page
  if (what === 'show') { shell.showItemInFolder(vidAt(a)); return true; }
  if (what === 'trash') { shell.trashItem(jsonAt(a)).catch(() => {}); return shell.trashItem(vidAt(a)).then(() => true, () => false); }
  if (what === 'json') return typeof b === 'string' && b.length < 2e6 && fs.promises.writeFile(jsonAt(a), b).then(() => true, () => false); // b: its timeline
  if (what === 'cut') { // b: [[from, to] s, ...] in order: keeps only those parts, copied as they are (an Aion 2 run's boss fights). Matroska, as
    // ffmpeg won't write H.264 as WebM; Chrome plays it the same (checked on a cut of Rayan's 6 Nov run)
    const parts = Array.isArray(b) ? b.filter((p) => Array.isArray(p) && p[0] >= 0 && p[1] > p[0]).slice(0, 50) : [];
    if (!parts.length) return false;
    const src = vidAt(a), tmp = (k) => `${src}.${k}.part.webm`, list = `${src}.list.txt`, out = `${src}.cut.part.webm`;
    return work((async () => { try {
      const { ffmpeg } = await getTools();
      for (const [k, [x, y]] of parts.entries()) await run(ffmpeg, ['-y', '-ss', String(x), '-i', src, '-t', String(y - x), '-c', 'copy', '-f', 'matroska', tmp(k)]);
      await fs.promises.writeFile(list, parts.map((p, k) => `file '${tmp(k).replace(/'/g, "'\\''")}'`).join('\n'));
      await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-f', 'matroska', out]);
      await fs.promises.rename(out, src);
      return true;
    } catch (err) { diag(`cut: ${err.message}`); return false; }
    finally { for (const f of [list, out, ...parts.map((p, k) => tmp(k))]) fs.promises.unlink(f).catch(() => {}); } })());
  }
  return null;
});
// A WebM from Chrome's MediaRecorder, made seekable: its EBML header, then a Segment of known size with a SeekHead (to
// Info, Tracks and the Cues), Info with a Duration, Tracks, every Cluster as recorded up to the last whole one (with its
// size, where Chrome left it unknown), and Cues with each cluster whose first video frame is a key frame. The sizes and
// places it writes take 8 bytes each, so none of them moves another. Written to a .part file that then takes its place,
// so a failure leaves the recording as it was.
// App 1.41: a recording's first part gets room for the SeekHead and the Duration (an EBML Void after Tracks, withRoom),
// so they go in that room and the sizes and Cues are written into the file itself, instead of copying all of a 5-8 GB
// League game; a file without that room (before 1.41) is still copied.
// ponytail: reads what Chrome writes (Info and Tracks before the clusters, which may be of unknown size, as cutClip in
// index.html does); a file laid out otherwise is left as it was
const vint = (b, o, id) => { // [value, length] of an ID (id: with its length bits) or a size (-1: unknown)
  let n = 1;
  while (n < 8 && !(b[o] & (0x80 >> (n - 1)))) n++;
  let v = id ? b[o] : b[o] & (0xff >> n), ones = v === 0xff >> n;
  for (let k = 1; k < n; k++) { v = v * 256 + b[o + k]; ones = ones && b[o + k] === 0xff; }
  return [!id && ones ? -1 : v, n];
};
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.max(0, Math.round(v)))); return b; };
const size8 = (n) => { const b = u64(n); b[0] = 0x01; return b; }; // an EBML size in 8 bytes
const voidOf = (n) => (n < 9 ? Buffer.from([0xec, 0x80 | (n - 2), ...Buffer.alloc(n - 2)]) : Buffer.concat([Buffer.of(0xec), size8(n - 9), Buffer.alloc(n - 9)])); // n >= 2 bytes in all
const ROOM = 256; // what seekable adds is about 120 bytes
function withRoom(b) { // b: a recording's first part, from Chrome
  const el = (at) => { if (at + 12 > b.length) return null; const [id, n] = vint(b, at, true), [len, sn] = vint(b, at + n); return { id, data: at + n + sn, len, end: at + n + sn + len }; };
  const ebml = el(0), seg = ebml && ebml.id === 0x1a45dfa3 && ebml.len >= 0 && el(ebml.end);
  if (!seg || seg.id !== 0x18538067) return b;
  for (let at = seg.data, e; (e = el(at)) && e.len >= 0 && e.end <= b.length && e.id !== 0x1f43b675; at = e.end) {
    if (e.id === 0x1654ae6b) return Buffer.concat([b.subarray(0, e.end), voidOf(ROOM), b.subarray(e.end)]); // after Tracks
  }
  return b; // Tracks not all in it: seekable copies it
}
async function seekable(file) {
  const fh = await fs.promises.open(file, 'r'), size = (await fh.stat()).size;
  try {
    let from = 0, buf = Buffer.alloc(0); // a window on the file, from byte from
    const get = async (at, n) => {
      n = Math.max(0, Math.min(n, size - at));
      if (at < from || at + n > from + buf.length) { from = at; buf = Buffer.alloc(Math.min(size - at, Math.max(n, 4 << 20))); await fh.read(buf, 0, buf.length, at); }
      return buf.subarray(at - from, at - from + n);
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
    const elem = (id, ...body) => { const b = Buffer.concat(body); return Buffer.concat([Buffer.from(id), size8(b.length), b]); };
    const num = (id, v) => Buffer.concat([Buffer.from(id), Buffer.of(0x88), u64(v)]);
    const dur = Buffer.alloc(11);
    dur.set([0x44, 0x89, 0x88]);
    dur.writeDoubleBE(end + 33e6 / scale, 3); // to the end of its last frame, about
    const head = Buffer.from(await get(0, ebml.end)), infoOut = elem([0x15, 0x49, 0xa9, 0x66], ...parts, dur), tracksOut = Buffer.from(await get(tracks.at, tracks.end - tracks.at));
    const seek = (id, at) => elem([0x4d, 0xbb], Buffer.of(0x53, 0xab, 0x84, ...id), num([0x53, 0xac], at));
    const seekLen = 12 + 3 * 28, infoAt = seekLen, tracksAt = infoAt + infoOut.length, room = first - seg.data - (tracksAt + tracksOut.length); // positions count from the Segment's insides
    const inPlace = seg.data - seg.at === 12 && (room === 0 || room >= 2); // the room withRoom left (a Void needs 2 bytes or more)
    const clustersAt = inPlace ? first - seg.data : tracksAt + tracksOut.length, cuesAt = clustersAt + last - first;
    const seekHead = elem([0x11, 0x4d, 0x9b, 0x74], seek([0x15, 0x49, 0xa9, 0x66], infoAt), seek([0x16, 0x54, 0xae, 0x6b], tracksAt), seek([0x1c, 0x53, 0xbb, 0x6b], cuesAt));
    const cuesOut = elem([0x1c, 0x53, 0xbb, 0x6b], ...cues.map(([t, at]) => elem([0xbb], num([0xb3], t), elem([0xb7], Buffer.of(0xf7, 0x81, video), num([0xf1], clustersAt + at - first)))));
    if (inPlace) { // the clusters stay where they are. In this order, a stop half way still leaves a video that plays
      const w = await fs.promises.open(file, 'r+');
      try {
        await w.truncate(last); // a cut-off last cluster, or Cues from before
        await w.write(cuesOut, 0, cuesOut.length, last);
        for (const [at, n] of fix) await w.write(size8(n), 0, 8, at);
        const headOut = Buffer.concat([seekHead, infoOut, tracksOut, room ? voidOf(room) : Buffer.alloc(0)]);
        await w.write(headOut, 0, headOut.length, seg.data);
        await w.write(size8(cuesAt + cuesOut.length), 0, 8, seg.at + 4);
      } finally { await w.close(); }
      return true;
    }
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

// ---- downloads (app 1.31): the video or the sound from a link on almost any site (YouTube, TikTok, Instagram, X, Reddit,
// Facebook, Twitch and about 1,700 more), saved in Downloads\Premade. yt-dlp does the work: it's fetched the first time
// with ffmpeg (which joins a video's picture and sound), and updates itself once a run, since the sites change often.
// YouTube's player puzzles run in this app's own Node (ELECTRON_RUN_AS_NODE), so nothing else needs installing.
// ponytail: videos only; picture posts (carousels, TikTok photos) need gallery-dl next to it
const { pipeline } = require('stream/promises'), { Readable } = require('stream');
const toolDir = () => path.join(app.getPath('userData'), 'Downloader'), dlDir = () => appDir('downloads');
const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const run = (exe, args, opts) => new Promise((res, rej) => execFile(exe, args, { windowsHide: true, ...opts }, (err, out) => (err ? rej(err) : res(out))));
// App 1.41: each is checked against the SHA-256 its project publishes beside it (sums: [that list's address, the
// file's name in it]) and refused when it differs, so a changed download never runs
const SUMS = { [YTDLP]: [YTDLP.replace(/[^/]+$/, 'SHA2-256SUMS'), 'yt-dlp.exe'], [FFMPEG]: [FFMPEG.replace(/[^/]+$/, 'checksums.sha256'), path.posix.basename(FFMPEG)] };
async function fetchTo(url, file, sums = SUMS[url], again = true) { // again: a list and a file from two builds (FFmpeg-Builds replaces 'latest' in place) get one more try
  const [sumsUrl, name] = sums;
  const s = await fetch(sumsUrl);
  if (!s.ok) throw new Error(`${sumsUrl}: ${s.status}`);
  const want = ((await s.text()).split('\n').map((l) => l.trim().split(/\s+/)).find(([h, n]) => /^[0-9a-f]{64}$/i.test(h) && n && n.replace(/^\*/, '') === name) || [])[0];
  if (!want) throw new Error(`${name} isn’t in ${sumsUrl}`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const hash = crypto.createHash('sha256');
  await pipeline(Readable.fromWeb(r.body), async function* (src) { for await (const c of src) { hash.update(c); yield c; } }, fs.createWriteStream(file + '.part'));
  if (hash.digest('hex') !== want.toLowerCase()) {
    await fs.promises.unlink(file + '.part').catch(() => {});
    if (again) return fetchTo(url, file, sums, false);
    throw new Error(`${name}: its SHA-256 isn’t the published one, so it wasn’t kept`);
  }
  await fs.promises.rename(file + '.part', file);
}
let tools = null; // { ytdlp, ffmpeg }, once they're there
function getTools() {
  return (tools ||= (async () => {
    const dir = toolDir(), ytdlp = path.join(dir, 'yt-dlp.exe'), ffmpeg = path.join(dir, 'ffmpeg.exe');
    await fs.promises.mkdir(dir, { recursive: true });
    if (!fs.existsSync(ytdlp)) await fetchTo(YTDLP, ytdlp);
    else run(ytdlp, ['-U']).catch(() => {}); // the new one is used from the next download
    if (!fs.existsSync(ffmpeg)) {
      const zip = path.join(dir, 'ffmpeg.zip');
      await fetchTo(FFMPEG, zip);
      await run('tar', ['-xf', zip, '-C', dir, '--strip-components', '2', '*/bin/ffmpeg.exe', '*/bin/ffprobe.exe']); // Windows' own tar opens zips
      await fs.promises.unlink(zip).catch(() => {});
    }
    return { ytdlp, ffmpeg };
  })().catch((err) => { tools = null; throw err; }));
}
const dls = new Map(); // running: link -> yt-dlp
// kind 'video' (up to 1080p, H.264 when there is one, so it plays everywhere) or 'audio' (an MP3). Progress goes to the
// page as 'download' { url, pct }; the answer is { file } or { error }.
ipcMain.handle('download', async (e, url, kind) => {
  if (!fromSite(e) || typeof url !== 'string' || url.length > 2000 || !/^https?:\/\/\S+$/i.test(url)) return { error: 'That isn’t a link.' };
  if (dls.has(url)) return { error: 'That one is already downloading.' };
  const send = (v) => { if (!e.sender.isDestroyed()) e.sender.send('download', { url, ...v }); };
  let t;
  try { send({ pct: -1 }); t = await getTools(); } catch (err) { diag(`downloader: ${err.message}`); return { error: 'Couldn’t get the downloader. Check your internet and try again.' }; }
  const args = [url, '--no-playlist', '--progress', '--newline', '--no-mtime', '--encoding', 'utf-8', '--ffmpeg-location', t.ffmpeg, '--js-runtimes', 'node:' + process.execPath,
    '-P', dlDir(), '-o', '%(title).80B [%(id)s].%(ext)s', '--print', 'after_move:filepath', '--progress-template', 'download:%(progress._percent_str)s',
    ...(kind === 'audio' ? ['-x', '--audio-format', 'mp3'] : ['-f', 'bv*+ba/b', '-S', 'res:1080,vcodec:h264,acodec:aac', '--merge-output-format', 'mp4'])];
  return new Promise((res) => {
    const p = execFile(t.ytdlp, args, { windowsHide: true, maxBuffer: 64e6, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }, (err, out, errOut) => {
      dls.delete(url);
      const file = String(out).trim().split(/\r?\n/).pop() || '';
      if (!err && file && fs.existsSync(file)) return res({ file });
      const why = (String(errOut).match(/ERROR: (.*)/g) || []).pop();
      res({ error: p.killed ? 'Stopped.' : why ? why.replace(/^ERROR: (\[[^\]]*\] )?/, '') : 'Couldn’t download that.' });
    });
    dls.set(url, p);
    p.stdout.on('data', (d) => { const m = String(d).match(/([\d.]+)%/g); if (m) send({ pct: parseFloat(m.pop()) }); });
  });
});
ipcMain.on('download-stop', (e, url) => { if (fromSite(e) && dls.has(url)) dls.get(url).kill(); });
ipcMain.on('download-show', (e, file) => {
  if (fromSite(e) && typeof file === 'string' && path.resolve(file).startsWith(dlDir() + path.sep)) shell.showItemInFolder(file);
});
ipcMain.on('downloads-folder', async (e) => {
  if (!fromSite(e)) return;
  await fs.promises.mkdir(dlDir(), { recursive: true }).catch(() => {});
  shell.openPath(dlDir());
});

// ---- convert a file (app 1.35): a video, a song or a picture to another format with the downloader's ffmpeg, saved next
// to it. The page only sees an id for each file picked here, never a path it could choose itself.
const conv = require('./convert');
const picked = new Map(), made = new Set(), convs = new Map(); // id -> { file, kind, duration }; files we wrote; id -> ffmpeg
ipcMain.handle('convert-pick', async (e) => {
  if (!fromSite(e)) return [];
  const r = await dialog.showOpenDialog(win, { title: 'Pick files to convert', properties: ['openFile', 'multiSelections'] });
  if (r.canceled || !r.filePaths.length) return [];
  let t;
  try { t = await getTools(); } catch (err) { diag(`converter: ${err.message}`); return { error: 'Couldn’t get the converter. Check your internet and try again.' }; }
  const ffprobe = path.join(path.dirname(t.ffmpeg), 'ffprobe.exe');
  return Promise.all(r.filePaths.map(async (file) => {
    const id = crypto.randomUUID(), name = path.basename(file);
    try {
      const out = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type:stream_disposition=attached_pic', '-of', 'json', file]);
      const info = conv.kindOf(JSON.parse(out));
      if (!info.kind) throw new Error();
      picked.set(id, { file, ...info });
      return { id, name, kind: info.kind, targets: conv.targetsFor(info.kind) };
    } catch { return { id, name, error: 'Premade can’t convert this kind of file yet.' }; }
  }));
});
// progress goes to the page as 'convert' { id, pct }; the answer is { file } or { error }
ipcMain.handle('convert', async (e, id, target) => {
  const p = picked.get(id);
  if (!fromSite(e) || !p || !conv.FOR[p.kind].includes(target)) return { error: 'Pick the file again.' };
  if (convs.has(id)) return { error: 'That one is already converting.' };
  const args = conv.convertArgs(target, p.duration);
  if (!args) return { error: 'Too long to fit in 10 MB. Cut it shorter first.' };
  const { ffmpeg } = await getTools(), out = conv.outPath(p.file, target, fs.existsSync); // got when it was picked
  const send = (v) => { if (!e.sender.isDestroyed()) e.sender.send('convert', { id, ...v }); };
  return new Promise((res) => {
    const f = execFile(ffmpeg, ['-hide_banner', '-v', 'error', '-i', p.file, ...args, '-progress', 'pipe:1', '-nostats', '-n', out], { windowsHide: true, maxBuffer: 64e6 }, (err, so, errOut) => {
      convs.delete(id);
      if (!err && fs.existsSync(out)) { made.add(out); return res({ file: out }); }
      fs.promises.unlink(out).catch(() => {}); // a half-made file
      res({ error: f.killed ? 'Stopped.' : String(errOut).trim().split(/\r?\n/).pop() || 'Couldn’t convert that.' });
    });
    convs.set(id, f);
    f.stdout.on('data', (d) => { const m = String(d).match(/out_time_us=(\d+)/g); if (m && p.duration) send({ pct: Math.min(99, parseInt(m.pop().slice(12)) / 1e4 / p.duration) }); });
  });
});
ipcMain.on('convert-stop', (e, id) => { if (fromSite(e) && convs.has(id)) convs.get(id).kill(); });
ipcMain.on('convert-show', (e, file) => { if (fromSite(e) && made.has(file)) shell.showItemInFolder(file); });

// ---- the performance meter: how much of the computer this app uses now, all its parts together. CPU is a share of
// the whole computer, as Task Manager shows it; memory in MB.
const usage = (m = app.getAppMetrics()) => ({ cpu: Math.round(m.reduce((n, p) => n + p.cpu.percentCPUUsage, 0) * 10) / 10, mb: Math.round(m.reduce((n, p) => n + p.memory.workingSetSize, 0) / 1024) });
ipcMain.handle('metrics', (e) => (fromSite(e) ? usage() : null));

// ---- PC check-up (Settings, App, app 1.43): the Windows-only parts run for real here, each a line { ok, name, say }
// (ok: true, false, or null for "not set up"). Nothing stays open: the audio filter and the test window end in seconds.
const NPCAP = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'Npcap', 'wpcap.dll');
const mb = (n) => `${Math.round(n / 1e6).toLocaleString('en')} MB`, gb = (n) => `${(n / 1e9).toFixed(1)} GB`;
function audioFilterCheck() { // audio-capture.exe starts and says PCM1 (it reached Windows' per-app sound)
  return new Promise((res) => {
    let child, out = Buffer.alloc(0), done = false;
    const end = (ok, say) => { if (done) return; done = true; clearTimeout(t); try { child.kill(); } catch {} res({ ok, name: 'Screen share sound filter', say }); };
    const t = setTimeout(() => end(false, 'audio-capture.exe didn’t start in 4 s'), 4000);
    try { child = spawn(AUDIO_CAPTURE, [String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (err) { return end(false, err.message); }
    child.stdout.on('data', (c) => { out = Buffer.concat([out, c]).subarray(0, 4); if (out.length === 4) end(out.toString() === 'PCM1', out.toString() === 'PCM1' ? 'works: friends hear your game without your voice chat' : 'Windows refused the per-app sound'); });
    child.once('error', (err) => end(false, err.message));
    child.once('exit', (code) => end(false, `audio-capture.exe stopped (exit code ${code})`));
  });
}
async function overlayCheck() { // a window like the overlay (on top, see-through, no focus) loads a page and draws it
  const w = new BrowserWindow({ width: 40, height: 40, x: 0, y: 0, show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true });
  try {
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setIgnoreMouseEvents(true);
    w.showInactive();
    const drew = await Promise.race([
      w.loadURL('data:text/html,<body style="margin:0;background:%23f00">').then(() => new Promise((r) => setTimeout(r, 200))).then(() => w.webContents.capturePage()).then((img) => !img.isEmpty() && img.toBitmap()[2] > 200), // BGRA: red
      new Promise((r) => setTimeout(() => r(false), 5000)),
    ]).catch(() => false);
    const ok = drew && w.isVisible();
    return { ok, name: 'Overlay window', say: ok ? 'a see-through window on top loads and draws (over a game only in Borderless window mode)' : 'a see-through window on top didn’t draw in 5 s' };
  } finally { w.destroy(); }
}
async function toolCheck(name, exe, arg) {
  if (!fs.existsSync(exe)) return { ok: null, name, say: 'not downloaded yet (the first download or convert fetches it)' };
  const v = await run(exe, [arg], { timeout: 8000 }).then((o) => String(o).split('\n')[0].trim().slice(0, 80), () => '');
  return { ok: !!v, name, say: v || 'there, but didn’t start' };
}
async function diskCheck() {
  const out = [];
  for (const [what, dir] of [['Clips', clipDir()], ['Games', vidDir()]]) {
    const st = await fs.promises.statfs(fs.existsSync(dir) ? dir : path.parse(dir).root).catch(() => null);
    let parts = 0, size = 0;
    for (const n of await fs.promises.readdir(dir).catch(() => [])) {
      const f = PART.test(n) && (await fs.promises.stat(path.join(dir, n)).catch(() => null));
      if (f && Date.now() - f.mtimeMs > 864e5) { parts++; size += f.size; } // newer ones: a video being recorded or cut now
    }
    const free = st ? st.bavail * st.bsize : 0;
    out.push({ ok: !!st && free > 20e9 && !parts, name: `${what} drive`, say: `${dir}: ${st ? gb(free) + ' free' + (free > 20e9 ? '' : ' (under 20 GB: a long game video may not fit)') : 'can’t read it'}${parts ? `, ${parts} half-made video file${parts > 1 ? 's' : ''} over a day old (${mb(size)}, binned at the next start)` : ''}` });
  }
  return out;
}
ipcMain.handle('checkup', async (e) => {
  if (!fromSite(e)) return [];
  const win32 = process.platform === 'win32', lines = [{ ok: true, name: 'App', say: `Premade ${app.getVersion()}, Electron ${process.versions.electron}, ${os.version ? os.version() : os.type()} ${os.release()}, ${os.cpus().length} threads, ${gb(os.totalmem())} RAM (${gb(os.freemem())} free)` }];
  const dir = toolDir(), [duck, filter, over, ytdlp, ffmpeg, disks] = await Promise.all([win32 ? ducking() : -1, win32 ? audioFilterCheck() : { ok: null, name: 'Screen share sound filter', say: 'Windows only' },
    overlayCheck(), toolCheck('yt-dlp (downloads)', path.join(dir, 'yt-dlp.exe'), '--version'), toolCheck('FFmpeg (converts, cuts)', path.join(dir, 'ffmpeg.exe'), '-version'), diskCheck()]);
  const duckSay = ['mutes other sounds', 'turns other sounds down 80%', 'turns other sounds down 50%', 'Do nothing'][duck];
  lines.push(!duckSay ? { ok: null, name: 'Windows Communications', say: win32 ? `setting ${duck}, not one Windows offers` : 'Windows only' }
    : { ok: duck === 3, name: 'Windows Communications', say: duckSay + (duck === 3 ? '' : ' while Premade has the mic open (Sound control panel, Communications tab: Do nothing)') });
  lines.push(filter, over);
  lines.push({ ok: win32 && fs.existsSync(NPCAP()) ? true : null, name: 'Npcap (Aion 2 live fight)', say: win32 && fs.existsSync(NPCAP()) ? 'installed' : 'not installed (only Live fight needs it)' });
  lines.push(ytdlp, ffmpeg, ...disks);
  const m = app.getAppMetrics(), u = usage(m);
  lines.push({ ok: true, name: 'App use now', say: `CPU ${u.cpu}%, memory ${u.mb} MB: ${m.map((p) => `${p.name || p.type} ${Math.round(p.memory.workingSetSize / 1024)}`).join(', ')}` });
  return lines;
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
// max-age=0: the cached page is used once the site says it hasn't changed (a 304), instead of downloading it all again
const loadFresh = (w, url) => w.loadURL(url, { extraHeaders: 'Cache-Control: max-age=0\n' }).catch(() => {}); // a failed load: keepUp tries again
function navigated(e, url, code) {
  const test = url.startsWith(SITE + 'test/');
  if (test && code >= 400) return void loadFresh(win, SITE);
  if (!url.startsWith(SITE) || test === (base !== SITE)) return;
  base = test ? SITE + 'test/' : SITE;
  (test ? fs.promises.writeFile(testFile(), '') : fs.promises.rm(testFile(), { force: true })).catch(() => {});
  if (overlay) loadFresh(overlay, base + 'overlay.html');
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
    rec: reg(k.rec, () => win.webContents.send('key', 'rec')), // app 1.28.6: Record your screen
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
      // app 1.45.1: while a Change button waits for keys ({ capture: true }), the keys pressed are read here too and sent
      // as 'combo:Alt+Z': keys another app took as its hotkey (NVIDIA's Alt+Z, Alt+R, Alt+F1...) never reach the page
      if (k.capture) {
        const CAP = [...Array(26)].map((x, i) => [String.fromCharCode(65 + i), 65 + i]).concat([...Array(10)].map((x, i) => [String(i), 0x30 + i]), [...Array(12)].map((x, i) => ['F' + (i + 1), 0x70 + i]));
        const was = new Set(CAP.filter(([, c]) => keyState(c) & 0x8000).map(([n]) => n));
        const capTimer = setInterval(() => {
          if (win.isDestroyed()) return;
          for (const [n, c] of CAP) {
            if (!(keyState(c) & 0x8000)) { was.delete(n); continue; }
            if (was.has(n)) continue;
            was.add(n);
            const mods = [[0x11, 'Ctrl'], [0x12, 'Alt'], [0x10, 'Shift']].filter(([m]) => keyState(m) & 0x8000).map(([, m]) => m);
            if (win.isFocused() && (mods.length || n[0] === 'F' && n.length > 1)) win.webContents.send('key', 'combo:' + [...mods, n].join('+'));
          }
        }, 15);
        clearInterval(pttTimer);
        pttTimer = capTimer;
      }
    } catch (err) { console.error('push to talk:', err); }
  }
  if (!ok.overlay) ok.overlay = reg(k.overlay, () => win.webContents.send('key', 'overlay')); // elsewhere, or without user32
  return ok;
});

// ---- remote control (app 1.26; 1.28: Remote help, its own connection, no room screen share): a friend asks for
// control; you say yes in Windows' own box here, never in the page, and only then does the page share your screen with
// them (the one picked in Settings, its id in the answer). A red bar at the top of that screen says who with a Stop
// button, Ctrl+Alt+X stops it too, and only while it's on their mouse and keys go in through user32 (mouse_event,
// keybd_event). Their x and y are fractions of that screen. Ends when the page reloads or either side
// stops; keys and buttons still down are let go, and a box still open closes as Don't allow.
// Games with anti-cheat and programs run as administrator take no input from other apps, so it can't work inside them.
// The box shows only once you're in Premade (till then a notification and its flashing taskbar button say who asks):
// popping up over a game, Tab (League's scoreboard) could move to Allow and Space press it.
// 1.27, from AnyDesk: Pause on the bar stops their input until Resume without ending it, it ends by itself after 10
// minutes with no input from them, their Ctrl+V pastes the text they copied (it goes on your clipboard first), and the
// page tells them when their input can't land: Windows' secure screen up (a UAC prompt) or an admin window in front.
let sharedSource = null, control = null, asking = null, refusedAt = 0, user32 = null;
const sharedDisplay = () => { // the whole screen the room share shows, which friends' pointer maps onto
  const s = sharedSource, all = screen.getAllDisplays();
  return s && s.id.startsWith('screen:') && (all.find((x) => String(x.id) === s.display_id) || (all.length === 1 && all[0]));
};
// KeyboardEvent.code -> the key's scan code (0xe0.. for extended keys): keys go in by their place on the keyboard, so
// two PCs with the same layout type the same letters (AZERTY and QWERTZ too), and games that read scan codes get them
const CTL_SCAN = new Map([...('Escape Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backspace Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP '
  + 'BracketLeft BracketRight Enter ControlLeft KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Backquote ShiftLeft Backslash KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period '
  + 'Slash ShiftRight NumpadMultiply AltLeft Space CapsLock F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 - ScrollLock Numpad7 Numpad8 Numpad9 NumpadSubtract Numpad4 Numpad5 Numpad6 NumpadAdd Numpad1 '
  + 'Numpad2 Numpad3 Numpad0 NumpadDecimal - - IntlBackslash F11 F12').split(' ').map((c, i) => [c, i + 1]),
  ...Object.entries({ NumpadEnter: 0x1c, ControlRight: 0x1d, NumpadDivide: 0x35, PrintScreen: 0x37, AltRight: 0x38, Home: 0x47, ArrowUp: 0x48, PageUp: 0x49, ArrowLeft: 0x4b,
    ArrowRight: 0x4d, End: 0x4f, ArrowDown: 0x50, PageDown: 0x51, Insert: 0x52, Delete: 0x53, MetaLeft: 0x5b, MetaRight: 0x5c, ContextMenu: 0x5d }).map(([c, s]) => [c, 0xe000 | s])].filter(([c]) => c !== '-'));
// KEYEVENTF_SCANCODE (8), with the key's virtual key too in case keybd_event ever drops that flag; 1 extended, 2 up
const ctlKey = (u, s, up) => u.key(u.vk(s, 3) & 0xff, s & 0xff, 8 | (s > 0xff ? 1 : 0) | (up ? 2 : 0), 0);
function ctlUser32() {
  if (user32) return user32;
  const koffi = require('koffi'), l = koffi.load('user32.dll'), k = koffi.load('kernel32.dll'), a = koffi.load('advapi32.dll');
  const open = k.func('void* __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)'), close = k.func('int __stdcall CloseHandle(void* h)');
  const token = a.func('int __stdcall OpenProcessToken(void* h, uint32_t access, _Out_ void** token)');
  const info = a.func('int __stdcall GetTokenInformation(void* token, int cls, _Out_ uint32_t* info, uint32_t size, _Out_ uint32_t* got)');
  const thread = l.func('uint32_t __stdcall GetWindowThreadProcessId(void* w, _Out_ uint32_t* pid)');
  const admin = (pid) => { // that program runs as administrator (TokenElevation); null when Windows won't say
    const h = pid && open(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (!h) return null;
    try { const t = [null], v = [0], n = [0]; if (!token(h, 8, t)) return null; try { return info(t[0], 20, v, 4, n) ? v[0] !== 0 : null; } finally { close(t[0]); } } finally { close(h); }
  };
  const mouse = l.func('void __stdcall mouse_event(uint32_t flags, uint32_t dx, uint32_t dy, int32_t data, uintptr_t extra)'), metric = l.func('int __stdcall GetSystemMetrics(int i)');
  // 1.36.3: the mouse moves like a real one, as AnyDesk does (MOVE | ABSOLUTE | VIRTUALDESK, 0..65535 over all screens),
  // not by SetCursorPos, which Windows can refuse or other apps never hear as a move: then their clicks landed where
  // your own mouse was, and only the wheel (which needs no position) seemed to work
  const at = (x, y) => { const vx = metric(76), vy = metric(77), vw = Math.max(2, metric(78)), vh = Math.max(2, metric(79));
    mouse(0xc001, Math.round(((x - vx) * 65535) / (vw - 1)), Math.round(((y - vy) * 65535) / (vh - 1)), 0, 0); };
  return (user32 = { at, mouse,
    key: l.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)'), down: l.func('short __stdcall GetAsyncKeyState(int vKey)'),
    vk: l.func('uint32_t __stdcall MapVirtualKeyW(uint32_t code, uint32_t type)'), fg: l.func('void* __stdcall GetForegroundWindow()'), thread: (w) => { const p = [0]; thread(w, p); return p[0]; },
    desk: l.func('void* __stdcall OpenInputDesktop(uint32_t flags, int inherit, uint32_t access)'), deskEnd: l.func('int __stdcall CloseDesktop(void* h)'), admin, me: admin(process.pid) === true });
}
// why their mouse and keys can't land: Windows' secure screen (a UAC prompt, or the PC locked) takes no input from
// apps, and a program run as administrator none from one that isn't (UIPI). Only says so: nothing gets around it
function ctlBlocked(u) {
  const d = u.desk(0, 0, 0x100); // DESKTOP_SWITCHDESKTOP: refused while the secure screen is up
  if (!d) return 'prompt';
  u.deskEnd(d);
  const w = u.fg();
  return w && !u.me && u.admin(u.thread(w)) ? 'admin' : '';
}
function controlLetGo(c) {
  for (const code of c.keys) ctlKey(c.u, CTL_SCAN.get(code), true);
  for (const b of c.buttons) c.u.mouse(b * 2, 0, 0, 0, 0); // a button's up flag is twice its down flag
  c.keys.clear();
  c.buttons.clear();
}
function controlEnd(why) {
  if (asking) asking.abort();
  if (!control) return;
  const c = control;
  control = null;
  c.ended = true; // input still waiting on a clipboard write is dropped
  clearInterval(c.timer);
  controlLetGo(c);
  c.bar.destroy();
  if (win && !win.isDestroyed()) win.webContents.send('control-end', why === 'idle' ? 'idle' : true);
}
function controlState(c) { // paused, or why their input can't land, for the page to tell them
  let st = 'paused';
  if (!c.paused) try { st = ctlBlocked(c.u); } catch { st = ''; }
  if (st !== c.st && win && !win.isDestroyed()) win.webContents.send('control-state', st);
  c.st = st;
}
function controlBar(c) { // who, Ctrl+Alt+X, and Pause or Resume and Stop
  const esc = (t) => t.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`), btn = 'background:#fff;color:#b3261e;border-radius:6px;padding:5px 12px;text-decoration:none';
  c.bar.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><body style="margin:0;height:100vh;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px 0 14px;background:${c.paused ? '#6b4e16' : '#b3261e'};color:#fff;font:600 14px 'Segoe UI',sans-serif;overflow:hidden;user-select:none"><span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${c.paused ? `Paused: ${esc(c.name)} can’t use your PC` : `${esc(c.name)} is controlling your PC`} &middot; Ctrl+Alt+X stops it</span><span style="display:flex;gap:6px"><a href="https://pause.invalid/" style="${btn}">${c.paused ? 'Resume' : 'Pause'}</a><a href="https://stop.invalid/" style="${btn}">Stop</a></span></body>`));
}
function controlStart(u, d, name) { // their yes: the red bar at the top of the shared screen, and their input from now on
  const { x, y, width } = d.bounds;
  const bar = new BrowserWindow({ x: Math.round(x + width / 2 - 320), y, width: 640, height: 40, show: false, frame: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, closable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, webPreferences: { sandbox: true } });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const c = (control = { u, name, bounds: d.bounds, scale: d.scaleFactor, bar, keys: new Set(), buttons: new Set(), paused: false, st: '', last: Date.now(), tick: 0 });
  bar.webContents.on('will-navigate', (ev, url) => { // its Pause and Stop links
    ev.preventDefault();
    if (!url.startsWith('https://pause.invalid/')) return controlEnd();
    c.paused = !c.paused;
    controlLetGo(c);
    controlBar(c);
    controlState(c);
  });
  controlBar(c);
  bar.showInactive();
  c.timer = setInterval(() => {
    if ([0x11, 0x12, 0x58].every((v) => (u.down(v) & 0x8000) !== 0)) return controlEnd(); // Ctrl+Alt+X
    if (Date.now() - c.last > 600000) return controlEnd('idle'); // 10 minutes without their input
    if (++c.tick % 20 === 0) controlState(c); // each second
  }, 50);
  return c;
}
ipcMain.handle('control', async (e, name) => {
  if (!fromSite(e)) return { ok: false };
  if (process.platform !== 'win32') return { ok: false, why: 'Only the Windows app can be controlled.' };
  if (control || asking || Date.now() - refusedAt < 15000) return { ok: false, why: 'They’re busy with another request. Try again in a bit.' };
  const s = chosen(await screens(false)), d = s && screen.getAllDisplays().find((x) => String(x.id) === s.display_id);
  if (!d) return { ok: false, why: 'Their screen couldn’t be found.' };
  let u;
  try { u = ctlUser32(); } catch (err) { console.error('remote control:', err); return { ok: false, why: 'Their app couldn’t start remote control.' }; }
  name = String(name || '').replace(/[\p{C}\s]+/gu, ' ').trim().slice(0, 24) || 'A friend'; // what they call themselves, on one line
  const ask = (asking = new AbortController());
  try {
    if (!win.isFocused()) {
      win.flashFrame(true);
      const n = Notification.isSupported() && new Notification({ title: 'Premade', body: `${name} wants to control your PC. Open Premade to answer.` });
      if (n) { n.on('click', () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }); n.show(); }
      await new Promise((go) => { const done = () => { win.off('focus', done); go(); }; win.on('focus', done); ask.signal.addEventListener('abort', done); });
      win.flashFrame(false);
      if (n) n.close();
    }
    const { response } = ask.signal.aborted ? { response: 0 } : await dialog.showMessageBox(win, {
      type: 'warning', title: 'Premade', buttons: ['Don’t allow', 'Allow'], defaultId: 0, cancelId: 0, noLink: true, signal: ask.signal,
      message: `${name} wants to control your PC`,
      detail: 'They’ll see your screen and move your mouse, click and type on it, like AnyDesk. Only allow someone you trust.\n\nStop it any time: Stop on the red bar at the top of your screen, or Ctrl+Alt+X.',
    });
    if (ask.signal.aborted) return { ok: false, why: 'They took it back.' }; // or they left: the page tells them nothing then
    if (response !== 1) { refusedAt = Date.now(); return { ok: false, why: 'They said no.' }; }
    if (control) return { ok: false, why: 'They’re busy with another request. Try again in a bit.' };
    controlStart(u, d, name);
    return { ok: true, source: s.id }; // the page shares this screen with them
  } finally { asking = null; }
});
ipcMain.on('control-stop', (e) => { if (fromSite(e)) controlEnd(); });
ipcMain.on('control-input', (e, m) => { if (fromSite(e) && control && m && typeof m === 'object') controlInput(control, m); });
// Electron 45's clipboard writes are promises: input after their paste waits for it, in order, so their V never pastes
// what was on your clipboard before
function controlInput(c, m) {
  const p = c.wait ? c.wait.then(() => { if (!c.ended) return controlInputNow(c, m); }) : controlInputNow(c, m);
  if (!p) return;
  const w = c.wait = p.catch(() => {}).then(() => { if (c.wait === w) c.wait = null; });
}
function controlInputNow(c, m) {
  c.last = Date.now();
  if (c.paused) return;
  if (m.k === 'clip') return typeof m.text === 'string' && clipboard.writeText(m.text.slice(0, 20000)).catch((e) => diag(`Remote help: couldn’t put their copied text on the clipboard (${e && e.message})`)); // their Ctrl+V: what they copied, then their V pastes it
  if (Number.isFinite(m.x) && Number.isFinite(m.y)) {
    const b = c.bounds, k = c.scale || 1, o = screen.dipToScreenPoint({ x: b.x, y: b.y }), f = (v) => Math.min(1, Math.max(0, v)); // that screen in real pixels, from its corner, on any DPI setup
    c.u.at(Math.round(o.x + f(m.x) * (b.width * k - 1)), Math.round(o.y + f(m.y) * (b.height * k - 1)));
  }
  const btn = Number.isInteger(m.b) && [2, 0x20, 8][m.b]; // left, middle and right's down flags
  if (m.k === 'd' && btn) { c.u.mouse(btn, 0, 0, 0, 0); c.buttons.add(btn); }
  if (m.k === 'u' && c.buttons.delete(btn)) c.u.mouse(btn * 2, 0, 0, 0, 0); // only one they pressed: not one you're holding
  if (m.k === 'w' && Number.isFinite(m.d)) c.u.mouse(0x800, 0, 0, Math.round(Math.min(1200, Math.max(-1200, m.d))), 0);
  const s = (m.k === 'kd' || (m.k === 'ku' && c.keys.delete(m.c))) && CTL_SCAN.get(m.c); // the same for keys
  if (!s) return;
  ctlKey(c.u, s, m.k === 'ku');
  if (m.k === 'kd') c.keys.add(m.c);
}

// ---- pointing (app 1.27, from AnyDesk's pointer and Whiteboard): a friend watching your whole-screen share points or
// draws on it, their dot and name and the line they drag fading out in 3 s, on a see-through window over that screen
// that every click goes through. It only draws, so it shows over games in Borderless too, where remote control can't
let marks = null;
const MARKS = `<!doctype html><body style="margin:0;overflow:hidden"><canvas></canvas><script>
const cv = document.querySelector('canvas'), g = cv.getContext('2d'), who = new Map(), C = ['#f2b630', '#4fc3f7', '#81c784', '#f06292', '#ba68c8', '#ff8a65'];
function mark(m) { // { x, y } as fractions of the screen, d while their button is down, who, c their colour
  const now = performance.now(), p = who.get(m.who) || { lines: [] };
  if (m.d && p.d) p.lines.push([p.x, p.y, m.x, m.y, now]);
  Object.assign(p, { x: m.x, y: m.y, d: m.d, at: now, c: C[m.c] || C[0] });
  who.set(m.who, p);
}
(function draw() {
  const k = devicePixelRatio, W = innerWidth, H = innerHeight, now = performance.now();
  if (cv.width !== W * k || cv.height !== H * k) { cv.width = W * k; cv.height = H * k; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round';
  for (const [name, p] of who) {
    p.lines = p.lines.filter((l) => now - l[4] < 3000);
    const a = 1 - (now - p.at) / 3000;
    if (a <= 0 && !p.lines.length) { who.delete(name); continue; }
    g.strokeStyle = p.c;
    g.lineWidth = 5;
    for (const l of p.lines) { g.globalAlpha = 1 - (now - l[4]) / 3000; g.beginPath(); g.moveTo(l[0] * W, l[1] * H); g.lineTo(l[2] * W, l[3] * H); g.stroke(); }
    if (a <= 0) continue;
    const x = p.x * W, y = p.y * H;
    g.globalAlpha = a;
    g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = p.c; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    g.font = "600 15px 'Segoe UI', sans-serif"; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(name, x + 14, y - 10); g.fillStyle = p.c; g.fillText(name, x + 14, y - 10);
  }
  requestAnimationFrame(draw);
})();
</script>`;
ipcMain.handle('point', (e, m) => { // '' shown, else why not
  if (!fromSite(e) || !m || typeof m !== 'object' || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return 'No.';
  const d = sharedDisplay();
  if (!d) return 'They need to share their whole screen, not one app, to see your pointer.';
  if (!marks || marks.isDestroyed()) {
    marks = new BrowserWindow({ show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, focusable: false, skipTaskbar: true,
      hasShadow: false, alwaysOnTop: true, webPreferences: { sandbox: true } });
    marks.setIgnoreMouseEvents(true);
    marks.setAlwaysOnTop(true, 'screen-saver');
    marks.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(MARKS));
  }
  const b = marks.getBounds();
  if (b.x !== d.bounds.x || b.y !== d.bounds.y || b.width !== d.bounds.width || b.height !== d.bounds.height) marks.setBounds(d.bounds);
  if (!marks.isVisible()) marks.showInactive();
  clearTimeout(marks.idle);
  marks.idle = setTimeout(() => { if (!marks.isDestroyed()) marks.hide(); }, 4000); // nothing left to draw
  const f = (v) => Math.min(1, Math.max(0, v)), who = String(m.who || '').replace(/[\p{C}\s]+/gu, ' ').trim().slice(0, 24) || 'A friend';
  if (!marks.webContents.isLoading()) marks.webContents.executeJavaScript(`mark(${JSON.stringify({ x: f(m.x), y: f(m.y), d: m.d === true, who, c: Math.abs(m.c | 0) % 6 })})`).catch(() => {});
  return '';
});

app.whenReady().then(async () => {
  const ses = session.defaultSession;
  ses.setDisplayMediaRequestHandler(async (req, done) => {
    const requestedId = captureSourceId;
    captureSourceId = '';
    const s = requestedId
      ? (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })).find((x) => x.id === requestedId)
      : chosen(await screens(false));
    const roomShare = shareAudioMode, filtered = shareAudioMode && shareAudioFiltered; // the room share asks for its sound mode just before
    shareAudioMode = false;
    shareAudioFiltered = false;
    filteredLeaveOut = filtered ? shareLeaveOut : [];
    shareLeaveOut = [];
    if (roomShare) { sharedSource = s || null; if (marks && !marks.isDestroyed()) marks.hide(); } // what pointing maps a friend's mouse onto: not a clip recording's, the augment cards' or the tracker's
    done(s ? { video: s, ...(req.audioRequested && process.platform === 'win32' && { audio: 'loopback' }) } : {}); // always loopback: the page swaps it for the filtered sound (no Premade, no Discord) once that starts, and keeps it if that fails
  });
  // only Premade's own pages get the mic, screens and the clipboard, as Discord gives them only to discord.com; a video
  // from a chat link (YouTube) may still go full screen
  ses.setPermissionRequestHandler((wc, perm, ok, d) => ok(perm === 'fullscreen' || (String(d && d.requestingUrl || wc.getURL()).startsWith(SITE) && ['media', 'display-capture', 'clipboard-sanitized-write', 'keyboardLock', 'fileSystem'].includes(perm)))); // keyboardLock: Remote help's Full screen sends the Windows key, Alt+Tab and Alt+F4 to the friend's PC // keyboardLock: Remote help's Full screen sends the Windows key, Alt+Tab and Alt+F4 to the friend's PC

  logLine(`Premade ${app.getVersion()} started${waiting ? ' with Windows' : ''}`);
  setTimeout(videosLeft, 15000); // not while the page loads
  const last = lastBounds();
  win = new BrowserWindow({
    width: 1180, height: 800, ...(last && { x: last.x, y: last.y, width: last.width, height: last.height }), minWidth: 420, minHeight: 480,
    title: 'Premade', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#010a13', webPreferences, show: !waiting,
  });
  if (last && last.max && !waiting) win.maximize();
  for (const ev of ['resize', 'move']) win.on(ev, saveBounds);
  // for the page's connection log (Settings, App) and the log file: the window going down and back, a part of the app
  // that ended (the GPU, audio or network process crashing, or killed) and what this PC is
  keepUp(win, () => base, 'window', true);
  win.on('minimize', () => diag(`window minimized, full speed for ${fullSpeed()} processes`));
  win.on('restore', () => diag('window restored'));
  app.on('child-process-gone', (e, d) => diag(`${d.name || d.type} process ended: ${d.reason}, exit code ${d.exitCode}`));
  setInterval(fullSpeed, 10000);
  if (process.platform === 'win32') setInterval(() => riotCheck(diag), 30000);
  if (app.isPackaged) app.setAsDefaultProtocolClient('lolprox');
  win.removeMenu();
  await moveSaved(ses); // once, from 1.16 (win first: closing the only window would quit)
  if (fs.existsSync(testFile())) base = SITE + 'test/';
  loadFresh(win, base);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SITE)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }; // the tracker page
    openOut(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SITE)) { e.preventDefault(); openOut(url); } });
  win.webContents.on('did-navigate', navigated);
  win.webContents.on('did-finish-load', () => { // a reloaded page hears it all again
    if (!win.webContents.getURL().startsWith(SITE)) return; // the can't-reach-Premade page
    controlEnd();
    if (marks && !marks.isDestroyed()) marks.hide();
    leagueWas = '';
    if (updateReady) win.webContents.send('update', updateReady);
    join(linkWaiting);
    linkWaiting = '';
    const cpu = os.cpus();
    diag(`${os.version()} ${os.release()}, ${cpu.length} threads of ${cpu[0] ? cpu[0].model.trim() : 'a CPU'}, ${powerMonitor.isOnBatteryPower() ? 'on battery' : 'plugged in'}, full speed for ${fullSpeed()} processes`);
  });
  win.on('closed', () => app.quit());
  app.on('second-instance', (e, argv) => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); join(linkRoom(argv)); });
  pollLeague();
  checkUpdates();
});
// a game video still open (the window closed mid-game) or being finished or cut is finished first, for up to 20 s; then
// the log's last lines
let quitWait = false;
app.on('will-quit', (e) => {
  globalShortcut.unregisterAll();
  saveTake();
  stopFilteredCapture();
  if ((vids.size || working.size) && !quitWait) {
    quitWait = true;
    e.preventDefault();
    Promise.race([Promise.all([...[...vids.keys()].map(vidEnd), ...working]), new Promise((res) => setTimeout(res, 20000))]).finally(() => app.quit());
    return;
  }
  logLine('quit');
  logFlush(true);
});

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

module.exports = { summary, vk, CTL_SCAN, controlInput, controlStart, ctlBlocked, lcuOk, linkRoom, hider, moveSaved, fetchTo, withRoom, seekable, logLine, logFlush }; // for client.test.js

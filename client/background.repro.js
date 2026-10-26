// Does Premade drop out of a room while its window is covered, minimized or not focused? Runs the real app
// (main.js, preload.js, the page from site/) and a friend (a plain page in a window of its own) in one room on a
// local PeerServer, both sharing a screen and watching the other's, then covers, minimizes and unfocuses Premade's
// window and logs what both pages see: every RTCPeerConnection's ICE state and who closed it, the room server's
// socket, timers that stall, and how much voice and video still flows each way.
//   PEER_MODULE=/abs/path/node_modules/peer npx electron --no-sandbox background.repro.js   (xvfb-run -a on Linux)
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { execFile } = require('child_process');
const { app, BrowserWindow } = require('electron');
const SITE = path.join(__dirname, '..', 'site');
const TYPES = { js: 'text/javascript', json: 'application/json', png: 'image/png', html: 'text/html', svg: 'image/svg+xml' };
http.createServer((q, r) => {
  const f = path.join(SITE, new URL(q.url, 'http://x').pathname.replace(/\/$/, '/index.html'));
  if (!f.startsWith(SITE) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(8083, '127.0.0.1');
require(process.env.PEER_MODULE || 'peer').PeerServer({ host: '127.0.0.1', port: 9000, path: '/' });

process.env.LPC_SITE = 'http://127.0.0.1:8083/';
process.env.LPC_OLD_SITE = process.env.LPC_SITE;
process.env.LPC_LEAGUE = 'https://127.0.0.1:9'; // no League
app.commandLine.appendSwitch('use-fake-device-for-media-stream'); // fake mics
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-bg-'));
require('./main.js');
app.setPath('userData', path.join(tmp, 'profile'));
app.setPath('videos', path.join(tmp, 'Videos'));

const PAGE = process.env.LPC_SITE + 'index.html?peer=127.0.0.1:9000&debug';
const ROOM = 'bgtest';
const SECS = (n) => +(process.env.FAST ? Math.ceil(n / 6) : n) * 1000;
// In each page before it joins: wraps RTCPeerConnection and WebSocket to log their states and who closed them,
// and counts what flows (__flow) and how the page's timers and frames keep up (__probe)
const INSTRUMENT = `(() => {
  const log = window.__log = [], t0 = Date.now(), pcs = [];
  const L = (...a) => { log.push([((Date.now() - t0) / 1000).toFixed(1), ...a]); };
  const who = () => new Error().stack.split('\\n').slice(3, 8).map((s) => s.trim().replace(/^at /, '').replace(/\\(?https?:[^)]*\\/([^/)]*)\\)?/, '$1')).join(' < ');
  const PC = window.RTCPeerConnection;
  let n = 0;
  window.RTCPeerConnection = class extends PC {
    constructor(...a) {
      super(...a);
      const id = ++n;
      this.__id = id;
      pcs.push(this);
      L('pc' + id, 'new');
      this.addEventListener('iceconnectionstatechange', () => L('pc' + id, 'ice', this.iceConnectionState));
      this.addEventListener('connectionstatechange', () => L('pc' + id, 'conn', this.connectionState));
    }
    close() { if (this.connectionState !== 'closed') L('pc' + this.__id, 'close()', who()); return super.close(); }
  };
  const WS = window.WebSocket;
  window.WebSocket = class extends WS {
    constructor(...a) {
      super(...a);
      L('ws', 'new');
      this.addEventListener('open', () => L('ws', 'open'));
      this.addEventListener('close', (e) => L('ws', 'closed', e.code, e.reason, e.wasClean));
      this.addEventListener('error', () => L('ws', 'error'));
    }
    close(...a) { L('ws', 'close()', ...a, who()); return super.close(...a); }
  };
  let last = performance.now(), gap = 0, frames = 0;
  setInterval(() => { const now = performance.now(), g = now - last; last = now; gap = Math.max(gap, g); if (g > 1500) L('timers stalled', Math.round(g) + ' ms'); }, 250);
  (function f() { frames++; requestAnimationFrame(f); })();
  document.addEventListener('visibilitychange', () => L('visibility', document.visibilityState));
  addEventListener('blur', () => L('blur'));
  addEventListener('focus', () => L('focus'));
  window.__probe = () => { const r = { vis: document.visibilityState[0], gap: Math.round(gap), raf: frames }; gap = 0; frames = 0; return r; };
  let was = {};
  window.__flow = async () => {
    const now = { ai: 0, ao: 0, vi: 0, vo: 0, fd: 0, fe: 0 };
    for (const pc of pcs) if (pc.connectionState !== 'closed') (await pc.getStats()).forEach((r) => {
      if (r.type === 'inbound-rtp') { now[r.kind === 'audio' ? 'ai' : 'vi'] += r.bytesReceived || 0; if (r.kind === 'video') now.fd += r.framesDecoded || 0; }
      if (r.type === 'outbound-rtp') { now[r.kind === 'audio' ? 'ao' : 'vo'] += r.bytesSent || 0; if (r.kind === 'video') now.fe += r.framesEncoded || 0; }
    });
    const d = {};
    for (const k in now) d[k] = Math.max(0, now[k] - (was[k] || 0));
    was = now;
    return { kbps: [d.ai, d.ao, d.vi, d.vo].map((b) => Math.round((b * 8) / 2000)), fps: [d.fd / 2, d.fe / 2], pcs: pcs.filter((p) => p.connectionState !== 'closed').length };
  };
})()`;
// what each sample reads: kbps = [audio in, audio out, video in, video out] over the last 2 s, fps = [decoded, encoded]
const SAMPLE = `(async () => JSON.stringify({ p: __probe(), f: await __flow(), peers: lpc.peers().map((x) => [x.name, x.conns, x.call ? 'call' : 'nocall', x.live ? 'live' : 'dead'].join(':')),
  lends: lpc.lends(), seen: lpc.seen().map((s) => [s.name, s.call ? 'call' : 'nocall', s.video, 'r' + s.restarts].join(':')), sb: document.getElementById('sbServer').textContent,
  msg: document.getElementById('msg').textContent, log: __log.splice(0) }))()`;
const ask = (wc, code) => Promise.race([wc.executeJavaScript(code, true), new Promise((r) => setTimeout(r, 5000, null))]).catch((e) => 'ERR ' + e.message);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitLoad = (wc) => new Promise((r) => wc.once('did-finish-load', r));
async function open(wc, name) {
  await ask(wc, `localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-name', ${JSON.stringify(name)}); 1`);
  const loaded = waitLoad(wc);
  wc.loadURL(PAGE);
  await loaded;
  await ask(wc, INSTRUMENT + '; 1');
}
const join = (wc) => ask(wc, `document.querySelectorAll('dialog[open]').forEach((d) => d.close()); document.getElementById('code').value = '${ROOM}'; document.getElementById('joinForm').requestSubmit(); 1`);
// the friend's screen: a canvas painted 15 times a second, as voice.e2e.js does
const FRIEND_SCREEN = `(() => { const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d'); let n = 0;
  setInterval(() => { g.fillStyle = 'hsl(' + (n++ * 7 % 360) + ',60%,40%)'; g.fillRect(0, 0, 1280, 720); g.fillStyle = '#fff'; g.font = '80px sans-serif'; g.fillText(String(n), 100, 200); }, 66);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(15); document.getElementById('shareBtn').click(); 1 })()`;

const results = [];
let phase = 'joining';
const say = (line) => { console.log(line); if (process.env.REPRO_LOG) fs.appendFileSync(process.env.REPRO_LOG, line + '\n'); };
async function sampleLoop(win, friend) {
  for (;;) {
    const t = new Date().toISOString().slice(11, 19);
    for (const [who, wc] of [['premade', win.webContents], ['friend', friend.webContents]]) {
      const s = await ask(wc, SAMPLE);
      if (!s || s.startsWith('ERR')) { say(`${t} ${phase} ${who} NO ANSWER ${s || ''}`); results.push({ phase, who, none: true }); continue; }
      const d = JSON.parse(s);
      for (const l of d.log) say(`${t} ${phase} ${who} LOG ${l.join(' ')}`);
      say(`${t} ${phase} ${who} vis=${d.p.vis} gap=${d.p.gap} raf=${d.p.raf} kbps=${d.f.kbps} fps=${d.f.fps} pcs=${d.f.pcs} peers=${d.peers} lends=${d.lends} seen=${d.seen} sb="${d.sb}"${d.msg ? ` msg="${d.msg}"` : ''}`);
      results.push({ phase, who, ...d });
    }
    await sleep(2000);
  }
}
function summary() {
  const phases = [...new Set(results.map((r) => r.phase))];
  say('\n==== summary (kbps: audio in, audio out, video in, video out) ====');
  for (const ph of phases) for (const who of ['premade', 'friend']) {
    const rs = results.filter((r) => r.phase === ph && r.who === who), ok = rs.filter((r) => !r.none);
    const logs = ok.flatMap((r) => r.log).filter((l) => /close|closed|disconnected|failed|stalled|error/.test(l.join(' ')) && !/:3365:/.test(l.join(' '))); // not dial()'s 10 s for an empty slot
    const minK = [0, 1, 2, 3].map((i) => Math.min(...ok.map((r) => r.f.kbps[i])));
    const lost = ok.filter((r) => !r.peers.some((p) => p.endsWith(':call:live'))).length;
    say(`${ph.padEnd(12)} ${who.padEnd(8)} samples=${rs.length} noAnswer=${rs.length - ok.length} minKbps=${minK} noVoiceSamples=${lost} maxGap=${Math.max(0, ...ok.map((r) => r.p.gap))}ms vis=${[...new Set(ok.map((r) => r.p.vis))].join('')} raf/2s=${Math.min(...ok.map((r) => r.p.raf))}-${Math.max(...ok.map((r) => r.p.raf))}`);
    for (const l of logs) say(`    ${l.join(' ')}`);
  }
}

app.once('browser-window-created', (e, win) => win.webContents.once('did-finish-load', async () => {
  try {
    await sleep(500);
    win.setBounds({ x: 0, y: 0, width: 600, height: 700 });
    await open(win.webContents, 'Premade');
    const friend = new BrowserWindow({ x: 610, y: 0, width: 420, height: 700, webPreferences: { partition: 'friend' } });
    const first = waitLoad(friend.webContents);
    friend.loadURL(PAGE);
    await first;
    await open(friend.webContents, 'Friend');
    await join(win.webContents);
    await sleep(3000);
    await join(friend.webContents);
    await sleep(3000);
    await ask(friend.webContents, FRIEND_SCREEN);
    sampleLoop(win, friend);
    await sleep(SECS(40));
    const step = async (name, secs, start, end) => { phase = name; say(`\n---- ${name} for ${secs} s ----`); await start(); await sleep(SECS(secs)); if (end) await end(); };
    await step('front', 30, () => { win.focus(); });
    let cover = null;
    await step('covered', 120, () => { cover = new BrowserWindow({ ...win.getBounds(), backgroundColor: '#777777' }); cover.loadURL('data:text/html,<body style="background:#777">cover</body>'); cover.focus(); }, () => cover.destroy());
    await step('front2', 20, () => { win.focus(); });
    await step('minimized', 150, () => win.minimize(), () => win.restore());
    await step('restored', 30, () => { win.focus(); });
    await step('unfocused', 60, () => friend.focus());
    if (process.platform === 'win32') {
      await step('notepad', 120, () => { execFile('cmd.exe', ['/c', 'start', '/max', 'notepad.exe']); }, () => { execFile('taskkill.exe', ['/im', 'notepad.exe', '/f']); });
      await step('front3', 20, () => { win.focus(); });
    }
    phase = 'done';
    await sleep(2500);
    summary();
  } catch (err) { console.error('repro failed:', err); process.exitCode = 1; }
  app.exit(process.exitCode || 0);
}));

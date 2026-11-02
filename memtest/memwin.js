// electron memwin.js: the real client/main.js on the local site (serve.js), joins ROOM and logs each process's memory
// (Windows private bytes and working set, MB) every STEP s with which window it belongs to. Env: MINS, STEP, OPTS (JSON
// merged into lpc-opts), ROOM, HIDE=1 (minimize the window), OUT
const { app, BrowserWindow, webContents } = require('electron'), fs = require('fs'), path = require('path');
process.env.LPC_SITE = 'http://127.0.0.1:8090/';
process.env.LPC_OLD_SITE = process.env.LPC_SITE;
process.env.LPC_LEAGUE = 'https://127.0.0.1:9';
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
const mins = +process.env.MINS || 8, step = +(process.env.STEP || 30), extra = JSON.parse(process.env.OPTS || '{}'), ROOM = process.env.ROOM || 'memtest';
const OUT = process.env.OUT || __dirname;
require('../client/main.js');
const log = (...a) => { const l = a.join(' ') + '\n'; fs.appendFileSync(path.join(OUT, 'log.txt'), l); process.stdout.write(l); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win; while (!(win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(process.env.LPC_SITE) && !/overlay/.test(w.webContents.getURL())))) await sleep(500);
  await sleep(3000);
  await win.webContents.executeJavaScript(`(() => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', 'Rayan'); localStorage.setItem('lpc-news', '9999');
    const o = JSON.parse(localStorage.getItem('lpc-opts') || '{}'); Object.assign(o, { autoShare: false }, ${JSON.stringify(extra)}); localStorage.setItem('lpc-opts', JSON.stringify(o)); })()`);
  win.loadURL(process.env.LPC_SITE + 'index.html?peer=127.0.0.1:9100&debug').catch((e) => log('load:', e.message));
  await new Promise((r) => win.webContents.once('dom-ready', r));
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2 && !/favicon|ERR_|404|Security|unsafe/.test(msg)) log('[page]', msg.slice(0, 200)); });
  await sleep(5000);
  await win.webContents.executeJavaScript(`(() => { document.getElementById('code').value = ${JSON.stringify(ROOM)}; document.getElementById('joinForm').requestSubmit(); })()`);
  const probe = `JSON.stringify((() => { try { return { slot: lpc.slot(), peers: lpc.peers().map((p) => p.name + (p.live ? '+' : '-')), seen: lpc.seen().length, lends: lpc.lends().length, vids: document.querySelectorAll('video').length, heap: Math.round(performance.memory.usedJSHeapSize / 1048576) }; } catch (e) { return e.message; } })())`;
  if (process.env.HIDE) setTimeout(() => { win.minimize(); log('minimized'); }, 30000);
  const t0 = Date.now();
  const tick = async () => {
    const t = Math.round((Date.now() - t0) / 1000), who = {};
    for (const w of webContents.getAllWebContents()) who[w.getOSProcessId()] = (w.getURL().split('/').pop() || w.getURL()).slice(0, 20);
    const ms = app.getAppMetrics(), mb = (k) => Math.round(k / 1024);
    const row = ms.map((p) => `${p.type === 'Utility' ? (p.serviceName || p.name || 'util').split('.').pop() : p.type}${who[p.pid] ? '(' + who[p.pid] + ')' : ''}=${mb(p.memory.privateBytes || 0)}/${mb(p.memory.workingSetSize)}`).join(' ');
    const tot = ms.reduce((n, p) => n + (p.memory.privateBytes || 0), 0);
    log(`t=${t}s private=${mb(tot)}MB ${row} ${await win.webContents.executeJavaScript(probe).catch(() => 'x')}`);
    if (t > mins * 60) app.exit(0);
  };
  tick(); setInterval(tick, step * 1000);
});

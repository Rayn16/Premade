// electron src.js: desktopCapturer.getSources for screens and windows with thumbnails, as the Aion 2 window lookup does
// every 30 s (here every EVERY ms), with a few windows open; each process's private MB every 30 s. THUMB=0: no thumbnails.
const { app, BrowserWindow, desktopCapturer } = require('electron'), fs = require('fs'), path = require('path');
const THUMB = process.env.THUMB !== '0', EVERY = +process.env.EVERY || 3000, MINS = +process.env.MINS || 4, OUT = process.env.OUT || __dirname;
const log = (l) => { fs.appendFileSync(path.join(OUT, `src-${THUMB ? 'thumb' : 'nothumb'}.txt`), l + '\n'); console.log(l); };
app.whenReady().then(() => {
  for (let i = 0; i < 8; i++) new BrowserWindow({ width: 500, height: 400, x: i * 80, y: i * 50, title: 'win ' + i }).loadURL(`data:text/html,<body style="background:hsl(${i * 45},70%,50%)"><h1>window ${i}</h1>`);
  let calls = 0;
  setInterval(async () => { const l = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: THUMB ? { width: 280, height: 158 } : { width: 0, height: 0 } }); l.forEach((s) => THUMB && s.thumbnail.toDataURL()); calls++; }, EVERY);
  const t0 = Date.now();
  const tick = () => {
    const t = Math.round((Date.now() - t0) / 1000);
    log(`${THUMB ? 'thumb' : 'nothumb'} t=${t}s calls=${calls} ` + app.getAppMetrics().map((p) => `${p.type}=${Math.round((p.memory.privateBytes || 0) / 1024)}`).join(' '));
    if (t > MINS * 60) app.exit(0);
  };
  tick(); setInterval(tick, 30000);
});

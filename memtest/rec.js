// electron rec.js: Clip anywhere's recording of a real screen (a moving full-screen window gives the encoder work),
// logging each process's private MB every 30 s. RING: app (each second's Blob read into bytes, kept 45 s, as the app
// does) | drop (Blobs not kept) | none (capture only). MINS minutes, 1080p 30 fps at 8.4 Mbps like Clip anywhere's default.
const { app, BrowserWindow, desktopCapturer, session } = require('electron'), fs = require('fs'), path = require('path');
const RING = process.env.RING || 'app', MINS = +process.env.MINS || 4, OUT = process.env.OUT || __dirname;
const log = (l) => { fs.appendFileSync(path.join(OUT, `rec-${RING}.txt`), l + '\n'); console.log(l); };
app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler(async (req, done) => done({ video: (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }))[0] }));
  fs.writeFileSync(path.join(OUT, 'busy.html'), `<canvas id=c width=1920 height=1080 style="width:100vw;height:100vh;display:block"></canvas><script>const g=c.getContext('2d');let t=0;(function f(){t++;for(let i=0;i<400;i++){g.fillStyle='hsl('+((i*37+t*7)%360)+',80%,'+(30+(i*13+t)%40)+'%)';g.fillRect(Math.random()*1900,Math.random()*1060,40,40)}requestAnimationFrame(f)})()</script>`);
  const busy = new BrowserWindow({ fullscreen: true, show: true }); busy.loadFile(path.join(OUT, 'busy.html'));
  fs.writeFileSync(path.join(OUT, 'rec.html'), '<p>rec</p>');
  const win = new BrowserWindow({ width: 300, height: 200, show: true });
  await win.loadFile(path.join(OUT, 'rec.html'));
  await new Promise((r) => setTimeout(r, 3000));
  await win.webContents.executeJavaScript(`(async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 30, max: 30 } } });
    window.bytes = 0;
    if ('${RING}' === 'none') return;
    const mime = ['video/webm;codecs=h264', 'video/webm;codecs=vp8'].find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 8.4e6, videoKeyFrameIntervalDuration: 2000 }), ring = [];
    mr.ondataavailable = (e) => {
      window.bytes += e.data.size;
      if ('${RING}' !== 'app') return;
      const p = { at: performance.now(), b: e.data }; ring.push(p); e.data.arrayBuffer().then((a) => { p.b = new Uint8Array(a); });
      const most = 60 * 8.4e6 / 4, size = (q) => q.b.size || q.b.length; let n = ring.reduce((t, q) => t + size(q), 0);
      while (ring.length && (performance.now() - ring[0].at > 60000 || n > most)) n -= size(ring.shift());
    };
    mr.start(1000);
  })()`).catch((e) => log('failed: ' + e.message));
  const t0 = Date.now();
  const tick = async () => {
    const t = Math.round((Date.now() - t0) / 1000), mb = (k) => Math.round(k / 1024), b = await win.webContents.executeJavaScript('window.bytes').catch(() => 0);
    log(`${RING} t=${t}s ` + app.getAppMetrics().map((p) => `${p.type === 'Utility' ? (p.serviceName || '').split('.').pop() : p.type}=${mb(p.memory.privateBytes || 0)}`).join(' ') + ` rec=${(b / 1048576 / Math.max(t, 1)).toFixed(2)}MB/s`);
    if (t > MINS * 60) app.exit(0);
  };
  tick(); setInterval(tick, 30000);
});

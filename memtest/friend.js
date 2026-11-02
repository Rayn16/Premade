// a friend in ROOM on the local server (serve.js), in Chromium with a fake mic. SHARE=1: shares a busy 1080p 30 fps
// canvas as their screen (Rayan's app watches it); WATCH=0: hides Rayan's screen instead of watching it.
const { chromium } = require('playwright');
const ROOM = process.env.ROOM || 'memtest', SHARE = process.env.SHARE === '1', WATCH = process.env.WATCH !== '0', NAME = process.env.NAME || 'Friend';
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await c.addInitScript(([name, share, watch]) => {
    localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', name); localStorage.setItem('lpc-news', '9999');
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, autoShare: share, roomScreen: watch, clips: false }));
    if (!watch) localStorage.setItem('lpc-screens-hidden', JSON.stringify(['Rayan']));
    const on = {};
    window.lpcClient = { version: '1.28.7', screens: async () => [{ id: 'screen:1:0', main: true }], captureSource: async () => true, useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {},
      on(n, fn) { (on[n] = on[n] || []).push(fn); }, emit(n, v) { for (const fn of on[n] || []) fn(v); } };
    const cv = document.createElement('canvas'), g = cv.getContext('2d'); cv.width = 1920; cv.height = 1080; let t = 0;
    setInterval(() => { t++; g.fillStyle = `hsl(${t % 360},40%,25%)`; g.fillRect(0, 0, 1920, 1080); for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${(i * 37 + t) % 360},70%,50%)`; g.fillRect((i * 97 + t * 5) % 1920, (i * 53 + t * 3) % 1080, 80, 80); } g.fillStyle = '#fff'; g.font = '40px monospace'; g.fillText(new Date().toISOString(), 50, 1000); }, 33);
    navigator.mediaDevices.getDisplayMedia = async (q) => { const s = cv.captureStream(30); if (q && q.audio) { const a = new AudioContext(), d = a.createMediaStreamDestination(), o = a.createOscillator(); o.frequency.value = 220; o.connect(d); o.start(); s.addTrack(d.stream.getAudioTracks()[0]); } return s; };
  }, [NAME, SHARE, WATCH]);
  await c.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ body: require('fs').readFileSync(require.resolve('peerjs/dist/peerjs.min.js')), headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await c.route('https://ddragon.leagueoflegends.com/**', async (r) => r.fulfill({ response: await c.request.get('http://127.0.0.1:8090/__dd/' + r.request().url().replace(/^https:\/\/ddragon[^/]+\//, '')) }));
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('[friend] page error:', e.message));
  await p.goto('http://127.0.0.1:8090/index.html?peer=127.0.0.1:9100&debug');
  await p.waitForTimeout(3000);
  await p.evaluate((room) => { document.getElementById('code').value = room; document.getElementById('joinForm').requestSubmit(); }, ROOM);
  setInterval(async () => console.log('[friend]', await p.evaluate(() => JSON.stringify({ room: lpc.room(), slot: lpc.slot(), msg: document.getElementById("msg").textContent.slice(0,80), peers: lpc.peers().map((x) => [x.name, x.live]), seen: lpc.seen().length, lends: lpc.lends().length })).catch((e) => e.message)), 60000);
})();

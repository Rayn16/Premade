// Checks under `wrangler dev` that two pages in a room stop dialling the 8 empty slots: with ROOM {ids} from the room
// server, a page dials only the slots that are taken, so once both are connected their sockets send our server nothing
// but heartbeats (answered without waking the room). Prints the messages each page sent in each part of the run.
// Measuring (numbers in the patch note): SITE=<a site folder> WORKER=<a server folder> SECS=240 compare pages and servers.
// WRANGLER=<path to wrangler> NODE_PATH=<folder with ws, peerjs and playwright> node dial.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = 8792, WEB = 8793, SECS = +process.env.SECS || 90;
const SITE = path.resolve(process.env.SITE || path.join(__dirname, '../site'));
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-dial-'));
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist], { cwd: process.env.WORKER || __dirname, detached: true, stdio: 'ignore' });
const web = http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(WEB, '127.0.0.1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = `http://127.0.0.1:${WEB}/index.html?peer=127.0.0.1:${PORT}&debug`;

// counts what the page's sockets to our room server send, by type (the heartbeat apart)
function count() {
  window.sent = {};
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    if (/\/peerjs\?/.test(this.url)) { let t = '?'; try { t = JSON.parse(d).type; } catch {} if (t !== 'HEARTBEAT') window.sent[t] = (window.sent[t] || 0) + 1; }
    return send.call(this, d);
  };
}
async function player(browser, name) {
  const ctx = await browser.newContext();
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|ddragon\.leagueoflegends\.com|workers\.dev/, (r) => r.abort());
  await ctx.addInitScript((n) => { localStorage.setItem('lpc-setup', '1'); localStorage.setItem('lpc-name', n); localStorage.setItem('lpc-news', '9999'); localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, autoShare: false, hello: false })); }, name);
  await ctx.addInitScript(count);
  return ctx.newPage();
}
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const ana = await player(browser, 'Ana'), ben = await player(browser, 'Ben');
    await ana.goto(`${URL_}#dialt`);
    await ana.click('#joinBtn');
    await ana.waitForFunction(() => window.lpc && lpc.slot() >= 0, null, { timeout: 20000 });
    await ben.goto(`${URL_}#dialt`);
    await ben.click('#joinBtn');
    for (const p of [ana, ben]) await p.waitForFunction(() => lpc.peers().length === 1 && lpc.peers().every((x) => x.conns > 0), null, { timeout: 30000 });
    const at = Date.now(), marks = [];
    for (const s of [30, 60, 120, 180, 240, 300].filter((x) => x <= SECS).concat(SECS).filter((x, i, a) => a.indexOf(x) === i)) {
      await sleep(at + s * 1000 - Date.now());
      marks.push([s, await ana.evaluate(() => ({ ...window.sent })), await ben.evaluate(() => ({ ...window.sent }))]);
    }
    let was = [0, 0, 0];
    for (const [s, a, b] of marks) {
      console.log(`after ${s} s: Ana sent ${total(a)} (${JSON.stringify(a)}), Ben ${total(b)} (${JSON.stringify(b)}); ${total(a) + total(b) - was[1] - was[2]} in the last ${s - was[0]} s`);
      was = [s, total(a), total(b)];
    }
    if (!process.env.WORKER && !process.env.SITE) { // this page and this server: nothing once both are in, past the first 30 s
      const [, a30, b30] = marks[0], [, a, b] = marks[marks.length - 1];
      assert.equal(total(a) + total(b) - total(a30) - total(b30), 0, 'no dialling of empty slots');
      assert(await ana.evaluate(() => lpc.peers().every((x) => x.conns > 0)), 'still connected');
    }
    console.log('dial ok');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { web.close(); try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

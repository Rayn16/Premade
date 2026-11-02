// the site from SITE_DIR on 127.0.0.1:8090 and a local PeerServer on 9100, like the e2e suites
const fs = require('fs'), path = require('path'), http = require('http');
const { PeerServer } = require('peer');
const SITE = process.env.SITE_DIR || require('path').join(__dirname, '..', 'site');
const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml', '.gz': 'application/octet-stream' };
PeerServer({ host: '127.0.0.1', port: 9100, path: '/' });
http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/__peerjs.min.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }); return res.end(fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'))); }
  if (p.startsWith('/__dd/')) return ddragon(p.slice(6), res);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(8090, '127.0.0.1');
console.log('serving', SITE);
// Data Dragon is out of reach here: a small stand-in (versions, champion.json with 170 champions, empty item/runes, a 1px picture)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
function ddragon(u, res) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const json = (j) => { res.writeHead(200, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(j)); };
  if (u.endsWith('versions.json')) return json(['15.21.1', '15.20.1']);
  if (u.endsWith('champion.json')) return json({ data: Object.fromEntries(Array.from({ length: 170 }, (_, i) => ['Champ' + i, { id: 'Champ' + i, key: String(i + 1), name: 'Champ ' + i, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 }, image: { full: 'Champ' + i + '.png' } }])) });
  if (u.endsWith('.json')) return json({ data: {} });
  res.writeHead(200, { 'Content-Type': 'image/png', ...cors }); res.end(PNG);
}

// RE4 co-op app link: the host's Premade listens on its tunnel address (10.66.0.1, TCP 39100) and each friend's dials
// it. Every 2 s each side sends one line: which co-op mod is in, its version, the game's Steam build and whether RE4 is
// running, plus a ping the other side answers at once. Quiet for 6 s means offline. Nothing here faces the internet:
// only the private link reaches 10.66.0.1, and Set up's firewall rule lets only 10.66.0.x in.
const net = require('net');
const PORT = 39100, HOST = '10.66.0.1';
let role = 'none', me = {}, server = null, dialing = false;
const socks = new Set(), peers = new Map();
const ipOf = (sock) => String(sock.remoteAddress || '').replace(/^::ffff:/, '');
const str = (v) => (typeof v === 'string' ? v.slice(0, 40) : '');

function attach(sock) {
  socks.add(sock);
  sock.setEncoding('utf8');
  sock.setNoDelay(true);
  const ip = ipOf(sock);
  let buf = '';
  sock.on('data', (d) => {
    buf += d;
    if (buf.length > 65536) return sock.destroy();
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      let m;
      try { m = JSON.parse(buf.slice(0, i)); } catch { m = null; }
      buf = buf.slice(i + 1);
      if (!m || typeof m !== 'object') continue;
      const p = peers.get(ip) || {};
      if (typeof m.ping === 'number') sock.write(JSON.stringify({ pong: m.ping }) + '\n');
      if (typeof m.pong === 'number') p.ms = Math.max(0, Date.now() - m.pong);
      if (m.me && typeof m.me === 'object') Object.assign(p, { mod: str(m.me.mod), modVersion: str(m.me.modVersion), build: str(m.me.build), running: m.me.running === true });
      p.seen = Date.now();
      peers.set(ip, p);
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => socks.delete(sock));
}

function stop() {
  for (const s of socks) s.destroy();
  if (server) server.close();
  server = null;
  peers.clear();
}

setInterval(() => {
  const line = JSON.stringify({ me, ping: Date.now() }) + '\n';
  for (const s of socks) s.write(line);
  if (role === 'friend' && !socks.size && !dialing) {
    dialing = true;
    const s = net.connect({ host: HOST, port: PORT, timeout: 5000 });
    s.once('connect', () => { s.setTimeout(0); attach(s); });
    s.once('timeout', () => s.destroy());
    s.once('close', () => { dialing = false; });
    s.on('error', () => {});
  }
  if (role === 'host' && !server) {
    server = net.createServer((c) => (ipOf(c).startsWith('10.66.0.') ? attach(c) : c.destroy()));
    server.on('error', () => { server = null; }); // the tunnel isn't up yet: tried again in 2 s
    server.listen(PORT, HOST);
  }
}, 2000).unref();

// Called with each answer of re4-helper.exe: says which side this PC is and what to tell the others, and adds who is
// online (with their ping, mod and game build) to the answer as "peers".
function update(s) {
  if (!s || !s.role) return s;
  if (s.role !== role) { stop(); role = s.role; }
  me = { mod: s.mod, modVersion: s.modVersion || '', build: s.build || '', running: !!s.running };
  s.peers = [...peers].map(([ip, p]) => ({ ip, ...p, online: Date.now() - p.seen < 6000 }));
  return s;
}

module.exports = { update, PORT };

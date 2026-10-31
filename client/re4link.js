// RE4 co-op app link: the host's Premade listens on its Tailscale address (TCP 39100) and each friend's dials it. Every
// 2 s each side sends one line: the friend's name, which co-op mod is in, its version, the game's Steam build and
// whether RE4 is running, plus a ping the other side answers at once. Quiet for 6 s means offline. Nothing here faces
// the internet: only Tailscale reaches that address, and Set up's firewall rule lets only Tailscale addresses in.
const net = require('net');
const PORT = 39100;
let role = 'none', myIp = '', hostIp = '', me = {}, server = null, dialing = false;
const tailscale = (ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(ip);
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
      if (m.me && typeof m.me === 'object') Object.assign(p, { name: str(m.me.name), mod: str(m.me.mod), modVersion: str(m.me.modVersion), build: str(m.me.build), running: m.me.running === true });
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
  if (role === 'friend' && hostIp && !socks.size && !dialing) {
    dialing = true;
    const s = net.connect({ host: hostIp, port: PORT, timeout: 5000 });
    s.once('connect', () => { s.setTimeout(0); attach(s); });
    s.once('timeout', () => s.destroy());
    s.once('close', () => { dialing = false; });
    s.on('error', () => {});
  }
  if (role === 'host' && myIp && !server) {
    // its own address too, for the Windows smoke check's host and friend in one process
    server = net.createServer((c) => (tailscale(ipOf(c)) || ipOf(c) === myIp ? attach(c) : c.destroy()));
    server.on('error', () => { server = null; }); // Tailscale isn't up yet: tried again in 2 s
    server.listen(PORT, myIp);
  }
}, 2000).unref();

// Called with each answer of re4-helper.exe: says which side this PC is and what to tell the others, and adds who is
// online (with their ping, mod and game build) to the answer as "peers".
function update(s) {
  if (!s || !s.role) return s;
  if (s.role !== role || (s.tunnelIp || '') !== myIp || (s.hostIp || '') !== hostIp) { stop(); role = s.role; myIp = s.tunnelIp || ''; hostIp = s.hostIp || ''; }
  me = { name: s.myName || '', mod: s.mod, modVersion: s.modVersion || '', build: s.build || '', running: !!s.running };
  s.peers = [...peers].map(([ip, p]) => ({ ip, ...p, online: Date.now() - p.seen < 6000 }));
  return s;
}

module.exports = { update, PORT };

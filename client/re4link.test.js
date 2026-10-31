// The RE4 co-op app link: a host and a friend copy of re4link.js in one process, over this PC's own address (no
// Tailscale on a test PC). Each should see the other online, with a ping, the other's mod and the friend's name.
const path = require('path');
const host = require('./re4link');
delete require.cache[path.join(__dirname, 're4link.js')];
const friend = require('./re4link');
const look = () => [host.update({ role: 'host', tunnelIp: '127.0.0.1', mod: 'theirs', build: '1', running: false }),
  friend.update({ role: 'friend', hostIp: '127.0.0.1', myName: 'Test friend', mod: 'ours', modVersion: '0.6', build: '1', running: true })];
look();
const t = setInterval(() => {
  const [h, f] = look();
  const hp = h.peers.find((p) => p.online && p.ms != null), fp = f.peers.find((p) => p.online && p.ms != null);
  if (hp && fp && hp.mod === 'ours' && hp.running && hp.name === 'Test friend' && fp.mod === 'theirs') { console.log('app link:', JSON.stringify(h.peers), JSON.stringify(f.peers)); process.exit(0); }
}, 500);
setTimeout(() => { clearInterval(t); console.error('app link: the two sides never saw each other', JSON.stringify(look().map((s) => s.peers))); process.exit(1); }, 20000);

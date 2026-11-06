// Aion 2 live fight (Aion 2 page, off until you turn it on): damage, DPS and the boss's HP while you fight, read from
// the game's own traffic as it reaches this PC, the way Abyss DPS Meter does. Npcap (C:\Windows\System32\Npcap) hands
// the packets over; nothing touches the game, but NC's rules can ban for "unauthorized programs", which the page says.
//
// The format, from the Abyss DPS Meter analysis (Documents\rea) and checked on real games: the server's TCP stream is a
// row of frames [varint length][u16 opcode][length - 6 bytes]; opcode 0xFFFF is a bundle (u32 size, then an LZ4 block
// holding more frames). The frames read here:
//   0x3804 damage: varint target, u16 flags (4 = damage), varint source, u32 skill, u8, [u32 if flags & 1], u8 type
//          (3 crit, 9 reflected), [if flags & 2: u8 bits, varint heal, u8 direction], u32, u32, varint, varint damage
//   0x8D00 HP: varint entity, varint 2, varint, varint, u64 HP
//   0x3645 a character in view, 0x3633 your own: varint entity, 5 bytes, u8 length, name
//   0x8A33 not a name: a player's title or legion as a string (seen in a dungeon: "Legend" for two players, "HunLords")
//   0x3805 damage over time: varint target, u8 0x0A, varint source, varint, u32 skill, varint damage
//   0x3641 a mob or summon in view: varint entity ... 8 x 0xFF, 8 bytes, varint owner (itself for a mob)
//   0x9702 your party: per member u16 server, u8 length, name, u32 class, u32 level, u32 item level (a party title,
//          if any, comes first as a plain length-prefixed string)
//   0x610B entry tickets, at login: varint count, then per ticket u8 mask, u32 ticket, [u64 if mask & 1],
//          [u64 if mask & 2], [varint left if mask & 4], [varint bought/charged if mask & 8] (Abyss's decoder; checked on a real login: Odyle 10 (+320))
//   0x610C one ticket changed: u8, varint ticket, u32, varint max, varint left (seen: Nightmare 2 of 14)
//   0x9101 the map's field boss list for your zone, every ~3 s while the map is open (never with it closed): u16, u32
//          world, u8 count, then per boss u8 up, varint id, [f32 x, y, z if up], [a byte at times], u64 ms (dead: when it
//          respawns; up: when it spawned, or 8 zeros). From Nyerk (github.com/xCROv/aion2-nyerk), checked on its captures.
//   0xE223 the next daily reset, u64 ms (login, zone entry); 0x568E limits: u16, u8 n, n x (u32 id, u32, u64 next reset
//          ms), most on the weekly reset; 0xE307 / 0xE305 the Artifact Siege: after e9 03 00 00 03 and a byte, u64 last
//          end and u64 next start (ms). Also Nyerk's.
// Skill codes are the skill's id plus its level and variant: 16370001 is skill 16370000; a tick's 1637000011 too.
const { execFile } = require('child_process');

class Reader {
  constructor(b) { this.b = b; this.o = 0; }
  varint() { let v = 0, s = 0; for (let i = 0; i < 10; i++) { const c = this.b[this.o++]; if (c === undefined) throw new Error('short'); v += (c & 127) * 2 ** s; s += 7; if (!(c & 128)) return v; } throw new Error('varint'); }
  u8() { if (this.o >= this.b.length) throw new Error('short'); return this.b[this.o++]; }
  skip(n) { if (this.o + n > this.b.length) throw new Error('short'); this.o += n; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u64() { const v = Number(this.b.readBigUInt64LE(this.o)); this.o += 8; return v; }
}

// LZ4 block format (lz4.org), for the 0xFFFF bundles
function lz4(src, size) {
  const out = Buffer.alloc(size);
  let i = 0, o = 0;
  while (i < src.length) {
    const t = src[i++];
    let n = t >> 4;
    if (n === 15) for (let b = 255; b === 255; ) { b = src[i++]; n += b; }
    if (i + n > src.length || o + n > size) throw new Error('lz4 literals');
    src.copy(out, o, i, i + n); i += n; o += n;
    if (i >= src.length) break;
    const back = src[i] | (src[i + 1] << 8);
    i += 2;
    let m = t & 15;
    if (m === 15) for (let b = 255; b === 255; ) { b = src[i++]; m += b; }
    m += 4;
    if (!back || back > o || o + m > size) throw new Error('lz4 match');
    for (let k = 0; k < m; k++, o++) out[o] = out[o - back];
  }
  if (o !== size) throw new Error('lz4 size');
  return out;
}

// the frames in buf from offset o, as far as they go: { frames: [[opcode, payload]], used }
function frames(buf, o = 0) {
  const out = [];
  while (o < buf.length) {
    let len = 0, s = 0, vl = 0;
    for (; vl < 5; vl++) { const c = buf[o + vl]; if (c === undefined) return { frames: out, used: o }; len += (c & 127) * 2 ** s; s += 7; if (!(c & 128)) break; }
    if (vl === 5 || len < 6) return { frames: out, used: o, bad: true };
    vl++;
    const size = vl + 2 + len - 6;
    if (o + size > buf.length) return { frames: out, used: o };
    out.push([buf.readUInt16LE(o + vl), buf.subarray(o + vl + 2, o + size)]);
    o += size;
  }
  return { frames: out, used: o };
}
// where whole frames start in a stream joined partway: the offset from which the most bytes parse cleanly
function sync(buf) {
  let best = -1, most = 0;
  for (let st = 0; st < Math.min(buf.length, 4096); st++) {
    const f = frames(buf, st);
    if (f.bad || f.frames.length < 4) continue;
    if (f.used - st > most) { most = f.used - st; best = st; }
    if (f.used >= buf.length - 64) break;
  }
  return best;
}
function unbundle(list, out = [], depth = 0) {
  for (const [op, p] of list) {
    if (op !== 0xffff) { out.push([op, p]); continue; }
    if (depth > 3 || p.length < 5) continue;
    const size = p.readUInt32LE(0);
    if (size < 1 || size > 0x100000) continue;
    try { unbundle(frames(lz4(p.subarray(4), size)).frames, out, depth + 1); } catch {}
  }
  return out;
}

const FF8 = Buffer.alloc(8, 255);
const nameAt = (b, o) => { const n = b[o]; if (!(n >= 2 && n <= 32) || o + 1 + n > b.length) return ''; const s = b.subarray(o + 1, o + 1 + n).toString('utf8'); return /^[^\x00-\x1f\ufffd]+$/.test(s) ? s : ''; };
const msAt = (b, o) => { if (o + 8 > b.length) return false; const v = Number(b.readBigUInt64LE(o)); return v > 1.6e12 && v < 2.2e12; };
const gameTime = (v) => v > 1.6e12 && v < 2.2e12 && v % 60000 === 0; // the game's schedules fall on whole minutes
const SIEGE = Buffer.from('e903000003', 'hex'); // artifact 1001, then the siege's times
// a boss of this zone's list starts at o (a flag, then an id that's world * 100 + n), or the list ends there
function bossAt(b, o, world) {
  if (o >= b.length - 3) return true;
  if (b[o] !== 0 && b[o] !== 1) return false;
  try { const r = new Reader(b); r.o = o + 1; return Math.floor(r.varint() / 100) === world; } catch { return false; }
}
function decode(op, p) {
  const r = new Reader(p);
  if (op === 0x3804) {
    const target = r.varint(), flags = r.u16();
    if (!(flags & 4)) return null;
    const source = r.varint(), skill = r.b.readUInt32LE(r.o); r.skip(5);
    if (flags & 1) r.skip(4);
    const type = r.u8();
    if (type === 9) return null; // reflected
    if (flags & 2) { r.u8(); r.varint(); r.u8(); }
    r.skip(8); r.varint();
    return { k: 'hit', target, source, skill, crit: type === 3, damage: r.varint() };
  }
  if (op === 0x3805) {
    const target = r.varint();
    if (r.u8() !== 0x0a) return null;
    const source = r.varint();
    r.varint();
    const skill = r.b.readUInt32LE(r.o); r.skip(4);
    return { k: 'hit', target, source, skill, crit: false, damage: r.varint(), dot: true };
  }
  if (op === 0x3641) {
    const id = r.varint(), i = p.indexOf(FF8);
    if (i < 0) return null;
    r.o = i + 16;
    const owner = r.varint();
    return owner !== id ? { k: 'summon', id, owner } : null;
  }
  if (op === 0x8d00) {
    const id = r.varint();
    if (r.varint() !== 2) return null;
    r.varint(); r.varint();
    return { k: 'hp', id, hp: r.u64() };
  }
  if (op === 0x3645 || op === 0x3633) {
    const id = r.varint();
    let name = nameAt(p, r.o + 5);
    for (let k = r.o; !name && k < r.o + 12; k++) name = nameAt(p, k);
    return name ? { k: 'name', id, name, me: op === 0x3633 } : null;
  }
  if (op === 0x610b) {
    const n = r.varint(), tickets = [];
    if (n > 512) return null;
    for (let i = 0; i < n; i++) {
      const mask = r.u8(), id = r.b.readUInt32LE(r.o);
      r.skip(4);
      if (mask & 1) r.skip(8);
      if (mask & 2) r.skip(8);
      const left = mask & 4 ? r.varint() : 0, extra = mask & 8 ? r.varint() : 0;
      tickets.push({ id, left, extra });
    }
    return { k: 'tickets', tickets };
  }
  if (op === 0x610c) {
    r.u8();
    const id = r.varint();
    r.skip(4);
    const max = r.varint(), left = r.varint();
    return { k: 'tickets', tickets: [{ id, left, max }] };
  }
  if (op === 0x9101) {
    const world = p.readUInt32LE(2), n = p[6], bosses = [];
    let o = 7;
    for (let i = 0; i < n; i++) {
      if (p[o] !== 0 && p[o] !== 1) return null;
      const up = p[o] === 1;
      r.o = o + 1;
      const id = r.varint();
      o = r.o + (up ? 12 : 0);
      // no time: 8 zeros (after the odd byte, maybe), where what follows starts the next boss or the list ends
      const z = [0, 1].find((k) => o + k + 8 <= p.length && !p.readBigUInt64LE(o + k) && bossAt(p, o + k + 8, world));
      if (z !== undefined) { o += z + 8; if (up) bosses.push({ id, up, at: 0 }); continue; }
      const k = [0, 1, 2, 3, 4].find((k) => msAt(p, o + k));
      if (k === undefined) return null;
      o += k;
      bosses.push({ id, up, at: Number(p.readBigUInt64LE(o)) });
      o += 8;
    }
    return { k: 'bosses', world, bosses };
  }
  if (op === 0xe223) { const at = p.length >= 8 && Number(p.readBigUInt64LE(0)); return gameTime(at) ? { k: 'sched', day: at } : null; }
  if (op === 0x568e) {
    const n = p[2], soon = [], now = Date.now();
    if (p.length < 3 + 16 * n) return null;
    for (let i = 0; i < n; i++) { const at = Number(p.readBigUInt64LE(3 + 16 * i + 8)); if (at > now && at <= now + 8 * 864e5 && gameTime(at)) soon.push(at); }
    // the weekly reset: the time most limits share in the next 8 days, if it's most of them
    const best = [...new Set(soon)].map((t) => [t, soon.filter((x) => x === t).length]).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return best && best[1] * 2 > soon.length ? { k: 'sched', week: best[0] } : null;
  }
  if (op === 0xe307 || op === 0xe305) {
    const i = p.indexOf(SIEGE);
    if (i < 0 || i + 22 > p.length) return null;
    const last = Number(p.readBigUInt64LE(i + 6)), next = Number(p.readBigUInt64LE(i + 14));
    return last > 1.6e12 && last < next && gameTime(next) ? { k: 'sched', siege: next, siegeEnded: last } : null;
  }
  if (op === 0x9702) {
    const members = [];
    for (let o = 2; o < p.length; o++) {
      const s = nameAt(p, o), end = o + 1 + Buffer.byteLength(s);
      if (!s || end + 12 > p.length) continue;
      const server = p.readUInt16LE(o - 2), cls = p.readUInt32LE(end), level = p.readUInt32LE(end + 4), il = p.readUInt32LE(end + 8);
      if (server < 1000 || server > 9999 || !(level >= 1 && level <= 99) || cls > 99 || il > 99999) continue; // the party's title
      members.push({ name: s, server, cls, level, il });
      o = end - 1;
    }
    return { k: 'party', names: members.map((m) => m.name), members: members.slice(0, 8) };
  }

  return null;
}

// One connection's server-to-client bytes in order, by TCP sequence number; joined partway, it syncs on frames first.
class Stream {
  constructor(onFrame) { this.onFrame = onFrame; this.next = null; this.wait = new Map(); this.buf = Buffer.alloc(0); this.synced = false; }
  push(seq, data, syn) {
    if (syn) { this.next = (seq + 1) >>> 0; this.synced = true; this.buf = Buffer.alloc(0); this.wait.clear(); return; }
    if (!data.length) return;
    if (this.next === null) this.next = seq;
    const d = (seq - this.next) | 0;
    if (d < 0) { if (-d >= data.length) return; data = data.subarray(-d); seq = this.next; }
    else if (d > 0) { this.wait.set(seq, data); if (this.wait.size > 64) this.resync(); return; }
    this.take(data);
    this.drain();
  }
  drain() { // the ones waiting that follow on now, also when sent again in other pieces (partly read already)
    for (let more = true; more; ) {
      more = false;
      for (const [k, b] of this.wait) {
        const d = (k - this.next) | 0;
        if (d > 0) continue;
        this.wait.delete(k);
        if (-d < b.length) { this.take(b.subarray(-d)); more = true; }
      }
    }
  }
  // a packet that never comes (the capture missed it): go on from the earliest one waiting, and every one after it.
  // It used to take only that one and empty what it had read each time, so the stream never read a frame again and the
  // meter stayed on its last fight (Rayan, 6 Nov)
  resync() {
    this.next = [...this.wait.keys()].sort((a, b) => ((a - b) | 0))[0];
    this.buf = Buffer.alloc(0); this.synced = false;
    this.drain();
  }
  take(data) {
    this.next = (this.next + data.length) >>> 0;
    this.buf = this.buf.length ? Buffer.concat([this.buf, data]) : data;
    if (!this.synced) {
      if (this.buf.length < 2048) return;
      const st = sync(this.buf);
      if (st < 0) { this.buf = this.buf.subarray(this.buf.length - 1024); return; }
      this.buf = this.buf.subarray(st); this.synced = true;
    }
    const f = frames(this.buf);
    if (f.bad) { this.synced = false; this.buf = this.buf.subarray(f.used + 1); return; }
    for (const [op, p] of unbundle(f.frames)) { try { const e = decode(op, p); if (e) this.onFrame(e); } catch {} }
    this.buf = this.buf.subarray(f.used);
    if (this.buf.length > 0x200000) { this.buf = Buffer.alloc(0); this.synced = false; }
  }
}

// The fight: the target hit the most in the last 15 s, with everyone's damage on it since it was first hit
class Fight {
  constructor() { this.sched = {}; this.bosses = null; this.tickets = new Map(); this.names = new Map(); this.named = new Set(); this.party = new Set(); this.members = []; this.me = ''; this.hp = new Map(); this.targets = new Map(); this.summons = new Map(); this.last = null; }
  add(e, now) {
    if (e.k === 'name') { this.names.set(e.id, e.name); this.named.add(e.name); if (e.me) this.me = e.name; return; }
    if (e.k === 'party') { this.party = new Set(e.names); this.members = e.members || []; return; }
    if (e.k === 'sched') { Object.assign(this.sched, e); delete this.sched.k; return; }
    if (e.k === 'bosses') { this.bosses = { world: e.world, list: e.bosses, at: Date.now() }; return; }
    if (e.k === 'tickets') { for (const x of e.tickets) this.tickets.set(x.id, { ...this.tickets.get(x.id), ...x, at: Date.now() }); return; }
    if (e.k === 'summon') { this.summons.set(e.id, e.owner); if (this.summons.size > 5000) this.summons.clear(); return; }
    if (e.k === 'hp') { const h = this.hp.get(e.id) || { max: 0 }; h.hp = e.hp; h.max = Math.max(h.max, e.hp); h.at = now; this.hp.set(e.id, h); return; }
    if (e.k !== 'hit') return;
    const source = this.summons.get(e.source) ?? e.source; // a pet's or summon's damage is its owner's
    if (source === e.target) return;
    let t = this.targets.get(e.target);
    if (!t || now - t.lastAt > 30e3) this.targets.set(e.target, (t = { id: e.target, firstAt: now, lastAt: now, recent: [], by: new Map() }));
    t.lastAt = now;
    t.recent.push([now, e.damage, source]);
    let s = t.by.get(source);
    if (!s) t.by.set(source, (s = { id: source, damage: 0, hits: 0, crits: 0, firstAt: now, skills: new Map() }));
    s.damage += e.damage; s.lastAt = now;
    if (!e.dot) { s.hits++; if (e.crit) s.crits++; } // ticks aren't hits: crit % stays per hit, as in Abyss
    const code = e.skill >= 1e9 ? Math.floor(e.skill / 100) : e.skill; // ticks carry the code times 100
    const id = Math.floor(code / 10000) * 10000, k = s.skills.get(id) || { id, damage: 0, hits: 0 };
    k.damage += e.damage; k.hits++; s.skills.set(id, k);
  }
  ours(id) { const n = this.names.get(id); return !!n && (n === this.me || this.party.has(n)); } // you, or someone in your party
  // one fight's numbers: everyone on target t (or your party only), each with their top skills
  numbers(t, partyOnly) {
    this.guessMe(t);
    const secs = Math.max(1, (t.lastAt - t.firstAt) / 1000);
    const name = (id) => this.names.get(id) || '';
    let players = [...t.by.values()];
    // in your party at any time in this fight stays in it: the party splitting up after a run took everyone but you off
    // its last fight (Rayan's runs, 5 Nov)
    for (const p of players) p.was = p.was || (!!this.party.size && this.ours(p.id));
    // only your party: those named and in it, and those not named yet (a reader started partway through a zone hears a
    // name only when someone comes into view) unless they're a pet's or summon's crumbs
    const all = players.reduce((a, p) => a + p.damage, 0);
    if (partyOnly && (this.party.size || players.some((p) => p.was))) players = players.filter((p) => p.was || (!this.names.has(p.id) && p.damage >= 0.02 * all));
    const total = players.reduce((a, p) => a + p.damage, 0) || 1;
    const h = this.hp.get(t.id);
    return {
      secs: Math.round(secs), target: name(t.id),
      hp: h ? h.hp : null, pct: h && h.max ? Math.round((h.hp / h.max) * 1000) / 10 : null,
      players: players.sort((a, b) => b.damage - a.damage).slice(0, 12).map((p) => ({
        name: name(p.id) || `Player ${p.id}`, me: !!this.me && name(p.id) === this.me, party: p.was || this.ours(p.id), damage: p.damage,
        dps: Math.round(p.damage / secs), share: Math.round((p.damage / total) * 1000) / 10, crit: p.hits ? Math.round((p.crits / p.hits) * 100) : 0,
        skills: [...p.skills.values()].sort((a, b) => b.damage - a.damage).slice(0, 8).map((k) => ({ id: k.id, damage: k.damage, hits: k.hits, share: Math.round((k.damage / (p.damage || 1)) * 1000) / 10 })),
      })),
    };
  }
  // You're never "a character in view" (0x3645), only 0x3633 when a zone starts. Started partway through a zone, the one
  // party member nobody has named is you, and you're the unnamed one doing by far the most damage on this target (the
  // rest are pets and summons whose owner wasn't seen). ponytail: heuristic; two unnamed party members wait for a zone.
  guessMe(t) {
    if (this.me || !this.party.size) return;
    const left = [...this.party].filter((n) => !this.named.has(n));
    const ids = [...t.by.values()].filter((p) => !this.names.has(p.id)).sort((a, b) => b.damage - a.damage);
    if (left.length === 1 && ids.length && (ids.length === 1 || ids[0].damage > 3 * ids[1].damage)) {
      this.me = left[0]; this.names.set(ids[0].id, left[0]); this.named.add(left[0]);
    }
  }
  // fights that just ended, for the history: a boss killed, or 20 s or more of fighting that stopped 30 s ago
  finished(now, partyOnly) {
    const out = [];
    for (const t of this.targets.values()) {
      // never you or your party; another player only if your party fought them (else it's mobs hitting them)
      if (t.saved || this.ours(t.id) || (this.names.has(t.id) && ![...t.by.keys()].some((id) => this.ours(id)))) continue;
      const killed = (this.hp.get(t.id) || {}).hp === 0, secs = (t.lastAt - t.firstAt) / 1000;
      if (!(killed ? now - t.lastAt > 3e3 && secs >= 10 : now - t.lastAt > 30e3 && secs >= 20)) continue;
      t.saved = true;
      const n = this.numbers(t, partyOnly);
      if (n.players.length) out.push({ ...n, killed, at: Date.now() - (now - t.firstAt) });
    }
    return out;
  }
  snapshot(now, partyOnly) {
    let best = null, top = [0, 0];
    for (const t of this.targets.values()) {
      t.recent = t.recent.filter(([at]) => now - at < 15e3);
      if (now - t.lastAt > 120e3) this.targets.delete(t.id);
      // you or your party being hit (mobs, or heals) is never the fight, nor one already won (not hit since)
      const h = this.hp.get(t.id);
      if (this.ours(t.id) || (h && h.hp === 0 && h.at >= t.lastAt)) continue;
      // The fight is what your party hit most in the last 15 s. With nobody in it named yet, it's what was hit most, but
      // never another player (named: mobs hitting them). Under a name it can still be a mob your party hits: the numbers
      // are small (under 65,536 on Rayan's meter), so one named once may be a mob's later; skipping those could leave
      // the meter on its last fight
      let all = 0, mine = 0;
      for (const [, d, s] of t.recent) { all += d; if (this.ours(s)) mine += d; }
      const v = mine ? [1, mine] : [0, this.names.has(t.id) ? 0 : all];
      if (v[0] > top[0] || (v[0] === top[0] && v[1] > top[1])) { top = v; best = t; }
    }
    if (this.last && this.ours(this.last.id)) this.last = null; // named as one of you since it was picked
    // a fight just won stays up 15 s, before the trash mobs after it; one won in under 10 s (a trash mob) doesn't hold the
    // next pull back
    const l = this.last, dead = l && (this.hp.get(l.id) || {}).hp === 0 && now - l.lastAt < 15e3 && l.lastAt - l.firstAt >= 10e3;
    if (best && !dead) this.last = best;
    const t = this.last;
    return { members: this.members, tickets: [...this.tickets.values()], sched: this.sched, bosses: this.bosses, ...(t && { active: now - t.lastAt < 15e3, ...this.numbers(t, partyOnly) }) };
  }

}

// ---- capture (Windows): Npcap's wpcap.dll through koffi, polled without blocking; the game's connections are found
// with netstat for AION2.exe every 5 s
function gameConnections() {
  return new Promise((res) => execFile('tasklist.exe', ['/FI', 'IMAGENAME eq AION2.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => {
    const pids = [...String(out || '').matchAll(/^"AION2\.exe","(\d+)"/gim)].map((m) => m[1]);
    if (!pids.length) return res([]);
    execFile('netstat.exe', ['-ano', '-p', 'tcp'], { windowsHide: true, maxBuffer: 1 << 22 }, (e2, net) => {
      const rows = [...String(net || '').matchAll(/TCP\s+[\d.]+:(\d+)\s+([\d.]+):(\d+)\s+ESTABLISHED\s+(\d+)/g)];
      res(rows.filter((m) => pids.includes(m[4]) && !/^127\./.test(m[2]) && !['443', '80'].includes(m[3])).map((m) => ({ ip: m[2], port: +m[3], local: +m[1] })));
    });
  }));
}
// wpcap.dll's functions, made once: koffi refuses a type name made twice, so turning it on again would fail
let pcap = null;
function wpcap() {
  if (pcap) return pcap;
  const koffi = require('koffi');
  const lib = koffi.load(require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'Npcap', 'wpcap.dll'));
  const dev = koffi.struct('pcap_if_t', { next: 'void *', name: 'char *', description: 'char *', addresses: 'void *', flags: 'uint32' });
  koffi.struct('bpf_program_t', { bf_len: 'uint32', bf_insns: 'void *' });
  const hdr = koffi.struct('pcap_pkthdr_t', { sec: 'int32', usec: 'int32', caplen: 'uint32', len: 'uint32' });
  const findalldevs = lib.func('int pcap_findalldevs(_Out_ void **alldevs, char *err)');
  const freealldevs = lib.func('void pcap_freealldevs(void *alldevs)');
  const openLive = lib.func('void *pcap_open_live(const char *dev, int snaplen, int promisc, int ms, char *err)');
  const compile = lib.func('int pcap_compile(void *p, _Out_ bpf_program_t *fp, const char *str, int optimize, uint32 netmask)');
  const setfilter = lib.func('int pcap_setfilter(void *p, bpf_program_t *fp)');
  const freecode = lib.func('void pcap_freecode(bpf_program_t *fp)');
  const setnonblock = lib.func('int pcap_setnonblock(void *p, int nonblock, char *err)');
  const nextEx = lib.func('int pcap_next_ex(void *p, _Out_ void **hdr, _Out_ void **data)');
  const datalink = lib.func('int pcap_datalink(void *p)');
  const close = lib.func('void pcap_close(void *p)');
  return (pcap = { koffi, dev, hdr, findalldevs, freealldevs, openLive, compile, setfilter, freecode, setnonblock, nextEx, datalink, close });
}
function start(onSnapshot, opts = {}) {
  const { koffi, dev, hdr, findalldevs, freealldevs, openLive, compile, setfilter, freecode, setnonblock, nextEx, datalink, close } = wpcap();
  const err = Buffer.alloc(512), list = [null];
  if (findalldevs(list, err) !== 0) throw new Error(err.toString('latin1').replace(/\0.*$/s, ''));
  const handles = [];
  for (let d = list[0]; d; ) {
    const v = koffi.decode(d, dev);
    if (!/loopback/i.test(`${v.name} ${v.description}`)) {
      const h = openLive(v.name, 65536, 0, 1, err);
      if (h && setnonblock(h, 1, err) === 0) handles.push({ h, dl: datalink(h) });
      else if (h) close(h);
    }
    d = v.next;
  }
  freealldevs(list[0]);
  const fight = new Fight(), streams = new Map(), aside = new Map();
  let conns = [], soon = null;
  const setFilter = (f) => { for (const x of handles) { const prog = {}; if (compile(x.h, prog, f, 1, 0xffffffff) === 0) { setfilter(x.h, prog); freecode(prog); } } };
  setFilter('tcp and not (port 443 or port 80 or port 3478 or port 5349)'); // nor voice and screen shares relayed by TURN
  const stream = (key) => { let s = streams.get(key); if (!s) streams.set(key, (s = new Stream((e) => fight.add(e, Date.now())))); return s; };
  const look = async () => {
    conns = await gameConnections();
    const keys = new Set(conns.map((c) => `${c.port}>${c.local}`));
    for (const k of streams.keys()) if (!keys.has(k)) streams.delete(k);
    for (const k of keys) { const a = aside.get(k); if (a) { aside.delete(k); const s = stream(k); for (const x of a.pkts) s.push(...x); } }
    const old = Date.now() - 15e3;
    for (const [k, a] of aside) if (a.at < old) aside.delete(k);
    for (const [id, h] of fight.hp) if (h.at < old - 585e3) fight.hp.delete(id); // HP of what left view 10 min ago
  };
  look();
  const hp = [null], dp = [null];
  const poll = () => {
    for (const x of handles) for (let n = 0; n < 2000 && nextEx(x.h, hp, dp) === 1; n++) {
      // copied out of Npcap's memory: Electron stops the app on a view of outside memory (koffi.view), as 1.34.0 did.
      // Never a koffi.array type per packet: koffi keeps every type made, ~0.75 KB each, so that leaked ~300 MB an hour
      const H = koffi.decode(hp[0], hdr), u = koffi.decode(dp[0], 'uint8_t', H.caplen), b = Buffer.from(u.buffer, u.byteOffset, u.length);
      let o = x.dl === 1 ? 14 : x.dl === 0 ? 4 : 0;
      if (x.dl === 1 && b.readUInt16BE(12) === 0x8100) o += 4;
      if (b.length < o + 20 || b[o] >> 4 !== 4) continue;
      const t = o + (b[o] & 15) * 4, end = Math.min(b.length, o + b.readUInt16BE(o + 2));
      if (end < t + 20) continue;
      const key = `${b.readUInt16BE(t)}>${b.readUInt16BE(t + 2)}`, pkt = [b.readUInt32BE(t + 4), b.subarray(t + (b[t + 12] >> 4) * 4, end), !!(b[t + 13] & 2)];
      if (streams.has(key)) { streams.get(key).push(...pkt); continue; }
      if (conns.some((c) => `${c.port}>${c.local}` === key)) { stream(key).push(...pkt); continue; }
      // not the game's, or not yet known to be: kept 15 s (up to 4 MB a connection), and a new connection looks again soon
      let a = aside.get(key);
      if (!a) aside.set(key, (a = { at: Date.now(), size: 0, pkts: [] }));
      if (a.size < 4 << 20) { a.pkts.push(pkt); a.size += pkt[1].length; }
      if (pkt[2] && !soon) soon = setTimeout(() => { soon = null; look(); setTimeout(look, 1500); }, 300);
    }
  };
  const timers = [setInterval(poll, 20), setInterval(look, 5000), setInterval(() => {
    const now = Date.now();
    onSnapshot(conns.length ? fight.snapshot(now, opts.partyOnly !== false) : { off: 'game' });
    if (opts.onFight) for (const f of fight.finished(now, opts.partyOnly !== false)) opts.onFight(f);
  }, 250)]; // four times a second, so the meter keeps up
  return { stop() { timers.forEach(clearInterval); clearTimeout(soon); for (const x of handles) close(x.h); handles.length = 0; }, set partyOnly(v) { opts.partyOnly = v; } };
}

module.exports = { start, frames, sync, lz4, unbundle, decode, Stream, Fight };

// node client/aionlive.test.js: Aion 2 live fight's frame reading on made-up frames (no game or Npcap needed):
// framing, joining a stream partway, an LZ4 bundle, damage, HP, names, the party, and the fight's numbers.
const assert = require('assert');
const { frames, sync, lz4, unbundle, decode, Stream, Fight } = require('./aionlive');

const varint = (v) => { const a = []; do { let c = v % 128; v = Math.floor(v / 128); if (v) c |= 128; a.push(c); } while (v); return Buffer.from(a); };
const frame = (op, p) => { const o = Buffer.alloc(2); o.writeUInt16LE(op); return Buffer.concat([varint(p.length + 6), o, p]); };
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const str = (s) => Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)]);
// 0x3804 as the game sends it, with flags 6 (damage, plus the bit-packed part); type 3 is a crit
const hit = (target, source, damage, crit) => frame(0x3804, Buffer.concat([varint(target), u16(6), varint(source), u32(16370001), Buffer.from([1]), Buffer.from([crit ? 3 : 2]), Buffer.from([0]), varint(0), Buffer.from([1]), u32(0), u32(0), varint(0), varint(damage), Buffer.from([0, 0])]));
const hp = (id, v) => frame(0x8d00, Buffer.concat([varint(id), varint(2), varint(1), varint(0), u64(v)]));
const appear = (op, id, name) => frame(op, Buffer.concat([varint(id), Buffer.from([3, 0x20, 0xa0, 1, 7]), str(name), Buffer.alloc(20, 9)]));
// as the game sends it: the title, then per member an index, an id, the server (2323), name, class, level, item level
const party = (...names) => frame(0x9702, Buffer.concat([Buffer.from([0x60, 0xf9, 0x26, 0]), str('Leaving now.'), Buffer.from([5, 8, 0x28, 9, 0, 0]), ...names.map((n, i) => Buffer.concat([Buffer.from([0x1e, i + 1, 0x73, 0xc9, 1, 0, 0, 0, 0x13, 9]), str(n), u32(11), u32(45), u32(1480 + i), Buffer.from([0x13, 9]), Buffer.alloc(24, 0)]))]));
// 0x3805 a tick, and 0x3641 a summon whose owner is 12 (the 8 x 0xFF and 8 bytes before the owner, as the game sends)
const dot = (target, source, damage) => frame(0x3805, Buffer.concat([varint(target), Buffer.from([0x0a]), varint(source), varint(6), u32(1638000011), varint(damage), u32(0)]));
const summon = (id, owner) => frame(0x3641, Buffer.concat([varint(id), Buffer.alloc(40, 1), Buffer.alloc(8, 255), Buffer.alloc(8, 2), varint(owner), Buffer.alloc(6, 0)]));
// an LZ4 block of literals only, which is valid LZ4
const lz4Literals = (b) => { const n = b.length, head = [n >= 15 ? 0xf0 : n << 4]; if (n >= 15) { let r = n - 15; while (r >= 255) { head.push(255); r -= 255; } head.push(r); } return Buffer.concat([Buffer.from(head), b]); };
const bundle = (inner) => frame(0xffff, Buffer.concat([u32(inner.length), lz4Literals(inner)]));

// the ticket update caught in a real game (Nightmare, 2 of 14 left), and a made-up login list
assert.deepStrictEqual(decode(0x610c, Buffer.from('00040c0000000e02', 'hex')), { k: 'tickets', tickets: [{ id: 4, left: 2, max: 14 }] });
assert.deepStrictEqual(decode(0x610b, Buffer.concat([varint(2), Buffer.from([0x0c]), u32(60000001), varint(90), varint(80), Buffer.from([0x07]), u32(4), u64(0), u64(0), varint(2)])).tickets,
  [{ id: 60000001, left: 90, extra: 80 }, { id: 4, left: 2, extra: 0 }]);

// framing and the decoders
const stream = Buffer.concat([appear(0x3633, 11, 'YasuoMain16'), appear(0x3645, 12, 'Akima'), party('YasuoMain16', 'Akima'), hp(500, 1000000), hit(500, 11, 3000, true), hit(500, 12, 1000, false)]);
const f = frames(stream);
assert.strictEqual(f.used, stream.length);
assert.deepStrictEqual(f.frames.map(([op]) => op), [0x3633, 0x3645, 0x9702, 0x8d00, 0x3804, 0x3804]);
assert.deepStrictEqual(decode(...f.frames[0]), { k: 'name', id: 11, name: 'YasuoMain16', me: true });
assert.deepStrictEqual(decode(...f.frames[2]).members, [{ name: 'YasuoMain16', server: 2323, cls: 11, level: 45, il: 1480 }, { name: 'Akima', server: 2323, cls: 11, level: 45, il: 1481 }], 'the title is left out');
assert.deepStrictEqual(decode(...frames(dot(500, 12, 777)).frames[0]), { k: 'hit', target: 500, source: 12, skill: 1638000011, crit: false, damage: 777, dot: true });
assert.deepStrictEqual(decode(...frames(summon(900, 12)).frames[0]), { k: 'summon', id: 900, owner: 12 });
assert.strictEqual(decode(...frames(summon(900, 900)).frames[0]), null, 'a mob is its own owner');
assert.deepStrictEqual(decode(...f.frames[3]), { k: 'hp', id: 500, hp: 1000000 });
assert.deepStrictEqual(decode(...f.frames[4]), { k: 'hit', target: 500, source: 11, skill: 16370001, crit: true, damage: 3000 });
assert.strictEqual(decode(0x3804, Buffer.concat([varint(500), u16(0), varint(11)])), null, 'no damage flag');
// LZ4 back references: "abcabcabcabc" as 3 literals and a 9-byte match 3 back
assert.strictEqual(lz4(Buffer.from([0x35, 0x61, 0x62, 0x63, 3, 0]), 12).toString(), 'abcabcabcabc');
assert.deepStrictEqual(unbundle(frames(bundle(stream)).frames).map(([op]) => op), f.frames.map(([op]) => op), 'a bundle opens into its frames');
// joined partway: 1.5 KB of junk-looking tail before whole frames
const filler = Buffer.concat(Array.from({ length: 200 }, () => frame(0x3600, Buffer.alloc(2))));
const joined = Buffer.concat([Buffer.from([0x99, 0x01, 0x42]), filler, stream]);
assert.strictEqual(sync(joined), 3);

// a stream in pieces, out of order, through the fight
const fight = new Fight();
let now = 1000;
const s = new Stream((e) => fight.add(e, now));
const data = Buffer.concat([filler, stream, bundle(Buffer.concat([hit(500, 11, 6000, false), hp(500, 990000)])), summon(900, 12), dot(500, 12, 500), hit(500, 900, 500, false)]);
const seq0 = 4000000000; // wraps past 2^32
s.push(seq0 - 1, Buffer.alloc(0), true);
const cut = [0, 700, 2100, 2400, data.length];
const parts = cut.slice(1).map((end, i) => [seq0 + cut[i], data.subarray(cut[i], end)]);
for (const [seq, b] of [parts[0], parts[2], parts[1], parts[3]]) { s.push(seq >>> 0, b, false); now += 500; }
const snap = fight.snapshot(now, true);
assert.strictEqual(snap.hp, 990000);
assert.strictEqual(snap.pct, 99);
assert.deepStrictEqual(snap.players.map((p) => [p.name, p.damage, p.me, p.party]), [['YasuoMain16', 9000, true, true], ['Akima', 2000, false, true]], 'a tick and a summon hit count for Akima');
assert.strictEqual(snap.players[0].share, 81.8);
assert.strictEqual(snap.players[0].crit, 50);
assert.strictEqual(snap.players[1].crit, 0, 'the tick is not a hit');
assert.deepStrictEqual(snap.players[0].skills, [{ id: 16370000, damage: 9000, hits: 2, share: 100 }]);
assert.deepStrictEqual(snap.players[1].skills.map((k) => k.id), [16370000, 16380000]);
assert.strictEqual(snap.members.length, 2);
fight.add({ k: 'name', id: 99, name: 'Stranger' }, now); // named and not in the party (an unnamed one is kept since 1c6bc73)
fight.add({ k: 'hit', target: 500, source: 99, skill: 1, damage: 50000 }, now);
assert.strictEqual(fight.snapshot(now, true).players.length, 2, 'party only leaves out strangers');
assert.strictEqual(fight.snapshot(now, false).players[0].name, 'Stranger');
now += 10000; // the fight goes on 10 s more
fight.add({ k: 'hit', target: 500, source: 11, skill: 16370001, damage: 1 }, now);
// the boss dies: it stays up over the trash after it for 15 s
fight.add({ k: 'hp', id: 500, hp: 0 }, now);
fight.add({ k: 'hit', target: 777, source: 11, skill: 1, damage: 99999999 }, now + 1000);
assert.strictEqual(fight.snapshot(now + 1000, true).hp, 0);
// after it, mobs (and heals) on a party member never take over the meter
for (let i = 0; i < 20; i++) fight.add({ k: 'hit', target: 12, source: 4444, skill: 1, damage: 1e9 }, now + 15000 + i * 100);
assert.strictEqual(fight.snapshot(now + 17000, true).target, '', 'still the boss (named nothing), not Akima');
assert.strictEqual(fight.snapshot(now + 17000, true).hp, 0);
fight.add({ k: 'hit', target: 778, source: 11, skill: 1, damage: 5 }, now + 17000);
assert.notStrictEqual(fight.snapshot(now + 17000, true).hp, 0, 'a new mob does');
// the history: the boss, killed, once
const done = fight.finished(now + 4000, true);
assert.deepStrictEqual(done.map((d) => [d.killed, d.players.length]), [[true, 2]]);
assert.strictEqual(fight.finished(now + 9000, true).length, 0);

// game-read schedules (Nyerk's layouts): the field boss list as the map sends it, the daily reset, limits, the siege
const T = Date.UTC(2026, 10, 3, 19, 21, 7, 250), f32 = (x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); return b; };
const list = Buffer.concat([u16(0), u32(1010), Buffer.from([3]),
  Buffer.from([0]), varint(101021), u64(T),                                    // dead: respawns at T
  Buffer.from([1]), varint(101001), f32(1), f32(2), f32(3), u64(0),            // up, no time since the 10-14 patch
  Buffer.from([0]), varint(101002), Buffer.from([0xff]), u64(T + 6e4)]);       // dead, with the odd byte before its time
assert.deepStrictEqual(decode(0x9101, list), { k: 'bosses', world: 1010, bosses: [{ id: 101021, up: false, at: T }, { id: 101001, up: true, at: 0 }, { id: 101002, up: false, at: T + 6e4 }] });
const day = Date.UTC(2026, 10, 4, 7), week = Date.UTC(2026, 10, 4, 7) + Math.ceil((Date.now() - Date.UTC(2026, 10, 4, 7)) / (7 * 864e5)) * 7 * 864e5;
assert.deepStrictEqual(decode(0xe223, Buffer.concat([u64(day), u32(0)])), { k: 'sched', day });
assert.strictEqual(decode(0xe223, Buffer.concat([u64(day + 1), u32(0)])), null, 'not on a whole minute: a misread');
const lim = (id, at) => Buffer.concat([u32(id), u32(1), u64(at)]);
assert.deepStrictEqual(decode(0x568e, Buffer.concat([u16(0), Buffer.from([3]), lim(1, week), lim(2, week), lim(1262, Date.UTC(2100, 0, 1))])), { k: 'sched', week });
const siege = Date.UTC(2026, 10, 6, 1);
assert.deepStrictEqual(decode(0xe307, Buffer.concat([Buffer.alloc(9, 7), Buffer.from('e90300000301', 'hex'), u64(siege - 3 * 864e5), u64(siege), Buffer.alloc(10)])), { k: 'sched', siege, siegeEnded: siege - 3 * 864e5 });
const g = new Fight();
for (const [op, p] of [[0x9101, list], [0xe223, Buffer.concat([u64(day), u32(0)])]]) g.add(decode(op, p), 0);
const gs = g.snapshot(0, true);
assert.deepStrictEqual([gs.sched, gs.bosses.world, gs.bosses.list.length], [{ day }, 1010, 3]);
// a packet the capture missed: after 64 more it goes on from them (it used to read nothing again: the meter stuck on its
// last fight, Rayan 6 Nov), and a piece sent again over one waiting leaves nothing behind
{
  const got = [], st = new Stream((e) => { if (e.k === 'hit') got.push(e.damage); });
  const data = Buffer.concat(Array.from({ length: 3000 }, (_, i) => hit(500, 11, 1000 + i, false)));
  st.push(99, Buffer.alloc(0), true);
  const pk = [];
  for (let o = 0; o < data.length; o += 1000) pk.push([100 + o, data.subarray(o, o + 1000)]);
  pk.forEach(([seq, b], i) => { if (i !== 20) st.push(seq, b, false); });
  assert.strictEqual(got[got.length - 1], 3999, 'read to the end');
  assert.ok(got.length > 2900, `most of it read (${got.length} of 3000)`);
  assert.deepStrictEqual([st.wait.size, st.synced], [0, true]);
  const st2 = new Stream(() => {});
  st2.push(99, Buffer.alloc(0), true);
  st2.push(100, data.subarray(0, 1000), false);
  st2.push(2100, data.subarray(2000, 3000), false); // waits for 1100-2100
  st2.push(1100, data.subarray(1000, 2500), false); // sent again in a bigger piece, over the waiting one
  assert.deepStrictEqual([st2.wait.size, st2.next], [0, 3100], 'nothing left waiting');
  // a lost packet sent again together with the next one (as servers do), 70 times: each used to stay waiting, and at 65
  // the stream went back to them and stopped
  const seen = new Map(), st3 = new Stream((e) => { if (e.k === 'hit') seen.set(e.damage, (seen.get(e.damage) || 0) + 1); });
  st3.push(99, Buffer.alloc(0), true);
  const small = [];
  for (let o = 0; o < data.length; o += 100) small.push([100 + o, data.subarray(o, o + 100)]);
  for (let i = 0; i < small.length; i++) {
    if (i % 10 !== 5 || i + 1 >= small.length) { st3.push(...small[i], false); continue; }
    st3.push(...small[i + 1], false);
    st3.push(small[i][0], Buffer.concat([small[i][1], small[i + 1][1]]), false);
    i++;
  }
  assert.deepStrictEqual([seen.size, Math.max(...seen.values()), st3.wait.size], [3000, 1, 0], 'every hit once');
}
// whose fight it is
{
  const g2 = new Fight();
  g2.add({ k: 'name', id: 1, name: 'Me', me: true }, 0);
  g2.add({ k: 'name', id: 2, name: 'Ally' }, 0);
  g2.add({ k: 'name', id: 3, name: 'Stranger' }, 0);
  g2.add({ k: 'party', names: ['Me', 'Ally', 'Tank'] }, 0);
  // the tank, not named yet, takes far more from mobs than you deal: the fight is still what you hit
  for (let i = 0; i < 10; i++) g2.add({ k: 'hit', target: 700, source: 40000 + i, skill: 1, damage: 1e6 }, 100);
  g2.add({ k: 'hit', target: 600, source: 1, skill: 1, damage: 1000 }, 100);
  assert.deepStrictEqual(g2.snapshot(200, true).players.map((p) => p.name), ['Me'], 'what you hit, not the tank');
  // with nobody in the party hitting anything, what's hit most; once it's named as one of you, nothing
  const g3 = new Fight();
  g3.add({ k: 'party', names: ['Me', 'Tank'] }, 0);
  g3.add({ k: 'hit', target: 700, source: 40000, skill: 1, damage: 1e6 }, 100);
  assert.strictEqual(g3.snapshot(200, true).players[0].name, 'Player 40000');
  g3.add({ k: 'name', id: 700, name: 'Tank' }, 300);
  assert.strictEqual(g3.snapshot(400, true).players, undefined, 'a party member is never the fight');
  // a mob under a name (a number a player had) that your party hits is the fight, and goes in the history
  g2.add({ k: 'name', id: 900, name: 'Gone' }, 0);
  g2.add({ k: 'hp', id: 900, hp: 5e6 }, 1000);
  for (let i = 0; i < 12; i++) { g2.add({ k: 'hit', target: 900, source: 1, skill: 1, damage: 3e5 }, 1000 + i * 1000); g2.add({ k: 'hit', target: 900, source: 2, skill: 1, damage: 1e5 }, 1000 + i * 1000); g2.add({ k: 'hit', target: 900, source: 3, skill: 1, damage: 1e4 }, 1000 + i * 1000); }
  assert.strictEqual(g2.snapshot(12000, true).hp, 5e6, 'not stuck on the last fight');
  g2.add({ k: 'hp', id: 900, hp: 0 }, 12000);
  assert.deepStrictEqual(g2.finished(16000, true).map((f) => f.players.map((p) => p.name)), [['Me', 'Ally']]);
  // the party splits up after the run: its last fight keeps who was in it
  g2.add({ k: 'party', names: ['Me'] }, 17000);
  assert.deepStrictEqual(g2.snapshot(17000, true).players.map((p) => [p.name, p.party]), [['Me', true], ['Ally', true]]);
  g2.add({ k: 'party', names: [] }, 18000);
  assert.deepStrictEqual(g2.snapshot(18000, true).players.map((p) => p.name), ['Me', 'Ally'], 'no stranger either');
  // a trash mob won in 3 s doesn't stay up over the next one
  g2.add({ k: 'hit', target: 950, source: 1, skill: 1, damage: 5e5 }, 30000);
  assert.strictEqual(g2.snapshot(30000, true).players[0].damage, 5e5);
  g2.add({ k: 'hit', target: 950, source: 1, skill: 1, damage: 5e5 }, 33000);
  g2.add({ k: 'hp', id: 950, hp: 0 }, 33000);
  assert.strictEqual(g2.snapshot(33000, true).players[0].damage, 1e6);
  g2.add({ k: 'hit', target: 951, source: 1, skill: 1, damage: 7 }, 34000);
  assert.strictEqual(g2.snapshot(24000, true).players[0].damage, 7, 'the next mob at once');
}
console.log('aionlive ok');

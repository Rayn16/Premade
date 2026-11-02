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
fight.add({ k: 'hit', target: 500, source: 99, skill: 1, damage: 50000 }, now);
assert.strictEqual(fight.snapshot(now, true).players.length, 2, 'party only leaves out strangers');
assert.strictEqual(fight.snapshot(now, false).players[0].name, 'Player 99');
now += 10000; // the fight goes on 10 s more
fight.add({ k: 'hit', target: 500, source: 11, skill: 16370001, damage: 1 }, now);
// the boss dies: it stays up over the trash after it for 15 s
fight.add({ k: 'hp', id: 500, hp: 0 }, now);
fight.add({ k: 'hit', target: 777, source: 11, skill: 1, damage: 99999999 }, now + 1000);
assert.strictEqual(fight.snapshot(now + 1000, true).hp, 0);
assert.notStrictEqual(fight.snapshot(now + 15500, true).hp, 0);
// the history: the boss, killed, once
const done = fight.finished(now + 4000, true);
assert.deepStrictEqual(done.map((d) => [d.killed, d.players.length]), [[true, 2]]);
assert.strictEqual(fight.finished(now + 9000, true).length, 0);
console.log('aionlive ok');

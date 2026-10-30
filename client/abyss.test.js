// node abyss.test.js: builds a fight file the way Abyss DPS Meter writes it (numbers from Rayan's real "Kromede's Desire"
// fight, 30 Oct 2026) and checks that abyss.js reads it back. Prints ok.
const assert = require('assert'), { parse } = require('./abyss');
const vi = (v) => { v = BigInt(v); const o = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); };
const f = (n, v) => (Buffer.isBuffer(v) || typeof v === 'string' ? Buffer.concat([vi((n << 3) | 2), vi(Buffer.byteLength(v)), Buffer.from(v)]) : Buffer.concat([vi(n << 3), vi(v)]));
const msg = (...parts) => Buffer.concat(parts);
const S = 1793334183198000000n, E = 1793334428600000000n;
const P = [[7515, 'CutieCatty', 'Chanter', 2853237, 541, 293, 471, 1793334185249000000n], [2116, 'lelel2', 'Ranger', 3159888, 1329, 536, 204, 1793334186949000000n],
  [9803, 'YasuoMain', 'Gladiator', 3462896, 934, 548, 48, 1793334187147000000n], [11410, 'MrMed', 'Cleric', 1478036, 546, 152, 263, 1793334187549000000n],
  [14986, 'DeathRunner', 'Assassin', 4550215, 1117, 624, 1004, 1793334183198000000n]];
const skill = (name, dmg) => f(16, msg(f(1, 1), f(2, msg(f(2, name), f(4, dmg), f(6, 10), f(7, 4)))));
const header = msg(f(1, 'bd099971'), f(2, "Kromede's Desire"), f(3, S), f(4, E), f(6, 15504272), f(7, 1), f(11, 'YasuoMain'), f(12, 1012));
const stats = msg(...P.map(([id, n, c, d, h, cr, b, fh]) => f(1, msg(f(1, id), f(2, msg(f(1, id), f(2, n), f(3, c), f(6, d), f(7, h), f(8, cr), f(9, b), f(14, fh), f(24, 1012),
  f(22, msg(f(1, 1), f(2, msg(f(1, 1), skill('Slash', d - 1000))))), f(22, msg(f(1, 2), f(2, msg(f(1, 2), skill('Slash', 400), skill('Kick', 600)))))))))));
const sec = (id, b) => { const h = Buffer.alloc(2); h.writeUInt16LE(id); return Buffer.concat([h, vi(b.length), b]); };
const v = Buffer.alloc(2); v.writeUInt16LE(1);
const file = Buffer.concat([Buffer.from('ABYS'), v, sec(1, header), sec(2, stats), sec(3, msg(f(1, msg(f(1, 5))))), sec(4, msg(f(1, Buffer.alloc(32))))]);

const r = parse(file);
assert.strictEqual(r.label, "Kromede's Desire");
assert.strictEqual(r.end - r.start, 245402);
assert.strictEqual(r.dmg, 15504272);
assert.strictEqual(r.me, 'YasuoMain');
assert.strictEqual(r.players.reduce((n, p) => n + p.dmg, 0), r.dmg);
assert.deepStrictEqual(r.players.map((p) => p.n), ['DeathRunner', 'YasuoMain', 'lelel2', 'CutieCatty', 'MrMed']);
const y = r.players[1];
assert.deepStrictEqual([y.cls, y.hits, y.crits, y.back, y.first - r.start, y.srv], ['Gladiator', 934, 548, 48, 3949, 1012]);
assert.deepStrictEqual(y.k, [['Slash', 3462896 - 1000 + 400, 20, 8], ['Kick', 600, 10, 4]]);
assert.throws(() => parse(Buffer.from('nope')));
console.log('ok');

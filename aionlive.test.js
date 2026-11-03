// Aion 2 live fight names (client/aionlive.js), from packets of real party fights (2026-11-03): 0x8A33 carries titles
// and legions ("Legend", "HunLords"), never names, and your own character, missed at the zone's start, is found from
// the party. Run: node aionlive.test.js
const assert = require('assert');
const { decode, Fight } = require('./client/aionlive');

assert.strictEqual(decode(0x8a33, Buffer.from('cd343e02000000001309064c6567656e64020000000000000000000000000000000000', 'hex')), null, 'a title is not a name');
assert.strictEqual(decode(0x8a33, Buffer.from('8e5d02000000000025050848756e4c6f72647301000200000000000000000000000000', 'hex')), null, 'a legion is not a name');
const cutie = decode(0x3645, Buffer.from('86620320a001070a4375746965436174747924000000020280926cb7f7469a5c09c700dcc2468c36a14348e50183db0183db01f50e0000f50e000000', 'hex'));
assert.strictEqual(cutie.name, 'CutieCatty');

const hit = (source, damage) => ({ k: 'hit', target: 900, source, skill: 1e7, damage });
const party = { k: 'party', names: ['YasuoMain', 'CutieCatty', 'Alarico'], members: [] };

// started partway through a zone: no 0x3633 for you, and a pet whose owner wasn't seen
let f = new Fight();
for (const e of [party, cutie, { k: 'name', id: 77, name: 'Alarico' }, hit(6733, 300), hit(cutie.id, 200), hit(77, 100), hit(4242, 5)]) f.add(e, 1000);
f.add(hit(6733, 300), 3000);
let n = f.numbers(f.targets.get(900), true);
assert.deepStrictEqual(n.players.map((p) => [p.name, p.me, p.damage]), [['YasuoMain', true, 600], ['CutieCatty', false, 200], ['Alarico', false, 100]], 'you are in your party');

// the zone's start seen: 0x3633 names you
f = new Fight();
for (const e of [party, { k: 'name', id: 6733, name: 'YasuoMain', me: true }, hit(6733, 50)]) f.add(e, 1000);
assert.deepStrictEqual(f.numbers(f.targets.get(900), true).players.map((p) => [p.name, p.me]), [['YasuoMain', true]]);

// two party members unnamed, or no clear top damage: nothing guessed
f = new Fight();
for (const e of [party, hit(6733, 50), hit(5, 40)]) f.add(e, 1000);
assert(!f.numbers(f.targets.get(900), false).players.some((p) => p.me), 'no guess without a clear top');
f = new Fight();
for (const e of [{ ...party, names: ['YasuoMain', 'Other'] }, hit(6733, 500)]) f.add(e, 1000);
assert(!f.numbers(f.targets.get(900), false).players.some((p) => p.me), 'no guess with two unnamed party members');
console.log('aionlive.test.js: ok');

// started partway through a zone: two party members not named yet stay in "only my party"; a stranger named outside
// the party and a pet's crumbs don't
f = new Fight();
for (const e of [party, cutie, { k: 'name', id: 99, name: 'Stranger' }, hit(cutie.id, 300), hit(6733, 300), hit(77, 200), hit(99, 500), hit(4242, 5)]) f.add(e, 1000);
assert.deepStrictEqual(f.numbers(f.targets.get(900), true).players.map((p) => p.name), ['CutieCatty', 'Player 6733', 'Player 77']);
console.log('aionlive.test.js: unnamed party members ok');

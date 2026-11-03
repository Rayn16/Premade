// Aion 2 live fight names (client/aionlive.js), from packets of a real party fight (2026-11-03): a title packet (0x8A33
// "Legend") must not name a player, and your own character, missed at the zone's start, is found from the party.
// Run: node aionlive.test.js
const assert = require('assert');
const { decode, Fight } = require('./client/aionlive');

const title = decode(0x8a33, Buffer.from('cd343e02000000001309064c6567656e64020000000000000000000000000000000000', 'hex'));
assert.deepStrictEqual(title, { k: 'name', id: 6733, name: 'Legend', weak: true }, 'a title is a weak name');
const cutie = decode(0x3645, Buffer.from('86620320a001070a4375746965436174747924000000020280926cb7f7469a5c09c700dcc2468c36a14348e50183db0183db01f50e0000f50e000000', 'hex'));
assert.strictEqual(cutie.name, 'CutieCatty');

const hit = (source, damage) => ({ k: 'hit', target: 900, source, skill: 1e7, damage });
const party = { k: 'party', names: ['YasuoMain', 'CutieCatty', 'Alarico'], members: [] };

// started partway through a zone: no 0x3633, only the title for you, a summon's damage unknown
let f = new Fight();
for (const e of [party, cutie, { k: 'name', id: 77, name: 'Alarico' }, title, hit(6733, 300), hit(cutie.id, 200), hit(77, 100)]) f.add(e, 1000);
f.add(hit(6733, 300), 3000);
let n = f.numbers(f.targets.get(900), true);
assert.deepStrictEqual(n.players.map((p) => [p.name, p.me, p.damage]), [['YasuoMain', true, 600], ['CutieCatty', false, 200], ['Alarico', false, 100]], 'you are in your party');

// the zone's start seen: 0x3633 names you, and a title arriving later doesn't rename you
f = new Fight();
for (const e of [party, { k: 'name', id: 6733, name: 'YasuoMain', me: true }, title, hit(6733, 50)]) f.add(e, 1000);
assert.strictEqual(f.numbers(f.targets.get(900), true).players[0].name, 'YasuoMain');

// two party members never named: nothing guessed (the title stays a stranger's)
f = new Fight();
for (const e of [party, title, hit(6733, 50), hit(5, 50)]) f.add(e, 1000);
n = f.numbers(f.targets.get(900), false);
assert(!n.players.some((p) => p.me), 'no guess with two unknowns');
console.log('aionlive.test.js: ok');

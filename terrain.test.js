// node terrain.test.js: checks site/terrain.js against a few spots of the Rift. Prints ok.
const assert = require('assert');
require('./site/terrain.js');
const { at, muffle } = Terrain;
assert.strictEqual(at(0.5, 0.5), 0, 'mid lane is open');
assert.strictEqual(at(0.39, 0.39), 2, 'top-side river');
assert.strictEqual(at(0.01, 0.01), 1, 'outside the map is wall');
assert.strictEqual(muffle({ x: 0.09, y: 0.6 }, { x: 0.09, y: 0.3 }), 0, 'down the top lane: clear');
assert(muffle({ x: 0.2, y: 0.61 }, { x: 0.35, y: 0.61 }) > 0.9, 'through a jungle wall: muffled');
assert.strictEqual(muffle({ x: 0.2, y: 0.61 }, { x: 0.35, y: 0.61 }), muffle({ x: 0.35, y: 0.61 }, { x: 0.2, y: 0.61 }), 'walls muffle both ways');
// a bush: someone in it is muffled to a listener outside, not to one standing in it with them
let bush = null;
for (let y = 0; y < 128 && !bush; y++) for (let x = 0; x < 128 && !bush; x++) if (at((x + 0.5) / 128, (y + 0.5) / 128) === 3) bush = { x: (x + 0.5) / 128, y: (y + 0.5) / 128 };
const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([i, j]) => ({ x: bush.x + (i * 4) / 128, y: bush.y + (j * 4) / 128 })).find((p) => at(p.x, p.y) === 0 && muffle(p, p) === 0 && !Terrain.inBrush(p));
assert(near, 'open ground next to the first bush');
assert(muffle(near, bush) >= 0.85 && Terrain.bushed(near, bush), 'speaker in a bush: muffled');
assert(muffle(bush, near) < 0.6 && !Terrain.bushed(bush, near), 'listener in the bush hears outside fine');
assert.strictEqual(muffle(bush, { x: bush.x + 1 / 256, y: bush.y }), 0, 'both in the same bush: clear');
console.log('ok');

// node terrain.test.js: checks site/terrain.js against a few spots of the Rift, and that it lines up with Rayan's real
// minimap. Prints ok.
const fs = require('fs');
const zlib = require('zlib');
const assert = require('assert');
require('./site/terrain.js');
const { at, muffle, onMinimap: o } = Terrain;
const mm = (p) => ({ x: o.x + p.x * o.w, y: o.y + p.y * o.h }); // a spot on the map as the tracker reads it off the minimap
assert.strictEqual(at(0.5, 0.5), 0, 'mid lane is open');
assert.strictEqual(at(0.39, 0.39), 2, 'top-side river');
assert.strictEqual(at(0.01, 0.01), 1, 'outside the map is wall');
assert.strictEqual(muffle(mm({ x: 0.09, y: 0.6 }), mm({ x: 0.09, y: 0.3 })), 0, 'down the top lane: clear');
assert(muffle(mm({ x: 0.2, y: 0.61 }), mm({ x: 0.35, y: 0.61 })) > 0.9, 'through a jungle wall: muffled');
assert.strictEqual(muffle(mm({ x: 0.2, y: 0.61 }), mm({ x: 0.35, y: 0.61 })), muffle(mm({ x: 0.35, y: 0.61 }), mm({ x: 0.2, y: 0.61 })), 'walls muffle both ways');
// a bush: someone in it is muffled to a listener outside, not to one standing in it with them
let bush = null;
for (let y = 0; y < 128 && !bush; y++) for (let x = 0; x < 128 && !bush; x++) if (at((x + 0.5) / 128, (y + 0.5) / 128) === 3) bush = { x: (x + 0.5) / 128, y: (y + 0.5) / 128 };
const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([i, j]) => ({ x: bush.x + (i * 4) / 128, y: bush.y + (j * 4) / 128 })).find((p) => at(p.x, p.y) === 0 && muffle(mm(p), mm(p)) === 0 && !Terrain.inBrush(mm(p)));
assert(near, 'open ground next to the first bush');
assert(muffle(mm(near), mm(bush)) >= 0.85 && Terrain.bushed(mm(near), mm(bush)), 'speaker in a bush: muffled');
assert(muffle(mm(bush), mm(near)) < 0.6 && !Terrain.bushed(mm(bush), mm(near)), 'listener in the bush hears outside fine');
assert.strictEqual(muffle(mm(bush), mm({ x: bush.x + 1 / 256, y: bush.y })), 0, 'both in the same bush: clear');

// Rayan's real minimap (Practice Tool, 2026-10-17): its black should be wall and its lit ground open. Read through
// onMinimap they agree far more often than with the grid stretched over the whole minimap, frame included, as before.
const R = 646, S = 279, px = zlib.gunzipSync(fs.readFileSync(__dirname + '/fixtures/rayan-practice-tool-646.rgba.gz'));
const agree = (terrainAt) => {
  const n = { dark: 0, lit: 0 }, ok = { dark: 0, lit: 0 };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = ((R - S + y) * R + R - S + x) * 4, [r, g, b] = px.subarray(p, p + 3), spot = { x: (x + 0.5) / S, y: (y + 0.5) / S };
    const u = (spot.x - o.x) / o.w, v = (spot.y - o.y) / o.h;
    if (u < 0.04 || v < 0.04 || u > 0.96 || v > 0.96 || (b > r + 25 && b > 40 && g < b)) continue; // the map's edge, the river and the blue base
    const k = Math.max(r, g, b) < 30 ? 'dark' : 'lit', wall = terrainAt(spot) === 1;
    n[k]++;
    if (wall === (k === 'dark')) ok[k]++;
  }
  return (ok.dark / n.dark + ok.lit / n.lit) / 2;
};
const before = agree((p) => at(p.x, p.y)), now = agree(Terrain.atMinimap);
console.log(`lined up with Rayan's minimap: ${(now * 100).toFixed(0)}% agree, ${(before * 100).toFixed(0)}% stretched over the frame`);
assert(now > 0.75 && now > before + 0.15, 'walls line up with the real minimap');
console.log('ok');

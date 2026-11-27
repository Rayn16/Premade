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

// The callouts' spot names (index.html placeOf and mapSpot, What's new 181 and 232), at Riot's game units read off the
// minimap as the tracker does, for a player on blue (100) and on red (200). The river mouths are spots where enemies
// stood in Rayan's recorded games of 2026-11-20 and 2026-11-22.
const src = fs.readFileSync(__dirname + '/site/index.html', 'utf8'), grab = (re) => src.match(re)[0];
const code = [/const MAP = \d+;/, /function placeOf\(pos, team\) \{[\s\S]*?\n {2}\}/, /const SPOTS = \[[\s\S]*?\]\];/, /const AREAS = \{[^\n]*\};/, /function mapSpot\(p\) \{[\s\S]*?\n {2}\}/, /function riftSpot\(x, y, team\) \{[\s\S]*?\n {2}\}/].map(grab).join('\n');
const spotFor = (team) => new Function('mine', 'Terrain', `${code}\nreturn { mapSpot, placeOf };`)({ team: team === 200 ? 'CHAOS' : 'ORDER' }, Terrain);
const B = spotFor(100), Rd = spotFor(200), onMm = (x, y) => ({ x: o.x + (x / 14870) * o.w, y: o.y + (1 - y / 14870) * o.h });
const says = (S, x, y) => S.mapSpot(onMm(x, y)).name;
assert.strictEqual(says(B, 7765, 4020), 'your red', 'blue side: your red buff');
assert.strictEqual(says(Rd, 7765, 4020), 'their red', 'red side: their red buff');
assert.strictEqual(says(B, 12160, 2620), 'bot river', 'where the river meets bot lane: bot river, not your jungle');
assert.strictEqual(B.placeOf({ x: 12160, y: 2620 }, 100), 'the river', 'so an enemy laner there is no invader');
assert.strictEqual(says(Rd, 2430, 12530), 'top river', 'where the river meets top lane: top river, not your jungle');
assert.strictEqual(says(B, 1500, 8450), 'top lane', 'top lane by your gromp: top lane');
assert.strictEqual(says(Rd, 13370, 6420), 'bot lane', 'bot lane by their gromp: bot lane');
assert.strictEqual(says(B, 6400, 5900), 'mid lane', 'mid lane by your raptors: mid lane');
assert.strictEqual(says(B, 2680, 9750), 'your top jungle', 'a jungle away from camps: its half');
assert.strictEqual(says(Rd, 6740, 3010), 'their bot jungle', 'the other jungle, the bot half');
assert.strictEqual(says(B, 4400, 9600), 'top scuttle', 'top scuttle');
console.log('callout spots: camps, lanes by camps, river mouths and jungle halves named right on both sides');
// What's new 237, the gank clock: walking distance round the walls, from the mockup's moment (Rayan's Sylas game of
// 2026-11-26, 5:15): their jungler lost at their blue buff (a wall cell), you in mid, 5,797 units within one cell
{
  const blue = { x: 157 / 210, y: 107 / 210 }, mid = { x: 102 / 210, y: 112 / 210 }, CELL = 14870 / 128;
  let t = performance.now();
  const D = Terrain.walk(blue), ms = performance.now() - t, units = Terrain.walkTo(D, mid);
  assert(Math.abs(units - 5797) < CELL, `their blue buff to mid: ${units}`);
  assert(Math.abs(Terrain.walkTo(Terrain.walk(mid), blue) - units) < 1, 'the same both ways');
  assert(units > Math.hypot((blue.x - mid.x) / o.w, (blue.y - mid.y) / o.h) * 14870, 'round the walls, longer than a straight line');
  assert(D.filter(Number.isFinite).length > 9000 && ms < 100, `most of the map reached in a few ms: ${ms.toFixed(1)} ms`);
  assert.strictEqual(Terrain.outline(D, -1), '', 'nothing within no distance');
  assert(/^M\d/.test(Terrain.outline(D, 1500)) && Terrain.outline(D, 3000).length > Terrain.outline(D, 1500).length, 'the outline grows');
  console.log(`gank clock: their blue buff to mid ${Math.round(units)} units round the walls, ${ms.toFixed(1)} ms a pass`);
}
console.log('ok');

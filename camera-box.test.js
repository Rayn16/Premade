// node camera-box.test.js
// Runs the detector in site/camera-box.js on drawn minimaps: dark noise, stray white specks,
// a movement-path line, champion icons over the box edges, and boxes cut off by the map edge.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname + '/site/camera-box.js', 'utf8'), ctx);
const { Tracker, Follower, RING, findIcons, findMinimap, iconLike, picLook } = ctx.CameraBox;

let seed = 7;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

const W = 300, H = 300, BW = 54, BH = 32;

function frame(box, icons) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = 20 + rand() * 90;
    px[i * 4] = v * 0.6; px[i * 4 + 1] = v; px[i * 4 + 2] = v * 0.7; px[i * 4 + 3] = 255;
  }
  const paint = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  };
  for (let k = 0; k < 40; k++) { const x = (rand() * W) | 0, y = (rand() * H) | 0; paint(x, y, 235, 235, 235); paint(x + 1, y, 235, 235, 235); }
  const lx = (rand() * W) | 0, ly = (rand() * H) | 0;
  for (let k = 0; k < 70; k++) paint(lx + k, ly + (k >> 1), 230, 230, 230); // movement path, slope 1/2
  if (box) {
    for (let t = 0; t < box.thick; t++) {
      for (let x = box.x0; x < box.x0 + BW; x++) { paint(x, box.y0 + t, 240, 240, 240); paint(x, box.y0 + BH - 1 - t, 240, 240, 240); }
      for (let y = box.y0; y < box.y0 + BH; y++) { paint(box.x0 + t, y, 240, 240, 240); paint(box.x0 + BW - 1 - t, y, 240, 240, 240); }
    }
    for (let k = 0; k < icons; k++) { // a 16px champion icon drawn over a random spot of the outline
      const onTop = rand() < 0.5, cx = box.x0 + ((rand() * BW) | 0), cy = onTop ? box.y0 : box.y0 + BH - 1;
      for (let y = cy - 8; y < cy + 8; y++) for (let x = cx - 8; x < cx + 8; x++) paint(x, y, 40, 140, 150);
    }
  }
  return px;
}

function run(thick) {
  const t = new Tracker();
  const errors = [];
  let missed = 0;
  for (let n = 0; n < 400; n++) {
    // camera centre anywhere on the map; one frame in six sits near an edge so the box is cut off
    const nearEdge = rand() < 1 / 6;
    const cx = nearEdge ? (rand() < 0.5 ? rand() * BW * 0.4 : W - 1 - rand() * BW * 0.4) : BW + rand() * (W - 2 * BW);
    const cy = nearEdge ? rand() * H : BH + rand() * (H - 2 * BH);
    const box = { x0: Math.round(cx - (BW - 1) / 2), y0: Math.round(cy - (BH - 1) / 2), thick };
    const icons = rand() < 0.3 ? 1 + ((rand() * 2) | 0) : 0;
    const res = t.update(frame(box, icons), W, H);
    if (n < 10) continue; // still learning the box size
    if (!res.found) { missed++; continue; }
    const tx = box.x0 + (BW - 1) / 2, ty = box.y0 + (BH - 1) / 2;
    errors.push(Math.hypot(res.cx * W - tx, res.cy * H - ty));
  }
  errors.sort((a, b) => a - b);
  const p95 = errors[Math.floor(errors.length * 0.95)], max = errors[errors.length - 1];
  console.log(`${thick}px lines: missed ${missed}/390, error p95 ${p95.toFixed(1)}px, max ${max.toFixed(1)}px`);
  assert(missed <= 4, 'box missed too often');
  assert(p95 <= 2, 'box centre off by more than 2px');
  assert(max <= 8, 'a box centre was far off');

  for (let n = 0; n < 50; n++) assert(!t.update(frame(null, 0), W, H).found, 'found a box on a frame without one');
}

run(1);
run(2);

// Rayan's Practice Tool screenshot (2026-10-17, Minimap Scale at its smallest): the 646px bottom-right corner
// of the screen. Then the same minimap blown up 2x, like a player with Minimap Scale at the top: the minimap
// must be found at both sizes and the camera box must land in the same spot on the map.
// Last, the same screen as screen-share video colours.
const R = 646;
const corner = new Uint8ClampedArray(require('zlib').gunzipSync(fs.readFileSync(__dirname + '/fixtures/rayan-practice-tool-646.rgba.gz')));

function boxOnMinimap(px) {
  const m = findMinimap(px, R);
  assert(m, 'minimap not found');
  const crop = new Uint8ClampedArray(m.s * m.s * 4);
  for (let y = 0; y < m.s && m.y + y < R; y++) {
    crop.set(px.subarray(((m.y + y) * R + m.x) * 4, ((m.y + y) * R + Math.min(R, m.x + m.s)) * 4), y * m.s * 4);
  }
  const res = new Tracker().update(crop, m.s, m.s);
  assert(res.found, 'camera box not found on the real minimap');
  console.log(`real minimap ${m.s}px: camera box ${(res.cx * 100).toFixed(1)}% across, ${(res.cy * 100).toFixed(1)}% down, ${(res.score * 100).toFixed(0)}% of its outline`);
  return { m, res, crop };
}

const small = boxOnMinimap(corner);
assert(Math.abs(small.m.s - 279) <= 3, 'smallest minimap should be about 279px');

const big = new Uint8ClampedArray(corner);
const s = small.m.s, x0 = small.m.x, y0 = small.m.y, S2 = s * 2;
for (let y = 0; y < S2 && y < R; y++) for (let x = 0; x < S2 && x < R; x++) {
  const from = ((y0 + (y >> 1)) * R + x0 + (x >> 1)) * 4, to = ((R - S2 + y) * R + R - S2 + x) * 4;
  if (R - S2 + y >= 0 && R - S2 + x >= 0) big.set(corner.subarray(from, from + 4), to);
}
const large = boxOnMinimap(big);
assert(Math.abs(large.m.s - S2) <= 4, 'the 2x minimap should be found at its full size');
assert(Math.abs(large.res.cx - small.res.cx) < 0.01 && Math.abs(large.res.cy - small.res.cy) < 0.01, 'position must not depend on minimap size');

// Screen-share video can keep colour at half resolution (4:2:0): each 2x2 block shares one colour and
// only brightness stays per pixel. Rebuild the corner that way, with blocks that straddle the 1px gold line.
function videoColours(src, w, off) {
  const out = new Uint8ClampedArray(src);
  for (let y = off; y < w - 1; y += 2) for (let x = off; x < w - 1; x += 2) {
    const ids = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1];
    const lum = ids.map((i) => 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]);
    const u = ids.reduce((a, i, k) => a + (src[i * 4 + 2] - lum[k]) * 0.564, 0) / 4;
    const v = ids.reduce((a, i, k) => a + (src[i * 4] - lum[k]) * 0.713, 0) / 4;
    ids.forEach((i, k) => out.set([lum[k] + 1.403 * v, lum[k] - 0.344 * u - 0.714 * v, lum[k] + 1.773 * u], i * 4));
  }
  return out;
}
const video = videoColours(corner, R, 1);
const fromVideo = boxOnMinimap(video);
assert(Math.abs(fromVideo.res.cx - small.res.cx) < 0.01 && Math.abs(fromVideo.res.cy - small.res.cy) < 0.01, 'video colours must not move the position');

// Show Minimap on left: the bottom-left corner of the screen, with the minimap's frame the mirror image (its gold edge
// on its right). Here the whole corner is mirrored, so the camera box lands mirrored too.
const leftCorner = new Uint8ClampedArray(corner.length);
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) leftCorner.set(corner.subarray((y * R + R - 1 - x) * 4, (y * R + R - x) * 4), (y * R + x) * 4);
const onLeft = findMinimap(leftCorner, R, true);
assert(onLeft && onLeft.x === 0 && onLeft.y === small.m.y && onLeft.s === small.m.s, `the minimap on the left: ${JSON.stringify(onLeft)}`);
assert(!findMinimap(leftCorner, R) && !findMinimap(corner, R, true), 'each side only finds its own frame');
{
  const s2 = onLeft.s, crop = new Uint8ClampedArray(s2 * s2 * 4);
  for (let y = 0; y < s2; y++) crop.set(leftCorner.subarray(((onLeft.y + y) * R) * 4, ((onLeft.y + y) * R + s2) * 4), y * s2 * 4);
  const res = new Tracker().update(crop, s2, s2);
  assert(res.found && Math.abs(res.cx - (1 - small.res.cx)) < 0.01 && Math.abs(res.cy - small.res.cy) < 0.01, `camera box on the left minimap: ${res.cx}, ${res.cy}`);
  console.log(`minimap on the left: ${s2}px, camera box ${(res.cx * 100).toFixed(1)}% across`);
}

// ---- Following your champion icon instead of the camera (Follower), on Rayan's minimap.
// The player's icon is Rayan's, cut from the screenshot; teammates wear the same blue ring around other art from
// Rayan's HUD (fixtures/rayan-hud-art-7x40.rgba.gz). Scripted moments of a game run frame by frame (5 a second),
// and in each frame the follower must be on the player, or say it follows the camera when it can't know.
const S = small.m.s, mm = small.crop, ME = [105.5, 168.75]; // Rayan's icon centre on the screenshot's minimap
const art = new Uint8ClampedArray(require('zlib').gunzipSync(fs.readFileSync(__dirname + '/fixtures/rayan-hud-art-7x40.rgba.gz')));
const arts = [0, 1, 2, 3, 4, 5, 6].map((k) => art.subarray(k * 6400, (k + 1) * 6400)); // Q, W, E, buff, scroll, portrait, D
const bil = (img, w, x, y, c) => {
  x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(w - 1.001, y));
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, p = (yi * w + xi) * 4 + c;
  return (img[p] * (1 - fx) + img[p + 4] * fx) * (1 - fy) + (img[p + w * 4] * (1 - fx) + img[p + w * 4 + 4] * fx) * fy;
};
// sprites give an icon's colour at (u, v) pixels from its centre, on the screenshot's scale
const player = (u, v, c) => bil(mm, S, ME[0] + u, ME[1] + v, c);
const mate = arts.map((a) => (u, v, c) => (Math.hypot(u, v) < 10.3 ? bil(a, 40, 19.5 + u * 1.94, 19.5 + v * 1.94, c) : player(u, v, c)));

// The bare minimap: the player's icon and the camera box filled in from the pixels around them.
const bare = new Uint8ClampedArray(mm), hole = new Uint8Array(S * S), bx = small.res.box;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const inX = x >= bx.x - 1 && x <= bx.x + bx.w, inY = y >= bx.y - 1 && y <= bx.y + bx.h;
  const onBox = (inY && (Math.abs(x - bx.x) <= 1 || Math.abs(x - bx.x - bx.w + 1) <= 1)) || (inX && (Math.abs(y - bx.y) <= 1 || Math.abs(y - bx.y - bx.h + 1) <= 1));
  if (onBox || Math.hypot(x - ME[0], y - ME[1]) < 14.5) hole[y * S + x] = 1;
}
for (let left = true; left;) {
  left = false;
  const next = hole.slice();
  for (let i = S + 1; i < S * S - S - 1; i++) {
    if (!hole[i]) continue;
    let n = 0;
    const acc = [0, 0, 0];
    for (const j of [i - 1, i + 1, i - S, i + S, i - S - 1, i - S + 1, i + S - 1, i + S + 1]) if (!hole[j]) { n++; for (let c = 0; c < 3; c++) acc[c] += bare[j * 4 + c]; }
    if (n >= 3) { for (let c = 0; c < 3; c++) bare[i * 4 + c] = acc[c] / n; next[i] = 0; } else left = true;
  }
  hole.set(next);
}
assert.strictEqual(findIcons(bare, S).length, 0, 'icon left on the bare minimap');

// The same minimap on a smaller screen: f of its size, each pixel the average of what it covers.
function shrink(img, f) {
  const t = Math.round(S * f), out = new Uint8ClampedArray(t * t * 4);
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
    const acc = [0, 0, 0];
    let w = 0;
    for (let yy = Math.floor(y / f); yy < Math.min(S, Math.ceil((y + 1) / f)); yy++) for (let xx = Math.floor(x / f); xx < Math.min(S, Math.ceil((x + 1) / f)); xx++) {
      const a = (Math.min((x + 1) / f, xx + 1) - Math.max(x / f, xx)) * (Math.min((y + 1) / f, yy + 1) - Math.max(y / f, yy));
      for (let c = 0; c < 3; c++) acc[c] += img[(yy * S + xx) * 4 + c] * a;
      w += a;
    }
    out.set([acc[0] / w, acc[1] / w, acc[2] / w, 255], (y * t + x) * 4);
  }
  return out;
}

// Walks along points at v pixels a frame (1.5 is a champion's pace on this minimap); returns frame -> spot.
const along = (pts, v = 1.5) => (k) => {
  let d = k * v;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx2, by2] = pts[i], l = Math.hypot(bx2 - ax, by2 - ay);
    if (d <= l) return [ax + ((bx2 - ax) * d) / l, ay + ((by2 - ay) * d) / l];
    d -= l;
  }
  return pts[pts.length - 1];
};
// The camera box centre when the camera is on a champion: as on Rayan's screenshot, give or take half a pixel.
const lockedOn = ([x, y]) => [x + 2 + rand() - 0.5, y - 4.75 + rand() - 0.5];

// Plays moments of one game; each moment has frames, at(k) -> {me, sprite, mates: [[x, y, art]], cam}, check.
function play(name, { f = 1, video = false, boxOver = true }, moments) {
  const t = Math.round(S * f), base = f === 1 ? bare : shrink(bare, f), follower = new Follower();
  const bw = Math.round(72 * f), bh = Math.round(41 * f);
  const stamp = (px, sp, x, y) => {
    for (let Y = Math.floor(y - 14 * f); Y <= y + 14 * f; Y++) for (let X = Math.floor(x - 14 * f); X <= x + 14 * f; X++) {
      const a = Math.max(0, Math.min(1, 13 - Math.hypot(X - x, Y - y) / f));
      if (!a || X < 0 || Y < 0 || X >= t || Y >= t) continue;
      for (let c = 0; c < 3; c++) px[(Y * t + X) * 4 + c] = px[(Y * t + X) * 4 + c] * (1 - a) + sp((X - x) / f, (Y - y) / f, c) * a;
    }
  };
  const box = (px, cx, cy) => {
    const x0 = Math.round(cx - (bw - 1) / 2), y0 = Math.round(cy - (bh - 1) / 2);
    const put = (x, y) => x >= 0 && y >= 0 && x < t && y < t && px.set([240, 240, 240], (y * t + x) * 4);
    for (let x = x0; x < x0 + bw; x++) { put(x, y0); put(x, y0 + bh - 1); }
    for (let y = y0; y < y0 + bh; y++) { put(x0, y); put(x0 + bw - 1, y); }
  };
  let now = 0, onIcon = 0, frames = 0;
  for (const m of moments) for (let k = 0; k < m.frames; k++, now += 200, frames++) {
    const st = m.at(k), sc = (p) => [p[0] * f, p[1] * f];
    let px = new Uint8ClampedArray(base);
    if (!boxOver) box(px, ...sc(st.cam));
    for (const [x, y, a] of st.mates) stamp(px, mate[a], ...sc([x, y]));
    if (st.me) stamp(px, st.sprite || player, ...sc(st.me));
    if (boxOver) box(px, ...sc(st.cam));
    if (video) px = videoColours(px, t, 1);
    const res = follower.update(px, t, now, st.ally);
    // distances are on the screenshot's scale, in pixels
    const off = (p) => Math.hypot(res.x * S - p[0], res.y * S - p[1]);
    const say = `${name}, ${m.name}, frame ${k}: ${JSON.stringify({ by: res.by, learned: res.learned, x: +(res.x * S).toFixed(1), y: +(res.y * S).toFixed(1), me: st.me && st.me.map(Math.round) })}`;
    m.check(res, st, k, off, say);
    if (res.by === 'icon') onIcon++;
  }
  console.log(`${name}: ${frames} frames, ${onIcon} following the player's icon`);
}
const IR = RING * S; // icon ring radius, 12px
const onMe = (res, st, off, say) => assert(res.by === 'icon' && off(st.me) <= 4, say); // 4px is 210 game units
const nearMe = (res, st, off, say) => assert(res.by === 'icon' && off(st.me) <= IR + 2.5, say); // hidden under a teammate: the last spot
const onCamera = (res, st, off, say) => assert(res.by === 'camera' && off([st.cam[0], st.cam[1] + 0.015 * S]) <= 4, say); // the box is found to a pixel or two

// Camera locked on the player, then free; a teammate walks over the player; death, respawn, F2 on a teammate;
// last the player's icon changes (Kayn transforming).
function lockedThenFree(name, opts) {
  const walk1 = along([[40, 230], [70, 200], [120, 150]]), end1 = walk1(40);
  const walk2 = along([end1, [200, 90]]), end2 = walk2(59), cam2 = along([[120, 145], [200, 200], [60, 60], [230, 40]], 6);
  const walk4 = along([[20, 256], [60, 220]]), walk5 = along([walk4(30), [60, 190]]), end5 = walk5(19);
  const ally5 = along([[150, 200], [200, 150]]), walk6 = along([walk5(20), [140, 220], [140, 120]]);
  const mates = [[230, 240, 0], [200, 250, 1], [60, 60, 2]];
  play(name, opts, [
    { name: 'camera locked on the player', frames: 40, at: (k) => ({ me: walk1(k), mates: [...mates, [walk1(k)[0] - 22, walk1(k)[1] + 22, 3]], cam: lockedOn(walk1(k)) }),
      check: (res, st, k, off, say) => (k >= 20 || res.by === 'icon' ? onMe(res, st, off, say) : onCamera(res, st, off, say)) },
    { name: 'camera free, a teammate walks over the player', frames: 60, at: (k) => ({ me: walk2(k), mates: [...mates, [walk2(k)[0] + (k - 30) * 1.2, walk2(k)[1] + (k - 30) * 0.9, 3]], cam: cam2(k) }),
      check: (res, st, k, off, say) => nearMe(res, st, off, say) },
    { name: 'dead', frames: 30, at: (k) => ({ me: null, mates: [...mates, [200, 120, 3]], cam: cam2(60 + k) }),
      check: (res, st, k, off, say) => (k < 13 ? assert(res.by === 'icon' && off(end2) <= 2.5, say) : k > 15 && assert(res.learned, say) && onCamera(res, st, off, say)) },
    { name: 'respawned, camera on the fountain', frames: 30, at: (k) => ({ me: walk4(k), mates: [[30, 238, 0], [200, 250, 1], [60, 60, 2], [200, 120, 3]], cam: [22, 251.25] }),
      check: (res, st, k, off, say) => (k < 3 && res.by === 'camera' ? onCamera(res, st, off, say) : onMe(res, st, off, say)) },
    { name: 'F2 on a teammate', frames: 20, at: (k) => ({ me: walk5(k), mates: [[30, 238, 0], [...ally5(k), 1], [60, 60, 2], [200, 120, 3]], cam: lockedOn(ally5(k)) }),
      check: (res, st, k, off, say) => onMe(res, st, off, say) },
    { name: 'icon changed, camera locked', frames: 80, at: (k) => ({ me: walk6(k), sprite: mate[5], mates: [...mates, [200, 120, 3]], cam: lockedOn(walk6(k)) }),
      check: (res, st, k, off, say) => (k < 14 ? assert(res.by === 'icon' && (off(end5) <= 2.5 || off(st.me) <= 2.5), say) : k >= 60 || res.by === 'icon' ? onMe(res, st, off, say) : onCamera(res, st, off, say)) },
  ]);
}
lockedThenFree('locked then free', {});
lockedThenFree('locked then free, 1080p screen in video colours', { f: 0.75, video: true });

// Recall: the camera stays in the lane while the player's icon lands in the fountain, and it must follow the player
// there at once, not after the 3 s it keeps a hidden icon's spot. A teammate stands in the other fountain all along
// and is never taken for the player, also while the player's icon is hidden for a second before.
// Then F2 held for 20 s on a teammate walking a long way, the camera on them: with the Windows app saying so (ally),
// it learns nothing from the camera meanwhile and stays on the player, before and after F2 is let go.
{
  const walk = along([[60, 200], [110, 150]]), end = walk(30), out = along([[27, 256], [70, 215]]), mates = [[230, 240, 0], [256, 26, 1]];
  const locked = { name: 'camera locked on the player', frames: 30, at: (k) => ({ me: walk(k), mates, cam: lockedOn(walk(k)) }),
    check: (res, st, k, off, say) => (k >= 20 || res.by === 'icon' ? onMe(res, st, off, say) : onCamera(res, st, off, say)) };
  play('recall', {}, [
    locked,
    { name: 'icon hidden for a second', frames: 5, at: () => ({ me: null, mates, cam: lockedOn(end) }),
      check: (res, st, k, off, say) => assert(res.by === 'icon' && res.held && off(end) <= 2.5, say) },
    { name: 'recalled, camera left in the lane', frames: 20, at: (k) => ({ me: out(k), mates, cam: lockedOn(end) }),
      check: (res, st, k, off, say) => onMe(res, st, off, say) },
  ]);
  const mate = along([[150, 230], [250, 130], [250, 40]]);
  play('F2 held', {}, [
    locked,
    { name: 'F2 on a walking teammate', frames: 100, at: (k) => ({ me: end, mates: [mates[0], [...mate(k), 2]], cam: lockedOn(mate(k)), ally: true }),
      check: (res, st, k, off, say) => onMe(res, st, off, say) },
    { name: 'F2 let go, camera back on the player', frames: 10, at: (k) => ({ me: end, mates: [mates[0], [...mate(100 + k), 2]], cam: lockedOn(end) }),
      check: (res, st, k, off, say) => onMe(res, st, off, say) },
  ]);
}

// Camera free from the start and never on the player; it pans over to a standing teammate and rests there: it must
// not learn anyone. Then one tap of Space (camera jumps onto the player and stays there) and it follows the player.
{
  const walk = along([[200, 60], [140, 140], [60, 200]]), pan = along([[150, 60], [60, 120], lockedOn([230, 200])], 8);
  play('camera free, Space tapped once', { video: true, boxOver: false }, [
    { name: 'camera free', frames: 50, at: (k) => ({ me: walk(k), mates: [[230, 200, 4], [40, 40, 5], [250, 120, 6]], cam: pan(k) }),
      check: (res, st, k, off, say) => assert(!res.learned, say) || onCamera(res, st, off, say) },
    { name: 'Space tapped', frames: 40, at: (k) => ({ me: walk(50 + k), mates: [[230, 200, 4], [40, 40, 5], [250, 120, 6], [walk(50 + k)[0] + (k - 25) * 1.4, walk(50 + k)[1] - (k - 25) * 0.6, 0]], cam: lockedOn(walk(50)) }),
      check: (res, st, k, off, say) => nearMe(res, st, off, say) },
  ]);
}

// Picking your champion by name: Rayan played Yasuo. With Yasuo's Data Dragon picture (fixtures/ddragon-yasuo-128),
// of Rayan's icon and six teammates wearing other HUD art, Follower.pick must choose Rayan's.
{
  const px = new Uint8ClampedArray(bare), spots = [[60, 60], [200, 60], [60, 220], [200, 200], [150, 110], [230, 140]];
  const put = (sp, x, y, to = px) => {
    for (let Y = Math.floor(y - 14); Y <= y + 14; Y++) for (let X = Math.floor(x - 14); X <= x + 14; X++) {
      const a = Math.max(0, Math.min(1, 13 - Math.hypot(X - x, Y - y)));
      if (a) for (let c = 0; c < 3; c++) to[(Y * S + X) * 4 + c] = to[(Y * S + X) * 4 + c] * (1 - a) + sp(X - x, Y - y, c) * a;
    }
  };
  put(player, ...ME);
  [0, 1, 2, 3, 4, 6].forEach((k, i) => put(mate[k], ...spots[i]));
  const yasuo = new Uint8ClampedArray(require('zlib').gunzipSync(fs.readFileSync(__dirname + '/fixtures/ddragon-yasuo-128.rgba.gz')));
  const f = new Follower(), got = f.pick(px, S, yasuo, 128, 0);
  assert.strictEqual(new Follower().pick(bare, S, yasuo, 128, 0), null, 'nobody to pick on an empty minimap');
  assert(got && Math.hypot(got.x - ME[0], got.y - ME[1]) < 2, `picked Rayan's icon: ${JSON.stringify(got)}`);
  const res = f.update(px, S, 100);
  assert(res.by === 'icon' && res.learned && Math.hypot(res.x * S - ME[0], res.y * S - ME[1]) < 2, 'and follows it');
  console.log('pick by name: found Rayan\'s icon among 7');

  // Their jungler (index.html seeJungler): the other team's icons wear a red ring, the red of the towers on Rayan's
  // minimap. Yasuo in red, among three red and three blue icons with other art, is found by the same picture in red
  // only, also on a 1080p screen in video colours; the bare minimap's red towers and inhibitors are no icons.
  const red = (sp) => (u, v, c) => {
    const [r, g, b] = [0, 1, 2].map((k) => sp(u, v, k));
    return Math.hypot(u, v) > 10.3 && b > 140 && b - r > 50 && g > 80 && g < b ? [b * 0.91, r * 0.6, r * 0.55][c] : sp(u, v, c);
  };
  const foes = new Uint8ClampedArray(bare), look = picLook(yasuo, 128), at = [110, 170];
  put(red(player), ...at, foes);
  [0, 1, 2].forEach((k, i) => put(red(mate[k]), ...spots[i], foes));
  [3, 4, 6].forEach((k, i) => put(mate[k], ...spots[i + 3], foes));
  assert.strictEqual(findIcons(bare, S, true).length, 0, 'a red icon on the bare minimap');
  assert.strictEqual(findIcons(foes, S, true).length, 4, 'all four red icons, and no blue one');
  const jg = iconLike(foes, S, look, true);
  assert(jg && Math.hypot(jg.x - at[0], jg.y - at[1]) < 2, `found red Yasuo: ${JSON.stringify(jg)}`);
  assert.strictEqual(iconLike(foes, S, look), null, 'no blue Yasuo');
  const t = Math.round(S * 0.75), small = videoColours(shrink(foes, 0.75), t, 1), jg2 = iconLike(small, t, look, true);
  assert(jg2 && Math.hypot(jg2.x - at[0] * 0.75, jg2.y - at[1] * 0.75) < 2, `found red Yasuo at 1080p in video colours: ${JSON.stringify(jg2)}`);
  console.log('their jungler: found red Yasuo among 7, at both sizes');
}

console.log('ok');

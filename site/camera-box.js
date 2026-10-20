// Finds League's white camera box on a cropped minimap. Plain functions on RGBA pixels with no DOM,
// so camera-box.test.js runs this exact file in Node.
globalThis.CameraBox = (() => {
  const { max, min } = Math;
  const WHITE = 200;     // a pixel counts as white when R, G and B are all above this
  const MIN_SCORE = 0.7; // share of the outline inside the minimap that must be white for a match
  const MIN_SHOWN = 0.2; // share of the whole outline that must be visible and white (a box cut off in a corner)
  const MIN_RUN = 0.04;  // shortest edge we trust, as a share of the minimap width
  const MAX_RUN = 0.7;   // anything longer than this share is not the camera box
  const HISTORY = 30;    // recent frames used to learn the box size

  function whiteMask(rgba, w, h) {
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (rgba[p] > WHITE && rgba[p + 1] > WHITE && rgba[p + 2] > WHITE) mask[i] = 1;
    }
    return mask;
  }

  // Longest unbroken white run along any row (hRun) and down any column (vRun).
  function longestRuns(mask, w, h) {
    let hRun = 0, vRun = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0, run = 0; x < w; x++) { run = mask[y * w + x] ? run + 1 : 0; if (run > hRun) hRun = run; }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0, run = 0; y < h; y++) { run = mask[y * w + x] ? run + 1 : 0; if (run > vRun) vRun = run; }
    }
    return { hRun, vRun };
  }

  // Slides a bw x bh outline over the mask (its centre stays on the minimap) and keeps the spot
  // with the most white outline. Edges match within 1px, for lines that land between pixels.
  // score: share of the outline inside the minimap that is white. shown: share of the whole outline.
  // Judging by the visible part is what lets a box cut off in a map corner still count.
  function placeBox(mask, w, h, bw, bh) {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] || (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) m[i] = 1;
    }
    const W1 = w + 1, H1 = h + 1;
    const rows = new Uint32Array(h * W1), cols = new Uint32Array(w * H1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows[y * W1 + x + 1] = rows[y * W1 + x] + m[y * w + x];
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cols[x * H1 + y + 1] = cols[x * H1 + y] + m[y * w + x];

    const hx = bw >> 1, hy = bh >> 1;
    let best = 0, bx = 0, by = 0;
    for (let y0 = -hy; y0 < h - hy; y0++) {
      const y1 = y0 + bh - 1, ya = max(0, y0), yb = min(h - 1, y1);
      for (let x0 = -hx; x0 < w - hx; x0++) {
        const x1 = x0 + bw - 1, xa = max(0, x0), xb = min(w - 1, x1);
        let s = 0;
        if (y0 >= 0) s += rows[y0 * W1 + xb + 1] - rows[y0 * W1 + xa];
        if (y1 < h) s += rows[y1 * W1 + xb + 1] - rows[y1 * W1 + xa];
        if (x0 >= 0) s += cols[x0 * H1 + yb + 1] - cols[x0 * H1 + ya];
        if (x1 < w) s += cols[x1 * H1 + yb + 1] - cols[x1 * H1 + ya];
        if (s > best) { best = s; bx = x0; by = y0; }
      }
    }
    const xw = min(w - 1, bx + bw - 1) - max(0, bx) + 1, yh = min(h - 1, by + bh - 1) - max(0, by) + 1;
    const visible = (by >= 0) * xw + (by + bh - 1 < h) * xw + (bx >= 0) * yh + (bx + bw - 1 < w) * yh;
    return { x0: bx, y0: by, score: visible ? best / visible : 0, shown: best / (2 * bw + 2 * bh) };
  }

  const median = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];

  // Learns the box size over recent frames of one minimap, then finds the box in each frame.
  // Returns found, score, the box in crop pixels, and the centre (cx, cy) as 0..1 of the minimap.
  class Tracker {
    constructor() { this.key = ''; this.ws = []; this.hs = []; }
    update(rgba, w, h) {
      if (this.key !== w + 'x' + h) { this.key = w + 'x' + h; this.ws = []; this.hs = []; }
      const mask = whiteMask(rgba, w, h);
      const { hRun, vRun } = longestRuns(mask, w, h);
      const lo = max(6, Math.round(w * MIN_RUN));
      if (hRun >= lo && vRun >= lo && hRun <= w * MAX_RUN && vRun <= h * MAX_RUN) {
        this.ws.push(hRun); this.hs.push(vRun);
        if (this.ws.length > HISTORY) { this.ws.shift(); this.hs.shift(); }
      }
      if (!this.ws.length) return { found: false, score: 0, size: w };
      const bw = median(this.ws), bh = median(this.hs);
      const p = placeBox(mask, w, h, bw, bh);
      const found = p.score >= MIN_SCORE && p.shown >= MIN_SHOWN;
      const res = { found, score: p.score, size: w, box: { x: p.x0, y: p.y0, w: bw, h: bh } };
      if (res.found) { res.cx = (p.x0 + (bw - 1) / 2) / w; res.cy = (p.y0 + (bh - 1) / 2) / h; }
      return res;
    }
  }

  // ---- champion icons
  const RING = 0.0432;    // radius of a champion icon's ring, as a share of the minimap width (12px on a 278px minimap)
  const LOCK_DY = 0.015;  // with the camera on your champion, its icon sits this far below the camera box centre
  const SAME_LOOK = 16;   // largest look difference for an icon near your last spot to be you. Your icon against
                          // itself measured up to 11, other champion art from 15
  const SURE_LOOK = 11;   // the same anywhere on the map, once your icon has been gone a while (dead, recalled)
  const PICK_LOOK = 24;   // largest difference between a champion's Data Dragon picture and its minimap icon (Yasuo: 15, others 28+)
  const HOLD = 3000;      // ms your last spot is kept while your icon is hidden, e.g. under a teammate's icon
  const PACE = 0.1;       // fastest a champion crosses the minimap, in minimap widths a second, dashes and Flash included
  const BASES = [[0.093, 0.927], [0.925, 0.085]]; // the two fountains, where a recall lands (measured on Rayan's minimap)
  const BASE = 0.08;      // how far from a fountain's centre an icon counts as just recalled, as a share of the minimap width

  // Finds champion icons with your team's blue ring (yours included). Returns centres in minimap pixels, best first.
  function findIcons(rgba, s) {
    const R = RING * s, N = 32;
    const blue = new Uint8Array(s * s), ring = new Uint8Array(s * s);
    for (let i = 0, p = 0; i < s * s; i++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      if (b > 140 && b - r > 50 && g > 80 && g < b) blue[i] = 1; // loose enough for screen-share video colours
    }
    for (let y = 1; y < s - 1; y++) for (let x = 1; x < s - 1; x++) { // grown by 1px, so a ring a pixel off the radius counts
      const i = y * s + x;
      ring[i] = blue[i - s - 1] | blue[i - s] | blue[i - s + 1] | blue[i - 1] | blue[i] | blue[i + 1] | blue[i + s - 1] | blue[i + s] | blue[i + s + 1];
    }
    const offs = [];
    for (let k = 0; k < N; k++) offs.push(Math.round(R * Math.sin((2 * Math.PI * k) / N)) * s + Math.round(R * Math.cos((2 * Math.PI * k) / N)));
    const m = Math.ceil(R) + 1, need = Math.ceil(N * 0.7), hits = [];
    for (let y = m; y < s - m; y++) for (let x = m; x < s - m; x++) {
      let n = 0, miss = 0;
      for (const o of offs) if (ring[y * s + x + o]) n++; else if (++miss > N - need) break;
      if (n >= need) hits.push({ x, y, n });
    }
    hits.sort((a, b) => b.n - a.n);
    const icons = [];
    for (const h of hits) if (icons.every((i) => Math.hypot(i.x - h.x, i.y - h.y) > R)) icons.push({ ...h });
    for (const ic of icons) { // centre: the middle of the equally good spots, not the first one found (top left)
      let sx = 0, sy = 0, k = 0;
      for (const h of hits) if (h.n === ic.n && Math.hypot(h.x - ic.x, h.y - ic.y) <= R / 2) { sx += h.x; sy += h.y; k++; }
      ic.x = sx / k; ic.y = sy / k;
    }
    return icons;
  }

  // What an icon shows: 7x7 points across its middle, each the average of its 3x3 pixels that aren't white,
  // so a camera-box line across the icon doesn't change it (-1 where all are white).
  function iconLook(rgba, s, x, y) {
    const step = RING * s * 0.2, out = [];
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const cx = Math.round(x + i * step), cy = Math.round(y + j * step);
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const p = ((cy + dy) * s + cx + dx) * 4;
        if (rgba[p] > WHITE && rgba[p + 1] > WHITE && rgba[p + 2] > WHITE) continue;
        r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; n++;
      }
      out.push(n ? r / n : -1, n ? g / n : -1, n ? b / n : -1);
    }
    return out;
  }
  // How different two looks are: the average colour difference (0-255) over their closest 90% of points,
  // so a ping or an icon edge over part of an icon doesn't make it a stranger.
  function lookDiff(a, b) {
    const d = [];
    for (let k = 0; k < a.length; k += 3) if (a[k] >= 0 && b[k] >= 0) d.push(Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]));
    if (d.length < 30) return Infinity;
    d.sort((p, q) => p - q);
    const keep = Math.round(d.length * 0.9);
    let t = 0;
    for (let k = 0; k < keep; k++) t += d[k];
    return t / keep / 3;
  }
  // The icon at (x, y) against a learned look, letting its found centre be 1px off.
  function iconDiff(rgba, s, x, y, look) {
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = min(best, lookDiff(iconLook(rgba, s, x + dx, y + dy), look));
    return best;
  }
  // The same 7x7 look taken from a champion's square picture (pic: RGBA, w x w, e.g. from Data Dragon), for picking
  // your champion by name. A minimap icon shows the picture inside its ring, about 0.86 ring radii across.
  function picLook(pic, w) {
    const out = [], k = w / 2 / 0.86;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const cx = Math.round(w / 2 + i * 0.2 * k), cy = Math.round(w / 2 + j * 0.2 * k), d = Math.max(1, Math.round(k * 0.1));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = cy - d; y <= cy + d; y++) for (let x = cx - d; x <= cx + d; x++) {
        const p = (min(w - 1, max(0, y)) * w + min(w - 1, max(0, x))) * 4;
        r += pic[p]; g += pic[p + 1]; b += pic[p + 2]; n++;
      }
      out.push(r / n, g / n, b / n);
    }
    return out;
  }
  // The item with the smallest diff under limit, or null.
  function closest(items, diff, limit) {
    let best = null, bd = limit;
    for (const it of items) { const d = diff(it); if (d < bd) { bd = d; best = it; } }
    return best;
  }

  // Follows your champion icon, so your camera can look elsewhere. Your icon has the same blue ring as your
  // teammates', so it learns which one is yours from the camera: each time the camera box carries one lone icon
  // along (camera locked, or Space held while walking) or jumps onto one (Space tapped, respawn), that icon's
  // picture gets a vote. The picture with the most votes is you; votes fade, so a champion whose icon changes
  // is relearned, and a short look at a teammate (F2-F5) doesn't take over. Until it has learned, and once your
  // icon has been gone for HOLD (dead), it follows the camera box, moved down to where your champion stands
  // when the camera is on it.
  // update() returns {found, by: 'icon' | 'camera', learned, held (icon not seen this frame), x, y (0..1 of the minimap), cam (camera box result),
  // icons (findIcons)}. ally: the camera is on a teammate (F2 to F5 held), so it learns nothing from it.
  class Follower {
    constructor() { this.camera = new Tracker(); this.looks = []; this.seen = -Infinity; this.at = null; this.streak = null; this.box = null; }
    update(rgba, s, now, ally) {
      const cam = this.camera.update(rgba, s, s), icons = findIcons(rgba, s);
      if (cam.found && !ally) this.learn(rgba, s, icons, cam.cx * s, (cam.cy + LOCK_DY) * s);
      else this.streak = this.box = null;
      const me = this.looks.reduce((b, l) => (!b || l.n > b.n ? l : b), null);
      if (me) {
        // While it has you, only icons you could have walked to count, so a teammate whose icon looks a bit like
        // yours can't take over when yours is hidden for a moment. Once you're gone, it wants a closer look, and so
        // does a fountain at once, as a recall lands there.
        const lost = now - this.seen >= HOLD, reach = (2 * RING + (PACE * (now - this.seen)) / 1000) * s;
        const nearby = lost ? icons : icons.filter((i) => Math.hypot(i.x - this.at.x * s, i.y - this.at.y * s) < reach);
        const diff = (i) => iconDiff(rgba, s, i.x, i.y, me.look);
        const mine = closest(nearby, diff, lost ? SURE_LOOK : SAME_LOOK)
          || (!lost && closest(icons.filter((i) => BASES.some(([x, y]) => Math.hypot(i.x / s - x, i.y / s - y) < BASE)), diff, SURE_LOOK));
        if (mine) { this.seen = now; this.at = { x: mine.x / s, y: mine.y / s }; }
        if (now - this.seen < HOLD) return { found: true, by: 'icon', learned: true, held: this.seen !== now, x: this.at.x, y: this.at.y, cam, icons };
      }
      return { found: cam.found, by: 'camera', learned: !!me, x: cam.cx, y: cam.cy + LOCK_DY, cam, icons };
    }
    // You picked your champion by name: the blue-ringed icon that looks most like its picture becomes you, with
    // its look on your screen, as if the camera had taught it. Returns that icon, or null when none looks like it.
    pick(rgba, s, pic, w, now) {
      const look = picLook(pic, w), best = closest(findIcons(rgba, s), (i) => lookDiff(iconLook(rgba, s, i.x, i.y), look), PICK_LOOK);
      if (!best) return null;
      this.looks = [{ look: iconLook(rgba, s, best.x, best.y), n: 5 }];
      this.seen = now;
      this.at = { x: best.x / s, y: best.y / s };
      return best;
    }
    learn(rgba, s, icons, bx, by) {
      const R = RING * s;
      const near = icons.filter((i) => Math.hypot(i.x - bx, i.y - by) < R / 2);
      const lone = near.length === 1 && icons.every((i) => i === near[0] || Math.hypot(i.x - near[0].x, i.y - near[0].y) > 2 * R);
      const jumped = this.box && Math.hypot(bx - this.box.x, by - this.box.y) > 3 * R;
      this.box = { x: bx, y: by };
      const me = lone ? near[0] : null;
      if (!me || (this.streak && Math.hypot(me.x - this.streak.lx, me.y - this.streak.ly) > R)) this.streak = null;
      if (!me) return;
      if (!this.streak) this.streak = { x: me.x, y: me.y };
      this.streak.lx = me.x; this.streak.ly = me.y;
      if (!jumped && Math.hypot(me.x - this.streak.x, me.y - this.streak.y) <= 1.5 * R) return;
      this.streak = null;
      for (const l of this.looks) l.n *= 0.9;
      const same = closest(this.looks, (l) => iconDiff(rgba, s, me.x, me.y, l.look), SAME_LOOK);
      if (same) same.n++;
      else this.looks.push({ look: iconLook(rgba, s, me.x, me.y), n: 1 });
    }
  }

  // Finds the minimap in the bottom-right corner of a screenshot, at any Minimap Scale.
  // rgba is an r x r square cut from the screen's bottom-right corner (r = 45% of the screen height,
  // enough for the largest minimap). The minimap sits flush in that corner and its left and top edges
  // are a thin gold line, so we try every size s and keep the one whose left column and top row are
  // both gold. Colour is judged over 2x2 pixels because screen-share video can store colour at half
  // resolution, which greys out a 1px gold line but leaves its 2x2 average gold.
  // left: rgba is the bottom-left corner instead, for players who show the minimap on the left (League's Interface
  // settings). That minimap is taken to be the mirror image, its gold edge on its right, so the gold is mirrored too.
  // Returns {x, y, s} in that square's pixels, or null when no such frame shows.
  function findMinimap(rgba, r, left) {
    const gold = new Uint8Array(r * r);
    for (let y = 0; y < r - 1; y++) for (let x = 0; x < r - 1; x++) {
      const p = (y * r + x) * 4, q = p + r * 4; // sums over the pixel, its right, below and below-right
      const R = rgba[p] + rgba[p + 4] + rgba[q] + rgba[q + 4];
      const G = rgba[p + 1] + rgba[p + 5] + rgba[q + 1] + rgba[q + 5];
      const B = rgba[p + 2] + rgba[p + 6] + rgba[q + 2] + rgba[q + 6];
      if (R > 400 && G > 300 && R - B > 140 && G <= R + 40) gold[y * r + (left ? r - 2 - x : x)] = 1;
    }
    let best = 0, bs = 0;
    for (let s = Math.round(r * 0.3); s <= r; s++) {
      const e = r - s;
      let col = 0, row = 0;
      for (let i = e; i < r; i++) { col += gold[i * r + e]; row += gold[e * r + i]; }
      if (min(col, row) / s > best) { best = min(col, row) / s; bs = s; }
    }
    return best >= 0.5 ? { x: left ? 0 : r - bs, y: r - bs, s: bs } : null; // the real frame scores 0.75+, other screen areas 0.11 or less
  }

  // Browser only. ctx is a scratch 2D canvas context; src is anything drawImage takes (image, video, VideoFrame).
  // locateMinimap returns the minimap square on the whole frame (bottom right, else bottom left), minimapPixels its RGBA pixels.
  function locateMinimap(ctx, src, w, h) {
    const r = min(Math.round(h * 0.45), w);
    ctx.canvas.width = r; ctx.canvas.height = r;
    for (const left of [false, true]) {
      ctx.drawImage(src, left ? 0 : w - r, h - r, r, r, 0, 0, r, r);
      const m = findMinimap(ctx.getImageData(0, 0, r, r).data, r, left);
      if (m) return { x: (left ? 0 : w - r) + m.x, y: h - r + m.y, s: m.s };
    }
    return null;
  }
  function minimapPixels(ctx, src, sq) {
    ctx.canvas.width = sq.s; ctx.canvas.height = sq.s; // resizing also clears it
    ctx.drawImage(src, sq.x, sq.y, sq.s, sq.s, 0, 0, sq.s, sq.s);
    return ctx.getImageData(0, 0, sq.s, sq.s).data;
  }

  // Browser only. Calls onFrame(src, w, h) with a frame of a screen share at most every ms milliseconds, until the
  // returned stop() is called or the share ends. Where the browser has MediaStreamTrackProcessor, frames arrive as a
  // stream, which keeps going while this tab is hidden behind the game; elsewhere it polls a video element.
  function watch(stream, ms, onFrame) {
    let on = true, last = 0;
    const track = stream.getVideoTracks()[0];
    if (globalThis.MediaStreamTrackProcessor) {
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      (async () => {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          try {
            if (on && performance.now() - last >= ms) { last = performance.now(); onFrame(value, value.displayWidth, value.displayHeight); }
          } catch (e) { console.error(e); } finally { value.close(); }
          if (!on) { reader.cancel(); break; }
        }
      })();
    } else {
      const video = document.createElement('video');
      video.muted = true; video.srcObject = stream; video.play().catch(() => {});
      const tick = () => {
        if (!on) return;
        try { if (video.videoWidth) onFrame(video, video.videoWidth, video.videoHeight); } catch (e) { console.error(e); }
        setTimeout(tick, ms);
      };
      tick();
    }
    return () => { on = false; };
  }

  return { Tracker, Follower, RING, findIcons, iconLook, picLook, lookDiff, iconDiff, whiteMask, longestRuns, placeBox, findMinimap, locateMinimap, minimapPixels, watch };
})();

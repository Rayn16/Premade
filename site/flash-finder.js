// Finds Flash on League's screen (What's new 230): a port of finder v2 (Rayan's 41 marks, 2026-11-25). Plain functions
// on 640x360 RGBA frames at 15 a second with no DOM, so flash.e2e.js runs this exact file on his fixture moments.
// Flash throws a thin upright streak of light for one frame where the champion lands. A light is a ridge of new light
// (brighter than 2 frames ago and than the pixels 4 px to each side), 30+ px tall, straight, leaning the way upright
// things lean on League's camera, white-grey; beams near each other within 0.3 s are one light. Whose: the level box at
// the left end of a health bar that arrives with it (dark red: enemy, blue-teal: ally or you), after taking out the
// camera's own move; your own Flash: its HUD slot going from ready (~119) to the cooldown shade (64-72) for 4 frames.
globalThis.FlashFinder = (() => {
  const W = 640, H = 360, FPS = 15;
  const HUD = new Uint8Array(W * H); // League's HUD: no beams there
  for (const [y0, y1, x0, x1] of [[318, H, 180, 420], [285, H, 560, W], [0, 135, 0, 82], [150, 215, 595, W], [180, 250, 0, 100], [0, 14, 0, W]])
    for (let y = y0; y < y1; y++) HUD.fill(1, y * W + x0, y * W + x1);
  const SLOTS = [[331, 340, 330, 339], [331, 340, 341, 350], [331, 340, 315, 324]]; // the D and F summoner spell slots and R (What's new 242) at 360p
  const luma = (px) => { const Y = new Float32Array(W * H); for (let i = 0, p = 0; i < Y.length; i++, p += 4) Y[i] = px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114; return Y; };
  const slotsOf = (Y) => SLOTS.map(([y0, y1, x0, x1]) => { let s = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += Y[y * W + x]; return s / ((y1 - y0) * (x1 - x0)); });

  // beam2.py beams(): the candidate beams in one frame
  function beams(Y, Yold, px) {
    const D = new Float32Array(W * H), ridge = new Uint8Array(W * H);
    for (let i = 0; i < D.length; i++) D[i] = Y[i] - Yold[i];
    let count = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, d = D[i];
      if (d < 45 || Y[i] < 110 || HUD[i]) continue;
      const side = Math.max(x >= 4 ? D[i - 4] : 255, x < W - 4 ? D[i + 4] : 255);
      if (d - side >= 15) { ridge[i] = 1; count++; }
    }
    if (count < 20) return [];
    // grow 1 px up and down before joining (compression breaks thin lines), join 8 ways, keep the ridge pixels
    const dil = new Uint8Array(W * H), lab = new Int32Array(W * H), out = [];
    for (let i = 0; i < D.length; i++) if (ridge[i]) { dil[i] = 1; if (i >= W) dil[i - W] = 1; if (i + W < D.length) dil[i + W] = 1; }
    const stack = [];
    for (let s = 0, n = 0; s < D.length; s++) {
      if (!dil[s] || lab[s]) continue;
      lab[s] = ++n; stack.push(s);
      const ys = [], xs = [];
      while (stack.length) {
        const i = stack.pop(), y = (i / W) | 0, x = i - y * W;
        if (ridge[i]) { ys.push(y); xs.push(x); }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx, j = yy * W + xx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W && dil[j] && !lab[j]) { lab[j] = n; stack.push(j); }
        }
      }
      const b = fit(ys, xs, D, px);
      if (b) out.push(b);
    }
    return out;
  }
  function fit(ys, xs, D, px) {
    const n = xs.length;
    if (!n) return null;
    let top = H, bot = -1;
    for (const y of ys) { if (y < top) top = y; if (y > bot) bot = y; }
    if (bot - top + 1 < 30 || n < 15) return null;
    let my = 0, mx = 0;
    for (let k = 0; k < n; k++) { my += ys[k]; mx += xs[k]; }
    my /= n; mx /= n;
    let syy = 0, sxy = 0;
    for (let k = 0; k < n; k++) { syy += (ys[k] - my) ** 2; sxy += (ys[k] - my) * (xs[k] - mx); }
    const a = syy ? sxy / syy : 0, b = mx - a * my;
    let e2 = 0;
    for (let k = 0; k < n; k++) e2 += (xs[k] - (a * ys[k] + b)) ** 2;
    const rms = Math.sqrt(e2 / n);
    if (Math.abs(a) > 1.2 || rms > 2) return null;
    const rows = new Int32Array(bot - top + 1), rgb = [0, 0, 0];
    for (let k = 0; k < n; k++) { rows[ys[k] - top]++; const p = (ys[k] * W + xs[k]) * 4; rgb[0] += px[p]; rgb[1] += px[p + 1]; rgb[2] += px[p + 2]; }
    let filled = 0;
    for (const r of rows) if (r) filled++;
    const xb = a * bot + b, xt = a * top + b, cy = bot, cx = Math.round(xb);
    let gs = 0, gn = 0, hi = 0;
    for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
      const y = cy + dy, x = cx + dx;
      if (dy * dy + dx * dx > 144 || y < 0 || y >= H || x < 0 || x >= W) continue;
      const d = D[y * W + x]; gs += d; gn++; if (d >= 40) hi++;
    }
    return { xb: Math.round(xb), yb: bot, xt: Math.round(xt), yt: top, len: Math.round(Math.hypot(bot - top, xb - xt)), n, wide: +(n / filled).toFixed(2),
      rgb: rgb.map((v) => Math.floor(v / n)), glowHi: +(hi / gn).toFixed(2) };
  }
  // feat.py: upright in the game world (lines lean away from (320, 515) at 360p), white-grey, 30-120 px
  const leanErr = (b) => (b.xt - b.xb) / (b.yb - b.yt) - (b.xb - 320) / (515 - b.yb);
  const colourOk = ({ rgb: [r, g, bl] }) => r - g <= 30 && g - r <= 25 && bl <= g + 10;
  const flashy = (b) => Math.abs(leanErr(b)) <= 0.12 && colourOk(b) && b.len >= 30 && b.len <= 120;

  // bars2.py find(): health-bar fills in a box, [colour, cx, cy, w]: runs of 5+ px of one bar colour, 1-5 rows tall
  const MASKS = { red: (r, g, b) => r > 130 && g < 95 && b < 95 && r - Math.max(g, b) > 60, blue: (r, g, b) => b > 130 && r < 110 && b - r > 50 && g < b, green: (r, g, b) => g > 130 && r < g + 10 && b < 120 && g - b > 50 };
  function bars(px, x0, x1, y0, y1) {
    [x0, x1, y0, y1] = [Math.max(x0, 0), Math.min(x1, W), Math.max(y0, 0), Math.min(y1, H)];
    const w = x1 - x0, h = y1 - y0, out = [];
    if (w <= 0 || h <= 0) return out;
    for (const [k, is] of Object.entries(MASKS)) {
      const m = new Uint8Array(w * h), o = new Uint8Array(w * h), lab = new Int32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = ((y0 + y) * W + x0 + x) * 4; m[y * w + x] = is(px[p], px[p + 1], px[p + 2]) ? 1 : 0; }
      for (let y = 0; y < h; y++) for (let x = 2; x < w - 2; x++) { // opening with a 1x5 line: only runs of 5 or more stay
        const i = y * w + x;
        if (m[i - 2] && m[i - 1] && m[i] && m[i + 1] && m[i + 2]) for (let d = -2; d <= 2; d++) o[i + d] = 1;
      }
      for (let s = 0, n = 0; s < o.length; s++) { // joined 4 ways
        if (!o[s] || lab[s]) continue;
        lab[s] = ++n;
        const st = [s];
        let r0 = h, r1 = -1, c0 = w, c1 = -1;
        while (st.length) {
          const i = st.pop(), y = (i / w) | 0, x = i - y * w;
          r0 = Math.min(r0, y); r1 = Math.max(r1, y); c0 = Math.min(c0, x); c1 = Math.max(c1, x);
          for (const [yy, xx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) { const j = yy * w + xx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && o[j] && !lab[j]) { lab[j] = n; st.push(j); } }
        }
        if (r1 - r0 + 1 <= 5 && c1 - c0 + 1 >= 6) out.push([k, x0 + (c0 + c1 + 1) / 2, y0 + (r0 + r1 + 1) / 2, c1 - c0 + 1]);
      }
    }
    return out;
  }
  function boxColour(px, cx, cy, w) { // v2.py: the dark pixels of the 7x8 px patch 2-9 px left of a bar's left end
    const left = Math.round(cx - w / 2), Y0 = Math.max(Math.trunc(cy) - 4, 0), Y1 = Math.min(Math.trunc(cy) + 4, H), X0 = Math.max(left - 9, 0), X1 = Math.max(left - 2, 0);
    let n = 0, r = 0, g = 0, b = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) { const p = (y * W + x) * 4; if (px[p] + px[p + 1] + px[p + 2] < 240) { n++; r += px[p]; g += px[p + 1]; b += px[p + 2]; } }
    if (n < 20) return null;
    const s = (r - g) / n + (r - b) / n;
    return s >= 20 ? 'red' : s <= -15 ? 'blue' : null;
  }
  // how far the picture moved from frame a to b, [dx, dy] px: phase correlation on the 256x256 middle of the screen
  // ponytail: v2 used 280x440 (numpy's FFT takes any size); a power of two here, so the plain radix-2 FFT does
  const N = 256, CY = 22, CX = 192;
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) for (let k = 0, cr = 1, ci = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  function fft2(re, im, inv) {
    const r = new Float64Array(N), i = new Float64Array(N);
    for (let y = 0; y < N; y++) { r.set(re.subarray(y * N, y * N + N)); i.set(im.subarray(y * N, y * N + N)); fft(r, i, inv); re.set(r, y * N); im.set(i, y * N); }
    for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x]; } fft(r, i, inv); for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y]; } }
  }
  function spectrum(Y) { const re = new Float64Array(N * N), im = new Float64Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) re[y * N + x] = Y[(CY + y) * W + CX + x]; fft2(re, im); return [re, im]; }
  function camShift(A, B) { // spectra of frames a and b
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    for (let k = 0; k < re.length; k++) { const r = A[0][k] * B[0][k] + A[1][k] * B[1][k], i = A[0][k] * B[1][k] - A[1][k] * B[0][k], m = Math.hypot(r, i) + 1e-9; re[k] = r / m; im[k] = i / m; }
    fft2(re, im, true);
    let best = 0;
    for (let k = 1; k < re.length; k++) if (re[k] > re[best]) best = k;
    let y = (best / N) | 0, x = best % N;
    if (y > N / 2) y -= N;
    if (x > N / 2) x -= N;
    return [x, y];
  }
  // v2.py arrived(): bar widths per colour that came in at the light's foot at its frame and the next, and weren't
  // there 2-3 frames before once the camera's move is taken out. fr: 12 frames { px, Y }, the light's at index 4.
  function arrived(top, fr, p) {
    const box = [top.xb - 40, top.xb + 50, top.yb - 32, top.yb + 32], near = 15, wide = [box[0] - 55, box[1] + 55, box[2] - 55, box[3] + 55];
    const before = [p - 3, p - 2].map((j) => ({ j, bars: bars(fr[j].px, ...wide) })), out = { red: 0, blue: 0, green: 0 }, spec = (f) => f.spec || (f.spec = spectrum(f.Y));
    for (const i of [p, p + 1]) {
      const moved = before.map(({ j }) => camShift(spec(fr[j]), spec(fr[i])));
      for (const [k, cx, cy, w] of bars(fr[i].px, ...box)) {
        if (before.some(({ bars: bs }, n) => bs.some(([k2, cx2, cy2]) => k2 === k && Math.abs(cx2 + moved[n][0] - cx) <= near && Math.abs(cy2 + moved[n][1] - cy) <= near))) continue;
        const c = boxColour(fr[i].px, cx, cy, w);
        if (c === 'red') out.red += w;
        else if (c === 'blue') out[k === 'green' ? 'green' : 'blue'] += w;
      }
    }
    return out;
  }
  // ffeat.py ffeat_from(): along the brightest beam, its frame p (2-6), how bright over the 2 frames before, and how
  // much is left 2 and 4 frames later
  function frameFeat(top, fr) {
    const v = fr.map(({ Y }) => {
      let s = 0, n = 0;
      for (let y = top.yt; y <= top.yb; y++) { const x = Math.round(top.xt + ((top.xb - top.xt) * (y - top.yt)) / Math.max(top.yb - top.yt, 1)); if (x >= 0 && x < W) { s += Y[y * W + x]; n++; } }
      return n ? s / n : 0;
    });
    let p = 2;
    for (let k = 3; k < 7; k++) if (v[k] > v[p]) p = k;
    const base = (v[p - 2] + v[p - 1]) / 2, peak = v[p] - base, r = (x) => +x.toFixed(2);
    return { p, peak: +peak.toFixed(1), late: r((v[p + 2] - base) / Math.max(peak, 1)), later: r((v[Math.min(p + 4, 11)] - base) / Math.max(peak, 1)) };
  }

  // The clues and their limits. P0 is v2 as locked on 2026-11-25; after each game the app re-weighs them on all of
  // Rayan's marks (retune) and keeps a version only if it scores better. LOOSE is the widest any version can go: every
  // light past it goes in the after-game check (his answer 4: everything Flash-like), so marks exist to re-weigh with.
  const P0 = { len: 45, wide: 3.0, glowHi: 0.4, n: 4, busy: 2, peak: 70, late: 0.2, later: 0.3, red: 12 };
  const LOOSE = { len: 34, wide: 2.5, glowHi: 0.25, n: 6, busy: 3, peak: 50, late: 0.4, later: 0.5, red: 4 };
  const loose = (l) => l.ingame && !l.self && l.len >= LOOSE.len && l.wide >= LOOSE.wide && l.glowHi >= LOOSE.glowHi && l.n <= LOOSE.n && l.busy <= LOOSE.busy && l.p >= 3 && l.p <= 5 && l.peak >= LOOSE.peak && l.late <= LOOSE.late && l.later <= LOOSE.later;
  function team(a, red = 12) {
    if (a.red >= red && a.red > a.blue + a.green) return 'enemy';
    if (a.green >= 12 && a.green >= a.blue) return 'self';
    if (a.blue >= 12) return 'ally';
    return '?';
  }
  // what a version says a light is: enemy, ally, self, ? (Flash, whose not known) or no (not Flash)
  function call(l, P = P0) {
    if (!l.ingame) return 'no';
    if (l.self) return 'self';
    const ok = l.len >= P.len && l.wide >= P.wide && l.glowHi >= P.glowHi && l.n <= P.n && l.busy <= P.busy && (l.p === 4 || l.p === 5) && l.peak >= P.peak && l.late <= P.late && l.later <= P.later;
    return ok ? team(l.arr, P.red) : 'no';
  }
  // a version on lights Rayan marked (enemy, ally, mine, no; unsure doesn't count): enemy calls right and wrong, his
  // enemy Flashes caught and missed. A wrong timer costs twice a missed one. P null: the calls made in the game.
  function score(lights, P) {
    const s = { right: 0, wrong: 0, caught: 0, missed: 0 };
    for (const l of lights) {
      if (!l.mark || l.mark === 'unsure') continue;
      const en = (P ? call(l, P) : l.call) === 'enemy';
      if (en) s[l.mark === 'enemy' ? 'right' : 'wrong']++;
      if (l.mark === 'enemy') s[en ? 'caught' : 'missed']++;
    }
    s.points = s.right - 2 * s.wrong;
    return s;
  }
  // re-weigh the clues: each limit in turn through its steps (inside LOOSE), the best one kept, three times over
  const STEPS = { len: [34, 60, 2], wide: [2.5, 3.6, 0.1], glowHi: [0.25, 0.6, 0.05], n: [2, 6, 1], busy: [0, 3, 1], peak: [50, 110, 5], late: [0.1, 0.4, 0.05], later: [0.15, 0.5, 0.05], red: [4, 30, 2] };
  function retune(lights, P = P0) {
    let best = { ...P }, top = score(lights, best).points; // P given: the version to beat
    for (let pass = 0; pass < 3; pass++) for (const [k, [a, b, d]] of Object.entries(STEPS)) for (let v = a; v <= b + 1e-9; v += d) {
      const Q = { ...best, [k]: +v.toFixed(2) }, s = score(lights, Q).points;
      if (s > top) { top = s; best = Q; }
    }
    return best;
  }
  // Which enemy: the one whose minimap icon jumped (5-12 px on a 210 px minimap: 0.02-0.06 of it) within 0.6 s of the
  // light. foes: [{ id, trail: [{ x, y, t (ms) }] }]. Their ids, nearest jump first.
  function jumped(foes, at) {
    const out = [];
    for (const f of foes) for (let k = 1; k < (f.trail || []).length; k++) {
      const a = f.trail[k - 1], b = f.trail[k], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.abs(b.t - at) <= 600 && b.t - a.t <= 450 && d >= 0.02 && d <= 0.06) { out.push([Math.abs(b.t - at), f.id]); break; }
    }
    return out.sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  }

  // The finder for one game: push each 640x360 frame (15 a second) with its time (ms); it says when a light starts
  // (started: { id, fi, xb, yb, yt }, for its replay pictures) and, a second later, what it was (done: lights with their
  // clues). flashSlot: 0 when your Flash is on D, 1 on F. ultAt (What's new 242): when your R slot last went from ready to
  // its cooldown shade (under 72% of its light before, for 4 frames), the time you used your ultimate.
  // ponytail: a fixed spot for R on his HUD (x 315-324 at 360p) and a relative drop, as icons differ; tune on recordings
  function create() {
    const ring = [], recent = [], open = [], slots = [];
    let fi = 0, ids = 0;
    const f = { flashSlot: 1, frames: 0, ultAt: 0, push };
    function push(px, t) {
      const Y = luma(px), started = [], done = [];
      slots.push([t, ...slotsOf(Y)]);
      if (slots.length > 45) slots.shift();
      const i = slots.length - 4, v = slots.map((x) => x[3]), was = i >= 2 && Math.max(v[i - 2], v[i - 1]);
      if (was >= 95 && (!f.ultAt || t - f.ultAt > 3000) && Math.min(slots[i][1], slots[i][2]) >= 40 && v.slice(i).every((y) => y >= 30 && y <= 0.72 * was)) f.ultAt = slots[i][0];
      ring.push({ fi, t, px, Y });
      if (ring.length > 22) ring.shift();
      const old = ring.length >= 3 && ring[ring.length - 3];
      if (old && old.fi === fi - 2) for (const b of beams(Y, old.Y, px).filter(flashy)) {
        recent.push({ t, b });
        const e = open.slice(-6).reverse().find((e) => t - e.t1 <= 300 && Math.abs(b.xb - e.last.xb) <= 50 && Math.abs(b.yb - e.last.yb) <= 50);
        if (e) { e.beams.push(b); e.t1 = t; e.last = b; continue; }
        const n = { id: ++ids, fi, t, t1: t, last: b, beams: [b], first: b };
        open.push(n);
        started.push({ id: n.id, fi, xb: b.xb, yb: b.yb, yt: b.yt });
      }
      while (recent.length && t - recent[0].t > 2500) recent.shift();
      for (const e of open.filter((e) => fi - e.fi >= 15)) { open.splice(open.indexOf(e), 1); const l = finish(e); if (l) done.push(l); }
      fi++; f.frames++;
      return { started, done };
    }
    function finish(e) {
      const top = e.beams.reduce((a, b) => (b.len > a.len ? b : a)), fr = ring.filter((r) => r.fi >= e.fi - 4 && r.fi <= e.fi + 7);
      if (fr.length < 12) return null;
      const busy = recent.filter((r) => Math.abs(r.t - e.t) <= 1000 && !e.beams.includes(r.b) && Math.abs(r.b.xb - e.first.xb) <= 60 && Math.abs(r.b.yb - e.first.yb) <= 60).length;
      const s = slots.find((x) => x[0] === e.t), v = slots.map((x) => x[1 + f.flashSlot]);
      const self = slots.some((x, i) => i >= 2 && i + 3 < slots.length && Math.abs(x[0] - e.t) <= 350 && Math.max(v[i - 2], v[i - 1]) >= 110 && v.slice(i, i + 4).every((y) => y >= 64 && y <= 72));
      const l = { id: e.id, t: e.t, xb: top.xb, yb: top.yb, xt: top.xt, yt: top.yt, len: top.len, wide: Math.max(...e.beams.map((b) => b.wide)), glowHi: Math.max(...e.beams.map((b) => b.glowHi)), n: e.beams.length, busy,
        ingame: !!s && Math.min(s[1], s[2]) >= 40, self, ...frameFeat(top, fr) };
      l.arr = l.ingame && !self && l.len >= LOOSE.len ? arrived(top, fr, l.p) : { red: 0, blue: 0, green: 0 }; // the slow part, for the lights that can count
      for (const r of fr) r.spec = null;
      return l;
    }
    return f;
  }
  return { W, H, FPS, P0, LOOSE, luma, slotsOf, beams, flashy, bars, boxColour, arrived, frameFeat, team, call, loose, score, retune, jumped, create };
})();

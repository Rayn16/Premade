// Summoner's Rift terrain on a 128x128 grid over the map (0..1 across, 0..1 down): 0 open, 1 wall, 2 river, 3 brush.
// Built from the map's navigation grid (LeagueSandbox-Default AIMesh/Map11, a 2022 version of the Rift, so newer
// terrain changes are missing): walls are cells you can't walk on, river is the river region, brush is grass.
// at(u, v) takes a spot on the map (Riot's positions over the map's width). The rest take spots read off the minimap
// (0..1 of the square the tracker finds, its frame included) and move them onto the map first: atMinimap(p) is at() for
// such a spot, muffle(listener, speaker) says how much terrain sits between two players, 0 (none) to 1 (fully muffled),
// and bushed(listener, speaker) whether the speaker is hidden in a bush.
globalThis.Terrain = (() => {
  const G = 128, MAP = 14870;
  const bytes = Uint8Array.from(atob('VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQFUVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAEBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVFQAAAAAAQBUAQFVVVVVVVVVVVVVVVVVVVVVVVVVVVVUBAAAAAAAAAABQVVVVVVVVVVVVVQUAAADA/wAAAAAAAAAAAAAAAAAAAFBVVVVVVVVVAQAAAAAAAMD/AAAAAAAAAAAAAAAAAAAAVFVVVVVVVQEAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVX1AAAABAAAAAAAAAAAAAAAABBABQAAAAAAAFVVVVVVVf0AAAAAAAAAAAAAAAAAAAAAFEAVAAAAAAAAVVVVVVX1/wAAAAAAAAAAAAAAAAAAAAAAAAUAAAAVAABVVVVVVfA/AAAAAAAAAAAAAEAFAAAAAAAAAAAAQFUBAFVVVVXV8wMAAAAAAAAAAAAAAAEAAAAAAAAAAABAVQEAVVVVVfUDAAAAAAAAAAAAAAAAAAAAAAQAAAAAAEFVAQBVVVVV/QMAAAAAVFUFUFUBVVVVAFQAFQAAAABARVUBAFVVVVX/AwAAAABVVQVcVQFVVVUBVAAVAAAAAAAAVQAAVVVV1f8AAAAUAFVV9X9VAFRVVQVUARUAAAAAAAAAAABVVVUFPAAAQFUAVFX1/wAAQFVVBVABFQAAAAAAAAEAAFVVVfUAAABQVQAAQPU/AAAAVVUFUAEVABQAAABABQAAVVVV/QMAAFBVAQAAAAAAAABUVQBQARUAFAAAAAAAAABVVVX9AwAAUFUBAAAAAABQAQAAAFQBFAAAAAAAAAAAAFVVVf0AAABQVQUAAABAAVQFAAAAVQEUAAAAAAAAAABAVVVV/wAAAEBVFfAFAFQBVAUAAEBVARQAAAAAAAAAAEBVVVU/AAAAalVV/1dVVQVVBQAAUFUBVAAAAAAAAAAAQFVVVQAAAKCqVFX/Q1VVVVUF8P9AVQFQAAAAAAAAAABAVVVVAAAAoKpQVf8DUFVVVQXw/0BVAVAAAEABAAAAAEBVVVUAAACgqkLV/wAAVQUAAHDVAFUNUAEAUAEAAAAAQFVVVQAA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VUBVFUBVFQAAAAD/VVVVVVUAUFUAAAAAAAAUAAAAAAAAAAAAAAAAAAAAwH9VVVVVVQBQVQAAAAAAAAAAAABAAQAAAAAAAAAAAAD8X1VVVVVVAEBVAAAAAAAAAAAAAEABAAAAAAAAAAAAAP9XVVVVVVUAAAAAAAAVAAUAAAAAAAAAAAAAAAAAAAAA/1VVVVVVVQAAAAAAABUABQAAAAAAAAAAAAAAAAAAAABfVVVVVVVVAAAAAAAAFAAAAAAAAAAAAAAAAAAAEAAAAFVVVVVVVVUAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAABUVVVVVVVVFQAAAAAAAAAAAAAAAAAAAPwDAAAAABBUVVVVVVVVVVUBAAAAAAAAAAAAAAAAAAAA/ANAVVVVVVVVVVVVVVVVVQAAAAAAAAAAAABUVVVVVVVVVVVVVVVVVVVVVVVVVVVVAABAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUAAFBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQEAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVFVBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ=='), (c) => c.charCodeAt(0));
  const at = (u, v) => {
    const x = Math.floor(u * G), y = Math.floor(v * G);
    if (x < 0 || y < 0 || x >= G || y >= G) return 1;
    const i = y * G + x;
    return (bytes[i >> 2] >> ((i & 3) * 2)) & 3;
  };
  // brush within one cell, since positions read off the minimap can be a little off
  const inBrush = (p) => [-1, 0, 1].some((j) => [-1, 0, 1].some((i) => at(p.x + i / G, p.y + j / G) === 3));
  const WALL = 350;    // units of wall between you for a fully muffled voice
  const RIVER = 1500;  // units of river between you for the river's full share (RIVER_MAX)
  const RIVER_MAX = 0.4, BRUSH = 0.85; // a voice in a bush: about 1 kHz of treble left and 60% of the volume
  function muffle(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d * G * 2), step = MAP / G / 2;
    let wall = 0, river = 0;
    for (let k = 2; k <= n - 2; k++) { // skips the ends: players stand next to walls, and positions are a bit rough
      const t = at(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
      if (t === 1) wall += step;
      if (t === 2) river += step;
    }
    const bothRiver = at(a.x, a.y) === 2 && at(b.x, b.y) === 2;
    return Math.min(1, wall / WALL + (bothRiver ? 0 : Math.min(RIVER_MAX, river / RIVER)) + (bushed(a, b) ? BRUSH : 0));
  }
  // a speaker in a bush, unless you're in it with them
  const bushed = (a, b) => inBrush(b) && !(inBrush(a) && Math.hypot(b.x - a.x, b.y - a.y) * MAP < 600);
  // Where the map sits on the minimap, inside its frame: where this grid lines up best with Rayan's real minimap
  // (Practice Tool, smallest Minimap Scale, 2026-10-17; terrain.test.js checks it). Without it walls were about 5% off.
  const onMinimap = { x: 0.05, y: 0.045, w: 0.9175, h: 0.91 };
  const onMap = (p) => ({ x: (p.x - onMinimap.x) / onMinimap.w, y: (p.y - onMinimap.y) / onMinimap.h });
  // The gank clock (What's new 237): walking distance in game units from a spot on the minimap to every cell (8
  // neighbours, never cutting past a wall's corner; Infinity where nobody can walk), Dijkstra over the grid, ~5 ms a pass.
  // A spot read on a wall cell (a camp icon, a rough read) walks from the open cells 1 round it, else 2 (2 at once can
  // hop a thin wall). Distances stay in a Float64Array: with Float32 the stale-entry check skips most of the map.
  const CELL = MAP / G;
  let open = null;
  const ring = (p) => { // the open cells at a minimap spot, else 1 round it, else 2: [[cell, units to it]]
    if (!open) { open = new Uint8Array(G * G); for (let i = 0; i < G * G; i++) open[i] = at(((i % G) + 0.5) / G, (((i / G) | 0) + 0.5) / G) !== 1; }
    const m = onMap(p), x = Math.floor(m.x * G), y = Math.floor(m.y * G);
    for (let r = 0; r <= 2; r++) {
      const out = [];
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (x + i >= 0 && y + j >= 0 && x + i < G && y + j < G && open[(y + j) * G + x + i]) out.push([(y + j) * G + x + i, Math.hypot(i, j) * CELL]);
      if (out.length) return out;
    }
    return [];
  };
  function walk(p) {
    const D = new Float64Array(G * G).fill(Infinity), h = [];
    const push = (d, i) => { h.push([d, i]); let k = h.length - 1; while (k) { const q = (k - 1) >> 1; if (h[q][0] <= h[k][0]) break; [h[q], h[k]] = [h[k], h[q]]; k = q; } };
    const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === k) break; [h[m], h[k]] = [h[k], h[m]]; k = m; } } return top; };
    for (const [i, d] of ring(p)) if (d < D[i]) { D[i] = d; push(d, i); }
    while (h.length) {
      const [d, i] = pop();
      if (d > D[i]) continue;
      const x = i % G, y = (i / G) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * G + nx;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= G || ny >= G || !open[j] || (dx && dy && (!open[y * G + nx] || !open[ny * G + x]))) continue;
        const nd = d + (dx && dy ? Math.SQRT2 : 1) * CELL;
        if (nd < D[j]) { D[j] = nd; push(nd, j); }
      }
    }
    return D;
  }
  const walkTo = (D, p) => ring(p).reduce((m, [i, d]) => Math.min(m, D[i] + d), Infinity); // a pass read at another minimap spot
  // the outline of everywhere within max units on a pass, as one shape: walls up to 2 cells from it count as inside, and
  // so does anything it closes round, so only its outer edge is drawn. An SVG path over the grid (0 to 128 across the map)
  function outline(D, max) {
    const inR = new Uint8Array(G * G), out = new Uint8Array(G * G), todo = [];
    for (let i = 0; i < G * G; i++) if (D[i] <= max) {
      inR[i] = 1;
      const x = i % G, y = (i / G) | 0;
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) { const u = x + k, v = y + j; if (u >= 0 && v >= 0 && u < G && v < G && !open[v * G + u]) inR[v * G + u] ||= 2; }
    }
    for (let i = 0; i < G * G; i++) if (!inR[i] && (i % G === 0 || i % G === G - 1 || i < G || i >= G * (G - 1))) { out[i] = 1; todo.push(i); } // from the map's edge in
    while (todo.length) {
      const i = todo.pop(), x = i % G, y = (i / G) | 0;
      for (const j of [x > 0 && i - 1, x < G - 1 && i + 1, y > 0 && i - G, y < G - 1 && i + G]) if (j !== false && !inR[j] && !out[j]) { out[j] = 1; todo.push(j); }
    }
    const edge = (x, y) => x < 0 || y < 0 || x >= G || y >= G || out[y * G + x];
    let s = '';
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (!out[y * G + x] && inR[y * G + x]) {
      if (edge(x, y - 1)) s += `M${x} ${y}h1`;
      if (edge(x, y + 1)) s += `M${x} ${y + 1}h1`;
      if (edge(x - 1, y)) s += `M${x} ${y}v1`;
      if (edge(x + 1, y)) s += `M${x + 1} ${y}v1`;
    }
    return s;
  }
  return {
    walk, walkTo, outline,
    at, onMinimap,
    atMinimap: (p) => { const m = onMap(p); return at(m.x, m.y); },
    inBrush: (p) => inBrush(onMap(p)),
    bushed: (a, b) => bushed(onMap(a), onMap(b)),
    muffle: (a, b) => muffle(onMap(a), onMap(b)),
  };
})();

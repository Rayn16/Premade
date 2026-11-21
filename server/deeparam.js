// DeepARAM's champion page (deeparam.com/champions/<id>), read for Premade's ARAM: Mayhem augment cards. It's a Next.js
// page: its data comes as React Server Component rows ("<id>:<JSON>" lines inside the JavaScript strings of its
// self.__next_f scripts), and its elements point at other rows with "$L<id>". Read: the patch, each augment (rarity,
// pick rate, DeepScore and its tier, Boost: the win rate points it adds, from lift), its Augment synergies (the top 5
// pairs, each with why they go together), each core build (4 items, then the rest but never the Rush parts, its win
// rate and pick rate in % and Boost in points, and the ids of the augments that fit it) and the champion's Mayhem
// changes (ability, what, Summoner's Rift, Mayhem). A Worker's CPU time is short (10 ms), so it's read off the page's
// escaped text, and only the rows of those parts are decoded. items: the first build, for pages of 13 Nov.
const text = (s) => JSON.parse(`"${s}"`); // a script string's escaped text, as it reads
export function deepAram(html) {
  const patch = /<meta name="description" content="[^"]*?patch (\d+\.\d+)/i.exec(html)?.[1] || '';
  const rows = [];
  for (const m of html.matchAll(/\\"id\\":(\d+),\\"name\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\",\\"tags\\":\[[^\]]*\],\\"rarity\\":\\"(silver|gold|prismatic)\\",\\"pickRate\\":([0-9.]+)(.*?)\\"deepScore\\":([0-9]+),\\"href\\":\\"\/augments\/([^\\"]+)\\"/g)) {
    let name;
    try { name = text(m[2]); } catch { continue; }
    const score = +m[6], lift = /\\"lift\\":(-?[0-9.]+(?:e-?[0-9]+)?)/.exec(m[5]);
    rows.push({ id: +m[1], name, rarity: m[3], pickRate: +m[4], deepScore: score, tier: score >= 70 ? 'S' : score >= 59 ? 'A' : score >= 44 ? 'B' : score >= 32 ? 'C' : 'D', href: m[7], ...(lift && { boost: Math.round(+lift[1] * 1000) / 10 }) });
  }
  // the page's other parts are React elements in rows of their own: each part's row is found by a word in it (in the
  // escaped text, so nothing is decoded first), then decoded with the rows it points at by "$L<id>"
  const at = [];
  for (const m of html.matchAll(/(?:\[1,"|(?<!\\)\\n)([0-9a-f]+):/g)) at.push([m[1], m.index + m[0].length]);
  const ids = new Map(at), got = new Map();
  const row = (k) => {
    if (!got.has(k)) { const re = /(?:[^\\"]|\\[^n])*/y; re.lastIndex = ids.get(k); got.set(k, null); try { got.set(k, JSON.parse(text(re.exec(html)[0]))); } catch {} }
    return got.get(k);
  };
  const rowsWith = (w) => { const out = new Set(); for (let i = html.indexOf(w); i >= 0; i = html.indexOf(w, i + 1)) { const r = at.findLast(([, j]) => j <= i); if (r) out.add(r[0]); } return [...out]; };
  // a row's elements as a flat list in page order: { cls (its own and its parents' classNames), t (a text), item, aug }
  const flat = (k, seen = new Set()) => {
    const out = [];
    seen.add(k);
    const walk = (n, cls) => {
      if (typeof n === 'string') { const r = /^\$L?([0-9a-f]+)$/.exec(n); if (r && ids.has(r[1])) { if (!seen.has(r[1])) { seen.add(r[1]); walk(row(r[1]), cls); } } else if (n.trim()) out.push({ cls, t: n.trim() }); }
      else if (Array.isArray(n)) { if (n[0] === '$') walk(n[3], cls); else n.forEach((x) => walk(x, cls)); }
      else if (n && typeof n === 'object') {
        const c = typeof n.className === 'string' ? `${cls} ${n.className}` : cls;
        if (n.kind === 'items' && Number.isInteger(n.id)) out.push({ cls: c, item: n.id });
        else if (typeof n.children === 'string' && n.v && typeof n.v === 'object') out.push({ cls: c, t: n.children.replace(/\{(\w+)\}/g, (m, w) => n.v[w] ?? m) }); // "{n} pts" with v: { n: '+3.6' }
        else if (n.kind === 'augments' && Number.isInteger(n.id)) out.push({ cls: c, aug: n.id, name: typeof n.children === 'string' ? n.children : '' });
        else if ('children' in n) walk(n.children, c);
      }
    };
    walk(row(k), '');
    return out;
  };
  const words = (l) => l.filter((x) => x.t).map((x) => x.t).join(' ');
  const has = (x, c) => ` ${x.cls} `.includes(` ${c} `);
  // Augment synergies: its 5 rows (cp-row), each two augments and why they go together (cp-pair-why)
  const pairs = [], why = [];
  for (const k of rowsWith('\\"id\\":\\"combos\\"').slice(0, 1)) {
    const l = flat(k).filter((x) => has(x, 'cp-row'));
    for (let i = 0; i < l.length && pairs.length < 5; ) {
      const a = l.slice(i).filter((x) => x.aug).slice(0, 2), j = l.indexOf(a[1]);
      if (a.length < 2) break;
      const rest = l.slice(j + 1), next = rest.findIndex((x) => x.aug), w = (next < 0 ? rest : rest.slice(0, next)).filter((x) => has(x, 'cp-pair-why'));
      pairs.push([a[0].name, a[1].name]);
      why.push(words(w));
      i = j + 1;
    }
  }
  // the core builds, in page order from the rows that hold them (each row once): each from its "Best core build" to the
  // next one, its 4 items (cp-buy-order), then the rest (cp-rest), never the Rush parts (cp-rush), its win rate, pick
  // rate and Boost (its first cp-mini: "48.4% ± 0.3 Win rate 7.9% Pick rate +3.6 pts Win rate boost"), and the
  // augments between its "Best augments" and "Best skill order"
  const builds = [], num = (s) => (s ? +s.replace('−', '-') : null), seen = new Set(), all = [];
  for (const k of rowsWith('cp-best-wide')) if (!seen.has(k)) all.push(...flat(k, seen));
  const heads = all.map((x, i) => (x.t === 'Best core build' ? i : -1)).filter((i) => i >= 0);
  heads.forEach((h, j) => {
    const l = all.slice(h, heads[j + 1]), core = l.filter((x) => x.item && has(x, 'cp-buy-order')).map((x) => x.item);
    if (core.length < 3 || builds.some((b) => b.items.join() === core.join())) return;
    const m0 = l.findIndex((x) => has(x, 'cp-mini')), m1 = l.findIndex((x, i) => i > m0 && !has(x, 'cp-mini')), mini = m0 < 0 ? '' : words(l.slice(m0, m1 < 0 ? undefined : m1));
    const a = l.findIndex((x) => x.t === 'Best augments'), b = l.findIndex((x, i) => i > a && x.t === 'Best skill order');
    builds.push({ items: core, then: [...new Set(l.filter((x) => x.item && has(x, 'cp-rest') && !has(x, 'cp-rush')).map((x) => x.item))].filter((id) => !core.includes(id)),
      win: num(/([0-9.]+)%[^%]*?Win rate/.exec(mini)?.[1]), pick: num(/([0-9.]+)%\s*Pick rate/.exec(mini)?.[1]), boost: num(/([+−-]?[0-9.]+)\s*pts\s*Win rate boost/.exec(mini)?.[1]),
      augs: a < 0 ? [] : [...new Set(l.slice(a, b < 0 ? undefined : b).filter((x) => x.aug).map((x) => x.aug))] });
  });
  const items = builds.length ? [...builds[0].items, ...builds[0].then] : []; // the page of 13 Nov reads the first build only
  // Mayhem changes: its table's rows, each [ability, what, Summoner's Rift, Mayhem]
  const changes = [];
  const deref = (n) => { const r = typeof n === 'string' && /^\$L?([0-9a-f]+)$/.exec(n); return r && ids.has(r[1]) ? row(r[1]) : n; };
  const txt = (n) => { n = deref(n); return typeof n === 'string' ? n : Array.isArray(n) ? (n[0] === '$' ? txt(n[3]) : n.map(txt).join(' ')) : n && typeof n === 'object' ? ('children' in n ? txt(n.children) : typeof n.name === 'string' ? n.name : '') : ''; }; // a cell's parts: "W Volley", "Cooldown" (a name only)
  const els = (n, types, out = []) => { n = deref(n); if (Array.isArray(n)) { if (n[0] !== '$') n.forEach((x) => els(x, types, out)); else if (types.includes(n[1])) out.push(n); else els(n[3], types, out); } else if (n && typeof n === 'object') els(n.children, types, out); return out; };
  for (const k of rowsWith('\\"id\\":\\"changes\\"').slice(0, 1)) for (const tr of els(row(k), ['tr'])) {
    const c = els(tr[3], ['td', 'th']).map((x) => txt(x).replace(/[▲▼]/g, '').replace(/\s+/g, ' ').trim());
    if (c.length === 4 && els(tr[3], ['td']).length) changes.push(c);
  }
  return { patch, rows, pairs, why, items, builds, changes };
}

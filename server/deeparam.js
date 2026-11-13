// DeepARAM's champion page (deeparam.com/champions/<id>), read for Premade's ARAM: Mayhem augment cards. It's a Next.js
// page: its data comes as React Server Component rows ("<id>:<JSON>" lines inside the JavaScript strings of its
// self.__next_f scripts), and its elements point at other rows with "$L<id>". Read: the patch, each augment (rarity,
// pick rate, DeepScore and its tier, Boost: the win rate points it adds, from lift), the 2 best augment pairs, and the
// build its side panel shows (the best core build, then the top 4th, 5th and 6th item), as Riot item ids in buying
// order. A Worker's CPU time is short (10 ms), so it's read off the page's escaped text, and only the side panel's
// rows are decoded.
const text = (s) => JSON.parse(`"${s}"`); // a script string's escaped text, as it reads
export function deepAram(html) {
  const patch = /<meta name="description" content="[^"]*?patch (\d+\.\d+)/i.exec(html)?.[1] || '';
  const rows = [], pairs = [], items = [];
  for (const m of html.matchAll(/\\"id\\":(\d+),\\"name\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\",\\"tags\\":\[[^\]]*\],\\"rarity\\":\\"(silver|gold|prismatic)\\",\\"pickRate\\":([0-9.]+)(.*?)\\"deepScore\\":([0-9]+),\\"href\\":\\"\/augments\/([^\\"]+)\\"/g)) {
    let name;
    try { name = text(m[2]); } catch { continue; }
    const score = +m[6], lift = /\\"lift\\":(-?[0-9.]+(?:e-?[0-9]+)?)/.exec(m[5]);
    rows.push({ id: +m[1], name, rarity: m[3], pickRate: +m[4], deepScore: score, tier: score >= 70 ? 'S' : score >= 59 ? 'A' : score >= 44 ? 'B' : score >= 32 ? 'C' : 'D', href: m[7], ...(lift && { boost: Math.round(+lift[1] * 1000) / 10 }) });
  }
  // the Augment combos table's first 2 rows (before the next table's label)
  const c = /\\"id\\":\\"combos\\",\\"label\\":\\"[^\\"]*\\",\\"what\\":/.exec(html);
  if (c) {
    const end = html.indexOf('\\"label\\":', c.index + c[0].length), re = /\\"names\\":\[\{[^{}]*?\\"name\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\"\},\{[^{}]*?\\"name\\":\\"((?:[^\\"\\\\]|\\\\.)*)\\"\}\]/g;
    re.lastIndex = c.index;
    for (let m, k = 0; k < 2 && (m = re.exec(html)) && (end < 0 || m.index < end); k++) try { pairs.push([text(m[1]), text(m[2])]); } catch {}
  }
  // the side panel in page order (its headings' words and its items' ids), the rows it points at decoded as needed
  const at = new Map(), got = new Map();
  for (const m of html.matchAll(/(?:\[1,"|\\n)([0-9a-f]+):/g)) at.set(m[1], m.index + m[0].length);
  const row = (k) => {
    if (!got.has(k)) { const re = /(?:[^\\"]|\\[^n])*/y; re.lastIndex = at.get(k); try { got.set(k, JSON.parse(text(re.exec(html)[0]))); } catch { got.set(k, null); } }
    return got.get(k);
  };
  const words = [], seen = new Set();
  const walk = (n) => {
    if (words.at(-1) === 'Best skill order') return; // the panel's end
    if (typeof n === 'string') { const r = /^\$L?([0-9a-f]+)$/.exec(n); if (r && at.has(r[1])) { if (!seen.has(r[1])) { seen.add(r[1]); walk(row(r[1])); } } else words.push(n); }
    else if (Array.isArray(n)) { if (n[0] === '$') walk(n[3]); else n.forEach(walk); }
    else if (n && typeof n === 'object') { if (n.kind === 'items' && Number.isInteger(n.id)) words.push(n.id); if ('children' in n) walk(n.children); }
  };
  const p = html.indexOf('\\"children\\":\\"Best core build\\"'), side = p < 0 ? null : [...at].filter(([, i]) => i < p).pop();
  if (side) { seen.add(side[0]); walk(row(side[0])); }
  const from = (w, upTo) => { const i = words.indexOf(w), j = upTo ? words.indexOf(upTo, i) : -1; return i < 0 ? [] : words.slice(i + 1, j > i ? j : undefined).filter(Number.isInteger); };
  if (from('Best core build').length) items.push(...new Set([...from('Best core build', '4th item'), ...['4th item', '5th item', '6th item'].map((h) => from(h)[0]).filter(Boolean)]));
  return { patch, rows, pairs, items };
}

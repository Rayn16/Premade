// DeepARAM's champion page (deeparam.com/champions/<id>), read for Premade's ARAM: Mayhem augment cards. It's a Next.js
// page: its data comes as React Server Component rows ("<id>:<JSON>" lines) pushed by self.__next_f scripts, and its
// elements point at later rows with "$L<id>". Read: the patch, each augment (rarity, pick rate, DeepScore and its tier,
// Boost: the win rate points it adds, from lift), the 2 best augment pairs, and the build its side panel shows (the
// best core build, then the top 4th, 5th and 6th item), as Riot item ids in buying order.
export function deepAram(html) {
  const patch = /<meta name="description" content="[^"]*?patch (\d+\.\d+)/i.exec(html)?.[1] || '';
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("[^"\\]*(?:\\.[^"\\]*)*")\]\)/g)) try { flight += JSON.parse(m[1]); } catch {}
  const raw = {}, got = {}; // each row's JSON, parsed only when it's used (Workers' CPU time is short)
  for (const line of flight.split('\n')) { const m = /^([0-9a-f]+):([[{].*)$/.exec(line); if (m) raw[m[1]] = m[2]; }
  const row = (k) => { if (k && !(k in got)) try { got[k] = JSON.parse(raw[k]); } catch { got[k] = null; } return k ? got[k] : null; };
  const rowWith = (...s) => Object.keys(raw).find((k) => s.every((x) => raw[k].includes(x)));
  const find = (n, ok) => { if (ok(n)) return n; if (n && typeof n === 'object') for (const v of Object.values(n)) { const r = find(v, ok); if (r) return r; } return null; };
  const table = (s, ok) => find(row(rowWith(...s)), (n) => !!n && Array.isArray(n.rows) && ok(n))?.rows || [];
  const rows = table(['"deepScore":', '"rarity":'], (t) => t.rows.some((r) => r && r.deepScore != null && r.rarity)).filter((r) => r && typeof r.name === 'string' && /^(silver|gold|prismatic)$/.test(r.rarity) && Number.isFinite(r.deepScore)).map((r) => {
    const score = Math.round(r.deepScore), href = /^\/augments\/([^/?#]+)$/.exec(r.href || '');
    return { id: r.id | 0, name: r.name, rarity: r.rarity, pickRate: +r.pickRate || 0, deepScore: score, tier: score >= 70 ? 'S' : score >= 59 ? 'A' : score >= 44 ? 'B' : score >= 32 ? 'C' : 'D',
      ...(href && { href: href[1] }), ...(Number.isFinite(r.lift) && { boost: Math.round(r.lift * 1000) / 10 }) };
  });
  const pairs = table(['"id":"combos"', '"names":['], (t) => t.id === 'combos').slice(0, 2).map((r) => (r.names || []).map((n) => String(n.name))).filter((p) => p.length === 2);
  // the side panel in page order: its headings' words and the items' ids
  const words = [], seen = new Set();
  const walk = (n) => {
    if (typeof n === 'string') { const r = /^\$L?([0-9a-f]+)$/.exec(n); if (r && r[1] in raw) { if (!seen.has(r[1])) { seen.add(r[1]); walk(row(r[1])); } } else words.push(n); }
    else if (Array.isArray(n)) { if (n[0] === '$') walk(n[3]); else n.forEach(walk); }
    else if (n && typeof n === 'object') { if (n.kind === 'items' && Number.isInteger(n.id)) words.push(n.id); if ('children' in n) walk(n.children); }
  };
  const side = rowWith('"Best core build"');
  if (side) { seen.add(side); walk(row(side)); }
  const from = (w, upTo) => { const i = words.indexOf(w), j = upTo ? words.indexOf(upTo, i) : -1; return i < 0 ? [] : words.slice(i + 1, j > i ? j : undefined).filter(Number.isInteger); };
  const items = [...new Set([...from('Best core build', '4th item'), ...['4th item', '5th item', '6th item'].map((h) => from(h)[0]).filter(Boolean)])];
  return { patch, rows, pairs, items: from('Best core build').length ? items : [] };
}

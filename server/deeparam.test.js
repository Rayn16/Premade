// Checks deeparam.js on a small made-up page of the shape DeepARAM's champion pages have (never its real page): the
// patch, each augment with its tier and Boost, the 2 best pairs, and the side panel's build in buying order (with a
// row the panel points at by "$L"), and an empty answer for a page that changed.
//   node deeparam.test.js
const assert = require('assert');
const push = (rows) => `<script>self.__next_f.push([1,${JSON.stringify(rows.join('\n') + '\n')}])</script>`;
const el = (type, props) => ['$', type, null, props], item = (id, name) => el('span', { className: 'cp-named', children: el('$L54', { kind: 'items', id, children: name }) });
const head = (w) => el('h4', { children: el('$L35', { ns: 'champions', children: w }) });
const side = el('aside', { className: 'cp-side', children: [
  el('div', { children: [head('Best augments'), el('div', { children: [] })] }),
  el('div', { children: [head('Best core build'), el('div', { children: [item(3158, 'Ionian Boots of Lucidity'), item(3118, 'Malignance'), '$L5f'] })] }),
  el('div', { children: [head('4th item'), item(4645, 'Shadowflame'), item(3089, 'Rabadon’s Deathcap')] }),
  el('div', { children: [head('5th item'), item(3089, 'Rabadon’s Deathcap'), item(3137, 'Cryptbloom')] }),
  el('div', { children: [head('6th item'), item(3137, 'Cryptbloom')] }),
  el('div', { children: [head('Best skill order'), item(9999, 'not an item of the build')] }),
] });
const aug = (id, name, rarity, pickRate, lift, deepScore) => ({ id, name, tags: [], rarity, pickRate, winRate: '$undefined', lift, stages: [0.25, 0.25, 0.25, 0.25], deepScore, href: `/augments/${name.toLowerCase().replace(/\W+/g, '-')}`, desc: 'Text "with" quotes\nand a line', changesBuild: false });
const page = '<html><head><meta name="description" content="Ashe in ARAM Mayhem: D tier, 43.4% win rate on patch 26.22. Best augments: A, B."></head><body>'
  + push(['0:{"P":null}', '5a:' + JSON.stringify(side), '5f:' + JSON.stringify(item(4005, 'Imperial Mandate'))])
  + push(['66:' + JSON.stringify(el('$L6a', { rows: [aug(1134, 'Draw Your Sword', 'prismatic', 0.0138, 0.0502, 100), aug(3081, 'Weapon of Destiny', 'gold', 0.0755, 0.0322, 87), aug(1205, 'ADAPt', 'silver', 0.1, -0.0041, 31), { id: 1, name: 'Broken', rarity: 'bronze', deepScore: 50 }] })),
    '67:' + JSON.stringify(el('$L84', { spots: [{ id: 'combos', label: 'Augment combinations' }] })),
    '68:' + JSON.stringify({ tables: [{ id: 'combos', label: 'Augment combos', what: 'Augment pair', rows: [1, 2, 3].map((k) => ({ names: [{ kind: 'augments', id: 3086, name: 'BEES!!!' }, { kind: 'augments', id: k, name: `Pair ${k}` }], score: 0.05 })) }] })])
  + '</body></html>';
(async () => {
  const { deepAram } = await import('./deeparam.js');
  const d = deepAram(page);
  assert.strictEqual(d.patch, '26.22');
  assert.deepStrictEqual(d.rows, [
    { id: 1134, name: 'Draw Your Sword', rarity: 'prismatic', pickRate: 0.0138, deepScore: 100, tier: 'S', href: 'draw-your-sword', boost: 5 },
    { id: 3081, name: 'Weapon of Destiny', rarity: 'gold', pickRate: 0.0755, deepScore: 87, tier: 'S', href: 'weapon-of-destiny', boost: 3.2 },
    { id: 1205, name: 'ADAPt', rarity: 'silver', pickRate: 0.1, deepScore: 31, tier: 'D', href: 'adapt', boost: -0.4 }], 'each augment with its tier and Boost in points; a row of no rarity left out');
  assert.deepStrictEqual(d.pairs, [['BEES!!!', 'Pair 1'], ['BEES!!!', 'Pair 2']], 'the 2 best pairs, not the page’s links to the table');
  assert.deepStrictEqual(d.items, [3158, 3118, 4005, 4645, 3089, 3137], 'the core build (one item in a row the panel points at), then the top 4th, 5th and 6th item, each once');
  assert.deepStrictEqual(deepAram('<html><meta name="description" content="patch 26.22">nothing</html>'), { patch: '26.22', rows: [], pairs: [], items: [] }, 'a page that changed: nothing read, nothing thrown');
  console.log('deeparam.js reads the patch, augments with Boost, best pairs and the build');
})().catch((e) => { console.error(e); process.exit(1); });

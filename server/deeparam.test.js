// Checks deeparam.js on a small made-up page of the shape DeepARAM's champion pages have (never its real page): the
// patch, each augment with its tier and Boost, Augment synergies with why, both core builds (with a row a build points
// at by "$L"), the Mayhem changes, and an empty answer for a page that changed.
//   node deeparam.test.js
const assert = require('assert');
const push = (rows) => `<script>self.__next_f.push([1,${JSON.stringify(rows.join('\n') + '\n')}])</script>`;
const el = (type, props) => ['$', type, null, props], item = (id, name) => el('span', { className: 'cp-named', children: el('$L54', { kind: 'items', id, children: name }) });
const head = (w) => el('h4', { children: el('$L35', { ns: 'champions', children: w }) });
const A = (id, name) => el('$L55', { kind: 'augments', id, children: name }), cls = (c, children, type = 'div') => el(type, { className: c, children });
const cell = (v, k) => cls('cp-cell', [el('b', { className: '$undefined', children: v }), el('small', { children: el('$L38', { ns: 'champions', children: k }) })]);
const mini = (win, pick, boost) => cls('cp-mini', [cell([el('span', { children: win.split(' ')[0] }), cls('wr-ci', ['±', '0.3'], 'span')], 'Win rate'), cell(pick, 'Pick rate'), cell(el('$L38', { ns: 'tables', v: { n: boost }, children: '{n} pts' }), 'Win rate boost')]);
const style = (core, then, rush, win, pick, boost, augs) => cls('cp-style', [cls('cp-best cp-best-wide', [head('Best core build'), cls('cp-icons cp-buy-order', core.map((id) => el('li', { children: item(id, 'x') })), 'ol'),
  cls('cp-rest', ['Then', ...then.map((id) => (typeof id === 'string' ? id : item(id, 'x')))], 'p'), cls('cp-rush', ['Rush', ...rush.map((id) => item(id, 'x'))], 'p'), cls('cp-boots-when', 'Boots when you need them', 'p'),
  mini(win, pick, boost)]), head('Best augments'), cls('cp-augs', augs.map(([id, n]) => el('a', { className: 'rarity-gold', children: A(id, n) }))), head('Best skill order'), A(999, 'not a best augment'), mini('60.0% ± 0.2', '50%', '+9.9')]); // the skill order's own numbers come after
const synergies = el('section', { className: 'cp-panel', id: 'combos', children: [el('h3', { children: 'Augment synergies' }), cls('cp-count', '5'),
  ...[[3086, 'BEES!!!', 1, 'Pair 1'], [3081, 'Weapon of Destiny', 2, 'Pair 2']].map(([i, a, j, b], k) => cls('cp-row', [A(i, a), '+', A(j, b), cls('cp-pair-why', `Why ${k + 1} (4x).`, 'p')]))] });
const changes = el('section', { id: 'changes', children: el('table', { children: [el('thead', { children: el('tr', { children: ['Ability', 'Value', 'Rift', 'Mayhem'].map((t) => el('th', { children: t })) }) }),
  el('tbody', { children: el('tr', { children: [el('td', { children: el('span', { className: 'cp-ability', children: [el('b', { className: 'cp-key', children: 'W' }), ['$', '$L56', null, { kind: 'abilities', id: 'Ashe.W', children: 'Volley' }]] }) }), el('td', { children: ['$', '$Lfe', null, { name: 'Cooldown' }] }), el('td', { children: '18/14.5/11/7.5/4' }), el('td', { children: [el('b', { children: '18/17/16/15/14' }), ' ', el('span', { className: 'down', children: '▲' })] })] }) })] }) });
const aug = (id, name, rarity, pickRate, lift, deepScore) => ({ id, name, tags: [], rarity, pickRate, winRate: '$undefined', lift, stages: [0.25, 0.25, 0.25, 0.25], deepScore, href: `/augments/${name.toLowerCase().replace(/\W+/g, '-')}`, desc: 'Text "with" quotes\nand a line', changesBuild: false });
const page = '<html><head><meta name="description" content="Ashe in ARAM Mayhem: D tier, 43.4% win rate on patch 26.22. Best augments: A, B."></head><body>'
  + push(['0:{"P":null}', '5a:' + JSON.stringify(style([6672, 3006, 3036, 3031], [3046, '$L5f'], [1038, 3144], '48.4% ±0.3', '7.9%', '+3.6', [[3081, 'Weapon of Destiny'], [3086, 'BEES!!!']])),
    '5b:' + JSON.stringify(style([3118, 3158, 4005, 4628], [6657], [], '47.6%', '1.4%', '−0.8', [[1205, 'ADAPt']])), '5c:' + JSON.stringify(style([6672, 3006, 3036, 3031], [], [], '1%', '1%', '0', [])),
    '5f:' + JSON.stringify(item(3085, 'Runaan’s Hurricane')), '60:' + JSON.stringify(synergies), '61:' + JSON.stringify(changes)])
  + push(['66:' + JSON.stringify(el('$L6a', { rows: [aug(1134, 'Draw Your Sword', 'prismatic', 0.0138, 0.0502, 100), aug(3081, 'Weapon of Destiny', 'gold', 0.0755, 0.0322, 87), aug(1205, 'ADAPt', 'silver', 0.1, -0.0041, 31), { id: 1, name: 'Broken', rarity: 'bronze', deepScore: 50 }] }))])
  + '</body></html>';
(async () => {
  const { deepAram } = await import('./deeparam.js');
  const d = deepAram(page);
  assert.strictEqual(d.patch, '26.22');
  assert.deepStrictEqual(d.rows, [
    { id: 1134, name: 'Draw Your Sword', rarity: 'prismatic', pickRate: 0.0138, deepScore: 100, tier: 'S', href: 'draw-your-sword', boost: 5 },
    { id: 3081, name: 'Weapon of Destiny', rarity: 'gold', pickRate: 0.0755, deepScore: 87, tier: 'S', href: 'weapon-of-destiny', boost: 3.2 },
    { id: 1205, name: 'ADAPt', rarity: 'silver', pickRate: 0.1, deepScore: 31, tier: 'D', href: 'adapt', boost: -0.4 }], 'each augment with its tier and Boost in points; a row of no rarity left out');
  assert.deepStrictEqual([d.pairs, d.why], [[['BEES!!!', 'Pair 1'], ['Weapon of Destiny', 'Pair 2']], ['Why 1 (4x).', 'Why 2 (4x).']], 'Augment synergies: each pair with why');
  assert.deepStrictEqual(d.builds, [
    { items: [6672, 3006, 3036, 3031], then: [3046, 3085], win: 48.4, pick: 7.9, boost: 3.6, augs: [3081, 3086] },
    { items: [3118, 3158, 4005, 4628], then: [6657], win: 47.6, pick: 1.4, boost: -0.8, augs: [1205] }], 'both core builds: 4 items, then the rest (one in a row it points at), no Rush parts, the same build once, its best augments only');
  assert.deepStrictEqual(d.items, [6672, 3006, 3036, 3031, 3046, 3085], 'the first build, for the page of 13 Nov');
  assert.deepStrictEqual(d.changes, [['W Volley', 'Cooldown', '18/14.5/11/7.5/4', '18/17/16/15/14']], 'the Mayhem changes, not the table’s head');
  assert.deepStrictEqual(deepAram('<html><meta name="description" content="patch 26.22">nothing</html>'), { patch: '26.22', rows: [], pairs: [], why: [], items: [], builds: [], changes: [] }, 'a page that changed: nothing read, nothing thrown');
  const big = page.replace('</body>', push(Array.from({ length: 400 }, (_, i) => `${(0x100 + i).toString(16)}:` + JSON.stringify(el('div', { children: 'x'.repeat(1200) })))) + '</body>'), t0 = performance.now();
  for (let i = 0; i < 20; i++) deepAram(big);
  console.log(`deeparam.js reads the patch, augments with Boost, synergies, both builds and the Mayhem changes (${((performance.now() - t0) / 20).toFixed(1)} ms a ${Math.round(big.length / 1024)} KB page)`);
})().catch((e) => { console.error(e); process.exit(1); });

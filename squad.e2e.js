// Test of Your squad (What's new 223) in site/index.html, in Chromium with a stand-in for the desktop app and a fake
// League client: Rayan's Summoner's Rift games with Ali, Sam, Zak and Noor (the duo store, lpc-duo) and our server's
// high elo counts faked here. The Squad page (Add a friend, Who's in, the best comp and 2 others, the x), Plan it on the
// draft board (who plays each card, a friend's swaps, Squad comp and Clear), a ban or their pick moving a friend to their
// next best, a lobby with only Ali, Invite your squad, champ select (the comp from the board, plans in the roles League
// gave, a ban moving a plan at once, swaps beside a card), the squad kept after a restart, and never a /squad request.
//   NODE_PATH=/path/to/node_modules node squad.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const URL_ = 'http://127.0.0.1:8096/index.html?peer=127.0.0.1:9096&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true });
const cors = { 'access-control-allow-origin': '*' };
const openPage = async (p, v) => { if (!(await p.isVisible(`.nav[data-view="${v}"]`))) await p.click('#leagueNav'); await p.click(`.nav[data-view="${v}"]`); };
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8096, '127.0.0.1');

// the champions: [id, number, tags, magic], each played in its role in high elo (the summary below)
const CH = [['Ahri', 103, 'Mage', 1, 'MIDDLE'], ['Lux', 99, 'Mage', 1, 'MIDDLE'], ['Zed', 238, 'Assassin', 0, 'MIDDLE'], ['Syndra', 134, 'Mage', 1, 'MIDDLE'],
  ['Jinx', 222, 'Marksman', 0, 'BOTTOM'], ['Caitlyn', 51, 'Marksman', 0, 'BOTTOM'], ['Ezreal', 81, 'Marksman', 0, 'BOTTOM'], ['Jhin', 202, 'Marksman', 0, 'BOTTOM'],
  ['Thresh', 412, 'Support,Fighter', 0, 'UTILITY'], ['Lulu', 117, 'Support', 1, 'UTILITY'], ['Nami', 267, 'Support', 1, 'UTILITY'], ['Leona', 89, 'Tank', 0, 'UTILITY'], ['Milio', 902, 'Support', 1, 'UTILITY'],
  ['Aatrox', 266, 'Fighter', 0, 'TOP'], ['Darius', 122, 'Fighter', 0, 'TOP'], ['Garen', 86, 'Fighter', 0, 'TOP'], ['Ornn', 516, 'Tank', 0, 'TOP'],
  ['LeeSin', 64, 'Fighter', 0, 'JUNGLE'], ['Vi', 254, 'Fighter', 0, 'JUNGLE'], ['Morgana', 25, 'Mage', 1, 'JUNGLE'], ['Viego', 234, 'Fighter', 0, 'JUNGLE']];
const ID = Object.fromEntries(CH.map(([n, k]) => [n, k])), NAME = Object.fromEntries(CH.map(([n, k]) => [k, n]));
const DDATA = Object.fromEntries(CH.map(([id, key, tags, mg]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, tags: tags.split(','), info: mg ? { attack: 2, magic: 8 } : { attack: 8, magic: 2 }, stats: { attackrange: 125 } }]));
// high elo: every champion 100 games in its role (Syndra, Jhin, Ornn and Viego the strongest, 58 won), the rest 50 won
const SUM = { p: '16.23', c: Object.fromEntries(CH.map(([n, k, , , r]) => [k, { [r]: [100, ['Syndra', 'Jhin', 'Ornn', 'Viego'].includes(n) ? 58 : 50] }])), old: null, today: 5, total: 999, at: 0 };
// /riot/champ: 20 games each, half won; Jinx at the bottom won 15 of 20 with Thresh on her team
const champ = (c, role) => ({ patch: '16.23', role, roles: { [role]: [20, 10] }, games: Array.from({ length: 20 }, (_, i) => ({ p: '16.23', t: 1000 + i, w: c === 222 ? +(i < 15) : +(i < 10), o: null, g: 0, s: [4, 14], rn: null, b: [], k: null, x: null, l: null, a: c === 222 ? [412] : [] })) });

// Rayan's games with each friend on his team (newest first): [friend, role, champion, games, wins]; Rayan plays Ahri
// in the middle in most (Lux every 4th); the first 5 Thresh games had Noor on Jinx too
const H = 36e5, T = Date.now(), FR = { Ali: 'ali-puuid', Sam: 'sam-puuid', Zak: 'zak-puuid', Noor: 'noor-puuid', Kagi: 'kagi-puuid' };
const PLAYED = [['Ali', 'UTILITY', 'Thresh', 12, 9], ['Ali', 'UTILITY', 'Lulu', 9, 7], ['Ali', 'UTILITY', 'Nami', 5, 3], ['Ali', 'UTILITY', 'Leona', 3, 2], ['Ali', 'BOTTOM', 'Caitlyn', 4, 2],
  ['Sam', 'TOP', 'Aatrox', 14, 10], ['Sam', 'TOP', 'Darius', 8, 4], ['Sam', 'TOP', 'Garen', 3, 2], ['Sam', 'JUNGLE', 'Vi', 3, 2],
  ['Zak', 'JUNGLE', 'LeeSin', 11, 7], ['Zak', 'JUNGLE', 'Vi', 7, 5], ['Zak', 'JUNGLE', 'Morgana', 2, 1],
  ['Noor', 'BOTTOM', 'Jinx', 10, 6], ['Noor', 'BOTTOM', 'Caitlyn', 8, 5], ['Noor', 'BOTTOM', 'Ezreal', 4, 2], ['Noor', 'UTILITY', 'Milio', 3, 2], ['Kagi', 'TOP', 'Garen', 2, 1]];
const DUO = { u: 'rayan-puuid', g: {} };
let n = 0;
for (const [f, l, c, games, wins] of PLAYED) for (let i = 0; i < games; i++, n++) {
  const m = [[FR[f], ID[c], l]];
  if (c === 'Thresh' && i < 5) m.push([FR.Noor, ID.Jinx, 'BOTTOM']);
  DUO.g[String(9000 + n)] = { at: T - (n + 1) * H, q: 420, w: i < wins ? 1 : 0, c: n % 4 ? ID.Ahri : ID.Lux, l: 'MIDDLE', m };
}
const FRIENDS = ['Ali', 'Sam', 'Zak', 'Noor', 'Kagi'].map((g, i) => ({ puuid: FR[g], pid: `${g}@eu1`, id: `${g}@eu1`, summonerId: 40 + i, gameName: g, gameTag: 'EUW', availability: g === 'Kagi' ? 'offline' : 'chat', product: 'league_of_legends', icon: 1 }));

const L = { calls: [], refused: [], lobby: null, cs: null, invited: [] };
const ok = (data) => ({ status: 200, data });
function fakeLcu(method, p, body) {
  L.calls.push([method, p]);
  if (!allowed(method, p)) { L.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: 'rayan-puuid', gameName: 'Rayan', tagLine: 'EUW', summonerId: 1, summonerLevel: 200, profileIconId: 1 });
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: { RANKED_SOLO_5x5: { tier: 'GOLD', division: 'II', leaguePoints: 40, wins: 20, losses: 18 } } });
  if (p.startsWith('/lol-match-history/v1/products/lol/current-summoner/matches?')) return ok({ games: { games: [] } });
  if (p === '/lol-chat/v1/friends') return ok(FRIENDS);
  if (p === '/lol-lobby/v2/lobby') return L.lobby ? ok(L.lobby) : { status: 404, data: null };
  if (p === '/lol-lobby/v2/lobby/invitations' && method === 'POST') { L.invited.push(...body.map((x) => x.toPuuid)); return ok([]); }
  if (p === '/lol-gameflow/v1/session') return ok({ map: { id: 11 }, gameData: { gameId: 5, queue: { id: 420, isRanked: true, mapId: 11 } } });
  if (p === '/lol-champ-select/v1/session') return L.cs ? ok(L.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(CH.map((c) => c[1]));
  return { status: 404, data: null };
}
function fakeApp() {
  const on = {};
  window.lpcClient = { version: '1.54.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}
const S = { squadAsks: 0 };
async function context(browser, store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: process.env.SHOTS ? 2 : 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|communitydragon\.org|cdn\.jsdelivr\.net/, (r) => r.abort());
  await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['16.23.1'], headers: cors });
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    const nm = decodeURIComponent(u.replace(/^.*\//, '').replace(/(_\d+)?\.(png|jpg)$/, '')), h = [...nm].reduce((t, c) => t + c.charCodeAt(0) * 37, 0) % 360; // a coloured square with the name's first letter
    r.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl(${h} 40% 34%)"/><text x="5" y="7.2" font-size="6" text-anchor="middle" fill="#fff" font-family="sans-serif">${nm[0]}</text></svg>` });
  });
  await ctx.route(/127\.0\.0\.1:9096\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/squad')) { S.squadAsks++; return r.fulfill({ status: 404, json: {}, headers: cors }); }
    if (u.pathname === '/riot/summary') return r.fulfill({ json: SUM, headers: cors });
    if (u.pathname === '/riot/champ') return r.fulfill({ json: champ(+u.searchParams.get('c'), u.searchParams.get('r')), headers: cors });
    if (u.pathname === '/friends') return r.fulfill({ json: { has: {}, inv: [] }, headers: cors });
    r.fulfill({ status: 404, json: {}, headers: cors });
  });
  await ctx.addInitScript((s) => {
    if (localStorage.getItem('lpc-setup')) return;
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', 'Rayan');
    localStorage.setItem('lpc-news', '9999');
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, scout: false, clips: false }));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, store);
  await ctx.addInitScript(fakeApp);
  await ctx.exposeFunction('fakeLcu', fakeLcu);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(URL_);
  await wait(page, () => window.lpc, null, 'the page');
  await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
  await wait(page, () => lpc.lcu().me0, null, 'League');
  return [ctx, page];
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; page ${JSON.stringify(await page.evaluate(() => (document.querySelector('main > .view:not([hidden])') || document.body).innerText.slice(0, 900)).catch(() => ''))}`);
});
const texts = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.textContent));
const until = async (fn, what, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return;
  throw new Error('timed out waiting for ' + what);
};
// the board's Your team: [who, champion] a role, top to bottom
const team = (page) => page.$$eval('#tdUs .tcard', (l) => l.map((c) => [(c.querySelector('.sqwho b') || {}).textContent || '', c.querySelector('.sname b').textContent]));
const best = (page) => page.$$eval('#sqBest .sqcard', (l) => l.map((c) => [c.querySelector('.sqwho b').textContent, c.querySelector('.sname b').textContent]));

(async () => {
  const browser = await chromium.launch();
  try {
    let [ctx, page] = await context(browser, { 'lpc-duo': DUO, 'lpc-squad': { code: 'abcdefghijkm', id: 'abcdefghijkm', seen: 0 } }); // the old server squad: not carried over

    // 1. no squad yet: Add a friend lists Friends you play with, most games together first; Ali goes in with her champions by role
    await openPage(page, 'profile');
    assert.deepStrictEqual(await page.$$eval('#leagueList .nav', (l) => l.map((b) => b.dataset.view).slice(0, 3)), ['profile', 'squad', 'pregame'], 'Squad right after Profile');
    assert.strictEqual(await page.locator('#proFriends .frsq, #sqBox').count(), 0, 'no Squad in the friends column');
    await openPage(page, 'squad');
    await wait(page, () => document.querySelectorAll('#sqAddFaces button').length === 5, null, 'Add a friend');
    assert.strictEqual(await page.textContent('#sqNote'), 'Add up to 4 friends you play with below. Premade works out the best comp you can play together.');
    assert.deepStrictEqual(await texts(page, '#sqAddFaces button'), ['Ali', 'Noor', 'Sam', 'Zak', 'Kagi'], 'most games together first');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('lpc-squad')), '{"code":"abcdefghijkm","id":"abcdefghijkm","seen":0}', 'nothing written until a change');
    await page.click('#sqAddFaces button:has-text("Ali")');
    await wait(page, () => document.querySelectorAll('#sqList > li').length === 2, null, 'Ali in Who’s in');
    const ali = await page.$eval('#sqList > li:nth-child(2)', (li) => [li.querySelector('.frname b').textContent, li.querySelector('.frtext > small').textContent, [...li.querySelectorAll('.sqrole > small')].map((e) => e.textContent), [...li.querySelectorAll('.sqc')].map((e) => e.title)]);
    assert.deepStrictEqual(ali, ['Ali', '33 games together', ['Support', 'Bottom'], ['Thresh: won 9 of 12', 'Lulu: won 7 of 9', 'Nami: won 3 of 5', 'Leona: won 2 of 3', 'Caitlyn: won 2 of 4']]);
    assert.deepStrictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('lpc-squad'))), [{ riot: 'Ali#EUW', u: 'ali-puuid', ic: 1 }]);
    console.log('1: Squad after Profile; Add a friend most games first; Ali in with her champions by role and record');

    // 2. Ali and Sam: the best comp on top and 2 others; another put on top; Sam out and back; 4 friends hide Add a friend
    await page.click('#sqAddFaces button:has-text("Sam")');
    await wait(page, () => document.querySelectorAll('#sqBest .sqcard').length === 3 && document.querySelectorAll('#sqOthers .sqcomp').length === 2, null, 'the comps');
    const b2 = await best(page);
    assert.deepStrictEqual(b2.map(([w]) => w).sort(), ['Ali', 'Sam', 'You']);
    assert(b2.some(([w, c]) => w === 'You' && ['Ahri', 'Lux'].includes(c)) && b2.some(([w, c]) => w === 'Ali' && ['Thresh', 'Lulu'].includes(c)) && b2.some(([w, c]) => w === 'Sam' && c === 'Aatrox'), `best comp ${b2}`);
    assert(await page.isVisible('#sqWord .grade') && await page.isVisible('#sqPlan'), 'its word and Plan it');
    assert.match(await page.textContent('#sqBest .sqpick:nth-child(1) .wcap'), /^Won \d+ of \d+ with you$/);
    await shot(page, 'squad-page-two');
    const other = await page.textContent('#sqOthers .sqcomp:first-child .bighead b');
    await page.click('#sqOthers .sqcomp:first-child');
    await wait(page, (t) => document.getElementById('sqBestHead').textContent === t, other, 'the other comp on top');
    assert.notDeepStrictEqual(await best(page), b2);
    await page.click('#sqList > li:nth-child(3) .sx'); // Sam out
    await wait(page, () => document.querySelectorAll('#sqBest .sqcard').length === 2, null, 'a comp of two');
    for (const f of ['Sam', 'Noor', 'Zak']) await page.click(`#sqAddFaces button:has-text("${f}")`);
    await wait(page, () => document.querySelectorAll('#sqBest .sqcard').length === 5, null, 'a comp of five');
    assert(await page.isHidden('#sqAdd'), 'Add a friend hides with 4 in');
    const b5 = await best(page);
    console.log('2: comps for two and five:', b5.map(([w, c]) => `${w} ${c}`).join(', '));
    await shot(page, 'squad-page');

    // 3. Plan it on the draft board: Pregame with that comp, who plays each card; an edit stays; Squad comp puts it back; Clear empties
    await page.click('#sqPlan');
    await wait(page, () => !document.getElementById('tdBox').hidden && document.querySelectorAll('#tdUs .sqwho').length === 5, null, 'the board with the comp');
    const on = await team(page);
    assert.deepStrictEqual(on.map(([w, c]) => `${w} ${c}`).sort(), b5.map(([w, c]) => `${w} ${c}`).sort(), 'the page’s comp on Your team');
    await wait(page, () => document.querySelector('#tdSq .sqline[aria-pressed="true"]'), null, 'Best comps, the best on your team');
    const ai = on.findIndex(([w]) => w === 'Ali');
    await page.click(`#tdUs > li:nth-child(${ai + 1}) .faces .face`); // one of Ali's swaps
    const edited = await team(page);
    assert.deepStrictEqual(edited.filter((_, i) => i !== ai), on.filter((_, i) => i !== ai), 'only Ali’s card changed');
    assert.notStrictEqual(edited[ai][1], on[ai][1]);
    await page.click('#tdSqBtn');
    await wait(page, (o) => JSON.stringify([...document.querySelectorAll('#tdUs .tcard')].map((c) => [(c.querySelector('.sqwho b') || {}).textContent || '', c.querySelector('.sname b').textContent])) === o, JSON.stringify(on), 'Squad comp back');
    await page.click('#tdClear');
    await wait(page, () => !document.querySelector('#tdUs .sqwho') && document.querySelectorAll('#tdUs .tcard.none').length === 5, null, 'an empty board');
    await page.click('#tdSqBtn');
    await wait(page, () => document.querySelectorAll('#tdUs .sqwho').length === 5, null, 'the comp again');
    console.log('3: planned on the board, who plays each card; an edit kept the rest, Squad comp put it back, Clear emptied it');

    // 4. Ali's card: Swaps for Ali, 3 rows with the comp's word after each; one picked changes only Ali's card
    await page.click(`#tdUs > li:nth-child(${ai + 1}) .tcard`);
    await wait(page, () => document.getElementById('dTopHead').textContent === 'Swaps for Ali' && document.querySelectorAll('#dTopRows .sqswap').length === 3, null, 'Swaps for Ali');
    const sw = await page.$$eval('#dTopRows .sqswap', (l) => l.map((b) => [b.querySelector('.bighead b').textContent, b.querySelector('.bighead .as').textContent, [...b.querySelectorAll('.wg > small:first-child')].map((e) => e.textContent).join(', ')]));
    assert(sw.every(([, w, g]) => /^comp (stays \w+|\w+, was \w+)$/.test(w) && g === 'Ali on it, Team damage, Front line'), JSON.stringify(sw));
    assert(!sw.some(([c]) => c === on[ai][1]), 'not the planned one');
    await shot(page, 'squad-board-swaps');
    await page.click('#dTopRows .sqswap');
    const after = await team(page);
    assert.deepStrictEqual([after[ai][1], after.filter((_, i) => i !== ai)], [sw[0][0], on.filter((_, i) => i !== ai)]);
    console.log('4: Swaps for Ali:', sw.map(([c, w]) => `${c} (${w})`).join(', '), '; one picked changed only Ali’s card');

    // 5. Ali's planned champion banned, then their team picks the next one: each time only Ali's card moves on
    const plan5 = after[ai][1];
    await page.click('#tdBans .bansbtn');
    await page.fill('#dFind', plan5).catch(() => {});
    await page.click(`#dGrid .dchamp[data-c="${ID[plan5]}"]`);
    await wait(page, (c) => [...document.querySelectorAll('#tdUs .sname b')].every((b) => b.textContent !== c), plan5, `${plan5} off Ali’s card`);
    const t5 = await team(page);
    assert.deepStrictEqual(t5.filter((_, i) => i !== ai), after.filter((_, i) => i !== ai), 'the rest stays');
    assert.match(await page.getAttribute(`#tdUs > li:nth-child(${ai + 1}) .tcard`, 'title'), new RegExp(`${plan5} banned$`));
    await page.fill('#dFind', '').catch(() => {});
    await page.click('#tdThem > li:last-child .tcard'); // their support slot
    await page.click(`#dGrid .dchamp[data-c="${ID[t5[ai][1]]}"]`);
    await wait(page, (c) => [...document.querySelectorAll('#tdUs .sname b')].every((b) => b.textContent !== c), t5[ai][1], `${t5[ai][1]} taken`);
    assert.match(await page.getAttribute(`#tdUs > li:nth-child(${ai + 1}) .tcard`, 'title'), new RegExp(`${t5[ai][1]} taken$`));
    console.log(`5: ${plan5} banned and ${t5[ai][1]} taken: Ali on ${(await team(page))[ai][1]}, the rest stayed`);
    await page.click('#tdClear');

    // 6. a lobby with only Ali: the comp fills your two roles, the other 3 open; Invite your squad asks the 2 online
    L.lobby = { partyId: 'p1', gameConfig: { queueId: 420, showPositionSelector: true }, localMember: { puuid: 'rayan-puuid', isLeader: true, firstPositionPreference: 'MIDDLE', secondPositionPreference: 'UTILITY' },
      members: [{ puuid: 'rayan-puuid' }, { puuid: 'ali-puuid' }], invitations: [] };
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    await wait(page, () => !document.getElementById('sqInvite').hidden, null, 'Invite your squad');
    assert.strictEqual(await page.textContent('#sqInvite'), 'Invite your squad (3 online)', 'Sam, Zak and Noor: online, not in the lobby');
    await page.click('#tdSqBtn');
    await wait(page, () => document.querySelectorAll('#tdUs .sqwho').length === 2, null, 'a comp for you and Ali');
    assert.deepStrictEqual((await team(page)).filter(([w]) => w).map(([w]) => w).sort(), ['Ali', 'You']);
    assert.strictEqual(await page.locator('#tdUs .tcard.none').count(), 3, 'the other 3 open');
    await page.click('#sqInvite');
    await until(() => L.invited.length === 3, 'the invites');
    assert.deepStrictEqual(L.invited.sort(), ['noor-puuid', 'sam-puuid', 'zak-puuid']);
    L.lobby = null;
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(page, () => document.getElementById('sqInvite').closest('#inviteBox').hidden, null, 'out of the lobby');
    console.log('6: in a lobby with Ali, a comp for the two of you and 3 open slots; Invite your squad asked Sam, Zak and Noor');

    // 7. the board edited (Ali on Nami), then champ select: Ali given support has Plan: Nami; Sam given the jungle gets
    // his best there; Kagi (not in the squad) on Garen counts with no plan; the strip with the comp's word
    await page.click('#tdSqBtn');
    await wait(page, () => document.querySelectorAll('#tdUs .sqwho').length === 5, null, 'the comp of five');
    const roles = await page.$$eval('#tdUs .tcard', (l) => l.map((c) => (c.querySelector('.sqwho b') || {}).textContent));
    const R = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'], aliR = R[roles.indexOf('Ali')];
    assert.strictEqual(aliR, 'UTILITY', 'Ali plans support');
    await page.click('#tdUs > li:nth-child(5) .tcard');
    await page.fill('#dFind', 'Nami').catch(() => {});
    await page.click(`#dGrid .dchamp[data-c="${ID.Nami}"]`);
    await wait(page, () => document.querySelector('#tdUs > li:nth-child(5) .sname b').textContent === 'Nami', null, 'Ali on Nami');
    const seat = (cellId, puuid, pos, extra = {}) => ({ cellId, puuid, gameName: Object.keys(FR).find((k) => FR[k] === puuid) || 'Rayan', tagLine: 'EUW', assignedPosition: pos, championId: 0, championPickIntent: 0, ...extra });
    L.cs = { gameId: 5, localPlayerCellId: 2, timer: { adjustedTimeLeftInPhase: 30000, totalTimeInPhase: 30000, phase: 'BAN_PICK' }, benchEnabled: false, bans: { myTeamBans: [], theirTeamBans: [] },
      myTeam: [seat(0, 'kagi-puuid', 'top', { championId: ID.Garen }), seat(1, 'sam-puuid', 'jungle'), seat(2, 'rayan-puuid', 'middle'), seat(3, 'noor-puuid', 'bottom'), seat(4, 'ali-puuid', 'utility')],
      theirTeam: [5, 6, 7, 8, 9].map((c) => ({ cellId: c, championId: 0 })),
      actions: [[{ id: 1, actorCellId: 0, type: 'pick', championId: ID.Garen, completed: true, isInProgress: false }, { id: 2, actorCellId: 2, type: 'pick', championId: 0, completed: false, isInProgress: true }]] };
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'ChampSelect' }));
    await wait(page, () => !document.getElementById('csSq').hidden && document.querySelector('#csRows li:nth-child(5) .csplan'), null, 'the squad’s comp in champ select');
    const pill = (i) => page.$eval(`#csRows li:nth-child(${i}) .csplan b`, (e) => e.textContent).catch(() => '');
    assert.strictEqual(await pill(5), 'Plan: Nami', 'the board’s Ali carries over');
    assert.strictEqual(await pill(2), 'Plan: Vi', 'Sam in the jungle: his own Vi there');
    assert.strictEqual(await pill(1), '', 'Kagi: no plan');
    assert.match(await page.textContent('#csSq'), /^Your squad’s compSYNA(Good|Great|OK|Risky)4 of your squad are in this game\./);
    await page.hover('#csRows li:nth-child(5)');
    await wait(page, () => [...document.querySelectorAll('.hbox[data-on] .hhead b')].some((b) => b.textContent === 'Swaps for Ali'), null, 'Swaps for Ali beside her card');
    await shot(page, 'squad-champ-select');
    console.log('7: champ select: Plan: Nami for Ali from the board, Vi for Sam in the jungle, none for Kagi; swaps beside Ali’s card');

    // 8. Nami banned: Ali's plan moves on at once and says why; no banned champion as a plan or a swap
    L.cs.actions = [[...L.cs.actions[0], { id: 3, actorCellId: 7, type: 'ban', championId: ID.Nami, completed: true, isInProgress: false }]];
    await wait(page, () => /^Plan: \w+, Nami banned$/.test((document.querySelector('#csRows li:nth-child(5) .csplan b') || {}).textContent || ''), null, 'Ali’s plan after the ban');
    await page.mouse.move(1, 1);
    await page.hover('#csRows li:nth-child(5)');
    await wait(page, () => document.querySelector('.hbox[data-on] .hrow'), null, 'Ali’s swaps again');
    assert(!(await page.textContent('.hbox[data-on]')).includes('Nami'), 'Nami in no swap');
    console.log(`8: Nami banned: ${await pill(5)}`);
    L.cs = null;
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));

    // 9. a restart: the squad is still there; never a /squad request, no squad on Profile
    await page.reload();
    await wait(page, () => window.lpc, null, 'the page again');
    await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await openPage(page, 'squad');
    await wait(page, () => document.querySelectorAll('#sqList > li').length === 5, null, 'the squad after a restart');
    assert.strictEqual(S.squadAsks, 0, 'never a /squad request');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    console.log('9: the squad kept after a restart; no /squad request');
    await ctx.close();

    // 10. no games with anyone yet: one line, and the squad kept
    [ctx, page] = await context(browser, { 'lpc-squad': [{ riot: 'Ali#EUW', u: 'ali-puuid', ic: 1 }] });
    await openPage(page, 'squad');
    await wait(page, () => document.getElementById('sqNote').textContent, null, 'the note');
    assert.strictEqual(await page.textContent('#sqNote'), 'No games with your squad yet: play one together and Premade works out your comps. Your squad stays.');
    assert.strictEqual(await page.locator('#sqList > li').count(), 2, 'Ali still in');
    await page.click('#sqList > li:nth-child(2) .sx');
    await wait(page, () => /^No games with friends yet/.test(document.getElementById('sqNote').textContent), null, 'no games yet');
    console.log('10: no games: one line, the squad kept');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log('Squad tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

// Test of timers, the coach and customs in site/index.html and site/remote.html, in headless Chromium, with stand-ins
// for the desktop app 1.13 (window.lpcClient with lcu) and League's client behind it, and players in a voice room:
// enemy timers by voice (what the speech model heard, given to the page) and from the phone remote, for everyone in the
// room in that game, with Flash's and an ultimate's cooldown from level and items, a buff's 5 minutes, their jungler by
// the jungle pet, a role nobody's known in, and a tap that takes a running one off; power spikes; the coach (the gold
// for your next item, Dragon in 60 seconds, 3 of them dead, 2 levels down, and I'm new's longer lines); the jungle clock
// from their jungler's last games, and the side it picks with where your minimap first showed them; and customs: custom
// games kept and shared with the room and a newcomer, the inhouse ladder and Balance teams by it, a Fearless series and
// its used-up champions in champ select. Only calls the desktop app lets through (client/main.js LCU_OK).
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node customs.e2e.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8085/index.html?peer=127.0.0.1:9005&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));

PeerServer({ host: '127.0.0.1', port: 9005, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8085, '127.0.0.1');

// ---- Data Dragon: the champions, their ultimates' cooldowns, and items with their haste as Riot writes it
const CHAMPS = [['Ahri', 103, [130, 105, 80]], ['Zed', 238, [120, 100, 80]], ['Garen', 86, [120, 100, 80]], ['LeeSin', 64, [85, 70, 55]], ['Annie', 1, [120, 100, 80]], ['Jinx', 222, [90, 75, 60]]];
const DDATA = Object.fromEntries(CHAMPS.map(([id, key]) => [id, { id, key: String(key), name: id === 'LeeSin' ? 'Lee Sin' : id, info: { attack: 5, magic: 5 }, tags: ['Fighter'], stats: { attackrange: 175 } }]));
const champFull = (id) => ({ data: { [id]: { id, allytips: [], enemytips: [], spells: ['Q', 'W', 'E', 'R'].map((k, i) => ({ name: `${id} ${k}`, cooldown: i === 3 ? CHAMPS.find((c) => c[0] === id)[2] : [8, 8, 8, 8, 8] })) } } });
const item = (name, total, desc, extra = {}) => ({ name, gold: { total }, description: `<mainText>${desc}</mainText>`, maps: { 11: true }, tags: [], ...extra });
const ITEMS = { data: {
  1036: item('Long Sword', 350, '<stats><attention>10</attention> Attack Damage</stats>', { into: ['3031'] }),
  1058: item('Needlessly Large Rod', 1250, '<stats><attention>40</attention> Ability Power</stats>', { into: ['3089'] }),
  1026: item('Blasting Wand', 850, '<stats><attention>45</attention> Ability Power</stats>', { into: ['3089'] }),
  1056: item('Doran’s Ring', 400, '<stats><attention>18</attention> Ability Power</stats>'),
  1101: item('Scorchclaw Pup', 450, '<stats></stats>'),
  3031: item('Infinity Edge', 3450, '<stats><attention>65</attention> Attack Damage<br><attention>25%</attention> Critical Strike Chance</stats>', { from: ['1036'] }),
  3089: item('Rabadon’s Deathcap', 3600, '<stats><attention>130</attention> Ability Power</stats>', { from: ['1058', '1026'] }),
  3071: item('Black Cleaver', 3000, '<stats><attention>40</attention> Attack Damage<br><attention>400</attention> Health<br><attention>20</attention> Ability Haste</stats><br><passive>Carve</passive>'),
  3158: item('Ionian Boots of Lucidity', 900, '<stats><attention>10</attention> Ability Haste<br><attention>45</attention> Move Speed</stats><br><br><passive>Ionian Insight</passive><br>Gain <attention>10</attention> Summoner Spell Haste.', { tags: ['Boots'] }),
} };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ---- League's client: each page's own account, the game (custom or not) with its teams, and their jungler's last
// games with Riot's timeline (their spot once a minute)
const LCU = { game: { id: 7001, custom: false }, calls: [], refused: [], cs: null };
const TEAMS = { ORDER: [['me-Rayan', 'Rayan', 103, 'MIDDLE'], ['me-Friend', 'Friend', 222, 'BOTTOM']], CHAOS: [['zed1', 'Zedd', 238, 'MIDDLE'], ['jg1', 'Jungler', 64, ''], ['top1', 'Topper', 86, 'TOP']] };
// Lee Sin's last 5 jungle games: on the red team and the blue team, starting on one side and ending on the other in 4
const JG_GAMES = [[8101, 200, [3000, 11000], [11000, 4000]], [8102, 100, [11000, 4000], [3000, 11000]], [8103, 200, [3000, 11000], [11000, 4000]], [8104, 100, [11000, 4000], [3000, 11000]], [8105, 100, [3000, 11000], [3000, 11500]]];
// on their blue buff's side at 3:00: the red team's blue buff is on the bottom side (y < x), the blue team's on the top
function fakeLcu(who, method, p) {
  LCU.calls.push([method, p]);
  if (!allowed(method, p)) { LCU.refused.push(`${method} ${p}`); return { status: 0, data: null }; }
  const ok = (data) => ({ status: 200, data });
  let m;
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: `me-${who}`, gameName: who, tagLine: 'EUW', summonerId: who.length });
  if (p === '/lol-gameflow/v1/session') {
    const side = (t) => TEAMS[t].map(([puuid, gameName, championId, selectedPosition]) => ({ puuid, gameName, tagLine: 'EUW', championId, selectedPosition }));
    return ok({ map: { id: 11 }, gameData: { gameId: LCU.game.id, isCustomGame: LCU.game.custom, queue: { id: LCU.game.custom ? 0 : 400, mapId: 11 }, teamOne: side('ORDER'), teamTwo: side('CHAOS') } });
  }
  if (p === '/lol-champ-select/v1/session') return LCU.cs ? ok(LCU.cs) : { status: 404, data: null };
  if (/pickable-champion-ids|bannable-champion-ids/.test(p)) return ok(CHAMPS.map((c) => c[1]));
  if ((m = /^\/lol-match-history\/v1\/products\/lol\/jg1\/matches/.exec(p))) {
    return ok({ games: { games: JG_GAMES.map(([gameId, teamId]) => ({ gameId, gameCreation: Date.now() - gameId * 1000, gameDuration: 1800, gameMode: 'CLASSIC', queueId: 420,
      participants: [{ participantId: 7, championId: 64, teamId, timeline: { lane: 'JUNGLE', role: 'NONE' }, stats: { win: true, kills: 3, deaths: 2, assists: 5 } }] })) } });
  }
  if ((m = /^\/lol-match-history\/v1\/game-timelines\/(\d+)$/.exec(p))) {
    const g = JG_GAMES.find((x) => x[0] === +m[1]);
    if (!g) return { status: 404, data: null };
    const at = (i) => (i === 1 ? g[2] : i >= 3 ? g[3] : [7000, 7000]);
    return ok({ frames: [0, 1, 2, 3, 4].map((i) => ({ timestamp: i * 60000 + (i ? 200 : 0), events: [], participantFrames: { 7: { participantId: 7, position: { x: at(i)[0], y: at(i)[1] } } } })) });
  }
  return { status: 404, data: null };
}

// The desktop app 1.13 as the page sees it (client/preload.js), with League's client answering through fakeLcu
function fakeApp() {
  const on = {};
  window.lpcClient = {
    version: '1.13.0', screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {},
    overlay(s) { this.lastOverlay = s; if (s.call) (window.calls = window.calls || []).push(s.call); },
    on(name, fn) { (on[name] = on[name] || []).push(fn); },
    emit(name, v) { for (const fn of on[name] || []) fn(v); },
    lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b),
  };
}
async function player(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/\/riot\//, (r) => r.fulfill({ status: 404, headers: cors })); // no high elo data: the coach goes by your own games
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    let m;
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1', '1.0'], headers: cors });
    if (u.endsWith('champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if ((m = /\/data\/en_US\/champion\/(\w+)\.json$/.exec(u))) return r.fulfill({ json: champFull(m[1]), headers: cors });
    if (u.endsWith('item.json')) return r.fulfill({ json: ITEMS, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: [], headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.addInitScript(([n, o]) => {
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', n);
    localStorage.setItem('lpc-news', '9999'); // no What's new
    localStorage.setItem('lpc-btwarned', JSON.stringify(['Fake Default Audio Input']));
    if (!localStorage.getItem('lpc-opts')) localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, ...o }));
  }, [name, opts]);
  await ctx.addInitScript(fakeApp);
  const page = await ctx.newPage();
  await page.exposeFunction('fakeLcu', (m, p) => fakeLcu(name, m, p));
  page.on('pageerror', (e) => console.log(`[${name}] page error:`, e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && console.log(`[${name}]`, m.text()));
  return page;
}
const wait = (page, fn, arg, what, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (e) => {
  throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}; calls ${JSON.stringify(await page.evaluate(() => window.calls || []).catch(() => null))}; toasts ${JSON.stringify(await page.evaluate(() => lpc.toasts().slice(-4)).catch(() => null))}; game ${JSON.stringify(await page.evaluate(() => lpcClient.lastOverlay && lpcClient.lastOverlay.game).catch(() => null))}`);
});
async function join(page, room) {
  await page.goto(`${URL_}#${room}`);
  await page.click('#joinBtn');
  await wait(page, () => lpc.slot() >= 0, null, 'a room');
}
// a game on Summoner's Rift (League's game data, client/main.js summary): Rayan (Ahri) and Friend (Jinx) against Zed in
// mid, Lee Sin in the jungle (no position: his jungle pet says it) and Garen in top
const P = (name, team, champ, pos, more = {}) => ({ name: name + '#EUW', team, champ, champName: '', pos, lvl: 6, k: 0, d: 0, a: 0, cs: 30, items: [], dead: false, respawn: 0, ...more });
const game = (t, players, more = {}) => ({
  inGame: true, phase: 'InProgress', mode: 'CLASSIC', t, room: 'g0123456789a', result: '', events: [],
  me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330, gold: 500 }, players, ...more,
});
const SR = (over = {}) => [P('Rayan', 'ORDER', 'Ahri', 'MIDDLE', over.Rayan), P('Friend', 'ORDER', 'Jinx', 'BOTTOM', over.Friend), P('Zedd', 'CHAOS', 'Zed', 'MIDDLE', { items: [[3158, 1]], ...over.Zedd }),
  P('Jungler', 'CHAOS', 'LeeSin', '', { items: [[1101, 1]], ...over.Jungler }), P('Topper', 'CHAOS', 'Garen', 'TOP', { lvl: 11, items: [[3071, 1]], ...over.Topper })];
const feed = (page, g) => page.evaluate((x) => lpc.league(x), g);
const timer = (page, name) => page.evaluate((n) => { const t = lpc.timers().find(([x]) => x === n); return t ? t[1] : null; }, name);
const near = (v, want, d = 2.5) => v != null && Math.abs(v - want) <= d;
// the game's over: League's client says so before the next one starts
const over = async (page) => { await page.evaluate(() => lpc.league({ inGame: false, phase: 'EndOfGame' })); await wait(page, () => !lpc.lcu().curGame, null, 'the game to end'); };
const saw = (page, text) => wait(page, (t) => (window.calls || []).includes(t), text, `“${text}” at the top of the screen`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    // ---- Rayan makes a room with enemy timers, power spikes, the coach and the jungle clock on; Friend joins with enemy timers
    const rayan = await player(browser, 'Rayan', { foeTimers: true, spikeCall: true, coach: true, jgClock: true, remote: true });
    await rayan.goto(URL_);
    await rayan.click('.nav[data-view="voice"]');
    await rayan.click('#createBtn');
    await wait(rayan, () => lpc.slot() >= 0, null, 'Rayan’s room');
    const ROOM = await rayan.evaluate(() => lpc.room());
    const friend = await player(browser, 'Friend', { foeTimers: true });
    await join(friend, ROOM);
    await wait(rayan, () => lpc.peers().length === 1 && lpc.peers()[0].name === 'Friend', null, 'Friend in the room');
    // the Timers and coach settings on the Overlay page, off until turned on
    await friend.click('#leagueNav'); await friend.click('.nav[data-view="overlay"]');
    assert.deepStrictEqual(await friend.evaluate(() => ['optFoeTimers', 'optSpikeCall', 'optCoach', 'optCoachNew', 'optJgClock'].map((id) => document.getElementById(id).checked)), [true, false, false, false, false]);
    assert.match(await friend.textContent('#h-ovcoach'), /Timers and coach/);

    // ---- a normal game, both in it, on the same team
    for (const p of [rayan, friend]) await feed(p, game(600, SR()));
    await wait(rayan, () => lpc.lcu().curGame && lpc.lcu().curGame.id === 7001 && lpc.cooldown('r:Garen') > 0, null, 'the game, and Garen’s ultimate from Data Dragon');
    // “Premade, mid flash” in a sentence: Zed's Flash with Ionian Boots' 10 Summoner Spell Haste is 300 × 100/110 s
    await rayan.evaluate(() => lpc.said('okay premade mid flash go'));
    assert(near(await timer(rayan, 'Zed Flash'), 272.7), `Zed Flash: ${await timer(rayan, 'Zed Flash')}`);
    await wait(rayan, () => /Zed Flash 4:3\d/.test(lpcClient.lastOverlay.game), null, 'Zed Flash on Rayan’s overlay');
    await wait(friend, () => lpc.timers().some(([n]) => n === 'Zed Flash') && /Zed Flash 4:3\d/.test(lpcClient.lastOverlay.game), null, 'Zed Flash on Friend’s overlay');
    assert(near(await timer(friend, 'Zed Flash'), 272.7), 'the same countdown for Friend');
    assert((await rayan.evaluate(() => lpc.toasts())).includes('Zed Flash: 4:33'), 'a popup says it started');
    // Garen is level 11: his ultimate's second rank, 100 s, less Black Cleaver's 20 Ability Haste
    await rayan.evaluate(() => lpc.said('premade top ultimate'));
    assert(near(await timer(rayan, 'Garen ultimate'), 100 * 100 / 120), `Garen ultimate: ${await timer(rayan, 'Garen ultimate')}`);
    await rayan.evaluate(() => lpc.said('premade their red'));
    assert(near(await timer(rayan, 'Their red'), 300), 'their red buff: 5 minutes');
    await friend.evaluate(() => lpc.said('premade jungle flash')); // no position: the jungle pet says who
    await wait(rayan, () => lpc.timers().some(([n]) => n === 'Lee Sin Flash'), null, 'Lee Sin Flash from Friend');
    assert(near(await timer(rayan, 'Lee Sin Flash'), 300), 'no boots: 5 minutes');
    await rayan.evaluate(() => lpc.said('premade support flash'));
    assert((await rayan.evaluate(() => lpc.toasts())).some((t) => /doesn’t know who’s support on their team/.test(t)), 'nobody known in support');
    assert.strictEqual(await timer(rayan, 'Support Flash'), null);
    // the phrases are in the speech model's list only while enemy timers are on, and clip phrases don't save clips without clips by voice
    assert.deepStrictEqual(await rayan.evaluate(() => lpc.toasts().filter((t) => /clip/i.test(t))), []);
    console.log('enemy timers by voice: Flash with boots, an ultimate at level 11 with haste, a buff, their jungler by the pet, for both of them');

    // ---- the phone remote: a button for each of them, and a tap takes a running timer off
    const link = await rayan.evaluate(() => document.getElementById('remoteLink').href);
    assert.match(link, /remote\.html\?peer=127\.0\.0\.1:9005&debug#[a-z0-9]{12}$/);
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await pctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
    await pctx.route(/ddragon\.leagueoflegends\.com/, (r) => { const u = r.request().url(); r.fulfill(u.endsWith('versions.json') ? { json: ['1.1'] } : u.endsWith('champion.json') ? { json: { data: DDATA } } : { body: PNG, contentType: 'image/png' }); });
    await pctx.route(/127\.0\.0\.1:9005\/push\//, (r) => r.fulfill({ json: {}, headers: { 'access-control-allow-origin': '*' } }));
    const phone = await pctx.newPage();
    phone.on('pageerror', (e) => console.log('[phone] page error:', e.message));
    await phone.goto(link);
    await wait(phone, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone to connect');
    await wait(phone, () => [...document.querySelectorAll('#foes .trade span')].map((s) => s.textContent).join() === 'Zed,Lee Sin,Garen,Their jungle', null, 'a row for each of them');
    assert(/Zed Flash/.test(await phone.textContent('#timers')), 'the timers on the phone');
    await phone.locator('#foes .trade', { hasText: 'Zed' }).getByRole('button', { name: 'Flash' }).click();
    await wait(rayan, () => !lpc.timers().some(([n]) => n === 'Zed Flash'), null, 'the tap to take Zed Flash off');
    await wait(friend, () => !lpc.timers().some(([n]) => n === 'Zed Flash'), null, 'Zed Flash off for Friend too');
    await phone.locator('#foes .trade', { hasText: 'Their jungle' }).getByRole('button', { name: 'Blue buff' }).click();
    await wait(friend, () => lpc.timers().some(([n]) => n === 'Their blue'), null, 'their blue from the phone, for Friend');
    await pctx.close();
    console.log('enemy timers from the phone: a row for each of them, a tap starts one or takes it off, for everyone');

    await friend.evaluate(() => lpc.league(null)); // the rest of this game is Rayan's

    // ---- power spikes: Zed reaches level 6 (5 before), then finishes Infinity Edge; what they had first isn't news
    await feed(rayan, game(620, SR({ Zedd: { lvl: 5, items: [[3158, 1], [1036, 1]] } })));
    await rayan.waitForTimeout(1500);
    await feed(rayan, game(630, SR({ Zedd: { lvl: 6, items: [[3158, 1], [1036, 1]] } })));
    await saw(rayan, 'Zed is level 6');
    await feed(rayan, game(640, SR({ Zedd: { lvl: 6, items: [[3158, 1], [3031, 1]] } })));
    await saw(rayan, 'Zed finished Infinity Edge');
    assert(!(await rayan.evaluate(() => window.calls)).some((c) => /Garen is level 11|Black Cleaver|Ionian/.test(c)), 'nothing from what they had when first seen');
    console.log('power spikes: “Zed is level 6”, “Zed finished Infinity Edge”');

    // ---- the coach: your gold for the next item of your build (your own games: Doran's Ring, then Rabadon's Deathcap)
    await rayan.evaluate(() => Object.assign(lpc.deep(), { 9901: { at: Date.now(), me: 0, ps: [{ c: 103, l: 'MIDDLE', u: 'me-Rayan' }], tl: { buys: [[20, 1056], [700, 3089]] } } }));
    const mine = (gold, more = {}) => game(650, SR({ Rayan: { items: [[1056, 1], [1058, 1]] } }), { me: { champ: 'Ahri', champName: 'Ahri', team: 'ORDER', dead: false, respawn: 0, hp: 1, speed: 330, gold }, ...more });
    await feed(rayan, mine(2000)); // Rabadon's 3600 less the Needlessly Large Rod's 1250 you have: 2350
    await rayan.waitForTimeout(1500);
    assert(!(await rayan.evaluate(() => window.calls)).some((c) => /buy/.test(c)), 'not yet: 2,000 gold');
    await feed(rayan, mine(2400));
    await saw(rayan, 'Back now: you can buy Rabadon’s Deathcap');
    // Dragon in 60 seconds (none taken yet: it's up at 5:00)
    await feed(rayan, { ...mine(100), t: 244 });
    await saw(rayan, 'Dragon in 60 seconds: push your wave');
    // 3 of them dead for 15 s or more, with Dragon up
    const dead = { dead: true, respawn: 25 };
    await feed(rayan, game(700, SR({ Zedd: dead, Jungler: dead, Topper: { ...dead, respawn: 20 } })));
    await saw(rayan, '3 of them are dead: take Dragon');
    // two levels down on Zed in your lane
    await feed(rayan, game(710, SR({ Rayan: { lvl: 7 }, Zedd: { lvl: 9 } })));
    await saw(rayan, 'You’re two levels down: play safe');
    // I'm new: the same tips say why
    await rayan.evaluate(() => { document.getElementById('optCoachNew').click(); });
    await feed(rayan, game(720, SR({ Rayan: { lvl: 7 }, Zedd: { lvl: 10 } })));
    await saw(rayan, 'You’re three levels down: play safe. Zed wins fights until you catch up, so farm near your tower');
    console.log('the coach: the gold for your next item, Dragon in 60 seconds, 3 of them dead, levels down, and I’m new');

    // ---- the jungle clock: their jungler's last 5 games all end on their blue buff's side at 3:00, which is the bottom
    // side for the red team (theirs here), called at 2:45 in a new game; with where your minimap first showed them, the
    // side they usually cross to
    assert.strictEqual(await rayan.evaluate(() => lpc.jgSide([[true, false], [true, false], [false, true], [true, true]], 'top', 200)), 'bot', 'crosses over: seen top, ends bottom');
    assert.strictEqual(await rayan.evaluate(() => lpc.jgSide([[true, false], [true, false], [false, true], [true, true]], 'bot', 200)), 'top');
    assert.strictEqual(await rayan.evaluate(() => lpc.jgSide([[true, false], [true, true]], '', 100)), '', 'not from 2 games');
    assert.strictEqual(await rayan.evaluate(() => lpc.jgSide([[true, false], [true, true], [false, false], [false, true]], '', 100)), '', 'not when 2 in 4 agree');
    LCU.game = { id: 7002, custom: false };
    await feed(rayan, { ...game(100, SR()), room: 'g00000000002', phase: 'None' }); // the last game's over: League's client says so first
    await rayan.waitForTimeout(1500);
    await feed(rayan, { ...game(150, SR()), room: 'g00000000002' });
    await wait(rayan, () => lpc.lcu().curGame && lpc.lcu().curGame.id === 7002 && lpc.lcu().scouted.includes('jg1'), null, 'the new game, their jungler looked up');
    await rayan.waitForTimeout(1500);
    assert(!(await rayan.evaluate(() => window.calls)).some((c) => /likely/.test(c)), 'not before 2:45');
    await feed(rayan, { ...game(166, SR()), room: 'g00000000002' });
    await saw(rayan, 'Lee Sin likely botside around 3:15');
    assert(LCU.calls.some(([, p]) => p === '/lol-match-history/v1/game-timelines/8101'), 'from Riot’s timelines of their games');
    console.log('the jungle clock: “Lee Sin likely botside around 3:15” from their last games, and the side picked with their start');

    // ---- customs: a custom game played to the end with a bot in it is kept, without the bot, and shared with the room
    await over(rayan);
    LCU.game = { id: 5001, custom: true };
    const custom = (t, players, more) => ({ ...game(t, players, more), room: 'g00000005001' });
    const five = [P('Rayan', 'ORDER', 'Ahri', ''), P('Friend', 'ORDER', 'Jinx', ''), P('Zedd', 'CHAOS', 'Zed', ''), P('Jungler', 'CHAOS', 'LeeSin', ''), { ...P('Annie Bot', 'CHAOS', 'Annie', ''), name: 'Annie Bot' }];
    await feed(rayan, custom(900, five));
    await wait(rayan, () => lpc.lcu().curGame && lpc.lcu().curGame.id === 5001 && lpc.lcu().curGame.custom, null, 'a custom game');
    await feed(rayan, custom(1500, five, { result: 'Win' }));
    await wait(friend, () => lpc.customs().length === 1, null, 'the custom game on Friend’s page');
    assert.deepStrictEqual(await rayan.evaluate(() => lpc.customs().map(({ id, w, l }) => ({ id, w, l }))), [{ id: 5001, w: [['Rayan#EUW', 'Ahri'], ['Friend#EUW', 'Jinx']], l: [['Zedd#EUW', 'Zed'], ['Jungler#EUW', 'LeeSin']] }]);
    assert.deepStrictEqual(await friend.evaluate(() => lpc.inhouse().map((e) => [e.name, Math.round(e.r), e.w, e.l])), [['Rayan#EUW', 1016, 1, 0], ['Friend#EUW', 1016, 1, 0], ['Zedd#EUW', 984, 0, 1], ['Jungler#EUW', 984, 0, 1]]);
    await friend.click('#leagueNav'); await friend.click('.nav[data-view="prox"]');
    await wait(friend, () => document.getElementById('ladderList').textContent.includes('Rayan: 1016 · 1W 0L'), null, 'the ladder on Friend’s Voice page');
    // Balance teams by the ladder: both of them are on it
    await wait(rayan, () => lpc.peers()[0].ready && lpc.lcu().me0, null, 'Friend’s Riot ID');
    await rayan.click('#leagueNav'); await rayan.click('.nav[data-view="prox"]');
    await rayan.click('#teamsBtn');
    await wait(friend, () => /on the ladder/.test(document.getElementById('teamsBox').textContent), null, 'teams by the ladder');
    for (const who of ['Rayan', 'Friend']) assert.match(await friend.textContent('#teamsBox'), new RegExp(`${who}( \\(you\\))?: 1016 on the ladder`));
    console.log('the inhouse ladder: a custom game kept without its bot, shared, rated, and Balance teams by it');

    // ---- a Fearless series: the host starts it, the next custom game's champions are used up, and champ select says so
    await rayan.click('#fsBtn');
    await wait(friend, () => lpc.fearless().on, null, 'the series on Friend’s page');
    assert((await friend.evaluate(() => lpc.toasts())).some((t) => /Fearless series started/.test(t)));
    await over(rayan);
    LCU.game = { id: 5002, custom: true };
    await feed(rayan, { ...custom(900, five), room: 'g00000005002' });
    await wait(rayan, () => lpc.lcu().curGame && lpc.lcu().curGame.id === 5002, null, 'the second custom game');
    await feed(rayan, { ...custom(1500, five, { result: 'Lose' }), room: 'g00000005002' });
    await wait(friend, () => lpc.fearless().used.join() === 'Zed,LeeSin,Ahri,Jinx', null, 'its champions used up');
    assert.match(await friend.textContent('#fsHead'), /Fearless series: game 2\. Used up, so nobody picks them again: 4 champions\./);
    assert.strictEqual(await friend.locator('#fsUsed img').count(), 4);
    await over(rayan);
    LCU.cs = { gameId: 5003, localPlayerCellId: 1, timer: { adjustedTimeLeftInPhase: 30000 }, myTeam: [{ cellId: 0, puuid: 'me-Rayan', gameName: 'Rayan', tagLine: 'EUW', championId: 103, assignedPosition: '' },
      { cellId: 1, puuid: 'me-Friend', gameName: 'Friend', tagLine: 'EUW', championPickIntent: 238, championId: 0, assignedPosition: '' }], theirTeam: [], actions: [[{ id: 1, actorCellId: 1, type: 'pick', completed: false, isInProgress: true, championId: 238 }]], trades: [], positionSwaps: [], pickOrderSwaps: [] };
    await friend.evaluate(() => lpc.league({ inGame: false, phase: 'ChampSelect' }));
    await friend.click('#leagueNav'); await friend.click('.nav[data-view="pregame"]');
    await wait(friend, () => !document.getElementById('fsLine').hidden && /Zed was played earlier in the series: pick another\./.test(document.getElementById('fsLine').textContent), null, 'the used-up champions in champ select');
    assert.match(await friend.textContent('#fsLine'), /^Fearless series, game 2: nobody picks Zed, Lee Sin, Ahri, Jinx\./);
    LCU.cs = null;
    await friend.evaluate(() => lpc.league({ inGame: false, phase: 'Lobby' }));
    console.log('a Fearless series: started by the host, the used-up champions on the Voice page and in champ select');


    // ---- a newcomer gets the room's custom games
    const kai = await player(browser, 'Kai');
    await join(kai, ROOM);
    await wait(kai, () => lpc.customs().length === 2, null, 'the games for a newcomer');
    assert.deepStrictEqual(await kai.evaluate(() => lpc.inhouse().map((e) => Math.round(e.r))), await friend.evaluate(() => lpc.inhouse().map((e) => Math.round(e.r))), 'the same ladder');
    console.log('a newcomer: the same ladder');

    assert.deepStrictEqual(LCU.refused, [], 'only calls the desktop app lets through');
    console.log('all timers, coach and customs tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    process.exit(process.exitCode || 0);
  }
})();

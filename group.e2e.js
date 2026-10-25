// Test of Your group and the rest of the October 20 batch in site/index.html, in Chromium: two players with League
// open, Rayan (desktop app 1.14) and Duo (app 1.13), each with a fake League client, and our server's /squad and
// /friends faked here (server/squad.test.js tests the real ones): the goal board and Best roles in a voice room, a squad
// made and joined from the room, which pings each one wants, a call answered In 10 and joined from Duo's Premade, the
// pings for a game and a rank-up, a Discord test post and the game's result there,
// League chat on Pregame (a message sent, a new one and an invite popping up, the invite accepted, the room in
// your League status and the old status back after), the note for Duo's old app, League chat on the phone remote, a
// squad call's notification with In 10 and Not tonight (remote-sw.js), the call opened on the remote, and only calls
// the desktop app lets through (client/main.js LCU_OK).
// Needs the npm packages peer@1.0.2, peerjs@1.5.4 and playwright; run with NODE_PATH listing their node_modules:
//   NODE_PATH=/path/to/node_modules:$(npm root -g) node group.e2e.js        (SHOTS=folder saves screenshots)
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PeerServer } = require('peer');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, 'site');
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PEERJS = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'));
const URL_ = 'http://127.0.0.1:8086/index.html?peer=127.0.0.1:9006&debug';
const LCU_OK = eval(fs.readFileSync(path.join(__dirname, 'client/main.js'), 'utf8').match(/const LCU_OK = (\[[\s\S]*?\n\]);/)[1]); // the desktop app's allowlist
const allowed = (m, p) => LCU_OK.some(([mm, re]) => mm === m && re.test(p));
const shot = (page, name) => process.env.SHOTS && page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), fullPage: true });
const cors = { 'access-control-allow-origin': '*' };

PeerServer({ host: '127.0.0.1', port: 9006, path: '/' });
http.createServer((req, res) => {
  const file = path.join(SITE, new URL(req.url, 'http://x').pathname);
  if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.json': 'application/json' }[path.extname(file)] || 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(8086, '127.0.0.1');
const answered = []; // what a notification's In 10 sent (remote-sw.js), to a server of its own: [path, body]
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => { answered.push([req.url, b]); res.writeHead(200, cors); res.end('{}'); });
}).listen(9106, '127.0.0.1');

// ---- our server, faked: squads as server/squad.js keeps them
const H = 36e5, T = Date.now();
const S = { squads: {}, pings: [], apps: {}, inv: [] };
function fakeServer(r) {
  const q = r.request(), [, what, code, act = ''] = new URL(q.url()).pathname.split('/'), reply = (json, status = 200) => r.fulfill({ status, json, headers: cors });
  // who has Premade and Friends, as server/worker.js's Stats object keeps them (server/stats.test.js tests the real ones)
  const now = Math.round(Date.now() / 1000), low = (n) => n.toLowerCase();
  if (what === 'hello') { const b = JSON.parse(q.postData()); S.apps[b.id] = { name: b.name, riot: b.riot, last: now }; return r.fulfill({ status: 204, headers: cors }); }
  if (what === 'friends') {
    const b = JSON.parse(q.postData()), has = {}, me = S.apps[b.id];
    for (const [id, a] of Object.entries(S.apps)) if (id !== b.id) for (const n of a.riot) if (b.riot.map(low).includes(low(n))) has[low(n)] = a.last;
    if (me) me.last = now;
    return reply({ has, inv: me ? S.inv.filter((v) => me.riot.map(low).includes(v.to)).map(({ to, src, ...v }) => ({ ...v, n: S.apps[src].name, riot: S.apps[src].riot[0] })) : [] });
  }
  if (what === 'invite') {
    const b = JSON.parse(q.postData());
    S.inv = [...S.inv.filter((v) => !(v.to === low(b.to) && v.src === b.id)), { to: low(b.to), src: b.id, room: b.room, key: b.key, lob: b.lob, at: now }];
    return reply({ ok: true });
  }
  const s = (S.squads[code] ||= { m: {}, call: null });
  if (q.method() === 'GET') {
    return reply({ m: Object.entries(s.m).map(([id, x]) => ({ id, n: x.n, phone: !!x.c, g: x.g, r: x.r })), call: s.call });
  }
  const b = JSON.parse(q.postData());
  if (!act) { if (b.leave) delete s.m[b.id]; else s.m[b.id] = { n: b.n, c: b.c, g: b.g, r: b.r }; return reply({ ok: true }); }
  if (!s.m[b.id]) return reply({ error: 'Not in this squad' }, 403);
  if (act === 'call') { s.call = { n: (s.call ? s.call.n : 0) + 1, from: b.id, room: b.room, at: Date.now(), ans: {} }; return reply({ call: s.call.n, sent: Object.entries(s.m).filter(([id, x]) => id !== b.id && x.c).length }); }
  if (act === 'answer') { s.call.ans[b.id] = b.a; return reply({ ok: true }); }
  if (act === 'ping') { S.pings.push([s.m[b.id].n, b]); return reply({ sent: 1 }); }
}

// ---- the fake League clients: Rayan is Gold III with 90 LP, going for Gold I since Gold IV, and won 5 of 6 games in
// the middle and neither in the top lane; Duo is Silver I with 90 LP, going for Platinum IV, and won 4 of 5 in the
// jungle and all 3 in the middle. Rayan's League chat: Duo#EUW wrote "gg wp", and a champ select chat that isn't shown
const games = (list) => ({ games: { games: list.map(([lane, win], i) => ({ gameId: 100 + i, platformId: 'EUW1', gameCreation: T - (i + 1) * H, gameDuration: 1800, queueId: 420, gameMode: 'CLASSIC',
  participants: [{ championId: 103, teamId: 100, timeline: { lane, role: 'SOLO' }, stats: { win } }] })) } });
const rep = (n, lane, win) => Array.from({ length: n }, (_, i) => [lane, win(i)]);
const PLAYERS = {
  Rayan: { puuid: 'rayan-puuid', rank: ['GOLD', 'III', 90], hist: games([...rep(6, 'MIDDLE', (i) => i > 0), ...rep(2, 'TOP', () => false)]) },
  Duo: { puuid: 'duo-puuid', rank: ['SILVER', 'I', 90], hist: games([...rep(5, 'JUNGLE', (i) => i > 0), ...rep(3, 'MIDDLE', () => true)]) },
};
// the game both pings come from: Rayan's Ahri beat Shadow's Zed, 8/2/6
const GAME = { gameId: 77, platformId: 'EUW1', gameCreation: T, gameDuration: 1700, queueId: 420, gameMode: 'CLASSIC',
  participantIdentities: [[1, 'rayan-puuid', 'Rayan'], [2, 'zed-puuid', 'Shadow']].map(([participantId, puuid, gameName]) => ({ participantId, player: { puuid, gameName, tagLine: 'EUW' } })),
  participants: [[1, 100, 103, true, 8, 2, 6], [2, 200, 238, false, 2, 8, 3]].map(([participantId, teamId, championId, win, kills, deaths, assists]) => ({ participantId, teamId, championId,
    timeline: { lane: 'MIDDLE', role: 'SOLO' }, stats: { win, kills, deaths, assists, totalDamageDealtToChampions: 20000, goldEarned: 12000, totalMinionsKilled: 200, visionScore: 20 } })) };
const DUO = 'duo@eu1.pvp.net', ME = 'rayan@eu1.pvp.net', iso = (ago) => new Date(Date.now() - ago).toISOString();
const chat = { me: { pid: ME, id: ME, statusMessage: 'ranked grind' }, puts: [], unread: 1, msgs: [{ body: 'gg wp', type: 'chat', fromPid: DUO, timestamp: iso(60e3) }], inv: [] };
const FRIENDS = [['duo-puuid', DUO, 31, 'Duo', 'chat'], ['off-puuid', 'off@eu1.pvp.net', 32, 'Sleepy', 'offline']]
  .map(([puuid, pid, summonerId, gameName, availability]) => ({ puuid, pid, id: pid, summonerId, gameName, gameTag: 'EUW', availability, product: 'league_of_legends' }));
const L = { calls: [], refused: [], lp: null, lobby: null };
const ok = (data) => ({ status: 200, data });
function fakeLcu(who, method, p, body) {
  const P = PLAYERS[who];
  L.calls.push([who, method, p]);
  if (!allowed(method, p)) { L.refused.push(`${who}: ${method} ${p}`); return { status: 0, data: null }; }
  let m;
  if (p === '/lol-summoner/v1/current-summoner') return ok({ puuid: P.puuid, gameName: who, tagLine: 'EUW', summonerId: 1, summonerLevel: 200, profileIconId: 1 });
  if (p === '/lol-ranked/v1/current-ranked-stats') return ok({ queueMap: { RANKED_SOLO_5x5: { tier: P.rank[0], division: P.rank[1], leaguePoints: P.rank[2], wins: 20, losses: 18 } } });
  if (p.startsWith('/lol-match-history/v1/products/lol/current-summoner/matches?')) return ok(P.hist);
  if (p === '/lol-gameflow/v1/session') return ok({ gameData: { gameId: 77, queue: { id: 420, isRanked: true, mapId: 11 }, teamOne: [{ puuid: P.puuid, gameName: who, tagLine: 'EUW', championId: 103, selectedPosition: 'MIDDLE' }],
    teamTwo: [{ puuid: 'zed-puuid', gameName: 'Shadow', tagLine: 'EUW', championId: 238, selectedPosition: 'MIDDLE' }] } });
  if (p === '/lol-ranked/v1/current-lp-change-notification') return L.lp ? ok(L.lp) : { status: 404, data: null };
  if (p === '/lol-match-history/v1/games/77') return ok(GAME);
  if (p === '/lol-lobby/v2/lobby' && L.lobby) return ok(L.lobby);
  if (who !== 'Rayan') return { status: 404, data: null };
  if (p === '/lol-chat/v1/friends') return ok(FRIENDS);
  if (p === '/lol-chat/v1/me' && method === 'GET') return ok(chat.me);
  if (p === '/lol-chat/v1/me') { chat.puts.push(body.statusMessage); chat.me.statusMessage = body.statusMessage; return ok(chat.me); }
  if (p === '/lol-chat/v1/conversations') return ok([{ id: DUO, pid: DUO, type: 'chat', gameName: 'Duo', gameTag: 'EUW', unreadMessageCount: chat.unread, lastMessage: chat.msgs.at(-1) },
    { id: 'c1@champ-select.eu1.pvp.net', type: 'championSelect', name: '', unreadMessageCount: 3, lastMessage: null }]);
  if (p === `/lol-chat/v1/conversations/${DUO}/messages` && method === 'GET') return ok(chat.msgs);
  if (p === `/lol-chat/v1/conversations/${DUO}/messages`) { chat.msgs.push({ ...body, fromPid: ME, timestamp: iso(0) }); return ok(chat.msgs.at(-1)); }
  if (p === '/lol-lobby/v2/received-invitations') return ok(chat.inv);
  if ((m = /^\/lol-lobby\/v2\/received-invitations\/([\w-]+)\/(accept|decline)$/.exec(p))) { chat.inv.find((i) => i.invitationId === m[1]).state = m[2] === 'accept' ? 'Accepted' : 'Declined'; return { status: 204, data: null }; }
  return { status: 404, data: null };
}
function fakeApp(version) { // the desktop app (client/preload.js), with League's client answering through fakeLcu
  const on = {};
  window.lpcClient = { version, screens: async () => [], useScreen() {}, keys: async () => ({}), windowMode: async () => 'borderless', compact() {}, update() {}, overlay() {}, front() {},
    on(name, fn) { (on[name] = on[name] || []).push(fn); }, emit(name, v) { for (const fn of on[name] || []) fn(v); }, lcu: (m, p, b) => window.fakeLcu(m, p, b === undefined ? null : b) };
}

const HOOK = 'https://discord.com/api/webhooks/123456/abc-DEF_1', discord = []; // what Discord was sent: each post's payload_json
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const DDATA = Object.fromEntries([['Ahri', 103, 'Mage'], ['Zed', 238, 'Assassin']].map(([id, key, tag]) => [id, { id, key: String(key), name: id, tags: [tag], info: { attack: 3, magic: 8 }, stats: { attackrange: 550 } }]));
async function routes(ctx) {
  await ctx.route(PEERJS_URL, (r) => r.fulfill({ body: PEERJS, headers: { 'content-type': 'text/javascript', ...cors } }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|communitydragon\.org/, (r) => r.abort());
  await ctx.route(/127\.0\.0\.1:9006\/(squad|hello|friends|invite)/, fakeServer);
  await ctx.route(/127\.0\.0\.1:9006\/(riot|stats|push)/, (r) => r.fulfill({ status: 404, json: {}, headers: cors }));
}
async function context(browser, who, version, store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await routes(ctx);
  await ctx.route('**/latest.yml', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/ddragon\.leagueoflegends\.com/, (r) => {
    const u = r.request().url();
    if (u.endsWith('versions.json')) return r.fulfill({ json: ['1.1'], headers: cors });
    if (u.endsWith('/champion.json')) return r.fulfill({ json: { data: DDATA }, headers: cors });
    if (u.endsWith('.json')) return r.fulfill({ json: { data: {} }, headers: cors });
    r.fulfill({ body: PNG, contentType: 'image/png', headers: cors });
  });
  await ctx.route(/^https:\/\/discord\.com\/api\/webhooks\//, (r) => {
    discord.push(JSON.parse(/name="payload_json"\r\n\r\n([^\r\n]*)/.exec(r.request().postDataBuffer().toString())[1]));
    r.fulfill({ status: 204, headers: cors });
  });
  await ctx.addInitScript(([n, s]) => {
    if (localStorage.getItem('lpc-setup')) return;
    localStorage.setItem('lpc-setup', '1');
    localStorage.setItem('lpc-name', n);
    localStorage.setItem('lpc-news', '9999'); // no What's new
    localStorage.setItem('lpc-opts', JSON.stringify({ denoise: false, compact: false, autoRoom: false, scout: false, clips: false, remote: true }));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, [who, store]);
  await ctx.addInitScript(fakeApp, version);
  await ctx.exposeFunction('fakeLcu', (m, p, b) => fakeLcu(who, m, p, b));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${who}] page error:`, e.message));
  await page.goto(URL_);
  await wait(page, () => window.lpc, null, 'the page');
  await page.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
  await wait(page, () => lpc.lcu().me0 && lpc.lcu().hist === 8, null, `${who}’s League`);
  return [ctx, page];
}
const wait = (page, fn, arg, what, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(async (err) => {
  throw new Error(`timed out waiting for ${what}: ${err.message.split('\n')[0]}; toasts ${JSON.stringify(await page.evaluate(() => window.lpc && lpc.toasts()).catch(() => null))}; page ${JSON.stringify(await page.evaluate(() => (document.querySelector('main > .view:not([hidden])') || document.body).innerText.slice(0, 600)).catch(() => ''))}`);
});
const until = async (fn, what, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return;
  throw new Error('timed out waiting for ' + what);
};
const text = (page, sel) => page.locator(sel).textContent();
const texts = (page, sel) => page.$$eval(sel, (l) => l.map((e) => e.textContent));
const said = (page) => page.$$eval('#lolLog li', (l) => l.map((li) => `${li.querySelector('b').textContent}: ${li.lastChild.textContent}`)); // League chat's messages
const toast = (page, t, what) => wait(page, (t) => lpc.toasts().includes(t), t, what);
const id = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('lpc-squad')).id); // you in your squad

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); // the whole Chromium: the headless one always says no to notifications
  try {
    const [, ray] = await context(browser, 'Rayan', '1.14.0', { 'lpc-remote': 'rayanremote2', 'lpc-goals': { 'rayan#euw RANKED_SOLO_5x5': 'GOLD I' }, 'lpc-goal-from': { 'rayan#euw RANKED_SOLO_5x5': ['GOLD I', 1200] } });
    const [, duo] = await context(browser, 'Duo', '1.13.0', { 'lpc-remote': 'duophone2345', 'lpc-goals': { 'duo#euw RANKED_SOLO_5x5': 'PLATINUM IV' } });

    // ---- a voice room: the goal board, the closest first, each bar from where they were when they picked their goal;
    // then Best roles from everyone's wins in each role
    await ray.click('.nav[data-view="voice"]');
    await ray.click('#createBtn');
    await wait(ray, () => lpc.slot() >= 0, null, 'Rayan’s room');
    const code = await ray.evaluate(() => lpc.room()), CODE = code.toUpperCase();
    await duo.click('.nav[data-view="voice"]');
    await duo.fill('#code', code);
    await duo.click('#joinBtn');
    await wait(ray, () => lpc.peers().some((p) => p.name === 'Duo'), null, 'Duo in Rayan’s room', 30000);
    await wait(ray, () => document.querySelectorAll('#goalRows li').length === 2, null, 'the goal board');
    const board = (page) => page.$$eval('#goalRows li', (l) => l.map((li) => [li.firstChild.textContent, li.querySelector('progress').value, li.querySelector('progress').max]));
    assert.deepStrictEqual(await board(ray), [['Rayan (you): Gold I in Solo/Duo, 110 LP to go', 190, 300], ['Duo: Platinum IV in Solo/Duo, 410 LP to go', 0, 410]]);
    await wait(duo, () => document.querySelectorAll('#goalRows li').length === 2, null, 'the goal board on Duo’s page');
    assert.deepStrictEqual((await board(duo)).map(([t]) => t), ['Rayan: Gold I in Solo/Duo, 110 LP to go', 'Duo (you): Platinum IV in Solo/Duo, 410 LP to go']);
    await ray.click('#bestBtn');
    await wait(ray, () => !document.getElementById('rolesBox').hidden, null, 'the roles');
    assert.strictEqual(await text(ray, '#rolesMine'), 'Your role: Middle. Best roles: from everyone’s wins in each role lately.');
    assert.deepStrictEqual(await texts(ray, '#rolesList li'), ['Rayan (you): Middle (6 recent games, 83% won)', 'Duo: Jungle (5 recent games, 80% won)']);
    await toast(duo, 'Best roles: you’re Jungle.', 'Duo’s role');
    assert(await duo.locator('#bestBtn').isDisabled(), 'the host hands them out');
    await shot(ray, 'group-room');
    console.log('room: the goal board (110 and 410 LP to go) and Best roles, Rayan in the middle and Duo in the jungle');

    // ---- Friends: Rayan's League friends, Duo with Premade open and Sleepy without; Duo invited to Rayan's room and
    // joining from the invite; then Duo joining Rayan's League lobby and so his voice room, by itself
    await duo.click('#leaveBtn');
    const frRows = (page) => page.$$eval('#frRows tr', (l) => l.map((tr) => [...tr.children].map((td) => td.textContent).join(' | ')));
    await until(async () => { await ray.evaluate(() => lpc.groupNow()); return (await frRows(ray)).join() === 'Duo#EUW | 🟢 Online · In League | Invite'; }, 'Rayan’s friends online');
    assert.strictEqual(await text(ray, '#frOffBtn'), 'Show offline friends (1)');
    await ray.click('#frOffBtn');
    assert.deepStrictEqual(await frRows(ray), ['Duo#EUW | 🟢 Online · In League | Invite', 'Sleepy#EUW | No Premade yet | '], 'and offline ones');
    if (process.env.SHOTS) await ray.locator('#groupBox').screenshot({ path: path.join(process.env.SHOTS, 'friends-list.png') });
    assert.deepStrictEqual(JSON.parse(await ray.evaluate(() => localStorage.getItem('lpc-lolfriends'))).map((x) => x.riot).sort(), ['Duo#EUW', 'Sleepy#EUW'], 'League friends kept for when League is closed');
    await ray.click('.nav[data-view="profile"]'); // Profile's friends, each opening their profile
    await wait(ray, () => [...document.querySelectorAll('#proFrList button')].map((b) => b.textContent).join() === 'Duo#EUW,Sleepy#EUW', null, 'friends on Profile');
    await ray.click('#proFrList button');
    await wait(ray, () => /Duo#EUW/.test(document.getElementById('proFindNote').textContent) || document.getElementById('proName').textContent === 'Duo', null, 'Duo’s profile looked up');
    await ray.click('.nav[data-view="voice"]');
    await ray.fill('#frId', 'Kev # NA1');
    await ray.click('#frAdd button');
    assert.deepStrictEqual(await frRows(ray), ['Duo#EUW | 🟢 Online · In League | Invite', 'Kev#NA1 | No Premade yet | Remove', 'Sleepy#EUW | No Premade yet | ']);
    await ray.click('#frRows tr:nth-child(2) button');
    assert.strictEqual((await frRows(ray)).length, 2, 'Kev removed');
    await ray.click('#frRows tr:first-child button');
    await toast(ray, `Invited Duo#EUW to room ${CODE}: it pops up in their Premade.`, 'the invite sent');
    await until(async () => { await duo.evaluate(() => lpc.groupNow()); return (await duo.evaluate(() => lpc.toasts())).includes(`Rayan invites you to their voice room, ${CODE}. Join from Friends, on the Voice page.`); }, 'the invite on Duo’s page');
    assert.strictEqual(await text(duo, '#frInvBox p'), `Rayan invites you to their voice room, ${CODE}.`);
    if (process.env.SHOTS) await duo.locator('#groupBox').screenshot({ path: path.join(process.env.SHOTS, 'friends-invite.png') });
    await duo.click('#frInvBox .btn.primary');
    await wait(duo, (c) => lpc.room() === c && lpc.slot() >= 0, code, 'Duo in Rayan’s room from the invite');
    await wait(duo, () => document.getElementById('frInvBox').hidden, null, 'the invite gone once in the room');
    await duo.click('#leaveBtn');
    await duo.waitForTimeout(1100); // invites in a later second than Leave join by themselves
    L.lobby = { partyId: 'party-1234', members: [{ puuid: 'rayan-puuid', gameName: 'Rayan', gameTag: 'EUW' }, { puuid: 'duo-puuid', gameName: 'Duo', gameTag: 'EUW' }], invitations: [] };
    // an invite that says it's from Rayan but not made in his lobby (someone else saying hello with his Riot ID): asked,
    // not joined
    await duo.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    S.inv.push({ to: 'duo#euw', src: await ray.evaluate(() => localStorage.getItem('lpc-device')), room: 'fake', key: '', lob: 'f'.repeat(64), at: Math.round(Date.now() / 1000) });
    await until(async () => { await duo.evaluate(() => lpc.groupNow()); return (await duo.evaluate(() => lpc.toasts())).includes('Rayan invites you to their voice room, FAKE. Join from Friends, on the Voice page.'); }, 'the made-up invite asked about');
    assert.strictEqual(await duo.evaluate(() => lpc.slot()), -1, 'and not joined');
    await ray.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'Lobby' }));
    await until(async () => { for (const pg of [ray, duo]) await pg.evaluate(() => lpc.groupNow()); return duo.evaluate((c) => lpc.room() === c && lpc.slot() >= 0, code); }, 'Duo in Rayan’s room from the lobby');
    await toast(duo, `Joined Rayan’s voice room, ${CODE}, as you’re in their League lobby`, 'why');
    // in the lobby before Rayan has a room: Duo joins as soon as he makes (here, joins again) one
    for (const pg of [duo, ray]) await pg.click('#leaveBtn');
    // Duo's lobby invite to Rayan, made while they were both in the room but first seen by Rayan after Leave (here its
    // time moved to just before Leave, so it's new to his page), doesn't pull him back in
    const stale = S.inv.find((v) => v.to === 'rayan#euw' && v.room === code);
    assert(stale && stale.lob, 'Duo’s lobby invite to Rayan');
    stale.at = Math.round(Date.now() / 1000) - 1;
    for (let i = 0; i < 3; i++) { await ray.evaluate(() => lpc.groupNow()); await ray.waitForTimeout(700); }
    assert.strictEqual(await ray.evaluate(() => lpc.slot()), -1, 'Rayan stays out after Leave');
    await ray.waitForTimeout(1100); // invites in a later second than Leave join by themselves again
    await ray.fill('#code', code);
    await ray.click('#joinBtn');
    await until(async () => { for (const pg of [ray, duo]) await pg.evaluate(() => lpc.groupNow()); return duo.evaluate((c) => lpc.room() === c && lpc.slot() >= 0, code); }, 'Duo in Rayan’s new room from the lobby');
    L.lobby = null;
    for (const pg of [ray, duo]) await pg.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    await wait(ray, () => lpc.peers().some((p) => p.name === 'Duo'), null, 'Duo back in Rayan’s room', 30000);
    console.log('Friends: who has Premade, one added and removed, an invite joined, and a friend in the lobby joining the room by itself');

    // ---- a squad: Rayan makes one, Duo joins it from the room and turns off pings for rank-ups
    for (const pg of [ray, duo]) await pg.click('#groupBox .tab[data-gt="squad"]');
    assert.match(await text(ray, '#sqNote'), /^A squad is your group of friends/);
    await ray.click('#sqMake');
    await wait(ray, () => document.getElementById('sqList').textContent === 'Rayan (you) · phone remote on', null, 'Rayan’s squad');
    const sqCode = await ray.evaluate(() => JSON.parse(localStorage.getItem('lpc-squad')).code), rayId = await id(ray);
    await wait(duo, () => (document.querySelector('#sqJoins button') || {}).textContent === 'Join Rayan’s squad', null, 'Rayan’s squad on Duo’s page');
    assert.strictEqual(await text(duo, '#sqNote'), 'Friends in your room have a squad: join theirs, or make your own.');
    await duo.click('#sqJoins button');
    await wait(duo, () => document.querySelectorAll('#sqList li').length === 2, null, 'Duo in the squad');
    const duoId = await id(duo);
    assert.deepStrictEqual(await texts(duo, '#sqList li'), ['Rayan · phone remote on', 'Duo (you) · phone remote on']);
    assert(await duo.locator('#optSqGame').isChecked() && await duo.locator('#optSqRank').isChecked(), 'both pings on at first');
    await duo.uncheck('#optSqRank');
    await until(() => S.squads[sqCode].m[duoId] && S.squads[sqCode].m[duoId].r === false, 'Duo’s pings for rank-ups off');
    assert.deepStrictEqual(S.squads[sqCode].m, { [rayId]: { n: 'Rayan', c: 'rayanremote2', g: true, r: true }, [duoId]: { n: 'Duo', c: 'duophone2345', g: true, r: false } });
    console.log('squad: made by Rayan, joined by Duo from the room, with their phones and pings');

    // Duo leaves the room; Rayan calls the squad; Duo's Premade rings, Duo answers In 10 and joins from the call
    await duo.click('#leaveBtn');
    await wait(duo, () => lpc.slot() < 0, null, 'Duo out of the room');
    await ray.evaluate(() => lpc.groupNow());
    await wait(ray, () => document.querySelectorAll('#sqList li').length === 2, null, 'Duo in Rayan’s squad');
    await ray.click('#sqCallBtn');
    await toast(ray, `Called your squad to room ${CODE}: 1 phone got it.`, 'the call');
    await wait(ray, (c) => document.getElementById('sqCall').textContent.startsWith('You called the squad (') && document.getElementById('sqCall').textContent.endsWith(`): room ${c}.`), CODE, 'Rayan’s call');
    assert(await ray.locator('#sqIn10').isHidden() && await ray.locator('#sqJoin').isHidden(), 'nothing to answer to your own call');
    await duo.evaluate(() => lpc.groupNow());
    await toast(duo, `Rayan wants to play: room ${CODE}. Join from Your group, on the Voice page.`, 'the call on Duo’s page');
    assert(await duo.evaluate(() => lpc.played().includes('call')), 'with its ring');
    assert.match(await text(duo, '#sqCall'), new RegExp(`^Rayan wants to play \\([^)]+\\): room ${CODE}\\.$`));
    assert(await duo.locator('#sqJoin').isVisible(), 'Join now, Duo being in no room');
    await duo.click('#sqIn10');
    await until(() => S.squads[sqCode].call.ans[duoId] === 'in10', 'Duo’s answer');
    await ray.evaluate(() => lpc.groupNow());
    await toast(ray, 'Duo: in 10.', 'Duo’s answer on Rayan’s page');
    assert.deepStrictEqual(await texts(ray, '#sqList li'), ['Rayan (you) · phone remote on · called', 'Duo · phone remote on · in 10']);
    await duo.click('#sqJoin');
    await wait(duo, (c) => lpc.room() === c && lpc.slot() >= 0, code, 'Duo in Rayan’s room from the call');
    await wait(duo, () => document.getElementById('sqJoin').hidden, null, 'no Join now in the room');
    console.log('call: Rayan called, Duo’s Premade rang, Duo answered In 10 and joined from it');

    // ---- Discord: the link checked, a test post; then a ranked game pings the squad when it starts and when Rayan ranks
    // up after it, and posts the result in Discord
    await ray.click('.nav[data-view="settings"]');
    await ray.fill('#optHook', 'https://example.com/hook');
    await ray.locator('#optHook').dispatchEvent('change');
    assert.match(await text(ray, '#hookNote'), /^That isn’t a Discord webhook link/);
    await ray.fill('#optHook', HOOK);
    await ray.locator('#optHook').dispatchEvent('change');
    await ray.click('#hookTest');
    await wait(ray, () => document.getElementById('hookNote').textContent === 'Sent: have a look in your Discord channel.', null, 'the test post');
    assert.deepStrictEqual(discord, [{ content: 'Rayan’s games and clips will post here.', username: 'Premade', allowed_mentions: { parse: [] } }]);
    await ray.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'InProgress' }));
    await until(() => S.pings.length === 1, 'the ping for a game');
    assert.deepStrictEqual(S.pings, [['Rayan', { id: rayId, k: 'game', q: 'Ranked Solo/Duo', c: 'Ahri' }]]);
    L.lp = { gameId: 77, queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 15, leaguePointsDelta: 25 };
    await ray.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'EndOfGame' }));
    await until(() => discord.length === 2, 'the game on Discord');
    assert.deepStrictEqual(S.pings[1], ['Rayan', { id: rayId, k: 'rank', r: 'Gold II in Solo/Duo' }]);
    assert.strictEqual(discord[1].content, '**Rayan** won Ranked Solo/Duo as Ahri · 8/2/6 · score 100 (MVP)\n+25 LP: Gold II · 15 LP\nRanked up to Gold II in Solo/Duo!');
    await ray.evaluate(() => lpcClient.emit('league', { inGame: false, phase: 'None' }));
    console.log('Discord and pings: a test post; a game pinged when it started and for the rank-up after, and its result posted');


    // ---- League chat on Pregame: chats with friends, Duo#EUW's opened and answered, a new message and an invite pop up,
    // the invite accepted; your room in your League status
    await ray.click('.nav[data-view="pregame"]');
    await wait(ray, () => !!document.querySelector('#lolConvs button'), null, 'League chat');
    assert.deepStrictEqual(await texts(ray, '#lolConvs button'), ['Duo#EUW (1)'], 'not champ select’s chat');
    assert.deepStrictEqual(await texts(ray, '#lolFriend option'), ['Pick a friend', 'Duo#EUW'], 'friends online');
    await ray.click('#lolConvs button');
    await wait(ray, () => document.querySelectorAll('#lolLog li').length === 1, null, 'Duo’s messages');
    assert.deepStrictEqual(await said(ray), ['Duo#EUW: gg wp']);
    assert.strictEqual(await text(ray, '#lolWho'), 'Duo#EUW');
    await ray.fill('#lolText', 'one more?');
    await ray.press('#lolText', 'Enter');
    await wait(ray, () => document.querySelectorAll('#lolLog li').length === 2, null, 'the answer');
    assert.deepStrictEqual(await said(ray), ['Duo#EUW: gg wp', 'You: one more?']);
    chat.msgs.push({ body: 'sure, 2 min', type: 'chat', fromPid: DUO, timestamp: iso(0) });
    chat.unread = 2;
    await toast(ray, 'Duo#EUW: sure, 2 min', 'the new message');
    chat.inv.push({ invitationId: 'inv-1', state: 'Pending', fromSummonerId: 31, fromSummonerName: '', gameConfig: { queueId: 420 } });
    await toast(ray, 'Duo#EUW invited you to Ranked Solo/Duo. Accept or decline on Pregame or your phone.', 'the invite');
    await ray.locator('#lolInv').getByRole('button', { name: 'Accept' }).click();
    await until(() => chat.inv[0].state === 'Accepted', 'the invite accepted');
    await wait(ray, () => !document.querySelector('#lolInv li'), null, 'the invite gone');
    await ray.check('#optLolStatus');
    await until(() => chat.puts.length === 1, 'your room in your League status');
    assert.deepStrictEqual(chat.puts, [`Premade room ${CODE}`]);
    assert.strictEqual(await ray.evaluate(() => localStorage.getItem('lpc-lol-status')), '"ranked grind"', 'the old status kept');
    await shot(ray, 'group-lolchat');
    await duo.click('.nav[data-view="pregame"]');
    await wait(duo, () => !document.getElementById('lolChatBox').hidden, null, 'League chat on Duo’s Pregame');
    assert(await duo.locator('#lolChatNote').isVisible() && await duo.locator('#lolChatMain').isHidden(), 'app 1.13 is told to update');
    assert(!L.calls.some(([who, , p]) => who === 'Duo' && /^\/lol-(chat|lobby\/v2\/received)/.test(p) && p !== '/lol-chat/v1/friends'), 'and doesn’t try'); // Friends reads the friends list (app 1.11)
    console.log('League chat: a message answered, a new one and an invite popped up, accepted, the room in the status; app 1.13 told to update');

    // ---- the phone remote: League chat, answered from the phone; a squad call's notification with In 10 and Not tonight
    // (In 10 answers our server), a ping's without; the call opened on the remote, as tapping it does, and Not tonight
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await routes(pctx);
    await pctx.grantPermissions(['notifications']);
    const phone = await pctx.newPage();
    phone.on('pageerror', (e) => console.log('[phone] page error:', e.message));
    await phone.goto('http://127.0.0.1:8086/remote.html?peer=127.0.0.1:9006&debug#rayanremote2');
    await wait(phone, () => document.getElementById('conn').textContent === 'Connected', null, 'the phone connected');
    await wait(phone, () => !document.getElementById('lol').hidden && document.querySelectorAll('#lolLog li').length === 3, null, 'League chat on the phone');
    assert.deepStrictEqual(await texts(phone, '#lolConvs button'), ['Duo#EUW (2)']);
    assert.deepStrictEqual(await said(phone), ['Duo#EUW: gg wp', 'You: one more?', 'Duo#EUW: sure, 2 min']);
    await phone.fill('#lolText', 'omw');
    await phone.click('#lolForm button');
    await until(() => chat.msgs.some((m) => m.body === 'omw' && m.fromPid === ME), 'the phone’s answer sent through League');
    const cdp = await pctx.newCDPSession(phone), regs = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable');
    await until(() => regs.some((g) => g.scopeURL.endsWith('/remote.html')), 'the remote’s service worker');
    const push = (data) => cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://127.0.0.1:8086', registrationId: regs.find((g) => g.scopeURL.endsWith('/remote.html')).registrationId, data: JSON.stringify(data) });
    const shown = () => phone.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => [n.tag, n.title, n.body, n.actions.map((a) => a.title).join(', ')]));
    await push({ t: 'call', title: 'Duo wants to play', body: 'Room KAYN', sq: sqCode, call: 2, api: 'http://127.0.0.1:9106', to: rayId }); // as server/squad.js sends it
    await until(async () => (await shown()).length === 1, 'the call’s notification');
    assert.deepStrictEqual(await shown(), [['call', 'Duo wants to play', 'Room KAYN', 'In 10, Not tonight']]);
    const sw = pctx.serviceWorkers().find((w) => w.url().endsWith('/remote-sw.js'));
    await sw.evaluate(async () => { const [n] = await self.registration.getNotifications({ tag: 'call' }); self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n, action: 'in10' })); });
    await until(() => answered.length === 1, 'In 10 from the notification');
    assert.deepStrictEqual(answered, [[`/squad/${sqCode}/answer`, JSON.stringify({ id: rayId, call: 2, a: 'in10' })]]);
    await push({ t: 'ping', title: 'Duo started a game', body: 'Ranked Solo/Duo as Ahri', sq: sqCode, api: 'http://127.0.0.1:9106', to: rayId });
    await until(async () => (await shown()).length === 1 && (await shown())[0][0] === 'ping', 'the ping’s notification');
    assert.deepStrictEqual(await shown(), [['ping', 'Duo started a game', 'Ranked Solo/Duo as Ahri', '']]);
    await phone.goto(`http://127.0.0.1:8086/remote.html?peer=127.0.0.1:9006&sq=${sqCode}&call=1&to=${duoId}`); // Duo's phone, from the notification
    await wait(phone, () => !document.getElementById('call').hidden, null, 'the call on the remote');
    assert.strictEqual(await text(phone, '#callText'), `Rayan wants to play: room ${CODE}. You said In 10.`);
    await phone.click('#callNo');
    await wait(phone, () => document.getElementById('callText').textContent === 'Sent: Not tonight.', null, 'Not tonight sent');
    assert.strictEqual(S.squads[sqCode].call.ans[duoId], 'no');
    await pctx.close();
    console.log('phone remote: League chat answered from the phone; a call’s notification with In 10 and Not tonight, a ping’s, the call on the remote');

    // ---- Rayan leaves the room, and the old League status is back; then the squad
    await ray.click('.nav[data-view="voice"]');
    await ray.click('#leaveBtn');
    await until(() => chat.puts.length === 2, 'the old status back');
    assert.strictEqual(chat.puts[1], 'ranked grind');
    assert.strictEqual(await ray.evaluate(() => localStorage.getItem('lpc-lol-status')), 'null');
    await ray.click('#groupBox .tab[data-gt="squad"]');
    ray.once('dialog', (d) => d.accept());
    await ray.click('#sqLeave');
    await until(() => !S.squads[sqCode].m[rayId], 'Rayan out of the squad');
    assert.strictEqual(await ray.evaluate(() => localStorage.getItem('lpc-squad')), 'null');
    assert(await ray.locator('#sqMake').isVisible(), 'Make a squad again');
    assert.deepStrictEqual(L.refused, [], 'only calls the desktop app lets through');
    console.log(`leaving: the old League status back, out of the squad; all ${L.calls.length} calls to League's client are on the desktop app's list`);
  } finally {
    await browser.close();
  }
  console.log('Your group tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

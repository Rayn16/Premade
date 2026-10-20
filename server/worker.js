// The proximity chat's own connection server: a Cloudflare Worker that speaks the PeerJS server protocol, so the
// voice page's PeerJS client works with it unchanged. It only introduces players (WebRTC offers, answers and
// candidates); voice goes directly between players. Each room is one Durable Object, holding its players' sockets.
// Only ids the voice page uses are let in: lolprox-<room>-<slot>. /stats counts rooms and players each day for the
// voice page (Settings > Our server). /push/... is the phone remote's notifications (push.js). /riot/... is Riot
// data (the Riot object, at the end).
import { DurableObject } from 'cloudflare:workers';
import { push } from './push.js';

const ID = /^lolprox-[a-z0-9]{1,20}-\d$/;
const RELAYED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'EXPIRE']);
const CORS = { 'access-control-allow-origin': '*' };
const stats = (env) => env.STATS.get(env.STATS.idFromName('all')); // ponytail: one counter for every room, fine for friend groups
const day = (ago = 0) => new Date(Date.now() - ago * 864e5).toISOString().slice(0, 10); // UTC

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/peerjs' && req.headers.get('Upgrade') === 'websocket') {
      const id = url.searchParams.get('id') || '';
      if (!ID.test(id) || !url.searchParams.get('token')) return new Response('Not a proximity chat player', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(id.slice(0, id.lastIndexOf('-')))).fetch(req);
    }
    if (url.pathname === '/stats') return Response.json({ days: await stats(env).days() }, { headers: CORS });
    const code = /^\/push\/([a-z0-9]{12})(\/ring)?$/.exec(url.pathname); // the phone remote's notifications (push.js)
    if (code) return env.ROOMS.get(env.ROOMS.idFromName(`lolprox-r${code[1]}`)).fetch(req);
    if (url.pathname.startsWith('/riot/')) return riot(env).fetch(req);
    if (url.pathname === '/') return new Response('League proximity chat connection server', { headers: CORS });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(event, env) { // every 30 minutes: wakes the Riot object's counting if it ever stopped
    await riot(env).kick();
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // PeerJS clients send a heartbeat every 5 s; answering it here doesn't wake the room up
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"HEARTBEAT"}', '{"type":"HEARTBEAT"}'));
  }
  open(id) {
    return this.ctx.getWebSockets(id).filter((ws) => ws.readyState === WebSocket.OPEN);
  }
  async fetch(req) {
    const url = new URL(req.url), id = url.searchParams.get('id'), token = url.searchParams.get('token');
    if (url.pathname.startsWith('/push/')) return push(req, this.ctx.storage, this.env);
    const [client, server] = Object.values(new WebSocketPair());
    const old = this.open(id);
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, token });
    if (old.some((ws) => ws.deserializeAttachment().token !== token)) {
      server.send(JSON.stringify({ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } })); // the voice page then tries the next slot
      server.close(1000, 'ID is taken');
    } else {
      for (const ws of old) ws.close(1000, 'Reconnected'); // the same player coming back
      server.send(JSON.stringify({ type: 'OPEN' }));
      const room = id.slice(8, id.lastIndexOf('-'));
      if (!/^r[a-z0-9]{12}$/.test(room)) stats(this.env).seen(room, req.headers.get('cf-connecting-ip') || token).catch(() => {}); // not phone remotes
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, data) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || !RELAYED.has(m.type) || typeof m.dst !== 'string') return;
    const src = ws.deserializeAttachment().id, [to] = this.open(m.dst);
    if (to) to.send(JSON.stringify({ type: m.type, src, dst: m.dst, payload: m.payload }));
    else if (m.type === 'OFFER') ws.send(JSON.stringify({ type: 'EXPIRE', src: m.dst, dst: src })); // nobody in that slot
  }
  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'Bye'); } catch {}
  }
}

// Rooms and players each day, kept 60 days. A player is a hash of their internet address and that day's random salt,
// which is deleted once the day is over, so nobody can turn it back into an address. No names are kept.
export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seen (day TEXT, kind TEXT, k TEXT, PRIMARY KEY (day, kind, k))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS salt (day TEXT PRIMARY KEY, salt TEXT)');
  }
  prune() {
    this.ctx.storage.sql.exec('DELETE FROM salt WHERE day < ?', day());
    this.ctx.storage.sql.exec('DELETE FROM seen WHERE day < ?', day(60));
  }
  async seen(room, ip) {
    const sql = this.ctx.storage.sql, today = day();
    this.prune();
    let salt = sql.exec('SELECT salt FROM salt WHERE day = ?', today).toArray()[0]?.salt;
    if (!salt) sql.exec('INSERT INTO salt VALUES (?, ?)', today, (salt = crypto.randomUUID()));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip)));
    const who = Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
    sql.exec('INSERT OR IGNORE INTO seen VALUES (?, ?, ?), (?, ?, ?)', today, 'room', room, today, 'player', who);
  }
  days() { // the last 14 days: [{ day: 'YYYY-MM-DD', rooms, players }], days with nobody left out
    this.prune();
    const out = {};
    for (const r of this.ctx.storage.sql.exec('SELECT day, kind, COUNT(*) AS n FROM seen WHERE day >= ? GROUP BY day, kind', day(13)))
      (out[r.day] ??= { day: r.day, rooms: 0, players: 0 })[r.kind === 'room' ? 'rooms' : 'players'] = r.n;
    return Object.values(out);
  }
}

// ---- Riot data. Our Riot API key (the secret RIOT_KEY) only lives here, in the Riot object (one for everything).
// It counts high-elo ranked games, one Riot call every 30 s, for the voice page's popular builds, runes, skill
// orders and matchups (/riot/champ, /riot/summary), and passes a few read-only calls through for player lookups
// (/riot/api/<region>/<path>), keeping under our key's limits: 20 calls a second and 100 every 2 minutes, per region.
// What it keeps of a game is each champion, its role and what it did, with no player in it.
const riot = (env) => env.RIOT.get(env.RIOT.idFromName('riot'));
const ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const REGION = { kr: 'asia', jp1: 'asia', euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe', na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea' };
const REGIONS = new Set(Object.values(REGION));
const ORIGIN = /^(https:\/\/([a-z0-9]+--)?league-proxchat\.netlify\.app|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;
const PUUID = '[A-Za-z0-9_-]{60,100}';
const LOOKUPS = [ // [path, on a region (else a platform), the query parameters it may have]
  [/^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/]{1,200}\/[^/]{1,40}$/, true, []],
  [RegExp(`^/lol/league/v4/entries/by-puuid/${PUUID}$`), false, []],
  [RegExp(`^/lol/summoner/v4/summoners/by-puuid/${PUUID}$`), false, []],
  [RegExp(`^/lol/champion-mastery/v4/champion-masteries/by-puuid/${PUUID}/top$`), false, ['count']],
  [RegExp(`^/lol/spectator/v5/active-games/by-summoner/${PUUID}$`), false, []], // in a game right now (404 when not)
  [RegExp(`^/lol/match/v5/matches/by-puuid/${PUUID}/ids$`), true, ['start', 'count', 'queue', 'type']],
  [/^\/lol\/match\/v5\/matches\/[A-Z0-9]{2,6}_\d{5,15}$/, true, []],
];
const KEEP = 500; // games kept for each champion and role: a new one takes a random place, so older ones thin out
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const newer = (a, b) => { const [x, y] = a.split('.').map(Number), [u, v] = (b || '0.0').split('.').map(Number); return x > u || (x === u && y > v); };
const runesOf = (pk) => { // [primary tree, secondary tree, its six runes, the offense, flex and defense shards]
  const [a, b] = (pk && pk.styles) || [], s = (pk && pk.statPerks) || {};
  if (!a || !b || (a.selections || []).length !== 4 || (b.selections || []).length !== 2) return null;
  return [a.style, b.style, ...a.selections.map((x) => x.perk), ...b.selections.map((x) => x.perk), s.offense, s.flex, s.defense];
};

export class Riot extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS games (champ INTEGER, role TEXT, slot INTEGER, patch TEXT, at INTEGER, win INTEGER, opp INTEGER, gd INTEGER, d TEXT, PRIMARY KEY (champ, role, slot)) WITHOUT ROWID');
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID');
    this.calls = {}; // routing value -> times of our calls in the last 2 minutes
    this.until = {}; // routing value -> when Riot lets us call again
    this.ips = new Map(); // lookups each address made in the last 2 minutes
    ctx.blockConcurrencyWhile(() => this.kick());
  }
  async kick() { if (this.env.RIOT_KEY && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 1000); }
  get(k, d) { const [r] = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray(); return r ? JSON.parse(r.v) : d; }
  put(k, v) { this.sql.exec('INSERT INTO kv VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }
  room(host, most) { // whether a call to host keeps under Riot's limits, with at most `most` calls in 2 minutes
    const now = Date.now(), t = (this.calls[host] || []).filter((x) => now - x < 120000);
    this.calls[host] = t;
    return now >= (this.until[host] || 0) && t.length < most && t.filter((x) => now - x < 1000).length < 15;
  }
  async riot(host, path) { // Riot's answer; a 429, or Riot refusing our key, holds that host off
    (this.calls[host] ||= []).push(Date.now());
    const r = await fetch((this.env.RIOT_BASE || 'https://{host}.api.riotgames.com').replace('{host}', host) + path, { headers: { 'X-Riot-Token': this.env.RIOT_KEY } });
    if (r.status === 429) this.until[host] = Date.now() + 1000 * Math.min(600, +r.headers.get('retry-after') || 10);
    if (r.status === 401 || r.status === 403) this.until[host] = Date.now() + 600000;
    return r;
  }
  async json(host, path) { const r = await this.riot(host, path); return r.ok ? r.json() : null; }

  async fetch(req) {
    const url = new URL(req.url), o = req.headers.get('origin') || '', cors = ORIGIN.test(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
    const json = { ...cors, 'content-type': 'application/json' };
    if (url.pathname === '/riot/summary') { const { p, c, old, today, total, at } = this.sumOf(); return new Response(JSON.stringify({ p, c, old, today, total, at }), { headers: json }); }
    if (url.pathname === '/riot/champ') return new Response(this.champ(+url.searchParams.get('c'), url.searchParams.get('r')), { headers: json });
    const m = url.pathname.match(/^\/riot\/api\/([a-z0-9]+)(\/.+)$/);
    if (m && this.env.RIOT_KEY) return this.lookup(m[1], m[2], url.searchParams, req.headers.get('cf-connecting-ip') || '', cors);
    return new Response('Not found', { status: 404, headers: cors });
  }
  // a player lookup's call, passed through as Riot answers it: only the calls in LOOKUPS, 60 every 2 minutes from
  // one address, and while our key has room (90 every 2 minutes for each region)
  async lookup(host, path, q, ip, cors) {
    const rule = (host in REGION || REGIONS.has(host)) && !/\.\.|%2e|%2f|%5c|\\/i.test(path) && LOOKUPS.find(([re, regional]) => re.test(path) && regional === REGIONS.has(host));
    if (!rule) return new Response('Not a lookup this server makes', { status: 404, headers: cors });
    const qs = new URLSearchParams();
    for (const [k, v] of q) if (rule[2].includes(k) && /^[A-Za-z0-9_]{1,12}$/.test(v)) qs.set(k, k === 'count' ? String(Math.max(1, Math.min(20, +v || 1))) : v);
    const now = Date.now(), mine = (this.ips.get(ip) || []).filter((t) => now - t < 120000);
    if (mine.length >= 60 || !this.room(host, 90)) return new Response('Too many lookups for now', { status: 429, headers: { ...cors, 'retry-after': '30' } });
    this.ips.set(ip, [...mine, now]);
    if (this.ips.size > 500) for (const [k, t] of this.ips) if (now - t[t.length - 1] > 120000) this.ips.delete(k);
    const r = await this.riot(host, path + (qs.size ? '?' + qs : ''));
    return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': `private, max-age=${/\/matches\/[A-Z]/.test(path) ? 86400 : 60}` } });
  }

  // games and wins for each champion and role, this patch and the one before; and how many games were counted
  sumOf() { return (this.sum ||= this.get('sum', { p: '', c: {}, old: null, day: '', today: 0, total: 0, at: 0 })); }
  count(patch, c, role, w) {
    const s = this.sumOf();
    if (newer(patch, s.p)) { s.old = s.p ? { p: s.p, c: s.c } : null; s.p = patch; s.c = {}; }
    const t = patch === s.p ? s.c : s.old && patch === s.old.p ? s.old.c : null;
    if (!t) return;
    const v = ((t[c] ||= {})[role] ||= [0, 0]);
    v[0]++;
    v[1] += w;
  }
  // a champion's games in a role (its most played role when none is asked for), newest patch first, for the page
  // to count builds, runes, skill orders and matchups from
  champ(c, role) {
    if (!Number.isInteger(c) || c <= 0 || c > 1e5) return '{"games":[]}';
    const s = this.sumOf(), mine = s.c[c] || (s.old && s.old.c[c]) || {};
    if (!ROLES.has(role)) role = Object.keys(mine).sort((a, b) => mine[b][0] - mine[a][0])[0] || 'MIDDLE';
    const rows = this.sql.exec('SELECT patch, at, win, opp, gd, d FROM games WHERE champ = ? AND role = ? ORDER BY at DESC', c, role).toArray();
    return `{"patch":${JSON.stringify(s.p)},"role":"${role}","roles":${JSON.stringify(s.c[c] || {})},"games":[${rows.map((x) => `{"p":${JSON.stringify(x.patch)},"t":${x.at},"w":${x.win},"o":${x.opp},"g":${x.gd ?? 'null'},${x.d.slice(1)}`).join(',')}]}`;
  }

  async alarm() {
    if (!this.env.RIOT_KEY) return;
    await this.ctx.storage.setAlarm(Date.now() + (+this.env.CRAWL_EVERY || 30000));
    try { await this.crawl(); } catch (e) { console.log('crawl:', e && e.message); }
  }
  // One step each time, mostly one Riot call: the Challenger and Grandmaster ladders every 6 hours, then a ladder
  // player's ranked solo games of the last 3 days, a game nobody counted yet, or that game's timeline. Only full
  // Summoner's Rift games count (15 minutes or more, every role filled once a team).
  // ponytail: 4,000 steps a day at most, so the free plan's daily writes stay mostly free for the voice rooms
  async crawl() {
    const p = this.env.CRAWL || 'kr', r = REGION[p], st = (this.st ||= this.get('crawl', { li: 0, lat: 0, q: [], cur: null, day: '', steps: 0 }));
    if (st.day !== day()) { st.day = day(); st.steps = 0; }
    if (st.steps >= 4000 || !this.room(p, 50) || !this.room(r, 50)) return;
    st.steps++;
    this.seen ||= new Set(this.get('seen', []));
    this.lad ||= this.get('ladder', []);
    if (st.cur) return this.timeline(r, st);
    while (st.q.length) {
      const id = st.q.shift();
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      for (const x of this.seen) { if (this.seen.size <= 6000) break; this.seen.delete(x); }
      this.put('seen', [...this.seen]);
      this.put('crawl', st);
      return this.match(r, id, st);
    }
    if (!this.lad.length || Date.now() - st.lat > 6 * 3600e3) {
      const lads = await Promise.all(['challenger', 'grandmaster'].map((t) => this.json(p, `/lol/league/v4/${t}leagues/by-queue/RANKED_SOLO_5x5`)));
      const ids = lads.flatMap((l) => (l && Array.isArray(l.entries) ? l.entries : []).map((e) => e && e.puuid).filter((x) => typeof x === 'string'));
      st.lat = Date.now();
      if (ids.length) { this.lad = ids; this.put('ladder', ids); }
      return this.put('crawl', st);
    }
    const who = this.lad[st.li++ % this.lad.length];
    const ids = await this.json(r, `/lol/match/v5/matches/by-puuid/${who}/ids?queue=420&type=ranked&count=20&startTime=${Math.floor(Date.now() / 1000) - 3 * 86400}`);
    if (Array.isArray(ids)) st.q = [...st.q, ...ids.filter((id) => typeof id === 'string' && !this.seen.has(id) && !st.q.includes(id))].slice(-300);
    this.put('crawl', st);
  }
  async match(r, id, st) {
    const m = await this.json(r, `/lol/match/v5/matches/${id}`), i = m && m.info, ps = (i && i.participants) || [];
    const patch = i ? String(i.gameVersion || '').split('.').slice(0, 2).join('.') : '';
    if (!i || i.queueId !== 420 || i.mapId !== 11 || !(i.gameDuration >= 900) || ps.length !== 10 || !/^\d+\.\d+$/.test(patch)
      || !ps.every((x) => ROLES.has(x.teamPosition) && Number.isInteger(x.championId)) || new Set(ps.map((x) => x.teamId + x.teamPosition)).size !== 10) return;
    st.cur = { id, patch, at: Math.round(i.gameCreation / 1000), ps: ps.map((x) => ({ id: x.participantId, c: x.championId, r: x.teamPosition, t: x.teamId, w: x.win ? 1 : 0,
      s: [x.summoner1Id, x.summoner2Id], rn: runesOf(x.perks), x: [x.kills, x.deaths, x.assists, x.totalMinionsKilled + x.neutralMinionsKilled] })) };
    this.put('crawl', st);
  }
  // what each player bought (undone buys taken out) and levelled, and their gold, CS and XP at 10 minutes against
  // their lane opponent's
  async timeline(r, st) {
    const g = st.cur;
    st.cur = null;
    this.put('crawl', st); // first, so a timeline that fails on us isn't tried again
    const tl = await this.json(r, `/lol/match/v5/matches/${g.id}/timeline`), frames = (tl && tl.info && Array.isArray(tl.info.frames) && tl.info.frames) || [];
    if (!frames.length) return;
    const buys = {}, skills = {};
    for (const f of frames) for (const e of f.events || []) {
      const p = e.participantId, b = buys[p];
      if (e.type === 'ITEM_PURCHASED') (buys[p] ||= []).push([Math.round(e.timestamp / 1000), e.itemId]);
      else if (e.type === 'ITEM_UNDO' && e.beforeId > 0 && b) { const i = b.map((x) => x[1]).lastIndexOf(e.beforeId); if (i >= 0) b.splice(i, 1); }
      else if (e.type === 'SKILL_LEVEL_UP' && e.levelUpType === 'NORMAL' && e.skillSlot >= 1 && e.skillSlot <= 4) (skills[p] ||= []).push(e.skillSlot);
    }
    const f10 = frames.find((f) => Math.abs(f.timestamp - 600000) <= 45000);
    const at10 = (id) => { const q = (f10 && f10.participantFrames && f10.participantFrames[id]) || {}; return [q.totalGold | 0, (q.minionsKilled | 0) + (q.jungleMinionsKilled | 0), q.xp | 0]; };
    const slot = hash(g.id) % KEEP;
    for (const x of g.ps) {
      const o = g.ps.find((y) => y.t !== x.t && y.r === x.r), [gx, cx, xx] = at10(x.id), [go, co, xo] = at10(o.id);
      const d = JSON.stringify({ s: x.s, rn: x.rn, b: (buys[x.id] || []).slice(0, 60), k: (skills[x.id] || []).slice(0, 18), x: x.x, l: f10 ? [cx - co, xx - xo] : null });
      this.sql.exec('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (champ, role, slot) DO UPDATE SET patch = excluded.patch, at = excluded.at, win = excluded.win, opp = excluded.opp, gd = excluded.gd, d = excluded.d',
        x.c, x.r, slot, g.patch, g.at, x.w, o.c, f10 ? gx - go : null, d);
      this.count(g.patch, x.c, x.r, x.w);
    }
    const s = this.sumOf();
    if (s.day !== day()) { s.day = day(); s.today = 0; }
    s.today++;
    s.total++;
    s.at = g.at;
    this.put('sum', s);
  }
}

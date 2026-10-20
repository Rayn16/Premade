// The proximity chat's own connection server: a Cloudflare Worker that speaks the PeerJS server protocol, so the
// voice page's PeerJS client works with it unchanged. It only introduces players (WebRTC offers, answers and
// candidates); voice goes directly between players. Each room is one Durable Object, holding its players' sockets.
// Only ids the voice page uses are let in: lolprox-<room>-<slot>, and once a room is locked, only those with its
// password. /stats counts rooms and players each day for the voice page (Settings > Our server). /riot/... is Riot
// data (the Riot object, at the end).
import { DurableObject } from 'cloudflare:workers';

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
    if (url.pathname.startsWith('/riot/')) return riot(env).fetch(req);
    if (url.pathname === '/') return new Response('League proximity chat connection server', { headers: CORS });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(event, env) { // every 30 minutes: wakes the Riot object's counting if it ever stopped
    await riot(env).kick();
  },
};

// A locked room: each page sends {type: 'LOCK', payload: {key}} whenever its socket opens, key being a hash of the
// password it knows ('' for none). In a locked room a newcomer is let in (its messages passed on, and others' to it)
// only once its key matches; else it gets INVALID-KEY and is closed. Only the host, the lowest slot that's in, can
// lock the room or change its password, and out names a player it removed, whose socket closes. The lock is kept on
// the sockets themselves, so it's forgotten once everyone has left, like the page does.
const KEY = /^[0-9a-f]{64}$/;
const slotOf = (ws) => +ws.deserializeAttachment().id.split('-').pop();

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // PeerJS clients send a heartbeat every 5 s; answering it here doesn't wake the room up
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"HEARTBEAT"}', '{"type":"HEARTBEAT"}'));
  }
  open(id) {
    return (id === undefined ? this.ctx.getWebSockets() : this.ctx.getWebSockets(id)).filter((ws) => ws.readyState === WebSocket.OPEN);
  }
  async fetch(req) {
    const url = new URL(req.url), id = url.searchParams.get('id'), token = url.searchParams.get('token');
    const [client, server] = Object.values(new WebSocketPair());
    const old = this.open(id), [any] = this.open(), lock = (any && any.deserializeAttachment().lock) || '';
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, token, lock, in: !lock });
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
    const a = ws.deserializeAttachment();
    if (m && m.type === 'LOCK') return this.lock(ws, a, m.payload || {});
    if (!m || !a.in || !RELAYED.has(m.type) || typeof m.dst !== 'string') return;
    const [to] = this.open(m.dst).filter((w) => w.deserializeAttachment().in);
    if (to) to.send(JSON.stringify({ type: m.type, src: a.id, dst: m.dst, payload: m.payload }));
    else if (m.type === 'OFFER') ws.send(JSON.stringify({ type: 'EXPIRE', src: m.dst, dst: a.id })); // nobody in that slot
  }
  lock(ws, a, { key, out }) {
    key = KEY.test(key) ? key : '';
    if (!a.in) {
      if (key === a.lock) return ws.serializeAttachment({ ...a, in: true });
      ws.send(JSON.stringify({ type: 'INVALID-KEY', payload: { msg: 'This room is locked' } }));
      return ws.close(1000, 'Locked');
    }
    const ins = this.open().filter((w) => w.deserializeAttachment().in);
    if (!key || key === a.lock || slotOf(ws) !== Math.min(...ins.map(slotOf))) return;
    for (const w of this.open()) {
      const b = w.deserializeAttachment();
      if (b.id === out) w.close(1000, 'Removed');
      else w.serializeAttachment({ ...b, lock: key });
    }
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
// It counts high-elo ranked games for the voice page's popular builds, runes, skill orders, matchups and bans
// (/riot/champ, /riot/summary): the last 3 days' in full, one Riot call every 15 s on Korea's, Europe West's and
// North America's ladders in turn, and Korea's last year more lightly (the sweep, a few calls every 15 s). It passes
// a few read-only calls through for player lookups and server status (/riot/api/<region>/<path>), keeping under our
// key's limits: 20 calls a second and 100 every 2 minutes, per region. What it keeps of a game is each champion, its
// role and what it did, with no player in it. The ranks lookups get are kept for each season (/riot/past), since
// Riot only gives the season being played. /riot/summary also says how much of Cloudflare's free plan it used.
const riot = (env) => env.RIOT.get(env.RIOT.idFromName('riot'));
const ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const REGION = { kr: 'asia', jp1: 'asia', euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe', na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea' };
const REGIONS = new Set(Object.values(REGION));
const ORIGIN = /^(https:\/\/([a-z0-9]+--)?league-proxchat\.netlify\.app|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;
const PUUID = '[A-Za-z0-9_-]{60,100}';
const LOOKUPS = [ // [path, on a region (else a platform), the query parameters it may have]
  [/^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/]{1,200}\/[^/]{1,40}$/, true, []],
  [RegExp(`^/riot/account/v1/region/by-game/lol/by-puuid/${PUUID}$`), true, []], // the server they play League on
  [RegExp(`^/lol/league/v4/entries/by-puuid/${PUUID}$`), false, []],
  [RegExp(`^/lol/summoner/v4/summoners/by-puuid/${PUUID}$`), false, []],
  [RegExp(`^/lol/champion-mastery/v4/champion-masteries/by-puuid/${PUUID}/top$`), false, ['count']],
  [RegExp(`^/lol/spectator/v5/active-games/by-summoner/${PUUID}$`), false, []], // in a game right now (404 when not)
  [RegExp(`^/lol/match/v5/matches/by-puuid/${PUUID}/ids$`), true, ['start', 'count', 'queue', 'type']],
  [/^\/lol\/match\/v5\/matches\/[A-Z0-9]{2,6}_\d{5,15}$/, true, []],
  [/^\/lol\/status\/v4\/platform-data$/, false, []], // the maintenance and problems Riot reports on a server
];
// Cloudflare's free plan, each UTC day: Durable Object requests, SQLite rows read and written, and running time
// (13,000 GB-s at 128 MB is 101,562.5 s). They're for the whole account: the voice rooms use a little too.
const FREE = { req: 1e5, read: 5e6, write: 1e5, ms: 101562500 };
const LADDER = (p) => (p === 'kr' ? 'ladder' : `ladder:${p}`); // where a server's ladder is kept (Korea's from before the others)
const KEEP = 500; // games kept for each champion and role: a new one takes a random place, so older ones thin out
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const rkVal = ([t, d, lp]) => { const i = TIERS.indexOf(t); return i * 1e5 + (i < 7 ? Math.max(0, ['IV', 'III', 'II', 'I'].indexOf(d)) * 1e4 : 0) + lp; }; // the higher rank is bigger
const DAY = 86400; // seconds
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const newer = (a, b) => { const [x, y] = a.split('.').map(Number), [u, v] = (b || '0.0').split('.').map(Number); return x > u || (x === u && y > v); };
const runesOf = (pk) => { // [primary tree, secondary tree, its six runes, the offense, flex and defense shards]
  const [a, b] = (pk && pk.styles) || [], s = (pk && pk.statPerks) || {};
  if (!a || !b || (a.selections || []).length !== 4 || (b.selections || []).length !== 2) return null;
  return [a.style, b.style, ...a.selections.map((x) => x.perk), ...b.selections.map((x) => x.perk), s.offense, s.flex, s.defense];
};
// a game that counts: full ranked solo on Summoner's Rift (15 minutes or more, every role filled once a team), with
// its patch, when it started (in seconds), how long it lasted, its players and the champions banned; else null
const gameOf = (m) => {
  const i = m && m.info, ps = (i && i.participants) || [], patch = i ? String(i.gameVersion || '').split('.').slice(0, 2).join('.') : '';
  if (!i || i.queueId !== 420 || i.mapId !== 11 || !(i.gameDuration >= 900) || ps.length !== 10 || !/^\d+\.\d+$/.test(patch)
    || !ps.every((x) => ROLES.has(x.teamPosition) && Number.isInteger(x.championId)) || new Set(ps.map((x) => x.teamId + x.teamPosition)).size !== 10) return null;
  return { patch, at: Math.round(i.gameCreation / 1000), len: i.gameDuration, ps,
    bans: [...new Set((i.teams || []).flatMap((t) => ((t && t.bans) || []).map((b) => b && b.championId)))].filter((c) => Number.isInteger(c) && c > 0) };
};

export class Riot extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = (this.db = ctx.storage.sql);
    this.cur = []; // this turn's SQL, for the meter: the rows it read and wrote
    this.sql = { exec: (...a) => { const c = sql.exec(...a); this.cur.push(c); return c; } };
    this.sql.exec('CREATE TABLE IF NOT EXISTS games (champ INTEGER, role TEXT, slot INTEGER, patch TEXT, at INTEGER, win INTEGER, opp INTEGER, gd INTEGER, d TEXT, PRIMARY KEY (champ, role, slot)) WITHOUT ROWID');
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID');
    // the sweep's lane matchups, for champions by id % 16 (b) and month ('YYYY-MM'): champion -> role -> lane opponent -> [games, wins]
    this.sql.exec('CREATE TABLE IF NOT EXISTS matchups (b INTEGER, m TEXT, v TEXT, PRIMARY KEY (b, m)) WITHOUT ROWID');
    this.sql.exec('CREATE TABLE IF NOT EXISTS ranks (u TEXT, s INTEGER, q TEXT, peak TEXT, last TEXT, at INTEGER, PRIMARY KEY (u, s, q)) WITHOUT ROWID');
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
  // what this object used of the free plan today (UTC), kept after each turn (an alarm or a call): its request, the
  // rows its SQL read and wrote, w more written (an alarm's next alarm), this write, and how long it ran; with the
  // day before as prev. Every turn has to keep it: the object leaves memory 10 s after its last one.
  use(t, w = 0) {
    const today = day(), u = this.get('use', { day: today, req: 0, read: 0, write: 0, ms: 0 });
    if (u.day !== today) { const { day: d, req, read, write, ms } = u; Object.assign(u, { day: today, req: 0, read: 0, write: 0, ms: 0, prev: { day: d, req, read, write, ms } }); }
    for (const c of this.cur.splice(0)) { u.read += c.rowsRead; u.write += c.rowsWritten; }
    u.req++;
    u.write += w + 1;
    u.ms += Date.now() - t;
    this.db.exec('INSERT INTO kv VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', 'use', JSON.stringify(u));
  }

  async fetch(req) { const t = Date.now(); try { return await this.route(req); } finally { this.use(t); } }
  async route(req) {
    const url = new URL(req.url), o = req.headers.get('origin') || '', cors = ORIGIN.test(o) ? { 'access-control-allow-origin': o, vary: 'origin' } : {};
    const json = { ...cors, 'content-type': 'application/json' };
    if (url.pathname === '/riot/summary') {
      // b and bn: the games each champion was banned in, of the bn games whose bans were counted (old has them too);
      // by: the games counted from each server; from: the oldest day the sweep counted (seconds); on: the day it's on,
      // [day, players asked, games found, games left]; use: what this object used of the free plan (lim) today
      const { p, c, b, bn, old, today, total, by, at } = this.sumOf(), sw = this.swOf(), w = sw.w;
      return new Response(JSON.stringify({ p, c, b, bn, old, today, total, by: by || { kr: total }, at, from: sw.lo < sw.hi ? sw.lo * DAY : undefined,
        on: w ? [w.d * DAY, w.asked, w.found.length, w.q.length] : undefined, use: { ...this.get('use', {}), lim: FREE } }), { headers: json });
    }
    if (url.pathname === '/riot/champ') return new Response(this.champ(+url.searchParams.get('c'), url.searchParams.get('r')), { headers: json });
    if (url.pathname === '/riot/past') return new Response(this.past(url.searchParams.get('u') || ''), { headers: json });
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
    const r = await this.riot(host, path + (qs.size ? '?' + qs : '')), headers = { ...cors, 'content-type': 'application/json', 'cache-control': `private, max-age=${/\/matches\/[A-Z]/.test(path) ? 86400 : 60}` };
    if (!r.ok || !path.includes('/entries/by-puuid/')) return new Response(r.body, { status: r.status, headers });
    const text = await r.text();
    try { this.keep(path.split('/').pop(), JSON.parse(text)); } catch {}
    return new Response(text, { headers });
  }
  // someone's Solo/Duo and Flex ranks from a lookup, kept for this season (its patch's year: 16.x is 2026): the
  // highest seen and the last, with when
  keep(u, list) {
    const a = parseInt(this.sumOf().p, 10), s = a >= 15 ? a + 2010 : new Date().getUTCFullYear(), at = Math.round(Date.now() / 1000);
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || !['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'].includes(e.queueType) || !TIERS.includes(e.tier)) continue;
      const rk = [e.tier, String(e.rank || ''), e.leaguePoints | 0], [old] = this.sql.exec('SELECT peak FROM ranks WHERE u = ? AND s = ? AND q = ?', u, s, e.queueType).toArray();
      const peak = old && rkVal(JSON.parse(old.peak)) > rkVal(rk) ? old.peak : JSON.stringify(rk);
      this.sql.exec('INSERT INTO ranks VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (u, s, q) DO UPDATE SET peak = excluded.peak, last = excluded.last, at = excluded.at', u, s, e.queueType, peak, JSON.stringify(rk), at);
    }
  }
  past(u) { // what keep() has for someone: { s: { season: { queue: { peak, last: [tier, division, LP], at } } } }
    const s = {};
    if (RegExp(`^${PUUID}$`).test(u)) for (const r of this.sql.exec('SELECT s, q, peak, last, at FROM ranks WHERE u = ?', u)) (s[r.s] ||= {})[r.q] = { peak: JSON.parse(r.peak), last: JSON.parse(r.last), at: r.at };
    return JSON.stringify({ s });
  }

  // games and wins for each champion and role (c), and bans (b, bn), this patch and the one before (old); and how
  // many games were counted, from each server (by)
  sumOf() { return (this.sum ||= this.get('sum', { p: '', c: {}, old: null, day: '', today: 0, total: 0, at: 0 })); }
  pt(patch) { // a patch's counts: this patch's (the summary itself), the one before's (old), else null
    const s = this.sumOf();
    if (newer(patch, s.p)) { s.old = s.p ? { p: s.p, c: s.c, b: s.b, bn: s.bn } : null; Object.assign(s, { p: patch, c: {}, b: {}, bn: 0 }); }
    if (!s.old && newer(s.p, patch)) s.old = { p: patch, c: {}, b: {}, bn: 0 }; // the sweep, which goes back in time, meets the patch before first
    return patch === s.p ? s : s.old && patch === s.old.p ? s.old : null;
  }
  count(patch, c, role, w) {
    const t = this.pt(patch), v = t && ((t.c[c] ||= {})[role] ||= [0, 0]);
    if (v) { v[0]++; v[1] += w; }
  }
  ban(patch, bans) { // a game's bans, each champion once; a game kept from before bans were kept has none
    const t = Array.isArray(bans) && this.pt(patch);
    if (!t) return;
    t.b ||= {};
    for (const c of bans) t.b[c] = (t.b[c] | 0) + 1;
    t.bn = (t.bn | 0) + 1;
  }
  counted(n, p = 'kr') { // n more games counted, from server p
    const s = this.sumOf(), by = (s.by ||= { kr: s.total });
    if (s.day !== day()) { s.day = day(); s.today = 0; }
    by[p] = (by[p] | 0) + n;
    s.today += n;
    s.total += n;
    this.put('sum', s);
  }
  // a champion's games in a role (its most played role when none is asked for), newest patch first, from every server
  // the crawl is on, for the page to count builds, runes, skill orders and matchups from; and y, the sweep's games of
  // Korea's last year (none of them among those games): its games and wins there, and against each lane opponent
  // (champion id -> [games, wins])
  champ(c, role) {
    if (!Number.isInteger(c) || c <= 0 || c > 1e5) return '{"games":[]}';
    const s = this.sumOf(), mine = s.c[c] || (s.old && s.old.c[c]) || {}, y = { n: 0, w: 0, vs: {} };
    if (!ROLES.has(role)) role = Object.keys(mine).sort((a, b) => mine[b][0] - mine[a][0])[0] || 'MIDDLE';
    for (const { v } of this.sql.exec('SELECT v FROM matchups WHERE b = ?', c % 16)) for (const [o, [n, w]] of Object.entries((JSON.parse(v)[c] || {})[role] || {})) { const x = (y.vs[o] ||= [0, 0]); x[0] += n; x[1] += w; y.n += n; y.w += w; }
    const rows = this.sql.exec('SELECT patch, at, win, opp, gd, d FROM games WHERE champ = ? AND role = ? ORDER BY at DESC', c, role).toArray();
    return `{"patch":${JSON.stringify(s.p)},"role":"${role}","roles":${JSON.stringify(s.c[c] || {})},"y":${JSON.stringify(y)},"games":[${rows.map((x) => `{"p":${JSON.stringify(x.patch)},"t":${x.at},"w":${x.win},"o":${x.opp},"g":${x.gd ?? 'null'},${x.d.slice(1)}`).join(',')}]}`;
  }
  // the days the sweep has done: lo up to (not with) hi, in days since 1970; li, the next ladder player it asks; w, the
  // day it's on
  swOf() { const d = Math.floor(Date.now() / 864e5) - 3; return (this.sw ||= this.get('sweep', { lo: d, hi: d, li: 0 })); }

  // Every 15 s: a step of the crawl, then a turn of the sweep unless the crawl just read a timeline. A turn only has
  // 10 ms of CPU time on the free plan, and a timeline is a big answer to read.
  async alarm() {
    if (!this.env.RIOT_KEY) return;
    const t = Date.now();
    try {
      await this.ctx.storage.setAlarm(t + (+this.env.CRAWL_EVERY || 15000));
      let big = false;
      try { big = await this.crawl(); } catch (e) { console.log('crawl:', e && e.message); }
      if (!big) try { await this.sweep(); } catch (e) { console.log('sweep:', e && e.message); }
    } finally { this.use(t, 1); }
  }
  // the crawl's state: the day's steps, whose turn it is (n) and each server's (p): the next ladder player, when its
  // ladder was asked for, the games to look at and the game it's on (Korea's, from before the others, was on its own)
  crawlOf() { const s = this.get('crawl', {}); return s.p ? s : { day: s.day, steps: s.steps | 0, n: 0, p: s.q ? { kr: { li: s.li, lat: s.lat, q: s.q, cur: s.cur } } : {} }; }
  ladder(p) { return ((this.lads ||= {})[p] ||= this.get(LADDER(p), [])); } // a server's Challenger and Grandmaster players
  // One step each time, mostly one Riot call, on the servers in CRAWL in turn (Korea, Europe West and North America):
  // its Challenger and Grandmaster ladders every 6 hours, then a ladder player's ranked solo games of the last 3 days,
  // a game nobody counted yet, or that game's timeline. Only full Summoner's Rift games count (15 minutes or more,
  // every role filled once a team).
  // ponytail: 4,000 steps a day at most (all servers), so the free plan's daily writes stay mostly free for the voice
  // rooms; the meter (use) shows how much is used
  async crawl() {
    const all = (this.st ||= this.crawlOf()), ps = (this.env.CRAWL || 'kr,euw1,na1').split(','), p = ps[all.n++ % ps.length], r = REGION[p];
    if (all.day !== day()) { all.day = day(); all.steps = 0; }
    if (all.steps >= 4000 || !this.room(p, 50) || !this.room(r, 50)) return;
    all.steps++;
    const st = (all.p[p] ||= { li: 0, lat: 0, q: [], cur: null }), lad = this.ladder(p);
    this.seen ||= new Set(this.get('seen', []));
    if (st.cur) { await this.timeline(r, p, st); return true; }
    while (st.q.length) {
      const id = st.q.shift();
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      for (const x of this.seen) { if (this.seen.size <= 6000) break; this.seen.delete(x); }
      this.put('seen', [...this.seen]);
      this.put('crawl', all);
      return this.match(r, id, st);
    }
    if (!lad.length || Date.now() - st.lat > 6 * 3600e3) {
      const lads = await Promise.all(['challenger', 'grandmaster'].map((t) => this.json(p, `/lol/league/v4/${t}leagues/by-queue/RANKED_SOLO_5x5`)));
      const ids = lads.flatMap((l) => (l && Array.isArray(l.entries) ? l.entries : []).map((e) => e && e.puuid).filter((x) => typeof x === 'string'));
      st.lat = Date.now();
      if (ids.length) this.put(LADDER(p), (this.lads[p] = ids));
      return this.put('crawl', all);
    }
    const who = lad[st.li++ % lad.length];
    const ids = await this.json(r, `/lol/match/v5/matches/by-puuid/${who}/ids?queue=420&type=ranked&count=20&startTime=${Math.floor(Date.now() / 1000) - 3 * 86400}`);
    if (Array.isArray(ids)) st.q = [...st.q, ...ids.filter((id) => typeof id === 'string' && !this.seen.has(id) && !st.q.includes(id))].slice(-300);
    this.put('crawl', all);
  }
  async match(r, id, st) {
    const g = gameOf(await this.json(r, `/lol/match/v5/matches/${id}`));
    if (!g) return;
    st.cur = { id, patch: g.patch, at: g.at, len: g.len, b: g.bans, ps: g.ps.map((x) => ({ id: x.participantId, c: x.championId, r: x.teamPosition, t: x.teamId, w: x.win ? 1 : 0,
      s: [x.summoner1Id, x.summoner2Id], rn: runesOf(x.perks), x: [x.kills, x.deaths, x.assists, x.totalMinionsKilled + x.neutralMinionsKilled],
      m: [x.goldEarned, x.visionScore, x.totalDamageDealtToChampions].map((v) => v | 0) })) };
    this.put('crawl', this.st);
  }
  // what each player bought (undone buys taken out) and levelled, their gold, CS and XP at 10 minutes against their
  // lane opponent's, the champions with (a) and against (e) them, for the draft's scores, and m, for the game
  // reports: the game's length (s), their gold, vision score and damage to champions, and their team's kills and
  // damage to champions
  async timeline(r, p, st) {
    const g = st.cur;
    st.cur = null;
    this.put('crawl', this.st); // first, so a timeline that fails on us isn't tried again
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
      const mates = g.ps.filter((y) => y.t === x.t), team = (f) => mates.reduce((n, y) => n + f(y), 0); // a game from before m was kept has none
      const d = JSON.stringify({ s: x.s, rn: x.rn, b: (buys[x.id] || []).slice(0, 60), k: (skills[x.id] || []).slice(0, 18), x: x.x, l: f10 ? [cx - co, xx - xo] : null,
        a: mates.filter((y) => y !== x).map((y) => y.c), e: g.ps.filter((y) => y.t !== x.t).map((y) => y.c), m: g.len && x.m ? [g.len, ...x.m, team((y) => y.x[0] | 0), team((y) => y.m[2])] : undefined });
      this.sql.exec('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (champ, role, slot) DO UPDATE SET patch = excluded.patch, at = excluded.at, win = excluded.win, opp = excluded.opp, gd = excluded.gd, d = excluded.d',
        x.c, x.r, slot, g.patch, g.at, x.w, o.c, f10 ? gx - go : null, d);
      this.count(g.patch, x.c, x.r, x.w);
    }
    this.ban(g.patch, g.b);
    this.sumOf().at = g.at;
    this.counted(1, p);
  }

  // The sweep: Korea's ladder's ranked solo games of the last year (SWEEP_DAYS), where the crawl only asks for the
  // last 3 days. One UTC day at a time: up to 50 ladder players' games that day until 200 are found, then each game,
  // without its timeline (builds and runes that old are out of date). A day that turns 3 days old goes first, then
  // it works back to a year ago, only while our calls on the region stay under 40 in 2 minutes, so the crawl and
  // lookups keep their room. A turn is small, 6 lists of games or 4 games (a game is a big answer to read), and saves
  // where it is, so a restart carries on. A game counts toward its patch's games, wins and bans (this patch and the
  // one before) and its champions' lane matchups (/riot/champ y), kept by month so a month leaves once it's a year old.
  async sweep() {
    const r = REGION.kr, cap = +this.env.SWEEP_ROOM || 40, today = Math.floor(Date.now() / 864e5), back = today - (+this.env.SWEEP_DAYS || 365);
    const sw = this.swOf(), lad = this.ladder('kr'), room = () => this.room(r, cap);
    if (!lad.length || !room()) return;
    if (!sw.w) {
      const d = sw.hi < today - 3 ? sw.hi : sw.lo > back ? sw.lo - 1 : null;
      if (d === null) return;
      sw.w = { d, asked: 0, found: [], q: [], g: [] }; // g: the day's games, [patch, when, [champion, role, win, lane opponent] x 10]
    }
    const w = sw.w, most = Math.min(50, lad.length);
    if (w.q.length) {
      const jobs = [];
      while (w.q.length && jobs.length < 4 && room()) jobs.push(this.json(r, `/lol/match/v5/matches/${w.q.shift()}`).catch(() => null));
      for (const g of (await Promise.all(jobs)).map(gameOf)) if (g) {
        (w.b ||= w.g.map(() => null)).push(g.bans); // each game's bans, none for the games it had before it kept them
        w.g.push([g.patch, g.at, ...g.ps.map((x) => [x.championId, x.teamPosition, x.win ? 1 : 0, g.ps.find((y) => y.teamId !== x.teamId && y.teamPosition === x.teamPosition).championId])]);
      }
    } else if (w.asked < most && w.found.length < 200) {
      const seen = (this.seen ||= new Set(this.get('seen', []))), q = ((this.st ||= this.crawlOf()).p.kr || {}).q || []; // the crawl's games
      for (let n = 0; n < 6 && w.asked < most && w.found.length < 200 && room(); n++) {
        w.asked++;
        const ids = await this.json(r, `/lol/match/v5/matches/by-puuid/${lad[sw.li++ % lad.length]}/ids?queue=420&type=ranked&startTime=${w.d * DAY}&endTime=${w.d * DAY + DAY - 1}&count=100`);
        for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string' && !w.found.includes(id) && !seen.has(id) && !q.includes(id)) { w.found.push(id); w.q.push(id); }
      }
    } else this.done(sw, back);
    this.put('sweep', sw);
  }
  done(sw, back) { // a day the sweep finished: its games join the counts, all at once
    const w = sw.w, keep = new Date(back * 864e5).toISOString().slice(0, 7), add = {}; // 'month b' -> champion -> role -> lane opponent -> [games, wins]
    const inc = (t, c, role, o, n, wins) => { const v = (((t[c] ||= {})[role] ||= {})[o] ||= [0, 0]); v[0] += n; v[1] += wins; };
    w.g.forEach(([patch, at, ...ps], i) => {
      const m = new Date(at * 1000).toISOString().slice(0, 7);
      for (const [c, role, win, o] of ps) { this.count(patch, c, role, win); inc((add[`${m} ${c % 16}`] ||= {}), c, role, o, 1, win); }
      this.ban(patch, w.b && w.b[i]);
    });
    for (const [k, t] of Object.entries(add)) {
      const [m, b] = k.split(' '), [row] = this.sql.exec('SELECT v FROM matchups WHERE b = ? AND m = ?', +b, m).toArray(), all = row ? JSON.parse(row.v) : {};
      for (const [c, rs] of Object.entries(t)) for (const [role, os] of Object.entries(rs)) for (const [o, [n, wins]] of Object.entries(os)) inc(all, c, role, o, n, wins);
      this.sql.exec('INSERT INTO matchups VALUES (?, ?, ?) ON CONFLICT (b, m) DO UPDATE SET v = excluded.v', +b, m, JSON.stringify(all));
    }
    this.sql.exec('DELETE FROM matchups WHERE m < ?', keep); // over a year old
    if (w.d < sw.lo) sw.lo = w.d;
    else sw.hi = w.d + 1;
    sw.lo = Math.max(sw.lo, Date.parse(keep + '-01') / 864e5);
    sw.w = null;
    this.counted(w.g.length);
  }
}

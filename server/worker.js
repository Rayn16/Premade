// The proximity chat's own connection server: a Cloudflare Worker that speaks the PeerJS server protocol, so the
// voice page's PeerJS client works with it unchanged. It only introduces players (WebRTC offers, answers and
// candidates); voice goes directly between players. Each room is one Durable Object, holding its players' sockets.
// Only ids the voice page uses are let in: lolprox-<room>-<slot>, and once a room is locked, only those with its
// password. /stats counts rooms and players each day for the voice page (Settings > Our server), and /hello and /who
// are who has Premade (both in the Stats object). /push/... is the phone remote's notifications (push.js), /squad/...
// friends' squads (squad.js) and /esports the matches for their pick'em (esports.js), each kept by a room object of its
// own. /riot/... is Riot data (the Riot object, at the end).
import { DurableObject } from 'cloudflare:workers';
import { push, tell as tellPhones } from './push.js';
import { squad } from './squad.js';
import { events } from './esports.js';

const ID = /^lolprox-[a-z0-9]{1,20}-\d$/;
const RELAYED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'EXPIRE']);
const CORS = { 'access-control-allow-origin': '*' };
const stats = (env) => env.STATS.get(env.STATS.idFromName('all')); // ponytail: one counter for every room, fine for friend groups
const day = (ago = 0) => new Date(Date.now() - ago * 864e5).toISOString().slice(0, 10); // UTC
// what a page says when Premade opens (/hello): its device's own random id, the app version ('web' on the website,
// 'old' before 1.3), its voice name and its League accounts' Riot IDs; null for anything else
const helloOf = (b) => {
  if (!b || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(b.id) || !/^(web|old|\d{1,4}\.\d{1,4}\.\d{1,4})$/.test(b.v)) return null;
  const riot = Array.isArray(b.riot) ? b.riot.filter((n) => typeof n === 'string' && /^[^#]{1,32}#[^#]{1,8}$/.test(n)).slice(0, 10) : [];
  return { id: b.id, v: b.v, name: typeof b.name === 'string' ? b.name.slice(0, 24) : '', riot };
};
// the owner's key (the secret OWNER_KEY), checked in constant time; nobody is the owner without one
const owner = (env, key) => {
  const [a, b] = [typeof key === 'string' ? key : '', env.OWNER_KEY || ''].map((s) => new TextEncoder().encode(s));
  return b.byteLength > 0 && a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/peerjs' && req.headers.get('Upgrade') === 'websocket') {
      const id = url.searchParams.get('id') || '';
      if (!ID.test(id) || !url.searchParams.get('token')) return new Response('Not a proximity chat player', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(id.slice(0, id.lastIndexOf('-')))).fetch(req);
    }
    if (url.pathname === '/stats') return Response.json({ days: await stats(env).days() }, { headers: CORS });
    if (req.method === 'POST' && (url.pathname === '/hello' || url.pathname === '/who')) { // a plain text body, so no preflight
      const b = await req.json().catch(() => null);
      if (url.pathname === '/who') return owner(env, b && b.key) ? Response.json({ apps: await stats(env).who() }, { headers: CORS }) : new Response('Not the owner key', { status: 403, headers: CORS });
      const h = helloOf(b);
      if (!h) return new Response('Not a Premade hello', { status: 400, headers: CORS });
      await stats(env).hello(h);
      return new Response(null, { status: 204, headers: CORS });
    }
    const code = /^\/push\/([a-z0-9]{12})(\/ring)?$/.exec(url.pathname); // the phone remote's notifications (push.js)
    if (code) return env.ROOMS.get(env.ROOMS.idFromName(`lolprox-r${code[1]}`)).fetch(req);
    const sq = /^\/squad\/([a-z0-9]{12})(\/(call|answer|ping|pick))?$/.exec(url.pathname); // squads (squad.js)
    if (sq) return env.ROOMS.get(env.ROOMS.idFromName(`squad:${sq[1]}`)).fetch(req);
    if (url.pathname === '/esports') return env.ROOMS.get(env.ROOMS.idFromName('esports')).fetch(req);
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
    if (url.pathname.startsWith('/push/')) return push(req, this.ctx.storage, this.env);
    if (url.pathname.startsWith('/squad/')) return squad(req, this.ctx.storage, this.env, this);
    if (url.pathname === '/esports') return Response.json({ ev: await this.esports() }, { headers: CORS });
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
  tell(msg) { return tellPhones(this.ctx.storage, msg); } // a squad's call or ping, on this remote code's phones (squad.js)
  esports() { return events(this, this.env); } // the esports object's matches, for the pick'em (squad.js)
}

// Rooms and players each day, kept 60 days. A player is a hash of their internet address and that day's random salt,
// which is deleted once the day is over, so nobody can turn it back into an address. No names are kept with them.
// Who has Premade (apps), for its owner only (/who): each device that opened it, by the random id it made itself, with
// what its last hello said (helloOf) and when it first and last opened Premade (seconds); kept a year from the last.
// ponytail: anyone can add a line, fine for a friends' app; a limit for each address if it ever gets spammed
export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seen (day TEXT, kind TEXT, k TEXT, PRIMARY KEY (day, kind, k))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS salt (day TEXT PRIMARY KEY, salt TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, v TEXT, name TEXT, riot TEXT, first INTEGER, last INTEGER)');
  }
  hello({ id, v, name, riot }) {
    const now = Math.round(Date.now() / 1000);
    this.ctx.storage.sql.exec('INSERT INTO apps VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET v = excluded.v, name = excluded.name, riot = excluded.riot, last = excluded.last',
      id, v, name, JSON.stringify(riot), now, now);
  }
  who() { // [{ v, name, riot: [Riot ID], first, last }], the last opened first
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM apps WHERE last < ?', Math.round(Date.now() / 1000) - 365 * 86400);
    return sql.exec('SELECT v, name, riot, first, last FROM apps ORDER BY last DESC LIMIT 500').toArray().map((r) => ({ ...r, riot: JSON.parse(r.riot) }));
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
// North America's ladders in turn, Europe West's and North America's Emerald and Diamond games apart (t=ed), and
// Korea's last year more lightly (the sweep, a few calls every 15 s). It passes a few read-only calls through for
// player lookups and server status (/riot/api/<region>/<path>), keeping under our key's limits: 20 calls a second and
// 100 every 2 minutes, per region. What it keeps of a game is each champion, its role and what it did, with a code
// for each player that can't be turned back into their account (to find one-tricks), and the name and team of the
// pro players Leaguepedia lists. The ranks lookups get are kept for each season (/riot/past), since Riot only gives
// the season being played. /riot/alike says which champions the same high elo players play. /riot/summary also says
// how much of Cloudflare's free plan it used.
const riot = (env) => env.RIOT.get(env.RIOT.idFromName('riot'));
const ROLES = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const REGION = { kr: 'asia', jp1: 'asia', euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe', na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea' };
const REGIONS = new Set(Object.values(REGION));
const ORIGIN = /^(https:\/\/([a-z0-9]+--)?league-proxchat\.netlify\.app|https:\/\/rayn16\.github\.io|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/; // the site on Netlify (older apps) and on GitHub Pages
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
// what the ladder places count: Master and up by LP, then Diamond I down to Iron IV
const PLACES = [...['CHALLENGER', 'GRANDMASTER', 'MASTER'].map((t) => `${t} I`), ...TIERS.slice(0, 7).reverse().flatMap((t) => ['I', 'II', 'III', 'IV'].map((d) => `${t} ${d}`))];
const POOLS = ['kr', 'euw1', 'na1']; // the ladders /riot/alike asks about
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// the Riot IDs (Name#TAG) in a player's soloqueue ids on Leaguepedia, wiki text: bold server names, links, notes in
// brackets, line breaks (escaped, as Cargo sends them)
const riotIds = (s) => [...new Set(String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>|''':?|\[\[[^\]|]*\||\[\[|\]\]|\([^)]*\)/g, ',').split(/[,;\n•|]|\b[A-Z]{2,4}\d?:/)
  .map((x) => x.trim().replace(/\s*#\s*/, '#')).filter((x) => /^[^#]{3,16}#[\p{L}\p{N}]{2,5}$/u.test(x)))].slice(0, 5);
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
    this.sql.exec('CREATE TABLE IF NOT EXISTS pros (u TEXT PRIMARY KEY, n TEXT, tm TEXT, p TEXT, at INTEGER) WITHOUT ROWID'); // pro players' accounts (pro())
    this.sql.exec('CREATE TABLE IF NOT EXISTS proids (id TEXT PRIMARY KEY, n TEXT, tm TEXT) WITHOUT ROWID'); // and the Riot IDs still to look up
    this.sql.exec('CREATE TABLE IF NOT EXISTS pools (u TEXT PRIMARY KEY, c TEXT, at INTEGER) WITHOUT ROWID'); // ladder players' top champions (pool())
    // augment ratings from Premade players' games (augIn): the games counted, by id; ARAM: Mayhem's champions (a 0: the
    // champion's games) and each augment they took, with wins; TFT's augments by set, with their games, places and top 4s
    this.sql.exec('CREATE TABLE IF NOT EXISTS augseen (g TEXT PRIMARY KEY, at INTEGER) WITHOUT ROWID');
    this.sql.exec('CREATE TABLE IF NOT EXISTS mayhem (c INTEGER, a INTEGER, n INTEGER, w INTEGER, PRIMARY KEY (c, a)) WITHOUT ROWID');
    this.sql.exec('CREATE TABLE IF NOT EXISTS tftaug (s INTEGER, a TEXT, n INTEGER, p INTEGER, t4 INTEGER, PRIMARY KEY (s, a)) WITHOUT ROWID');
    this.sent = new Map(); // games each address sent in the last hour
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
  async riot(host, path, hold = true) { // Riot's answer; a 429, or Riot refusing our key (unless hold is false), holds that host off
    (this.calls[host] ||= []).push(Date.now());
    const r = await fetch((this.env.RIOT_BASE || 'https://{host}.api.riotgames.com').replace('{host}', host) + path, { headers: { 'X-Riot-Token': this.env.RIOT_KEY } });
    if (r.status === 429) this.until[host] = Date.now() + 1000 * Math.min(600, +r.headers.get('retry-after') || 10);
    if (hold && (r.status === 401 || r.status === 403)) this.until[host] = Date.now() + 600000;
    return r;
  }
  async json(host, path) { const r = await this.riot(host, path); return r.ok ? r.json() : null; }
  async code(u) { // a player's code: 8 hex digits from their account id and this server's own secret, so it can't be turned back
    if (typeof u !== 'string') return undefined;
    let salt = this.salt || this.get('salt');
    if (!salt) this.put('salt', (salt = crypto.randomUUID()));
    this.salt = salt;
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + u)));
    return Array.from(h.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
  }
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
      // [day, players asked, games found, games left]; use: what this object used of the free plan (lim) today; ed:
      // the same counts for Emerald and Diamond. With more (Settings > Our server): pros, the pro players' accounts
      // known, from Leaguepedia, last read at lp ({at, ok}); pools, the high elo players /riot/alike goes by (counting
      // them reads every row, so not for the page's checks every minute)
      const { p, c, b, bn, old, today, total, by, at } = this.sumOf(), sw = this.swOf(), w = sw.w, e = this.sumOf('ed'), n = (t) => this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one().n;
      return new Response(JSON.stringify({ p, c, b, bn, old, today, total, by: by || { kr: total }, at, from: sw.lo < sw.hi ? sw.lo * DAY : undefined,
        on: w ? [w.d * DAY, w.asked, w.found.length, w.q.length] : undefined, use: { ...this.get('use', {}), lim: FREE },
        ed: { p: e.p, c: e.c, b: e.b, bn: e.bn, old: e.old, today: e.today, total: e.total, by: e.by || {}, at: e.at },
        ...(url.searchParams.has('more') && { pros: n('pros'), lp: this.get('lp', {}), pools: n('pools') }) }), { headers: json });
    }
    if (url.pathname === '/riot/champ') return new Response(this.champ(+url.searchParams.get('c'), url.searchParams.get('r'), url.searchParams.get('t')), { headers: json });
    if (url.pathname === '/riot/alike') return new Response(this.alike(+url.searchParams.get('c')), { headers: { ...json, 'cache-control': 'public, max-age=3600' } }); // it reads every pools row
    if (url.pathname === '/riot/past') return new Response(this.past(url.searchParams.get('u') || ''), { headers: json });
    if (url.pathname === '/riot/places') { const p = url.searchParams.get('p') || ''; return new Response(JSON.stringify(Object.hasOwn(REGION, p) ? this.get(`places:${p}`, {}) : {}), { headers: { ...json, 'cache-control': 'public, max-age=3600' } }); }
    if (url.pathname === '/riot/mayhem' || url.pathname === '/riot/tftaug') {
      if (req.method === 'POST') { // a game is under 3 KB; a bigger body isn't read, as this object also does the counting
        if (+req.headers.get('content-length') > 8192) return new Response('too big', { headers: cors });
        return new Response(this.augIn(url.pathname.slice(6), await req.text().catch(() => ''), req.headers.get('cf-connecting-ip') || ''), { headers: cors });
      }
      return new Response(JSON.stringify(url.pathname === '/riot/mayhem' ? this.mayhem(+url.searchParams.get('c')) : this.tftaug(+url.searchParams.get('s'))), { headers: { ...json, 'cache-control': 'public, max-age=600' } });
    }
    const m = url.pathname.match(/^\/riot\/api\/([a-z0-9]+)(\/.+)$/);
    if (m && this.env.RIOT_KEY) return this.lookup(m[1], m[2], url.searchParams, req.headers.get('cf-connecting-ip') || '', cors);
    return new Response('Not found', { status: 404, headers: cors });
  }
  // A game's augments from a Premade app, which read them from League's client: { g: its id (EUW1_123), ps: each of
  // the 10 players' { c: champion, w: 1 if they won, a: augment ids } } for ARAM: Mayhem, or { g, s: the set, ps: each
  // of the 8 players' { p: place, a: augment ids } } for TFT. Each game counts once, and an address sends at most 30 an
  // hour. 'ok', or why not.
  // ponytail: it trusts what an app says its game was; a changed app could send made-up games, 30 an hour from each address
  augIn(kind, text, ip) {
    let b;
    try { b = JSON.parse(text); } catch { return 'not JSON'; }
    const ints = (a, max) => Array.isArray(a) && a.length <= 8 && a.every((x) => Number.isInteger(x) && x > 0 && x < max) && new Set(a).size === a.length;
    const may = kind === 'mayhem', ps = b && Array.isArray(b.ps) ? b.ps : [];
    if (!b || typeof b.g !== 'string' || !/^[A-Z0-9]{2,5}_\d{5,14}$/.test(b.g)) return 'no game id';
    if (may ? !(ps.length === 10 && ps.every((p) => p && Number.isInteger(p.c) && p.c > 0 && p.c < 10000 && (p.w === 0 || p.w === 1) && ints(p.a, 1e6)) && ps.filter((p) => p.w).length === 5)
      : !(Number.isInteger(b.s) && b.s > 0 && b.s < 100 && ps.length === 8 && ps.every((p) => p && Number.isInteger(p.p) && Array.isArray(p.a) && p.a.length <= 4 && p.a.every((a) => typeof a === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(a)))
        && ps.map((p) => p.p).sort((x, y) => x - y).join() === '1,2,3,4,5,6,7,8')) return 'not a game';
    const now = Date.now(), mine = (this.sent.get(ip) || []).filter((t) => now - t < 3600000);
    if (mine.length >= 30) return 'too many';
    this.sent.set(ip, [...mine, now]);
    if (this.sent.size > 500) for (const [k, t] of this.sent) if (now - t[t.length - 1] > 3600000) this.sent.delete(k);
    if (this.sql.exec('SELECT 1 FROM augseen WHERE g = ?', b.g).toArray().length) return 'ok';
    this.sql.exec('INSERT INTO augseen VALUES (?, ?)', b.g, Math.round(now / 1000));
    for (const p of ps) {
      if (may) for (const a of [0, ...p.a]) this.sql.exec('INSERT INTO mayhem VALUES (?, ?, 1, ?) ON CONFLICT (c, a) DO UPDATE SET n = n + 1, w = w + excluded.w', p.c, a, p.w);
      else for (const a of new Set(p.a)) this.sql.exec('INSERT INTO tftaug VALUES (?, ?, 1, ?, ?) ON CONFLICT (s, a) DO UPDATE SET n = n + 1, p = p + excluded.p, t4 = t4 + excluded.t4', b.s, a, p.p, p.p <= 4 ? 1 : 0);
    }
    return 'ok';
  }
  mayhem(c) { // a champion's Mayhem games counted (n) and the games each augment was taken in (a: { id: games })
    const out = { n: 0, a: {} };
    if (Number.isInteger(c) && c > 0) for (const r of this.sql.exec('SELECT a, n FROM mayhem WHERE c = ?', c)) { if (r.a) out.a[r.a] = r.n; else out.n = r.n; }
    return out;
  }
  tftaug(s) { // set s's augments, else the newest set's: { s: the set, a: { id: [games, places added up, top 4s] } }
    if (!(Number.isInteger(s) && s > 0)) s = this.sql.exec('SELECT MAX(s) AS s FROM tftaug').one().s || 0;
    const out = { s, a: {} };
    for (const x of this.sql.exec('SELECT a, n, p, t4 FROM tftaug WHERE s = ?', s)) out.a[x.a] = [x.n, x.p, x.t4];
    return out;
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
  // many games were counted, from each server (by). t: '' for high elo, 'ed' for Emerald and Diamond
  sumOf(t = '') { return ((this.sums ||= {})[t] ||= this.get(t ? `sum:${t}` : 'sum', { p: '', c: {}, old: null, day: '', today: 0, total: 0, at: 0 })); }
  pt(patch, t) { // a patch's counts: this patch's (the summary itself), the one before's (old), else null
    const s = this.sumOf(t);
    if (newer(patch, s.p)) { s.old = s.p ? { p: s.p, c: s.c, b: s.b, bn: s.bn } : null; Object.assign(s, { p: patch, c: {}, b: {}, bn: 0 }); }
    if (!s.old && newer(s.p, patch)) s.old = { p: patch, c: {}, b: {}, bn: 0 }; // the sweep, which goes back in time, meets the patch before first
    return patch === s.p ? s : s.old && patch === s.old.p ? s.old : null;
  }
  count(patch, c, role, w, t) {
    const x = this.pt(patch, t), v = x && ((x.c[c] ||= {})[role] ||= [0, 0]);
    if (v) { v[0]++; v[1] += w; }
  }
  ban(patch, bans, t) { // a game's bans, each champion once; a game kept from before bans were kept has none
    const x = Array.isArray(bans) && this.pt(patch, t);
    if (!x) return;
    x.b ||= {};
    for (const c of bans) x.b[c] = (x.b[c] | 0) + 1;
    x.bn = (x.bn | 0) + 1;
  }
  counted(n, p = 'kr', t = '') { // n more games counted, from server p
    const s = this.sumOf(t), by = (s.by ||= t ? {} : { kr: s.total });
    if (s.day !== day()) { s.day = day(); s.today = 0; }
    by[p] = (by[p] | 0) + n;
    s.today += n;
    s.total += n;
    this.put(t ? `sum:${t}` : 'sum', s);
  }
  // a champion's games in a role (its most played role when none is asked for), newest patch first, from every server
  // the crawl is on, for the page to count builds, runes, skill orders and matchups from (with each player's code, u,
  // and pro players' [name, team], pro); and y, the sweep's games of Korea's last year (none of them among those
  // games): its games and wins there, and against each lane opponent (champion id -> [games, wins]). t=ed: Emerald and
  // Diamond's games instead, without a year
  champ(c, role, t) {
    if (!Number.isInteger(c) || c <= 0 || c > 1e5) return '{"games":[]}';
    t = t === 'ed' ? t : '';
    const s = this.sumOf(t), mine = s.c[c] || (s.old && s.old.c[c]) || {}, y = { n: 0, w: 0, vs: {} };
    if (!ROLES.has(role)) role = Object.keys(mine).sort((a, b) => mine[b][0] - mine[a][0])[0] || 'MIDDLE';
    if (!t) for (const { v } of this.sql.exec('SELECT v FROM matchups WHERE b = ?', c % 16)) for (const [o, [n, w]] of Object.entries((JSON.parse(v)[c] || {})[role] || {})) { const x = (y.vs[o] ||= [0, 0]); x[0] += n; x[1] += w; y.n += n; y.w += w; }
    const rows = this.sql.exec('SELECT patch, at, win, opp, gd, d FROM games WHERE champ = ? AND role = ? AND slot >= ? AND slot < ? ORDER BY at DESC', c, role, t ? KEEP : 0, t ? 2 * KEEP : KEEP).toArray();
    return `{"t":"${t}","patch":${JSON.stringify(s.p)},"role":"${role}","roles":${JSON.stringify(s.c[c] || {})},"y":${JSON.stringify(y)},"games":[${rows.map((x) => `{"p":${JSON.stringify(x.patch)},"t":${x.at},"w":${x.win},"o":${x.opp},"g":${x.gd ?? 'null'},${x.d.slice(1)}`).join(',')}]}`;
  }
  // the champions the same high elo players play (pool()): of the n players (of all those asked) with c among their 8
  // champions with the most mastery points, how many have each other one, 3 or more, the closest first (the most of
  // them for how many players have it at all: cosine similarity)
  // ponytail: reads every pools row (about 3,000) per ask, fine for friends; count each champion's list once a day if
  // the free plan's reads ever run short
  alike(c) {
    const n = new Map(), both = new Map();
    let of = 0;
    if (Number.isInteger(c) && c > 0) for (const { c: s } of this.sql.exec('SELECT c FROM pools')) {
      const cs = s.split(',').map(Number), has = cs.includes(c);
      of++;
      for (const x of cs) { n.set(x, (n.get(x) | 0) + 1); if (has && x !== c) both.set(x, (both.get(x) | 0) + 1); }
    }
    const list = [...both].filter(([, k]) => k >= 3).sort((a, b) => b[1] / Math.sqrt(n.get(b[0])) - a[1] / Math.sqrt(n.get(a[0]))).slice(0, 10);
    return JSON.stringify({ n: n.get(c) | 0, of, list });
  }
  // the days the sweep has done: lo up to (not with) hi, in days since 1970; li, the next ladder player it asks; w, the
  // day it's on
  swOf() { const d = Math.floor(Date.now() / 864e5) - 3; return (this.sw ||= this.get('sweep', { lo: d, hi: d, li: 0 })); }

  // Every 15 s: a step of the crawl, then, unless the crawl just read a big answer (a timeline or eight ladder lists), a
  // turn of the sweep, the ladder places, the champion pools and the pro players. A turn only has 10 ms of CPU time on
  // the free plan.
  async alarm() {
    if (!this.env.RIOT_KEY) return;
    const t = Date.now();
    try {
      await this.ctx.storage.setAlarm(t + (+this.env.CRAWL_EVERY || 15000));
      let big = false;
      try { big = await this.crawl(); } catch (e) { console.log('crawl:', e && e.message); }
      if (!big) try { await this.sweep(); } catch (e) { console.log('sweep:', e && e.message); }
      if (!big) try { await this.places(); } catch (e) { console.log('places:', e && e.message); }
      if (!big) try { await this.pool(); await this.pro(); } catch (e) { console.log('pools and pros:', e && e.message); }
    } finally { this.use(t, 1); }
  }
  // the crawl's state: the day's steps, whose turn it is (n) and each server's (p): the next ladder player, when its
  // ladder was asked for, the games to look at and the game it's on (Korea's, from before the others, was on its own)
  crawlOf() { const s = this.get('crawl', {}); return s.p ? s : { day: s.day, steps: s.steps | 0, n: 0, p: s.q ? { kr: { li: s.li, lat: s.lat, q: s.q, cur: s.cur } } : {} }; }
  ladder(p) { return ((this.lads ||= {})[p] ||= this.get(LADDER(p), [])); } // a server's Challenger and Grandmaster players
  // One step each time, mostly one Riot call, on the servers in CRAWL in turn (Korea, Europe West and North America,
  // then Europe West's and North America's Emerald and Diamond, :ed): its ladder every 6 hours (Challenger and
  // Grandmaster with the pro players Leaguepedia lists there, or the first 205 players of each Emerald and Diamond
  // division), then a ladder player's ranked solo games of the last 3 days, a game nobody counted yet, or that game's
  // timeline. Only full Summoner's Rift games count (15 minutes or more, every role filled once a team).
  // ponytail: 4,000 steps a day at most (all servers), so the free plan's daily writes stay mostly free for the voice
  // rooms; the meter (use) shows how much is used
  async crawl() {
    // ponytail: the high elo ladders twice a round, so they keep 3/4 of the day's steps and Emerald and Diamond's 1/4
    const all = (this.st ||= this.crawlOf()), ps = (this.env.CRAWL || 'kr,euw1,na1,kr,euw1,na1,euw1:ed,na1:ed').split(','), p = ps[all.n++ % ps.length], [pl, t = ''] = p.split(':'), r = REGION[pl];
    if (all.day !== day()) { all.day = day(); all.steps = 0; }
    if (all.steps >= 4000 || !this.room(pl, 50) || !this.room(r, 50)) return;
    all.steps++;
    const st = (all.p[p] ||= { li: 0, lat: 0, q: [], cur: null }), lad = this.ladder(p);
    this.seen ||= new Set(this.get('seen', []));
    if (st.cur) { await this.timeline(r, pl, st); return true; }
    while (st.q.length) {
      const id = st.q.shift();
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      for (const x of this.seen) { if (this.seen.size <= 6000) break; this.seen.delete(x); }
      this.put('seen', [...this.seen]);
      this.put('crawl', all);
      return this.match(r, id, st, t);
    }
    if (!lad.length || Date.now() - st.lat > 6 * 3600e3) {
      const lists = t ? ['EMERALD', 'DIAMOND'].flatMap((x) => ['I', 'II', 'III', 'IV'].map((d) => `/lol/league/v4/entries/RANKED_SOLO_5x5/${x}/${d}`))
        : ['challenger', 'grandmaster'].map((x) => `/lol/league/v4/${x}leagues/by-queue/RANKED_SOLO_5x5`);
      const lads = await Promise.all(lists.map((x) => this.json(pl, x)));
      const ids = lads.flatMap((l) => (Array.isArray(l) ? l : l && Array.isArray(l.entries) ? l.entries : []).map((e) => e && e.puuid).filter((x) => typeof x === 'string'));
      st.lat = Date.now();
      if (ids.length) this.put(LADDER(p), (this.lads[p] = t ? ids : [...new Set([...ids, ...this.sql.exec('SELECT u FROM pros WHERE p = ?', pl).toArray().map((x) => x.u)])]));
      this.put('crawl', all);
      return !!t; // eight lists are a big answer to read
    }
    const who = lad[st.li++ % lad.length];
    const ids = await this.json(r, `/lol/match/v5/matches/by-puuid/${who}/ids?queue=420&type=ranked&count=20&startTime=${Math.floor(Date.now() / 1000) - 3 * 86400}`);
    if (Array.isArray(ids)) st.q = [...st.q, ...ids.filter((id) => typeof id === 'string' && !this.seen.has(id) && !st.q.includes(id))].slice(-300);
    this.put('crawl', all);
  }
  async match(r, id, st, t) { // t: the ladder's, 'ed' for Emerald and Diamond
    const g = gameOf(await this.json(r, `/lol/match/v5/matches/${id}`));
    if (!g) return;
    const us = await Promise.all(g.ps.map((x) => this.code(x.puuid))), pros = {};
    for (const x of this.sql.exec(`SELECT u, n, tm FROM pros WHERE u IN (${g.ps.map(() => '?')})`, ...g.ps.map((x) => String(x.puuid)))) pros[x.u] = [x.n, x.tm];
    st.cur = { id, t, patch: g.patch, at: g.at, len: g.len, b: g.bans, ps: g.ps.map((x, i) => ({ id: x.participantId, c: x.championId, r: x.teamPosition, t: x.teamId, w: x.win ? 1 : 0,
      s: [x.summoner1Id, x.summoner2Id], rn: runesOf(x.perks), x: [x.kills, x.deaths, x.assists, x.totalMinionsKilled + x.neutralMinionsKilled],
      m: [x.goldEarned, x.visionScore, x.totalDamageDealtToChampions].map((v) => v | 0), u: us[i], pro: pros[x.puuid] })) };
    this.put('crawl', this.st);
  }
  // what each player bought (undone buys taken out) and levelled, their gold, CS and XP at 10 minutes against their
  // lane opponent's, the champions with (a) and against (e) them, for the draft's scores, m, for the game reports: the
  // game's length (s), their gold, vision score and damage to champions, and their team's kills and damage to
  // champions; and their code (u) and, for a pro player, [name, team] (pro)
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
    const slot = (g.t ? KEEP : 0) + (hash(g.id) % KEEP); // Emerald and Diamond's games take the places from KEEP up
    for (const x of g.ps) {
      const o = g.ps.find((y) => y.t !== x.t && y.r === x.r), [gx, cx, xx] = at10(x.id), [go, co, xo] = at10(o.id);
      const mates = g.ps.filter((y) => y.t === x.t), team = (f) => mates.reduce((n, y) => n + f(y), 0); // a game from before m was kept has none
      const d = JSON.stringify({ s: x.s, rn: x.rn, b: (buys[x.id] || []).slice(0, 60), k: (skills[x.id] || []).slice(0, 18), x: x.x, l: f10 ? [cx - co, xx - xo] : null,
        a: mates.filter((y) => y !== x).map((y) => y.c), e: g.ps.filter((y) => y.t !== x.t).map((y) => y.c), m: g.len && x.m ? [g.len, ...x.m, team((y) => y.x[0] | 0), team((y) => y.m[2])] : undefined, u: x.u, pro: x.pro });
      this.sql.exec('INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (champ, role, slot) DO UPDATE SET patch = excluded.patch, at = excluded.at, win = excluded.win, opp = excluded.opp, gd = excluded.gd, d = excluded.d',
        x.c, x.r, slot, g.patch, g.at, x.w, o.c, f10 ? gx - go : null, d);
      this.count(g.patch, x.c, x.r, x.w, g.t);
    }
    this.ban(g.patch, g.b, g.t);
    this.sumOf(g.t).at = g.at;
    this.counted(1, p, g.t);
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

  // The ladder places (the Profile's "Top 14% of EUW"): once a day on each server in CRAWL, how many players each
  // Solo/Duo division has, Diamond I down to Iron IV (d), and from Master up how many have each 10 LP (lp), kept
  // without names or ids (places:<server>). A division's size comes from its last page, found by doubling and then
  // halving the page asked for (about 20 calls for a big one); Master and up are read page by page for their LP. Up to
  // 3 calls a turn, while our calls on that server stay under 20 in 2 minutes (PLACES_ROOM), so lookups keep their
  // room. When Riot doesn't answer it tries again in 10 minutes, without holding off that server's lookups.
  async places() {
    const pl = (this.pl ||= this.get('placing', { at: {}, cur: null })), now = Date.now();
    if (now < (pl.wait || 0)) return;
    if (!pl.cur) {
      const p = [...new Set((this.env.CRAWL || 'kr,euw1,na1').split(',').map((x) => x.split(':')[0]))] // a server once, whichever of its ladders the crawl takes
        .filter((x) => !(now - (pl.at[x] || 0) < 864e5)).sort((a, b) => (pl.at[a] || 0) - (pl.at[b] || 0))[0];
      if (!p) return;
      pl.cur = { p, i: 0, lo: 0, hi: 0, n: 0, size: 0, d: {}, lp: [] }; // lo: the last page with players so far (n of them), hi: the first without
    }
    const c = pl.cur;
    let asked = 0;
    for (; asked < 3 && pl.cur && this.room(c.p, +this.env.PLACES_ROOM || 20); asked++) {
      const apex = c.i < 3, page = apex ? c.lo + 1 : c.hi ? (c.lo + c.hi) >> 1 : c.lo ? c.lo * 2 : 1;
      const r = await this.riot(c.p, `/lol/league-exp/v4/entries/RANKED_SOLO_5x5/${PLACES[c.i].replace(' ', '/')}?page=${page}`, false), l = r.ok ? await r.json().catch(() => null) : null;
      if (!Array.isArray(l)) { pl.wait = now + 600000; asked++; break; }
      if (l.length) {
        c.lo = page;
        c.n = l.length;
        if (page === 1) c.size = l.length;
        if (apex) for (const e of l) { const b = Math.min(500, Math.floor((e && e.leaguePoints) / 10) | 0); c.lp[b] = (c.lp[b] | 0) + 1; }
      } else c.hi = page;
      if (!c.hi || c.hi - c.lo > 1) continue;
      if (!apex) c.d[PLACES[c.i]] = c.lo ? (c.lo - 1) * c.size + c.n : 0; // every page before the last is full
      Object.assign(c, { i: c.i + 1, lo: 0, hi: 0, n: 0 });
      if (c.i < PLACES.length) continue;
      this.put(`places:${c.p}`, { at: now, d: c.d, lp: Array.from(c.lp, (x) => x | 0) });
      pl.at[c.p] = now;
      pl.cur = null;
    }
    if (asked) this.put('placing', pl);
  }

  // Champions to try (/riot/alike): the 8 champions with the most mastery points of each Challenger and Grandmaster
  // player, under their code, 500 players a day in turn (everyone in about a week); a player not asked about for 30
  // days is left out
  async pool() {
    const s = this.get('pool', { day: '', n: 0, i: 0 }), now = Math.round(Date.now() / 1000), p = POOLS[s.i % POOLS.length], lad = this.ladder(p), who = lad[Math.floor(s.i / POOLS.length) % lad.length];
    if (s.day !== day()) { Object.assign(s, { day: day(), n: 0 }); this.sql.exec('DELETE FROM pools WHERE at < ?', now - 30 * DAY); }
    if (s.n >= 500 || !this.room(p, 40)) return;
    s.i++;
    if (who) s.n++;
    this.put('pool', s);
    const m = who && (await this.json(p, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${who}/top?count=8`));
    const cs = Array.isArray(m) ? m.map((x) => x && x.championId).filter((x) => Number.isInteger(x) && x > 0) : [];
    if (cs.length) this.sql.exec('INSERT INTO pools VALUES (?, ?, ?) ON CONFLICT (u) DO UPDATE SET c = excluded.c, at = excluded.at', await this.code(who), cs.join(), now);
  }
  // Pro players: the Riot IDs (Name#TAG) Leaguepedia's player list (lol.fandom.com, CC BY-SA) has for players on a
  // team, read once a week, 100 players a step (more is too much to store in a turn's 10 ms of CPU time) and 5,000 at
  // most (1,737 had a team and soloqueue ids in October 2026); then one Riot ID a step becomes their account id and the
  // server they play League on, so the crawl takes their games with the ladder's and keeps their name and team on
  // their part of a game. An account Leaguepedia stops listing is let go two weeks later.
  async pro() {
    const now = Date.now(), [q] = this.sql.exec('SELECT id, n, tm FROM proids LIMIT 1').toArray();
    if (q) {
      const h = ['americas', 'europe', 'asia'].find((x) => this.room(x, 30)); // accounts are on every region
      if (!h) return;
      this.sql.exec('DELETE FROM proids WHERE id = ?', q.id);
      const [name, tag] = q.id.split('#'), a = await this.json(h, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`), u = a && typeof a.puuid === 'string' ? a.puuid : '';
      const g = u && (await this.json(h, `/riot/account/v1/region/by-game/lol/by-puuid/${u}`)), p = String((g && g.region) || '').toLowerCase();
      if (p in REGION) this.sql.exec('INSERT INTO pros VALUES (?, ?, ?, ?, ?) ON CONFLICT (u) DO UPDATE SET n = excluded.n, tm = excluded.tm, p = excluded.p, at = excluded.at', u, q.n, q.tm, p, Math.round(now / 1000));
      return;
    }
    const s = this.get('lp', { at: 0, off: 0 });
    if (!s.off && now - s.at < (s.ok ? 7 * 864e5 : 36e5)) return; // a week, or an hour once Leaguepedia didn't answer
    if (!s.off) s.from = now;
    // from its Cargo export page, as the API's cargoquery turns away askers who aren't logged in ("ratelimited"). The
    // page doesn't take a # in where, so riotIds picks the Riot IDs out; an error comes back as plain text
    const qs = new URLSearchParams({ tables: 'Players', fields: 'Player,Team,SoloqueueIds', where: 'Team != "" AND SoloqueueIds != ""', order_by: 'Players._pageName', limit: '100', offset: String(s.off), format: 'json' });
    const j = await fetch(`${this.env.LEAGUEPEDIA || 'https://lol.fandom.com/wiki/Special:CargoExport'}?${qs}`, { headers: { 'user-agent': 'Premade/1.0 (https://github.com/Rayn16/Premade)' } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const rows = Array.isArray(j) ? j.filter((x) => x && x.Player != null) : null; // a name like 1116 comes as a number
    for (const x of rows || []) for (const id of riotIds(x.SoloqueueIds)) this.sql.exec('INSERT OR IGNORE INTO proids VALUES (?, ?, ?)', id, String(x.Player).slice(0, 40), String(x.Team || '').slice(0, 40));
    if (rows && rows.length >= 100 && s.off < 4900) s.off += 100;
    else {
      if (rows) this.sql.exec('DELETE FROM pros WHERE at < ?', Math.round(s.from / 1000) - 14 * DAY);
      Object.assign(s, { at: now, off: 0, ok: !!rows });
    }
    this.put('lp', s);
  }
}

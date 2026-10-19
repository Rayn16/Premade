// The proximity chat's own connection server: a Cloudflare Worker that speaks the PeerJS server protocol, so the
// voice page's PeerJS client works with it unchanged. It only introduces players (WebRTC offers, answers and
// candidates); voice goes directly between players. Each room is one Durable Object, holding its players' sockets.
// Only ids the voice page uses are let in: lolprox-<room>-<slot>. /stats counts rooms and players each day for the
// voice page (Settings > Our server).
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
    if (url.pathname === '/') return new Response('League proximity chat connection server', { headers: CORS });
    return new Response('Not found', { status: 404 });
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

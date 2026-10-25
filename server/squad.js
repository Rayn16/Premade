// Squads (the Voice page's Your group): friends who call each other to play, under a code a page makes. A squad is a
// room object of its own (squad:<code>, worker.js Room) that keeps its members (up to 12: a name, which pings they
// want, and the phone remote code of those with the phone remote on), the last call with its answers, and the esports
// pick'em's guesses. Calls and pings ring each member's phones through their remote code's object (push.js tell), so
// the codes never leave our server.
//   GET /squad/<code>: { m: [{ id, n, phone, g, r }], call: { n, from, room, at, ans: { id: 'in10' | 'no' } } | null, picks }
//   POST /squad/<code> with { id, n, c, g, r }: join, or change your name, remote code (c, '' for none) or pings (g: a
//     friend's game starting, r: a friend ranking up); with { id, leave: true }: leave (the last one out deletes it)
//   POST /squad/<code>/call with { id, room }: "<name> wants to play" with the room on every other member's phones, at
//     most once a minute
//   POST /squad/<code>/answer with { id, call, a }: In 10 ('in10') or Not tonight ('no') to the call numbered `call`
//   POST /squad/<code>/ping with { id, k: 'game', q, c } (the queue and champion) or { id, k: 'rank', r } (the new
//     rank): to the members who want that kind, at most one of each kind a minute from each member
//   POST /squad/<code>/pick with { id, match, team }: a pick'em guess (esports.js's match id and a team code), until
//     the match starts. picks: { match id: { t: [both teams' codes], at: its start, w: the winner once it's over, p: { id: team } } }
const CORS = { 'access-control-allow-origin': '*' };
const ID = /^[a-z0-9]{12}$/, ROOM = /^[a-z0-9]{1,20}$/;
const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const esports = (env) => env.ROOMS.get(env.ROOMS.idFromName('esports'));
// a call or ping on these members' phones, each told who they are so they can answer; how many phones got it
const ring = async (env, to, msg) => (await Promise.all(to.filter((x) => x.c).map((x) => env.ROOMS.get(env.ROOMS.idFromName(`lolprox-r${x.c}`)).tell({ ...msg, to: x.id }).catch(() => 0))))
  .reduce((a, b) => a + b, 0);

export async function squad(req, st, env, mem) { // mem: the object's memory, for the pings' limit
  const url = new URL(req.url), [, , code, act = ''] = url.pathname.split('/'), json = (j, status = 200) => Response.json(j, { status, headers: CORS });
  const m = (await st.get('m')) || {};
  if (req.method === 'GET' && !act) return json(await state(st, env, m));
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  let b = null;
  try { b = JSON.parse(await req.text()); } catch {}
  if (!b || typeof b !== 'object' || !ID.test(b.id)) return json({ error: 'Not a member id' }, 400);
  const me = m[b.id], others = Object.entries(m).filter(([id]) => id !== b.id).map(([id, x]) => ({ id, ...x })), now = Date.now();
  if (!act && b.leave) {
    if (me) { delete m[b.id]; if (others.length) await st.put('m', m); else await st.deleteAll(); }
    return json({ ok: true });
  }
  if (!act) {
    const x = { n: text(b.n, 24), c: ID.test(b.c) ? b.c : '', g: b.g !== false, r: b.r !== false };
    if (!x.n) return json({ error: 'A name, please' }, 400);
    if (!me && others.length >= 12) return json({ error: 'This squad is full' }, 409); // ponytail: 12, plenty for friends
    if (JSON.stringify(x) !== JSON.stringify(me)) await st.put('m', { ...m, [b.id]: x }); // a page sends this each time it opens
    return json({ ok: true });
  }
  if (!me) return json({ error: 'Not in this squad' }, 403);
  if (act === 'call') {
    if (!ROOM.test(b.room)) return json({ error: 'Not a room code' }, 400);
    const was = await st.get('call');
    if (was && now - was.at < 60000) return json({ error: 'Called less than a minute ago' }, 429);
    const call = { n: (was ? was.n : 0) + 1, from: b.id, room: b.room, at: now, ans: {} };
    await st.put('call', call);
    return json({ call: call.n, sent: await ring(env, others, { t: 'call', title: `${me.n} wants to play`, body: `Room ${b.room.toUpperCase()}`, sq: code, call: call.n, api: url.origin }) });
  }
  if (act === 'answer') {
    const call = await st.get('call');
    if (!call || call.n !== b.call || (b.a !== 'in10' && b.a !== 'no')) return json({ error: 'Not an answer to the last call' }, 409);
    if (call.ans[b.id] !== b.a) { call.ans[b.id] = b.a; await st.put('call', call); }
    return json({ ok: true });
  }
  if (act === 'ping') {
    const k = b.k === 'game' || b.k === 'rank' ? b.k : '';
    if (!k) return json({ error: 'Not a ping' }, 400);
    if (now - ((mem.pinged ||= {})[b.id + k] || 0) < 60000) return json({ sent: 0 });
    mem.pinged[b.id + k] = now; // ponytail: kept in memory, so it starts over when the object leaves it
    const msg = k === 'game' ? { t: 'ping', title: `${me.n} started a game`, body: [text(b.q, 40) || 'A game', text(b.c, 24)].filter(Boolean).join(' as ') }
      : { t: 'ping', title: `${me.n} ranked up`, body: text(b.r, 40) };
    return json({ sent: await ring(env, others.filter((x) => x[k === 'game' ? 'g' : 'r']), msg) });
  }
  if (act === 'pick') {
    const ev = (await esports(env).esports().catch(() => [])).find((e) => e.id === b.match), codes = ev ? ev.t.map((t) => t.c) : [];
    if (!ev || ev.st !== 'unstarted' || ev.at <= now) return json({ error: 'That match has started, or isn’t one we know' }, 409);
    if (!codes.includes(b.team) || codes.includes('TBD')) return json({ error: 'Not a team in that match' }, 400);
    const picks = (await st.get('picks')) || {}, was = picks[b.match];
    picks[b.match] = { t: codes, at: ev.at, w: '', p: { ...(was && was.p), [b.id]: b.team } };
    await st.put('picks', Object.fromEntries(Object.entries(picks).sort((x, y) => y[1].at - x[1].at).slice(0, 200))); // the newest 200 matches
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

async function state(st, env, m) {
  const picks = (await st.get('picks')) || {}, open = Object.entries(picks).filter(([, x]) => !x.w && x.at < Date.now());
  if (open.length) { // matches that started since: their winners, once LoL Esports has them
    const evs = await esports(env).esports().catch(() => []);
    let won = 0;
    for (const [id, x] of open) {
      const e = evs.find((v) => v.id === id), w = e && e.st === 'completed' && e.t.find((t) => t.o === 'win');
      if (w) { x.w = w.c; won++; }
    }
    if (won) await st.put('picks', picks);
  }
  const call = await st.get('call');
  return { m: Object.entries(m).map(([id, x]) => ({ id, n: x.n, phone: !!x.c, g: x.g, r: x.r })), call: call && Date.now() - call.at < 6 * 36e5 ? call : null, picks };
}

// LoL Esports: Worlds' and the big leagues' matches for the Voice page's pick'em (squad.js keeps the guesses), from
// the API lolesports.com itself uses, with the public key its pages send. Kept in the memory of one room object
// (esports, worker.js Room) and asked again at most once a minute (ESPORTS_MS in tests): the leagues once a day, then
// their schedule, which also has each match's games won so far.
//   GET /esports: { ev: [{ id, at, st, lg, bl, bo, t: [{ c, n, w, o }, { c, n, w, o }] }] }, from a week ago to two
//     weeks ahead: each match's id, start (ms), state (unstarted, inProgress or completed), league and stage, best of,
//     and both teams' code, name, games won and outcome ('win' or 'loss' once it's over, else '')
const API = 'https://esports-api.lolesports.com/persisted/gw', KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
// international events and the big leagues, by LoL Esports' names for them
// ponytail: the names of 2026; a league that's renamed drops out until it's added here
const BIG = /^(worlds|msi|first_stand|lck|lpl|lec|lcs|lta|cblol|lcp)/;
async function get(env, p) {
  const r = await fetch((env.ESPORTS_API || API) + p, { headers: { 'x-api-key': KEY } });
  if (!r.ok) throw new Error(`LoL Esports answered ${r.status}`);
  return r.json();
}
export function events(mem, env) { // mem: the object's memory
  if (mem.ev && Date.now() - mem.ev.at < (+env.ESPORTS_MS || 60000)) return mem.ev.list;
  return (mem.evNext ||= load(mem, env).finally(() => { mem.evNext = null; }));
}
async function load(mem, env) {
  const now = Date.now(), old = mem.ev ? mem.ev.list : [];
  try {
    if (!mem.lg || now - mem.lg.at > 864e5) {
      const j = await get(env, '/getLeagues?hl=en-US');
      mem.lg = { at: now, ids: j.data.leagues.filter((l) => BIG.test(l.slug)).map((l) => l.id) };
    }
    const j = await get(env, `/getSchedule?hl=en-US${mem.lg.ids.length ? `&leagueId=${mem.lg.ids.join(',')}` : ''}`);
    const list = j.data.schedule.events.filter((e) => e && e.type === 'match' && e.match && Array.isArray(e.match.teams) && e.match.teams.length === 2 && BIG.test((e.league || {}).slug))
      .map((e) => ({ id: String(e.match.id), at: Date.parse(e.startTime) || 0, st: String(e.state), lg: String(e.league.name || ''), bl: String(e.blockName || ''), bo: (e.match.strategy || {}).count | 0 || 1,
        t: e.match.teams.map((t) => ({ c: String(t.code || 'TBD'), n: String(t.name || 'TBD'), w: (t.result || {}).gameWins | 0, o: String((t.result || {}).outcome || '') })) }))
      .filter((e) => e.at > now - 7 * 864e5 && e.at < now + 14 * 864e5);
    mem.ev = { at: now, list };
    return list;
  } catch (err) {
    console.warn('esports:', err.message);
    mem.ev = { at: now, list: old }; // asked again in a minute
    return old;
  }
}

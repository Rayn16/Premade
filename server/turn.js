// /turn: our own relay for Remote help (1.32), Cloudflare's TURN (developers.cloudflare.com/realtime/turn): short-lived
// credentials, good for a day, made with the secrets TURN_KEY_ID and TURN_KEY_TOKEN that never leave this server.
// The page uses them when a friend's PC can't be reached directly; without the secrets it's a 404 and the page keeps
// PeerJS's own servers. Port 53 is left out: browsers block it, and waiting for it slows a connection down.
// ponytail: one set of credentials an hour for everyone; per-user ones (customIdentifier) if anyone abuses it
let made = null; // { at, body }
export async function turn(env, ask = fetch) {
  const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return new Response('No relay of our own', { status: 404, headers: cors });
  if (!made || Date.now() - made.at > 3600000) {
    const r = await ask(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }),
    }).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (!j || !Array.isArray(j.iceServers)) return new Response('The relay didn’t answer', { status: 502, headers: cors });
    const iceServers = j.iceServers.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    made = { at: Date.now(), body: JSON.stringify({ iceServers }) };
  }
  return new Response(made.body, { headers: { ...cors, 'content-type': 'application/json' } });
}

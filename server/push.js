// Phone notifications for the phone remote (site/remote.html and remote-sw.js): Web Push, so a match found reaches the
// phone with its screen off or the remote closed (on an iPhone, from its home screen icon). Each remote code's room
// object (lolprox-r<code>, worker.js Room) keeps its own key pair, made on first use, and up to 4 phones' push
// addresses. The pushes carry nothing, so there's nothing to encrypt: the phone shows its own "Match found".
//   GET /push/<code>: { key }, the public key for the phone's PushManager.subscribe
//   POST /push/<code> with { add } or { drop }: a phone's push address (its subscription's endpoint)
//   POST /push/<code>/ring: pushes every phone (from the PC's page, on a match found), at most once every 5 s
const CORS = { 'access-control-allow-origin': '*' };
// the push services of Chrome, Safari, Firefox and Edge, so nothing else gets our POSTs; a test names its own (PUSH_OK)
const PUSH_OK = '^https://([a-z0-9-]+\\.)*(fcm\\.googleapis\\.com|push\\.apple\\.com|push\\.services\\.mozilla\\.com|notify\\.windows\\.com)/';
const EC = { name: 'ECDSA', namedCurve: 'P-256' };
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const utf8 = (s) => new TextEncoder().encode(s);

export async function push(req, st, env) {
  const ring = new URL(req.url).pathname.endsWith('/ring'), json = (j, status = 200) => Response.json(j, { status, headers: CORS });
  let v = await st.get('vapid');
  if (!v) {
    const k = await crypto.subtle.generateKey(EC, true, ['sign', 'verify']);
    v = { jwk: await crypto.subtle.exportKey('jwk', k.privateKey), pub: b64(await crypto.subtle.exportKey('raw', k.publicKey)) };
    await st.put('vapid', v);
  }
  if (req.method === 'GET' && !ring) return json({ key: v.pub });
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  let subs = (await st.get('subs')) || [];
  if (!ring) {
    let m = null;
    try { m = JSON.parse(await req.text()); } catch {}
    const ep = m && (m.add || m.drop);
    if (typeof ep !== 'string' || ep.length > 1000 || !new RegExp(env.PUSH_OK || PUSH_OK).test(ep)) return json({ error: 'Not a push address' }, 400);
    subs = subs.filter((s) => s !== ep);
    if (m.add) subs = [...subs, ep].slice(-4); // ponytail: the newest 4 phones a code, plenty for one player
    await st.put('subs', subs);
    return json({ ok: true });
  }
  if (Date.now() - ((await st.get('rang')) || 0) < 5000) return json({ sent: 0 });
  await st.put('rang', Date.now());
  // Apple asks for a new token at most once an hour: each push service's lasts 12 hours and is used for 11
  const tokens = (await st.get('jwts')) || {}, now = Math.floor(Date.now() / 1000), key = await crypto.subtle.importKey('jwk', v.jwk, EC, false, ['sign']);
  let made = false;
  for (const aud of new Set(subs.map((s) => new URL(s).origin))) {
    if (tokens[aud] && tokens[aud][1] > now + 3600) continue;
    const exp = now + 12 * 3600, signed = `${b64(utf8('{"typ":"JWT","alg":"ES256"}'))}.${b64(utf8(JSON.stringify({ aud, exp, sub: 'https://league-proxchat.netlify.app' })))}`;
    tokens[aud] = [`${signed}.${b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signed)))}`, exp];
    made = true;
  }
  const res = await Promise.all(subs.map((s) => fetch(s, { method: 'POST', headers: { TTL: '20', Urgency: 'high', Topic: 'match', Authorization: `vapid t=${tokens[new URL(s).origin][0]}, k=${v.pub}` } })
    .then((r) => r.status, () => 0)));
  if (made) await st.put('jwts', tokens);
  const keep = subs.filter((s, i) => res[i] !== 404 && res[i] !== 410); // that phone turned them off, or its address ran out
  if (keep.length < subs.length) await st.put('subs', keep);
  return json({ sent: res.filter((x) => x >= 200 && x < 300).length });
}

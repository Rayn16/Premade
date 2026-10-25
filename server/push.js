// Phone notifications for the phone remote (site/remote.html and remote-sw.js): Web Push, so a match found reaches the
// phone with its screen off or the remote closed (on an iPhone, from its home screen icon). Each remote code's room
// object (lolprox-r<code>, worker.js Room) keeps its own key pair, made on first use, and up to 4 phones' push
// addresses, each with the phone's own keys when it sent them. A match found carries nothing, so the phone shows its
// own "Match found"; a squad's call or ping (squad.js, through tell) carries its words, encrypted for each phone with
// Web Push's encryption (RFC 8291), so it only reaches phones that sent their keys.
//   GET /push/<code>: { key }, the public key for the phone's PushManager.subscribe
//   POST /push/<code> with { add, keys } or { drop }: a phone's push address (its subscription's endpoint) and keys
//   POST /push/<code>/ring: pushes every phone (from the PC's page, on a match found), at most once every 5 s
const CORS = { 'access-control-allow-origin': '*' };
// the push services of Chrome, Safari, Firefox and Edge, so nothing else gets our POSTs; a test names its own (PUSH_OK)
const PUSH_OK = '^https://([a-z0-9-]+\\.)*(fcm\\.googleapis\\.com|push\\.apple\\.com|push\\.services\\.mozilla\\.com|notify\\.windows\\.com)/';
const EC = { name: 'ECDSA', namedCurve: 'P-256' }, DH = { name: 'ECDH', namedCurve: 'P-256' };
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const utf8 = (s) => new TextEncoder().encode(s);
const cat = (...l) => { const out = new Uint8Array(l.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of l) { out.set(x, i); i += x.length; } return out; };
const epOf = (s) => (typeof s === 'string' ? s : s[0]); // a phone: its address, or [address, its public key, its secret]
const keysOf = (k) => { // a subscription's keys, when they look like a P-256 public key and a 16-byte secret
  try { if (k && typeof k.p256dh === 'string' && typeof k.auth === 'string' && unb64(k.p256dh).length === 65 && unb64(k.auth).length === 16) return [k.p256dh, k.auth]; } catch {}
  return null;
};

// Storage writes are few (the free plan counts them): the key once, a phone's address when it changes, and a ring
// only for a code with phones on it, as most PCs ring with none.
export async function push(req, st, env) {
  const ring = new URL(req.url).pathname.endsWith('/ring'), json = (j, status = 200) => Response.json(j, { status, headers: CORS });
  let v = await st.get('vapid');
  if (req.method === 'GET' && !ring) {
    if (!v) {
      const k = await crypto.subtle.generateKey(EC, true, ['sign', 'verify']);
      v = { jwk: await crypto.subtle.exportKey('jwk', k.privateKey), pub: b64(await crypto.subtle.exportKey('raw', k.publicKey)) };
      await st.put('vapid', v);
    }
    return json({ key: v.pub });
  }
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  const subs = (await st.get('subs')) || [];
  if (!ring) {
    let m = null;
    try { m = JSON.parse(await req.text()); } catch {}
    const ep = m && (m.add || m.drop), k = m && m.add && keysOf(m.keys);
    if (typeof ep !== 'string' || ep.length > 1000 || !new RegExp(env.PUSH_OK || PUSH_OK).test(ep)) return json({ error: 'Not a push address' }, 400);
    const next = [...subs.filter((s) => epOf(s) !== ep), ...(m.add ? [k ? [ep, ...k] : ep] : [])].slice(-4); // ponytail: the newest 4 phones a code, plenty for one player
    if (JSON.stringify(next) !== JSON.stringify(subs)) await st.put('subs', next); // a phone sends its address each time it opens
    return json({ ok: true });
  }
  if (!subs.length || !v || Date.now() - ((await st.get('rang')) || 0) < 5000) return json({ sent: 0 });
  await st.put('rang', Date.now());
  return json({ sent: await send(st, v, subs, subs, { TTL: '20', Topic: 'match' }) });
}

// a squad's call or ping (squad.js), { t: 'call' | 'ping', title, body, ... }: to each phone that sent its keys, the
// call kept by its push service for 30 minutes while the phone is off, a ping for 10
export async function tell(st, msg) {
  const v = await st.get('vapid'), subs = (await st.get('subs')) || [], to = subs.filter((s) => typeof s !== 'string');
  if (!v || !to.length) return 0;
  const call = msg.t === 'call', text = JSON.stringify(msg);
  return send(st, v, subs, to, { TTL: call ? '1800' : '600', Topic: call ? 'call' : 'ping' }, (s) => seal(s[1], s[2], text));
}

// pushes to the phones in `to` (of all the code's phones), each with what body(phone) gives (nothing for a ring)
async function send(st, v, all, to, head, body = () => null) {
  // Apple asks for a new token at most once an hour: each push service's lasts 12 hours and is used for 11
  const tokens = (await st.get('jwts')) || {}, now = Math.floor(Date.now() / 1000), key = await crypto.subtle.importKey('jwk', v.jwk, EC, false, ['sign']);
  let made = false;
  for (const aud of new Set(to.map((s) => new URL(epOf(s)).origin))) {
    if (tokens[aud] && tokens[aud][1] > now + 3600) continue;
    const exp = now + 12 * 3600, signed = `${b64(utf8('{"typ":"JWT","alg":"ES256"}'))}.${b64(utf8(JSON.stringify({ aud, exp, sub: 'https://league-proxchat.netlify.app' })))}`;
    tokens[aud] = [`${signed}.${b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signed)))}`, exp];
    made = true;
  }
  const res = await Promise.all(to.map(async (s) => {
    const b = await body(s);
    return fetch(epOf(s), { method: 'POST', body: b, headers: { ...head, Urgency: 'high', Authorization: `vapid t=${tokens[new URL(epOf(s)).origin][0]}, k=${v.pub}`,
      ...(b && { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' }) } }).then((r) => r.status, () => 0);
  }));
  if (made) await st.put('jwts', tokens);
  const gone = new Set(to.filter((s, i) => res[i] === 404 || res[i] === 410).map(epOf)); // that phone turned them off, or its address ran out
  if (gone.size) await st.put('subs', all.filter((s) => !gone.has(epOf(s))));
  return res.filter((x) => x >= 200 && x < 300).length;
}

// Web Push's encryption (RFC 8291, aes128gcm): a key agreed between a new key pair of ours and the phone's public key,
// mixed with the phone's secret, so only that phone can read it; one record, with the header the phone needs
async function hkdf(salt, ikm, info, n) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}
async function seal(p256dh, auth, text) {
  const ua = unb64(p256dh), mine = await crypto.subtle.generateKey(DH, true, ['deriveBits']), as = new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', ua, DH, false, []) }, mine.privateKey, 256));
  const ikm = await hkdf(unb64(auth), shared, cat(utf8('WebPush: info\0'), ua, as), 32), salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['encrypt']);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12) }, cek, cat(utf8(text), [2])); // 2: the last record
  return cat(salt, [0, 0, 16, 0], [65], as, new Uint8Array(sealed)); // the salt, a record size of 4096 and our public key
}

// Clip links (/clips/..., /c/...), the way Medal uploads: the app sends a clip in 8 MB parts, each retried on its own,
// into R2 (the CLIPS bucket), and gets back a link anyone can watch, with seeking. At most 200 MB a clip; the bucket's
// lifecycle rule deletes them after 30 days. With no bucket bound, /clips/on says so and the page hides the button.
// ponytail: no account or rate limit; add one if strangers start using it as free storage
const CORS = { 'access-control-allow-origin': '*' };
const PART = 8 * 2 ** 20, MAX = 200e6, KEY = /^[0-9a-f]{16}\.webm$/;

export async function clips(req, url, env) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'access-control-allow-methods': 'GET, POST, PUT' } });
  if (url.pathname === '/clips/on') return Response.json({ on: !!env.CLIPS }, { headers: CORS });
  if (!env.CLIPS) return new Response('Clip links are off', { status: 503, headers: CORS });
  if (url.pathname.startsWith('/c/')) return watch(req, url.pathname.slice(3), env);
  const id = url.searchParams.get('id') || '', up = url.searchParams.get('up') || '';
  if (url.pathname === '/clips/start' && req.method === 'POST') {
    const size = +url.searchParams.get('size');
    if (!(size > 0 && size <= MAX)) return new Response('Clips can be up to 200 MB', { status: 413, headers: CORS });
    const key = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('') + '.webm';
    const m = await env.CLIPS.createMultipartUpload(key, { httpMetadata: { contentType: 'video/webm' } });
    return Response.json({ id: key, up: m.uploadId, part: PART }, { headers: CORS });
  }
  if (!KEY.test(id) || !up) return new Response('Not a clip upload', { status: 400, headers: CORS });
  const m = env.CLIPS.resumeMultipartUpload(id, up);
  try {
    if (url.pathname === '/clips/part' && req.method === 'PUT') {
      const n = +url.searchParams.get('n'), body = await req.arrayBuffer();
      if (!(Number.isInteger(n) && n >= 1 && n <= Math.ceil(MAX / PART)) || !body.byteLength || body.byteLength > PART) return new Response('Not a part', { status: 400, headers: CORS });
      const p = await m.uploadPart(n, body);
      return Response.json({ partNumber: p.partNumber, etag: p.etag }, { headers: CORS });
    }
    if (url.pathname === '/clips/done' && req.method === 'POST') { // a plain text body, so no preflight
      const parts = JSON.parse(await req.text());
      await m.complete(parts.map((p) => ({ partNumber: +p.partNumber, etag: String(p.etag) })));
      return Response.json({ url: `${url.origin}/c/${id}` }, { headers: CORS });
    }
  } catch (err) { return new Response(`Upload failed: ${err.message}`, { status: 400, headers: CORS }); } // an unknown upload or part
  return new Response('Not found', { status: 404, headers: CORS });
}

// a clip, in parts when the player asks for a range
async function watch(req, key, env) {
  if (!KEY.test(key)) return new Response('Not found', { status: 404, headers: CORS });
  const o = await env.CLIPS.get(key, { range: req.headers });
  if (!o) return new Response('This clip is gone: links last 30 days.', { status: 404, headers: CORS });
  const h = new Headers({ ...CORS, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' });
  o.writeHttpMetadata(h);
  const r = o.range, a = !r ? 0 : 'suffix' in r ? o.size - r.suffix : r.offset || 0, len = !r ? o.size : 'suffix' in r ? r.suffix : r.length ?? o.size - a;
  if (r && req.headers.has('range')) h.set('content-range', `bytes ${a}-${a + len - 1}/${o.size}`);
  h.set('content-length', String(len));
  return new Response(o.body, { status: r && req.headers.has('range') ? 206 : 200, headers: h });
}

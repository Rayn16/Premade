// Checks the whole account's budget under `wrangler dev` with a fake Riot API and a fake Cloudflare GraphQL: the Riot
// object asks Cloudflare's analytics for the account's Durable Object requests today (its account, today's date, the
// read-only token), says them in /riot/summary (acct), and stops calling Riot once they pass 80% of the free 100,000,
// starting again when they're under.
// WRANGLER=<path to wrangler> node budget.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');

const PORT = 8796, FAKE = 8797, BASE = `http://127.0.0.1:${PORT}`;
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-budget-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let req = 50000, riotCalls = 0;
const asked = [];
http.createServer((q, r) => {
  let body = '';
  q.on('data', (d) => (body += d)).on('end', () => {
    if (q.url === '/graphql') { asked.push({ auth: q.headers.authorization, body: JSON.parse(body) }); return r.end(JSON.stringify({ data: { viewer: { accounts: [{ durableObjectsInvocationsAdaptiveGroups: [{ sum: { requests: req } }] }] } }, errors: null })); }
    riotCalls++; // any Riot call: nothing there
    r.writeHead(404).end('{}');
  });
}).listen(FAKE).unref();
const wr = spawn(process.env.WRANGLER || 'wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', persist,
  '--var', 'RIOT_KEY:k', '--var', `RIOT_BASE:http://127.0.0.1:${FAKE}/{host}`, '--var', 'CRAWL_EVERY:300', '--var', 'BUDGET_EVERY:1000',
  '--var', 'CF_ACCOUNT_ID:acct123', '--var', 'CF_ANALYTICS_TOKEN:ro-token', '--var', `CF_GRAPHQL:http://127.0.0.1:${FAKE}/graphql`], { cwd: __dirname, detached: true, stdio: 'ignore' });

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/')).ok) break; } catch {}
    assert(i < 120, 'wrangler dev did not start');
    await sleep(500);
  }
  const sum = async () => (await (await fetch(BASE + '/riot/summary')).json()).acct;
  for (let i = 0; !(await sum()); i++) { assert(i < 60, 'no budget in the summary'); await sleep(500); }
  const a = await sum(), today = new Date().toISOString().slice(0, 10);
  assert.deepEqual([a.req, a.lim, a.paused, a.day], [50000, 100000, false, today]);
  assert.equal(asked[0].auth, 'Bearer ro-token');
  assert.deepEqual(asked[0].body.variables, { a: 'acct123', d: today });
  assert(/durableObjectsInvocationsAdaptiveGroups/.test(asked[0].body.query));
  await sleep(2000);
  assert(riotCalls > 0, 'counting under 80%');
  req = 85000; // past 80%: no more Riot calls
  for (let i = 0; !(await sum()).paused; i++) { assert(i < 30, 'not paused'); await sleep(500); }
  const n = riotCalls;
  await sleep(3000);
  assert(riotCalls - n <= 1, `paused, but ${riotCalls - n} Riot calls`); // one already under way at most
  req = 10000; // a new day, say: counting again
  for (let i = 0; (await sum()).paused; i++) { assert(i < 30, 'still paused'); await sleep(500); }
  const m = riotCalls;
  await sleep(2000);
  assert(riotCalls > m, 'counting again');
  console.log('budget ok');
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { try { process.kill(-wr.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); });

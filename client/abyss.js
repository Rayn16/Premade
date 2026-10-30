// Abyss DPS Meter's saved fights (~/.abyss-dps-meter/segments/<id>.abyss), read for the Aion 2 page: "ABYS", a u16 version,
// then sections [u16 id][varint length][protobuf]: 1 header, 2 stats, 3 timeline, 4 signature. Field numbers from the
// segment.proto (abyss.segment.v1) built into AbyssDPSMeter.exe 4.2.14; Premade reads only the header and the stats.
// Times in the file are Unix ns; here they're ms.
function fields(buf) { // { field number: [values] }: a varint as a BigInt, a length-delimited field as a Buffer
  const out = {};
  let i = 0;
  const varint = () => { let v = 0n, s = 0n, b; do { b = buf[i++]; v |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80); return v; };
  while (i < buf.length) {
    const key = Number(varint()), n = key >> 3, t = key & 7;
    let v;
    if (t === 0) v = varint();
    else if (t === 2) { const len = Number(varint()); v = buf.subarray(i, (i += len)); }
    else if (t === 1) { v = buf.readDoubleLE(i); i += 8; }
    else if (t === 5) { v = buf.readUInt32LE(i); i += 4; }
    else throw new Error('bad wire type ' + t);
    (out[n] = out[n] || []).push(v);
  }
  return out;
}
const num = (f, n) => Number(f[n] ? f[n][0] : 0n), str = (f, n) => (f[n] ? f[n][0].toString('utf8') : ''), ms = (f, n) => Number((f[n] ? f[n][0] : 0n) / 1000000n);
function parse(buf) {
  if (buf.toString('latin1', 0, 4) !== 'ABYS') throw new Error('not an Abyss fight');
  const sec = {};
  for (let i = 6; i < buf.length;) {
    const id = buf.readUInt16LE(i);
    i += 2;
    let len = 0, s = 0, b;
    do { b = buf[i++]; len += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
    sec[id] = buf.subarray(i, (i += len));
  }
  const h = fields(sec[1] || Buffer.alloc(0)), st = fields(sec[2] || Buffer.alloc(0));
  const players = (st[1] || []).map((e) => {
    const p = fields(fields(e)[2][0]), skills = new Map();
    for (const t of p[22] || []) for (const se of fields(fields(t)[2][0])[16] || []) { // each target's skills, added up by name
      const k = fields(fields(se)[2][0]), name = str(k, 2), was = skills.get(name) || [name, 0, 0, 0];
      skills.set(name, [name, was[1] + num(k, 4), was[2] + num(k, 6), was[3] + num(k, 7)]);
    }
    return { n: str(p, 2), cls: str(p, 3), srv: num(p, 24), cp: num(p, 5), dmg: num(p, 6), hits: num(p, 7), crits: num(p, 8), back: num(p, 9), front: num(p, 10), parry: num(p, 11),
      perf: num(p, 12), dbl: num(p, 13), first: ms(p, 14), heal: num(p, 16), deaths: (p[27] || []).length, k: [...skills.values()].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  });
  return { id: str(h, 1), label: str(h, 2), start: ms(h, 3), end: ms(h, 4), dmg: num(h, 6), boss: num(h, 7) === 1, me: str(h, 11), meSrv: num(h, 12), players: players.sort((a, b) => b.dmg - a.dmg) };
}
module.exports = { parse };

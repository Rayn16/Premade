// Test of Convert a file (client/convert.js) with a real ffmpeg on the PATH: node client/convert.test.js
// Makes a video, a song with a cover and a picture, checks what each is taken for, converts each to every target it
// offers and reads the result back, checks the Discord MP4 stays under 10 MB, and that nothing is written over.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
const { kindOf, targetsFor, convertArgs, outPath, FOR } = require('./convert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
const probe = (f) => kindOf(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type:stream_disposition=attached_pic', '-of', 'json', f], { stdio: ['ignore', 'pipe', 'pipe'] })));

const video = path.join(tmp, 'clip.mkv'), song = path.join(tmp, 'song.mp3'), pic = path.join(tmp, 'shot.png'), text = path.join(tmp, 'notes.txt');
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30,noise=alls=40:allf=t', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '10', '-c:v', 'libx264', '-crf', '10', '-c:a', 'aac', video);
ff('-f', 'lavfi', '-i', 'testsrc2=size=320x240', '-frames:v', '1', pic);
ff('-f', 'lavfi', '-i', 'sine=frequency=330', '-i', pic, '-t', '3', '-map', '0', '-map', '1', '-c:a', 'libmp3lame', '-c:v', 'png', '-disposition:v', 'attached_pic', song);
fs.writeFileSync(text, 'not media');

assert.deepStrictEqual(probe(video), { kind: 'video', duration: probe(video).duration });
assert(Math.abs(probe(video).duration - 10) < 0.5, 'its length');
assert.strictEqual(probe(song).kind, 'audio', 'a song with a cover is audio');
assert.strictEqual(probe(pic).kind, 'image');
assert.throws(() => probe(text), 'ffprobe refuses what it can’t read');
assert.strictEqual(kindOf({}).kind, '');

const expect = { mp4: 'video', discord: 'video', webm: 'video', gif: 'video', mp3: 'audio', m4a: 'audio', wav: 'audio', flac: 'audio', opus: 'audio', png: 'image', jpg: 'image', webp: 'image', bmp: 'image' };
for (const [src, kind] of [[video, 'video'], [song, 'audio'], [pic, 'image']]) {
  assert.deepStrictEqual(targetsFor(kind).map((t) => t.id), FOR[kind]);
  for (const { id } of targetsFor(kind)) {
    const out = outPath(src, id, fs.existsSync);
    ff('-i', src, ...convertArgs(id, probe(src).duration), '-n', out);
    assert.strictEqual(probe(out).kind, expect[id], `${path.basename(src)} to ${id}`);
  }
}
const discord = path.join(tmp, 'clip (Discord).mp4');
assert(fs.statSync(discord).size < 10 * 1024 * 1024, `Discord file is ${fs.statSync(discord).size} bytes`);
assert.strictEqual(convertArgs('discord', 3600), null, 'an hour can’t fit in 10 MB');
assert.strictEqual(outPath(video, 'mp4', fs.existsSync), path.join(tmp, 'clip (2).mp4'), 'never over a file');
assert.strictEqual(outPath(path.join(tmp, 'a.mp4'), 'mp4', () => false), path.join(tmp, 'a (2).mp4'), 'never over the original');
assert.deepStrictEqual(targetsFor('pdf'), []);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('convert: video, song and picture taken for what they are, every target converts, Discord under 10 MB, nothing overwritten');

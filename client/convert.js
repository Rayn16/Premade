// Convert a file (app 1.35): what ffmpeg makes of a picked file, and the ffmpeg arguments for each target. Kept out of
// main.js so convert.test.js can run it with a real ffmpeg, without Electron.
// ponytail: ffmpeg only (video, audio, pictures); documents, ebooks and archives need LibreOffice, Pandoc, Calibre (step 2)

// ffprobe -show_entries format=format_name,duration:stream=codec_type:stream_disposition=attached_pic -of json
// -> 'video' | 'audio' | 'image' | '' (not something ffmpeg reads), with its length in seconds. A song's cover is a
// picture stream, so attached pictures don't make it a video; GIFs count as videos, since most move.
function kindOf(probe) {
  const fmt = (probe.format && probe.format.format_name) || '', streams = probe.streams || [];
  const vids = streams.filter((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const duration = parseFloat(probe.format && probe.format.duration) || 0;
  if (vids.length && (/_pipe$|^image2$/.test(fmt))) return { kind: 'image', duration: 0 };
  if (vids.length) return { kind: 'video', duration };
  if (streams.some((s) => s.codec_type === 'audio')) return { kind: 'audio', duration };
  return { kind: '', duration: 0 };
}

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'];
// target -> [label, extension, ffmpeg arguments between the input and the output]
const TARGETS = {
  mp4: ['MP4 (plays everywhere)', 'mp4', [...H264, '-crf', '23', '-b:a', '160k']],
  discord: ['MP4 under 10 MB (Discord)', 'mp4', null], // its bitrate comes from the length, in convertArgs
  webm: ['WebM', 'webm', ['-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-c:a', 'libopus']],
  gif: ['GIF', 'gif', ['-vf', 'fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', '-an']],
  mp3: ['MP3', 'mp3', ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']],
  m4a: ['M4A (AAC)', 'm4a', ['-vn', '-c:a', 'aac', '-b:a', '192k']],
  wav: ['WAV', 'wav', ['-vn', '-c:a', 'pcm_s16le']],
  flac: ['FLAC (lossless)', 'flac', ['-vn', '-c:a', 'flac']],
  opus: ['Opus', 'opus', ['-vn', '-c:a', 'libopus', '-b:a', '128k']],
  png: ['PNG', 'png', ['-frames:v', '1']],
  jpg: ['JPG', 'jpg', ['-frames:v', '1', '-q:v', '2']],
  webp: ['WebP', 'webp', ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '90']],
  bmp: ['BMP', 'bmp', ['-frames:v', '1']],
};
const FOR = { video: ['mp4', 'discord', 'webm', 'gif', 'mp3', 'm4a', 'wav'], audio: ['mp3', 'm4a', 'wav', 'flac', 'opus'], image: ['png', 'jpg', 'webp', 'bmp'] };
const targetsFor = (kind) => (FOR[kind] || []).map((t) => ({ id: t, label: TARGETS[t][0] }));

// Discord's free limit is 10 MB: aim at 9 MB of picture and sound together, at most 720p.
// ponytail: one pass with a capped bitrate lands within about 5%; two passes if files come out over
function convertArgs(target, duration) {
  if (target !== 'discord') return TARGETS[target][2];
  const kbps = Math.floor((9 * 8 * 1024) / Math.max(duration, 1)) - 96;
  if (kbps < 150) return null; // too long to look like anything at 10 MB
  return [...H264, '-vf', "scale=-2:'min(720,ih)'", '-b:v', kbps + 'k', '-maxrate', kbps + 'k', '-bufsize', kbps * 2 + 'k', '-b:a', '96k'];
}

// name.ext next to the original, or "name (2).ext" and on, never over a file
function outPath(input, target, exists, path = require('path')) {
  const { dir, name } = path.parse(input), ext = TARGETS[target][1], base = name + (target === 'discord' ? ' (Discord)' : '');
  for (let i = 1; ; i++) {
    const p = path.join(dir, `${base}${i > 1 ? ` (${i})` : ''}.${ext}`);
    if (p !== input && !exists(p)) return p;
  }
}

module.exports = { kindOf, targetsFor, convertArgs, outPath, TARGETS, FOR };

// electron cap.js: a real screen capture (no fake devices) as Premade asks for it, for MINS minutes, logging each
// process's private MB. MODE: video | audio | both (audio = Windows loopback, as main.js hands out). The stream is
// shown in a <video> and sent over a local WebRTC call, like a room share.
const { app, BrowserWindow, desktopCapturer, session } = require('electron'), fs = require('fs'), path = require('path');
const MODE = process.env.MODE || 'both', MINS = +process.env.MINS || 4, OUT = process.env.OUT || __dirname;
const log = (l) => { fs.appendFileSync(path.join(OUT, `cap-${MODE}.txt`), l + '\n'); console.log(l); };
app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler(async (req, done) => {
    const s = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }))[0];
    done({ ...(MODE !== 'audio' && { video: s }), ...(MODE !== 'video' && { audio: 'loopback' }), ...(MODE === 'audio' && { video: s }) });
  });
  const win = new BrowserWindow({ width: 800, height: 600 });
  await win.loadURL('data:text/html,<video autoplay muted style="width:100%"></video>');
  await win.webContents.executeJavaScript(`(async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { ideal: 60, max: 60 } }, audio: ${MODE !== 'video'} });
    if (${MODE === 'audio'}) s.getVideoTracks().forEach((t) => { t.stop(); s.removeTrack(t); });
    document.querySelector('video').srcObject = s;
    const a = new RTCPeerConnection(), b = new RTCPeerConnection();
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate); b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
    b.ontrack = (e) => { const v = document.createElement('video'); v.autoplay = true; v.muted = true; v.srcObject = e.streams[0]; document.body.append(v); };
    s.getTracks().forEach((t) => a.addTrack(t, s));
    await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription); await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription);
    window.tracks = s.getTracks().map((t) => t.kind + ':' + t.readyState).join(',');
  })()`).catch((e) => log('capture failed: ' + e.message));
  const t0 = Date.now();
  const tick = async () => {
    const t = Math.round((Date.now() - t0) / 1000), ms = app.getAppMetrics(), mb = (k) => Math.round(k / 1024);
    log(`${MODE} t=${t}s ` + ms.map((p) => `${p.type === 'Utility' ? (p.serviceName || '').split('.').pop() : p.type}=${mb(p.memory.privateBytes || 0)}`).join(' ') + ' ' + await win.webContents.executeJavaScript('window.tracks').catch(() => ''));
    if (t > MINS * 60) app.exit(0);
  };
  tick(); setInterval(tick, 30000);
});

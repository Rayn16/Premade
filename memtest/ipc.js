const { app, BrowserWindow } = require('electron'), { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const rss = () => Math.round(process.getProcessMemoryInfo ? 0 : 0); const priv = () => app.getAppMetrics().find((p) => p.type === 'Browser').memory.privateBytes >> 10;
const MODE = process.env.MODE || 'send';
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, 'pre.js') } });
  win.loadURL('data:text/html,<script>window.n=0;window.lpc.on((b)=>{window.n+=b.byteLength})</script>');
  const child = spawn('node', [path.join(__dirname, 'pcm-child.js')], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.on('data', (c) => { if (MODE === 'send') win.webContents.send('pcm', c); else if (MODE === 'copy') win.webContents.send('pcm', new Uint8Array(c)); });
  const t0 = Date.now();
  setInterval(async () => { console.log(MODE, Math.round((Date.now() - t0) / 1000) + 's main=' + priv(), 'heap=' + Math.round(process.memoryUsage().heapUsed / 1048576), 'ext=' + Math.round(process.memoryUsage().arrayBuffers / 1048576), 'rx=' + await win.webContents.executeJavaScript('n')); if (Date.now() - t0 > 240000) app.quit(); }, 15000);
});

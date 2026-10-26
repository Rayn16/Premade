// Builds the Windows installer (dist/Premade-Setup.exe, plus latest.yml and its blockmap for updates) on
// Linux without wine: electron-builder normally runs a stub exe through wine to get the uninstaller out of it, and it
// reads it out of the file instead when it thinks it's on macOS Catalina or newer (no 32-bit wine there).
// ponytail: leans on electron-builder 26.0.12's internals; if an upgrade moves this, build on Windows or install wine
require('app-builder-lib/out/util/macosVersion').isMacOsCatalina = () => true;
// npm installs only this machine's koffi binary, so without this the app has no Windows one and require('koffi') fails there
const { execSync } = require('child_process'), fs = require('fs');
const koffiWin = 'node_modules/@koromix/koffi-win32-x64';
if (!fs.existsSync(koffiWin)) {
  const v = require('./package.json').dependencies.koffi, tgz = execSync(`npm pack --silent @koromix/koffi-win32-x64@${v}`).toString().trim();
  fs.mkdirSync(koffiWin, { recursive: true });
  execSync(`tar -xzf ${tgz} -C ${koffiWin} --strip-components=1`);
  fs.unlinkSync(tgz);
}
require('electron-builder').build({ win: ['nsis'], publish: 'never' }).then(
  (files) => console.log(files.join('\n')),
  (err) => { console.error(err); process.exitCode = 1; },
);

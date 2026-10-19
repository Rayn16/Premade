// electron-builder hook: puts the app's name, version and icon inside the exe. electron-builder only does that through
// wine on Linux, and without it Windows (volume mixer, Wave Link, Task Manager) calls the app "Electron".
const fs = require('fs'), path = require('path'), ResEdit = require('resedit');

exports.default = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'win32') return;
  const { productName, version, companyName } = packager.appInfo;
  const file = path.join(appOutDir, `${productName}.exe`);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(file), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const [info] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const [lang] = info.getAllLanguagesForStringValues();
  info.setStringValues(lang, { FileDescription: productName, ProductName: productName, CompanyName: companyName || productName, InternalName: productName, OriginalFilename: `${productName}.exe`, LegalCopyright: '' });
  const [a, b, c] = version.split('.').map(Number);
  info.setFileVersion(a, b, c, 0, lang.lang);
  info.setProductVersion(a, b, c, 0, lang.lang);
  info.outputToResourceEntries(res.entries);
  const [group] = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(await packager.getIconPath()));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, ico.icons.map((i) => i.data));
  res.outputResource(exe);
  fs.writeFileSync(file, Buffer.from(exe.generate()));
};

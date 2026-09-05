const { join, resolve } = require('node:path');

module.exports = async function applyWindowsResources(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { rcedit } = await import('rcedit');
  const appInfo = context.packager.appInfo;
  await rcedit(join(context.appOutDir, `${appInfo.productFilename}.exe`), {
    icon: resolve(context.packager.projectDir, 'build/icon.ico'),
    'file-version': appInfo.version,
    'product-version': appInfo.version,
    'version-string': {
      FileDescription: 'Pincer',
      InternalName: 'Pincer',
      OriginalFilename: 'Pincer.exe',
      ProductName: 'Pincer',
      LegalCopyright: appInfo.copyright,
    },
    'requested-execution-level': 'asInvoker',
  });
};

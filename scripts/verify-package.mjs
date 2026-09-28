import { readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const platform = process.argv[2];
if (!['win', 'mac', 'linux'].includes(platform)) throw new Error('Pass win, mac or linux');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const names = readdirSync('release');
const expected = platform === 'win'
  ? [`Pincer-Setup-${version}-x64.exe`, `Pincer-Setup-${version}-x64.exe.blockmap`, 'latest.yml']
  : platform === 'mac'
    ? ['x64', 'arm64'].flatMap((arch) => [`Pincer-${version}-mac-${arch}.dmg`, `Pincer-${version}-mac-${arch}.zip`]).concat('latest-mac.yml')
    : [`Pincer-${version}-linux-x64.AppImage`, 'latest-linux.yml'];
for (const name of expected) {
  if (!names.includes(name) || statSync(join('release', name)).size === 0) throw new Error(`Missing or empty ${platform} artifact: ${name}`);
}
const metadata = await readFile(join('release', expected.at(-1)), 'utf8');
if (!metadata.includes(`version: ${version}`)) throw new Error(`Update metadata does not describe ${version}`);
console.log(`Verified ${platform} artifacts for Pincer ${version}.`);

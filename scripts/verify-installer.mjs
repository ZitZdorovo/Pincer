import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const output = 'release';
const installer = join(output, `Pincer-Setup-${version}-x64.exe`);
const blockmap = `${installer}.blockmap`;
const latest = join(output, 'latest.yml');

for (const file of [installer, blockmap, latest]) {
  if (!existsSync(file) || statSync(file).size === 0) throw new Error(`Missing or empty installer artifact: ${file}`);
}

const latestText = await readFile(latest, 'utf8');
if (!latestText.includes(`version: ${version}`)) throw new Error(`latest.yml does not describe version ${version}`);
console.log(`Verified Windows installer artifacts for Pincer ${version}.`);

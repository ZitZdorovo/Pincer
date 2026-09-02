import { build } from 'esbuild';

await build({
  entryPoints: ['electron/main.ts'], bundle: true, platform: 'node',
  target: 'node22', format: 'esm', outfile: 'dist-electron/main.mjs',
  packages: 'external', sourcemap: true,
});
await build({
  entryPoints: ['electron/preload.ts'], bundle: true, platform: 'node',
  target: 'node22', format: 'cjs', outfile: 'dist-electron/preload.cjs',
  external: ['electron'], sourcemap: true,
});

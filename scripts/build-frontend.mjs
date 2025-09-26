import { build } from 'esbuild';
import { rm, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const publicDir = path.join(root, 'public');
const srcFrontend = path.join(root, 'src-frontend');

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

await Promise.all([
  // Copy static html
  cp(path.join(srcFrontend, 'index.html'), path.join(publicDir, 'index.html')),
  cp(path.join(srcFrontend, 'board.html'), path.join(publicDir, 'board.html')),
  cp(path.join(srcFrontend, 'player.html'), path.join(publicDir, 'player.html')),
  cp(path.join(srcFrontend, 'calibrate.html'), path.join(publicDir, 'calibrate.html')),
  cp(path.join(srcFrontend, 'config.html'), path.join(publicDir, 'config.html')),
  // Copy css
  cp(path.join(srcFrontend, 'styles.css'), path.join(publicDir, 'styles.css')),
]);

await build({
  entryPoints: [
    path.join(srcFrontend, 'board.ts'),
    path.join(srcFrontend, 'player.ts'),
    path.join(srcFrontend, 'calibrate.ts'),
    path.join(srcFrontend, 'config.ts'),
    path.join(srcFrontend, 'shared.ts'),
  ],
  bundle: true,
  outdir: publicDir,
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  target: 'es2020',
});



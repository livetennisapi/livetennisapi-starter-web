// Builds the page into dist/ (or the folder given with --outdir).
//
//   npm run build                       keyless unless LIVETENNISAPI_KEY is set
//   LIVETENNISAPI_KEY=twjp_... npm run build
//
// The key comes from the environment, or from a .env file next to
// package.json. It is written into dist/app.js, so anyone who can open the
// page can read it. Use a FREE key only.
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    outdir: { type: 'string', default: 'dist' },
    keyless: { type: 'boolean', default: false },
  },
});
const outdir = resolve(root, values.outdir);
const inside = relative(root, outdir);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
  throw new Error(`--outdir must be a folder inside ${root}`);
}
// The build empties its output folder first. It only does that to a folder
// it made itself, which it marks with this file.
const MARKER = '.starter-build-output';
if (existsSync(outdir) && !existsSync(join(outdir, MARKER)) && (await readdir(outdir)).length > 0) {
  throw new Error(`${values.outdir} is not empty and was not made by this build, so it is left alone`);
}

const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const key = values.keyless ? '' : (process.env.LIVETENNISAPI_KEY ?? '').trim();
if (key && !/^[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error('LIVETENNISAPI_KEY has characters an API key never has. Check the value.');
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await writeFile(join(outdir, MARKER), 'Made by scripts/build.mjs. Safe to delete.\n');

await build({
  entryPoints: [join(root, 'src/main.js')],
  outfile: join(outdir, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: true,
  define: { __LIVETENNISAPI_KEY__: JSON.stringify(key) },
  logLevel: 'warning',
});

await cp(join(root, 'src/index.html'), join(outdir, 'index.html'));
await cp(join(root, 'src/styles.css'), join(outdir, 'styles.css'));
await cp(join(root, 'public'), outdir, { recursive: true });

console.log(`Built ${values.outdir}/ in ${key ? 'live mode (key from LIVETENNISAPI_KEY)' : 'keyless mode (bundled sample data)'}.`);

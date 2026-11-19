import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const scratch = join(root, '.e2e', 'unit-build');
after(() => rmSync(scratch, { recursive: true, force: true }));

function build(args, env = {}) {
  const run = spawnSync(process.execPath, ['scripts/build.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LIVETENNISAPI_KEY: '', ...env },
  });
  return { code: run.status, out: run.stdout + run.stderr };
}

test('a keyless build has no key in it', () => {
  const out = join('.e2e', 'unit-build', 'keyless');
  const run = build(['--keyless', '--outdir', out], { LIVETENNISAPI_KEY: 'twjp_unit_placeholder' });
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /keyless mode/);
  const app = readFileSync(join(root, out, 'app.js'), 'utf8');
  assert.ok(!app.includes('twjp_unit_placeholder'));
  assert.ok(existsSync(join(root, out, 'sample', 'live-matches.json')));
});

test('a key from the environment ends up in app.js only', () => {
  const out = join('.e2e', 'unit-build', 'live');
  const run = build(['--outdir', out], { LIVETENNISAPI_KEY: 'twjp_unit_placeholder' });
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /live mode/);
  assert.ok(!run.out.includes('twjp_unit_placeholder'), 'the key must not be printed');
  assert.ok(readFileSync(join(root, out, 'app.js'), 'utf8').includes('twjp_unit_placeholder'));
  assert.ok(!readFileSync(join(root, out, 'index.html'), 'utf8').includes('twjp_unit_placeholder'));
});

test('a key with characters no key has is refused', () => {
  const run = build(['--outdir', join('.e2e', 'unit-build', 'bad')], { LIVETENNISAPI_KEY: 'twjp_x"; alert(1); "' });
  assert.notEqual(run.code, 0);
  assert.match(run.out, /characters an API key never has/);
});

test('the build never empties a folder it did not make', () => {
  const foreign = join(scratch, 'foreign');
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, 'keep.txt'), 'mine');
  const run = build(['--keyless', '--outdir', join('.e2e', 'unit-build', 'foreign')]);
  assert.notEqual(run.code, 0);
  assert.match(run.out, /left alone/);
  assert.equal(readFileSync(join(foreign, 'keep.txt'), 'utf8'), 'mine');
});

test('the build only writes to dist or a folder under .e2e', () => {
  for (const outdir of ['../outside-the-project', 'public/preview', 'src', 'preview', '.', '.e2e']) {
    const run = build(['--keyless', '--outdir', outdir]);
    assert.notEqual(run.code, 0, outdir);
    assert.match(run.out, /must be dist or a folder under \.e2e/, outdir);
  }
  assert.ok(!existsSync(join(root, 'public', 'preview')));
  assert.ok(!existsSync(join(root, 'preview')));
});

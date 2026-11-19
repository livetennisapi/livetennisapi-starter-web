import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
// A folder of its own per run, so the cleanup never touches anything else.
const run = `unit-build-${process.pid}`;
const scratch = join(root, '.e2e', run);
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
  const out = join('.e2e', run, 'keyless');
  const result = build(['--keyless', '--outdir', out], { LIVETENNISAPI_KEY: 'twjp_unit_placeholder' });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /keyless mode/);
  const app = readFileSync(join(root, out, 'app.js'), 'utf8');
  assert.ok(!app.includes('twjp_unit_placeholder'));
  assert.ok(existsSync(join(root, out, 'sample', 'live-matches.json')));
});

test('a key from the environment ends up in app.js only', () => {
  const out = join('.e2e', run, 'live');
  const result = build(['--outdir', out], { LIVETENNISAPI_KEY: 'twjp_unit_placeholder' });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /live mode/);
  assert.ok(!result.out.includes('twjp_unit_placeholder'), 'the key must not be printed');
  const files = readdirSync(join(root, out), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  const withKey = files
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .filter((file) => readFileSync(file, 'utf8').includes('twjp_unit_placeholder'))
    .map((file) => file.slice(join(root, out).length + 1));
  assert.deepEqual(withKey, ['app.js']);
});

test('a key with characters no key has is refused', () => {
  const result = build(['--outdir', join('.e2e', run, 'bad')], { LIVETENNISAPI_KEY: 'twjp_x"; alert(1); "' });
  assert.notEqual(result.code, 0);
  assert.match(result.out, /characters an API key never has/);
});

test('the build never empties a folder it did not make', () => {
  const foreign = join(scratch, 'foreign');
  mkdirSync(foreign, { recursive: true });
  writeFileSync(join(foreign, 'keep.txt'), 'mine');
  const result = build(['--keyless', '--outdir', join('.e2e', run, 'foreign')]);
  assert.notEqual(result.code, 0);
  assert.match(result.out, /left alone/);
  assert.equal(readFileSync(join(foreign, 'keep.txt'), 'utf8'), 'mine');
});

test('the build only writes to dist or a folder under .e2e', () => {
  for (const outdir of ['../outside-the-project', 'public/preview', 'src', 'preview', '.', '.e2e']) {
    const result = build(['--keyless', '--outdir', outdir]);
    assert.notEqual(result.code, 0, outdir);
    assert.match(result.out, /must be dist or a folder under \.e2e/, outdir);
  }
  assert.ok(!existsSync(join(root, 'public', 'preview')));
  assert.ok(!existsSync(join(root, 'preview')));
});

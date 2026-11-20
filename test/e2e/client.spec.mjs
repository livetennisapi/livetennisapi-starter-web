import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

// The page hands the client its own fetch for the body deadline. This test
// runs the client with no fetch option at all, the way a reader's own page
// would. livetennisapi 1.10.2 failed here in Chrome with "Illegal invocation".
const PAGE = 'http://127.0.0.1:4173/plain-client/';
const sample = readFileSync(new URL('../../public/sample/live-matches.json', import.meta.url), 'utf8');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

test('the client lists live matches in Chrome with its default fetch', async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: "import { LiveTennisAPI } from 'livetennisapi'; window.LiveTennisAPI = LiveTennisAPI;",
      resolveDir: new URL('../..', import.meta.url).pathname,
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  const script = bundle.outputFiles[0].text;
  await page.route(PAGE, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>plain client</title><script src="client.js"></script>' }),
  );
  await page.route(`${PAGE}client.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: script }));
  const calls = [];
  await page.route('https://api.livetennisapi.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push(route.request().url());
    await route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: sample });
  });

  await page.goto(PAGE);
  const result = await page.evaluate(async () => {
    const client = new window.LiveTennisAPI({ apiKey: 'twjp_e2e_placeholder_not_a_key', maxRetries: 0 });
    try {
      const answer = await client.listMatches({ status: 'live', limit: 100 });
      return { ok: true, count: answer.data.length };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  expect(result).toEqual({ ok: true, count: JSON.parse(sample).data.length });
  expect(calls).toHaveLength(1);
});

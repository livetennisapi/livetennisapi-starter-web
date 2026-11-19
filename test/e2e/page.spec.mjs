import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const API = 'https://api.livetennisapi.com/api/public/v1';
const KEY = 'twjp_e2e_placeholder_not_a_key';
const sample = readFileSync(new URL('../../public/sample/live-matches.json', import.meta.url), 'utf8');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Answers every API call in the test, so nothing reaches the real API.
// Returns the list of GET requests the page made.
async function mockApi(page, answer) {
  const calls = [];
  await page.route('https://api.livetennisapi.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push({ url: request.url(), auth: request.headers().authorization });
    const { status = 200, body = sample, headers = {} } = answer ? answer(calls.length) : {};
    await route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers }, body });
  });
  return calls;
}

test.describe('keyless mode', () => {
  test('renders the bundled sample without calling the API', async ({ page }) => {
    const apiCalls = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://api.livetennisapi.com')) apiCalls.push(request.url());
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/keyless/');

    await expect(page.locator('#mode')).toHaveText('Sample data');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('6 sample matches');
    await expect(page.locator('.card')).toHaveCount(6);
    await expect(page.locator('#notice')).toBeVisible();
    await expect(page.getByRole('link', { name: 'How to add your API key' })).toBeVisible();

    const first = page.locator('.card').first();
    await expect(first.locator('h3')).toHaveText('Sample Open');
    await expect(first.locator('.tour')).toHaveText('ATP');
    await expect(first.locator('.stage')).toHaveText('Set 3');
    const p1 = first.locator('tbody tr').nth(0);
    await expect(p1.locator('.name')).toHaveText('Player A (synthetic)');
    await expect(p1.locator('td')).toHaveText(['6', '3', '4', '40']);
    await expect(p1).toHaveClass(/is-serving/);
    await expect(first.locator('tbody tr').nth(1).locator('td')).toHaveText(['4', '6', '3', '30']);

    await expect(page.getByRole('table').first()).toHaveAccessibleName(/Player A \(synthetic\) against Player B \(synthetic\)/);
    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('fits a 360px screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/keyless/');
    await expect(page.locator('.card')).toHaveCount(6);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('live mode, with the API answered by the test', () => {
  test('lists live matches through the client with the key from the build', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/live/');

    await expect(page.locator('#mode')).toHaveText('Live');
    await expect(page.locator('.card')).toHaveCount(6);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('6 live matches');
    await expect(page.locator('#notice')).toBeHidden();
    await expect(page.locator('#status-text')).toContainText('Updated');

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${API}/matches`);
    expect(url.searchParams.get('status')).toBe('live');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(calls[0].auth).toBe(`Bearer ${KEY}`);
  });

  test('refreshes once per interval, never sooner', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-05T12:00:00Z') });
    const calls = await mockApi(page);
    await page.goto('/live/');
    await expect(page.locator('.card')).toHaveCount(6);
    expect(calls).toHaveLength(1);

    await page.clock.fastForward('14:50');
    await page.waitForTimeout(200);
    expect(calls).toHaveLength(1);

    await page.clock.fastForward('00:20');
    await expect.poll(() => calls.length).toBe(2);

    await page.clock.fastForward('14:50');
    await page.waitForTimeout(200);
    expect(calls).toHaveLength(2);
  });

  test('a reload inside the interval reuses the last answer', async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto('/live/');
    await expect(page.locator('.card')).toHaveCount(6);
    await page.reload();
    await expect(page.locator('.card')).toHaveCount(6);
    await expect(page.locator('#status-text')).toContainText('Updated');
    expect(calls).toHaveLength(1);
  });

  test('an empty slate says so', async ({ page }) => {
    await mockApi(page, () => ({ body: JSON.stringify({ data: [], meta: { limit: 100, offset: 0, count: 0, total: 0, has_more: false } }) }));
    await page.goto('/live/');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('0 live matches');
    await expect(page.locator('#empty')).toContainText('No matches are live right now.');
  });

  test('a spent daily allowance waits for the reset', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-05T12:00:00Z') });
    const calls = await mockApi(page, () => ({
      status: 429,
      headers: { 'Retry-After': '43200' },
      body: JSON.stringify({ error: 'rate_limited', scope: 'day', limit_per_day: 100, resets_at: '2026-01-06T00:00:00Z' }),
    }));
    await page.goto('/live/');
    await expect(page.locator('#alert')).toContainText('This API key has used its requests for today.');

    await page.clock.fastForward('02:00:00');
    await page.waitForTimeout(200);
    expect(calls).toHaveLength(1);
  });

  test('a rejected key stops the refresh', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-05T12:00:00Z') });
    const calls = await mockApi(page, () => ({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) }));
    await page.goto('/live/');
    await expect(page.locator('#alert')).toContainText('The API did not accept this key.');

    await page.clock.fastForward('01:00:00');
    await page.waitForTimeout(200);
    expect(calls).toHaveLength(1);
  });

  test('names are shown as text, never as markup', async ({ page }) => {
    const data = JSON.parse(sample);
    data.data[0].players.p1.name = '<img src=x onerror="window.__pwned=1">';
    await mockApi(page, () => ({ body: JSON.stringify(data) }));
    await page.goto('/live/');
    await expect(page.locator('.card').first()).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});

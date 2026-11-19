import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_REQUESTS_PER_DAY,
  FREE_REQUESTS_PER_MINUTE,
  REFRESH_INTERVAL_MS,
  requestsPerDay,
  requestsPerMinute,
} from '../../src/limits.js';

// The FREE plan limits published at
// https://docs.livetennisapi.com/errors-and-rate-limits.html on 2026-11-19.
// If the docs change, change these two numbers and limits.js together.
const DOCUMENTED_FREE_PER_MINUTE = 30;
const DOCUMENTED_FREE_PER_DAY = 100;

test('limits.js carries the documented FREE plan limits', () => {
  assert.equal(FREE_REQUESTS_PER_MINUTE, DOCUMENTED_FREE_PER_MINUTE);
  assert.equal(FREE_REQUESTS_PER_DAY, DOCUMENTED_FREE_PER_DAY);
});

test('a page left open all day stays inside the daily limit, with room for a fresh load', () => {
  const polls = requestsPerDay(REFRESH_INTERVAL_MS);
  // One more request for the first load of the day with an empty cache.
  assert.ok(polls + 1 <= DOCUMENTED_FREE_PER_DAY, `${polls} refreshes plus 1 load exceeds ${DOCUMENTED_FREE_PER_DAY} a day`);
});

test('the refresh never comes close to the per-minute limit', () => {
  assert.ok(requestsPerMinute(REFRESH_INTERVAL_MS) <= DOCUMENTED_FREE_PER_MINUTE);
});

test('the interval is a whole number of seconds and at least the daily floor', () => {
  assert.ok(Number.isInteger(REFRESH_INTERVAL_MS / 1000));
  const floorMs = (24 * 60 * 60 * 1000) / DOCUMENTED_FREE_PER_DAY;
  assert.ok(REFRESH_INTERVAL_MS >= floorMs, `${REFRESH_INTERVAL_MS} ms is faster than one request every ${floorMs} ms`);
});

test('the helpers count requests the way the page sends them', () => {
  assert.equal(requestsPerDay(15 * 60 * 1000), 96);
  assert.equal(requestsPerDay(14 * 60 * 1000), 103);
  assert.equal(requestsPerMinute(1000), 60);
});

test('the README states the same limits and interval as limits.js', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.ok(
    readme.includes(`allows ${FREE_REQUESTS_PER_MINUTE} requests a minute and ${FREE_REQUESTS_PER_DAY} a day`),
    'the README quota sentence no longer matches limits.js',
  );
  const minutes = REFRESH_INTERVAL_MS / 60000;
  assert.ok(readme.includes(`refreshes every ${minutes} minutes`), 'the README interval no longer matches limits.js');
  assert.ok(readme.includes(`That is ${requestsPerDay(REFRESH_INTERVAL_MS)} requests in 24 hours`), 'the README daily count no longer matches');
});

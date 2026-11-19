import assert from 'node:assert/strict';
import test from 'node:test';
import { AbuseThrottled, APIConnectionError, RateLimited, ServerError, Unauthorized, UpgradeRequired } from 'livetennisapi';
import { REFRESH_INTERVAL_MS } from '../../src/limits.js';
import { describeError, nextRefreshAt } from '../../src/refresh.js';

const NOW = Date.parse('2026-01-05T12:00:00Z');
const MINUTE = 60 * 1000;

test('the first request goes out at once', () => {
  assert.equal(nextRefreshAt({ now: NOW }), NOW);
});

test('the next request waits one full interval after the last one', () => {
  assert.equal(nextRefreshAt({ now: NOW, lastAttemptAt: NOW }), NOW + REFRESH_INTERVAL_MS);
  assert.equal(nextRefreshAt({ now: NOW + MINUTE, lastAttemptAt: NOW }), NOW + REFRESH_INTERVAL_MS);
});

test('a request that is overdue goes out now, not in the past', () => {
  assert.equal(nextRefreshAt({ now: NOW + 2 * REFRESH_INTERVAL_MS, lastAttemptAt: NOW }), NOW + 2 * REFRESH_INTERVAL_MS);
});

test('a time named by the API wins over the interval', () => {
  const resetsAt = NOW + 6 * 60 * MINUTE;
  assert.equal(nextRefreshAt({ now: NOW, lastAttemptAt: NOW, notBefore: resetsAt }), resetsAt);
});

test('a past notBefore has no effect', () => {
  assert.equal(nextRefreshAt({ now: NOW, lastAttemptAt: NOW, notBefore: NOW - MINUTE }), NOW + REFRESH_INTERVAL_MS);
});

test('a clock that moved backwards waits one interval, not longer', () => {
  const future = NOW + 10 * 60 * MINUTE;
  assert.equal(nextRefreshAt({ now: NOW, lastAttemptAt: future }), NOW + REFRESH_INTERVAL_MS);
});

test('no wait is longer than a day and an hour', () => {
  const farAway = NOW + 30 * 24 * 60 * MINUTE;
  assert.equal(nextRefreshAt({ now: NOW, notBefore: farAway }), NOW + 25 * 60 * MINUTE);
});

test('a bad key or a plan without access stops the refresh', () => {
  assert.deepEqual(describeError(new Unauthorized('no', { status: 401 }), NOW), { kind: 'auth', stop: true, notBefore: null });
  assert.deepEqual(describeError(new UpgradeRequired('no', { status: 403 }), NOW), { kind: 'plan', stop: true, notBefore: null });
});

test('a daily 429 waits until resets_at', () => {
  const error = new RateLimited('daily', { status: 429, resetsAt: '2026-01-06T00:00:00Z' });
  assert.deepEqual(describeError(error, NOW), { kind: 'daily', stop: false, notBefore: Date.parse('2026-01-06T00:00:00Z') });
});

test('a per-minute 429 adds no wait beyond the normal interval', () => {
  // Retry-After on a per-minute 429 is seconds, far inside the 15 minutes.
  const error = new RateLimited('minute', { status: 429, retryAfter: 20 });
  assert.deepEqual(describeError(error, NOW), { kind: 'busy', stop: false, notBefore: null });
});

test('the abuse throttle waits until retry_at_epoch', () => {
  const at = Math.floor(NOW / 1000) + 3600;
  const error = new AbuseThrottled('slow down', { status: 429, retryAtEpoch: at });
  assert.deepEqual(describeError(error, NOW), { kind: 'throttled', stop: false, notBefore: at * 1000 });
});

test('server and network errors retry on the normal interval', () => {
  assert.deepEqual(describeError(new ServerError('boom', { status: 502 }), NOW), { kind: 'failed', stop: false, notBefore: null });
  assert.deepEqual(describeError(new APIConnectionError('offline'), NOW), { kind: 'failed', stop: false, notBefore: null });
  assert.deepEqual(describeError(new TypeError('Failed to fetch'), NOW), { kind: 'failed', stop: false, notBefore: null });
});

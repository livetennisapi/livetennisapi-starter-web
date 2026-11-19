import { AbuseThrottled, RateLimited, Unauthorized, UpgradeRequired } from 'livetennisapi';
import { MS_PER_DAY, REFRESH_INTERVAL_MS } from './limits.js';

const HOUR = 60 * 60 * 1000;

// The longest the page ever waits: a day and an hour (the abuse throttle is
// 24 hours). The store drops any saved wait longer than this.
export const MAX_WAIT_MS = MS_PER_DAY + HOUR;

// The earliest moment the page may send its next request.
//
// lastAttemptAt is when the last request left, whatever its answer was, so a
// failing network never turns into a tight retry loop. notBefore is a hold
// set after a 429, 401 or 403. A lastAttemptAt ahead of now counts as now
// (the store drops ones more than a minute ahead).
export function nextRefreshAt({ now, lastAttemptAt = null, notBefore = null, interval = REFRESH_INTERVAL_MS }) {
  const last = lastAttemptAt == null ? null : Math.min(lastAttemptAt, now);
  const fromInterval = last == null ? now : last + interval;
  const fromApi = notBefore == null ? now : Math.min(notBefore, now + MAX_WAIT_MS);
  return Math.max(fromInterval, fromApi, now);
}

function parseInstant(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function seconds(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

// Turns an error from the client into what the page should say and how long
// it should hold off. kind is 'auth', 'plan', 'daily', 'throttled', 'busy' or
// 'failed'. notBefore is a time to wait for, or null for the normal interval.
//
// Waits prefer the relative Retry-After the API sends on every 429, so a
// browser clock that is off does not move them. The absolute resets_at or
// retry_at_epoch is the fallback.
export function describeError(error, now) {
  if (error instanceof Unauthorized) {
    // A rejected key: every tab holds off for an hour, then tries once more.
    return { kind: 'auth', notBefore: now + HOUR };
  }
  if (error instanceof UpgradeRequired) {
    return { kind: 'plan', notBefore: now + HOUR };
  }
  if (error instanceof AbuseThrottled) {
    const after = seconds(error.retryAfter);
    const epoch = typeof error.retryAtEpoch === 'number' ? error.retryAtEpoch * 1000 : null;
    return { kind: 'throttled', notBefore: after != null ? now + after : epoch ?? now + MS_PER_DAY };
  }
  if (error instanceof RateLimited) {
    const resetsAt = parseInstant(error.resetsAt);
    const daily = resetsAt != null || error.body?.scope === 'day';
    if (daily) {
      const after = seconds(error.retryAfter);
      return { kind: 'daily', notBefore: after != null ? now + after : resetsAt ?? now + HOUR };
    }
    // A per-minute 429 asks for seconds. The next refresh is 15 minutes
    // away anyway, so there is nothing extra to wait for.
    return { kind: 'busy', notBefore: null };
  }
  return { kind: 'failed', notBefore: null };
}

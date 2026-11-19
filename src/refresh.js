import { AbuseThrottled, RateLimited, Unauthorized, UpgradeRequired } from 'livetennisapi';
import { MS_PER_DAY, REFRESH_INTERVAL_MS } from './limits.js';

// The earliest moment the page may send its next request.
//
// lastAttemptAt is when the last request left, whatever its answer was, so a
// failing network never turns into a tight retry loop. notBefore is a time the
// API named in a 429. A lastAttemptAt ahead of now counts as now (the store
// drops ones more than a minute ahead), and no wait is longer than a day and
// an hour (the abuse throttle is 24 hours).
export function nextRefreshAt({ now, lastAttemptAt = null, notBefore = null, interval = REFRESH_INTERVAL_MS }) {
  const last = lastAttemptAt == null ? null : Math.min(lastAttemptAt, now);
  const fromInterval = last == null ? now : last + interval;
  const fromApi = notBefore == null ? now : Math.min(notBefore, now + MS_PER_DAY + 60 * 60 * 1000);
  return Math.max(fromInterval, fromApi, now);
}

function parseInstant(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Turns an error from the client into what the page should say and do.
//   kind: 'auth' | 'plan' | 'daily' | 'throttled' | 'busy' | 'failed'
//   stop: true when retrying cannot help until the key or plan changes
//   notBefore: a time the API asked us to wait for, or null
export function describeError(error, now) {
  if (error instanceof Unauthorized) {
    return { kind: 'auth', stop: true, notBefore: null };
  }
  if (error instanceof UpgradeRequired) {
    return { kind: 'plan', stop: true, notBefore: null };
  }
  if (error instanceof AbuseThrottled) {
    const at = typeof error.retryAtEpoch === 'number' ? error.retryAtEpoch * 1000 : now + MS_PER_DAY;
    return { kind: 'throttled', stop: false, notBefore: at };
  }
  if (error instanceof RateLimited) {
    const resetsAt = parseInstant(error.resetsAt);
    if (resetsAt != null) return { kind: 'daily', stop: false, notBefore: resetsAt };
    // A per-minute 429 asks for seconds. The next refresh is 15 minutes
    // away anyway, so there is nothing extra to wait for.
    return { kind: 'busy', stop: false, notBefore: null };
  }
  return { kind: 'failed', stop: false, notBefore: null };
}

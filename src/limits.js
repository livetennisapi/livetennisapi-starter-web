// FREE plan limits, as the docs publish them:
// https://docs.livetennisapi.com/errors-and-rate-limits.html (read 2026-11-19).
// The same page says a 429, 403 or 404 answer does not spend the daily
// allowance.
export const FREE_REQUESTS_PER_MINUTE = 30;
export const FREE_REQUESTS_PER_DAY = 100;

// One refresh is one request: GET /matches?status=live with limit=100 returns
// every live match on one page in a normal day.
//
// Fifteen minutes is 96 refreshes in 24 hours. That leaves 4 requests a day
// for page loads with an empty cache. Lower it only with a paid key, and a
// paid key never belongs in browser code (see the README).
export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_MINUTE = 60 * 1000;

// How many requests one open page makes in a day at a given interval.
export function requestsPerDay(intervalMs) {
  return Math.ceil(MS_PER_DAY / intervalMs);
}

// How many requests one open page can make in any one minute.
export function requestsPerMinute(intervalMs) {
  return Math.ceil(MS_PER_MINUTE / intervalMs);
}

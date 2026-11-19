// Remembers the last answer and the last request time in localStorage, so a
// reload or a second tab reuses fresh data instead of spending another
// request. If storage is blocked (some private windows), the page keeps the
// same record in memory and still waits a full interval between requests.

import { MAX_WAIT_MS } from './refresh.js';
import { cleanPage } from './score.js';

const STORAGE_PREFIX = 'livetennisapi-starter-web:v1';

// A short fingerprint of the API key goes into the storage key, so a page
// rebuilt with a new key does not inherit the old key's wait or answer.
// FNV-1a: not a secret, just a stable label. The key is in app.js anyway.
function fingerprint(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// A saved time more than a minute ahead of this clock was written by a clock
// that ran fast. Trusting it would block every refresh until real time
// caught up, so it is dropped. A hold longer than the longest real wait is
// dropped too.
const MAX_SKEW_MS = 60 * 1000;
const PROBLEMS = new Set(['auth', 'plan', 'daily', 'throttled', 'busy', 'failed']);

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pastOrNull(value, now) {
  const ms = finiteOrNull(value);
  return ms != null && ms <= now + MAX_SKEW_MS ? ms : null;
}

function clean(record, now) {
  const page = cleanPage(record?.page);
  const fetchedAt = page ? pastOrNull(record?.fetchedAt, now) : null;
  const notBefore = finiteOrNull(record?.notBefore);
  return {
    lastAttemptAt: pastOrNull(record?.lastAttemptAt, now),
    notBefore: notBefore != null && notBefore <= now + MAX_WAIT_MS ? notBefore : null,
    problem: PROBLEMS.has(record?.problem) ? record.problem : null,
    fetchedAt,
    page: fetchedAt == null ? null : page,
  };
}

// Another tab may have written a newer record, and a failed write may have
// left an older one behind. The record with the later request decides the
// hold and the problem, and the later answer decides what is shown.
function merge(mine, theirs) {
  const theirsLater = theirs.lastAttemptAt != null && (mine.lastAttemptAt == null || theirs.lastAttemptAt >= mine.lastAttemptAt);
  const attempt = theirsLater ? theirs : mine;
  const theirsNewer = theirs.fetchedAt != null && (mine.fetchedAt == null || theirs.fetchedAt > mine.fetchedAt);
  const answer = theirsNewer ? theirs : mine;
  return {
    lastAttemptAt: attempt.lastAttemptAt,
    notBefore: attempt.notBefore,
    problem: attempt.problem,
    fetchedAt: answer.fetchedAt,
    page: answer.page,
  };
}

export function createStore(storage, apiKey = '') {
  const STORAGE_KEY = `${STORAGE_PREFIX}:${fingerprint(apiKey)}`;
  let memory = clean(null, Date.now());

  function load() {
    const now = Date.now();
    memory = clean(memory, now);
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) memory = merge(memory, clean(JSON.parse(raw), now));
    } catch {
      // Unreadable or blocked storage: keep what this tab already knows.
    }
    return { ...memory };
  }

  function save(patch) {
    memory = clean({ ...load(), ...patch }, Date.now());
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch {
      // Full or blocked storage: the in-memory record still applies.
    }
    return { ...memory };
  }

  return { key: STORAGE_KEY, load, save };
}

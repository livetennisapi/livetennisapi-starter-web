// Remembers the last answer and the last request time in localStorage, so a
// reload or a second tab reuses fresh data instead of spending another
// request. If storage is blocked (some private windows), the page keeps the
// same record in memory and still waits a full interval between requests.

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
// caught up, so it is dropped.
const MAX_SKEW_MS = 60 * 1000;

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pastOrNull(value, now) {
  const ms = finiteOrNull(value);
  return ms != null && ms <= now + MAX_SKEW_MS ? ms : null;
}

function clean(record, now = Date.now()) {
  const page = record && typeof record.page === 'object' && record.page !== null && Array.isArray(record.page.data) ? record.page : null;
  const fetchedAt = page ? pastOrNull(record?.fetchedAt, now) : null;
  return {
    lastAttemptAt: pastOrNull(record?.lastAttemptAt, now),
    notBefore: finiteOrNull(record?.notBefore),
    fetchedAt,
    page: fetchedAt == null ? null : page,
  };
}

function later(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

// Another tab may have written a newer record, and a failed write may have
// left an older one behind. Keep the newest of each value either way.
function merge(mine, theirs) {
  const theirsNewer = theirs.fetchedAt != null && (mine.fetchedAt == null || theirs.fetchedAt > mine.fetchedAt);
  return {
    lastAttemptAt: later(mine.lastAttemptAt, theirs.lastAttemptAt),
    notBefore: later(mine.notBefore, theirs.notBefore),
    fetchedAt: theirsNewer ? theirs.fetchedAt : mine.fetchedAt,
    page: theirsNewer ? theirs.page : mine.page,
  };
}

export function createStore(storage, apiKey = '') {
  const STORAGE_KEY = `${STORAGE_PREFIX}:${fingerprint(apiKey)}`;
  let memory = clean(null);

  function load() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) memory = merge(memory, clean(JSON.parse(raw)));
    } catch {
      // Unreadable or blocked storage: keep what this tab already knows.
    }
    return { ...memory };
  }

  function save(patch) {
    memory = clean({ ...load(), ...patch });
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch {
      // Full or blocked storage: the in-memory record still applies.
    }
    return { ...memory };
  }

  return { key: STORAGE_KEY, load, save };
}

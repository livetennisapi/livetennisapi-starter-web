// Remembers the last answer and the last request time in localStorage, so a
// reload or a second tab reuses fresh data instead of spending another
// request. If storage is blocked (some private windows), the page keeps the
// same record in memory and still waits a full interval between requests.

const STORAGE_KEY = 'livetennisapi-starter-web:v1';

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clean(record) {
  const page = record && typeof record.page === 'object' && record.page !== null && Array.isArray(record.page.data) ? record.page : null;
  return {
    lastAttemptAt: finiteOrNull(record?.lastAttemptAt),
    notBefore: finiteOrNull(record?.notBefore),
    fetchedAt: page ? finiteOrNull(record?.fetchedAt) : null,
    page,
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

export function createStore(storage) {
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

  return { load, save };
}

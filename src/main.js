import { LiveTennisAPI } from 'livetennisapi';
import { REFRESH_INTERVAL_MS } from './limits.js';
import { messages } from './messages.js';
import { describeError, nextRefreshAt } from './refresh.js';
import { renderAlert, renderMatches, renderStatus } from './render.js';
import { cleanPage } from './score.js';
import { createStore } from './store.js';

// scripts/build.mjs replaces __LIVETENNISAPI_KEY__ with the key from the
// LIVETENNISAPI_KEY environment variable or the .env file. No key means
// keyless mode.
const API_KEY = typeof __LIVETENNISAPI_KEY__ === 'string' ? __LIVETENNISAPI_KEY__.trim() : '';

// One request returns up to this many live matches.
const PAGE_LIMIT = 100;
const SAMPLE_URL = 'sample/live-matches.json';

const root = document;
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const timeLabel = (ms) => clock.format(new Date(ms));

async function startSample() {
  renderStatus(root, { mode: 'sample', text: messages.sampleStatus });
  root.querySelector('#notice').hidden = false;
  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = cleanPage(await response.json());
    if (!page) throw new Error('The sample file has no list of matches');
    renderMatches(root, page, { mode: 'sample' });
  } catch {
    renderAlert(root, messages.errors.sample);
  }
}

// Every tab of this page takes this lock before it decides whether to call
// the API, so two open tabs never refresh at the same moment. Browsers
// without the Web Locks API run the check directly.
const LOCK_NAME = 'livetennisapi-starter-web:refresh';
async function withLock(task) {
  const locks = globalThis.navigator?.locks;
  if (!locks) return task();
  let ran = false;
  try {
    return await locks.request(LOCK_NAME, () => {
      ran = true;
      return task();
    });
  } catch (error) {
    // A browser that refuses the lock (a sandboxed frame, for one) still gets
    // its refresh, just without the cross-tab guard.
    if (ran) throw error;
    return task();
  }
}

// Some browsers throw just for reading localStorage when site data is
// blocked. The store then keeps its record in memory.
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// The client's own timeout stops at the response headers. This deadline also
// covers reading the body, so a stalled answer can never hold the refresh
// (and the lock every tab shares) for good.
const REQUEST_DEADLINE_MS = 20_000;
function fetchWithDeadline(input, init = {}) {
  const deadline = AbortSignal.timeout(REQUEST_DEADLINE_MS);
  const signal = init.signal && AbortSignal.any ? AbortSignal.any([init.signal, deadline]) : deadline;
  return globalThis.fetch(input, { ...init, signal });
}

function startLive() {
  const client = new LiveTennisAPI({
    apiKey: API_KEY,
    // No retries inside one refresh. A failed refresh waits for the next
    // interval, so one refresh is always exactly one request.
    maxRetries: 0,
    timeout: 15_000,
    // Browsers only allow fetch to be called on window. livetennisapi 1.10.2
    // keeps a detached copy of the global fetch, which the browser rejects
    // with "Illegal invocation", so hand it a wrapper that calls window.fetch.
    fetch: fetchWithDeadline,
  });
  const store = createStore(browserStorage(), API_KEY);
  let timer = null;
  let running = false;
  let shownFetchedAt = null;

  function show(state, next) {
    if (state.page && state.fetchedAt !== shownFetchedAt) {
      shownFetchedAt = state.fetchedAt;
      renderMatches(root, state.page, { mode: 'live' });
    }
    const text = state.fetchedAt ? messages.updated(timeLabel(state.fetchedAt), timeLabel(next)) : messages.waiting(timeLabel(next));
    renderStatus(root, { mode: 'live', text });
    // The problem is saved with the record, so every tab shows the same one
    // and a good answer in any tab clears it everywhere.
    const say = state.problem ? messages.errors[state.problem] : '';
    renderAlert(root, typeof say === 'function' ? say(timeLabel(next)) : say);
  }

  function schedule(at) {
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(0, at - Date.now()));
  }

  function dueAt(state, now) {
    return nextRefreshAt({ now, lastAttemptAt: state.lastAttemptAt, notBefore: state.notBefore, interval: REFRESH_INTERVAL_MS });
  }

  // Runs while this tab holds the lock: calls the API if a refresh is due
  // and the tab is still in view, and saves what came back.
  async function refreshIfDue() {
    const now = Date.now();
    if (document.hidden || dueAt(store.load(), now) > now) return;

    store.save({ lastAttemptAt: now });
    try {
      const page = cleanPage(await client.listMatches({ status: 'live', limit: PAGE_LIMIT }));
      if (!page) throw new Error('The API answer had no list of matches');
      store.save({ fetchedAt: Date.now(), page, notBefore: null, problem: null });
    } catch (error) {
      const problem = describeError(error, Date.now());
      store.save({ notBefore: problem.notBefore, problem: problem.kind });
    }
  }

  async function tick() {
    clearTimeout(timer);
    if (running) return;
    if (document.hidden) {
      renderStatus(root, { mode: 'live', text: messages.paused });
      return;
    }

    running = true;
    try {
      await withLock(refreshIfDue);
    } catch {
      // refreshIfDue saves its own errors. Anything else waits for the next
      // refresh like any failed request.
    } finally {
      running = false;
    }

    const state = store.load();
    const next = dueAt(state, Date.now());
    // Schedule first, so a page that fails to draw still refreshes later.
    schedule(next);
    show(state, next);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  // Another tab saved a newer record: show it here too and follow its timing.
  globalThis.addEventListener('storage', (event) => {
    if (event.key !== store.key || running) return;
    const state = store.load();
    const next = dueAt(state, Date.now());
    schedule(next);
    show(state, next);
  });
  renderStatus(root, { mode: 'live', text: messages.loading });
  tick();
}

if (API_KEY) startLive();
else startSample();

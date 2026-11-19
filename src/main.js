import { LiveTennisAPI } from 'livetennisapi';
import { REFRESH_INTERVAL_MS } from './limits.js';
import { messages } from './messages.js';
import { describeError, nextRefreshAt } from './refresh.js';
import { renderAlert, renderMatches, renderStatus } from './render.js';
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
    renderMatches(root, await response.json(), { mode: 'sample' });
  } catch {
    renderAlert(root, messages.errors.sample);
  }
}

function startLive() {
  const client = new LiveTennisAPI({
    apiKey: API_KEY,
    maxRetries: 1,
    timeout: 15_000,
    // Browsers only allow fetch to be called on window. livetennisapi 1.10.2
    // keeps a detached copy of the global fetch, which the browser rejects
    // with "Illegal invocation", so hand it a wrapper that calls window.fetch.
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  const store = createStore(globalThis.localStorage);
  let timer = null;
  let inFlight = false;
  let stopped = false;
  let shownFetchedAt = null;

  function show(state, next) {
    if (state.page && state.fetchedAt !== shownFetchedAt) {
      shownFetchedAt = state.fetchedAt;
      renderMatches(root, state.page, { mode: 'live', nextLabel: timeLabel(next) });
    }
    const text = state.fetchedAt ? messages.updated(timeLabel(state.fetchedAt), timeLabel(next)) : messages.waiting(timeLabel(next));
    renderStatus(root, { mode: 'live', text });
  }

  function schedule(at) {
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(0, at - Date.now()));
  }

  function dueAt(state, now) {
    return nextRefreshAt({ now, lastAttemptAt: state.lastAttemptAt, notBefore: state.notBefore, interval: REFRESH_INTERVAL_MS });
  }

  async function tick() {
    clearTimeout(timer);
    if (stopped || inFlight) return;
    if (document.hidden) {
      renderStatus(root, { mode: 'live', text: messages.paused });
      return;
    }

    const now = Date.now();
    const before = store.load();
    const due = dueAt(before, now);
    if (due > now) {
      // Fresh data from an earlier load or another tab: show it and wait.
      show(before, due);
      schedule(due);
      return;
    }

    inFlight = true;
    store.save({ lastAttemptAt: now });
    try {
      const page = await client.listMatches({ status: 'live', limit: PAGE_LIMIT });
      store.save({ fetchedAt: Date.now(), page, notBefore: null });
      renderAlert(root, '');
    } catch (error) {
      const info = describeError(error, Date.now());
      if (info.notBefore != null) store.save({ notBefore: info.notBefore });
      const after = store.load();
      const next = dueAt(after, Date.now());
      const say = messages.errors[info.kind];
      renderAlert(root, typeof say === 'function' ? say(timeLabel(next)) : say);
      if (info.stop) {
        stopped = true;
        renderStatus(root, { mode: 'live', text: '' });
        return;
      }
    } finally {
      inFlight = false;
    }

    const after = store.load();
    const next = dueAt(after, Date.now());
    show(after, next);
    schedule(next);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  renderStatus(root, { mode: 'live', text: messages.loading });
  tick();
}

if (API_KEY) startLive();
else startSample();

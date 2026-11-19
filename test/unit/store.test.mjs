import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from '../../src/store.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const page = { data: [{ id: 1 }], meta: { count: 1 } };

test('a saved record is there on the next load', () => {
  const storage = memoryStorage();
  createStore(storage).save({ lastAttemptAt: 10, fetchedAt: 10, page });
  assert.deepEqual(createStore(storage).load(), { lastAttemptAt: 10, notBefore: null, problem: null, fetchedAt: 10, page });
});

test('two tabs share one record, and the newest values win', () => {
  const storage = memoryStorage();
  const tabA = createStore(storage);
  const tabB = createStore(storage);
  tabA.save({ lastAttemptAt: 100, fetchedAt: 100, page });
  assert.equal(tabB.load().lastAttemptAt, 100);
  tabB.save({ lastAttemptAt: 200 });
  assert.equal(tabA.load().lastAttemptAt, 200);
  assert.equal(tabA.load().fetchedAt, 100);
});

test('blocked storage falls back to memory and still remembers the last request', () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
  };
  const store = createStore(blocked);
  store.save({ lastAttemptAt: 42 });
  assert.equal(store.load().lastAttemptAt, 42);
});

test('a failed write never rolls the last request time back', () => {
  const storage = memoryStorage();
  createStore(storage).save({ lastAttemptAt: 100 });
  const store = createStore({ getItem: storage.getItem, setItem: () => { throw new Error('QuotaExceededError'); } });
  store.save({ lastAttemptAt: 500 });
  assert.equal(store.load().lastAttemptAt, 500);
});

test('a time saved by a clock that ran fast is dropped, not waited for', () => {
  const storage = memoryStorage();
  const hoursAhead = Date.now() + 3 * 60 * 60 * 1000;
  storage.setItem(createStore(storage).key, JSON.stringify({ lastAttemptAt: hoursAhead, fetchedAt: hoursAhead, page }));
  const store = createStore(storage);
  assert.deepEqual(store.load(), { lastAttemptAt: null, notBefore: null, problem: null, fetchedAt: null, page: null });
  const now = Date.now();
  store.save({ lastAttemptAt: now });
  assert.equal(createStore(storage).load().lastAttemptAt, now);
});

test('a new API key starts with its own record', () => {
  const storage = memoryStorage();
  createStore(storage, 'twjp_old').save({ lastAttemptAt: 100, notBefore: Date.now() + 3600 * 1000 });
  assert.deepEqual(createStore(storage, 'twjp_new').load(), { lastAttemptAt: null, notBefore: null, problem: null, fetchedAt: null, page: null });
  assert.equal(createStore(storage, 'twjp_old').load().lastAttemptAt, 100);
  assert.notEqual(createStore(storage, 'twjp_old').key, createStore(storage, 'twjp_new').key);
});

test('a clock corrected in an open tab does not leave that tab waiting', () => {
  const realNow = Date.now;
  try {
    const store = createStore(memoryStorage());
    Date.now = () => realNow() + 3 * 60 * 60 * 1000;
    store.save({ lastAttemptAt: Date.now() });
    Date.now = realNow;
    assert.equal(store.load().lastAttemptAt, null);
  } finally {
    Date.now = realNow;
  }
});

test('a hold longer than a day and an hour is dropped', () => {
  const store = createStore(memoryStorage());
  store.save({ notBefore: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  assert.equal(store.load().notBefore, null);
  const tomorrow = Date.now() + 20 * 60 * 60 * 1000;
  store.save({ notBefore: tomorrow });
  assert.equal(store.load().notBefore, tomorrow);
});

test('a good answer in one tab clears the problem in the others', () => {
  const storage = memoryStorage();
  const tabA = createStore(storage);
  const tabB = createStore(storage);
  tabA.save({ lastAttemptAt: 100, problem: 'failed' });
  assert.equal(tabB.load().problem, 'failed');
  tabB.save({ lastAttemptAt: 200, fetchedAt: 200, page, problem: null, notBefore: null });
  assert.equal(tabA.load().problem, null);
  assert.equal(tabA.load().fetchedAt, 200);
});

test('a cached list where no entry survives is dropped', () => {
  const storage = memoryStorage();
  const { key } = createStore(storage);
  storage.setItem(key, JSON.stringify({ lastAttemptAt: 10, fetchedAt: 10, page: { data: [null, 1] } }));
  assert.equal(createStore(storage).load().page, null);
});

test('junk in storage is ignored', () => {
  const storage = memoryStorage();
  const { key } = createStore(storage);
  storage.setItem(key, '{"lastAttemptAt":"soon","page":{"data":"nope"}}');
  assert.deepEqual(createStore(storage).load(), { lastAttemptAt: null, notBefore: null, problem: null, fetchedAt: null, page: null });
  storage.setItem(key, 'not json');
  assert.equal(createStore(storage).load().page, null);
});

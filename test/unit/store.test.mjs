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
  assert.deepEqual(createStore(storage).load(), { lastAttemptAt: 10, notBefore: null, fetchedAt: 10, page });
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

test('junk in storage is ignored', () => {
  const storage = memoryStorage();
  storage.setItem('livetennisapi-starter-web:v1', '{"lastAttemptAt":"soon","page":{"data":"nope"}}');
  assert.deepEqual(createStore(storage).load(), { lastAttemptAt: null, notBefore: null, fetchedAt: null, page: null });
  storage.setItem('livetennisapi-starter-web:v1', 'not json');
  assert.equal(createStore(storage).load().page, null);
});

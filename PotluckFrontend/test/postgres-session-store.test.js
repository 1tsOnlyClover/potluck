import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresSessionStore } from '../postgres-session-store.js';

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

test('stores sessions with their cookie expiry', async () => {
  let query;
  const store = new PostgresSessionStore({
    query: async (...args) => {
      query = args;
      return { rows: [] };
    },
  });
  const sess = { cookie: { expires: '2026-11-21T00:00:00.000Z' }, userId: 7 };

  await callStore(store, 'set', 'session-id', sess);

  assert.match(query[0], /ON CONFLICT \(sid\) DO UPDATE/);
  assert.deepEqual(query[1], ['session-id', sess, new Date(sess.cookie.expires)]);
});

test('retrieves a non-expired session', async () => {
  const sess = { cookie: {}, userId: 7 };
  let query;
  const store = new PostgresSessionStore({
    query: async (...args) => {
      query = args;
      return { rows: [{ sess }] };
    },
  });

  assert.equal(await callStore(store, 'get', 'session-id'), sess);
  assert.match(query[0], /expire > NOW\(\)/);
  assert.deepEqual(query[1], ['session-id']);
});

test('reports database errors to the session callback', async () => {
  const expectedError = new Error('database unavailable');
  const store = new PostgresSessionStore({
    query: async () => {
      throw expectedError;
    },
  });

  await assert.rejects(callStore(store, 'destroy', 'session-id'), expectedError);
});

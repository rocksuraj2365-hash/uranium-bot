'use strict';
const assert = require('node:assert/strict');
const PostgresSessionStore = require('../lib/postgres-session-store');

async function main() {
  const calls = [];
  const expected = { user: { id: '123' }, cookie: { maxAge: 60000 } };
  function sql(strings, ...values) {
    calls.push({ query: strings.join('?'), values });
    if (strings.join('?').includes('SELECT sess')) return Promise.resolve([{ sess: expected }]);
    return Promise.resolve([]);
  }
  sql.json = value => value;
  const store = new PostgresSessionStore(sql);
  await store.init();
  assert.equal(calls.length, 4, 'Initialization creates the schema, session table, index and removes expired rows');
  assert.match(calls[0].query, /CREATE SCHEMA IF NOT EXISTS uranium/);
  await new Promise((resolve, reject) => store.set('session-1', expected, error => error ? reject(error) : resolve()));
  assert.equal(calls.length, 5, 'Session writes are persisted');
  const loaded = await new Promise((resolve, reject) => store.get('session-1', (error, value) => error ? reject(error) : resolve(value)));
  assert.equal(loaded.user.id, '123', 'Session reads return the stored session');
  await new Promise((resolve, reject) => store.touch('session-1', expected, error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => store.destroy('session-1', error => error ? reject(error) : resolve()));
  assert.equal(calls.length, 8, 'Session touch and destroy execute');
  console.log('PostgreSQL session-store smoke checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
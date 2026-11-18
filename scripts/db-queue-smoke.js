'use strict';
const assert = require('node:assert/strict');
const createWriteQueue = require('../lib/write-queue');

async function main() {
  const enqueue = createWriteQueue();
  const order = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const first = enqueue(async () => {
    order.push('first-start');
    await gate;
    order.push('first-end');
  });
  const second = enqueue(async () => { order.push('second'); });
  await Promise.resolve();
  assert.deepEqual(order, ['first-start'], 'A later snapshot must wait for the active write');
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second'], 'Writes must complete in enqueue order');

  const third = enqueue(async () => { throw new Error('simulated storage failure'); });
  const fourth = enqueue(async () => { order.push('after-failure'); return true; });
  await assert.rejects(third, /simulated storage failure/);
  assert.equal(await fourth, true, 'A failed write must not poison the queue');
  assert.equal(order.at(-1), 'after-failure');
  console.log('Serialized database persistence queue checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

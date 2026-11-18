'use strict';

// Serialize persistence operations while allowing a later write to proceed
// even if an earlier write failed. This prevents stale snapshots winning races.
module.exports = function createWriteQueue() {
  let tail = Promise.resolve();
  return function enqueue(write) {
    if (typeof write !== 'function') throw new TypeError('A persistence write callback is required.');
    const result = tail.then(write, write);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
};

'use strict';

const sleep = require('./sleep');

/**
 * A generator function that manages concurrent execution of promises and yields their results or errors.
 * @param {Function} promiseFactory - A function that returns a promise when called.
 * @param {number} want - The total number of promises to execute.
 * @param {number} delay - The delay (in milliseconds) to wait when reaching the concurrency limit.
 * @param {Array} ...args - Additional arguments to pass to the promiseFactory function.
 * @yields {Array} - Yields an array containing either an error or the result of each promise.
 */
async function* whenReady(promiseFunc, want, delay, ...args) {
  let working = 0;        // Number of promises currently executing.
  let out = [];           // Array to store promise results.
  let errors = [];        // Array to store promise errors.
  let sent = 0;           // Number of successful results yielded.
  let sentErrors = 0;     // Number of error results yielded.
  let launched = 0;       // Total promises launched (success + failure).

  // Launch exactly `want` promises total, then drain all results. This
  // guarantees termination even when every promise fails (the old code only
  // counted successes toward `want`, so a failing batch spawned forever).
  while (launched < want) {
    // Yield completed promise results.
    while (sent < out.length) {
      yield [null, out[sent++]];
    }

    // Yield error results.
    while (sentErrors < errors.length) {
      yield [errors[sentErrors++], null];
    }

    // Start a new promise if we haven't launched all of them yet.
    if (launched < want) {
      (async function() {
        try {
          working++;
          launched++;
          let res = await promiseFunc(...args);
          out.push(res);   // Store the result if the promise succeeds.
        } catch (error) {
          errors.push(error);  // Store the error if the promise fails.
        } finally {
          working--;
        }
      })();
    }

    await sleep(delay);
  }

  // Drain any remaining results after all promises have launched.
  while (sent < out.length || sentErrors < errors.length) {
    while (sent < out.length) {
      yield [null, out[sent++]];
    }
    while (sentErrors < errors.length) {
      yield [errors[sentErrors++], null];
    }
    if (working > 0) await sleep(delay);
  }
}


module.exports = whenReady;

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
  let sent = 0;           // Number of promises sent for execution.
  let sentErrors = 0;     // Number of error results sent.

  while (sent < want) {
    // Yield completed promise results.
    while (sent < out.length) {
      yield [null, out[sent++]];
    }

    // Yield error results.
    while (sentErrors < errors.length) {
      yield [errors[sentErrors++], null];
    }

    // Check if we've reached the concurrency limit.
    if (working + out.length + errors.length >= want) {
      if (working + out.length >= want) {
        await sleep(delay);  // Delay if maximum concurrency is reached.
        continue;
      }
    }

    // Start executing a new promise.
    (async function() {
      try {
        working++;
        let res = await promiseFunc(...args);
        out.push(res);   // Store the result if the promise succeeds.
      } catch (error) {
        errors.push(error);  // Store the error if the promise fails.
      } finally {
        working--;
      }
    })();

    await sleep(delay);
  }
}


module.exports = whenReady;

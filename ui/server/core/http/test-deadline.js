// Test support for the http tests (#92), not a test file itself: every wait on a socket event
// settles within DEADLINE_MS, so a missing event fails the test naming what it waited for
// instead of hanging the run.

/** The longest any single wait in the http tests may take. */
export const DEADLINE_MS = 2000;

/** A promise that rejects naming `label` when it has not settled within DEADLINE_MS. On timeout
 * `onTimeout` runs first, so the caller can destroy the request or socket it was waiting on.
 * @template [T=void]
 * @param {string} label
 * @param {(resolve: (value: T) => void, reject: (err: Error) => void) => void} executor
 * @param {() => void} [onTimeout]
 * @returns {Promise<T>} */
export function withDeadline(label, executor, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`timed out after ${DEADLINE_MS} ms waiting for ${label}`));
    }, DEADLINE_MS);
    executor(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

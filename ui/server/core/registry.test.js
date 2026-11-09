// The two session registries: the id-keyed `live` map and the identity-keyed tracked set (issue #60),
// plus the process-wide activity counter. Pure state over hand-built LiveSession objects.
// Static imports HOIST, so the env is set before a dynamic import (config.js resolves a domain at import).
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test } from "node:test";
import assert from "node:assert/strict";
const {
  getLive,
  registerLive,
  dropLive,
  trackSession,
  untrackSession,
  liveSessions,
  nextActivity,
} = await import("./registry.js");

/** @typedef {import("./connection.js").LiveSession} LiveSession */

/** @param {string} id @returns {LiveSession} */
const fakeLs = (id) => /** @type {LiveSession} */ (/** @type {unknown} */ ({ id }));

test("liveSessions returns exactly the tracked sessions; untrack removes one", () => {
  const a = fakeLs("a");
  const b = fakeLs("b");
  trackSession(a);
  trackSession(b);
  assert.deepEqual(new Set(liveSessions()), new Set([a, b]));
  assert.equal(liveSessions().length, 2);
  untrackSession(a);
  assert.deepEqual(liveSessions(), [b]);
  untrackSession(b);
  assert.deepEqual(liveSessions(), []);
});

test("tracking the same session twice holds it once", () => {
  const a = fakeLs("dup");
  trackSession(a);
  trackSession(a);
  assert.deepEqual(liveSessions(), [a]);
  untrackSession(a);
});

test("untracking an unknown session is a no-op", () => {
  const a = fakeLs("known");
  trackSession(a);
  assert.doesNotThrow(() => {
    untrackSession(fakeLs("unknown"));
  });
  assert.deepEqual(liveSessions(), [a]);
  untrackSession(a);
});

test("the tracked set and the live map are independent", () => {
  const a = fakeLs("indep");
  trackSession(a);
  registerLive("indep", a);
  untrackSession(a);
  assert.equal(getLive("indep"), a);
  trackSession(a);
  dropLive("indep");
  assert.deepEqual(liveSessions(), [a]);
  assert.equal(getLive("indep"), undefined);
  untrackSession(a);
});

test("nextActivity starts above 0 and strictly increases", () => {
  let prev = nextActivity();
  assert.ok(Number.isInteger(prev) && prev > 0);
  for (let i = 0; i < 5; i++) {
    const n = nextActivity();
    assert.ok(Number.isInteger(n) && n > prev);
    prev = n;
  }
});

test("liveSessions keeps insertion order regardless of activity stamps", () => {
  const a = fakeLs("first");
  const b = fakeLs("second");
  trackSession(a);
  trackSession(b);
  Object.assign(a, { activitySeq: nextActivity() });
  Object.assign(b, { activitySeq: nextActivity() }); // B is newer; a recency sort would put it first
  assert.deepEqual(liveSessions(), [a, b]);
  untrackSession(a);
  untrackSession(b);
});

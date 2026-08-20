// The quarantine rule, tested without a network or a wall clock — the reason judge() takes
// both as arguments. A fixed `now` also keeps these deterministic forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageDays, judge, judgeAll, bumpCommand, MIN_AGE_DAYS } from "./deps-policy.js";

const NOW = new Date("2026-08-20T12:00:00Z");
/** @param {number} days @returns {string} */
const daysAgo = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

test("age is measured from the publish date", () => {
  assert.equal(ageDays(daysAgo(3), NOW), 3);
  assert.equal(ageDays(null, NOW), null);
  assert.equal(ageDays("not a date", NOW), null);
});

test("a version younger than the quarantine is held", () => {
  const v = judge({ name: "hono", version: "4.13.3", publishedAt: daysAgo(2) }, NOW);
  assert.equal(v.verdict, "hold");
  assert.match(v.reason, /quarantine/);
});

test("a version past the quarantine is ready", () => {
  const v = judge({ name: "ip-address", version: "10.5.0", publishedAt: daysAgo(10) }, NOW);
  assert.equal(v.verdict, "ready");
});

test("the boundary is inclusive — exactly the minimum age passes", () => {
  assert.equal(
    judge({ name: "x", version: "1.0.0", publishedAt: daysAgo(MIN_AGE_DAYS) }, NOW).verdict,
    "ready",
  );
  assert.equal(
    judge({ name: "x", version: "1.0.0", publishedAt: daysAgo(MIN_AGE_DAYS - 0.1) }, NOW).verdict,
    "hold",
  );
});

test("no publish date is NOT permission", () => {
  // An unreachable registry, an unpublished version and a tampered response are
  // indistinguishable here — and every one of them is a reason to wait.
  const v = judge({ name: "ghost", version: "9.9.9", publishedAt: null }, NOW);
  assert.equal(v.verdict, "unknown");
  assert.equal(bumpCommand([v]), "");
});

test("held and unknown sort ahead of ready — decisions first", () => {
  const judged = judgeAll(
    [
      { name: "aged", version: "1.0.0", publishedAt: daysAgo(30) },
      { name: "fresh", version: "2.0.0", publishedAt: daysAgo(1) },
      { name: "mystery", version: "3.0.0", publishedAt: null },
    ],
    NOW,
  );
  assert.deepEqual(
    judged.map((j) => j.verdict),
    ["hold", "unknown", "ready"],
  );
});

test("the bump command carries ONLY the eligible packages", () => {
  const judged = judgeAll(
    [
      { name: "aged", version: "1.0.0", publishedAt: daysAgo(30) },
      { name: "alsoaged", version: "1.0.0", publishedAt: daysAgo(8) },
      { name: "fresh", version: "2.0.0", publishedAt: daysAgo(1) },
    ],
    NOW,
  );
  const cmd = bumpCommand(judged);
  assert.match(cmd, /npm update aged alsoaged --package-lock-only/);
  assert.doesNotMatch(cmd, /fresh/);
});

test("a stricter quarantine can be demanded per call", () => {
  const c = { name: "x", version: "1.0.0", publishedAt: daysAgo(10) };
  assert.equal(judge(c, NOW).verdict, "ready");
  assert.equal(judge(c, NOW, 30).verdict, "hold");
});

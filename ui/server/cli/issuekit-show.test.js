// The digest's SHAPE, tested without gh: an issue node in, the compact view out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { digestOf, capped } from "./issuekit-show.js";

/** @param {string} body @param {string} [login] */
const c = (body, login = "bot") => ({ body, author: { login }, createdAt: "2026-09-01T10:00:00Z" });

const issue = () => ({
  number: 42,
  title: "thing breaks",
  state: "OPEN",
  url: "https://x/42",
  body: "symptom here",
  labels: [{ name: "qa:pass" }, "review:pass"],
  comments: [
    c("## 🔍 Triage — cause A"),
    c("## 🔬 ANALYSIS — v1\nold spec"),
    c("chatter"),
    c("## 🔬 ANALYSIS — REFINED\nnew spec\n\nfiles: a.ts"),
    c("## 🧪 QA — BLOCKED\nqa-blocked-at: 111"),
    c("## 🔎 CODEX REVIEW\nP2: x"),
    c("## 🔎 REVIEW — pass\nreview-verified: abc1234"),
    c("## 🧪 QA — PASS\nqa-verified: abc1234"),
    c("<!-- issuekit:attempt n=1 result=failed -->\ntried X"),
  ],
});

test("digest shows labels, body, the NEWEST comment per lane, both review lanes, attempts flagged", () => {
  const d = digestOf(issue());
  assert.match(d, /^#42 \[OPEN\] thing breaks {2}\{qa:pass, review:pass\}/);
  assert.match(d, /── body ──\n {2}\| symptom here/);
  assert.match(d, /🔬 ANALYSIS \(newest, @bot 2026-09-01; 1 older in lane\)/);
  assert.match(d, /new spec/);
  assert.doesNotMatch(d, /old spec/);
  assert.match(d, /🧪 QA \(newest.*\n {2}\| ## 🧪 QA — PASS/);
  assert.doesNotMatch(d, /qa-blocked-at/);
  assert.match(d, /🔎 REVIEW \(newest/);
  assert.match(d, /🔎 EXTERNAL REVIEW \(newest/);
  assert.match(d, /🚦 PRE-PR — none/);
  assert.match(d, /issuekit attempts \(1\) ──\n {2}⚠ DO-NOT-RETRY @bot/);
  assert.match(
    d,
    /elided: 3 other comment\(s\), \d+ chars — full thread: gh issue view 42 --comments/,
  );
});

test("--lane prints only that lane, no body, no attempts", () => {
  const d = digestOf(issue(), { lane: "qa" });
  assert.match(d, /🧪 QA \(newest/);
  assert.doesNotMatch(d, /── body ──|ANALYSIS|attempts|EXTERNAL/);
  const r = digestOf(issue(), { lane: "review" });
  assert.match(r, /🔎 REVIEW \(newest/);
  assert.match(r, /🔎 EXTERNAL REVIEW \(newest/);
});

test("capped keeps head (40%) and tail (60%) and names the elision; --full lifts it", () => {
  const body = "H".repeat(500) + "M".repeat(500) + "T".repeat(500);
  const out = capped(body, 1000, "fetch-me");
  assert.ok(out.startsWith("H".repeat(400)));
  assert.ok(out.endsWith("T".repeat(500)));
  assert.match(out, /\[… 500 chars elided — full: fetch-me\]/);
  assert.equal(capped(body, 0, "x"), body);
  const big = { ...issue(), comments: [c("## 🔬 ANALYSIS\n" + "x".repeat(9000))] };
  assert.match(digestOf(big, { lane: "analysis" }), /chars elided/);
  assert.doesNotMatch(digestOf(big, { lane: "analysis", full: true }), /chars elided/);
  assert.doesNotMatch(digestOf(big, { lane: "analysis", cap: 20000 }), /chars elided/);
  // the overview caps every lane tighter than the lane's own cap — it answers "where is this issue"
  assert.match(digestOf(big), /\[… 7\d{3} chars elided/);
});

test("an empty thread is a digest too", () => {
  const d = digestOf({ number: 7, title: "t", state: "OPEN", comments: [] });
  assert.match(d, /🔬 ANALYSIS — none/);
  assert.match(d, /issuekit attempts \(0\)/);
  assert.doesNotMatch(d, /elided/);
});

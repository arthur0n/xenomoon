// Record fields (#23): the parser reads the new keys, toRecord normalizes them, fieldProblems
// flags bad shapes. Fake slugs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, setFrontmatterFields } from "./frontmatter.js";
import { toRecord, fieldProblems, OKF_STATUS, RECORD_STATUSES } from "./records.js";

const doc = `---
name: pick-queue
kind: verdicts
description: adopt queue-a: only one with retries
status: amended
supersedes: [old-queue]
amends: [findings/queue-trap, other]
tags: [infra, queue]
date: 2026-10-21
---
# Pick a queue
`;

test("parser reads the new fields, lists as arrays", () => {
  const { data } = parseFrontmatter(doc);
  assert.ok(data);
  assert.equal(data.status, "amended");
  assert.deepEqual(data.supersedes, ["old-queue"]);
  assert.deepEqual(data.amends, ["findings/queue-trap", "other"]);
  assert.deepEqual(data.tags, ["infra", "queue"]);
  assert.equal(data.date, "2026-10-21");
  assert.deepEqual(fieldProblems(data), []);
});

test("empty inline list parses to []", () => {
  const { data } = parseFrontmatter("---\ntags: []\ndescription: x\n---\n");
  assert.deepEqual(data?.tags, []);
});

test("toRecord defaults: status accepted, OKF type/title aliases, folder kind", () => {
  const r = toRecord("some-slug", "findings", { type: "source-list", description: "d" });
  assert.equal(r.kind, "source-list");
  assert.equal(r.title, "some-slug");
  assert.equal(r.status, "accepted");
  assert.deepEqual([r.supersedes, r.amends, r.tags, r.date], [[], [], [], ""]);
  assert.equal(toRecord("s", "findings", {}).kind, "findings");
});

test("fieldProblems flags bad status, date, scalar lists, missing description", () => {
  const p = fieldProblems({ status: "done", date: "21/10/2026", tags: "infra" });
  assert.equal(p.length, 4);
});

test("every status maps to an OKF status", () => {
  for (const s of RECORD_STATUSES) assert.ok(OKF_STATUS[s]);
});

test("setFrontmatterFields replaces, appends, keeps body; adds a block when none", () => {
  const out = setFrontmatterFields(doc, { status: "superseded", supersedes: ["a", "b"], x: "1" });
  const { data, body } = parseFrontmatter(out);
  assert.equal(data?.status, "superseded");
  assert.deepEqual(data?.supersedes, ["a", "b"]);
  assert.equal(data?.x, "1");
  assert.equal(body, "# Pick a queue\n");
  const fresh = parseFrontmatter(setFrontmatterFields("# T\n", { description: "d" }));
  assert.equal(fresh.data?.description, "d");
  assert.equal(fresh.body, "# T\n");
});

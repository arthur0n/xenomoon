// The label decision, tested against label sets two REAL projects actually had. The drift in
// these fixtures is not invented: it is what `gh label list` returned on each, anonymised.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffLabels,
  printLabelReport,
  PIPELINE_LABELS,
  ISSUEKIT_LABELS,
} from "./issuekit-labels.js";

/** @param {[string, string, string][]} rows */
const repo = (rows) =>
  new Map(rows.map(([name, color, description]) => [name, { name, color, description }]));

// A project that ran the full pipeline — and still carries `analyzed` from the stage that was
// split into triage + solution.
const FULL_PIPELINE = repo([
  ["triaged", "0E8A16", "Investigated by bug-triage"],
  ["needs-info", "5319E7", "Needs more from reporter"],
  ["solution-ready", "1D76DB", "Senior-dev handoff posted"],
  ["implemented", "0075ca", "Fix implemented, pending QA/commit"],
  ["qa:pass", "0e8a16", "QA gate passed"],
  ["qa:blocked", "D93F0B", "QA gate: blocked, needs fix before commit"],
  ["review:pass", "0E8A16", "Adversarial review passed"],
  ["review:changes", "D93F0B", "Adversarial review found a concrete hole; loop back to /implement"],
  ["committed", "5319E7", "Fix committed, pending push/deploy"],
  ["fixed-pending-deploy", "C2E0C6", "Fixed; auto-closes on deploy"],
  ["sev:critical", "B60205", ""],
  ["sev:high", "D93F0B", ""],
  ["sev:medium", "FBCA04", ""],
  ["sev:low", "C5DEF5", ""],
  ["analyzed", "0E8A16", "Analyst ANALYSIS posted"],
]);

// A project whose pack shipped no review or commit stage: those labels never existed, and it
// grew its own `codex:*-pass` pair instead — an external review used as if it were a verdict.
const NO_REVIEW_STAGE = repo([
  ["triaged", "0E8A16", "Bug-triage agent has investigated this issue"],
  ["needs-info", "FBCA04", "Can't reproduce from the report; waiting on the reporter"],
  ["solution-ready", "0E8A16", "Senior-dev review done; fix is designed and handed off"],
  ["qa:pass", "2DA44E", "QA verified — deploy allowed"],
  ["qa:blocked", "CF222E", "QA failed or regression coverage missing — deploy blocked"],
  ["fixed-pending-deploy", "C2E0C6", ""],
  ["sev:critical", "B60205", "Crash on launch, data loss, auth broken — blocks everyone"],
  ["sev:high", "D93F0B", "Core flow broken with no workaround (sign-in, upload)"],
  ["sev:medium", "FBCA04", "Broken with a workaround, or affects a subset of users"],
  ["sev:low", "C2E0C6", "Cosmetic, minor, or rare edge case"],
  ["codex:solution-pass", "8250DF", "Codex adversarial review passed at the /solution stage"],
  [
    "codex:implementation-pass",
    "8250DF",
    "Codex adversarial review passed at the /implement stage",
  ],
]);

test("a repo missing half the pipeline gets exactly those labels created", () => {
  const { missing, present } = diffLabels(NO_REVIEW_STAGE, PIPELINE_LABELS);
  const names = missing.map((s) => s.name);
  // this project never ran a review or commit stage, so those labels do not exist there
  assert.deepEqual(names, ["implemented", "review:pass", "review:changes", "committed"]);
  assert.ok(
    present.includes("qa:pass"),
    "labels it already has are reported present, not recreated",
  );
});

test("an existing label is never rewritten — its wording is the project's", () => {
  const { missing, drift } = diffLabels(NO_REVIEW_STAGE, PIPELINE_LABELS);
  assert.ok(!missing.some((s) => s.name === "qa:pass"), "present label is not queued for creation");
  const qa = drift.filter((d) => d.name === "qa:pass");
  // its qa:pass is a different colour AND a different description — both reported, neither fixed
  assert.equal(qa.length, 2);
  assert.ok(qa.some((d) => d.have === "#2DA44E" && d.want === "#0E8A16"));
  assert.ok(qa.some((d) => d.have.startsWith("QA verified")));
});

test("colour comparison ignores hex case", () => {
  // one repo writes qa:pass lowercase and review:pass uppercase — same colour, no drift either way
  const { drift } = diffLabels(FULL_PIPELINE, PIPELINE_LABELS);
  assert.ok(!drift.some((d) => d.name === "qa:pass" && d.have.startsWith("#0e8a16")));
});

test("an empty description is not drift — GitHub returns '' for a label created without one", () => {
  const { drift } = diffLabels(FULL_PIPELINE, PIPELINE_LABELS);
  assert.ok(!drift.some((d) => d.name === "sev:critical" && d.have === ""));
});

test("retired labels are reported per repo, and never queued for deletion", () => {
  const lex = diffLabels(FULL_PIPELINE, PIPELINE_LABELS);
  assert.deepEqual(
    lex.retired.map((r) => r.name),
    ["analyzed"],
  );
  const mag = diffLabels(NO_REVIEW_STAGE, PIPELINE_LABELS);
  assert.deepEqual(
    mag.retired.map((r) => r.name),
    ["codex:solution-pass", "codex:implementation-pass"],
  );
  assert.ok(
    mag.retired.every((r) => r.why),
    "each retired label says WHY, so the migration is decidable",
  );
});

test("a fresh repo gets the whole vocabulary, once", () => {
  const { missing, present, drift, retired } = diffLabels(new Map(), [
    ...PIPELINE_LABELS,
    ...ISSUEKIT_LABELS,
  ]);
  assert.equal(missing.length, PIPELINE_LABELS.length + ISSUEKIT_LABELS.length);
  assert.deepEqual([present, drift, retired], [[], [], []]);
  assert.deepEqual(diffLabels(new Map(), PIPELINE_LABELS).collisions, []);
  assert.equal(new Set(missing.map((s) => s.name)).size, missing.length, "no duplicate names");
});

test("every canonical label has a colour GitHub will accept and a description", () => {
  for (const spec of [...PIPELINE_LABELS, ...ISSUEKIT_LABELS]) {
    assert.match(spec.color, /^[0-9A-Fa-f]{6}$/, `${spec.name} colour must be a bare 6-digit hex`);
    assert.ok(spec.description.length > 10, `${spec.name} needs a description worth reading`);
  }
});

test("a label differing only by CASE is blocking, never 'missing'", () => {
  // The worst state: `gh label create qa:pass` fails (GitHub compares case-insensitively) while
  // every gate matching the exact string `qa:pass` sees nothing at all.
  const shouty = repo([["QA:Pass", "0E8A16", "QA gate passed"]]);
  const { missing, collisions } = diffLabels(shouty, PIPELINE_LABELS);
  assert.ok(
    !missing.some((s) => s.name === "qa:pass"),
    "must not be queued for a create that cannot succeed",
  );
  assert.deepEqual(collisions, [{ name: "qa:pass", existing: "QA:Pass" }]);
});

test("printLabelReport says NOT ok when anything blocking is present", () => {
  const base = { created: [], present: [], drift: [], retired: [], collisions: [], failed: [] };
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(printLabelReport({ ...base }), true, "clean report is ok");
    assert.equal(
      printLabelReport({ ...base, drift: [{ name: "qa:pass", have: "#1", want: "#2" }] }),
      true,
      "colour drift is reported but does not block — the name is what gates match",
    );
    assert.equal(
      printLabelReport({ ...base, retired: [{ name: "analyzed", why: "…" }] }),
      true,
      "a retired label is a migration to decide, not a broken install",
    );
    assert.equal(
      printLabelReport({ ...base, collisions: [{ name: "qa:pass", existing: "QA:Pass" }] }),
      false,
    );
    assert.equal(printLabelReport({ ...base, failed: [{ name: "committed", err: "403" }] }), false);
  } finally {
    console.log = log;
  }
});

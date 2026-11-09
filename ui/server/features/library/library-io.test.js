// library-io (#73): strict is the default — it adds legacy-field and body problems and checks
// unindexed folders that hold record files; `{ strict: false }` keeps the old lenient reading.
// Fixtures live in a temp dir only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLibrary, syncIndex, checkRoots } from "./library-io.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "library-io-test-"));
after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Write files under a new root, then fill each existing index.md from its records. @param {string} name @param {Record<string, string>} files */
function fixture(name, files) {
  const root = path.join(tmp, name);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  for (const kd of readLibrary(root)) syncIndex(kd, true);
  return root;
}

const legacy = `---
name: Pick queue
kind: verdicts
status: accepted
date: 2026-01-01
description: d
---
# Pick queue

Text.
`;

const mixed = fixture("mixed", {
  "verdicts/index.md": "# Verdicts\n",
  "verdicts/pick-queue.md": legacy,
  "sources/list.md": "Free-form source list.\n",
});

test("non-strict: legacy record and unindexed free-form folder → zero errors; bodies readable", () => {
  const res = checkRoots([mixed], false, { strict: false });
  assert.deepEqual(res.errors, []);
  assert.equal(res.indexes, 1);
  const kinds = readLibrary(mixed, { strict: false });
  const v = kinds.find((k) => k.kind === "verdicts");
  const s = kinds.find((k) => k.kind === "sources");
  assert.equal(v?.bodies.get("pick-queue"), "# Pick queue\n\nText.\n");
  assert.equal(s?.bodies.get("list"), "Free-form source list.\n");
  assert.deepEqual(v?.problems, []);
});

test("default is strict: a legacy record under the default call reports legacy fields", () => {
  const r = `${mixed}/verdicts/pick-queue.md`;
  assert.ok(checkRoots([mixed], false).errors.includes(`${r}: legacy field \`name\``));
  const v = readLibrary(mixed).find((k) => k.kind === "verdicts");
  assert.ok(
    v?.problems.includes("verdicts/pick-queue.md: legacy field `name`"),
    v?.problems.join("\n"),
  );
});

test("strict: missing index, legacy fields and body problems are reported", () => {
  const { errors } = checkRoots([mixed], false, { strict: true });
  const r = `${mixed}/verdicts/pick-queue.md`;
  for (const want of [
    `${mixed}/sources/index.md is missing`,
    `${mixed}/sources/list.md: no frontmatter`,
    `${r}: legacy field \`name\``,
    `${r}: legacy field \`kind\``,
    `${r}: legacy field \`date\``,
    `${r}: legacy field status \`accepted\``,
    `${r}: missing \`generated\``,
    `${r}: H1 heading \`# Pick queue\` is not allowed`,
    `${r}: missing \`## Why\``,
  ])
    assert.ok(errors.includes(want), `missing error: ${want}\n${errors.join("\n")}`);
});

test("strict: a folder with only index.md, or no record file, is not a missing-index error", () => {
  const root = fixture("empty", {
    "verdicts/index.md": "# Verdicts\n",
    "notes/index.md": "# N\n",
    "assets/readme.txt": "not a record\n",
  });
  assert.deepEqual(checkRoots([root], false, { strict: true }).errors, []);
});

test("strict: a conforming record → zero errors", () => {
  const lines = (/** @type {string} */ p, /** @type {number} */ k) =>
    Array.from({ length: k }, (_, i) => `${p}${i + 1}`).join("\n");
  const body = `Decision.\n\n## Context\n${lines("c", 4)}\n## Why\n${lines("w", 3)}\n## Rejected\n${lines("r", 5)}\n## Consequences\n${lines("k", 3)}\n`;
  const root = fixture("good", {
    "verdicts/index.md": "# Verdicts\n",
    "verdicts/pick-queue.md": `---
type: verdicts
title: Pick queue
description: d
status: stable
generated: { by: human:x, at: 2026-11-07T10:00:00+00:00 }
---
${body}`,
  });
  const res = checkRoots([root], false, { strict: true });
  assert.deepEqual(res.errors, []);
  assert.equal(res.records, 1);
});

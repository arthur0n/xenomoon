// The label gate's RULES, tested without a tree to scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanText, buildMatchers } from "./check-labels.js";

/** @param {string[]} canonical @param {[string, string][]} retired */
const rules = (canonical, retired) => ({
  canonical: new Set(canonical),
  retiredWhy: new Map(retired),
  ...buildMatchers(retired.map(([name]) => name)),
});

const BASE = rules(
  ["qa:pass", "qa:blocked", "review:pass", "sev:high"],
  [["analyzed", "the fused stage was split"]],
);

test("a CORE-family label outside the canonical set fails, with file:line", () => {
  const hits = scanText("apply `qa:verified` when green\n", "docs/X.md", BASE);
  assert.equal(hits.length, 1);
  assert.match(hits[0] ?? "", /^docs\/X\.md:1 /);
  assert.match(hits[0] ?? "", /qa:verified/);
});

test("canonical labels pass, including several on one line", () => {
  assert.deepEqual(scanText("needs `qa:pass` + `review:pass`, never `sev:high`", "a.md", BASE), []);
});

test("a retired label is caught as a whole word only", () => {
  assert.equal(scanText("the `analyzed` label is gone", "a.md", BASE).length, 1);
  // ordinary prose that merely contains the word must not fire
  assert.deepEqual(scanText("the analyzed-elsewhere note and reanalyzed data", "a.md", BASE), []);
});

test("retired names are matched as LITERALS, not patterns", () => {
  // A future retired label carrying regex metacharacters must neither crash the gate nor
  // silently match the wrong thing — the alternation is escaped.
  const meta = rules(
    ["qa:pass"],
    [
      ["codex:solution-pass", "external review is evidence"],
      ["c++legacy", "gone"],
    ],
  );
  assert.equal(scanText("still stamps codex:solution-pass here", "a.md", meta).length, 1);
  assert.equal(scanText("the c++legacy label", "a.md", meta).length, 1);
  // `c.legacy` would match if `+` had been treated as a quantifier
  assert.deepEqual(scanText("c.legacy is unrelated", "a.md", meta), []);
});

test("slash commands in the codex: namespace are not labels", () => {
  assert.deepEqual(scanText("run `/codex:review` and `/codex:setup`", "a.md", BASE), []);
});

test("pack-owned families are left alone", () => {
  assert.deepEqual(scanText("report `uat:pass` / `uat:blocked` / `uat:fail`", "a.md", BASE), []);
  assert.deepEqual(scanText("apply needs-deploy and needs-migration", "a.md", BASE), []);
});

test("the same violation on many lines is reported per line", () => {
  const hits = scanText("`qa:done`\nfine\n`qa:done` again", "a.md", BASE);
  assert.deepEqual(
    hits.map((h) => h.split(" ")[0]),
    ["a.md:1", "a.md:3"],
  );
});

test("a canonical PREFIX inside a longer label does not pass as canonical", () => {
  // `[a-z-]*` used to stop at the canonical prefix and approve the whole thing.
  for (const bad of ["qa:pass2", "qa:pass_v2", "review:changes.old", "sev:high9"]) {
    const hits = scanText(`apply \`${bad}\` here`, "a.md", BASE);
    assert.equal(hits.length, 1, `${bad} must be reported`);
    assert.match(hits[0] ?? "", new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("a sentence-ending period is not part of the label", () => {
  assert.deepEqual(scanText("stamp `qa:pass`. Then stop.\nor qa:pass.", "a.md", BASE), []);
});

test("a slash-bearing label is a DIFFERENT label, not a canonical prefix", () => {
  // GitHub allows `/` in a label name, so `qa:pass/foo` is its own label — the gates that grep
  // `qa:pass` would never see it.
  const hits = scanText("stamp `qa:pass/foo`", "a.md", BASE);
  assert.equal(hits.length, 1);
  assert.match(hits[0] ?? "", /qa:pass\/foo/);
});

test("a case variant of a canonical label fails — the gates compare exactly", () => {
  for (const bad of ["QA:pass", "Review:Pass", "SEV:high"]) {
    assert.equal(scanText(`apply \`${bad}\``, "a.md", BASE).length, 1, `${bad} must be reported`);
  }
  assert.deepEqual(
    scanText("apply `qa:pass`", "a.md", BASE),
    [],
    "the canonical form still passes",
  );
});

test("a slash between two CORE labels is prose, not one label", () => {
  // `qa:pass/review:pass` appears in the framework's own hooks, meaning "both of these".
  assert.deepEqual(scanText("re-derives qa:pass/review:pass AND their SHAs", "a.sh", BASE), []);
});

test("punctuation the tokenizer never heard of cannot smuggle a canonical prefix", () => {
  // The boundary is defined by EXCLUSION, so a character nobody thought to allow still ends up
  // inside the token rather than truncating it to the canonical prefix.
  for (const bad of ["qa:pass+foo", "qa:pass=x", "qa:pass@v2", "qa:pass#1", "review:pass~old"]) {
    const hits = scanText(`apply \`${bad}\``, "a.md", BASE);
    assert.equal(hits.length, 1, `${bad} must be reported, not truncated to its canonical prefix`);
  }
});

test("ordinary punctuation around a canonical label still reads as the label", () => {
  for (const good of [
    "use `qa:pass`,",
    "(qa:pass)",
    "[qa:pass]",
    "apply qa:pass; then stop",
    "**qa:pass**",
    "'qa:pass'",
    "qa:pass\n",
  ])
    assert.deepEqual(scanText(good, "a.md", BASE), [], `${JSON.stringify(good)} must be clean`);
});

test("a family mention is not a label reference", () => {
  // The framework's own prose says `qa:*` / `sev:*` and writes `**QA:**` headings.
  for (const prose of ["applies `qa:*` and `review:*`", "scores `sev:*`", "**QA:** the verdict"])
    assert.deepEqual(scanText(prose, "a.md", BASE), [], `${prose} must be clean`);
});

test("a star is emphasis or part of the label, depending on what follows", () => {
  assert.deepEqual(scanText("**qa:pass** stays clean", "a.md", BASE), []);
  assert.deepEqual(scanText("*qa:pass* too", "a.md", BASE), []);
  assert.deepEqual(scanText("the `qa:*` family", "a.md", BASE), []);
  assert.equal(
    scanText("stamp `qa:pass*foo`", "a.md", BASE).length,
    1,
    "glob-like suffix is a different label",
  );
  assert.equal(
    scanText("stamp `qa:*foo`", "a.md", BASE).length,
    1,
    "a globbed name is not canonical",
  );
});

test("punctuation cannot truncate a token when more of the literal follows", () => {
  for (const bad of [
    "qa:pass..old",
    "qa:pass,+old",
    "qa:pass**/old",
    "qa:pass-v2",
    "qa:pass:extra",
  ])
    assert.equal(
      scanText(`see \`${bad}\``, "a.md", BASE).length,
      1,
      `${bad} must be reported whole`,
    );
});

test("a template placeholder is a family mention, not a label", () => {
  // The skills' verdict templates write `sev:<level>` and `area:<area>`.
  assert.deepEqual(scanText("**SEVERITY:** sev:<level> · **AREA:** area:<area>", "a.md", BASE), []);
});

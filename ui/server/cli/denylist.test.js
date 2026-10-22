// The local denylist loader: format, sources, and the whole-word matcher every name check uses.
// Terms here are obviously fake — a real list never enters the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseDenylist, loadDenylist, findTerms, addedLines } from "./denylist.js";

const dir = mkdtempSync(path.join(tmpdir(), "denylist-test-"));

test("one term per line, # comments, blanks ignored, lowercased, deduped", () => {
  const text = "# clients\nAcme-Fake\n\n  globex-fake  # trailing note\nacme-fake\n";
  assert.deepEqual(parseDenylist(text), ["acme-fake", "globex-fake"]);
});

test("commas split too, so one env var can carry a list", () => {
  assert.deepEqual(parseDenylist("acme-fake, globex-fake\ninitech-fake"), [
    "acme-fake",
    "globex-fake",
    "initech-fake",
  ]);
});

test("file and env var merge; the default file is optional", () => {
  const file = path.join(dir, "list.txt");
  writeFileSync(file, "acme-fake\n");
  const got = loadDenylist({ XENOMOON_DENYLIST: file, XENOMOON_DENYLIST_TERMS: "globex-fake" });
  assert.deepEqual(got.terms, ["acme-fake", "globex-fake"]);
  assert.deepEqual(got.sources, [file, "XENOMOON_DENYLIST_TERMS"]);
  assert.deepEqual(loadDenylist({ HOME: dir }).terms, [], "no ~/.xenomoon/denylist.txt is fine");
});

test("an explicit path that does not exist is a misconfiguration, not an empty list", () => {
  assert.throws(
    () => loadDenylist({ XENOMOON_DENYLIST: path.join(dir, "missing.txt") }),
    /does not exist/,
  );
});

test("matching is whole-word and case-insensitive", () => {
  const terms = ["acme-fake"];
  assert.equal(findTerms("see ACME-FAKE docs", "a.md", terms).length, 1);
  assert.equal(findTerms("path/acme-fake.md", "a.md", terms).length, 1);
  assert.equal(findTerms("acme-faker is someone else", "a.md", terms).length, 0);
  assert.deepEqual(findTerms("x\ny acme-fake", "a.md", terms)[0]?.line, 2);
});

test("addedLines keeps added content and paths, never removed lines or deleted paths", () => {
  const patch = [
    "diff --git a/n.md b/n.md",
    "--- a/n.md",
    "+++ b/n.md",
    "@@ -1 +1 @@",
    "-old acme-fake",
    "+new text",
    "++++ content that looks like a header",
    "diff --git a/gone-acme-fake.md b/gone-acme-fake.md",
    "deleted file mode 100644",
    "--- a/gone-acme-fake.md",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-bye",
  ].join("\n");
  const got = addedLines(patch);
  assert.deepEqual([...got.keys()], ["n.md"]);
  assert.deepEqual(got.get("n.md"), ["n.md", "new text", "+++ content that looks like a header"]);
});

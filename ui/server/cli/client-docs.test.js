// Client docs generator (#48): only `audience: client` records that are accepted or amended
// reach the output; the output never lands inside the repo. Fake records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outProblem, selectClientDocs, writeClientDocs } from "./client-docs.js";

const CLI = fileURLToPath(new URL("./client-docs.js", import.meta.url));

/** A fake library: one record per case. @returns {string} the library root */
function fakeLibrary() {
  const root = mkdtempSync(path.join(tmpdir(), "client-docs-lib-"));
  const dir = path.join(root, "verdicts");
  mkdirSync(dir);
  /** @param {string} slug @param {string} extra */
  const rec = (slug, extra) => {
    writeFileSync(
      path.join(dir, `${slug}.md`),
      `---\nname: ${slug}\ndescription: verdict ${slug}\n${extra}---\n# ${slug}\n\nBody of ${slug}.\n`,
    );
  };
  rec("shared-ok", "audience: client\n");
  rec("shared-amended", "audience: client\nstatus: amended\n");
  rec("shared-old", "audience: client\nstatus: superseded\n");
  rec("shared-draft", "audience: client\nstatus: proposed\n");
  rec("internal-one", "");
  writeFileSync(path.join(dir, "index.md"), "# verdicts — index\n");
  return root;
}

test("selectClientDocs keeps client + accepted/amended, nothing else", () => {
  const files = selectClientDocs(fakeLibrary()).map((d) => d.file);
  assert.deepEqual(files, ["verdicts/shared-amended.md", "verdicts/shared-ok.md"]);
});

test("writeClientDocs writes bodies without frontmatter plus an index", () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), "client-docs-out-")), "site");
  writeClientDocs(fakeLibrary(), out);
  const page = readFileSync(path.join(out, "verdicts", "shared-ok.md"), "utf8");
  assert.equal(page, "# shared-ok\n\nBody of shared-ok.\n");
  const index = readFileSync(path.join(out, "index.md"), "utf8");
  assert.ok(index.includes("- [shared-ok](verdicts/shared-ok.md) — verdict shared-ok"));
  assert.ok(!index.includes("shared-old") && !index.includes("internal-one"));
  assert.ok(!existsSync(path.join(out, "verdicts", "shared-old.md")));
});

test("outProblem refuses the repo and a non-empty folder", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "client-docs-repo-"));
  assert.match(outProblem(repo, repo), /inside the framework repo/);
  assert.match(outProblem(path.join(repo, "out"), repo), /inside the framework repo/);
  const full = mkdtempSync(path.join(tmpdir(), "client-docs-full-"));
  writeFileSync(path.join(full, "x.md"), "x");
  assert.match(outProblem(full, repo), /not empty/);
  assert.equal(outProblem(path.join(full, "..", "client-docs-new"), repo), "");
});

test("CLI: --out is required; a run inside the repo exits non-zero", () => {
  assert.throws(() => execFileSync("node", [CLI], { stdio: "pipe" }));
  const inside = path.join(path.dirname(CLI), "client-docs-out");
  assert.throws(() => execFileSync("node", [CLI, "--out", inside], { stdio: "pipe" }));
  assert.ok(!existsSync(inside));
});

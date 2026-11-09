// Client docs generator (#48): only `audience: client` records whose status is stable (absent
// counts as stable) reach the output; the output never lands inside the repo. Fake records only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outProblem, scanClientDocs, selectClientDocs, writeClientDocs } from "./client-docs.js";

/** Run the CLI with an empty install registry and no local denylist file, so only --deny and
 * the given env terms count. @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
const run = (args, env = {}) => {
  const { XENOMOON_DENYLIST: _f, XENOMOON_DENYLIST_TERMS: _t, ...base } = process.env;
  return execFileSync("node", [CLI, ...args], {
    stdio: "pipe",
    env: {
      ...base,
      HOME: mkdtempSync(path.join(tmpdir(), "client-docs-home-")),
      XENOMOON_REGISTRY: path.join(tmpdir(), "client-docs-no-registry.json"),
      ...env,
    },
  });
};

const CLI = fileURLToPath(new URL("./client-docs.js", import.meta.url));

/** One record in the #73 shape. @param {string} slug @param {string} extra @param {string} [body] */
const record = (slug, extra, body = `Decision of ${slug}.\n\n## Why\n\nWhy of ${slug}.\n`) =>
  `---\ntype: verdicts\ntitle: ${slug}\ndescription: verdict ${slug}\n${extra}generated: { by: human:test, at: 2026-11-07T10:00:00Z }\n---\n${body}`;

/** A fake library: one record per case. @returns {string} the library root */
function fakeLibrary() {
  const root = mkdtempSync(path.join(tmpdir(), "client-docs-lib-"));
  const dir = path.join(root, "verdicts");
  mkdirSync(dir);
  /** @param {string} slug @param {string} extra */
  const rec = (slug, extra) => {
    writeFileSync(path.join(dir, `${slug}.md`), record(slug, extra));
  };
  rec("shared-ok", "audience: client\n");
  rec("shared-stable", "audience: client\nstatus: stable\n");
  rec("shared-old", "audience: client\nstatus: deprecated\n");
  rec("shared-draft", "audience: client\nstatus: draft\n");
  rec("internal-one", "");
  writeFileSync(path.join(dir, "index.md"), "# verdicts — index\n");
  return root;
}

test("selectClientDocs keeps client + stable (absent or explicit); drops deprecated, draft, internal", () => {
  const files = selectClientDocs(fakeLibrary()).map((d) => d.file);
  assert.deepEqual(files, ["verdicts/shared-ok.md", "verdicts/shared-stable.md"]);
});

test("writeClientDocs writes bodies without frontmatter plus an index", () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), "client-docs-out-")), "site");
  writeClientDocs(fakeLibrary(), out);
  const page = readFileSync(path.join(out, "verdicts", "shared-ok.md"), "utf8");
  assert.equal(page, "Decision of shared-ok.\n\n## Why\n\nWhy of shared-ok.\n");
  const index = readFileSync(path.join(out, "index.md"), "utf8");
  assert.ok(index.includes("- [shared-ok](verdicts/shared-ok.md) — verdict shared-ok"));
  for (const gone of ["shared-old", "shared-draft", "internal-one"]) {
    assert.ok(!index.includes(gone), gone);
    assert.ok(!existsSync(path.join(out, "verdicts", `${gone}.md`)), gone);
  }
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

test("scanClientDocs finds a planted term in the output; clean output passes (#49)", () => {
  const root = fakeLibrary();
  writeFileSync(
    path.join(root, "verdicts", "shared-ok.md"),
    record("shared-ok", "audience: client\n", "Built for Acme-Fake last spring.\n\n## Why\n\nW.\n"),
  );
  const out = path.join(mkdtempSync(path.join(tmpdir(), "client-docs-scan-")), "site");
  writeClientDocs(root, out);
  const hits = scanClientDocs(out, ["acme-fake"]);
  assert.deepEqual(
    hits.map((h) => [h.file, h.match]),
    [[path.join("verdicts", "shared-ok.md"), "acme-fake"]],
  );
  assert.deepEqual(scanClientDocs(out, ["other-fake"]), []);
});

test("CLI exits non-zero on a planted term, zero when clean (#49)", () => {
  const root = fakeLibrary();
  writeFileSync(
    path.join(root, "verdicts", "shared-stable.md"),
    record(
      "shared-stable",
      "audience: client\nstatus: stable\n",
      "acme-fake inside.\n\n## Why\n\nW.\n",
    ),
  );
  const base = mkdtempSync(path.join(tmpdir(), "client-docs-cli-"));
  assert.throws(
    () => run(["--root", root, "--out", path.join(base, "a"), "--deny", "acme-fake"]),
    (/** @type {{ status?: number, stderr?: Buffer }} */ e) =>
      e.status === 1 && String(e.stderr).includes("acme-fake"),
  );
  assert.match(
    String(run(["--root", root, "--out", path.join(base, "b")])),
    /ok {2}client-docs: 2/,
  );
});

test("CLI reads the local denylist: an XENOMOON_DENYLIST_TERMS term fails the run (#56)", () => {
  const root = fakeLibrary();
  writeFileSync(
    path.join(root, "verdicts", "shared-ok.md"),
    record("shared-ok", "audience: client\n", "Made for acme-fake.\n\n## Why\n\nW.\n"),
  );
  const base = mkdtempSync(path.join(tmpdir(), "client-docs-deny-"));
  assert.throws(
    () =>
      run(["--root", root, "--out", path.join(base, "a")], {
        XENOMOON_DENYLIST_TERMS: "acme-fake",
      }),
    (/** @type {{ status?: number, stderr?: Buffer }} */ e) =>
      e.status === 1 && String(e.stderr).includes("acme-fake"),
  );
  assert.match(
    String(run(["--root", root, "--out", path.join(base, "b")])),
    /ok {2}client-docs: 2/,
  );
});

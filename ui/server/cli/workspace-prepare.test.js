// workspace-prepare (#38) against LOCAL bare repos only — no network. Fake names only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plan, applyPlan } from "./workspace-prepare.js";
import { readManifest } from "../../lib/workspace.js";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "workspace-prepare.js");

/** @param {string[]} args @returns {string} */
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Two bare source repos + a manifest pointing at them. */
function stack() {
  const tmp = mkdtempSync(path.join(tmpdir(), "wsp-"));
  const repos = ["acme-api", "acme-web"].map((name) => {
    const work = path.join(tmp, "work", name);
    mkdirSync(work, { recursive: true });
    git(["-C", work, "init", "--quiet", "--initial-branch", "main"]);
    git([
      "-C",
      work,
      "-c",
      "user.email=dev@example.com",
      "-c",
      "user.name=dev",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "init",
    ]);
    const bare = path.join(tmp, "src", `${name}.git`);
    git(["clone", "--quiet", "--bare", work, bare]);
    return { name, path: name === "acme-web" ? "apps/acme-web" : name, remote: bare };
  });
  const manifest = path.join(tmp, "workspace.json");
  writeFileSync(manifest, JSON.stringify({ version: 1, repos }));
  return {
    tmp,
    manifest,
    repos,
    target: path.join(tmp, "client"),
    base: path.join(tmp, "newbase"),
  };
}

test("dry-run (the default) prints the plan and changes nothing", () => {
  const s = stack();
  const r = spawnSync(
    "node",
    [CLI, "--manifest", s.manifest, "--target", s.target, "--base", s.base],
    {
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY-RUN — 2 repos/);
  assert.match(
    r.stdout,
    /acme-web: clone .*acme-web\.git → .*apps\/acme-web; origin=.*newbase\/acme-web\.git/,
  );
  assert.equal(existsSync(s.target), false);
});

test("--apply clones each repo, origin → new base, source kept as upstream, manifest written", () => {
  const s = stack();
  const r = spawnSync(
    "node",
    [CLI, "--manifest", s.manifest, "--target", s.target, "--base", `${s.base}/`, "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const web = path.join(s.target, "apps", "acme-web");
  assert.equal(git(["-C", web, "remote", "get-url", "origin"]), path.join(s.base, "acme-web.git"));
  assert.equal(git(["-C", web, "remote", "get-url", "upstream"]), s.repos[1]?.remote);
  assert.equal(git(["-C", path.join(s.target, "acme-api"), "log", "-1", "--format=%s"]), "init");
  const m = readManifest(path.join(s.target, ".xenomoon", "workspace.json"));
  assert.deepEqual(m.repos[0], {
    name: "acme-api",
    path: "acme-api",
    remote: path.join(s.base, "acme-api.git"),
    upstream: s.repos[0]?.remote,
  });
});

test("refusals stop everything before any clone", () => {
  const s = stack();
  mkdirSync(path.join(s.target, "acme-api"), { recursive: true });
  writeFileSync(path.join(s.target, "acme-api", "keep.txt"), "x");
  const m = readManifest(s.manifest);
  const p = plan(m, s.target, s.base);
  assert.match(p.refusals.join("|"), /acme-api already exists/);
  const r = spawnSync(
    "node",
    [CLI, "--manifest", s.manifest, "--target", s.target, "--base", s.base, "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  assert.equal(existsSync(path.join(s.target, "apps")), false, "nothing cloned");
  assert.match(
    plan(m, path.join(s.tmp, "fw", "x"), s.base, path.join(s.tmp, "fw")).refusals[0] ?? "",
    /inside the framework repo/,
  );
});

test("a git failure mid-way is loud and names what already landed", () => {
  const s = stack();
  const m = readManifest(s.manifest);
  const web = m.repos[1];
  assert.ok(web);
  web.remote = path.join(s.tmp, "src", "missing.git");
  const { steps } = plan(m, s.target, s.base);
  assert.throws(() => {
    applyPlan(steps, s.target, () => {});
  }, /acme-web failed .* Already prepared: \[acme-api\]/);
  assert.equal(existsSync(path.join(s.target, ".xenomoon", "workspace.json")), false);
});

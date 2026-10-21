// The workspace manifest (#36): what a valid one looks like, what is refused, and that a bad file
// is LOUD rather than read as "not a workspace". Temp dirs only, fake names only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateManifest,
  loadWorkspace,
  findWorkspace,
  repoFor,
  githubSlug,
  WORKSPACE_FILE,
} from "./workspace.js";

const GOOD = {
  version: 1,
  repos: [
    { name: "acme-api", path: "acme-api", remote: "git@github.com:acme-co/acme-api.git" },
    {
      name: "acme-web",
      path: "apps/acme-web",
      remote: "https://github.com/acme-co/acme-web.git",
      upstream: "https://github.com/acme-tmpl/acme-web.git",
    },
  ],
};

/** @param {unknown} manifest @returns {string} the parent folder */
function parentWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), "ws-"));
  mkdirSync(path.join(root, ".xenomoon"));
  writeFileSync(
    path.join(root, WORKSPACE_FILE),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  return root;
}

test("a well-formed manifest validates clean", () => {
  assert.deepEqual(validateManifest(GOOD), []);
});

test("shape errors are each named", () => {
  assert.deepEqual(validateManifest([]), ["manifest must be a JSON object"]);
  assert.match(validateManifest({ version: 2, repos: [] }).join("|"), /version must be 1/);
  assert.match(validateManifest({ version: 1, repos: [] }).join("|"), /non-empty array/);
  const errs = validateManifest({
    version: 1,
    repos: [
      { name: "acme-api", path: "acme-api", remote: "", extra: 1 },
      { name: "acme-api", path: "../escape", remote: "x" },
      { name: "bad name", path: "/abs", remote: "x", mirror: "" },
      { name: "acme-sub", path: "acme-api/sub", remote: "x" },
    ],
  }).join("|");
  for (const re of [
    /repos\[0\]\.remote must be a non-empty string/,
    /unknown key "extra"/,
    /"acme-api" is a duplicate/,
    /"\.\.\/escape" must be a relative path/,
    /"\/abs" must be a relative path/,
    /"bad name" has unsafe characters/,
    /repos\[2\]\.mirror, when set/,
    /"acme-api\/sub" overlaps "acme-api"/,
  ])
    assert.match(errs, re);
});

test("loadWorkspace: absent file is null; present file resolves absolute dirs", () => {
  assert.equal(loadWorkspace(mkdtempSync(path.join(tmpdir(), "ws-none-"))), null);
  const root = parentWith(GOOD);
  const ws = loadWorkspace(root);
  assert.ok(ws);
  assert.deepEqual(
    ws.repos.map((r) => r.dir),
    [path.join(root, "acme-api"), path.join(root, "apps", "acme-web")],
  );
});

test("loadWorkspace: a broken or invalid file THROWS, never reads as 'no workspace'", () => {
  assert.throws(() => loadWorkspace(parentWith("{not json")), /not valid JSON/);
  assert.throws(() => loadWorkspace(parentWith({ version: 1, repos: [{}] })), /is invalid/);
});

test("findWorkspace walks up from a child folder to the parent", () => {
  const root = parentWith(GOOD);
  const deep = path.join(root, "acme-api", "src", "lib");
  mkdirSync(deep, { recursive: true });
  assert.equal(findWorkspace(deep)?.root, root);
});

test("repoFor: a path inside a child resolves to that child; the parent itself to none", () => {
  const root = parentWith(GOOD);
  mkdirSync(path.join(root, "apps", "acme-web", "src"), { recursive: true });
  const ws = loadWorkspace(root);
  assert.ok(ws);
  assert.equal(repoFor(ws, path.join(root, "apps", "acme-web", "src"))?.name, "acme-web");
  assert.equal(repoFor(ws, path.join(root, "acme-api"))?.name, "acme-api");
  assert.equal(repoFor(ws, root), null);
  assert.equal(repoFor(ws, path.join(root, "acme-api-old")), null, "a prefix is not a child");
});

test("githubSlug reads ssh and https GitHub remotes, nothing else", () => {
  assert.equal(githubSlug("git@github.com:acme-co/acme-api.git"), "acme-co/acme-api");
  assert.equal(githubSlug("https://github.com/acme-co/acme-web"), "acme-co/acme-web");
  assert.equal(githubSlug("ssh://git@github.com/acme-co/acme-ops.git"), "acme-co/acme-ops");
  assert.equal(githubSlug("git@git.example.com:acme-co/acme-api.git"), null);
});

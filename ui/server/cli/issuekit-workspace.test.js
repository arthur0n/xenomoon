// issuekit inside a multi-repo workspace (#37, probe #35 items 7 and 11): a `.issuekit.json` at the
// workspace parent must not pin every child repo, and a child reads the parent's branch model.
// Temp dirs only; every case resolves without gh (GitHub remotes name the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveRepo } from "./issuekit-lib.js";
import { branchDoctrine } from "./issuekit-push.js";

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), "ik-ws-"));
  mkdirSync(path.join(root, ".xenomoon"));
  writeFileSync(
    path.join(root, ".xenomoon", "workspace.json"),
    JSON.stringify({
      version: 1,
      repos: [
        { name: "acme-api", path: "acme-api", remote: "git@github.com:acme-co/acme-api.git" },
        { name: "acme-web", path: "acme-web", remote: "git@github.com:acme-co/acme-web.git" },
      ],
    }),
  );
  writeFileSync(path.join(root, ".issuekit.json"), JSON.stringify({ repo: "acme-co/acme-pinned" }));
  for (const c of ["acme-api", "acme-web"])
    mkdirSync(path.join(root, c, "src"), { recursive: true });
  return root;
}

test("a parent .issuekit.json no longer pins every child: each child resolves to its own repo", () => {
  const root = workspace();
  assert.equal(resolveRepo({}, path.join(root, "acme-api", "src")), "acme-co/acme-api");
  assert.equal(resolveRepo({}, path.join(root, "acme-web")), "acme-co/acme-web");
  assert.equal(
    resolveRepo({ repo: "acme-co/explicit" }, path.join(root, "acme-web")),
    "acme-co/explicit",
  );
});

test("a child's OWN .issuekit.json still wins over the manifest", () => {
  const root = workspace();
  writeFileSync(
    path.join(root, "acme-web", ".issuekit.json"),
    JSON.stringify({ repo: "acme-co/web-fork" }),
  );
  assert.equal(resolveRepo({}, path.join(root, "acme-web", "src")), "acme-co/web-fork");
});

test("at the workspace parent with a pinned config: LOUD, never the pinned repo", () => {
  const root = workspace();
  assert.throws(
    () => resolveRepo({}, root),
    /workspace parent .* cd into one of \[acme-api, acme-web\]/,
  );
});

test("branchDoctrine: a child without its own branch-model reads the workspace parent's", () => {
  const root = workspace();
  writeFileSync(path.join(root, ".xenomoon", "branch-model"), "staged\n");
  assert.deepEqual(branchDoctrine(path.join(root, "acme-api")), {
    model: "staged",
    prod: "main",
    dev: "development",
  });
  mkdirSync(path.join(root, "acme-web", ".xenomoon"));
  writeFileSync(path.join(root, "acme-web", ".xenomoon", "branch-model"), "trunk\n");
  assert.equal(branchDoctrine(path.join(root, "acme-web"))?.model, "trunk");
  assert.equal(branchDoctrine(""), null);
});

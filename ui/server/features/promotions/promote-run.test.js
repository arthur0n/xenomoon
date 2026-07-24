// node:test coverage for the promotion move seam — locate/promoteOne honor an explicit
// pluginDir override (temp fixtures) while defaulting to the base plugin so the project path
// stays byte-identical. Temp fixtures stand in for the project and the destination plugin;
// GAME_DIR points at a temp dir before import so config.js's load-time project resolution
// stays isolated (same pattern as session.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-promote-"));
process.env.GAME_DIR = scratch;
const { locate, promoteOne } = await import("./promote-run.js");
const { FRAMEWORK_PLUGIN_DIR } = await import("../../core/config.js");

test("locate: dst defaults to the base plugin and flips with an explicit pluginDir", () => {
  const project = path.join(scratch, "some-project");
  const otherPlugin = path.join(scratch, "other-plugin");
  const base = locate("skills", "my-skill", project);
  assert.equal(base.dst, path.join(FRAMEWORK_PLUGIN_DIR, "skills", "my-skill"));
  const other = locate("skills", "my-skill", project, otherPlugin);
  assert.equal(other.dst, path.join(otherPlugin, "skills", "my-skill"));
  // src never depends on the plugin dir — same project-local source either way.
  assert.equal(base.src, other.src);
  // Agents get the .md suffix in both worlds.
  assert.equal(
    locate("agents", "helper", project, otherPlugin).dst,
    path.join(otherPlugin, "agents", "helper.md"),
  );
});

test("promoteOne: moves into the pluginDir it is given (end to end on disk)", () => {
  const root = path.join(scratch, "fixture-promotion");
  const project = path.join(root, "project");
  const fixturePlugin = path.join(root, "plugin-fixture");
  mkdirSync(path.join(project, ".claude", "skills", "neat-thing"), { recursive: true });
  writeFileSync(
    path.join(project, ".claude", "skills", "neat-thing", "SKILL.md"),
    "---\nname: neat-thing\n---\nAgnostic content.\n",
  );
  const r = promoteOne("skills", "neat-thing", project, { pluginDir: fixturePlugin });
  assert.equal(r.ok, true);
  assert.equal(r.msg, "moved skills/neat-thing → plugin-fixture");
  // Landed in the fixture plugin, gone from the project, and the base plugin untouched.
  assert.match(
    readFileSync(path.join(fixturePlugin, "skills", "neat-thing", "SKILL.md"), "utf8"),
    /Agnostic content/,
  );
  assert.ok(!existsSync(path.join(project, ".claude", "skills", "neat-thing")));
  assert.ok(!existsSync(path.join(FRAMEWORK_PLUGIN_DIR, "skills", "neat-thing")));
});

test("library kind: accepted by all four validation points, moves, and appends the index", async () => {
  const { PROMOTE_KINDS } = await import("./promote-run.js");
  assert.ok(PROMOTE_KINDS.has("library"));
  const { addPromotion } = await import("./promotions-store.js");
  assert.ok(typeof addPromotion === "function"); // store KINDS accepts it via addPromotion below
  const root = path.join(scratch, "library-promotion");
  const project = path.join(root, "project");
  const fixturePlugin = path.join(root, "plugin-fixture");
  mkdirSync(path.join(project, ".claude", "library", "findings"), { recursive: true });
  writeFileSync(
    path.join(project, ".claude", "library", "findings", "lockfile-drift.md"),
    "---\nname: lockfile-drift\ndescription: agents must never mutate lockfiles uninvited\n---\nAgnostic finding body.\n",
  );
  const loc = locate("library", "findings/lockfile-drift.md", project, fixturePlugin);
  assert.equal(loc.src, path.join(project, ".claude", "library", "findings", "lockfile-drift.md"));
  assert.equal(loc.dst, path.join(fixturePlugin, "library", "findings", "lockfile-drift.md"));
  const r = promoteOne("library", "findings/lockfile-drift.md", project, {
    pluginDir: fixturePlugin,
  });
  assert.equal(r.ok, true, r.msg);
  assert.ok(existsSync(loc.dst));
  const index = readFileSync(path.join(fixturePlugin, "library", "findings", "index.md"), "utf8");
  assert.match(index, /\[lockfile-drift\]\(lockfile-drift\.md\) — agents must never mutate/);
});

test("library kind: the records-only mapping signal blocks a one-project record", () => {
  const root = path.join(scratch, "library-contaminated");
  const project = path.join(root, "project");
  mkdirSync(path.join(project, ".claude", "library", "verdicts"), { recursive: true });
  writeFileSync(
    path.join(project, ".claude", "library", "verdicts", "coupled.md"),
    "---\nname: coupled\ndescription: x\n---\nValid for our stack only.\n",
  );
  const r = promoteOne("library", "verdicts/coupled.md", project, {
    pluginDir: path.join(root, "plugin-fixture"),
  });
  assert.equal(r.ok, false);
  assert.match(r.msg, /one-project-mapping/);
});

test("per-project denylist: the bound project's name blocks promotion (privacy floor)", () => {
  const root = path.join(scratch, "denylist-check");
  const project = path.join(root, "acme-billing");
  mkdirSync(path.join(project, ".claude", "skills", "leaky"), { recursive: true });
  writeFileSync(
    path.join(project, ".claude", "skills", "leaky", "SKILL.md"),
    "---\nname: leaky\n---\nProven pattern in acme-billing deployments.\n",
  );
  const r = promoteOne("skills", "leaky", project, {
    pluginDir: path.join(root, "plugin-fixture"),
  });
  assert.equal(r.ok, false);
  assert.match(r.msg, /codename.*acme-billing|acme-billing/);
});

test("promoteOne: an explicit base pluginDir keeps the project-path message and layout", () => {
  const root = path.join(scratch, "project-promotion");
  const project = path.join(root, "project");
  const basePlugin = path.join(root, "plugin");
  mkdirSync(path.join(project, ".claude", "skills", "project-thing"), { recursive: true });
  writeFileSync(
    path.join(project, ".claude", "skills", "project-thing", "SKILL.md"),
    "---\nname: project-thing\n---\nAgnostic project content.\n",
  );
  const r = promoteOne("skills", "project-thing", project, { pluginDir: basePlugin });
  assert.equal(r.ok, true);
  assert.equal(r.msg, "moved skills/project-thing → plugin");
  assert.ok(existsSync(path.join(basePlugin, "skills", "project-thing", "SKILL.md")));
});

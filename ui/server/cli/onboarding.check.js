// Automated onboarding test — proves a clean consumer can go from a fresh clone of the framework
// to a wired project, with the project staying PURE: the framework loads from the domain pack's
// plugin, nothing is copied in. Bare-node, no test runner (same style as ui/reducer.check.js):
//   node ui/server/cli/onboarding.check.js
//
// Exports the framework EXACTLY as a forker receives it — `git archive` of the tracked tree, so
// node_modules, .xenomoon.json and logs are excluded and an un-committed file is invisible (the
// real "did we ship it?" test). Then `forge new --domain webapp` into a fresh project (a minimal
// package.json app) and assert the CORE + webapp packs ship, the fork is Godot-free, the project
// binds + doctor passes, and NOTHING leaked into the project.
//
// NOTE: new/edited framework files must be `git add`-ed before running locally — the archive sees
// TRACKED files only (git stash create). CI runs post-commit, so HEAD has everything.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

/** Count .md files in a dir (0 if missing). @param {string} dir @returns {number} */
const countMd = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
/** Count immediate subdirectories (0 if missing). @param {string} dir @returns {number} */
const countDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

const work = mkdtempSync(path.join(tmpdir(), "xeno-onboard-"));
try {
  // ---- Build the "as shipped" framework tree from TRACKED files only ----
  const stashRef = execFileSync("git", ["stash", "create"], { cwd: FRAMEWORK_DIR })
    .toString()
    .trim();
  const ref = stashRef || "HEAD";
  const fw = path.join(work, "framework");
  mkdirSync(fw, { recursive: true });
  const tarBuf = execFileSync("git", ["archive", "--format=tar", ref], {
    cwd: FRAMEWORK_DIR,
    maxBuffer: 256 * 1024 * 1024,
  });
  const tarFile = path.join(work, "framework.tar");
  writeFileSync(tarFile, tarBuf);
  execFileSync("tar", ["-xf", tarFile, "-C", fw]);

  check("framework ships the CORE plugin + the webapp domain pack (committed)", () => {
    assert.ok(
      existsSync(path.join(fw, "plugin", ".claude-plugin", "plugin.json")),
      "CORE plugin/.claude-plugin/plugin.json must ship",
    );
    assert.ok(
      countMd(path.join(fw, "plugin", "agents")) > 0 &&
        countDirs(path.join(fw, "plugin", "skills")) > 0,
      "CORE plugin/{agents,skills} must ship with content",
    );
    assert.ok(
      existsSync(path.join(fw, "domains", "webapp", "domain.json")) &&
        existsSync(path.join(fw, "domains", "webapp", "orchestrator.md")) &&
        existsSync(path.join(fw, "domains", "webapp", "plugin", ".claude-plugin", "plugin.json")),
      "the webapp domain pack (domain.json + orchestrator.md + plugin) must ship",
    );
    assert.ok(
      existsSync(path.join(fw, ".claude-plugin", "marketplace.json")),
      "marketplace.json must ship (terminal install)",
    );
  });

  check("the shipped fork is Godot-free (strip-godot guarantee)", () => {
    assert.ok(!existsSync(path.join(fw, "domains", "godot")), "domains/godot must NOT ship");
    assert.ok(!existsSync(path.join(fw, "starter")), "starter/ must NOT ship");
    assert.ok(
      !existsSync(path.join(fw, "ui", "orchestrator.md")),
      "the Godot Hive ui/orchestrator.md must NOT ship",
    );
  });

  // ---- forge new --domain webapp → a fresh project (a minimal package.json app) ----
  // webapp installs IN PLACE and writes nothing into the project (it binds via the framework's
  // own .xenomoon.json), so the project must stay byte-for-byte its own.
  const project = path.join(work, "app");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify(
      { name: "onboarding-fixture", scripts: { build: "true", test: "true", lint: "true" } },
      null,
      2,
    ) + "\n",
  );
  execFileSync(
    "node",
    [path.join(fw, "ui", "server", "cli", "new.js"), project, "--domain", "webapp"],
    { stdio: "pipe" },
  );

  check("forge new binds the project to the webapp domain (framework .xenomoon.json)", () => {
    const cfg = /** @type {{domain?: string, projectDir?: string}} */ (
      parseJSON(readFileSync(path.join(fw, ".xenomoon.json"), "utf8"))
    );
    assert.equal(cfg.domain, "webapp", "framework .xenomoon.json domain must be webapp");
    assert.equal(
      path.resolve(cfg.projectDir ?? ""),
      path.resolve(project),
      "framework .xenomoon.json projectDir must point at the project",
    );
  });

  check("the project stays PURE — webapp materializes nothing into it", () => {
    assert.ok(!existsSync(path.join(project, "tools")), "tools/ must NOT be copied in");
    assert.ok(!existsSync(path.join(project, "library")), "library/ must NOT be linked in");
    assert.ok(
      !existsSync(path.join(project, ".claude", "agents")),
      ".claude/agents must NOT exist",
    );
    assert.ok(
      !existsSync(path.join(project, ".claude", "skills")),
      ".claude/skills must NOT exist",
    );
    assert.ok(
      !existsSync(path.join(project, ".xenomoon-project.json")),
      "no project lock written for a non-materialize domain",
    );
    assert.ok(
      existsSync(path.join(project, "package.json")),
      "the project's own package.json is untouched",
    );
  });

  // doctor already ran inside `forge new` (it throws on a hard failure, which would have failed the
  // new.js call above). Re-run explicitly as a belt-and-suspenders check.
  check("doctor reports a healthy webapp project", () => {
    execFileSync("node", [path.join(fw, "ui", "server", "cli", "doctor.js"), project], {
      stdio: "pipe",
    });
  });

  console.log(`\nonboarding: ${passed} checks passed.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

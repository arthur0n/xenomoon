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
  realpathSync,
  statSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { loadDomain } from "../core/domain-resolver.js";
import { KNOWLEDGE_PACK } from "./domain-pick.js";

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
// #65: the machine install registry stays out of this check. Every child (new.js → materialize.js,
// doctor.js, …) inherits process.env and resolves XENOMOON_REGISTRY at import time, so one
// assignment here, before the first spawn, isolates them all — including grandchildren new.js
// spawns itself. Nothing in this process imports install-registry.js, so no in-process read.
const registryFile = path.join(work, "registry", "installs.json");
process.env.XENOMOON_REGISTRY = registryFile;
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

  // The knowledge pack ships too, and its descriptor (code-shaped fields filled for a workspace,
  // #30) is accepted by the same resolver a real install uses.
  check(`the ${KNOWLEDGE_PACK} knowledge pack ships and its descriptor loads`, () => {
    const pack = path.join(fw, "domains", KNOWLEDGE_PACK);
    assert.ok(
      existsSync(path.join(pack, "orchestrator.md")) &&
        existsSync(path.join(pack, "templates", "CLAUDE.md")) &&
        existsSync(path.join(pack, "plugin", ".claude-plugin", "plugin.json")),
      `the ${KNOWLEDGE_PACK} pack (orchestrator.md + templates/CLAUDE.md + plugin) must ship`,
    );
    const d = loadDomain(KNOWLEDGE_PACK, fw);
    assert.equal(d.engine.projectFile, ".xenomoon/workspace.json");
  });

  check("the shipped fork is Godot-free (no godot domain / starter / Hive)", () => {
    assert.ok(!existsSync(path.join(fw, "domains", "godot")), "domains/godot must NOT ship");
    assert.ok(!existsSync(path.join(fw, "starter")), "starter/ must NOT ship");
    assert.ok(
      !existsSync(path.join(fw, "ui", "orchestrator.md")),
      "the Godot Hive ui/orchestrator.md must NOT ship",
    );
  });

  // ---- forge new --domain webapp → a fresh project (a minimal package.json app) ----
  // webapp installs IN PLACE: it binds via the framework's own .xenomoon.json and copies no framework
  // CODE in. The only things it touches in the project are a .gitignore rule and, when the project has
  // none, a seeded CLAUDE.md project-facts template (the project's own doc) — both asserted below.
  // #65: a first run validates the project path itself (setup.js no longer runs), before any
  // write. The path is given as tmpdir() spells it (macOS /var/...), while the child resolves its
  // own location through the /var → /private/var link: the validator compares REAL locations.
  check("a first run with an invalid project path is refused before any write", () => {
    const inner = path.join(fw, "inner");
    const r = spawnSync(
      "node",
      [path.join(fw, "ui", "server", "cli", "new.js"), inner, "--domain=webapp"],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 1, "an invalid path must exit 1");
    assert.match(r.stderr, /INSIDE the framework checkout/, "the refusal must say why");
    assert.ok(!existsSync(path.join(fw, ".xenomoon.json")), ".xenomoon.json must not be written");
    assert.ok(!existsSync(inner), "the project folder must not be created");
  });

  // #65: one port rule for first and later runs — a first run's --port held by another
  // registered install's project is refused before any write (the registry seed is removed after).
  check(
    "a first run with a --port another install's project holds is refused before any write",
    () => {
      const other = path.join(work, "other-install");
      mkdirSync(other, { recursive: true });
      // The registry lists only dirs whose package.json names the framework package.
      writeFileSync(path.join(other, "package.json"), JSON.stringify({ name: "xenomoon" }));
      writeFileSync(
        path.join(other, ".xenomoon.json"),
        JSON.stringify({
          port: 4999,
          projects: { held: { dir: path.join(work, "held"), port: 4100 } },
        }),
      );
      mkdirSync(path.dirname(registryFile), { recursive: true });
      writeFileSync(registryFile, JSON.stringify({ version: 1, installs: { [other]: null } }));
      const target = path.join(work, "wants-4100");
      const r = spawnSync(
        "node",
        [path.join(fw, "ui", "server", "cli", "new.js"), target, "--domain=webapp", "--port=4100"],
        { encoding: "utf8" },
      );
      rmSync(path.dirname(registryFile), { recursive: true, force: true });
      assert.equal(r.status, 1, "a held port must exit 1");
      assert.match(r.stderr, /port 4100 is already claimed/, "the refusal must name the port");
      assert.ok(!existsSync(path.join(fw, ".xenomoon.json")), ".xenomoon.json must not be written");
      assert.ok(!existsSync(target), "the project folder must not be created");
    },
  );

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
  const firstOut = execFileSync(
    "node",
    [path.join(fw, "ui", "server", "cli", "new.js"), project, "--domain", "webapp"],
    { stdio: "pipe", encoding: "utf8" },
  );

  // The hub is the only entry point (plugin/library/verdicts/hub-is-the-only-entry-point.md).
  check("the closing message starts the project through the hub, not xenomoon up/start", () => {
    assert.match(firstOut, /npm run hub/, "the closing text must name `npm run hub`");
    assert.doesNotMatch(firstOut, /xenomoon (up|start)\b/, "no single-server start is offered");
  });

  check("forge new binds the install to the webapp domain (framework .xenomoon.json)", () => {
    const cfg = /** @type {{domain?: string}} */ (
      parseJSON(readFileSync(path.join(fw, ".xenomoon.json"), "utf8"))
    );
    assert.equal(cfg.domain, "webapp", "framework .xenomoon.json domain must be webapp");
  });

  check("the project stays PURE — webapp copies no framework code in", () => {
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

  check("install gitignores .xenomoon/ in the project (temp tasks/state never committed)", () => {
    const gi = readFileSync(path.join(project, ".gitignore"), "utf8");
    assert.ok(gi.includes(".xenomoon/"), ".gitignore must ignore .xenomoon/ (per-project state)");
  });

  check("install seeds a CLAUDE.md project-facts template when the project has none", () => {
    const md = path.join(project, "CLAUDE.md");
    assert.ok(existsSync(md), "CLAUDE.md must be seeded when the project ships none");
    const txt = readFileSync(md, "utf8");
    assert.ok(
      txt.includes("onboarding-fixture"),
      "{{PROJECT_NAME}} must be substituted from the project's package.json name",
    );
    assert.ok(
      !txt.includes("{{PROJECT_NAME}}"),
      "the PROJECT_NAME placeholder must not remain after seeding",
    );
  });

  // doctor already ran inside `forge new` (it throws on a hard failure, which would have failed the
  // new.js call above). Re-run explicitly as a belt-and-suspenders check.
  check("doctor reports a healthy webapp project", () => {
    execFileSync("node", [path.join(fw, "ui", "server", "cli", "doctor.js"), project], {
      stdio: "pipe",
    });
  });

  // #65: the install registered itself in the check's OWN registry, not the machine's. The key is
  // the realpath (the child resolves its own location through the macOS /var → /private/var link).
  check("install registers the temp framework in the check-local registry only", () => {
    assert.ok(existsSync(registryFile), "the check-local registry file must be written");
    const reg = /** @type {{ installs?: Record<string, string|null> }} */ (
      parseJSON(readFileSync(registryFile, "utf8"))
    );
    assert.deepEqual(
      Object.keys(reg.installs ?? {}),
      [realpathSync(fw)],
      "the check-local registry must list exactly the temp framework",
    );
    // The registry lists installs, not projects: nothing registers a project, and doctor
    // registers the install after the projects map was written, so the value is null.
    assert.equal(reg.installs?.[realpathSync(fw)], null, "the install's registry value is null");
  });

  // #84: the onboarded flag and the approvals policy are per PROJECT, seeded into its own
  // .xenomoon/settings.json; the install's .xenomoon.json carries neither (nor branchModel).
  const settingsFile = path.join(project, ".xenomoon", "settings.json");
  const MODES = ["push", "merge", "dependencies", "branchCreate", "spend", "codexReview"];

  check(
    "install seeds the project's .xenomoon/settings.json: not onboarded, all-ask policy",
    () => {
      assert.ok(existsSync(settingsFile), ".xenomoon/settings.json must be seeded in the project");
      const s = /** @type {{ onboarded?: unknown, policy?: Record<string, unknown> }} */ (
        parseJSON(readFileSync(settingsFile, "utf8"))
      );
      assert.equal(s.onboarded, false, "onboarded must be seeded false");
      for (const k of MODES) assert.equal(s.policy?.[k], "ask", `policy.${k} must be "ask"`);
    },
  );

  check(
    "the install's .xenomoon.json carries no onboarded/policy/branchModel, keeps domain+port",
    () => {
      const cfg = /** @type {Record<string, unknown>} */ (
        parseJSON(readFileSync(path.join(fw, ".xenomoon.json"), "utf8"))
      );
      for (const k of ["onboarded", "policy", "branchModel"])
        assert.ok(!Object.hasOwn(cfg, k), `framework .xenomoon.json must not hold "${k}"`);
      assert.equal(cfg.domain, "webapp", "domain must stay");
      assert.equal(typeof cfg.port, "number", "port must stay");
    },
  );

  // #65: one install, many projects — each is an entry of the `projects` map in .xenomoon.json.
  const cfgFile = path.join(fw, ".xenomoon.json");
  /** @typedef {{ domain?: string, port?: number, projectDir?: string,
   *   projects?: Record<string, { dir: string, port?: number }> }} InstallCfg */
  const readCfg = () => /** @type {InstallCfg} */ (parseJSON(readFileSync(cfgFile, "utf8")));
  const first = readCfg();

  check(
    "the first project lands in the projects map only: no root projectDir, install port",
    () => {
      assert.deepEqual(first.projects, {
        [path.basename(project)]: { dir: realpathSync(project), port: first.port },
      });
      assert.ok(!Object.hasOwn(first, "projectDir"), "the install must have NO root projectDir");
    },
  );

  const second = path.join(work, "site");
  mkdirSync(second, { recursive: true });
  writeFileSync(
    path.join(second, "package.json"),
    JSON.stringify({ name: "second-fixture" }) + "\n",
  );
  execFileSync(
    "node",
    [path.join(fw, "ui", "server", "cli", "new.js"), second, "--domain", "webapp"],
    { stdio: "pipe" },
  );

  check("a later project is added with its own port, fully prepared, install untouched", () => {
    const cfg = readCfg();
    const entry = cfg.projects?.[path.basename(second)];
    assert.equal(entry?.dir, realpathSync(second), "the second project must be in the map");
    assert.equal(typeof entry?.port, "number", "the second project must get a port");
    assert.notEqual(entry?.port, first.port, "the second project must get a DIFFERENT port");
    assert.equal(cfg.domain, first.domain, "the install's domain must not change");
    assert.equal(cfg.port, first.port, "the install's root port must not change");
    assert.ok(
      !Object.hasOwn(cfg, "projectDir"),
      "a later project must not write a root projectDir",
    );
    const firstName = path.basename(project);
    assert.deepEqual(
      cfg.projects?.[firstName],
      first.projects?.[firstName],
      "first entry unchanged",
    );
    assert.ok(existsSync(path.join(second, "CLAUDE.md")), "CLAUDE.md must be seeded");
    for (const stub of ["business-rules.md", "project.md"])
      assert.ok(
        existsSync(path.join(second, ".claude", "library", stub)),
        `${stub} must be seeded`,
      );
    assert.ok(existsSync(path.join(second, ".xenomoon", "branch-model")), "branch-model missing");
    const s = /** @type {{ onboarded?: unknown }} */ (
      parseJSON(readFileSync(path.join(second, ".xenomoon", "settings.json"), "utf8"))
    );
    assert.equal(s.onboarded, false, "the second project must be seeded not onboarded");
  });

  check("a project of another domain is refused before any write", () => {
    /** Sorted relative path + size of every file under plugin/{agents,skills}. @returns {string} */
    const fingerprint = () =>
      ["agents", "skills"]
        .flatMap((d) => {
          const root = path.join(fw, "plugin", d);
          return readdirSync(root, { recursive: true, withFileTypes: true })
            .filter((e) => e.isFile())
            .map((e) => {
              const f = path.join(e.parentPath, e.name);
              return `${path.relative(fw, f)}:${statSync(f).size}`;
            });
        })
        .sort()
        .join("\n");
    const bytesBefore = readFileSync(cfgFile);
    const pluginBefore = fingerprint();
    const third = path.join(work, "mobile");
    mkdirSync(third, { recursive: true });
    let status = 0;
    let stderr = "";
    try {
      execFileSync(
        "node",
        [path.join(fw, "ui", "server", "cli", "new.js"), third, "--domain", "expoapp"],
        { stdio: "pipe" },
      );
    } catch (e) {
      const err = /** @type {{ status?: number, stderr?: Buffer }} */ (e);
      status = err.status ?? 1;
      stderr = String(err.stderr ?? "");
    }
    assert.notEqual(status, 0, "another domain must exit non-zero");
    assert.match(stderr, /"webapp" domain installed/, "the refusal must name the installed domain");
    assert.ok(readFileSync(cfgFile).equals(bytesBefore), ".xenomoon.json must be byte-identical");
    assert.equal(fingerprint(), pluginBefore, "plugin/ must be unchanged");
  });

  console.log(`\nonboarding: ${passed} checks passed.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

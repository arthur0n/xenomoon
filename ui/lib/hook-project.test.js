// The two policy-reading PreToolUse hooks take the policy from the SESSION's project (#84): the
// project is resolved from the payload's `cwd`, never from the install's `.xenomoon.json` and
// never from an env variable. Runs the real hooks as child processes over two temp projects.
// Every child runs with its process cwd INSIDE project A (the allowing one), so a hook that read
// process.cwd() instead of the payload would wrongly allow in B.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { FRAMEWORK_MERGE_DENY } from "./consequential.js";
import { frameworkRepo } from "./framework-remote.js";
import { parseJSON } from "./json.js";

const HOOKS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
);
const GATE = path.join(HOOKS, "consequential-gate.mjs");
const CONSENT = path.join(HOOKS, "require-codex-consent.sh");

// os.tmpdir() is outside the home folder, so the real home never stops the walk early.
const root = mkdtempSync(path.join(os.tmpdir(), "hook-project-"));
const projA = path.join(root, "a");
const projB = path.join(root, "b");
const outside = path.join(root, "plain");
/** @param {string} dir @param {Record<string, string>} policy */
function makeProject(dir, policy) {
  mkdirSync(path.join(dir, ".xenomoon"), { recursive: true });
  writeFileSync(path.join(dir, ".xenomoon", "settings.json"), JSON.stringify({ policy }));
}
makeProject(projA, { push: "allow", spend: "allow", codexReview: "allow" });
makeProject(projB, { push: "ask", spend: "ask", codexReview: "ask" });
mkdirSync(path.join(projA, "src", "deep"), { recursive: true });
mkdirSync(outside, { recursive: true });
after(() => {
  rmSync(root, { recursive: true, force: true });
});

const SPEND = "curl -s https://api.openai.com/v1/models";
const PUSH = "git push origin main";
const REVIEW = "node /x/codex-companion.mjs review --base main";
const hasJq = spawnSync("jq", ["--version"]).status === 0;

/** Run one hook with `{ tool_input: { command }, cwd?, ...extra }` on stdin.
 * @param {string[]} argv @param {string} command @param {string} [cwd]
 * @param {Record<string, unknown>} [extra] */
function run(argv, command, cwd, extra = {}) {
  const payload = JSON.stringify(
    cwd === undefined
      ? { tool_input: { command }, ...extra }
      : { tool_input: { command }, cwd, ...extra },
  );
  const [bin = "", ...args] = argv;
  const r = spawnSync(bin, args, { input: payload, encoding: "utf8", cwd: projA });
  return { status: r.status, out: r.stdout };
}
/** @param {string} cmd @param {string} [cwd] */
const gate = (cmd, cwd) => run(["node", GATE], cmd, cwd);
/** @param {string} [cwd] */
const consent = (cwd) => run(["bash", CONSENT], REVIEW, cwd);

/** Silent pass: exit 0 and nothing printed (a crash exits non-zero). @param {{ status: number | null, out: string }} r */
function assertSilent(r) {
  assert.equal(r.status, 0);
  assert.equal(r.out, "");
}
/** The ASK itself, not mere silence. @param {{ status: number | null, out: string }} r @param {RegExp} reason */
function assertAsk(r, reason) {
  assert.equal(r.status, 0);
  const parsed =
    /** @type {{ hookSpecificOutput: { permissionDecision: string, permissionDecisionReason: string } }} */ (
      parseJSON(r.out)
    );
  const out = parsed.hookSpecificOutput;
  assert.equal(out.permissionDecision, "ask");
  assert.match(out.permissionDecisionReason, reason);
}

test("gate: project A allows spend and push with no prompt", () => {
  assertSilent(gate(SPEND, projA));
  assertSilent(gate(PUSH, projA));
});

test("gate: the same commands in project B ask", () => {
  assertAsk(gate(SPEND, projB), /SPENDS real credits/);
  assertAsk(gate(PUSH, projB), /push/i);
});

test("gate: a subfolder of project A takes A's policy", () => {
  assertSilent(gate(SPEND, path.join(projA, "src", "deep")));
});

test("gate: a cwd outside any project asks", () => {
  assertAsk(gate(SPEND, outside), /SPENDS real credits/);
});

test("gate: a payload without cwd asks", () => {
  assertAsk(gate(SPEND), /SPENDS real credits/);
});

test("consent: project A runs the review silently", { skip: !hasJq && "jq is not on PATH" }, () => {
  assertSilent(consent(projA));
  assertSilent(consent(path.join(projA, "src", "deep")));
});

test("consent: project B asks", { skip: !hasJq && "jq is not on PATH" }, () => {
  assertAsk(consent(projB), /consent gate/);
});

test(
  "consent: no cwd, or a cwd outside any project, asks",
  { skip: !hasJq && "jq is not on PATH" },
  () => {
    assertAsk(consent(), /consent gate/);
    assertAsk(consent(outside), /consent gate/);
  },
);

// The children run INSIDE project A, so a relative or non-string cwd that fell back to the
// process folder would allow; asking proves it was treated as "no project".
test("gate: a relative or non-string cwd asks", () => {
  for (const cwd of [".", "src", "", 5, { dir: projA }, [projA]])
    assertAsk(gate(SPEND, /** @type {string} */ (cwd)), /SPENDS real credits/);
});

/** A copy of the gate in its own folder, with `helper` written beside it as project-policy.mjs
 * (none when undefined). The copy resolves nothing else: without a usable helper it never looks
 * for the framework root. @param {string} name @param {string} [helper] */
function lonelyGate(name, helper) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  copyFileSync(GATE, path.join(dir, "consequential-gate.mjs"));
  if (helper !== undefined) writeFileSync(path.join(dir, "project-policy.mjs"), helper);
  /** @param {string} cmd @param {Record<string, unknown>} [extra] */
  return (cmd, extra) => run(["node", path.join(dir, "consequential-gate.mjs")], cmd, projA, extra);
}

const FRAMEWORK = path.join(HOOKS, "..", "..");
/** A helper that has the right exports but answers `body` (an expression) for every cwd. The
 * framework root is the real one, so the gate loads the REAL matchers. @param {string} body */
const answeringHelper = (body) =>
  `export const FRAMEWORK_DIR = ${JSON.stringify(FRAMEWORK)};\n` +
  `export async function projectPolicy() { return ${body}; }\n`;
const DEPS = "npm install lodash";
const PRUNE = "issuekit branch prune --apply";

/** The DENY itself. @param {{ status: number | null, out: string }} r @param {RegExp} reason */
function assertDeny(r, reason) {
  assert.equal(r.status, 0);
  const out =
    /** @type {{ hookSpecificOutput: { permissionDecision: string, permissionDecisionReason: string } }} */ (
      parseJSON(r.out)
    ).hookSpecificOutput;
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, reason);
}

test("gate: a helper answering an empty policy for an allowing project asks", () => {
  const g = lonelyGate(
    "empty-policy-helper",
    answeringHelper(`{ policy: {}, projectDir: ${JSON.stringify(projA)}, why: "" }`),
  );
  assertAsk(g(DEPS), /mutates package\.json[\s\S]*returned an invalid result/);
  assertAsk(g(SPEND), /SPENDS real credits[\s\S]*returned an invalid result/);
});

test("gate: a helper that rejects, or answers null, still prints an ask", () => {
  for (const body of ["Promise.reject(new Error('boom'))", "null"]) {
    const g = lonelyGate(`bad-answer-${body.length}`, answeringHelper(body));
    assertAsk(g(SPEND), /SPENDS real credits[\s\S]*returned an invalid result/);
  }
});

test("gate: helper absent and no framework beside it, prune --apply still asks or denies on shape", () => {
  const g = lonelyGate("no-helper-prune");
  assertAsk(g(PRUNE), /looks like a merge\/promote[\s\S]*project-policy\.mjs could not be loaded/);
  assertDeny(
    g(PRUNE, { agent_id: "w1" }),
    /never a worker's[\s\S]*project-policy\.mjs could not be loaded/,
  );
});

test("gate: helper absent in the in-place layout, the REAL matchers still judge", () => {
  // <tmp>/inplace/plugin/hooks/consequential-gate.mjs with <tmp>/inplace/ui → the repo's ui/.
  const top = path.join(root, "inplace");
  mkdirSync(path.join(top, "plugin", "hooks"), { recursive: true });
  symlinkSync(path.join(FRAMEWORK, "ui"), path.join(top, "ui"), "dir");
  const gatePath = path.join(top, "plugin", "hooks", "consequential-gate.mjs");
  copyFileSync(GATE, gatePath);
  /** @param {string} cmd @param {Record<string, unknown>} [extra] */
  const g = (cmd, extra) => run(["node", gatePath], cmd, projA, extra);
  // Not the blind wording: the real MERGE_ASK / SUBAGENT_MERGE_DENY, plus why every action asks.
  assertAsk(
    g(PRUNE),
    /^Merge \/ promote is consequential[\s\S]*Every action asks here: plugin\/hooks\/project-policy\.mjs could not be loaded/,
  );
  assertDeny(
    g(PRUNE, { agent_id: "w1" }),
    /^Merging and promoting are the orchestrator's plumbing/,
  );
  assertAsk(g(SPEND), /^This command SPENDS real credits/);
});

test("gate and consent: a cwd of an allowing project plus a NUL asks", () => {
  const nul = `${projA}\u0000`;
  assert.match(JSON.stringify({ cwd: nul }), /\\u0000/);
  assertAsk(gate(SPEND, nul), /SPENDS real credits/);
  assertAsk(gate(PUSH, nul), /push/i);
  if (hasJq) assertAsk(consent(nul), /consent gate/);
});

test("gate: with project-policy.mjs absent or throwing, it still asks on shape", () => {
  for (const g of [
    lonelyGate("no-helper"),
    lonelyGate("throwing-helper", 'throw new Error("broken");\n'),
  ]) {
    assertAsk(g(SPEND), /metered API endpoint[\s\S]*project-policy\.mjs could not be loaded/);
    assertAsk(g(PUSH), /looks like a push[\s\S]*project-policy\.mjs could not be loaded/);
  }
});

test("gate: a project-policy.mjs missing an export asks and names it", () => {
  const g = lonelyGate("skewed-helper", 'export const FRAMEWORK_DIR = "";\n');
  assertAsk(g(SPEND), /project-policy\.mjs loaded but is missing: FRAMEWORK_DIR, projectPolicy/);
});

test("consent: a relative or non-string cwd asks", { skip: !hasJq && "jq is not on PATH" }, () => {
  for (const cwd of [".", "src", 5, { dir: projA }])
    assertAsk(consent(/** @type {string} */ (cwd)), /consent gate/);
});

test(
  "consent: a cwd with spaces and quotes reaches node as one argument",
  { skip: !hasJq && "jq is not on PATH" },
  () => {
    const odd = path.join(root, `it's a "quoted" dir`);
    makeProject(odd, { codexReview: "allow" });
    assertSilent(consent(odd));
  },
);

test(
  "consent: a node that exits non-zero, or no node at all, asks",
  { skip: !hasJq && "jq is not on PATH" },
  () => {
    // A fake node that prints `allow` and FAILS: its answer must not count. An empty folder
    // stands for "node missing" (jq and the shell tools stay reachable through /usr/bin:/bin).
    const fake = path.join(root, "fake-node");
    const none = path.join(root, "no-node");
    mkdirSync(fake, { recursive: true });
    mkdirSync(none, { recursive: true });
    writeFileSync(path.join(fake, "node"), "#!/bin/sh\necho allow\nexit 1\n", { mode: 0o755 });
    const jqDir = path.dirname(spawnSync("which", ["jq"], { encoding: "utf8" }).stdout.trim());
    for (const bin of [fake, none]) {
      const r = spawnSync("bash", [CONSENT], {
        input: JSON.stringify({ tool_input: { command: REVIEW }, cwd: projA }),
        encoding: "utf8",
        cwd: projA,
        env: { ...process.env, PATH: [bin, jqDir, "/usr/bin", "/bin"].join(":") },
      });
      assertAsk({ status: r.status, out: r.stdout }, /consent gate/);
    }
  },
);

test(
  "consent: a cwd shaped like a node option is data, not an option",
  { skip: !hasJq && "jq is not on PATH" },
  () => {
    const marker = path.join(root, "evaluated");
    const evil = `--eval=require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`;
    for (const cwd of ["-e", "--version", evil]) assertAsk(consent(cwd), /consent gate/);
    assert.equal(existsSync(marker), false);
  },
);

// ── framework merges (#99) ────────────────────────────────────────────────────
// Relies on: the helper's FRAMEWORK_DIR being the real checkout, the folder form of the command
// (`cd <framework> && ...`, no remote read needed for the verdict), and a project cwd in the tmp root.
const FW_MERGE = `cd ${FRAMEWORK} && gh pr merge 3`;
const PROJ_MERGE = "gh pr merge 3";
const allModes = (/** @type {string} */ merge) =>
  `{ policy: { push: "allow", merge: ${JSON.stringify(merge)}, dependencies: "allow", branchCreate: "allow", ` +
  `spend: "allow", migrationPush: "allow", spendPatterns: [], migrationsPending: "" }, ` +
  `projectDir: ${JSON.stringify(projA)}, why: "" }`;

test("gate: a framework merge is denied whether the project's merge policy is allow or ask", () => {
  for (const merge of ["allow", "ask"]) {
    const g = lonelyGate(`fw-merge-${merge}`, answeringHelper(allModes(merge)));
    const r = g(FW_MERGE);
    assertDeny(r, /^framework PRs are merged by the owner/);
    const reason = /** @type {{ hookSpecificOutput: { permissionDecisionReason: string } }} */ (
      parseJSON(r.out)
    ).hookSpecificOutput.permissionDecisionReason;
    assert.equal(reason, FRAMEWORK_MERGE_DENY);
  }
});

test("gate: a wrapped framework merge and a PR URL naming the framework are denied", (t) => {
  const g = lonelyGate("fw-merge-forms", answeringHelper(allModes("allow")));
  assertDeny(g(`cd ${FRAMEWORK} && env GH_X=1 command gh pr merge 3`), /^framework PRs/);
  const repo = frameworkRepo(FRAMEWORK);
  if (repo === null) {
    t.skip("this checkout has no framework remote to name");
    return;
  }
  assertDeny(g(`nohup gh pr merge "https://github.com/${repo}/pull/7"`), /^framework PRs/);
});

/** A gate whose helper names `<root>/<dir>` as the framework root, under merge policy allow. That
 * root's ui/lib/consequential.js re-exports the real one; its framework-remote.js is `remote`
 * (absent when null). @param {string} dir @param {string | null} remote */
function fakeFrameworkGate(dir, remote) {
  const fake = path.join(root, dir);
  const lib = path.join(fake, "ui", "lib");
  mkdirSync(lib, { recursive: true });
  const real = path.join(FRAMEWORK, "ui", "lib", "consequential.js");
  writeFileSync(path.join(lib, "consequential.js"), `export * from ${JSON.stringify(real)};\n`);
  if (remote !== null) writeFileSync(path.join(lib, "framework-remote.js"), remote);
  const helper =
    `export const FRAMEWORK_DIR = ${JSON.stringify(fake)};\n` +
    `export async function projectPolicy() { return ${allModes("allow")}; }\n`;
  return { fake, g: lonelyGate(`gate-${dir.replace(/\W/g, "-")}`, helper) };
}

test("gate: a quoted cd into a framework root whose path holds a space is denied", () => {
  const remote = path.join(FRAMEWORK, "ui", "lib", "framework-remote.js");
  const { fake, g } = fakeFrameworkGate(
    "fw with space",
    `export * from ${JSON.stringify(remote)};\n`,
  );
  // The gate compares real paths, and the tmp root can sit behind a symlink (macOS /var).
  assertDeny(g(`cd "${realpathSync(fake)}" && gh pr merge 7 --squash`), /^framework PRs/);
  assertSilent(g(PROJ_MERGE));
});

test("gate: a project merge keeps today's answer under both policies", () => {
  assertSilent(lonelyGate("proj-merge-allow", answeringHelper(allModes("allow")))(PROJ_MERGE));
  assertAsk(
    lonelyGate("proj-merge-ask", answeringHelper(allModes("ask")))(PROJ_MERGE),
    /^Merge \/ promote is consequential/,
  );
});

test("gate: a framework root without a usable framework-remote.js goes blind and names it", () => {
  const cases = /** @type {[string, string | null][]} */ ([
    ["absent", null],
    ["no-export", "export const other = 1;\n"],
  ]);
  for (const [name, remote] of cases) {
    assertAsk(
      fakeFrameworkGate(`fw-${name}`, remote).g(PROJ_MERGE),
      /looks like a merge\/promote[\s\S]*ui\/lib\/framework-remote\.js/,
    );
  }
});

#!/usr/bin/env node
/* global process */
// PreToolUse(Bash) — the consequential-action gate for the callers the PERMISSION LAYER cannot see.
//
// `canUseTool` (ui-control.js → consequentialActionGate) gates push / dependency mutation / branch
// creation, and it is the right place for that judgement. But it only exists inside sessions the
// framework's own server spawns. Two whole surfaces are outside it:
//
//   1. a terminal `claude` session, which loads this plugin and never loads canUseTool at all; and
//   2. SUB-AGENTS — `block-main-loop-mutations.sh` exits the moment it sees an `agent_id`, on
//      purpose ("this gate is about the orchestrator's ROLE, not about risk").
//
// So a sub-agent pushing from a terminal met no gate whatsoever. Two live projects had each written
// their own branch-creation hook to cover precisely this, which is the evidence that the gap is
// real and that a hook is the layer that closes it.
//
// It defers where the layer is present (XENOMOON_PERMISSION_LAYER), so one command never draws two
// prompts — a human trained to approve reflexively is worse than no gate.
//
// Matchers are IMPORTED, never restated: ui/lib/consequential.js is the single definition both
// layers read. Policy is the same `.xenomoon.json` block `getActionPolicy()` reads.
//
// Fail-OPEN on its own errors. A guard that wedges every Bash call on its own bug is a worse
// failure than the one it prevents, and this matches block-destructive-git.sh and both projects'
// guards.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // <plugin>/hooks

/** Where the framework actually is.
 *
 * FIRST the absolute path the installer recorded, because it lives inside the plugin tree and
 * therefore travels with a COPY of it. Deriving the root from the plugin's parent assumes the
 * plugin is loaded where it was built — an install route that copies the directory breaks that
 * silently, and a silent break here means this gate stops existing on the one surface it was
 * written for. Same failure the issuekit path hit, same fix.
 * @returns {string} */
function frameworkDir() {
  try {
    const recorded = readFileSync(path.join(HERE, "framework-root.generated"), "utf8")
      .split("\n")[0]
      .trim();
    if (recorded) return recorded;
  } catch {
    /* not installed through the CLI yet — fall back to the in-place layout */
  }
  return path.join(HERE, "..", "..");
}
const FRAMEWORK_DIR = frameworkDir();

// Last-resort tripwires for when the real matchers cannot be loaded. Deliberately CRUDE and
// deliberately not classifiers: their only job is to notice that something consequential-SHAPED
// went past while this gate was blind. They are kept SEPARATE by shape so the degraded path can
// still tell a push from a branch — because "sub-agents never push" is a role rule, and a blind
// gate that downgrades it to an approvable prompt reopens the hole under exactly the conditions
// (stale install, version skew) where this hook is the only thing left.
const BLIND_PUSH_RE = /\bgit\s+([^&|;]*\s)?push\b/;
const BLIND_DEPS_RE =
  /\b(npm|pnpm|yarn|bun)\s+([^&|;]*\s)?(add|install|i|remove|uninstall|rm|update|upgrade|up|dedupe)\b/;
const BLIND_BRANCH_RE = /\bgit\s+(-C\s+\S+\s+)?(branch|worktree)\b|\bgit\s+(checkout|switch)\s+-/;

/** @param {"ask" | "deny"} decision @param {string} reason */
function emit(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}
/** @param {string} reason */
const ask = (reason) => emit("ask", reason);
/** A rule about ROLE, not a question for a human — so it must never arrive as an approvable
 * prompt. @param {string} reason */
const deny = (reason) => emit("deny", reason);

/** The policy block, read exactly as config.js reads it — ASK is the default AND the fallback, and
 * only the literal "allow" allows. A typo or a stale value must never silently switch a prompt off.
 * @returns {{ push: string, dependencies: string, branchCreate: string }} */
function policy() {
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    const raw = /** @type {unknown} */ (
      JSON.parse(readFileSync(path.join(FRAMEWORK_DIR, ".xenomoon.json"), "utf8"))
    );
    saved = /** @type {{ policy?: Record<string, unknown> }} */ (raw).policy ?? {};
  } catch {
    /* absent or unreadable — every action falls back to ask below */
  }
  const mode = (/** @type {unknown} */ v) => (v === "allow" ? "allow" : "ask");
  return {
    push: mode(saved["push"]),
    dependencies: mode(saved["dependencies"]),
    branchCreate: mode(saved["branchCreate"]),
  };
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  void (async () => {
    let cmd = "";
    let isSubagent = false;
    try {
      const payload = /** @type {{ tool_input?: { command?: string }, agent_id?: string }} */ (
        JSON.parse(input)
      );
      cmd = payload.tool_input?.command;
      // The ROLE rules below are the layer's, and they must hold on this surface too — this is the
      // surface with no layer behind it. Reading agent_id here is not the sub-agent EXEMPTION the
      // role gate beside this file applies; it is the opposite, the thing that keeps a worker's
      // push a hard denial instead of a prompt somebody can approve.
      isSubagent = typeof payload.agent_id === "string" && payload.agent_id.length > 0;
    } catch {
      process.exit(0); // unparseable payload → never block
    }
    if (typeof cmd !== "string" || !cmd) process.exit(0);

    let m;
    try {
      m = await import(path.join(FRAMEWORK_DIR, "ui", "lib", "consequential.js"));
    } catch {
      // Blind, not broken. Silence would be indistinguishable from "nothing consequential
      // happened", and on this surface there is no second gate to catch what slips past. So an
      // ordinary command still runs — and a consequential-SHAPED one gets the same KIND of answer
      // it would have got with the rules loaded. Degrading a role denial into a prompt would hand
      // back the invariant precisely when the install is already broken.
      const blind = `The consequential-action gate could not load its rules (${path.join(FRAMEWORK_DIR, "ui", "lib", "consequential.js")} is unreachable), so it is judging on shape alone. Reinstall the framework.`;
      if (isSubagent && BLIND_PUSH_RE.test(cmd))
        deny(`Sub-agents never push. ${blind} A push-shaped command from a worker is refused.`);
      if (isSubagent && BLIND_DEPS_RE.test(cmd))
        deny(
          `Agents never add, remove or re-pin packages. ${blind} A dependency-shaped command from a worker is refused.`,
        );
      if (BLIND_PUSH_RE.test(cmd) || BLIND_DEPS_RE.test(cmd) || BLIND_BRANCH_RE.test(cmd))
        ask(
          `This looks like a push, a branch creation or a dependency change. ${blind} Approve only if you know this command is safe.`,
        );
      process.exit(0);
    }

    const p = policy();

    if (m.PUSH_RE.test(cmd)) {
      // Regardless of policy — the same order the permission layer uses. A sub-agent pushing is not
      // a thing to weigh; push triggers CI, CI deploys, and a deploy closes issues.
      if (isSubagent)
        deny(
          "Sub-agents never push. Push is the human's checkpoint — it triggers CI, which deploys, " +
            "which closes issues. Report ready-to-push to the orchestrator and stop there.",
        );
      if (p.push === "ask")
        ask(
          "`git push` publishes and triggers the CI deploy — the pipeline's one hard human gate. " +
            "Approve only if publishing this is the agreed next step.",
        );
    }

    if (m.mutatesDependencies(cmd)) {
      if (isSubagent)
        deny(
          "A new dependency is a DESIGN decision, not an implementation detail — agents never add, " +
            "remove or re-pin packages. It mutates the lockfile, which agents cannot clean. Name " +
            "the exact package in your report and surface the decision. To sync to the COMMITTED " +
            "lockfile use `--frozen-lockfile` or `npm ci` — those pass untouched.",
        );
      if (p.dependencies === "ask")
        ask(
          "This mutates package.json and/or the lockfile. A dependency change is a design decision, " +
            "not an implementation detail. A lockfile-faithful sync (`--frozen-lockfile`, `npm ci`) " +
            "does not ask.",
        );
    }

    if (p.branchCreate === "ask" && m.BRANCH_CREATE_RE.test(cmd))
      ask(
        "This creates a branch. Branching shapes where the work lands and how it merges — the " +
          "project's own doctrine (`.xenomoon/branch-model`). Listing, switching to an existing " +
          "branch and deleting are untouched.",
      );

    process.exit(0);
  })();
});

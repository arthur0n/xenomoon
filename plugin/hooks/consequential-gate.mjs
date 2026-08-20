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
// Money has to survive the degraded path too. The project's declared patterns are unreachable here
// (they live in a config this branch may not have read), but the well-known metered hosts are a
// constant — and a blind gate that keeps the push rule while dropping the spend rule protects
// history and lets the balance go.
const BLIND_SPEND_RE =
  /\b(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|api\.cohere\.ai|openrouter\.ai|api\.replicate\.com|api\.elevenlabs\.io)\b/i;

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

/** ONE decision for one command, whatever it does. Both paths through this hook — rules loaded and
 * rules unreachable — funnel through here, because the bug this exists to prevent was structural:
 * deciding on the first match let a human approve a prompt about one consequence while a second
 * one rode along unnamed. Denials win outright; nothing runs, so the questions are moot.
 * Returns only when there was nothing to say.
 * @param {string[]} denials @param {string[]} questions */
function decide(denials, questions) {
  if (denials.length) deny(denials.join("\n\n"));
  if (questions.length === 1) ask(questions[0] ?? "");
  if (questions.length > 1)
    ask(
      `This ONE command does ${questions.length} consequential things — approving it approves all of them:\n\n` +
        questions.map((q) => `• ${q}`).join("\n\n"),
    );
}

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
  const patterns = saved["spendPatterns"];
  return {
    push: mode(saved["push"]),
    dependencies: mode(saved["dependencies"]),
    branchCreate: mode(saved["branchCreate"]),
    spend: mode(saved["spend"]),
    spendPatterns: Array.isArray(patterns)
      ? patterns.filter((p) => typeof p === "string" && p.length > 0)
      : [],
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

    // LOADED, and the right shape. An import that merely succeeds is not enough: a stale install can
    // hold a consequential.js that predates one of these exports, in which case calling it throws
    // mid-decision and the hook dies instead of deciding — the worst outcome for the one gate that
    // exists to cover stale installs. Shape-checked, and anything unexpected routes to the blind
    // classifier below, which is exactly what that path is for.
    let m = null;
    // The reason is tracked, not just the failure. "Unreachable" and "loaded but missing an export"
    // are different repairs — one is a path problem, the other a version-skewed hook/module pair —
    // and reporting both as unreachable sends an operator hunting the filesystem while the real
    // cause is stale contents.
    let why = "";
    const modulePath = path.join(FRAMEWORK_DIR, "ui", "lib", "consequential.js");
    try {
      const mod = await import(modulePath);
      const missing = [
        ["PUSH_RE", mod.PUSH_RE instanceof RegExp],
        ["BRANCH_CREATE_RE", mod.BRANCH_CREATE_RE instanceof RegExp],
        ["mutatesDependencies", typeof mod.mutatesDependencies === "function"],
        ["spendsMoney", typeof mod.spendsMoney === "function"],
      ]
        .filter(([, ok]) => !ok)
        .map(([name]) => name);
      // The path is deliberately RELATIVE. This string lands in an approval prompt that gets
      // screenshotted and pasted into issues, and an absolute one carries the operator's username
      // and workspace layout for no diagnostic gain — the failure CLASS is what tells them what to
      // repair.
      if (missing.length)
        why = `ui/lib/consequential.js loaded but is missing: ${missing.join(", ")} (version-skewed install)`;
      else m = mod;
    } catch {
      why =
        "ui/lib/consequential.js could not be loaded at all (wrong framework root, or the file is absent)";
    }

    if (!m) {
      const blind = `The consequential-action gate is judging on shape alone: ${why}. Reinstall the framework.`;
      /** @type {string[]} */ const blindDenials = [];
      /** @type {string[]} */ const blindQuestions = [];
      const pushShaped = BLIND_PUSH_RE.test(cmd);
      const depsShaped = BLIND_DEPS_RE.test(cmd);

      if (isSubagent && pushShaped)
        blindDenials.push(
          `Sub-agents never push. ${blind} A push-shaped command from a worker is refused.`,
        );
      if (isSubagent && depsShaped)
        blindDenials.push(
          `Agents never add, remove or re-pin packages. ${blind} A dependency-shaped command from a worker is refused.`,
        );

      if (BLIND_SPEND_RE.test(cmd))
        blindQuestions.push(
          `This calls a metered API endpoint and SPENDS real credits. ${blind} Confirm the scope before approving.`,
        );
      if (!isSubagent && pushShaped) blindQuestions.push(`This looks like a push. ${blind}`);
      if (!isSubagent && depsShaped)
        blindQuestions.push(`This looks like a dependency change. ${blind}`);
      if (BLIND_BRANCH_RE.test(cmd))
        blindQuestions.push(`This looks like a branch creation. ${blind}`);

      decide(blindDenials, blindQuestions);
      process.exit(0);
    }

    const p = policy();

    // Classify EVERYTHING before deciding. Returning on the first match meant a command like
    // `curl <metered endpoint> && git checkout -b x` asked only about the spend, and approving that
    // one prompt created the branch unasked. Same fix as the permission layer, same reason.
    /** @type {string[]} */ const denials = [];
    /** @type {string[]} */ const questions = [];

    if (m.PUSH_RE.test(cmd)) {
      if (isSubagent)
        denials.push(
          "Sub-agents never push. Push is the human's checkpoint — it triggers CI, which deploys, " +
            "which closes issues. Report ready-to-push to the orchestrator and stop there.",
        );
      else if (p.push === "ask")
        questions.push(
          "`git push` publishes and triggers the CI deploy — the pipeline's one hard human gate. " +
            "Approve only if publishing this is the agreed next step.",
        );
    }

    if (m.mutatesDependencies(cmd)) {
      if (isSubagent)
        denials.push(
          "A new dependency is a DESIGN decision, not an implementation detail — agents never add, " +
            "remove or re-pin packages. It mutates the lockfile, which agents cannot clean. Name " +
            "the exact package in your report and surface the decision. To sync to the COMMITTED " +
            "lockfile use `--frozen-lockfile` or `npm ci` — those pass untouched.",
        );
      else if (p.dependencies === "ask")
        questions.push(
          "This mutates package.json and/or the lockfile. A dependency change is a design decision, " +
            "not an implementation detail. A lockfile-faithful sync (`--frozen-lockfile`, `npm ci`) " +
            "does not ask.",
        );
    }

    // Asked of every caller, sub-agents included: a worker spending is not wrong because of who it
    // is, it is wrong because nobody agreed to the cost.
    if (p.spend === "ask" && m.spendsMoney(cmd, p.spendPatterns))
      questions.push(
        "This command SPENDS real credits against a metered API. Confirm the exact scope first — " +
          "how many calls, and whether one sample was validated before a batch. A repeat run to " +
          "chase a difference inside the noise floor is the failure this gate exists for.",
      );

    if (p.branchCreate === "ask" && m.BRANCH_CREATE_RE.test(cmd))
      questions.push(
        "This creates a branch. Branching shapes where the work lands and how it merges — the " +
          "project's own doctrine (`.xenomoon/branch-model`). Listing, switching to an existing " +
          "branch and deleting are untouched.",
      );

    decide(denials, questions);

    process.exit(0);
  })();
});

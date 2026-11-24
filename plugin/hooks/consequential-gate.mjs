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
// IDENTITY BOUNDARY: the payload names no agent — only whether an `agent_id` is present. So this
// surface enforces role COARSELY (sub-agent vs main) plus per-project policy; the framework's
// named push lane (senior-analyst + push-method) is enforced by the SERVER's permission layer,
// the surface where the pipeline and autonomous runs actually execute. A sub-agent push here is a
// policy-governed question (or allow), never a silent pass and never an unappealable deny.
//
// It does NOT try to detect whether the layer is also present. Two coordination schemes were tried
// and both failed in the same direction — an inherited env marker silenced this hook in nested
// sessions the layer never mediates, and deferring the layer on this file's existence silenced the
// LAYER whenever this hook did not actually run. So both judge what they can see, and a command
// can draw two prompts in a server session. That is the accepted cost: a duplicate question is a
// nuisance, a silent allow is the failure both layers exist to prevent.
//
// Matchers are IMPORTED, never restated: ui/lib/consequential.js is the single definition both
// layers read. Policy is the SESSION's project's (#84): project-policy.mjs resolves the project
// from the payload's `cwd` and reads `<project>/.xenomoon/settings.json` through
// ui/lib/project-settings.js — never the install's `.xenomoon.json`, which one install shares
// between several projects.
//
// Fail-OPEN on its own errors. A guard that wedges every Bash call on its own bug is a worse
// failure than the one it prevents, and this matches block-destructive-git.sh and both projects'
// guards.
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The project-policy helper beside this file, loaded so that a missing or broken copy cannot kill
 * the gate. A STATIC import of it aborted this module before stdin was read: no decision was
 * printed and the command ran unasked. Shape-checked like consequential.js below; when unusable,
 * `why` names the cause and the gate judges on shape alone (the blind path needs no framework root).
 * @returns {Promise<{ helper: typeof import("./project-policy.mjs") | null, why: string }>} */
async function loadPolicyHelper() {
  try {
    const h = await import("./project-policy.mjs");
    const missing = [
      ["FRAMEWORK_DIR", typeof h.FRAMEWORK_DIR === "string" && h.FRAMEWORK_DIR.length > 0],
      ["projectPolicy", typeof h.projectPolicy === "function"],
    ]
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    if (missing.length)
      return {
        helper: null,
        why: `plugin/hooks/project-policy.mjs loaded but is missing: ${missing.join(", ")} (version-skewed install)`,
      };
    return { helper: h, why: "" };
  } catch {
    return {
      helper: null,
      why: "plugin/hooks/project-policy.mjs could not be loaded (the file is absent, or it failed at load)",
    };
  }
}

/** The approval keys this gate reads. Each must be exactly "allow" or "ask". */
const MODE_KEYS = ["push", "merge", "dependencies", "branchCreate", "spend", "migrationPush"];
/** Every action asks — the gate's OWN fallback, because it is needed precisely when the helper
 * (which holds the canonical one) is unusable or answered nonsense. */
const ALL_ASK = Object.freeze({
  ...Object.fromEntries(MODE_KEYS.map((k) => [k, "ask"])),
  spendPatterns: /** @type {string[]} */ ([]),
  migrationsPending: "",
});
/** @typedef {{ policy: Record<string, unknown> & { spendPatterns: string[], migrationsPending: string }, projectDir: string, why: string }} PolicyResult */

const INVALID_RESULT =
  "plugin/hooks/project-policy.mjs returned an invalid result (or failed) for this session";

/** The ONE place the helper's answer is checked. Anything but the exact shape — null, a
 * non-object, a policy missing or not an object, a mode other than "allow"/"ask", non-string
 * patterns, a non-string checker or directory — is replaced whole by all-ask with no project: a
 * missing mode must ask, never skip its question.
 * @param {unknown} r @returns {PolicyResult} */
function checkedPolicy(r) {
  const res = /** @type {{ policy?: unknown, projectDir?: unknown, why?: unknown } | null} */ (r);
  const p = /** @type {Record<string, unknown> | null} */ (
    res && typeof res === "object" && res.policy && typeof res.policy === "object"
      ? res.policy
      : null
  );
  const ok =
    p !== null &&
    typeof res?.projectDir === "string" &&
    MODE_KEYS.every((k) => p[k] === "allow" || p[k] === "ask") &&
    Array.isArray(p.spendPatterns) &&
    p.spendPatterns.every((s) => typeof s === "string") &&
    typeof p.migrationsPending === "string";
  if (!ok || !res) return { policy: ALL_ASK, projectDir: "", why: INVALID_RESULT };
  return {
    policy: /** @type {PolicyResult["policy"]} */ (p),
    projectDir: /** @type {string} */ (res.projectDir),
    why: typeof res.why === "string" ? res.why : "",
  };
}

/** The helper's answer for this cwd, never a throw or a rejection. Without a helper: all-ask, and
 * the helper's own failure is the reason.
 * @param {{ projectPolicy: (cwd: unknown) => unknown } | null} helper @param {string} cwd
 * @param {string} helperWhy @returns {Promise<PolicyResult>} */
async function sessionPolicy(helper, cwd, helperWhy) {
  if (!helper) return { policy: ALL_ASK, projectDir: "", why: helperWhy };
  try {
    return checkedPolicy(await helper.projectPolicy(cwd));
  } catch {
    return { policy: ALL_ASK, projectDir: "", why: INVALID_RESULT };
  }
}

const MATCHER_EXPORTS = /** @type {const} */ ([
  ["PUSH_RE", (/** @type {any} */ x) => x instanceof RegExp],
  ["MERGE_RE", (/** @type {any} */ x) => x instanceof RegExp],
  ["BRANCH_CREATE_RE", (/** @type {any} */ x) => x instanceof RegExp],
  ["pushDecision", (/** @type {any} */ x) => typeof x === "function"],
  ["mergeDecision", (/** @type {any} */ x) => typeof x === "function"],
  ["routinePushTarget", (/** @type {any} */ x) => typeof x === "function"],
  ["mutatesDependencies", (/** @type {any} */ x) => typeof x === "function"],
  ["spendsMoney", (/** @type {any} */ x) => typeof x === "function"],
  ["mergesFrameworkRepo", (/** @type {any} */ x) => typeof x === "function"],
  ["FRAMEWORK_MERGE_DENY", (/** @type {any} */ x) => typeof x === "string" && x.length > 0],
]);

/** ui/lib/framework-remote.js exports this gate calls; shape-checked like MATCHER_EXPORTS. */
const REMOTE_EXPORTS = /** @type {const} */ ([
  ["mergesFrameworkAt", (/** @type {any} */ x) => typeof x === "function"],
]);

/** The real matchers, LOADED and the right shape. An import that merely succeeds is not enough: a
 * stale install can hold a consequential.js that predates one of these exports, and calling it
 * would throw mid-decision. The root is the helper's recorded one; only when the helper is
 * unusable is the in-place layout (`<plugin>/hooks/../..`) tried, as a last attempt, so a broken
 * helper does not throw the real classifiers away. A copied plugin fails that import (or the
 * shape check) and goes blind, exactly as before.
 * @param {{ FRAMEWORK_DIR: string } | null} helper @param {string} helperWhy
 * @returns {Promise<{ m: any, root: string, why: string }>} */
async function loadMatchers(helper, helperWhy) {
  const root = helper
    ? helper.FRAMEWORK_DIR
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  let mod;
  try {
    mod = await import(path.join(root, "ui", "lib", "consequential.js"));
  } catch {
    // The path is deliberately RELATIVE: this string lands in approval prompts that get pasted
    // into issues, and an absolute one carries the operator's username for no diagnostic gain.
    return {
      m: null,
      root,
      why:
        helperWhy ||
        "ui/lib/consequential.js could not be loaded at all (wrong framework root, or the file is absent)",
    };
  }
  const missing = MATCHER_EXPORTS.filter(([name, ok]) => !ok(mod[name])).map(([name]) => name);
  if (missing.length) {
    const skew = `ui/lib/consequential.js loaded but is missing: ${missing.join(", ")} (version-skewed install)`;
    return { m: null, root, why: helperWhy ? `${helperWhy}; ${skew}` : skew };
  }
  let fr;
  try {
    fr = await import(path.join(root, "ui", "lib", "framework-remote.js"));
  } catch {
    const gone =
      "ui/lib/framework-remote.js could not be loaded (the file is absent, or it failed at load)";
    return { m: null, root, why: helperWhy ? `${helperWhy}; ${gone}` : gone };
  }
  const frMissing = REMOTE_EXPORTS.filter(([name, ok]) => !ok(fr[name])).map(([name]) => name);
  if (frMissing.length) {
    const skew = `ui/lib/framework-remote.js loaded but is missing: ${frMissing.join(", ")} (version-skewed install)`;
    return { m: null, root, why: helperWhy ? `${helperWhy}; ${skew}` : skew };
  }
  return { m: { ...mod, mergesFrameworkAt: fr.mergesFrameworkAt }, root, why: helperWhy };
}

// Last-resort tripwires for when the real matchers cannot be loaded. Deliberately CRUDE and
// deliberately not classifiers: their only job is to notice that something consequential-SHAPED
// went past while this gate was blind. They are kept SEPARATE by shape so the degraded path can
// still tell a push from a branch. Push blind-asks rather than blind-denies now: the role rule is
// WHICH lane publishes (the push stage), and this surface cannot see a lane at all — a blind deny
// would block the sanctioned stage on exactly the degraded installs where a human is watching
// anyway. The deps deny stays a deny: it names no lane, it is the same for every worker.
const BLIND_PUSH_RE = /\bgit\s+([^&|;]*\s)?push\b/;
const BLIND_MERGE_RE =
  /\bgh\s+pr\s+merge\b|\bissuekit(\.js)?\s+(pr\s+merge\b|promote\b|branch\s+prune\s+[^&|;]*--apply\b)/;
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
 * `note`, when given, is appended to the question (never counted as one).
 * @param {string[]} denials @param {string[]} questions @param {string} [note] */
function decide(denials, questions, note = "") {
  if (denials.length) deny(denials.join("\n\n"));
  const tail = note ? `\n\n${note}` : "";
  if (questions.length === 1) ask((questions[0] ?? "") + tail);
  if (questions.length > 1)
    ask(
      `This ONE command does ${questions.length} consequential things — approving it approves all of them:\n\n` +
        questions.map((q) => `• ${q}`).join("\n\n") +
        tail,
    );
}

/** Judging on shape alone: the real matchers could not be loaded. Returns only when silent.
 * @param {string} cmd @param {boolean} isSubagent @param {string} why */
function blindDecide(cmd, isSubagent, why) {
  const blind = `The consequential-action gate is judging on shape alone: ${why}. Reinstall the framework.`;
  /** @type {string[]} */ const blindDenials = [];
  /** @type {string[]} */ const blindQuestions = [];
  const pushShaped = BLIND_PUSH_RE.test(cmd);
  const depsShaped = BLIND_DEPS_RE.test(cmd);
  const mergeShaped = BLIND_MERGE_RE.test(cmd);

  if (isSubagent && depsShaped)
    blindDenials.push(
      `Agents never add, remove or re-pin packages. ${blind} A dependency-shaped command from a worker is refused.`,
    );
  if (isSubagent && mergeShaped)
    blindDenials.push(
      `Merging and promoting are the orchestrator's plumbing, never a worker's. ${blind} A merge-shaped command from a worker is refused.`,
    );

  if (BLIND_SPEND_RE.test(cmd))
    blindQuestions.push(
      `This calls a metered API endpoint and SPENDS real credits. ${blind} Confirm the scope before approving.`,
    );
  if (pushShaped)
    blindQuestions.push(
      `This looks like a push. The push lane is \`senior-analyst\` running \`push-method\`; every other lane reports ready-to-push instead of pushing. ${blind} Approve only if that lane is what is running.`,
    );
  if (!isSubagent && mergeShaped) blindQuestions.push(`This looks like a merge/promote. ${blind}`);
  if (!isSubagent && depsShaped)
    blindQuestions.push(`This looks like a dependency change. ${blind}`);
  if (BLIND_BRANCH_RE.test(cmd)) blindQuestions.push(`This looks like a branch creation. ${blind}`);

  decide(blindDenials, blindQuestions);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  void (async () => {
    let cmd = "";
    let isSubagent = false;
    /** @type {unknown} the session's folder — it, not the install, names the project */
    let cwd;
    try {
      const payload =
        /** @type {{ tool_input?: { command?: string }, agent_id?: string, cwd?: unknown }} */ (
          JSON.parse(input)
        );
      cmd = payload.tool_input?.command;
      // Only a JSON string names a folder; anything else is "no project" → every action asks.
      // A NUL cannot be part of a real path, and a C-string API would cut the value at it — the
      // cut prefix could name a real project that allows. It is "no project" too.
      cwd = typeof payload.cwd === "string" && !payload.cwd.includes("\0") ? payload.cwd : "";
      // The ROLE rules below are the layer's, and they must hold on this surface too — this is the
      // surface with no layer behind it. Reading agent_id here is not the sub-agent EXEMPTION the
      // role gate beside this file applies; it is the opposite, the thing that keeps a worker's
      // push a hard denial instead of a prompt somebody can approve.
      isSubagent = typeof payload.agent_id === "string" && payload.agent_id.length > 0;
    } catch {
      process.exit(0); // unparseable payload → never block
    }
    if (typeof cmd !== "string" || !cmd) process.exit(0);

    // The reason is tracked, not just the failure. "Unreachable" and "loaded but missing an export"
    // are different repairs — one is a path problem, the other a version-skewed hook/module pair.
    const { helper, why: helperWhy } = await loadPolicyHelper();
    const { m, root: FRAMEWORK_DIR, why } = await loadMatchers(helper, helperWhy);
    if (!m) {
      blindDecide(cmd, isSubagent, why);
      process.exit(0);
    }

    // The session's project and its policy, checked in ONE place. No project found, the shared
    // settings module unusable, the helper unusable, throwing or answering nonsense → every action
    // asks; `noProject` names the cause and rides along on the question.
    const { policy: p, projectDir, why: noProject } = await sessionPolicy(helper, cwd, why);

    // Classify EVERYTHING before deciding. Returning on the first match meant a command like
    // `curl <metered endpoint> && git checkout -b x` asked only about the spend, and approving that
    // one prompt created the branch unasked. Same fix as the permission layer, same reason.
    /** @type {string[]} */ const denials = [];
    /** @type {string[]} */ const questions = [];

    // The setup-time branch model, read once — it draws the routine line for push
    // (deploy-reaching?) and for branch creation (does the convention sanction it?).
    // FAIL-CLOSED on the doctrine module (Codex impl review, 2026-08-21): a stale or malformed
    // branch-doctrine.js returning a truthy non-doctrine object must gate, not relax — so the
    // prod branch is only trusted as a non-empty STRING, and "creation is routine" only as a
    // literal boolean true from the shared helper.
    let prod = null;
    let branchesRoutine = false;
    try {
      const bd = await import(path.join(FRAMEWORK_DIR, "ui", "lib", "branch-doctrine.js"));
      if (typeof bd.readBranchModel === "function") {
        const doctrine = bd.readBranchModel(projectDir);
        if (doctrine && typeof doctrine.prod === "string" && doctrine.prod) prod = doctrine.prod;
        if (typeof bd.branchCreationRoutine === "function")
          branchesRoutine = bd.branchCreationRoutine(doctrine) === true;
      }
    } catch {
      /* no doctrine → everything gates; fail-closed */
    }

    if (m.PUSH_RE.test(cmd)) {
      // STATED BOUNDARY (Codex plan review, 2026-08-21): this surface cannot name the caller —
      // the payload carries only agent_id presence — so it enforces role COARSELY (sub vs main)
      // plus policy. The named push lane (senior-analyst + push-method) is enforced on the server
      // surface, where the pipeline and autonomous runs actually execute. Here, the branch model
      // still draws routine vs deploy-reaching, and policy governs the consequential half.
      const target = typeof m.routinePushTarget === "function" ? m.routinePushTarget(cmd) : null;
      const reaches = prod !== null && target !== null ? target === prod : null;
      const d = m.pushDecision(null, isSubagent, p.push, reaches);
      if (d.verdict === "deny") denials.push(d.message);
      else if (d.verdict === "ask") questions.push(d.message);

      // Only on a push, because that is the moment the schema and the code can part company. The
      // checker is the project's, and it runs here rather than in the permission layer because this
      // hook fires on EVERY surface — a terminal session would otherwise push ahead of its schema
      // with nothing watching.
      if (d.verdict !== "deny" && p.migrationPush === "ask" && p.migrationsPending) {
        // Loaded the same way the matchers are — by the RECORDED framework root, never a relative
        // path, so a copied plugin still finds it. A checker we cannot load is a broken opt-in, not
        // a clean bill of health.
        let checker = null;
        try {
          ({ migrationsPending: checker } = await import(
            path.join(FRAMEWORK_DIR, "ui", "lib", "migrations.js")
          ));
        } catch {
          /* reported as broken below */
        }
        // A configured checker with nowhere to run is a broken opt-in, and running it in the wrong
        // tree would answer confidently about a repository that has no migrations. Say so instead.
        const cwdOk = (() => {
          try {
            return statSync(projectDir).isDirectory();
          } catch {
            return false;
          }
        })();
        if (!cwdOk)
          questions.push(
            "A migration check is configured but the project directory could not be resolved " +
              `(${noProject || "it is not a directory"}), so nobody has verified whether this push ` +
              "ships code ahead of its schema.",
          );
        // Only with a VALID directory. existsSync says yes to a file, and a cwd that is not a
        // directory makes execSync throw before the checker runs — which this module reads as "no
        // verdict", so a broken binding would have looked exactly like a clean bill of health.
        const result =
          cwdOk && typeof checker === "function"
            ? checker(p.migrationsPending, projectDir)
            : {
                state: /** @type {const} */ ("broken"),
                detail: cwdOk ? "its checker module could not be loaded" : "",
              };
        if (result.state === "pending")
          questions.push(
            `MIGRATIONS ARE NOT APPLIED where this push lands, so pushing ships code ahead of the schema it needs:\n${result.detail}\n` +
              "Apply them first, or approve only if you know this push does not depend on them.",
          );
        else if (cwdOk && result.state === "broken")
          questions.push(
            `A migration check is configured but it did not run: ${result.detail}. Nobody has ` +
              "verified whether this push ships code ahead of its schema — fix the check, or " +
              "approve knowing it is unguarded.",
          );
      }
    }

    if (m.mergesFrameworkAt(cmd, cwd, FRAMEWORK_DIR)) {
      // The owner merges framework PRs, whatever the project's merge policy says.
      denials.push(m.FRAMEWORK_MERGE_DENY);
    } else if (m.MERGE_RE.test(cmd)) {
      // Merge/promote: workers report merge-ready; the main loop rides policy.merge. Same shared
      // decision the permission layer uses — one definition, one answer.
      const d = m.mergeDecision(null, isSubagent, p.merge);
      if (d.verdict === "deny") denials.push(d.message);
      else if (d.verdict === "ask") questions.push(d.message);
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

    // The model is the standing answer: under pr-main/staged, creating a work branch FOLLOWS
    // the convention the human chose at setup, so it never asks — the prompt is for DEVIATIONS.
    if (p.branchCreate === "ask" && !branchesRoutine && m.BRANCH_CREATE_RE.test(cmd))
      questions.push(
        "This creates a branch, and the project's branch model does not sanction work branches " +
          "(`trunk` keeps none; no model = nothing to check against — `.xenomoon/branch-model`). " +
          "Listing, switching to an existing branch and deleting are untouched.",
      );

    // Why every action asked, when it did for a reason other than the project's own choice.
    decide(denials, questions, noProject && `Every action asks here: ${noProject}.`);

    process.exit(0);
  })();
});

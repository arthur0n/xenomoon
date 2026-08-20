// Which in-process MCP tools are "UI-control" surfaces — they only mutate local state +
// broadcast to the browser (no real side effect), so canUseTool auto-allows them without
// the permission gate. Split out of session.js to keep makeCanUseTool's complexity (and
// that file's length) in check.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
// The matchers live in ui/lib because the PreToolUse hook enforces the SAME rules on the surface
// this layer cannot see — sub-agents, and terminal sessions with no server. Two copies would mean
// two answers to "is this a push", and the permissive one would be the one that ships.
import {
  PUSH_RE,
  BRANCH_CREATE_RE,
  mutatesDependencies,
  spendsMoney,
} from "../../lib/consequential.js";
import {
  TASK_TOOL,
  ASK_TOOL,
  PROMOTE_TOOL,
  AUTONOMOUS_TOOL,
  EPIC_TOOL,
  EDIT_TOOLS,
  GENERIC_SUBAGENT_TYPES,
  FRAMEWORK_PLUGIN_DIR,
  ISSUEKIT,
  getActionPolicy,
} from "./config.js";

// These get the calling agent stamped as `_by` so the server can attribute the record
// (task/question/promotion owner). The server overrides any model-supplied `_by`.
const STAMP_BY_TOOLS = new Set([TASK_TOOL, ASK_TOOL, PROMOTE_TOOL]);
// These auto-allow with no stamp. EPIC_TOOL writes the project's tracker, but it is the
// contract surface for that exact write (template-shaped, deterministic) — gating it would
// push agents back to freehand `gh` through Bash.
const PLAIN_ALLOW_TOOLS = new Set([AUTONOMOUS_TOOL, EPIC_TOOL]);

/** Auto-allow result for a UI-control tool, or null if `toolName` isn't one.
 * @param {string} toolName @param {Record<string, unknown>} input @param {string} agent */
export function uiControlAllow(toolName, input, agent) {
  if (STAMP_BY_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: { ...input, _by: agent } };
  if (PLAIN_ALLOW_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: input };
  return null;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** The stub returned when an image Read is refused — points at the numeric gate + disk frame. */
export const SCREENSHOT_STUB =
  "Image reads are GATED (a render/screenshot frame is token-heavy base64). Framework rule: never read a frame into chat — trust the NUMERIC/deterministic gate output instead. The image stays on disk for human inspection only. If a human genuinely must eyeball it, surface that via AskUserQuestion at the END of the pipeline.";

/** Is this a Read of an image file (a screenshot/render frame)? Such a Read floods context with
 * ~thousands of base64 tokens, so it is gated (human-approved / denied when headless), never at-will.
 * @param {string} toolName @param {unknown} input @returns {boolean} */
export function isImageRead(toolName, input) {
  if (toolName !== "Read") return false;
  const fp = /** @type {{ file_path?: unknown }} */ (input)?.file_path;
  return typeof fp === "string" && IMAGE_RE.test(fp);
}

/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {{ session: { autonomousActive?: boolean }, waitFor: WaitFor, log: (dir: string, obj: OutMsg) => void, toolName: string, input: Record<string, unknown>, agent: string }} GateDeps */

/** Gate a screenshot/render-frame Read: deny outright when headless/autonomous (no human to
 * approve), else FORCE a human approval — never at-will. @param {GateDeps} d */
async function gateImageRead({ session, waitFor, log, toolName, input, agent }) {
  if (session.autonomousActive) {
    log("auto", { type: "permission", toolName, policy: "image-read-denied" });
    return { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
  }
  const { allow } = await waitFor("permission", { toolName, input, agent });
  return allow
    ? { behavior: /** @type {const} */ ("allow"), updatedInput: input }
    : { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
}

// ── Orchestrator gates (D9-priors-beat-prose) ────────────────────────────────
// The main loop routes; it never implements. These denials are MECHANICAL — the
// instruction layer kept losing to the model's generic priors, so the affordance
// is removed instead of pleaded with. Sub-agents (agent !== "main") pass through.

/** The installed agent roster (plugin/agents/*.md basenames), cached per process.
 * @returns {string[]} */
let _roster = /** @type {string[] | null} */ (null);
function pipelineRoster() {
  if (_roster) return _roster;
  try {
    _roster = readdirSync(join(FRAMEWORK_PLUGIN_DIR, "agents"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
  } catch {
    _roster = [];
  }
  return _roster;
}

// Raw `gh issue` WRITES are denied — the tracker is issuekit's, and a write that skips it skips the
// conventions and the attempt log with it. READS are not: the spine sends the orchestrator to look
// at labels and state to pick a route, and the pipeline's own sweeps (which issues are unreviewed,
// what a verdict comment says) are reads. Denying those made the router unable to do the job the
// spine assigns it, which is how a gate stops protecting anything and just gets worked around.
//
// `new` is here because it is gh's own ALIAS for `create` — the only mutating alias gh defines
// (`ls` aliases `list`, which is a read). A denylist that misses an alias denies nothing.
// Consequential actions that are JUDGEMENT, not verification. These were three shell hooks; they
// are policy now (see getActionPolicy), because "should we add this dependency" and "is this the
// moment to publish" are questions for a human, not conditions a script can decide.
//
// Unlike orchestratorGate below, these apply to EVERY agent — a sub-agent pushing is the case the
// push rule exists for.
const GH_ISSUE_WRITE_RE =
  /(^|&&|\|\||;|\|)\s*(rtk\s+)?gh\s+issue\s+(create|new|edit|comment|close|reopen|delete|lock|unlock|pin|unpin|transfer|develop)\b/;
// State-mutating git subcommands. Read verbs (status/log/diff/show/fetch/branch-list/
// worktree-list/rev-parse/ls-files) stay allowed — the orchestrator routes on them.
// Three shapes, because the mutating word is not always the subcommand:
//   1. subcommands that always mutate;
//   2. worktree/remote/submodule — the mutating VERB is the NEXT word, so their list/status
//      forms stay open (`git worktree list` is how the orchestrator checks isolation);
//   3. `git branch` — a READ by default (`-a`, `-v`, `--list`), mutating only behind a
//      delete/move/copy/force flag, so `branch -D` no longer slips through as a "read verb".
const GIT_MUTATE_SUB =
  "(add|commit|stash|rebase|merge|reset|push|pull|cherry-pick|revert|am|apply|restore|switch|checkout|rm|mv|clean|tag)\\b";
const GIT_MUTATE_NESTED =
  "worktree\\s+(add|remove|move|prune|repair|lock|unlock)\\b" +
  "|remote\\s+(add|remove|rm|rename|set-url|set-head|set-branches|prune)\\b" +
  "|submodule\\s+(add|update|init|deinit|sync|set-url|set-branch|absorbgitdirs)\\b";
const GIT_MUTATE_BRANCH_FLAG =
  "branch\\s+([^&|;]*\\s)?(-[DdMmCcf]|--(delete|move|copy|force|set-upstream-to|unset-upstream))\\b";
const GIT_MUTATE_RE = new RegExp(
  `(^|&&|\\|\\||;|\\|)\\s*(rtk\\s+)?git\\s+(-C\\s+\\S+\\s+)?(${GIT_MUTATE_SUB}|${GIT_MUTATE_NESTED}|${GIT_MUTATE_BRANCH_FLAG})`,
);

// Build/test/gate commands the main loop may never run itself. Live bite (2026-08-11): a
// developer agent died on the Bash timeout mid-gate and the Hive ran `pnpm -C worker
// validate` itself to "produce the receipt" — the exact absorb-the-worker's-job defection
// the spine forbids in prose. Verification belongs to the owning agent's context.
const BUILD_GATE_RE =
  /(^|&&|\|\||;|\|)\s*(rtk\s+)?((pnpm|npm|yarn|bun)\s+(-C\s+\S+\s+)?(run\s+)?(validate|test)\b|(npx\s+)?(vitest|jest|tsc|eslint)\b|(npx\s+)?playwright\s+test\b)/;

// The deterministic commit gate (commit-gate.sh re-derives the lane verdicts and their SHAs at
// commit time and denies anything non-green). It is CORE now, so the carve-out is universal: the
// pipeline's commit stage is the orchestrator's sanctioned direct git write — add/commit only,
// everything else stays denied. The check remains because a trimmed or hand-edited plugin tree
// without the hook must NOT get the carve-out: no gate, no exception.
let _commitGateHook = /** @type {boolean | null} */ (null);
function hasCommitGateHook() {
  _commitGateHook ??= existsSync(join(FRAMEWORK_PLUGIN_DIR, "hooks", "commit-gate.sh"));
  return _commitGateHook;
}

// NO DEFERRAL to the consequential-action hook, deliberately, and it cost two attempts to land here.
//
// An env marker was tried first — the server stamping "the layer is present" so the hook could
// stand down. Any nested process inherits it, so the hook went quiet in sessions this layer never
// mediates: the marker disabled the gate exactly where it was the only one.
//
// File-existence was tried next, this layer standing down when the hook ships. But "the file is on
// disk" is not "the gate ran": a hook that exits without a decision, or is skewed with the install,
// turns an action that needed approval into a silent allow — and it disables the fallback precisely
// when the hook may not be enforcing.
//
// So both layers judge what they can see. In a server session a consequential command can draw two
// prompts, which is a real cost paid knowingly: a duplicate question is a nuisance, a silent allow
// is the failure this whole file exists to prevent. The overlap is narrow anyway — the role gate
// already denies the main loop's mutating git, and the sub-agent DENIES below never reach a prompt
// at all.
// Hard ceiling for a Task dispatch brief; roomy enough for a real brief with a spec
// pointer + constraints, far below the re-specify-everything failure mode.
const MAX_DISPATCH_BRIEF_CHARS = 2500;

const GIT_ADD_COMMIT_ONLY_RE =
  /^(\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?(add|commit)\b[^&|;]*)(&&\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?(add|commit)\b[^&|;]*)*$/;

// The carve-out exists because commit-gate.sh judges the COMMIT. A standalone `git add` reaches no
// gate at all: nothing checks it, nothing prompts, and it stages whatever is in the user's tree for
// someone else's later commit. So staging only ever rides along with the commit it is for.
const HAS_GIT_COMMIT_RE = /(^|&&|\|\||;|\|)\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?commit\b/;

/** Deny message for a main-loop Bash command that bypasses the framework, or null.
 * Live bite (2026-08-01): the Hive hand-cranked `git commit` on the USER's working tree
 * to unblock a rebase — exactly the class the worktree-isolated developer owns.
 * @param {Record<string, unknown>} input @returns {string | null} */
function mainBashDenyMessage(input) {
  const cmd = /** @type {{ command?: unknown }} */ (input)?.command;
  if (typeof cmd !== "string") return null;
  if (hasCommitGateHook() && GIT_ADD_COMMIT_ONLY_RE.test(cmd.trim()) && HAS_GIT_COMMIT_RE.test(cmd))
    return null;
  if (GH_ISSUE_WRITE_RE.test(cmd))
    return (
      "Raw `gh issue` WRITES are denied for the orchestrator — the issue tracker is owned by " +
      "issuekit, which SHIPS with the framework. Call it by its shipped path: " +
      `\`node ${ISSUEKIT} search|new|attempt|resolve\`. ` +
      "A bare `issuekit` on PATH is NOT necessarily this one — an older copy shadows it on a " +
      "machine that installed it separately, and `npm run doctor` reports when it does. " +
      "If the repo lacks .issuekit.json, run the same path with `init` once first."
    );
  if (GIT_MUTATE_RE.test(cmd))
    return (
      "Orchestrator never touches the working tree — mutating git is denied for the main " +
      "loop (read verbs like status/log/diff stay open). Dispatch the developer agent; for " +
      "rebases/conflicts have it work in an ISOLATED git worktree so the user's uncommitted " +
      "changes are never staged, stashed, or parked. Commits land via the pipeline's commit stage."
    );
  if (BUILD_GATE_RE.test(cmd))
    return (
      "Build/test gates are denied for the main loop — verification runs in the OWNING " +
      "agent's context and comes back as a receipt; producing the receipt yourself is " +
      "absorbing the worker's job. A stalled or timed-out agent is re-dispatched once with " +
      "the same brief (spine rule), never replaced by you. Known-long gates belong in the " +
      "builder's background Bash."
    );
  return null;
}

/** Sole edit carve-out for the main loop: the debrief signal log. The orchestrator's own
 * contract says the append is "deterministic, same turn, never skipped" (webapp
 * orchestrator.md) — a bookkeeping line, not implementation. Everything else delegates.
 * @param {Record<string, unknown>} input */
function isQueueAppend(input) {
  const fp = /** @type {{ file_path?: unknown }} */ (input)?.file_path;
  return typeof fp === "string" && fp.endsWith(".xenomoon/debrief-queue.md");
}

/** Deny main-loop calls that bypass the framework: direct edits (delegate instead),
 * generic subagents (the roster owns the work), raw `gh issue` (issuekit owns issues).
 * Returns a deny decision or null. @param {GateDeps} d */
function orchestratorGate({ log, toolName, input, agent }) {
  if (agent !== "main") return null;
  const deny = (/** @type {string} */ message) => {
    log("auto", { type: "permission", toolName, policy: "orchestrator-gate" });
    return { behavior: /** @type {const} */ ("deny"), message };
  };
  if (EDIT_TOOLS.has(toolName) && !isQueueAppend(input)) {
    return deny(
      `Orchestrator never implements — main-loop ${toolName} is denied by the session. ` +
        `Dispatch the owning agent (installed roster: ${pipelineRoster().join(", ") || "see plugin/agents/"}) ` +
        "and let it make the change in its own context.",
    );
  }
  if (toolName === "Task") {
    const type = /** @type {{ subagent_type?: unknown }} */ (input)?.subagent_type;
    if (typeof type === "string" && GENERIC_SUBAGENT_TYPES.has(type) && pipelineRoster().length) {
      return deny(
        `Generic agent "${type}" is denied — the installed roster owns this work ` +
          `(${pipelineRoster().join(", ")}). Dispatch the matching agent; discovery belongs ` +
          "to the owning agent, not a pre-dispatch scout.",
      );
    }
    // Over-long briefs re-specify what the worker should discover, and were the likely
    // cause of live agent stalls (2026-08-11: 400-700-word briefs repeated verbatim each
    // round). The spine already says hand work onward by file reference.
    const prompt = /** @type {{ prompt?: unknown }} */ (input)?.prompt;
    if (typeof prompt === "string" && prompt.length > MAX_DISPATCH_BRIEF_CHARS) {
      return deny(
        `Dispatch brief is ${prompt.length} chars (max ${MAX_DISPATCH_BRIEF_CHARS}) — briefs ` +
          "carry pointers, not payload. Pass file references (spec path, issue #, handoff " +
          "file under .xenomoon/handoffs/) and let the owning agent do its own discovery.",
      );
    }
  }
  if (toolName === "Bash") {
    const message = mainBashDenyMessage(input);
    if (message) return deny(message);
  }
  return null;
}

/** Which consequential things does ONE command do? Every category is classified BEFORE anything is
 * decided — returning on the first match meant `git push && npm install lodash` asked only about
 * the push, and approving that single prompt ran the install unasked.
 * @param {string} cmd @param {ReturnType<typeof getActionPolicy>} policy @param {boolean} isSubagent
 * @returns {{ denials: string[], questions: string[], kinds: string[] }} */
function classifyConsequential(cmd, policy, isSubagent) {
  /** @type {string[]} */ const denials = [];
  /** @type {string[]} */ const questions = [];
  /** @type {string[]} */ const kinds = [];

  if (PUSH_RE.test(cmd)) {
    // A sub-agent NEVER pushes, whatever the policy says: push triggers CI, CI deploys, and a
    // deploy closes issues. That chain starts with a person, not with a worker finishing early.
    if (isSubagent)
      denials.push(
        "Sub-agents never push. Push is the human's checkpoint — it triggers CI, which deploys, " +
          "which closes issues. Report ready-to-push to the orchestrator and stop there.",
      );
    else if (policy.push === "ask") {
      kinds.push("push");
      questions.push(
        "`git push` publishes and triggers the CI deploy — the pipeline's one hard human gate.",
      );
    }
  }

  if (mutatesDependencies(cmd)) {
    if (isSubagent)
      denials.push(
        "A new dependency is a DESIGN decision, not an implementation detail — agents never add, " +
          "remove or re-pin packages. It mutates the lockfile, which agents cannot clean (an " +
          "uninvited install once wrote a ~350-line subtree nobody could unpick). Name the exact " +
          "package in your report and surface the decision. To sync to the COMMITTED lockfile use " +
          "`--frozen-lockfile` or `npm ci` — those pass untouched.",
      );
    else if (policy.dependencies === "ask") {
      kinds.push("dependencies");
      questions.push(
        "This mutates package.json and/or the lockfile. A dependency change is a design decision. " +
          "A lockfile-faithful sync (`--frozen-lockfile`, `npm ci`) does not ask.",
      );
    }
  }

  // Money. Unlike the others this is not about history or the lockfile — it is a balance that does
  // not come back. A live project watched an agent drain a prepay balance in one session because
  // `Bash(curl *)` and `Bash(node *)` are allow-listed, and only an ask overrides an allow rule.
  // Asked of every caller, sub-agents included: a worker spending is not wrong because of who it
  // is, it is wrong because nobody agreed to the cost.
  if (policy.spend === "ask" && spendsMoney(cmd, policy.spendPatterns)) {
    kinds.push("spend");
    questions.push(
      "This command SPENDS real credits against a metered API. Confirm the exact scope first — how " +
        "many calls, and whether one sample was validated before a batch. A repeat run to chase a " +
        "difference inside the noise floor is the failure this gate exists for.",
    );
  }

  if (BRANCH_CREATE_RE.test(cmd) && policy.branchCreate === "ask") {
    kinds.push("branch-create");
    questions.push(
      "This creates a branch. Branching shapes where the work lands and how it merges — the " +
        "project's own doctrine (`.xenomoon/branch-model`). Listing, switching to an existing " +
        "branch and deleting are untouched.",
    );
  }

  // Denials win: nothing runs, so the questions are moot.
  return { denials, questions, kinds };
}

/**
 * Push, dependency changes and branch creation — the three the framework used to gate with shell
 * hooks. Every agent passes through here, because "a sub-agent must never push" is the whole point.
 *
 * There is no "ask" verdict at this layer: the SDK's PermissionResult is allow or deny. An ASK is
 * therefore a real round-trip to the human (`waitFor("permission", …)`), which is also what makes
 * it honest — the prompt cannot be satisfied by a session policy that happens to auto-allow.
 *
 * @param {GateDeps} d
 * @returns {Promise<{ behavior: "deny", message: string } | { behavior: "allow", updatedInput: Record<string, unknown> } | null>}
 */
async function consequentialActionGate({ session, waitFor, log, toolName, input, agent }) {
  if (toolName !== "Bash") return null;
  const cmd = /** @type {{ command?: unknown }} */ (input)?.command;
  if (typeof cmd !== "string") return null;
  const policy = getActionPolicy();
  const isSubagent = agent !== "main";

  /** @param {string} message */
  const deny = (message) => ({ behavior: /** @type {const} */ ("deny"), message });
  /** A human decides, right now. Autonomous runs cannot answer, so they are refused instead.
   * @param {string} what @param {string} message */
  const askHuman = async (what, message) => {
    if (session.autonomousActive) {
      log("auto", { type: "permission", toolName, policy: `${what}-denied-autonomous` });
      return deny(`${message} (An autonomous run cannot answer this, so it is refused.)`);
    }
    // The REASON travels with the question. Without it the card shows only the command, and the
    // classification this gate just did — "this one command does 4 consequential things" — is
    // computed and thrown away, leaving the human to approve a metered API call with no idea it
    // costs anything.
    const { allow } = await waitFor("permission", { toolName, input, agent, reason: message });
    return allow
      ? { behavior: /** @type {const} */ ("allow"), updatedInput: input }
      : deny(message);
  };

  const { denials, questions, kinds } = classifyConsequential(cmd, policy, isSubagent);
  if (denials.length) return deny(denials.join("\n\n"));
  if (questions.length)
    return askHuman(
      kinds.join("+"),
      questions.length === 1
        ? (questions[0] ?? "")
        : `This ONE command does ${questions.length} consequential things — approving it approves all of them:\n\n` +
            questions.map((q) => `• ${q}`).join("\n\n"),
    );

  return null;
}

/** Deterministic pre-gates run BEFORE the permission policy: the consequential-action gate (push / dependencies / branch creation, every agent), the
 * orchestrator role gate
 * (main loop never implements / never goes generic / never freehands the tracker) and the
 * screenshot read gate. Returns a decision to short-circuit, or null to fall through.
 * Keeps makeCanUseTool's arrow under the complexity cap and its file under the line cap.
 * @param {GateDeps} d */
export async function preToolGate({ session, waitFor, log, toolName, input, agent }) {
  const consequential = await consequentialActionGate({
    session,
    waitFor,
    log,
    toolName,
    input,
    agent,
  });
  if (consequential) return consequential;
  const role = orchestratorGate({ session, waitFor, log, toolName, input, agent });
  if (role) return role;
  if (isImageRead(toolName, input))
    return gateImageRead({ session, waitFor, log, toolName, input, agent });
  return null;
}

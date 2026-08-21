// issuekit commit — the pipeline's commit stage, as a TOOL.
//
// Three layers own this stage and none of them replaces the others:
//   the TOOL (here) performs the commit and the bookkeeping that follows it, in one call;
//   the HOOK (plugin/hooks/commit-gate.sh) judges any commit, including one typed by hand;
//   the SKILL carries the method — when a commit is earned, what belongs in the message.
//
// The verdict is NOT re-implemented here. This calls the same gate script the hook calls, with the
// command it is about to run, and obeys the answer. One implementation of "is this green", so the
// tool and the hook can never disagree — which is the failure mode a second copy would guarantee.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, gh, git, resolveRepo, maybeSwitchUser, str } from "./issuekit-lib.js";

/** @typedef {import("./issuekit-lib.js").Flags} Flags */

const GATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "plugin",
  "hooks",
  "commit-gate.sh",
);

/**
 * Ask the commit gate about a command, exactly as the hook would.
 * @param {string} command @returns {{ decision: string, reason: string }}
 */
function askGate(command) {
  if (!existsSync(GATE)) return { decision: "missing", reason: `no commit gate at ${GATE}` };
  const payload = JSON.stringify({ tool_input: { command } });
  const r = run("bash", [GATE], { input: payload, allowFail: true });
  // A gate that could not run is not a gate that said yes. Every command this function is asked
  // about IS a commit (cmdCommit built it), so silence means the gate broke — bash missing, jq
  // missing, an early exit — and the commit waits for a human rather than proceeding unchecked.
  if (!r.out)
    return {
      decision: "ask",
      reason: `the commit gate produced no decision (exit ${r.status}${r.err ? `: ${r.err}` : ""}) — it may be broken or missing a dependency`,
    };
  try {
    /** @type {unknown} */
    const raw = JSON.parse(r.out);
    const out =
      /** @type {{ hookSpecificOutput?: { permissionDecision?: string, permissionDecisionReason?: string } }} */ (
        raw && typeof raw === "object" ? raw : {}
      );
    return {
      decision: out.hookSpecificOutput?.permissionDecision ?? "ask",
      reason: out.hookSpecificOutput?.permissionDecisionReason ?? "",
    };
  } catch {
    return { decision: "ask", reason: `gate output was unreadable: ${r.out.slice(0, 200)}` };
  }
}

/**
 * An ASK is a question for a human. Proceeding anyway is allowed ONLY when someone decided to, and
 * only with a reason recorded on the issue first — an override that leaves no trace is
 * indistinguishable from a gate that never ran, and an interrupted run must leave the
 * justification rather than a silent commit.
 * @param {string} repo @param {string} num @param {Flags} flags @param {string} decision @param {string} reason
 */
function recordOverrideOrRefuse(repo, num, flags, decision, reason) {
  const why = str(flags.reason);
  if (!flags.force || !why)
    throw new Error(
      `the commit gate did not clear this commit (${decision}):\n  ${reason}\n` +
        "A human decides this one. Re-run the stage that is missing, or — if they have decided to\n" +
        'proceed anyway — record why: --force --reason "<who decided, and on what basis>".',
    );
  const noted = gh(
    [
      "issue",
      "comment",
      String(num),
      "-R",
      repo,
      "--body",
      `## ⚠️ COMMIT GATE OVERRIDDEN\n\n**Gate said:** ${decision} — ${reason}\n**Reason given:** ${why}\n\n*issuekit commit --force*`,
    ],
    { allowFail: true },
  );
  if (noted.status !== 0)
    throw new Error(
      `could not record the override on #${num} (${noted.err || "gh failed"}) — refusing to commit.\n` +
        "An override nobody can find later is worse than the gate it skipped.",
    );
  console.log(`override recorded on #${num}: ${why}`);
}

/**
 * `issuekit commit <#N> -m "<message>"` — commit the staged fix for an issue, then reconcile its
 * deploy-gate labels. Never pushes: publishing is the push stage's (`senior-analyst` +
 * `push-method`, gated by the branch model and policy.push).
 * @param {string} num @param {Flags} flags
 */
export function cmdCommit(num, flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  if (!/^\d+$/.test(num))
    throw new Error('commit needs an issue number: `issuekit commit 42 -m "…"`');

  const message = str(flags.m) ?? str(flags.message);
  if (!message) throw new Error('commit needs a message: `issuekit commit 42 -m "fix: … (#42)"`');
  // The reference is the pipeline's thread between a commit and its issue — and it is what the gate
  // and the label reconciliation both key on. Add it rather than failing on a message that forgot.
  //
  // But a message citing a DIFFERENT issue splits the stage in two: the gate would judge the issue
  // in the message while the labels — and any override record — landed on the one in the argument.
  // The evidence has to sit on the issue whose gate was actually judged, so a mismatch is refused
  // before anything is asked, posted or committed.
  const cited = [...message.matchAll(/\(#(\d+)\)/g)].map((m) => m[1]);
  const wrong = cited.filter((c) => c !== num);
  if (wrong.length)
    throw new Error(
      `the message cites (#${wrong.join("), (#")}) but you asked to commit #${num}. ` +
        "The gate would judge one issue while the labels landed on another — commit the issue the " +
        "message is about, or fix the message.",
    );
  const full = cited.length ? message : `${message} (#${num})`;

  if (!git(["diff", "--cached", "--name-only"]))
    throw new Error("nothing staged — stage the fix first (the commit stage records what QA saw)");

  const { decision, reason } = askGate(`git commit -m ${JSON.stringify(full)}`);
  // A DENY is final: no flag overrides a blocking verdict.
  if (decision === "deny") throw new Error(`the commit gate refused this commit:\n  ${reason}`);
  if (decision !== "allow") recordOverrideOrRefuse(repo, num, flags, decision, reason);

  const r = run("git", ["commit", "-m", full], { allowFail: true });
  if (r.status !== 0) throw new Error(`git commit failed:\n${r.err || r.out}`);

  // Confirm the commit actually landed before touching labels: a pre-commit hook can fail after the
  // gate said yes, and labels claiming a fix is committed when it is not are worse than no labels.
  const subject = git(["log", "-1", "--pretty=%s"]);
  if (!subject.includes(`(#${num})`))
    throw new Error(`commit did not land as expected (HEAD is "${subject}") — labels NOT changed`);
  const sha = git(["rev-parse", "--short", "HEAD"]);

  // Bookkeeping, in the same call as the act it records. This used to be a separate model step, and
  // skipping it left merged fixes open forever (the deploy workflow closes on `fixed-pending-deploy`).
  const labelled = gh(
    [
      "issue",
      "edit",
      String(num),
      "-R",
      repo,
      "--add-label",
      "committed",
      "--add-label",
      "fixed-pending-deploy",
      "--remove-label",
      "needs-deploy",
    ],
    { allowFail: true },
  );
  console.log(`committed ${sha} — ${full}`);
  if (labelled.status === 0) console.log(`  #${num}: committed + fixed-pending-deploy`);
  else
    console.log(
      `  #${num}: LABELS NOT SET (${labelled.err || "gh failed"}) — the deploy workflow closes on\n` +
        "  fixed-pending-deploy, so set it by hand or this fix stays open after it ships.",
    );
  console.log("  not pushed — publishing is the push stage's.");
}

/** What counts as a CONSEQUENTIAL command — one definition, for every layer that gates one.
 *
 * These matchers are enforced twice over, and the two enforcers cannot be allowed to disagree:
 *
 *   - the permission layer (`ui-control.js` → `consequentialActionGate`), which sees only the
 *     sessions the framework's own server spawns; and
 *   - the PreToolUse hook (`plugin/hooks/consequential-gate.mjs`), which is the ONLY thing standing
 *     between a sub-agent — or any terminal session — and the same command, because the role gate
 *     beside it deliberately exits for sub-agents.
 *
 * A second definition is a second answer to "is this a push", and the layer that says no is the one
 * that ships. This is the `commit-parse.sh` doctrine — two hooks, one parser — in JS.
 *
 * NO IMPORTS, deliberately. A hook must be able to load this without pulling in `config.js`, whose
 * import triggers a load-time domain/engine probe (the same reason `skill-registry.js` refuses it).
 */

// ── push ─────────────────────────────────────────────────────────────────────
/** `git push` anywhere in a command line, including behind `rtk` and `-C <path>`. */
export const PUSH_RE = /(^|&&|\|\||;|\|)\s*(rtk\s+)?git\s+(-C\s+\S+\s+)?push\b/;

// ── the push lane ────────────────────────────────────────────────────────────
/** The ONE agent that may publish — the pipeline's push STAGE. Named here, once, so the permission
 * layer and the hook cannot disagree about who the sanctioned pusher is. */
export const PUSH_AGENT = "senior-analyst";
/** The skill that stage runs: verify the gates, then push. */
export const PUSH_SKILL = "push-method";

/** A dispatch may name an agent plugin-qualified (`xenomoon:senior-analyst`) or bare. Compare on
 * the bare name — an exact-string match would read the sanctioned lane as "some other sub-agent"
 * on exactly the installs that namespace it, turning the push stage into a dead end.
 * @param {string} agent */
const bareAgent = (agent) => agent.slice(agent.lastIndexOf(":") + 1);

export const MAIN_PUSH_DENY =
  "Orchestrator never publishes — push is a pipeline STAGE, not a main-loop command. Dispatch " +
  '`senior-analyst` with the `push-method` skill (e.g. "Push the committed work for issue #42 ' +
  'in owner/repo — run the `push-method` skill."). That lane is ADVERSARIAL to the author: it ' +
  "verifies the branch, the verdicts and the checks, pushes only when clean, and FLAGS any " +
  "problem instead of fixing it. This is routing, not a dead end: the push happens, in the lane " +
  "that owns it.";

export const OTHER_AGENT_PUSH_DENY =
  "Publishing belongs to the push STAGE — `senior-analyst` running `push-method` — never to the " +
  "lane that authored the work: the pusher is adversarial to the author by design. Report " +
  "ready-to-push instead: the branch, the commits, and what a push would publish. The " +
  "orchestrator dispatches the push stage from that report.";

export const PUSH_LANE_ASK =
  "This push REACHES THE DEPLOY BRANCH (or its target cannot be named), so it ships — the " +
  "pipeline's last gate, and this is the push lane (`push-method`) asking for it. Approve once " +
  "the branch is fast-forward on the intended remote, the commit gate's verdicts are green and " +
  "unblocked, and the checks are not red. A routine work-branch push under this project's branch " +
  "model does not ask — but ONLY in the bare shape `git push <remote> <branch>`: any chained " +
  "command (`; echo …` exit-capture included), redirect or extra flag gates as unnameable.";

export const UNKNOWN_AGENT_PUSH_ASK =
  "`git push` toward the deploy branch (or an unnamed target). This surface cannot tell WHICH " +
  "agent is asking, so the question comes to you: the push lane is `senior-analyst` running " +
  "`push-method` — adversarial to the author — and every other lane reports ready-to-push " +
  "instead of pushing. Approve only if that lane is what is running. (A routine work-branch " +
  "push does not ask — but only in the bare shape `git push <remote> <branch>`; chains, " +
  "redirects and extra flags gate as unnameable.)";

export const TOP_LEVEL_PUSH_ASK =
  "`git push` toward the deploy branch (or an unnamed target) — the pipeline's last gate. Inside " +
  "the framework the push stage is `senior-analyst` + `push-method`; from a plain terminal " +
  "session this prompt IS that gate. Approve only if publishing this is the agreed next step.";

/** @typedef {{ verdict: "allow" | "ask" | "deny", message: string }} LaneDecision */

/**
 * Who may push, and how. Role first, then the branch model's line between routine and consequential:
 *
 *   - the orchestrator NEVER pushes, whatever the policy says — a routing rule, which is what lets
 *     `push` live here instead of in the mutating-git role regexes (push publishes; it does not
 *     mutate the tree);
 *   - only the push lane (PUSH_AGENT) publishes, and it is a DIFFERENT agent from the one that
 *     authored the work — adversarial by design: verify, push when clean, FLAG problems, never fix;
 *   - a push that does NOT reach the deploy branch is the pipeline's routine work (opening a PR
 *     path under `pr-main`, feeding the dev branch under `staged`) and is allowed for the lane;
 *   - a push that reaches the deploy branch — or whose target cannot be named — is the
 *     consequential half, governed by `policy.push` (`ask` default, `allow` per-project opt-in).
 *
 * @param {string | null} agent exact identity ("main" or an agent name), or null where the surface
 *   cannot name it (the PreToolUse hook sees only whether an `agent_id` is present)
 * @param {boolean} isSubagent did a sub-agent raise this call at all
 * @param {"ask" | "allow"} policy `.xenomoon.json` → policy.push
 * @param {boolean | null} deployReaching does this push land on a deploy branch — null when the
 *   target could not be determined (bare `git push`, unknown refspec), which gates like true
 * @returns {LaneDecision} */
export function pushDecision(agent, isSubagent, policy, deployReaching) {
  if (agent === "main") return { verdict: "deny", message: MAIN_PUSH_DENY };
  if (agent !== null && bareAgent(agent) !== PUSH_AGENT)
    return { verdict: "deny", message: OTHER_AGENT_PUSH_DENY };
  if (deployReaching === false) return { verdict: "allow", message: "" };
  if (policy === "allow") return { verdict: "allow", message: "" };
  if (agent !== null) return { verdict: "ask", message: PUSH_LANE_ASK };
  return { verdict: "ask", message: isSubagent ? UNKNOWN_AGENT_PUSH_ASK : TOP_LEVEL_PUSH_ASK };
}

/**
 * THREAT BOUNDARY, stated once for every matcher in this file: these gates are guardrails against
 * agent DRIFT — an agent typing the honest command gets the honest rule. They are not a sandbox
 * against deliberate evasion (`sh -c`, `env` prefixes, aliases, xargs): every hook in this
 * framework is fail-open regex by the same deliberate stance, and a session determined to evade
 * its own guardrails is a trust failure no matcher fixes.
 *
 * The branch a push lands on — but ONLY when the command is the one ROUTINE shape, fail-closed:
 *
 *   [rtk] git [-C <dir>] push [-u|--set-upstream] <remote> <branch>
 *
 * Single bare remote, single bare branch, nothing else. Any other form — bare `git push`, a colon
 * refspec, `--delete`, `--mirror`, `--all`, `--tags`, `--force*`, `--repo`, `-o`, quoted refs,
 * chains around it — returns null, and null GATES. A publish gate must never guess what git would
 * do with flag arity; the narrow shape is the one whose meaning is beyond argument, and the push
 * lane's skill is told to use exactly it.
 * @param {string} cmd @returns {string | null} the branch, or null = not the routine shape */
export function routinePushTarget(cmd) {
  const m =
    /^\s*(?:rtk\s+)?git\s+(?:-C\s+\S+\s+)?push\s+(?:(?:-u|--set-upstream)\s+)?([A-Za-z0-9._][A-Za-z0-9._-]*)\s+([A-Za-z0-9._/][A-Za-z0-9._/-]*)\s*$/.exec(
      cmd,
    );
  if (!m) return null;
  const branch = /** @type {string} */ (m[2]);
  if (branch === "HEAD") return null;
  return branch;
}

// ── merge / promote ──────────────────────────────────────────────────────────
/** PR-merge and promote commands — `gh pr merge`, `issuekit pr merge|promote`, and the destructive
 * half of `issuekit branch prune`. Plain `git merge` is NOT this: that is tree work inside a
 * branch, and the mutating-git role rules own it. Matches issuekit whether invoked bare or by its
 * shipped path (`node …/issuekit.js`). */
export const MERGE_RE = new RegExp(
  "(^|&&|\\|\\||;|\\|)\\s*(rtk\\s+)?(" +
    "gh\\s+pr\\s+merge\\b" +
    "|(node\\s+\\S*issuekit\\.js\\s+|issuekit\\s+)" +
    "(pr\\s+merge\\b|promote\\b|branch\\s+prune\\s+[^&|;]*--apply\\b)" +
    ")",
);

export const SUBAGENT_MERGE_DENY =
  "Merging and promoting are the orchestrator's plumbing, never a worker's. Report merge-ready — " +
  "the PR number and its checks state — and stop there.";

export const MERGE_ASK =
  "Merge / promote is consequential and irreversible. Approve only if this merge is the agreed " +
  "next step and its checks are green (`issuekit pr merge <PR#> --when-green` refuses on a red " +
  "run instead of merging blind).";

/**
 * Who may merge a PR / promote, and how. Sub-agents never do (they report merge-ready); the main
 * loop is governed by `policy.merge` — `ask` puts a human on it, `allow` is the per-project opt-in
 * that lets an autonomous pipeline merge when its goal orders it.
 * @param {string | null} agent @param {boolean} isSubagent @param {"ask" | "allow"} policy
 * @returns {LaneDecision} */
export function mergeDecision(agent, isSubagent, policy) {
  if (isSubagent) return { verdict: "deny", message: SUBAGENT_MERGE_DENY };
  if (policy === "allow") return { verdict: "allow", message: "" };
  return { verdict: "ask", message: MERGE_ASK };
}

// ── dependencies ─────────────────────────────────────────────────────────────
/** Lifecycle verbs that write package.json or the lockfile. `update`/`upgrade`/`dedupe` re-pin, and
 * the denial message claims agents never re-pin — so the matcher has to agree with it. */
const DEP_VERBS = new Set([
  "add",
  "remove",
  "install",
  "i",
  "uninstall",
  "rm",
  "update",
  "upgrade",
  "up",
  "dedupe",
]);
/** Package-manager options that consume the NEXT token, so the verb is not where it looks. */
const DEP_VALUE_FLAGS = new Set([
  "-C",
  "--dir",
  "--cwd",
  "--prefix",
  "--filter",
  "-F",
  "--workspace",
  "-w",
]);
// A faithful sync mutates nothing — it installs exactly what the committed lockfile says.
const DEP_FAITHFUL_RE = /--frozen-lockfile|(^|[^\w])npm\s+ci(\s|$)/;

/**
 * The lifecycle verb one package-manager invocation actually runs, or null.
 *
 * A regex demanding the verb right after the binary missed every workspace shape —
 * `pnpm -C worker add x`, `pnpm --filter web update react`, `npm --workspace ui install x`,
 * `yarn workspace app add react` — which is precisely where an unintended lockfile change is
 * hardest to notice. So: find the manager, then walk past its options (and the values they eat) to
 * the first real token.
 * @param {string} seg @returns {string | null}
 */
export function packageManagerVerb(seg) {
  const tokens = seg.trim().split(/\s+/).filter(Boolean);
  let i = tokens.findIndex((t) => ["pnpm", "npm", "yarn", "bun"].includes(t));
  if (i === -1) return null;
  i += 1;
  while (i < tokens.length) {
    const t = tokens[i] ?? "";
    if (t.startsWith("-")) {
      i += DEP_VALUE_FLAGS.has(t) ? 2 : 1;
      continue;
    }
    // `yarn workspace <name> <verb>` / `pnpm workspace <name> <verb>`
    if (t === "workspace" || t === "workspaces") {
      i += 2;
      continue;
    }
    return t;
  }
  return null;
}

/**
 * Does this command line mutate dependencies ANYWHERE in it?
 *
 * Classified PER SEGMENT: testing the faithful-sync exemption against the whole string was
 * launderable, because `npm ci && npm install lodash` contains a faithful sync and the whole line
 * then read as faithful. A safe neighbour does not vouch for a risky one.
 * @param {string} cmd @returns {boolean}
 */
export function mutatesDependencies(cmd) {
  return cmd.split(/&&|\|\||;|\|/).some((seg) => {
    const verb = packageManagerVerb(seg);
    return verb !== null && DEP_VERBS.has(verb) && !DEP_FAITHFUL_RE.test(seg);
  });
}

// ── spend ────────────────────────────────────────────────────────────────────
/** Commands that call a metered model endpoint directly, recognised without any project setup.
 *
 * A live project learned this the hard way: an agent drained a prepay balance in one session,
 * batch-generating images before validating one and re-running an eval four times to chase a
 * difference inside its own noise floor. Nothing stopped it, because `Bash(curl *)` and
 * `Bash(node *)` are allow-listed — and a PreToolUse `ask` is the ONLY layer that overrides an
 * allow rule.
 *
 * These defaults are the floor: a project that spends money through its OWN scripts must say so,
 * because no framework can know that `scripts/eval.ts` costs $0.16 a run. */
// Case-INSENSITIVE: hostnames are, so `API.OPENAI.COM` reaches the same billed endpoint as
// `api.openai.com`. A matcher that only knows the lowercase spelling is a bypass anyone can hit by
// pasting a URL from documentation.
export const DEFAULT_SPEND_RE =
  /\b(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|api\.cohere\.ai|openrouter\.ai|api\.replicate\.com|api\.elevenlabs\.io)\b/i;

/** Binaries that can actually RUN something (and therefore spend). Everything absent from this set
 * — grep, rg, sed, awk, cat, echo, ls, git, jq, find, pgrep — only INSPECTS, whatever it is holding
 * in its arguments. */
const RUNNERS = new Set([
  "pnpm",
  "npm",
  "npx",
  "pnpx",
  "yarn",
  "bun",
  "bunx",
  "node",
  "deno",
  "tsx",
  "ts-node",
  "python",
  "python3",
  "bash",
  "sh",
  "zsh",
  "curl",
  "wget",
  "make",
  // Runners that reach a network the same way the ones above do. Named explicitly rather than
  // left to the unknown-token path, because the hostname test below is now segment-scoped: an
  // executor absent from this set reads as prose and stays silent.
  "http",
  "httpie",
  "xh",
  "docker",
  "podman",
  "uv",
  "uvx",
  "pipx",
  "go",
  "cargo",
  "ruby",
  "php",
  "perl",
]);

/** Commands that PREFIX a real command without being one: the executable is further right. */
const SPEND_WRAPPERS = new Set([
  "rtk",
  "command",
  "env",
  "time",
  "nice",
  "nohup",
  "sudo",
  "xargs",
  "timeout",
]);

/**
 * The command split into what the shell would RUN and the bodies of heredocs fed to a runner.
 *
 * A quoted-delimiter heredoc (`<<'EOF'` / `<<"EOF"`) undergoes no expansion — it is literal bytes.
 * When the line introducing it runs a non-executor (`cat > report.md`, `tee`, `mkdir -p x && cat >
 * y`), those bytes are FILE CONTENT and the shell never runs a word of them. Scanning them for
 * spend is scanning a document, and it produced the noisiest false positive of all: an issue report
 * ABOUT this gate quoted `curl https://api.openai.com/...` as its own evidence, and writing the
 * report asked for spend consent.
 *
 * The exemption is withheld exactly where the body IS executed. An UNQUOTED delimiter expands, so
 * `$(…)` inside it runs — that body is left inline and segment-scoped like any other text. A body
 * fed to a RUNNER (`bash <<'EOF'`, `python3 <<'EOF'` — stdin is a script) comes back separately in
 * `executed`, because segment scoping cannot read it: a metered host inside a Python script sits on
 * a line whose first word is `import` or `urllib`, not a binary. An executor was handed the whole
 * body, so the whole body is the haystack.
 * @param {string} cmd @returns {{ rest: string, executed: string }}
 */
function splitHeredocs(cmd) {
  const lines = cmd.split("\n");
  /** @type {string[]} */
  const rest = [];
  /** @type {string[]} */
  const executed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    rest.push(line);
    const m = /<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (!m) continue;
    const delim = m[2];
    let j = i + 1;
    while (j < lines.length && (lines[j] ?? "").trim() !== delim) j++;
    const body = lines.slice(i + 1, j);
    // The introducing line minus its redirection — what would actually run.
    if (isRunner(segmentExecutable(line.split("<<")[0] ?? ""))) executed.push(...body);
    // An unterminated heredoc means the rest of the string is body; it leaves `rest` either way.
    i = Math.min(j, lines.length - 1);
  }
  return { rest: rest.join("\n"), executed: executed.join("\n") };
}

/**
 * The command line split into the pieces the shell would run separately.
 *
 * Deliberately NOT `mutatesDependencies`' split (above): that gate has its own live-bite history
 * and its own shape, and one shared splitter would make a fix for either one a change to both.
 *
 * Command substitution and grouping normalise to separators FIRST, before the split: without it
 * `echo $(pnpm eval:test)` reads as an `echo` — an inspection command — while the shell really
 * runs the paid one inside it.
 * @param {string} cmd @returns {string[]}
 */
function splitSegments(cmd) {
  return (
    cmd
      // ONLY the openers become separators. Closing `)` / `}` deliberately do NOT: normalising them
      // too shredded a runner away from its own argument — `node -e "fetch('https://host/x')"` split
      // at the paren, leaving the hostname in a segment whose "executable" was a quoted URL, and the
      // one genuine spend in that shape went silent. The opener is what hides a command; the closer
      // hides nothing. Grouping keeps working because `{ … ; }` and `( … ; )` carry real separators,
      // and segmentExecutable strips a leading bracket from the first token.
      .replace(/\$\(|`/g, ";")
      .split(/&&|\|\||;|\||\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * The token a segment would actually EXECUTE, or null if there is none.
 *
 * Consumes from the front repeatedly, because the prefixes stack: `rtk`, an env assignment, a
 * global flag and a bare duration can all sit in front of the real binary
 * (`timeout 300 pnpm eval:test` → `pnpm`).
 * @param {string} seg @returns {string | null}
 */
function segmentExecutable(seg) {
  // A markdown line is not a command. Reports written by heredoc are the ordinary traffic in a
  // project that documents its own API usage, and their bullets/quotes otherwise parse as an
  // executable: `- \`worker/src/ai.ts\`` skips the `-` as a flag and lands on a path-shaped token.
  // Bailing here keeps prose out of BOTH tests below (live bite 2026-08-30).
  if (/^\s*(?:[-*>#]\s|\d+[.)]\s|\|)/.test(seg)) return null;
  const tokens = seg
    .split(/\s+/)
    .map((t) => t.replace(/^[({]+/, "")) // `( pnpm eval:test )` — the bracket is not the binary
    .filter(Boolean);
  for (const t of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // FOO=1
    if (SPEND_WRAPPERS.has(t)) continue; // rtk / env / timeout …
    if (t.startsWith("-")) continue; // a global flag
    if (/^\d+[smh]?$/.test(t)) continue; // `timeout 300 …`
    // A quoted or backticked token is being TALKED ABOUT, not run. The splitter already turned
    // backticks into separators, so what survives here is a stray quote — prose, not a binary.
    if (/["']/.test(t)) return null;
    return t;
  }
  return null;
}

/** Does this segment's executable actually RUN something? A bare name in RUNNERS, or an explicit
 * path/script the shell would execute (`./run.sh`, `/abs/bin/x`, `../x.mjs`,
 * `./node_modules/.bin/promptfoo`). A path-shaped token that is NOT anchored — `worker/src/ai.ts`
 * as it appears mid-sentence in a report — is prose.
 * @param {string | null} exe @returns {boolean} */
function isRunner(exe) {
  if (exe === null) return false;
  if (RUNNERS.has(exe)) return true;
  if (/^(\.{1,2}\/|\/|~\/)/.test(exe)) return true;
  return /\.(sh|bash|zsh|mjs|cjs)$/.test(exe);
}

/**
 * Does this command spend real money?
 *
 * ONE test, applied per SEGMENT, and only to a segment whose EXECUTABLE is a runner (`pnpm`,
 * `node`, `npx`, `curl`, `docker`, `./run.sh`, `./node_modules/.bin/promptfoo`, …). Within such a
 * segment two things count as spend: a DEFAULT metered hostname, and any of the PROJECT's own
 * declared patterns.
 *
 * The hostname test used to run against the FULL command string, on the reasoning that a billed
 * endpoint anywhere is spend. That cost more than it bought. It bit live 2026-08-30 in a project
 * whose whole subject IS the OpenAI API: an agent writing its review report with
 * `cat > report.md <<'EOF' … https://api.openai.com/v1/images/edits …` was asked to confirm
 * spend — for writing a file. So were `grep -rn api.openai.com worker/src/` and a commit whose
 * MESSAGE named the endpoint. Every prompt was a false one, and the gate became noise on a
 * project that names that hostname all day.
 *
 * Naming a metered host to `grep` / `rg` / `sed` / `cat` / `echo` / `jq` / `git` — or inside a
 * heredoc body, or a markdown bullet — is INSPECTION or WRITING, never a call. Only an executor
 * can spend.
 *
 * NARROWING, stated: an executor absent from RUNNERS and not written as an explicit path now
 * reads as prose. RUNNERS therefore names the network-capable binaries explicitly; add to it
 * rather than reverting to the full-string test.
 *
 * Why the runner rule exists: a gate that fires on inspection trains approve-by-reflex, and reflex
 * approval is what lets the real spend through. That is not theory — it bit live. A pattern is
 * still matched as a plain substring per token (a project declares `scripts/eval.ts` or
 * `db:seed-images`, not regexes) and a multi-word pattern matches its words in order, so a pattern
 * appearing as an ARGUMENT to a runner still flags: in `node scripts/gen-assets.ts` the file IS the
 * thing being run.
 *
 * ACCEPTED OVER-ASK, stated rather than engineered away: `bash -c '…'`, `sh -c '…'` and `node -e
 * '…'` are runners, so a paid token quoted inside them asks. That is the fail-safe direction, and
 * it is consistent with the THREAT BOUNDARY note above — these gates are guardrails against drift,
 * not a sandbox against deliberate evasion.
 *
 * An unusable pattern is SKIPPED rather than fatal: a typo in a hand-edited config must not take
 * the whole gate down with it, and the remaining patterns still hold.
 * @param {string} cmd @param {string[]} [patterns] @returns {boolean}
 */
export function spendsMoney(cmd, patterns = []) {
  const usable = patterns.filter((p) => typeof p === "string" && p.length > 0);
  const { rest, executed } = splitHeredocs(cmd);
  // A script handed to an executor on stdin: no segment scoping, the executor runs all of it.
  if (executed) {
    if (DEFAULT_SPEND_RE.test(executed)) return true;
    const hay = executed.toLowerCase();
    if (usable.some((p) => hay.includes(p.toLowerCase()))) return true;
  }
  return splitSegments(rest).some((seg) => {
    if (!isRunner(segmentExecutable(seg))) return false;
    if (DEFAULT_SPEND_RE.test(seg)) return true;
    if (usable.length === 0) return false;
    // The executable is INCLUDED in the haystack, so `pnpm diagnose` can match its own runner.
    const tokens = seg.toLowerCase().split(/\s+/).filter(Boolean);
    return usable.some((p) => {
      const parts = p.toLowerCase().split(/\s+/).filter(Boolean);
      let from = 0;
      for (const part of parts) {
        const hit = tokens.findIndex((t, k) => k >= from && t.includes(part));
        if (hit === -1) return false;
        from = hit + 1;
      }
      return parts.length > 0;
    });
  });
}

// ── branch creation ──────────────────────────────────────────────────────────
// Branch CREATION only. Listing, deleting and switching to an existing branch are not this.
const GIT_PRE = "(^|&&|\\|\\||;|\\|)\\s*(rtk\\s+)?git\\s+(-C\\s+\\S+\\s+)?";
export const BRANCH_CREATE_RE = new RegExp(
  GIT_PRE +
    // `worktree add` creates a branch in exactly two shapes: an explicit `-b/-B`, or the
    // single-path form (git auto-creates a branch named after the path). The TWO-ARG form —
    // `git worktree add <path> <existing-ref>` — checks out an existing ref and creates NOTHING;
    // it is the worktree-discipline recipe's daily move, and flagging it froze the developer on
    // ordinary isolated work (live bite 2026-08-20). `--detach` creates no branch in any shape.
    "(checkout\\s+-[bB]|switch\\s+(-[cC]|--create)" +
    "|worktree\\s+add\\s+([^&|;]*\\s)?-[bB]([\\s]|$)" +
    "|worktree\\s+add\\s+(?!(?:[^&|;]*--detach))(--\\S+\\s+)*[^-\\s][^\\s&|;]*\\s*($|&&|\\|\\||;|\\|)" +
    // `--track` / `-t` creates a LOCAL branch from a remote one — it forks history exactly like
    // -b does, and it reads like a checkout, which is what makes it easy to miss.
    //
    // STATED BOUNDARY, not an oversight: git's DWIM (`--guess`, on by default) also creates a local
    // branch from `git switch <name>` when <name> exists on exactly one remote. Catching that needs
    // repo state — does the local branch exist? — which no matcher here can know. Prompting on EVERY
    // plain switch/checkout would fire on ordinary sub-agent work and train reflexive approval,
    // which is worse than the gap. It is also the narrow case: the main loop cannot reach a plain
    // switch at all (the role gate denies mutating git for it), and what DWIM materialises is a
    // branch that already exists on the remote, not new history.
    "|(checkout|switch)\\s+([^&|;]*\\s)?(-t|--track)(\\s|$)" +
    "|branch\\s+(?!-[dDmMar]|--(list|delete|move|show-current|all|remotes))\\S)",
);

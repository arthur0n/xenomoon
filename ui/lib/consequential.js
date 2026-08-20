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

/**
 * Does this command spend real money? The project's own patterns are added to the defaults —
 * substrings, matched case-insensitively, because a project declares things like
 * `scripts/eval.ts` or `db:seed-images`, not regexes.
 *
 * An unusable pattern is SKIPPED rather than fatal: a typo in a hand-edited config must not take
 * the whole gate down with it, and the remaining patterns still hold.
 * @param {string} cmd @param {string[]} [patterns] @returns {boolean}
 */
export function spendsMoney(cmd, patterns = []) {
  if (DEFAULT_SPEND_RE.test(cmd)) return true;
  const haystack = cmd.toLowerCase();
  return patterns.some(
    (p) => typeof p === "string" && p.length > 0 && haystack.includes(p.toLowerCase()),
  );
}

// ── branch creation ──────────────────────────────────────────────────────────
// Branch CREATION only. Listing, deleting and switching to an existing branch are not this.
const GIT_PRE = "(^|&&|\\|\\||;|\\|)\\s*(rtk\\s+)?git\\s+(-C\\s+\\S+\\s+)?";
export const BRANCH_CREATE_RE = new RegExp(
  GIT_PRE +
    "(checkout\\s+-[bB]|switch\\s+(-[cC]|--create)|worktree\\s+add" +
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

// issuekit — branch and PR plumbing. The convention lives in the TOOL: agents pass an issue or
// PR number and never assemble raw `gh`/`git` themselves, so the branch naming, the base
// resolution, the squash-safe containment check and the green-gate all stay deterministic.

import {
  run,
  gh,
  ghNode,
  ghNodes,
  cfgOf,
  parseObject,
  plumbMark,
  resolveRepo,
  maybeSwitchUser,
  slugify,
  str,
} from "./issuekit-lib.js";
import { branchDoctrine, citedIssues } from "./issuekit-push.js";
import { deployReaching } from "../../lib/branch-doctrine.js";
import { readHowFar, howFarStop } from "./how-far.js";

/** @typedef {import("./issuekit-lib.js").Flags} Flags */
/** @typedef {import("./issuekit-lib.js").GhNode} GhNode */

/** @param {string} repo @param {Flags} flags @returns {string} */
export function baseBranch(repo, flags) {
  if (flags.base) return String(flags.base);
  if (cfgOf().base) return String(cfgOf().base);
  return gh(["repo", "view", repo, "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"])
    .out;
}

// branch <#>: create the issue's work branch SERVER-SIDE from base (no local checkout
// touched); agents fetch it when they start work.
/** @param {string | number} num @param {Flags} flags */
export function cmdBranchNew(num, flags) {
  const repo = resolveRepo(flags);
  const issue = ghNode(["issue", "view", String(num), "-R", repo, "--json", "title"]);
  const prefix = str(flags.prefix) ?? cfgOf().branchPrefix ?? "fix";
  const name = `${prefix}/${num}-${slugify(issue.title ?? "")}`;
  const base = baseBranch(repo, flags);
  const sha = gh(["api", `repos/${repo}/git/ref/heads/${base}`, "-q", ".object.sha"]).out;
  const r = gh(
    ["api", `repos/${repo}/git/refs`, "-f", `ref=refs/heads/${name}`, "-f", `sha=${sha}`],
    { allowFail: true },
  );
  if (r.status !== 0) {
    if (/already exists/i.test(r.err + r.out)) console.log(`branch exists: ${name} (base ${base})`);
    else throw new Error(r.err || r.out);
  } else {
    plumbMark("branch-new");
    console.log(`branch ✓ ${name}  (from ${base} @ ${sha.slice(0, 7)}, server-side)`);
  }
  console.log(`work on it: git fetch origin && git switch ${name}`);
  console.log(
    `note: this branch is EMPTY (base's tip) — for STARTING work. Commits that already exist ` +
      `locally are published by the push stage (senior-analyst + push-method), not by this verb.`,
  );
}

// branch sync <name>: safely move a STALE LOCAL branch to origin's head. Never needs
// reset --hard: refuses when the branch is checked out; branch -f touches no files.
/** @param {string} name @param {Flags} flags */
export function cmdBranchSync(name, flags) {
  const repo = resolveRepo(flags);
  if (!name) throw new Error("branch sync needs a branch name");
  const current = run("git", ["branch", "--show-current"], { allowFail: true }).out;
  if (current === name)
    throw new Error(
      `"${name}" is checked out — switch away first (git switch <other>), then re-run; or the human syncs their own checkout.`,
    );
  run("git", ["fetch", "origin", name]);
  const has = run("git", ["rev-parse", "--verify", "--quiet", name], { allowFail: true });
  if (has.status !== 0) run("git", ["branch", "--track", name, `origin/${name}`]);
  else run("git", ["branch", "-f", name, `origin/${name}`]);
  const sha = run("git", ["rev-parse", "--short", name]).out;
  plumbMark("branch-sync");
  console.log(
    `synced ✓ ${name} → origin/${name} (${sha}); old position stays in the reflog. repo=${repo}`,
  );
}

// branch contained <name>: CONTENT-evidence containment verdict. `git cherry` and
// `--merged` both lie under squash-merge; per-file two-dot diffs are the authority.
/** @param {string} name @param {string} base */
export function containedVerdict(name, base) {
  run("git", ["fetch", "origin", base, name], { allowFail: true });
  /** @param {string} r */
  const exists = (r) =>
    run("git", ["rev-parse", "--verify", "--quiet", r], { allowFail: true }).status === 0;
  /** @param {string} b */
  const ref = (b) => (exists(`origin/${b}`) ? `origin/${b}` : b);
  const B = ref(base),
    N = ref(name);
  if (!exists(B)) throw new Error(`base branch not found: ${base} (neither local nor origin)`);
  if (!exists(N))
    throw new Error(`branch not found: ${name} (neither local nor origin — already deleted?)`);
  const files = run("git", ["diff", "--name-only", `${B}...${N}`])
    .out.split("\n")
    .filter(Boolean);
  if (!files.length) return { contained: true, files: [], differing: [] };
  const differing = files.filter((f) => run("git", ["diff", `${B}..${N}`, "--", f]).out !== "");
  return { contained: differing.length === 0, files, differing };
}

/** @param {string} name @param {Flags} flags */
export function cmdBranchContained(name, flags) {
  const repo = resolveRepo(flags);
  if (!name) throw new Error("branch contained needs a branch name");
  const base = baseBranch(repo, flags);
  const v = containedVerdict(name, base);
  const cherry = run("git", ["cherry", `origin/${base}`, name], { allowFail: true }).out;
  console.log(`# containment of ${name} vs ${base} (content evidence, squash-safe)`);
  if (cherry) console.log(`cherry (UNRELIABLE under squash — evidence only):\n${cherry}`);
  if (v.contained)
    console.log(
      `CONTAINED ✓ — ${v.files.length ? `all ${v.files.length} touched file(s) byte-equal in ${base}` : "no unique changes at all"}. Safe to delete.`,
    );
  else {
    console.log(`NOT CONTAINED ✗ — ${v.differing.length} file(s) differ from ${base}:`);
    for (const f of v.differing) console.log(`  ${f}`);
    process.exit(1);
  }
}

// branch prune: dry-run by default; deletes (with --apply) ONLY branches proven
// contained by content. Never trusts --merged, never deletes the unproven.
/** @param {Flags} flags */
export function cmdBranchPrune(flags) {
  const repo = resolveRepo(flags);
  const base = baseBranch(repo, flags);
  const keep = new Set(
    [
      base,
      cfgOf().prodBranch,
      "main",
      "master",
      "development",
      run("git", ["branch", "--show-current"], { allowFail: true }).out,
    ].filter(Boolean),
  );
  const branches = run("git", ["branch", "--format", "%(refname:short)"])
    .out.split("\n")
    .filter(Boolean)
    .filter((b) => !keep.has(b));
  if (!branches.length) {
    console.log("nothing to prune.");
    return;
  }
  /** @type {string[]} */ const dead = [];
  /** @type {string[]} */ const live = [];
  for (const b of branches) (containedVerdict(b, base).contained ? dead : live).push(b);
  console.log(
    `# prune vs ${base} — ${dead.length} contained, ${live.length} hold unique work (kept). repo=${repo}`,
  );
  for (const b of live) console.log(`  keep   ${b}`);
  for (const b of dead) {
    if (flags.apply) {
      run("git", ["branch", "-D", b]);
      console.log(`  pruned ${b} ✓ (content-proven contained)`);
    } else console.log(`  DEAD   ${b} — would delete (re-run with --apply)`);
  }
  if (flags.apply && dead.length) plumbMark("branch-prune");
}

// pr <#>: open the PR for the issue's work branch → base. "Refs #N" body — NEVER a
// Closes/Fixes keyword, so nothing auto-closes on merge before deploy is verified.
/** @param {string | number} num @param {Flags} flags */
export function cmdPrNew(num, flags) {
  const repo = resolveRepo(flags);
  const issue = ghNode(["issue", "view", String(num), "-R", repo, "--json", "title"]);
  const base = baseBranch(repo, flags);
  const prefix = str(flags.prefix) ?? cfgOf().branchPrefix ?? "fix";
  const head = str(flags.head) ?? `${prefix}/${num}-${slugify(issue.title ?? "")}`;
  // The PR needs a PUBLISHED branch with commits. Opening one against a missing or empty head
  // fails late or PRs nothing (live bite 2026-08-21: a stray empty remote branch and no PR) —
  // and the fix is never this command creating branches, it is the push stage publishing the
  // local work first. Refuse EARLY with the route.
  const cmp = gh(["api", `repos/${repo}/compare/${base}...${head}`, "-q", ".ahead_by"], {
    allowFail: true,
  });
  if (cmp.status !== 0)
    throw new Error(
      `branch "${head}" is not on origin — publish the local work first (the push stage: ` +
        `senior-analyst running push-method pushes it), then re-run \`issuekit pr ${num}\`.`,
    );
  if (cmp.out.trim() === "0")
    throw new Error(
      `branch "${head}" is on origin but has NO commits ahead of ${base} — the local work was ` +
        `never published. Route it through the push stage (senior-analyst + push-method), then ` +
        `re-run \`issuekit pr ${num}\`.`,
    );
  const r = gh([
    "pr",
    "create",
    "-R",
    repo,
    "--base",
    base,
    "--head",
    head,
    "--title",
    `${issue.title} (#${num})`,
    "--body",
    `Refs #${num} — deploy-gated; do not auto-close the issue on merge.`,
  ]);
  plumbMark("pr-new");
  console.log(r.out);
}

// pr update <PR#>: merge base into the PR branch SERVER-SIDE — re-fires checks,
// touches nothing local. THE command for stale PR branches; no reasoning needed.
/** @param {string | number} num @param {Flags} flags */
export function cmdPrUpdate(num, flags) {
  const repo = resolveRepo(flags);
  if (!num) throw new Error("pr update needs a PR number");
  const args = ["pr", "update-branch", String(num), "-R", repo];
  if (flags.rebase) args.push("--rebase");
  gh(args);
  plumbMark("pr-update");
  console.log(`updated ✓ PR #${num} — base merged in server-side; checks re-fire on the new head.`);
}

// pr merge <PR#>: merge per the configured method (default squash) and DELETE the
// head branch AT merge — a temporary branch never outlives its merge.
// --when-green: deterministic gate first — OPEN + no conflicts + every check
// SUCCESS/NEUTRAL/SKIPPED, else exit 1 listing exactly what blocks. One call replaces
// the "merge PR N when checks pass" agent dispatch (and its retry re-dispatches).
/**
 * The merge gate's FACTS, split by what owns them: `checks` are the rollup's own non-green
 * contexts, `state`/`mergeable` are the PR's. `headSha` is the commit the rollup BELONGS to —
 * `gh` resolves `statusCheckRollup` from the PR's head commit, so `headRefOid` from the SAME
 * call is that rollup's SHA (no extra request; verified against a real pull request,
 * 2026-11-24). A caller that must know whether a red is bound to already-published code
 * (push-check) cannot answer it from the blocker strings alone.
 * @param {string} repo @param {string | number} num
 * @returns {{ blockers: string[], checks: string[], conflicting: boolean, headSha: string }} */
export function prGateFacts(repo, num) {
  const pr = ghNode([
    "pr",
    "view",
    String(num),
    "-R",
    repo,
    "--json",
    "state,mergeable,mergeStateStatus,statusCheckRollup,headRefOid",
  ]);
  /** @type {string[]} */ const checks = [];
  for (const c of pr.statusCheckRollup ?? []) {
    const name = c.name ?? c.context ?? "check";
    const verdict = (c.conclusion ?? c.state ?? c.status ?? "").toUpperCase();
    if (!["SUCCESS", "NEUTRAL", "SKIPPED"].includes(verdict))
      checks.push(`${name}: ${verdict || "PENDING"}`);
  }
  const blockers = [];
  if (pr.state !== "OPEN") blockers.push(`state=${pr.state} (not OPEN)`);
  const conflicting = pr.mergeable === "CONFLICTING";
  if (conflicting) blockers.push("mergeable=CONFLICTING (needs conflict resolution)");
  blockers.push(...checks);
  return { blockers, checks, conflicting, headSha: pr.headRefOid ?? "" };
}

/** Every reason PR `num` is not mergeable, in one list. @param {string} repo @param {string | number} num */
export function prGreenGate(repo, num) {
  return prGateFacts(repo, num).blockers;
}

/**
 * The contract decision for a merge or a promote, from facts already read: each cited issue's
 * "How far" line against the move. Pure, so a test drives it without `gh`.
 * @param {{ move: import("./how-far.js").HowFarMove,
 *   issues: { num: string | number, readable: boolean, howFar: import("./how-far.js").HowFar }[],
 *   what?: string }} input `what` names the change in the no-issue flag (default "the change")
 * @returns {{ stops: string[], flags: string[] }} */
export function contractStops({ move, issues, what = "the change" }) {
  /** @type {string[]} */ const stops = [];
  /** @type {string[]} */ const flags = [];
  if (!issues.length) flags.push(`${what} cites no issue — nothing to check against a contract`);
  for (const i of issues) {
    const ref = `#${String(i.num).replace(/^#/, "")}`;
    if (!i.readable) stops.push(`could not read ${ref}, so the contract cannot be checked`);
    // An issue's pipeline state is not read here: only its "How far" line gates the move.
    else if (i.howFar === "none")
      flags.push(`${ref} has no "How far" line — not checked against a contract`);
    else {
      const stop = howFarStop(i.howFar, move, ref);
      if (stop) stops.push(stop);
    }
  }
  return { stops, flags };
}

/** Each issue's "How far" line, read from its body. @param {string} repo @param {string[]} nums */
function readContracts(repo, nums) {
  return nums.map((num) => {
    const r = gh(["issue", "view", num, "-R", repo, "--json", "body"], { allowFail: true });
    const node = r.status === 0 ? parseObject(r.out) : null;
    return node
      ? { num, readable: true, howFar: readHowFar(node.body) }
      : { num, readable: false, howFar: /** @type {const} */ ("none") };
  });
}

/** Print the flags; on any stop print the refusal on stderr and exit 1 — before any merge call.
 * @param {{ stops: string[], flags: string[] }} verdict */
function refuseOnStops({ stops, flags }) {
  for (const f of flags) console.log(`FLAG — ${f}`);
  if (!stops.length) return;
  console.error(`STOP ✗ — ${stops.length} blocker(s); not merged:`);
  for (const s of stops) console.error(`  • ${s}`);
  process.exit(1);
}

/** The deploy reading of push-check: true or cannot-be-told gates as deploy. @param {string} target */
function moveInto(target) {
  const top = run("git", ["rev-parse", "--show-toplevel"], { allowFail: true }).out;
  return deployReaching(target, branchDoctrine(top)) !== false ? "deploy" : "merge";
}

/** Issues a pull request cites: `Refs #N` (any case, several) in the body, `(#N)` in the title.
 * @param {string} title @param {string} body @returns {string[]} */
export function prCitedIssues(title, body) {
  const out = citedIssues([{ subject: title }]);
  for (const m of body.matchAll(/\brefs\b((?:[\s,]*(?:and\s+)?#\d+)+)/gi))
    for (const n of (m[1] ?? "").matchAll(/#(\d+)/g))
      if (n[1] && !out.includes(n[1])) out.push(n[1]);
  return out;
}

/** The contract check of `pr merge`; exits 1 on a stop. @param {string} repo @param {string | number} num */
function checkPrContract(repo, num) {
  const pr = ghNode(["pr", "view", String(num), "-R", repo, "--json", "title,body,baseRefName"]);
  const nums = prCitedIssues(pr.title ?? "", pr.body ?? "");
  const move = moveInto(pr.baseRefName ?? "");
  refuseOnStops(contractStops({ move, issues: readContracts(repo, nums), what: `PR #${num}` }));
}

/** The contract check of `promote` (always a deploy move); exits 1 on a stop.
 * @param {string} repo @param {string} from @param {string} to */
function checkPromoteContract(repo, from, to) {
  const r = gh(["api", `repos/${repo}/compare/${to}...${from}`], { allowFail: true });
  const cmp = r.status === 0 ? parseObject(r.out) : null;
  const commits = Array.isArray(cmp?.commits)
    ? /** @type {{ commit?: { message?: unknown } }[]} */ (cmp.commits)
    : null;
  if (!cmp || !commits) {
    refuseOnStops({
      stops: [`could not list the commits ${from} brings to ${to} (${r.err || r.out || "no commits list"})`], // prettier-ignore
      flags: [],
    });
    return;
  }
  // The compare API lists at most 250 commits; an issue cited past that cut would go unchecked.
  if (typeof cmp.total_commits === "number" && cmp.total_commits > commits.length) {
    refuseOnStops({
      stops: [`the compare lists ${commits.length} of ${cmp.total_commits} commits ${from} brings to ${to}, so the contracts cannot all be checked`], // prettier-ignore
      flags: [],
    });
    return;
  }
  const subjects = commits.map((c) => {
    const message = c?.commit?.message;
    return { subject: (typeof message === "string" ? message : "").split("\n")[0] ?? "" };
  });
  const what = `${from} → ${to}`;
  refuseOnStops(
    contractStops({ move: "deploy", issues: readContracts(repo, citedIssues(subjects)), what }),
  );
}

/** @param {string | number} num @param {Flags} flags */
export function cmdPrMerge(num, flags) {
  const repo = resolveRepo(flags);
  if (!num) throw new Error("pr merge needs a PR number");
  const method = str(flags.method) ?? cfgOf().mergeMethod ?? "squash";
  if (!["squash", "merge", "rebase"].includes(method))
    throw new Error("--method must be squash|merge|rebase");
  checkPrContract(repo, num);
  if (flags["when-green"]) {
    const blockers = prGreenGate(repo, num);
    if (blockers.length) {
      console.error(`not green ✗ PR #${num} — NOT merged:`);
      for (const b of blockers) console.error(`  ${b}`);
      console.error(
        `re-run \`issuekit pr merge ${num} --when-green\` once clear (stale base? \`issuekit pr update ${num}\`).`,
      );
      process.exit(1);
    }
  }
  gh(["pr", "merge", String(num), "-R", repo, `--${method}`, "--delete-branch"]);
  plumbMark("pr-merge");
  console.log(
    `merged ✓ PR #${num} (${method}, head branch deleted). Merged ≠ done: run \`issuekit deploy-check\` before reporting this shipped.`,
  );
}

// promote [--from A] [--to B]: server-side merge of the integration branch into prod
// (gh api merges). Defaults: from=.issuekit.json base, to=prodBranch. ONE deterministic
// call — replaces the "promote development to main" agent dispatch; touches nothing local.
/** @param {Flags} flags */
export function cmdPromote(flags) {
  const repo = resolveRepo(flags);
  const from = str(flags.from) ?? cfgOf().base ?? "development";
  const to =
    str(flags.to) ??
    cfgOf().prodBranch ??
    String(
      gh(["repo", "view", repo, "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"]).out,
    );
  if (!to || from === to)
    throw new Error(
      `promote: bad lane from=${from} to=${to || "?"} (set prodBranch in .issuekit.json or pass --to)`,
    );
  checkPromoteContract(repo, from, to);
  const r = gh(["api", `repos/${repo}/merges`, "-f", `base=${to}`, "-f", `head=${from}`], {
    allowFail: true,
  });
  if (r.status !== 0) {
    const msg = r.err || r.out;
    if (/409|conflict/i.test(msg))
      throw new Error(`promote ✗ ${from} → ${to}: merge CONFLICT — resolve via a PR, not a force`);
    throw new Error(`promote ✗ ${from} → ${to}: ${msg}`);
  }
  const sha = (() => {
    try {
      const parsed = parseObject(r.out || "null");
      return typeof parsed?.sha === "string" ? parsed.sha.slice(0, 7) : null;
    } catch {
      return null;
    }
  })();
  plumbMark("promote");
  console.log(
    sha
      ? `promoted ✓ ${from} → ${to} (merge ${sha}, server-side). Verify: issuekit deploy-check.`
      : `promote ✓ ${to} already contains ${from} — nothing to do.`,
  );
}

// pr retarget <PR#> --base <branch>: change the PR base. A base change fires NO
// workflows — the follow-up update is printed so the check gap can't go unnoticed.
/** @param {string | number} num @param {Flags} flags */
export function cmdPrRetarget(num, flags) {
  const repo = resolveRepo(flags);
  if (!num || !flags.base) throw new Error("pr retarget needs a PR number and --base <branch>");
  gh(["pr", "edit", String(num), "-R", repo, "--base", String(flags.base)]);
  plumbMark("pr-retarget");
  console.log(`retargeted ✓ PR #${num} → base ${flags.base}.`);
  console.log(
    `NOTE: a base change fires NO checks and the head sha did not move — existing green is STALE signal. Run: issuekit pr update ${num}`,
  );
}

// deploy-check: the ONLY sanctioned deploy verification. Reads the last COMPLETED
// run's conclusion — a green PR gate says NOTHING about deploy health, and an
// in-flight run is never polled or waited on.
/** @param {Flags} flags */
export function cmdDeployCheck(flags) {
  const repo = resolveRepo(flags);
  const workflow = str(flags.workflow) ?? cfgOf().deployWorkflow;
  if (!workflow)
    throw new Error(
      "deploy-check needs --workflow <file.yml> (or deployWorkflow in .issuekit.json)",
    );
  const branch = str(flags.branch) ?? cfgOf().prodBranch ?? baseBranch(repo, flags);
  const runs = ghNodes([
    "run",
    "list",
    "-R",
    repo,
    `--workflow=${workflow}`,
    `--branch=${branch}`,
    "--status=completed",
    "--limit",
    "1",
    "--json",
    "conclusion,headSha,displayTitle,updatedAt",
  ]);
  if (!runs.length) {
    console.error(`deploy-check ✗ no completed ${workflow} runs on ${branch}`);
    process.exit(1);
  }
  const r = runs[0];
  if (!r) {
    console.error(`deploy-check ✗ no completed ${workflow} runs on ${branch}`);
    process.exit(1);
    return;
  }
  const line = `${workflow} on ${branch}: ${r.conclusion} — "${r.displayTitle}" (${(r.headSha ?? "").slice(0, 7)}, ${r.updatedAt})`;
  if (r.conclusion !== "success") {
    console.error(`deploy-check ✗ ${line}`);
    process.exit(1);
  }
  console.log(`deploy-check ✓ ${line}`);
}

/** @param {string[]} pos @param {Flags} flags */
export function cmdBranch(pos, flags) {
  maybeSwitchUser(flags);
  const [a, b] = pos;
  if (a === "sync") {
    cmdBranchSync(b ?? "", flags);
    return;
  }
  if (a === "contained") {
    cmdBranchContained(b ?? "", flags);
    return;
  }
  if (a === "prune") {
    cmdBranchPrune(flags);
    return;
  }
  if (/^\d+$/.test(a ?? "")) {
    cmdBranchNew(a ?? "", flags);
    return;
  }
  throw new Error(
    "branch usage: branch <#> | branch sync <name> | branch contained <name> | branch prune [--apply]",
  );
}

/** @param {string[]} pos @param {Flags} flags */
export function cmdPr(pos, flags) {
  maybeSwitchUser(flags);
  const [a, b] = pos;
  if (a === "update") {
    cmdPrUpdate(b ?? "", flags);
    return;
  }
  if (a === "merge") {
    cmdPrMerge(b ?? "", flags);
    return;
  }
  if (a === "retarget") {
    cmdPrRetarget(b ?? "", flags);
    return;
  }
  if (/^\d+$/.test(a ?? "")) {
    cmdPrNew(a ?? "", flags);
    return;
  }
  throw new Error(
    "pr usage: pr <issue#> | pr update <PR#> | pr merge <PR#> [--method m] [--when-green] | pr retarget <PR#> --base <branch>",
  );
}

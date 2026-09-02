// issuekit push-check — the push STAGE's gate, as a TOOL.
//
// push-method §1 is six machine-checkable steps: clean tree, branch model, upstream, fast-forward,
// verdicts still green, checks. Left to an agent, the same six steps cost 13–37 tool calls and
// 0.6–2.1M cache-read tokens per push (token audit 2026-09-01, id commit-push-cli): the analyst
// re-read the issue thread, the transcript, the diff and the CI config before one `git push`. None
// of that reading changes the answer — the gate has exactly one, and it is derived here, once.
//
// What this verb does NOT do: push. The publish is still the lane's ONE bare `git push <remote>
// <branch>` — the shape both permission layers recognise (ui/lib/consequential.js
// `routinePushTarget`), where the branch model draws routine vs deploy-reaching and `policy.push`
// asks the human for the consequential half. A tool that pushed from inside a `node` process would
// be invisible to both gates, so the receipt ends with the exact command instead, and the agent runs
// it. Two calls, no bypass.
//
// The verdict parsing is a PORT of plugin/hooks/commit-gate.sh `latest_verdict` — same headings,
// same asymmetry (a pass must be the whole verdict line; a block matches on its leading word; an
// unrecognised verdict word is UNKNOWN, never a pass). The gate judged the commit when it landed;
// this judges whether that judgement still stands today, and it must read the lanes the same way.
import { readBranchModel, deployReaching } from "../../lib/branch-doctrine.js";
import { run, gh, git, resolveRepo, maybeSwitchUser, mark, str } from "./issuekit-lib.js";
import { prGreenGate } from "./issuekit-plumb.js";

/** @typedef {import("./issuekit-lib.js").Flags} Flags */
/** @typedef {import("./issuekit-lib.js").GhNode} GhNode */
/** @typedef {ReturnType<typeof readBranchModel>} Doctrine */

/**
 * The newest verdict in one lane, read the way the commit gate reads it.
 * @typedef {{ state: "pass" | "blocked" | "unknown" | "none", sha: string, heading: string }} LaneVerdict
 */
/**
 * One published issue's pipeline state.
 * @typedef {{ num: string, readable: boolean, labels: string[], qa: LaneVerdict, review: LaneVerdict }} IssueState
 */
/**
 * The CI evidence for the branch.
 * @typedef {{ kind: "pr" | "run" | "none", pr: number | null, failed: string[], pending: string[], detail: string }} Checks
 */
/**
 * Everything the verdict needs, gathered once (collectFacts) — a plain object so the decision is
 * testable without a repo.
 * @typedef {{
 *   branch: string, current: string, remote: string, upstream: string | null, setUpstream: boolean,
 *   dirty: string[], ahead: number | null, behind: number | null,
 *   commits: { sha: string, subject: string }[], issues: IssueState[], checks: Checks,
 *   doctrine: Doctrine, reaches: boolean | null,
 * }} PushFacts
 */

const PASS_NOTE = "( \\((re-?QA|re-?review|re-?run|round [0-9]+)\\))?[ \\t]*(\\n|$)";
const LANES = {
  qa: {
    lane: /(^|\n)## (🧪 )?QA( \([^)\n]*\))? —/,
    pass: new RegExp(`(^|\\n)## (🧪 )?QA( \\([^)\\n]*\\))? — PASS${PASS_NOTE}`, "i"),
    key: "qa-verified",
    block: /(^|\n)## (🧪 )?QA( \([^)\n]*\))? — (blocked|fail)/i,
  },
  review: {
    lane: /(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? —/,
    pass: new RegExp(`(^|\\n)## (🔎 )?REVIEW( \\([^)\\n]*\\))? — pass${PASS_NOTE}`, "i"),
    key: "review-verified",
    block: /(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? — (changes|needs-attention|blocked|reject)/i,
  },
};

/** A `gh --json` payload as a list of nodes, or nothing — never `any`.
 * @param {string} raw @returns {GhNode[]} */
const nodesOf = (raw) => {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? /** @type {GhNode[]} */ (parsed) : [];
};

/**
 * The LATEST verdict in a lane — not the latest pass. An older pass must not outlive a newer block.
 * @param {"qa" | "review"} lane @param {string[]} comments bodies, oldest first
 * @returns {LaneVerdict} */
export function laneVerdict(lane, comments) {
  const L = LANES[lane];
  const last = comments.filter((b) => L.lane.test(b)).at(-1);
  if (last === undefined) return { state: "none", sha: "", heading: "" };
  const heading = (L.lane.exec(last)?.[0] ?? "").replace(/^\n/, "");
  const line = last.slice(last.indexOf(heading)).split("\n")[0] ?? heading;
  if (L.pass.test(last)) {
    const sha = [...last.matchAll(new RegExp(`${L.key}: ([0-9a-f]{7,40})`, "g"))].at(-1)?.[1] ?? "";
    return { state: "pass", sha, heading: line };
  }
  if (L.block.test(last)) return { state: "blocked", sha: "", heading: line };
  return { state: "unknown", sha: "", heading: line.slice(0, 120) };
}

/** Issue numbers cited by the commits being published — each `(#N)`, once, in order.
 * @param {{ subject: string }[]} commits */
export function citedIssues(commits) {
  /** @type {string[]} */ const out = [];
  for (const c of commits)
    for (const m of c.subject.matchAll(/\(#(\d+)\)/g)) {
      const n = m[1] ?? "";
      if (n && !out.includes(n)) out.push(n);
    }
  return out;
}

/** Steps 1–4: where you are, the model, the upstream, fast-forward.
 * @param {PushFacts} f @param {string[]} stops @param {string[]} flags */
function judgeTree(f, stops, flags) {
  if (f.branch !== f.current)
    stops.push(
      `checked out "${f.current}", asked to publish "${f.branch}" — you publish HEAD; switching is not yours (re-brief, or the developer switches in its worktree)`,
    );
  // A dirty tree is never touched (no stage, no stash, no clean) — but a push publishes COMMITS,
  // and the human's own uncommitted edits sitting beside them are not a reason to withhold the
  // pipeline's work (every live brief said "leave them alone; report them"). Reported, untouched.
  if (f.dirty.length)
    flags.push(
      `tree DIRTY — ${f.dirty.length} uncommitted entr${f.dirty.length === 1 ? "y" : "ies"}, UNTOUCHED and not published: ${f.dirty.slice(0, 6).join(", ")}${f.dirty.length > 6 ? ", …" : ""}`,
    );
  if (!f.doctrine)
    flags.push(
      "no branch model (`.xenomoon/branch-model` absent or custom) — every push gates as deploy-reaching",
    );
  if (!f.upstream && !f.setUpstream)
    stops.push(
      `no upstream for ${f.branch} — would run \`git push -u ${f.remote} ${f.branch}\`; only a brief that NAMES remote+branch may set one (re-run with --set-upstream)`,
    );
  if (f.behind !== null && f.behind > 0)
    stops.push(
      `behind ${f.upstream} by ${f.behind} — not fast-forward; the sync/rebase belongs to \`issuekit branch sync\` or the developer in an isolated worktree, never to the push lane`,
    );
  if (f.ahead === 0) flags.push(`nothing to publish — ${f.upstream} already has HEAD`);
}

/** Step 5: is the judgement that let each commit land still standing?
 * @param {IssueState} i @param {string[]} stops @param {string[]} flags */
function judgeIssue(i, stops, flags) {
  if (!i.readable) {
    stops.push(`#${i.num} could not be read (gh failed or no such issue) — fail-closed`);
    return;
  }
  const bad = i.labels.filter((l) => l === "qa:blocked" || l === "review:changes");
  if (bad.length)
    stops.push(`#${i.num} carries ${bad.join(" + ")} — back to implement (owning stage)`);
  for (const lane of /** @type {const} */ (["qa", "review"])) {
    const v = i[lane];
    if (v.state === "blocked")
      stops.push(
        `#${i.num} newest ${lane.toUpperCase()} verdict blocks: "${v.heading}" — back to implement`,
      );
    else if (v.state === "unknown")
      flags.push(
        `#${i.num} ${lane.toUpperCase()} verdict word not recognised: "${v.heading}" — a human reads it`,
      );
  }
  const pipelineState =
    i.labels.some((l) => /^(qa|review):/.test(l)) ||
    i.qa.state !== "none" ||
    i.review.state !== "none";
  if (!pipelineState)
    flags.push(
      `#${i.num} shows NO pipeline state (no lane label, no verdict) — not this pipeline's issue?`,
    );
}

/** Step 6: checks. Red stops; pending is a decision to NAME; no CI is a stated fact.
 * @param {Checks} c @param {string[]} stops @param {string[]} flags */
function judgeChecks(c, stops, flags) {
  const where = c.pr ? ` on PR #${c.pr}` : "";
  if (c.failed.length)
    stops.push(
      `checks RED${where}: ${c.failed.join(", ")} — the owning stage fixes; you do not push over red`,
    );
  if (c.pending.length)
    flags.push(
      `checks PENDING${where}: ${c.pending.join(", ")} — name the decision in your report, never wait silently`,
    );
  if (c.kind === "none") flags.push(`no CI evidence: ${c.detail}`);
}

/**
 * The decision. STOPs end the stage (exit 1, each naming the stage that owns the fix); FLAGS go in
 * the receipt for the report and never block. Pure — every input is a fact already gathered.
 * @param {PushFacts} f
 * @returns {{ stops: string[], flags: string[] }} */
export function pushGateVerdict(f) {
  /** @type {string[]} */ const stops = [];
  /** @type {string[]} */ const flags = [];
  judgeTree(f, stops, flags);
  for (const i of f.issues) judgeIssue(i, stops, flags);
  if (!f.issues.length && f.commits.length)
    flags.push("no (#N) in the published commits — nothing to verify against an issue");
  judgeChecks(f.checks, stops, flags);
  return { stops, flags };
}

const PENDING_RE = /:\s*(PENDING|QUEUED|IN_PROGRESS|EXPECTED|WAITING)$/;

/** @param {string} repo @param {string} remote @param {string} branch @returns {Checks} */
function collectChecks(repo, remote, branch) {
  const prs = nodesOf(
    gh(["pr", "list", "-R", repo, "--head", branch, "--state", "open", "--json", "number"], {
      allowFail: true,
    }).out,
  );
  const pr = prs[0]?.number ?? null;
  if (pr !== null) {
    // `state=` is the PR's own state, moot here (we filtered to OPEN); a CONFLICTING mergeable stays
    // a blocker — a push onto a conflicting PR is work for the developer, not the lane.
    const blockers = prGreenGate(repo, pr).filter((b) => !b.startsWith("state="));
    const pending = blockers.filter((b) => PENDING_RE.test(b));
    const failed = blockers.filter((b) => !PENDING_RE.test(b));
    return { kind: "pr", pr, failed, pending, detail: `PR #${pr}` };
  }
  const r = nodesOf(
    gh(
      [
        "run",
        "list",
        "-R",
        repo,
        "--branch",
        branch,
        "-L",
        "1",
        "--json",
        "status,conclusion,workflowName",
      ],
      { allowFail: true },
    ).out,
  )[0];
  const none = { kind: /** @type {const} */ ("none"), pr: null, failed: [], pending: [] };
  if (!r)
    return {
      ...none,
      detail: `no workflow run on ${remote}/${branch} (not CI-covered, or never pushed)`,
    };
  const raw = /** @type {{ status?: string, conclusion?: string, workflowName?: string }} */ (r);
  const name = raw.workflowName ?? "run";
  const run_ = { kind: /** @type {const} */ ("run"), pr: null, detail: name };
  if (raw.status !== "completed")
    return { ...run_, failed: [], pending: [`${name}: ${(raw.status ?? "").toUpperCase()}`] };
  const ok = ["success", "neutral", "skipped"].includes(raw.conclusion ?? "");
  if (!ok)
    return { ...run_, failed: [`${name}: ${(raw.conclusion ?? "").toUpperCase()}`], pending: [] };
  return { ...run_, failed: [], pending: [], detail: `${name}: ${raw.conclusion}` };
}

/** @param {string} repo @param {string} num @returns {IssueState} */
function collectIssue(repo, num) {
  const unreadable = () => ({
    num,
    readable: false,
    labels: [],
    qa: laneVerdict("qa", []),
    review: laneVerdict("review", []),
  });
  const r = gh(["issue", "view", num, "-R", repo, "--json", "labels,comments"], {
    allowFail: true,
  });
  if (r.status !== 0 || !r.out) return unreadable();
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(r.out);
  } catch {
    return unreadable();
  }
  const node = /** @type {GhNode} */ (parsed && typeof parsed === "object" ? parsed : {});
  const labels = (node.labels ?? [])
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);
  const comments = (node.comments ?? []).map((c) => c.body ?? "");
  return {
    num,
    readable: true,
    labels,
    qa: laneVerdict("qa", comments),
    review: laneVerdict("review", comments),
  };
}

/** Gather every fact the verdict reads, in the order push-method lists them.
 * @param {string} askedBranch @param {Flags} flags @returns {{ repo: string, facts: PushFacts }} */
function collectFacts(askedBranch, flags) {
  const repo = resolveRepo(flags);
  const current = git(["branch", "--show-current"]);
  if (!current)
    throw new Error("not on a branch (detached HEAD or not a git repo) — nothing to publish");
  const branch = askedBranch || current;
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || null;
  const remote = str(flags.remote) ?? upstream?.split("/")[0] ?? "origin";
  const setUpstream = flags["set-upstream"] === true;
  const dirty = git(["status", "--porcelain"]).split("\n").filter(Boolean);

  run("git", ["fetch", remote, branch], { allowFail: true });
  let ahead = null;
  let behind = null;
  if (upstream) {
    const [b, a] = git(["rev-list", "--left-right", "--count", "@{u}...HEAD"]).split(/\s+/);
    behind = Number(b ?? 0);
    ahead = Number(a ?? 0);
  }
  // No upstream = nothing to diff against; the last 20 subjects are what a `-u` push would publish.
  const commits = git(
    upstream ? ["log", "@{u}..HEAD", "--format=%h\t%s"] : ["log", "-n", "20", "--format=%h\t%s"],
  )
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, ...rest] = l.split("\t");
      return { sha: sha ?? "", subject: rest.join("\t") };
    });

  const doctrine = readBranchModel(git(["rev-parse", "--show-toplevel"]));
  const reaches = deployReaching(branch, doctrine);
  const issues = citedIssues(commits).map((n) => collectIssue(repo, n));
  const checks = collectChecks(repo, remote, branch);
  return {
    repo,
    facts: {
      branch,
      current,
      remote,
      upstream,
      setUpstream,
      dirty,
      ahead,
      behind,
      commits,
      issues,
      checks,
      doctrine,
      reaches,
    },
  };
}

/** @param {IssueState} i */
function issueLine(i) {
  if (!i.readable) return `issue      #${i.num}: UNREADABLE`;
  /** @param {"qa" | "review"} l */
  const lane = (l) => {
    const v = i[l];
    return `${l.toUpperCase()} ${v.state}${v.sha ? ` @${v.sha.slice(0, 7)}` : ""}`;
  };
  const labels = i.labels.filter((l) => /^(qa|review):/.test(l)).join(" ") || "no lane labels";
  return `issue      #${i.num}: ${labels} · ${lane("qa")} · ${lane("review")}`;
}

/** @param {Checks} c */
function checksLine(c) {
  if (c.kind === "none") return "checks     none";
  const tail = c.failed.length
    ? ` — RED: ${c.failed.join(", ")}`
    : c.pending.length
      ? ` — pending: ${c.pending.join(", ")}`
      : " — green";
  return `checks     ${c.detail}${tail}`;
}

/** @param {PushFacts} f */
function targetLine(f) {
  const model = f.doctrine ? `${f.doctrine.model}, prod=${f.doctrine.prod}` : "no model";
  if (f.reaches === false) return `target     work branch (${model}) — routine push, no prompt`;
  if (f.reaches === true)
    return `target     REACHES THE DEPLOY BRANCH (${model}) — policy.push asks`;
  return `target     cannot draw the line (${model}) — gates as deploy-reaching`;
}

/** @param {PushFacts} f @param {string} repo */
function receipt(f, repo) {
  const lines = [`# push-check ${f.branch} → ${f.remote}/${f.branch}  (repo ${repo})`];
  lines.push(`tree       ${f.dirty.length ? `DIRTY (${f.dirty.length}, untouched)` : "clean"}`);
  const counts = f.ahead !== null ? ` (ahead ${f.ahead}, behind ${f.behind})` : "";
  lines.push(`upstream   ${f.upstream ?? "NONE"}${counts}`);
  if (f.commits.length) {
    const first = f.commits.at(-1)?.sha ?? "";
    const last = f.commits[0]?.sha ?? "";
    lines.push(`publishes  ${first}..${last} — ${f.commits.length} commit(s):`);
    for (const c of f.commits.slice(0, 12)) lines.push(`             ${c.sha} ${c.subject}`);
  } else lines.push("publishes  nothing (no commits ahead)");
  for (const i of f.issues) lines.push(issueLine(i));
  lines.push(checksLine(f.checks), targetLine(f));
  return lines.join("\n");
}

/**
 * `issuekit push-check [branch] [--remote R] [--set-upstream]` — verify, and print the one push.
 * @param {string[]} pos @param {Flags} flags */
export function cmdPushCheck(pos, flags) {
  maybeSwitchUser(flags, { mutating: false });
  const { repo, facts } = collectFacts(pos[0] ?? "", flags);
  const { stops, flags: notes } = pushGateVerdict(facts);
  console.log(receipt(facts, repo));
  for (const n of notes) console.log(`FLAG       ${n}`);
  mark("commit-push-cli", "push-check");
  if (stops.length) {
    console.error(
      `STOP ✗ — ${stops.length} blocker(s); nothing to push until the owning stage clears them:`,
    );
    for (const s of stops) console.error(`  • ${s}`);
    process.exit(1);
  }
  if (facts.ahead === 0) {
    console.log("PASS — nothing to publish; report the receipt.");
    return;
  }
  const u = facts.upstream ? "" : "-u ";
  console.log(
    `PASS ✓ — publish with exactly this, nothing chained:\n  git push ${u}${facts.remote} ${facts.branch}`,
  );
}

#!/usr/bin/env node
// issuekit — deterministic, searchable GitHub-issue attempt log for agents.
//
// Standalone. No shared infra, no Lambda, no AWS. Deps: `gh` + git + Node only.
// Every write lands as a comment/issue on GitHub (the "conversation"); every
// attempt uses a fixed template with stable `<!-- issuekit:attempt -->` markers so
// later runs can SEARCH what was already tried and never repeat a failed approach.
//
// Branch/PR plumbing lives in issuekit-plumb.js; shared helpers in issuekit-lib.js.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  str,
  strOr,
  gh,
  ghNode,
  ghNodes,
  parseArgs,
  resolveRepo,
  maybeSwitchUser,
  tmpFile,
  agentName,
  shortHead,
  nowIso,
} from "./issuekit-lib.js";
import { cmdBranch, cmdPr, cmdPromote, cmdDeployCheck } from "./issuekit-plumb.js";
import { cmdCommit } from "./issuekit-commit.js";
import { cmdPushCheck } from "./issuekit-push.js";
import { cmdShow, printAttempts, ATTEMPT_RE } from "./issuekit-show.js";
import {
  PIPELINE_LABELS,
  ISSUEKIT_LABELS,
  syncLabels,
  printLabelReport,
} from "./issuekit-labels.js";

/** @typedef {import("./issuekit-lib.js").Flags} Flags */
/** @typedef {import("./issuekit-lib.js").GhNode} GhNode */

// ── templates ────────────────────────────────────────────────────────────────
/** Render an attempt field for the comment body. Objects are JSON, not "[object Object]" —
 * an attempt log that silently swallows its evidence is worse than no log.
 * @param {unknown} v @returns {string} */
const text = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return v.toString();
  return JSON.stringify(v) ?? "";
};

/** @type {Record<string, string>} */
const RESULT_EMOJI = { failed: "❌", fixed: "✅", partial: "⚠️", blocked: "🚫" };

/** @param {number} n @param {string} result @param {Record<string, unknown>} f */
function renderAttempt(n, result, f) {
  const emoji = RESULT_EMOJI[result] ?? "•";
  const touched = Array.isArray(f.touched)
    ? f.touched.map((t) => `\`${text(t)}\``).join(", ")
    : f.touched
      ? text(f.touched)
      : "—";
  const block = (/** @type {unknown} */ s) => (text(s).trim() ? text(s).trimEnd() : "—");
  return `<!-- issuekit:attempt n=${n} result=${result} -->
## 🔁 Attempt ${n} — ${emoji} ${result.toUpperCase()}
**Hypothesis:** ${block(f.hypothesis)}
**Approach:** ${block(f.approach)}
**Touched:** ${touched}
**Commands (verbatim):**
\`\`\`sh
${block(f.commands)}
\`\`\`
**Evidence (verbatim):**
\`\`\`
${block(f.evidence)}
\`\`\`
**Conclusion / DO-NOT-RETRY:** ${block(f.conclusion)}

---
*issuekit · ${agentName()} · ${shortHead()} · ${nowIso()}*
`;
}

/** @param {string} [symptom] */
function renderIssueBody(symptom) {
  return `<!-- issuekit:issue v1 -->
## Symptom (verbatim)
${(symptom ?? "").trim() || "—"}
## Repro
1.
## Expected vs Actual
## Environment
<!-- issuekit:attempts-below -->
`;
}

// ── field gathering for attempt/resolve ──────────────────────────────────────
// `*-file` flags: read the named file, or stdin when the value is "-".
/** @param {string | boolean | undefined} val */
function readMaybeFile(val) {
  if (val === undefined) return undefined;
  if (val === "-") return readFileSync(0, "utf8");
  return readFileSync(String(val), "utf8");
}

/** @param {Flags} flags */
function gatherFields(flags) {
  /** @type {Record<string, unknown>} */
  let f = {};
  if (flags["from-file"] !== undefined) {
    const raw = readMaybeFile(flags["from-file"]);
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(raw ?? "");
    } catch (e) {
      throw new Error(
        "--from-file must be a JSON object {hypothesis,approach,touched,commands,evidence,conclusion}",
        { cause: e },
      );
    }
    // A non-object payload is rejected too: an attempt posted with empty fields is a LIE in the
    // log, and the write to GitHub cannot be taken back.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error(
        "--from-file must be a JSON object {hypothesis,approach,touched,commands,evidence,conclusion}",
      );
    f = /** @type {Record<string, unknown>} */ (parsed);
  }
  const ov = {
    hypothesis: flags.hypothesis,
    approach: flags.approach,
    touched: flags.touched,
    conclusion: flags.conclusion,
    commands:
      flags["commands-file"] !== undefined ? readMaybeFile(flags["commands-file"]) : flags.commands,
    evidence:
      flags["evidence-file"] !== undefined ? readMaybeFile(flags["evidence-file"]) : flags.evidence,
  };
  for (const [k, v] of Object.entries(ov)) if (v !== undefined) f[k] = v;
  return f;
}

// count existing attempts on an issue (accurate; uses issue view, not search)
/** @param {string} repo @param {string | number} num */
function attemptCount(repo, num) {
  const data = ghNode(["issue", "view", String(num), "-R", repo, "--json", "comments"]);
  let n = 0;
  for (const c of data?.comments ?? []) if (ATTEMPT_RE.test(c.body ?? "")) n++;
  return n;
}

/** @param {string} repo @param {string | number} num @param {string[]} labels */
function addLabels(repo, num, labels) {
  if (!labels.length) return;
  gh(["issue", "edit", String(num), "-R", repo, ...labels.flatMap((l) => ["--add-label", l])], {
    allowFail: true,
  });
}

// ── commands ─────────────────────────────────────────────────────────────────
const ISSUE_TEMPLATE_YML = `name: Bug (issuekit)
description: Structured bug report — agents log attempts below via issuekit
labels: ["bug"]
body:
  - type: textarea
    id: symptom
    attributes:
      label: Symptom (verbatim)
      description: Paste the exact error / behavior, unedited.
    validations: { required: true }
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
  - type: textarea
    id: expected
    attributes:
      label: Expected vs Actual
  - type: input
    id: env
    attributes:
      label: Environment
`;

/** @param {Flags} flags */
function cmdInit(flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  console.log(`init: ${repo}`);
  const ok = printLabelReport(syncLabels(repo, [...PIPELINE_LABELS, ...ISSUEKIT_LABELS]));
  // Do not bind the project to a repo whose label vocabulary the gates cannot use: a written
  // .issuekit.json says "this is set up", and the next stage would believe it.
  if (!ok)
    throw new Error(
      "label setup is incomplete (see BLOCKING above) — .issuekit.json NOT written; fix the labels and re-run `issuekit init`",
    );
  const cfgPath = join(process.cwd(), ".issuekit.json");
  /** @type {Record<string, string>} */
  const cfg = { repo };
  const user = str(flags.user);
  if (user) cfg.ghUser = user;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`  config ✓ ${cfgPath}`);
  if (flags.template) {
    const dir = join(process.cwd(), ".github", "ISSUE_TEMPLATE");
    mkdirSync(dir, { recursive: true });
    const tp = join(dir, "issuekit.yml");
    writeFileSync(tp, ISSUE_TEMPLATE_YML);
    console.log(`  template ✓ ${tp}`);
  }
  console.log('done. Next: `issuekit search "<symptom>"` before touching code.');
}

/** @param {string[]} pos @param {Flags} flags */
function cmdSearch(pos, flags) {
  maybeSwitchUser(flags, { mutating: false });
  const repo = resolveRepo(flags);
  const terms = pos.join(" ").trim();
  if (!terms) throw new Error("search needs terms: issuekit search <terms…>");
  const limit = strOr(flags.limit, "30");
  const args = [
    "search",
    "issues",
    terms,
    "-R",
    repo,
    "--match",
    "title,body,comments",
    "--json",
    "number,title,state,url,labels,updatedAt",
    "--limit",
    String(limit),
  ];
  const state = strOr(flags.state, "all");
  if (state !== "all") args.push("--state", String(state));
  const hits = ghNodes(args);
  console.log(`# ${hits.length} match(es) for "${terms}" in ${repo} [state=${state}]`);
  if (!hits.length) {
    console.log("No prior issues. Proceed (and log your attempt so the next agent sees it).");
    return;
  }
  const topK = flags.full ? hits.length : Math.min(5, hits.length);
  hits.forEach((h, i) => {
    const labs = (h.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)).join(", ");
    const marker = i < topK ? "→" : " ";
    console.log(
      `${marker} #${h.number} [${h.state}] ${h.title}${labs ? `  {${labs}}` : ""}\n    ${h.url}`,
    );
  });
  console.log(`\n── verbatim prior attempts (top ${topK}) ──`);
  for (const h of hits.slice(0, topK)) {
    const issue = ghNode([
      "issue",
      "view",
      String(h.number),
      "-R",
      repo,
      "--json",
      "number,title,state,body,comments",
    ]);
    console.log(`\n#${issue.number} [${issue.state}] ${issue.title}`);
    printAttempts(issue, { full: Boolean(flags.full) });
  }
}

/** @param {string} repo @param {string | number} num @param {string} result @param {Record<string, unknown>} fields */
function postAttempt(repo, num, result, fields) {
  const n = attemptCount(repo, num) + 1;
  const body = renderAttempt(n, result, fields);
  const p = tmpFile(`attempt-${num}-${n}`, body);
  const r = gh(["issue", "comment", String(num), "-R", repo, "--body-file", p]);
  const labels = ["issuekit:attempted"];
  if (result === "blocked") labels.push("issuekit:blocked");
  addLabels(repo, num, labels);
  return { n, url: r.out };
}

/** @param {string[]} pos @param {Flags} flags */
function cmdAttempt(pos, flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  const num = pos[0];
  const result = str(flags.result) ?? "";
  if (!num) throw new Error("attempt needs an issue number");
  if (!RESULT_EMOJI[result])
    throw new Error("--result must be one of: failed|fixed|partial|blocked");
  const { n, url } = postAttempt(repo, num, result, gatherFields(flags));
  console.log(`logged Attempt ${n} (${result}) on #${num}`);
  if (url) console.log(url);
}

/** @param {string[]} pos @param {Flags} flags */
function cmdResolve(pos, flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  const num = pos[0];
  if (!num) throw new Error("resolve needs an issue number");
  if (!flags.cause) throw new Error('resolve needs --cause "<verified root cause>"');
  const fields = {
    hypothesis: "(resolved)",
    approach: strOr(flags.fix, "—"),
    conclusion: `ROOT CAUSE (verified): ${flags.cause}`,
    ...gatherFields(flags),
  };
  const { n, url } = postAttempt(repo, num, "fixed", fields);
  const label = strOr(flags.label, "issuekit:resolved");
  addLabels(repo, num, [label]);
  if (flags.close) gh(["issue", "close", String(num), "-R", repo], { allowFail: true });
  console.log(`resolved #${num} (Attempt ${n}, label ${label}${flags.close ? ", closed" : ""})`);
  if (url) console.log(url);
}

/** @param {string[]} pos @param {Flags} flags */
function cmdNew(pos, flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  const title = strOr(flags.title, pos.join(" ").trim());
  if (!title) throw new Error('new needs --title "<title>"');
  // dedup: search open issues for the title
  const dup = ghNodes([
    "search",
    "issues",
    title,
    "-R",
    repo,
    "--state",
    "open",
    "--match",
    "title",
    "--json",
    "number,title,url",
    "--limit",
    "5",
  ]);
  if (dup.length && !flags.force) {
    console.log("Possible duplicate open issue(s) — pass --force to create anyway:");
    for (const d of dup) console.log(`  #${d.number} ${d.title}\n    ${d.url}`);
    process.exit(2);
  }
  // `--body-file` supplies the WHOLE body; `--symptom-file` supplies just the symptom and gets
  // issuekit's attempt-log template around it. Callers that own their own issue shape — intake,
  // which files feedback in the project's own format — need the former, or they would have to
  // create and then immediately patch the body they meant to write.
  const wholeBody = readMaybeFile(flags["body-file"]);
  const symptom = readMaybeFile(flags["symptom-file"]) ?? "";
  const p = tmpFile("new", wholeBody ?? renderIssueBody(symptom));
  const args = ["issue", "create", "-R", repo, "--title", title, "--body-file", p];
  if (flags.label) for (const l of String(flags.label).split(",")) args.push("--label", l.trim());
  const r = gh(args);
  console.log(`created: ${r.out}`);
}

/** @param {Flags} flags */
function cmdLabelsInit(flags) {
  maybeSwitchUser(flags);
  const repo = resolveRepo(flags);
  console.log(`labels: ${repo}`);
  if (!printLabelReport(syncLabels(repo, [...PIPELINE_LABELS, ...ISSUEKIT_LABELS])))
    throw new Error("label setup is incomplete (see BLOCKING above)");
}

// patch <#>: issue edits (title/body/labels) through the tool, not raw gh.
/** @param {string | number} num @param {Flags} flags */
function cmdPatch(num, flags) {
  const repo = resolveRepo(flags);
  if (!num) throw new Error("patch needs an issue number");
  const args = ["issue", "edit", String(num), "-R", repo];
  if (flags.title) args.push("--title", String(flags.title));
  if (flags["body-file"] !== undefined)
    args.push("--body-file", flags["body-file"] === "-" ? "-" : String(flags["body-file"]));
  for (const l of (str(flags["add-label"]) ?? "").split(",").filter(Boolean))
    args.push("--add-label", l.trim());
  for (const l of (str(flags["remove-label"]) ?? "").split(",").filter(Boolean))
    args.push("--remove-label", l.trim());
  if (args.length === 5)
    throw new Error("patch needs at least one of --title --body-file --add-label --remove-label");
  gh(args, flags["body-file"] === "-" ? { input: readFileSync(0, "utf8") } : {});
  console.log(`patched ✓ #${num}`);
}

// close <#>: plain close (use `resolve --close` when there is a verified root cause).
/** @param {string | number} num @param {Flags} flags */
function cmdClose(num, flags) {
  const repo = resolveRepo(flags);
  if (!num) throw new Error("close needs an issue number");
  const args = ["issue", "close", String(num), "-R", repo];
  if (flags.comment) args.push("--comment", String(flags.comment));
  gh(args);
  console.log(`closed ✓ #${num}`);
}

const HELP = `issuekit — searchable, deterministic GitHub-issue attempt log (standalone; gh + git + node)

  issuekit init [--repo R] [--user U] [--template]
      Per-project setup (run when starting a project): create issuekit:* labels,
      write .issuekit.json, optionally drop .github/ISSUE_TEMPLATE/issuekit.yml.

  issuekit search <terms…> [--state all|open|closed] [--limit N] [--full] [--repo R]
      SEARCH FIRST. Finds prior issues (title+body+comments, incl. closed) and prints
      every logged attempt VERBATIM, flagging ⚠ DO-NOT-RETRY (failed) / ✅ KNOWN FIX.

  issuekit attempt <#> --result failed|fixed|partial|blocked
      [--hypothesis ..] [--approach ..] [--touched "a:1,b:2"]
      [--commands .. | --commands-file f|-] [--evidence .. | --evidence-file f|-]
      [--conclusion ..] [--from-file json|-] [--repo R]
      Log ONE attempt as a templated comment (auto-numbered, provenance footer).

  issuekit commit <#> -m "<message>"
      Commit the STAGED fix for an issue: asks the same commit gate the hook uses, commits
      with the (#N) reference, then stamps committed + fixed-pending-deploy (dropping
      needs-deploy). Never pushes — the push stage does. --force overrides a gate ASK only,
      never a DENY.

  issuekit resolve <#> --cause "…" [--fix "…"] [--close] [--label fixed-pending-deploy] [--repo R]
  issuekit new --title "…" [--body-file f|-] [--symptom-file f|-] [--label a,b] [--force] [--repo R]
  issuekit show <#> [--repo R] [--digest [--lane L] [--cap N] [--full]]
      --digest = the thread as a stage reads it, ONE deterministic shape: labels, body, the
      NEWEST comment per lane (triage/analysis/review+external review/qa/prepr), attempts
      flagged — each capped head+tail (spec fields sit at the END). --lane picks one lane.
      Use it instead of raw \`gh issue view … --json comments\` dumps (token-audit issue-digest).
  issuekit patch <#> [--title ..] [--body-file f|-] [--add-label a,b] [--remove-label a,b]
  issuekit close <#> [--comment "…"]
  issuekit labels-init [--repo R]

  BRANCH & PR — the convention lives in the tool; agents pass a number, never raw gh:
  issuekit branch <#> [--prefix fix]     create the issue's work branch server-side from base
  issuekit branch sync <name>            move a stale LOCAL branch to origin (safe; no reset,
                                         refuses when checked out; reflog keeps the old sha)
  issuekit branch contained <name>       content-evidence containment verdict (squash-safe;
                                         per-file two-dot diffs — cherry/--merged lie)
  issuekit branch prune [--apply]        dry-run dead-branch list; --apply deletes ONLY the proven
  issuekit pr <issue#>                   open PR branch→base; "Refs #N" body, never Closes
  issuekit pr update <PR#> [--rebase]    merge base into the PR branch SERVER-SIDE — re-fires
                                         checks, touches nothing local (stale-PR command)
  issuekit pr merge <PR#> [--method m] [--when-green]
                                         merge (default squash) + delete head AT merge;
                                         --when-green gates first: OPEN + no conflicts +
                                         every check SUCCESS/NEUTRAL/SKIPPED, else exit 1
                                         listing the blockers (nothing merged)
  issuekit pr retarget <PR#> --base B    change base (prints the no-checks-fired follow-up)
  issuekit promote [--from A] [--to B]   server-side merge integration → prod lane
                                         (defaults: base → prodBranch from .issuekit.json);
                                         conflict → exit 1, resolve via PR
  issuekit push-check [branch] [--remote R] [--set-upstream]
                                         the push STAGE's gate in ONE call: tree (dirty = flagged,
                                         untouched), upstream, fast-forward, each (#N)'s labels +
                                         newest QA/REVIEW verdict, PR checks / last run, target.
                                         STOP → exit 1 naming the owning stage; PASS → prints the
                                         bare \`git push\` to run next. Never pushes (gates must see it).
  issuekit deploy-check [--workflow W] [--branch B]
                                         last COMPLETED deploy run's conclusion; fails on
                                         non-success; never polls in-flight. Merged ≠ done.

  .issuekit.json keys: repo, ghUser, base, branchPrefix, mergeMethod, deployWorkflow, prodBranch.
  Repo resolves: --repo > .issuekit.json > current git repo. Optional --user runs
  \`gh auth switch\`. NEVER uses \`rtk gh\` (it truncates labels) — raw gh only.`;

// ── dispatch ─────────────────────────────────────────────────────────────────

/** Verbs that act on a specific gh account before they touch anything. */
const SWITCHES_USER = new Set(["patch", "close", "promote", "deploy-check"]);

/** @type {Record<string, (pos: string[], flags: Flags) => void>} */
const COMMANDS = {
  init: (_pos, flags) => {
    cmdInit(flags);
  },
  commit: (pos, flags) => {
    cmdCommit(pos[0] ?? "", flags);
  },
  search: (pos, flags) => {
    cmdSearch(pos, flags);
  },
  attempt: (pos, flags) => {
    cmdAttempt(pos, flags);
  },
  resolve: (pos, flags) => {
    cmdResolve(pos, flags);
  },
  new: (pos, flags) => {
    cmdNew(pos, flags);
  },
  show: (pos, flags) => {
    cmdShow(pos, flags);
  },
  patch: (pos, flags) => {
    cmdPatch(pos[0] ?? "", flags);
  },
  close: (pos, flags) => {
    cmdClose(pos[0] ?? "", flags);
  },
  branch: (pos, flags) => {
    cmdBranch(pos, flags);
  },
  pr: (pos, flags) => {
    cmdPr(pos, flags);
  },
  promote: (_pos, flags) => {
    cmdPromote(flags);
  },
  "deploy-check": (_pos, flags) => {
    cmdDeployCheck(flags);
  },
  "push-check": (pos, flags) => {
    cmdPushCheck(pos, flags);
  },
  "labels-init": (_pos, flags) => {
    cmdLabelsInit(flags);
  },
};

function main() {
  const [, , sub, ...rest] = process.argv;
  const { pos, flags } = parseArgs(rest);
  if (!sub || sub === "--help" || sub === "help" || flags.help) {
    console.log(HELP);
    return;
  }
  const command = COMMANDS[sub];
  if (!command) {
    console.error(`Unknown command: ${sub}\n`);
    console.log(HELP);
    process.exit(2);
  }
  try {
    if (SWITCHES_USER.has(sub)) maybeSwitchUser(flags);
    command(pos, flags);
  } catch (e) {
    console.error(`issuekit: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

main();

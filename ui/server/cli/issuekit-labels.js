// The pipeline's label vocabulary — ONE declaration, as data.
//
// Before this, no code anywhere created these labels: every stage matched them as string literals
// (~40 files) and assumed someone had made them by hand. Two real projects drifted apart exactly as
// you would expect — one grew `codex:*-pass` labels and has no review labels at all, the other kept
// `analyzed` from a stage that no longer exists, and `qa:pass` is a different colour in each.
//
// The gates match label names EXACTLY, so a name is a contract; colour and description are not.
// That asymmetry drives the whole design here: a missing label is created, a name that already
// exists is left ALONE (its colour/description belong to the project), and anything retired is
// reported for a human to migrate — never deleted, because live issues still carry it.
import { gh } from "./issuekit-lib.js";

/** @typedef {{ name: string, color: string, description: string }} LabelSpec */

/**
 * The stage labels every project gets. Order is the pipeline's order — the list doubles as the
 * state machine's documentation, and `init` prints it that way.
 * @type {LabelSpec[]}
 */
export const PIPELINE_LABELS = [
  { name: "triaged", color: "0E8A16", description: "Root cause proved, severity scored" },
  {
    name: "needs-info",
    color: "FBCA04",
    description: "Blocked on the reporter — not reproducible from what was given",
  },
  {
    name: "solution-ready",
    color: "1D76DB",
    description: "Fix designed and specified; ready to implement",
  },
  {
    name: "implemented",
    color: "0075CA",
    description: "Fix built and left uncommitted, pending QA",
  },
  { name: "qa:pass", color: "0E8A16", description: "QA gate passed at the verified SHA" },
  {
    name: "qa:blocked",
    color: "D93F0B",
    description: "QA gate blocked — back to the implement stage",
  },
  {
    name: "review:pass",
    color: "0E8A16",
    description: "Adversarial review passed at the verified SHA",
  },
  {
    name: "review:changes",
    color: "D93F0B",
    description: "Review found a concrete hole — back to the implement stage",
  },
  { name: "committed", color: "5319E7", description: "Fix committed, pending push" },
  { name: "fixed-pending-deploy", color: "C2E0C6", description: "Fixed; closes on deploy" },
  { name: "sev:critical", color: "B60205", description: "Blocks everyone: crash, data loss, auth" },
  { name: "sev:high", color: "D93F0B", description: "Core flow broken with no workaround" },
  { name: "sev:medium", color: "FBCA04", description: "Broken with a workaround, or a subset" },
  { name: "sev:low", color: "C5DEF5", description: "Cosmetic, minor, or a rare edge case" },
  // Acceptance runs OUT of band: these three never gate a commit, and the stage writes no qa:/
  // review: label. Three values, not two — a FAIL is a product defect, a BLOCKED is a setup
  // problem, and collapsing them files bugs that do not exist or buries ones that do.
  {
    name: "uat:pass",
    color: "0E8A16",
    description: "Acceptance run passed against the running app",
  },
  { name: "uat:fail", color: "D93F0B", description: "Acceptance run: the product behaved wrongly" },
  {
    name: "uat:blocked",
    color: "FBCA04",
    description: "Acceptance could not run — precondition or environment",
  },
];

/** issuekit's own attempt-log labels — its bookkeeping, not the pipeline's. @type {LabelSpec[]} */
export const ISSUEKIT_LABELS = [
  {
    name: "issuekit:in-progress",
    color: "FBCA04",
    description: "Agent actively working this issue",
  },
  { name: "issuekit:attempted", color: "C5DEF5", description: "Has one or more logged attempts" },
  {
    name: "issuekit:blocked",
    color: "D93F0B",
    description: "Agent blocked — needs input / next hypothesis",
  },
  { name: "issuekit:resolved", color: "0E8A16", description: "Verified fix logged via issuekit" },
];

/**
 * Labels a repo may still carry from a stage that no longer exists. They are REPORTED, never
 * deleted: closed issues are the pipeline's history, and deleting a label rewrites that history
 * on every issue that carried it.
 * @type {{ name: string, why: string }[]}
 */
export const RETIRED_LABELS = [
  { name: "analyzed", why: "the fused analyst stage was split into triage + solution" },
  {
    name: "codex:solution-pass",
    why: "an external review is EVIDENCE for the lane verdict, never a verdict of its own",
  },
  { name: "codex:implementation-pass", why: "same — the lane verdict is `review:pass`" },
];

/** @typedef {{ created: string[], present: string[], drift: { name: string, have: string, want: string }[], retired: { name: string, why: string }[], collisions: { name: string, existing: string }[], failed: { name: string, err: string }[] }} LabelReport */

/**
 * Bring a repo's labels up to the canonical set, non-destructively.
 *
 * Creates what is missing. Leaves what exists ALONE — a project's own wording for a label it
 * already uses is not drift to be corrected, and `gh label create --force` would silently rewrite
 * it. Colour/description differences are REPORTED so a human can decide.
 *
 * @param {string} repo @param {LabelSpec[]} specs @returns {LabelReport}
 */
export function syncLabels(repo, specs) {
  const existing = readLabels(repo);
  const plan = diffLabels(existing, specs);
  /** @type {LabelReport} */
  const report = {
    created: [],
    present: plan.present,
    drift: plan.drift,
    retired: plan.retired,
    collisions: plan.collisions,
    /** @type {{ name: string, err: string }[]} */
    failed: [],
  };

  for (const spec of plan.missing) {
    // No --force: it exists or it does not, and we only ever create.
    const r = gh(
      [
        "label",
        "create",
        spec.name,
        "-R",
        repo,
        "--color",
        spec.color,
        "--description",
        spec.description,
      ],
      { allowFail: true },
    );
    if (r.status === 0) report.created.push(spec.name);
    else report.failed.push({ name: spec.name, err: r.err || "gh label create failed" });
  }
  return report;
}

/**
 * The DECISION, separated from the network so it can be tested: given what the repo has and what
 * the framework declares, what is missing, what already exists, where do they differ, and what
 * retired labels are still hanging around.
 *
 * @param {Map<string, LabelSpec>} existing @param {LabelSpec[]} specs
 * @returns {{ missing: LabelSpec[], present: string[], drift: { name: string, have: string, want: string }[], retired: { name: string, why: string }[], collisions: { name: string, existing: string }[] }}
 */
export function diffLabels(existing, specs) {
  /** @type {LabelSpec[]} */
  const missing = [];
  /** @type {{ name: string, existing: string }[]} */
  const collisions = [];
  // GitHub treats label names case-insensitively for CREATION but the gates match them exactly,
  // so `QA:Pass` is the worst possible state: the canonical label can never be created, and every
  // gate looking for `qa:pass` silently sees nothing.
  const byLower = new Map([...existing.keys()].map((k) => [k.toLowerCase(), k]));
  /** @type {string[]} */
  const present = [];
  /** @type {{ name: string, have: string, want: string }[]} */
  const drift = [];

  for (const spec of specs) {
    const have = existing.get(spec.name);
    if (!have) {
      const clash = byLower.get(spec.name.toLowerCase());
      if (clash) collisions.push({ name: spec.name, existing: clash });
      else missing.push(spec);
      continue;
    }
    present.push(spec.name);
    if ((have.color || "").toUpperCase() !== spec.color.toUpperCase())
      drift.push({ name: spec.name, have: `#${have.color}`, want: `#${spec.color}` });
    if (have.description && have.description !== spec.description)
      drift.push({ name: spec.name, have: have.description, want: spec.description });
  }
  const retired = RETIRED_LABELS.filter((r) => existing.has(r.name));
  return { missing, present, drift, retired, collisions };
}

/** How many labels we enumerate in one call. GitHub allows more; we refuse to GUESS past it,
 * because a canonical label sitting on page two reads as "missing" and a retired one goes
 * unreported — the exact two failures this module exists to prevent. */
const LABEL_PAGE = 500;

/** Every label on the repo, by name. THROWS rather than returning an empty map: an inventory we
 * could not read is not an empty repo, and treating it as one would "create" every label, report
 * failures as drift, and still exit 0.
 * @param {string} repo @returns {Map<string, LabelSpec>} */
function readLabels(repo) {
  const out = gh(
    [
      "label",
      "list",
      "-R",
      repo,
      "--limit",
      String(LABEL_PAGE),
      "--json",
      "name,color,description",
    ],
    { allowFail: true },
  );
  if (out.status !== 0)
    throw new Error(
      `cannot read ${repo}'s labels (${out.err || "gh failed"}) — check \`gh auth status\``,
    );
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(out.out || "[]");
  } catch (e) {
    throw new Error(`gh returned unreadable label JSON for ${repo}`, { cause: e });
  }
  if (!Array.isArray(parsed)) throw new Error(`gh returned a non-list of labels for ${repo}`);
  if (parsed.length >= LABEL_PAGE)
    throw new Error(
      `${repo} has at least ${LABEL_PAGE} labels — this tool would not see the rest, so it refuses to ` +
        "decide what is missing. Prune the label set, or raise LABEL_PAGE with pagination.",
    );
  /** @type {Map<string, LabelSpec>} */
  const map = new Map();
  for (const row of /** @type {LabelSpec[]} */ (parsed)) if (row?.name) map.set(row.name, row);
  return map;
}

/** Print a label report the way `init` and `labels-init` both want it, and say whether the repo
 * is USABLE by the gates afterwards. A caller that ignores the return value has ignored the whole
 * point of the check. @param {LabelReport} r @returns {boolean} ok */
export function printLabelReport(r) {
  for (const n of r.created) console.log(`  created  ${n}`);
  for (const n of r.present) console.log(`  present  ${n}`);
  for (const d of r.drift)
    console.log(`  differs  ${d.name}: has "${d.have}", canonical is "${d.want}"`);
  if (r.drift.length)
    console.log(
      `\n  ${r.drift.length} label(s) differ from the canonical set. NOT changed — the name is what the\n` +
        "  gates match; colour and wording are the project's own. Align them by hand if you want to.",
    );
  if (r.retired.length) {
    console.log("\n  RETIRED labels still on this repo — migrate before a gate reads them:");
    for (const t of r.retired) console.log(`    ${t.name} — ${t.why}`);
    console.log("  Live issues still carry them, so nothing was deleted.");
  }
  if (r.collisions.length) {
    console.log("\n  BLOCKING — a label differs from the canonical one only by CASE:");
    for (const c of r.collisions)
      console.log(
        `    ${c.existing} vs canonical ${c.name} — every gate matching "${c.name}" sees nothing`,
      );
    console.log("  Rename it on GitHub (the issues keep the label), then re-run.");
  }
  if (r.failed.length) {
    console.log("\n  BLOCKING — labels the gates need could not be created:");
    for (const f of r.failed) console.log(`    ${f.name}: ${f.err}`);
  }
  return r.collisions.length === 0 && r.failed.length === 0;
}

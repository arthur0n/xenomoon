// issuekit show — the issue as a stage reads it, plus `--digest`: the compact view.
//
// Every pipeline stage re-pulls the issue thread through its own ad-hoc jq/python — the whole
// comment list, then a `select(test("🧪 QA —")) | last` on top. A token audit (2026-09-01, id
// issue-digest) measured one session fetching #295's thread 29 times (107k chars) and #289's 33
// times; single dumps ran 11–22k chars, and the ANALYSIS a builder needs as its spec came back
// whole every time (11.5k). The thread never changes shape between stages, so the view is
// deterministic: the NEWEST comment per lane, capped head+tail (the spec fields sit at the END
// of an analysis — a head-only cap deletes exactly what the next stage needs), the body, the
// labels, and every issuekit attempt flagged. One call, one shape, every stage.
//
// The lane selectors are the commit gate's (plugin/hooks/commit-gate.sh) and the review skill's:
// the newest `## 🔎 REVIEW —` AND the newest external `## 🔎 CODEX|INTERNAL REVIEW` are printed
// separately, because a lane pass can be superseded by a reviewer that never got folded in.
import { ghNode, resolveRepo, maybeSwitchUser, indent, mark, str } from "./issuekit-lib.js";

/** @typedef {import("./issuekit-lib.js").Flags} Flags */
/** @typedef {import("./issuekit-lib.js").GhNode} GhNode */
/** @typedef {NonNullable<GhNode["comments"]>[number]} Comment */

export const ATTEMPT_RE = /<!--\s*issuekit:attempt\b[^>]*-->/;

/** @param {string} body */
export const resultOf = (body) => {
  const m = body.match(/<!--\s*issuekit:attempt\b[^>]*\bresult=([a-z]+)/);
  return m?.[1] ?? null;
};

/** The lanes, in pipeline order. `cap` is the per-comment default; analysis is wider because it
 * IS the implement stage's spec (same 8000/2500/4500 the implement skill used by hand). */
export const LANES = /** @type {const} */ ([
  { id: "triage", title: "🔍 TRIAGE", re: /(^|\n)## (🔍 )?Triage/i, cap: 4000 },
  { id: "analysis", title: "🔬 ANALYSIS", re: /(^|\n)## (🔬 )?ANALYSIS/, cap: 8000 },
  { id: "review", title: "🔎 REVIEW", re: /(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? —/, cap: 4000 },
  {
    id: "review",
    title: "🔎 EXTERNAL REVIEW",
    re: /(^|\n)## (🔎 )?(CODEX|INTERNAL) REVIEW/,
    cap: 4000,
  },
  { id: "qa", title: "🧪 QA", re: /(^|\n)## (🧪 )?QA( \([^)\n]*\))? —/, cap: 4000 },
  { id: "prepr", title: "🚦 PRE-PR", re: /(^|\n)## (🚦 )?PRE-PR/, cap: 4000 },
]);

/** The overview (`--digest` with no `--lane`) answers "where is this issue" — labels and each
 * lane's newest verdict HEADER and tail markers — so every lane is capped tighter there. A stage
 * that needs a lane's body asks for that lane and gets the lane's own cap. Measured on a live
 * 5-comment thread: raw dump 37.5k chars, overview ≈ 12k, `--lane analysis` 8.9k. */
const OVERVIEW_CAP = 1500;

/** @typedef {(typeof LANES)[number]["id"] | "attempts" | "all"} LaneId */
export const LANE_IDS = ["all", "triage", "analysis", "review", "qa", "prepr", "attempts"];

/**
 * Head+tail cap. Long comments keep their opening (the verdict header, the summary) and their
 * ending (the spec fields, the SHA markers) and elide the middle — the elision names how much
 * went and how to get it, so nothing is silently missing.
 * @param {string} body @param {number} cap @param {string} full how to fetch the whole thing */
export function capped(body, cap, full) {
  const b = body.trimEnd();
  if (cap <= 0 || b.length <= cap) return b;
  const head = Math.floor(cap * 0.4);
  const tail = cap - head;
  return `${b.slice(0, head)}\n\n[… ${b.length - cap} chars elided — full: ${full}]\n\n${b.slice(b.length - tail)}`;
}

/** @param {Comment} c */
const who = (c) => `@${c.author?.login ?? "?"}${c.createdAt ? ` ${c.createdAt.slice(0, 10)}` : ""}`;

/** @param {string | null} res */
const attemptFlag = (res) =>
  res === "failed"
    ? "⚠ DO-NOT-RETRY"
    : res === "fixed"
      ? "✅ KNOWN FIX"
      : res === "blocked"
        ? "🚫 BLOCKED"
        : (res ?? "");

/** @typedef {{ comments: Comment[], shown: Set<number>, fetch: string, capFor: (n: number) => number }} Ctx */

/** The newest comment of one lane, or its absence — and its index marked as shown.
 * @param {Ctx} x @param {(typeof LANES)[number]} L @returns {string[]} */
function laneBlock(x, L) {
  const idx = x.comments.map((c, i) => (L.re.test(c.body ?? "") ? i : -1)).filter((i) => i >= 0);
  const i = idx.at(-1);
  if (i === undefined) return ["", `── ${L.title} — none ──`];
  const c = /** @type {Comment} */ (x.comments[i]);
  x.shown.add(i);
  const older = idx.length - 1;
  return [
    "",
    `── ${L.title} (newest, ${who(c)}${older ? `; ${older} older in lane` : ""}) ──`,
    indent(capped(c.body ?? "", x.capFor(L.cap), x.fetch)),
  ];
}

/** Every issuekit attempt, flagged — the tool's own record is never elided from the digest.
 * @param {Ctx} x @returns {string[]} */
function attemptBlocks(x) {
  const attempts = x.comments
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => ATTEMPT_RE.test(c.body ?? ""));
  const out = ["", `── issuekit attempts (${attempts.length}) ──`];
  for (const { c, i } of attempts) {
    x.shown.add(i);
    out.push(
      `  ${attemptFlag(resultOf(c.body ?? ""))} ${who(c)}`,
      indent(capped(c.body ?? "", x.capFor(3000), x.fetch)),
    );
  }
  return out;
}

/** Which cap applies: none with --full, the override with --cap, else the lane's own — tightened
 * to OVERVIEW_CAP when the whole issue is being overviewed rather than one lane read.
 * @param {string} lane @param {number | null} cap @param {boolean} full @returns {(n: number) => number} */
const capPolicy = (lane, cap, full) => (laneCap) => {
  if (full) return 0;
  if (cap !== null) return cap;
  return lane === "all" ? Math.min(laneCap, OVERVIEW_CAP) : laneCap;
};

/** @param {GhNode} issue */
function headerLines(issue) {
  const labels = (issue.labels ?? [])
    .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
    .filter(Boolean);
  const tag = labels.length ? `  {${labels.join(", ")}}` : "";
  const out = [`#${issue.number ?? "?"} [${issue.state ?? "?"}] ${issue.title ?? ""}${tag}`];
  if (issue.url) out.push(issue.url);
  return out;
}

/**
 * The digest, as text. Pure: the issue node in, the view out.
 * @param {GhNode} issue
 * @param {{ lane?: string, cap?: number | null, full?: boolean }} [opts]
 *   lane: one of LANE_IDS (default "all"); cap: override every lane's cap; full: no caps at all.
 */
export function digestOf(issue, { lane = "all", cap = null, full = false } = {}) {
  /** @type {Ctx} */
  const x = {
    comments: issue.comments ?? [],
    shown: new Set(),
    fetch: `gh issue view ${issue.number ?? "?"} --comments`,
    capFor: capPolicy(lane, cap, full),
  };
  const out = headerLines(issue);
  if (lane === "all")
    out.push("", "── body ──", indent(capped(issue.body ?? "", x.capFor(4000), x.fetch)));
  for (const L of LANES) if (lane === "all" || lane === L.id) out.push(...laneBlock(x, L));
  if (lane === "all" || lane === "attempts") out.push(...attemptBlocks(x));
  const elided = x.comments.length - x.shown.size;
  if (elided > 0) {
    const chars = x.comments.reduce(
      (n, c, i) => (x.shown.has(i) ? n : n + (c.body ?? "").length),
      0,
    );
    out.push("", `elided: ${elided} other comment(s), ${chars} chars — full thread: ${x.fetch}`);
  }
  return out.join("\n");
}

// extract and print every issuekit attempt comment verbatim, flagged
/** @param {GhNode} issue @param {{ full?: boolean }} [opts] */
export function printAttempts(issue, { full } = {}) {
  const comments = issue.comments ?? [];
  const attempts = comments.filter((c) => ATTEMPT_RE.test(c.body ?? ""));
  if ((issue.body ?? "").includes("<!-- issuekit:issue")) {
    if (full) {
      console.log("  ── issue body (verbatim) ──");
      console.log(indent(issue.body ?? ""));
    }
  }
  if (!attempts.length) {
    console.log("  (no issuekit attempts logged on this issue)");
    return;
  }
  for (const c of attempts) {
    const res = resultOf(c.body ?? "");
    const flag =
      res === "failed"
        ? "  ⚠ DO-NOT-RETRY ↓"
        : res === "fixed"
          ? "  ✅ KNOWN FIX ↓"
          : res === "blocked"
            ? "  🚫 BLOCKED ↓"
            : "";
    if (flag) console.log(flag);
    console.log(indent((c.body ?? "").trimEnd()));
    console.log("");
  }
}

/** `issuekit show <#> [--digest [--lane L] [--cap N] [--full]]`
 * @param {string[]} pos @param {Flags} flags */
export function cmdShow(pos, flags) {
  maybeSwitchUser(flags, { mutating: false });
  const repo = resolveRepo(flags);
  const num = pos[0];
  if (!num) throw new Error("show needs an issue number");
  const issue = ghNode([
    "issue",
    "view",
    String(num),
    "-R",
    repo,
    "--json",
    "number,title,state,body,labels,comments,url",
  ]);
  if (flags.digest) {
    const lane = str(flags.lane) ?? "all";
    if (!LANE_IDS.includes(lane)) throw new Error(`--lane must be one of: ${LANE_IDS.join("|")}`);
    const capFlag = str(flags.cap);
    const cap = capFlag === undefined ? null : Number(capFlag);
    if (cap !== null && !(cap >= 0)) throw new Error("--cap must be a non-negative number");
    console.log(digestOf(issue, { lane, cap, full: flags.full === true }));
    mark("issue-digest", `digest lane=${lane}`);
    return;
  }
  const labs = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)).join(", ");
  console.log(
    `#${issue.number} [${issue.state}] ${issue.title}${labs ? `  {${labs}}` : ""}\n${issue.url}`,
  );
  printAttempts(issue, { full: true });
}

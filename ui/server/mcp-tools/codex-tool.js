// mcp__ui__codex — the Hive's handle on the external OpenAI Codex reviewer.
//
// Codex is somebody else's model on somebody else's billing, so it is wired the way Hermes and
// Kimi are: an in-process MCP tool that spawns the vendored companion CLI, relays progress to the
// feed, and returns a DISTILLED receipt. It deliberately does NOT go through a Claude sub-agent —
// the old `codex-review` agent burned a sonnet turn to read the companion's JSON and summarize it,
// which put a Claude model (and a Claude model badge in the roster) on a worker that has no Claude
// in it. The distillation below is deterministic: the companion already emits the structure, so
// formatting it is string work, not inference.
//
// BLOCKING by design, unlike the Hermes tool. A review is a quality GATE — the caller acts on the
// verdict in the same turn it asked for it — so this awaits the run instead of delivering findings
// later as a synthetic turn. The wall-clock cap keeps "blocking" from meaning "forever".
//
// Consent: no auto-allow branch in canUseTool (same as HERMES_TOOL / KIMI_TOOL), so every call
// raises the per-call permission prompt. The `require-codex-consent` Bash hook covers every
// OTHER path to the same spend: user-typed `/codex:*` slash commands, the companion's `task`
// verb (the rescue path), and the raw `codex` binary.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getCodexConfig, CODEX_COMPANION, PROJECT_DIR } from "../core/config.js";
import { checkCodex } from "../integrations/codex/codex-check.js";
import { parseJSON } from "../../lib/json.js";

/** @typedef {(obj: import("../../lib/types.js").OutMsg) => void} Send */

// The companion's `--json` payload, as much of it as a receipt needs. Hand-written rather than
// imported: the companion is a VENDORED clone we do not control, so this is our reading of its
// contract (schemas/review-output.schema.json for `result`), and every field stays optional so a
// shape drift upstream degrades the receipt instead of throwing.
/** @typedef {{ severity?: string, title?: string, file?: string, line_start?: number, line_end?: number, confidence?: string, recommendation?: string }} CodexFinding */
/** @typedef {{ verdict?: string, summary?: string, findings?: CodexFinding[], next_steps?: string[] }} CodexResult */
// Trap: `status` (string, the task verb's run state) and `codex.status` (number, an exit code)
// are DIFFERENT fields that share a name — never conflate them. The task verb ("audit" kind)
// puts its prose in `rawOutput`, not `codex.stdout`.
/** @typedef {{ target?: { label?: string }, codex?: { status?: number, stdout?: string, stderr?: string }, result?: CodexResult, status?: string, threadId?: string, sourceThreadId?: string, turnId?: string, jobId?: string, rawOutput?: string, touchedFiles?: string[], reasoningSummary?: string, parseError?: string }} CodexPayload */

/** A tool text result, in the shape the agent SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

// Silver steel — the same pill color the roster used for Codex, kept so the feed reads the same.
const CODEX_COLOR = "#b9c2cc";
// A review is minutes, not seconds; the companion has no timeout of its own, so this is the only
// thing standing between a wedged `codex` CLI and a session that never returns.
const RUN_WALLCLOCK_MS = 20 * 60_000;
// An exhaustive audit at effort:high over a branch is the slowest thing this tool can do —
// killing it at the review cap converts a paid run into a BROKEN TOOL receipt.
const AUDIT_WALLCLOCK_MS = 40 * 60_000;
const HEARTBEAT_MS = 20_000;
// A native review under this length comes back whole — most are, and a receipt that IS the review
// costs the caller nothing extra. Past it, the receipt becomes a skeleton (see receiptFromProse).
const INLINE_CHARS = 3000;
// Skeleton bounds: how many structural lines survive, and how much of each. An audit gets a
// higher cap — one line per finding IS the enumeration it exists to produce, and an audit that
// found 80 defects must not show 60.
const SKELETON_LINES = 60;
const AUDIT_SKELETON_LINES = 120;
const SKELETON_LINE_CHARS = 160;
// Pre-spend readiness memo: checkCodex shells two `codex` subcommands (~1-2s) — nothing against
// a multi-minute paid run, everything against a per-call tax.
const READINESS_TTL_MS = 10 * 60_000;
// Audit reasoning effort when the caller does not choose: exhaustiveness is the point.
const DEFAULT_EFFORT = "high";
const STDERR_TAIL = 400;

/** Push a Codex activity line to the feed. `extAgent` is the generic external-worker row, so this
 * needs no client-side registry. @param {Send} send
 * @param {"start" | "progress" | "done"} phase @param {string} text @param {string} [runId] */
function relay(send, phase, text, runId) {
  send({
    type: "extAgent",
    agentId: "codex",
    // The activity row prints the agent's display name ("Codex: Reviewer", client DISPLAY map)
    // and then THIS as the verb pill — the role, mirroring Hermes' persona pills ("Researcher"),
    // not the vendor name again ("Codex CODEX" was the live rendering of that mistake).
    label: "Reviewer",
    color: CODEX_COLOR,
    phase,
    runId,
    text,
  });
}

/** Where a full review is parked so the receipt can point at it instead of carrying it.
 * @param {string} verb @returns {string} */
function reviewFile(verb) {
  const dir = path.join(PROJECT_DIR, ".xenomoon", "codex");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${verb}.md`);
}

// The framework's audit rubric. This is the whole reason kind:"audit" exists: the vendored
// adversarial template is calibrated for PRECISION ("prefer one strong finding over several weak
// ones"), which on a live project produced one finding per round for ten rounds. The companion's
// `task` verb carries no template and no outputSchema, so the rubric and the output shape must
// both live in the prompt text. Wording is domain-agnostic BY REQUIREMENT — this file is inside
// check:agnostic's scan scope.
const AUDIT_RUBRIC = [
  "You are auditing code in this repository. This is an EXHAUSTIVE ADVERSARIAL AUDIT, not a",
  "review: attempt to refute the code's correctness, and enumerate everything that survives",
  "your own scrutiny.",
  "",
  "Rules:",
  "- Enumerate EVERY defect you can substantiate. Do NOT prefer one strong finding, do NOT stop",
  "  at the first problem, and do NOT collapse a class of problems into one item.",
  "- Every finding needs file:line evidence from code you actually read, and a concrete,",
  "  reachable failure scenario. If you cannot point at a line, drop the finding.",
  "- Read ONLY files relevant to the stated scope; do not crawl the whole repository.",
  "- Never run `git fetch` or any writing command — your sandbox is read-only; the attempt",
  "  fails and burns the run. Local read-only git commands (`git diff`, `git log`) are fine.",
  '- "Nothing found" is a valid answer ONLY if you inspected the whole scope and say so.',
  "",
  "Severity ladder — label every finding with exactly one:",
  "  [P0] data loss, a security hole, or a break in the main path",
  "  [P1] wrong behavior under a real, reachable condition",
  "  [P2] a defect with a workaround, or a correctness risk under future change",
  "  [P3] hygiene: dead code, misleading names, guards missing with no live impact",
  "",
  "Output — markdown, findings ordered P0 first, one block each:",
  "## [P0] <one-line title>",
  "- where: <path>:<line>-<line>",
  "- what: <what is wrong, 1-2 sentences>",
  "- why: <the concrete failure scenario>",
  "- fix: <the smallest correct change>",
  "",
  "End with exactly one line: TOTAL: <n> findings (<a> P0, <b> P1, <c> P2, <d> P3)",
].join("\n");

/** The audit prompt: rubric + scope + the caller's focus. The `task` verb takes no --base/--scope
 * flags, so scope becomes a SENTENCE — passing those flags to `task` would be a usage error.
 * Focus APPENDS to the rubric, never replaces it.
 * @param {{ focus?: string, base?: string, scope?: string }} input @returns {string} */
function auditPrompt(input) {
  const scope = input.base
    ? `Scope: the changes on this branch relative to \`${input.base}\`.`
    : input.scope === "working-tree"
      ? "Scope: the uncommitted working tree as it stands."
      : input.scope === "branch"
        ? "Scope: everything this branch changes."
        : "Scope: the working tree as it stands.";
  const focus = input.focus
    ? `Weight these areas first, but audit everything in scope: ${input.focus}.`
    : "";
  return [AUDIT_RUBRIC, "", scope, focus].filter(Boolean).join("\n");
}

/** Which tree this call reviews. A pipeline lane runs in a git worktree; without `cwd` the
 * review silently judges the main bound checkout — the receipt names the tree either way.
 * @param {{ cwd?: string }} input
 * @returns {{ dir: string, label: string } | { error: string }} */
function resolveTree(input) {
  if (!input.cwd) return { dir: PROJECT_DIR, label: `${PROJECT_DIR} (bound project)` };
  const dir = path.resolve(PROJECT_DIR, input.cwd);
  try {
    if (statSync(dir).isDirectory()) return { dir, label: dir };
  } catch {
    // fall through — reported below as a setup answer, not a review
  }
  return {
    error:
      `cwd "${input.cwd}" is not a directory — pass the worktree root, or omit cwd to review ` +
      `the bound project (${PROJECT_DIR}).`,
  };
}

/** Run the companion to completion, capturing stdout/stderr. Rejects only on spawn failure or the
 * wall-clock cap — a non-zero exit is a RESULT (the review ran and disliked something, or the CLI
 * reported an auth problem), so it comes back as data.
 * @param {string[]} args @param {Send} send @param {string} runId
 * @param {{ cwd: string, capMs: number, verb: string }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} */
function runCompanion(args, send, runId, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CODEX_COMPANION, ...args], {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => {
      stdout += b;
    });
    child.stderr.on("data", (b) => {
      stderr += b;
    });
    // `--json` silences the companion's own progress stream, so the feed gets a heartbeat instead
    // of parsed phases. Coarse on purpose: the alternative is reading the companion's job files,
    // which couples us to a vendored layout we do not control.
    const started = Date.now();
    const beat = setInterval(() => {
      relay(send, "progress", `${opts.verb}… ${Math.round((Date.now() - started) / 1000)}s`, runId);
    }, HEARTBEAT_MS);
    const cap = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Codex run exceeded ${opts.capMs / 60_000} minutes and was killed.`));
    }, opts.capMs);
    const stop = () => {
      clearInterval(beat);
      clearTimeout(cap);
    };
    child.on("error", (err) => {
      stop();
      reject(err);
    });
    child.on("close", (code) => {
      stop();
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Count findings by severity, worst first. @param {CodexFinding[]} findings @returns {string} */
function severityTally(findings) {
  const counts = ["critical", "high", "medium", "low"]
    .map((sev) => ({ sev, n: findings.filter((f) => f.severity === sev).length }))
    .filter(({ n }) => n > 0)
    .map(({ sev, n }) => `${n} ${sev}`);
  return counts.length > 0 ? counts.join(", ") : "none";
}

/** One finding as a single line: severity, title, location, and the head of its recommendation.
 * @param {CodexFinding} f @returns {string} */
function findingLine(f) {
  const span =
    f.line_start && f.line_end && f.line_end !== f.line_start
      ? `${f.line_start}-${f.line_end}`
      : String(f.line_start ?? "");
  const where = f.file ? `${f.file}${span ? `:${span}` : ""}` : "(no file)";
  const rec = ((f.recommendation ?? "").split("\n")[0] ?? "").trim();
  return (
    `- [${f.severity ?? "?"}] ${f.title ?? "(untitled)"} — ${where}` +
    (f.confidence ? ` (confidence ${f.confidence})` : "") +
    (rec ? ` → ${rec}` : "")
  );
}

/** Distil an ADVERSARIAL review, whose payload is schema-checked structure — verdict, summary,
 * findings, next steps. Fully deterministic; this is the shape the retired sub-agent was paid to
 * produce by hand. @param {CodexPayload} payload @param {string} file @returns {string} */
function receiptFromStructured(payload, file) {
  const r = payload.result;
  if (!r) {
    const why = payload.parseError ?? "the model returned no structured result";
    return `Codex adversarial-review produced no structured output (${why}). Full output: ${file}`;
  }
  const findings = r.findings ?? [];
  const steps = r.next_steps ?? [];
  return [
    `verdict: ${r.verdict ?? "(none stated)"} · ${findings.length} finding(s) (${severityTally(findings)})`,
    r.summary ? `summary: ${r.summary}` : "",
    ...findings.map(findingLine),
    steps.length > 0 ? `next: ${steps.join(" · ")}` : "",
    `full review: ${file}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The structural spine of a long markdown review: its headings and the lead line of each bullet,
 * which is where Codex puts one finding apiece. Deterministic and lossy BY SHAPE rather than by
 * position — a blind head-clip cuts mid-sentence and silently drops every finding past the cut,
 * where this keeps one line per finding across the whole review.
 * @param {string} prose @param {number} maxLines @returns {string[]} */
function skeleton(prose, maxLines) {
  const structural = prose
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => /^#{1,6}\s/.test(l) || /^\s*(?:[-*+]|\d+\.)\s/.test(l))
    .map((l) => (l.length > SKELETON_LINE_CHARS ? l.slice(0, SKELETON_LINE_CHARS) + "…" : l));
  return structural.length > maxLines
    ? [...structural.slice(0, maxLines), `…(${structural.length - maxLines} more)`]
    : structural;
}

/** The rubric mandates a `TOTAL: n findings (…)` trailer, so a skeletonized audit can still
 * state its own count as the receipt's headline. @param {string} prose @returns {string} */
function auditHeadline(prose) {
  return /^TOTAL:.*$/m.exec(prose)?.[0] ?? "";
}

/** Thread/turn/job ids plus the resume hint — emitted only for ids the payload actually carried;
 * a receipt that invents an id is worse than one that omits it. @param {CodexPayload} p
 * @returns {string[]} */
function traceLines(p) {
  const ids = [
    p.threadId ? `thread: ${p.threadId}` : "",
    p.sourceThreadId ? `source thread: ${p.sourceThreadId}` : "",
    p.turnId ? `turn: ${p.turnId}` : "",
    p.jobId ? `job: ${p.jobId}` : "",
  ].filter(Boolean);
  const lines = ids.length > 0 ? [ids.join(" · ")] : [];
  if (p.threadId) lines.push(`resume: codex resume ${p.threadId}`);
  return lines;
}

/** A nonzero companion exit with valid JSON is a PARTIALLY FAILED run — without this prefix it
 * reads as a clean review and becomes lane evidence silently.
 * @param {{ code: number, stderr: string }} run @returns {string} */
function degradedPrefix(run) {
  if (run.code === 0) return "";
  return (
    `DEGRADED — the Codex companion exited ${run.code}. This receipt is NOT lane evidence: do ` +
    "not map a verdict from it and do not post it as review evidence. Surface the exit to the " +
    "human, fix the cause, re-run.\n" +
    `stderr: ${run.stderr.trim().slice(-STDERR_TAIL)}`
  );
}

/** Distil a NATIVE review, whose payload carries Codex's own prose (no schema upstream, unlike the
 * adversarial pass). Short reviews — most of them — come back WHOLE: there is nothing to distil and
 * the caller should read the real thing. A long one comes back as its skeleton plus the path, and
 * the receipt says out loud that it is partial and names the cheap way to get the rest, because a
 * silently-truncated review reads to the caller like a complete one.
 * `lead` is the receipt's first line when present (the native review's target label, or the
 * audit's `TOTAL:` headline); `stderr` annotates the no-text case only — nonzero exits carry
 * their stderr in the DEGRADED prefix instead.
 * @param {string} prose @param {string} lead @param {string} file @param {number} maxLines
 * @param {string} stderr @returns {string} */
function receiptFromProse(prose, lead, file, maxLines, stderr) {
  if (!prose) {
    return [lead, "Codex returned no review text.", stderr ? `stderr: ${stderr}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  if (prose.length <= INLINE_CHARS)
    return [lead, prose, `full review: ${file}`].filter(Boolean).join("\n");
  return [
    lead,
    `PARTIAL — Codex wrote ${prose.length} chars; this is its structure only:`,
    ...skeleton(prose, maxLines),
    `full review: ${file}`,
    "If a finding above needs its detail, Read that file for the one section. If you need the " +
      "whole thing digested, dispatch `xenomoon:handoff-summarizer` on that path (haiku, ~5 " +
      "lines) — do NOT read the full review into your own context.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pre-spend readiness memo — see unavailable(). @type {{ at: number, blocked: string | null } | null} */
let readiness = null;

/** Why this call cannot run, or null when it can. Codex being off/unvendored/unauthed is a SETUP
 * answer, not a review — it comes back as text so the Hive reports it instead of retrying.
 * The auth/model probe is cached (READINESS_TTL_MS) and cleared whenever a run comes back
 * unclean, so the NEXT call re-probes and reports the real cause. It is skipped entirely when
 * CODEX_COMPANION is env-overridden: that override IS the operator saying which companion to run
 * (and it is the seam the test suite uses — probing the real CLI there would be flaky).
 * @returns {string | null} */
function unavailable() {
  if (!getCodexConfig().enabled)
    return "Codex is off (turn it on in Settings → Agents, or `npm run codex:setup`).";
  if (!existsSync(CODEX_COMPANION))
    return (
      `Codex is enabled but the plugin is not vendored — ${CODEX_COMPANION} does not exist. ` +
      "Run `npm run codex:setup` to clone it, then `codex login`."
    );
  if (process.env.CODEX_COMPANION) return null;
  const now = Date.now();
  if (!readiness || now - readiness.at >= READINESS_TTL_MS) {
    const c = checkCodex(5000, { persist: false });
    const blocked =
      !c.cli || !c.authOk || !c.vendored
        ? `${c.error ?? "Codex is not ready."} (pre-spend check — nothing was run; \`npm run codex:check\` for detail.)`
        : c.caveat
          ? `Codex would reject this run: ${c.caveat} (pre-spend check — nothing was run.)`
          : null;
    readiness = { at: now, blocked };
  }
  return readiness.blocked;
}

/** The companion argv for one call. Reviews: `--json` last before the positional, because the
 * focus text is a trailing positional and only the adversarial pass reads it (the native review
 * validates it away). Audit maps to the templateless `task` verb — never `--write` (an audit is
 * read-only by contract) and never `--background` (blocking is the tool's contract). `--cwd` is
 * emitted ALWAYS so there is one code path and the reviewed tree is never ambiguous.
 * @param {string} kind
 * @param {{ base?: string, scope?: string, focus?: string, effort?: string }} input
 * @param {string} tree @returns {string[]} */
function companionArgs(kind, input, tree) {
  if (kind === "audit")
    return [
      "task",
      "--cwd",
      tree,
      "--effort",
      input.effort ?? DEFAULT_EFFORT,
      "--json",
      auditPrompt(input),
    ];
  /** @type {string[]} */
  const args = [kind, "--cwd", tree];
  if (input.base) args.push("--base", input.base);
  if (input.scope) args.push("--scope", input.scope);
  args.push("--json");
  if (kind === "adversarial-review" && input.focus) args.push(input.focus);
  return args;
}

/** The companion's JSON payload, or null when it printed something else (a crash, an auth error, a
 * usage message). @param {string} stdout @returns {CodexPayload | null} */
function readPayload(stdout) {
  try {
    return /** @type {CodexPayload} */ (parseJSON(stdout));
  } catch {
    return null;
  }
}

/** Park the full review before distilling, so the receipt's "full review:" path is always real —
 * including when the companion returned structure but no prose (then the payload itself is the
 * record). The task verb ("audit") writes its prose to rawOutput.
 * @param {string} kind @param {CodexPayload} payload @returns {string} */
function parkFullReview(kind, payload) {
  const file = reviewFile(kind);
  const full =
    (payload.rawOutput ?? payload.codex?.stdout ?? "").trim() || JSON.stringify(payload, null, 2);
  writeFileSync(file, full.endsWith("\n") ? full : `${full}\n`, "utf8");
  return file;
}

/** The kind-specific receipt body. @param {string} kind @param {CodexPayload} payload
 * @param {string} file @returns {string} */
function receiptBody(kind, payload, file) {
  if (kind === "adversarial-review") return receiptFromStructured(payload, file);
  if (kind === "audit") {
    const prose = (payload.rawOutput ?? "").trim();
    return receiptFromProse(prose, auditHeadline(prose), file, AUDIT_SKELETON_LINES, "");
  }
  return receiptFromProse(
    (payload.codex?.stdout ?? "").trim(),
    payload.target?.label ? `target: ${payload.target.label}` : "",
    file,
    SKELETON_LINES,
    (payload.codex?.stderr ?? "").trim(),
  );
}

/** Build the Codex review tool. @param {Send} send */
export function makeCodexTool(send) {
  return tool(
    "codex",
    "Run ONE code review through your external Codex coworker (OpenAI's model, OpenAI's billing — " +
      "your Anthropic plan does not cover it) and get back a distilled receipt: verdict, findings " +
      "as one-liners, next steps, plus the path to the full review on disk. BLOCKING — a review is " +
      "a quality gate, so this returns when the review is done (minutes, not seconds). " +
      'kind:"review" is Codex\'s native review of the diff; kind:"adversarial-review" challenges ' +
      'the approach itself and returns schema-checked findings; kind:"audit" enumerates EVERY ' +
      "defect against a severity ladder (slowest and priciest). Pass cwd to review a git " +
      "worktree instead of the bound project. Read-only: Codex never edits, " +
      "stages, or commits. The permission prompt on this call IS the human's consent — do not " +
      "offer a review in chat first and do not ask twice. One round per slice is the default.",
    {
      kind: z
        .enum(["review", "adversarial-review", "audit"])
        .optional()
        .describe(
          "'review' (default) — Codex's native review of the target diff (mergeability headline). 'adversarial-review' — high-precision challenge to the approach; one strong objection by design. 'audit' — exhaustive enumeration of every defect against a severity ladder; slowest and priciest.",
        ),
      base: z
        .string()
        .optional()
        .describe(
          "Git ref to review against, e.g. 'main'. On 'audit' it is stated in the prompt rather than passed as a flag.",
        ),
      scope: z
        .enum(["auto", "working-tree", "branch"])
        .optional()
        .describe("What to review: 'auto' (default), the working tree, or the whole branch."),
      focus: z
        .string()
        .optional()
        .describe(
          "adversarial-review and audit: what to weight, e.g. 'the save/load path'. Ignored by the native review.",
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Directory to review — pass the worktree root when the lane runs in a git worktree. Defaults to the bound project.",
        ),
      effort: z
        .enum(["low", "medium", "high", "xhigh"])
        .optional()
        .describe(
          "audit only: reasoning effort. Default 'high' — an audit trades spend for exhaustiveness.",
        ),
    },
    async (input) => {
      const blocked = unavailable();
      if (blocked) return ok(blocked);

      const kind = input.kind ?? "review";
      const tree = resolveTree(input);
      if ("error" in tree) return ok(tree.error);
      const runId = `codex-${Date.now()}`;
      relay(send, "start", `${kind}${input.base ? ` vs ${input.base}` : ""}`, runId);

      /** @type {{ code: number, stdout: string, stderr: string }} */
      let run;
      try {
        run = await runCompanion(companionArgs(kind, input, tree.dir), send, runId, {
          cwd: tree.dir,
          capMs: kind === "audit" ? AUDIT_WALLCLOCK_MS : RUN_WALLCLOCK_MS,
          verb: kind === "audit" ? "auditing" : "reviewing",
        });
      } catch (err) {
        readiness = null;
        const msg = err instanceof Error ? err.message : String(err);
        relay(send, "done", msg, runId);
        return ok(
          `Codex review did not complete: ${msg} This is a BROKEN TOOL, not a clean review — ` +
            "read it, surface it to the human with the likely fix (`codex login`, or " +
            "`npm run codex:check`), and do not re-dispatch until the cause is confirmed fixed.",
        );
      }

      const payload = readPayload(run.stdout);
      if (!payload) {
        readiness = null;
        relay(send, "done", `exited ${run.code} with no JSON`, runId);
        const detail = (run.stderr || run.stdout).trim().slice(0, 800);
        return ok(
          `Codex exited ${run.code} without JSON output. This is a BROKEN TOOL, not a review — ` +
            `surface it to the human.\n${detail}`,
        );
      }
      if (run.code !== 0) readiness = null;

      const file = parkFullReview(kind, payload);
      relay(send, "done", `${kind} finished (exit ${run.code})`, runId);
      return ok(
        [
          degradedPrefix(run),
          `tree: ${tree.label}`,
          receiptBody(kind, payload, file),
          ...traceLines(payload),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  );
}

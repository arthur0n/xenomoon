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
// raises the per-call permission prompt. The `require-codex-consent` Bash hook still stands — it
// covers the OTHER path to the same spend, the user-typed `/codex:*` slash commands.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getCodexConfig, CODEX_COMPANION, PROJECT_DIR } from "../core/config.js";
import { parseJSON } from "../../lib/json.js";

/** @typedef {(obj: import("../../lib/types.js").OutMsg) => void} Send */

// The companion's `--json` payload, as much of it as a receipt needs. Hand-written rather than
// imported: the companion is a VENDORED clone we do not control, so this is our reading of its
// contract (schemas/review-output.schema.json for `result`), and every field stays optional so a
// shape drift upstream degrades the receipt instead of throwing.
/** @typedef {{ severity?: string, title?: string, file?: string, line_start?: number, line_end?: number, confidence?: string, recommendation?: string }} CodexFinding */
/** @typedef {{ verdict?: string, summary?: string, findings?: CodexFinding[], next_steps?: string[] }} CodexResult */
/** @typedef {{ target?: { label?: string }, codex?: { status?: number, stdout?: string, stderr?: string }, result?: CodexResult, parseError?: string }} CodexPayload */

/** A tool text result, in the shape the agent SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

// Silver steel — the same pill color the roster used for Codex, kept so the feed reads the same.
const CODEX_COLOR = "#b9c2cc";
// A review is minutes, not seconds; the companion has no timeout of its own, so this is the only
// thing standing between a wedged `codex` CLI and a session that never returns.
const RUN_WALLCLOCK_MS = 20 * 60_000;
const HEARTBEAT_MS = 20_000;
// A native review under this length comes back whole — most are, and a receipt that IS the review
// costs the caller nothing extra. Past it, the receipt becomes a skeleton (see receiptFromProse).
const INLINE_CHARS = 3000;
// Skeleton bounds: how many structural lines survive, and how much of each.
const SKELETON_LINES = 60;
const SKELETON_LINE_CHARS = 160;

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

/** Run the companion to completion, capturing stdout/stderr. Rejects only on spawn failure or the
 * wall-clock cap — a non-zero exit is a RESULT (the review ran and disliked something, or the CLI
 * reported an auth problem), so it comes back as data.
 * @param {string[]} args @param {Send} send @param {string} runId
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} */
function runCompanion(args, send, runId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CODEX_COMPANION, ...args], {
      cwd: PROJECT_DIR,
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
      relay(send, "progress", `reviewing… ${Math.round((Date.now() - started) / 1000)}s`, runId);
    }, HEARTBEAT_MS);
    const cap = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`Codex review exceeded ${RUN_WALLCLOCK_MS / 60_000} minutes and was killed.`),
      );
    }, RUN_WALLCLOCK_MS);
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
 * @param {string} prose @returns {string[]} */
function skeleton(prose) {
  const structural = prose
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => /^#{1,6}\s/.test(l) || /^\s*(?:[-*+]|\d+\.)\s/.test(l))
    .map((l) => (l.length > SKELETON_LINE_CHARS ? l.slice(0, SKELETON_LINE_CHARS) + "…" : l));
  return structural.length > SKELETON_LINES
    ? [...structural.slice(0, SKELETON_LINES), `…(${structural.length - SKELETON_LINES} more)`]
    : structural;
}

/** Distil a NATIVE review, whose payload carries Codex's own prose (no schema upstream, unlike the
 * adversarial pass). Short reviews — most of them — come back WHOLE: there is nothing to distil and
 * the caller should read the real thing. A long one comes back as its skeleton plus the path, and
 * the receipt says out loud that it is partial and names the cheap way to get the rest, because a
 * silently-truncated review reads to the caller like a complete one.
 * @param {CodexPayload} payload @param {string} file @returns {string} */
function receiptFromProse(payload, file) {
  const prose = (payload.codex?.stdout ?? "").trim();
  const target = payload.target?.label ? `target: ${payload.target.label}` : "";
  if (!prose) {
    const err = (payload.codex?.stderr ?? "").trim();
    return [target, "Codex returned no review text.", err ? `stderr: ${err}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  if (prose.length <= INLINE_CHARS)
    return [target, prose, `full review: ${file}`].filter(Boolean).join("\n");
  return [
    target,
    `PARTIAL — Codex wrote ${prose.length} chars; this is its structure only:`,
    ...skeleton(prose),
    `full review: ${file}`,
    "If a finding above needs its detail, Read that file for the one section. If you need the " +
      "whole thing digested, dispatch `xenomoon:handoff-summarizer` on that path (haiku, ~5 " +
      "lines) — do NOT read the full review into your own context.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Why this call cannot run, or null when it can. Codex being off/unvendored is a SETUP answer,
 * not a review — it comes back as text so the Hive reports it instead of retrying.
 * @returns {string | null} */
function unavailable() {
  if (!getCodexConfig().enabled)
    return "Codex is off (turn it on in Settings → Agents, or `npm run codex:setup`).";
  if (!existsSync(CODEX_COMPANION))
    return (
      `Codex is enabled but the plugin is not vendored — ${CODEX_COMPANION} does not exist. ` +
      "Run `npm run codex:setup` to clone it, then `codex login`."
    );
  return null;
}

/** The companion argv for one review. `--json` last before the positional, because the focus text
 * is a trailing positional and only the adversarial pass reads it (the native review validates it
 * away). @param {string} kind @param {{ base?: string, scope?: string, focus?: string }} input
 * @returns {string[]} */
function companionArgs(kind, input) {
  /** @type {string[]} */
  const args = [kind];
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

/** Build the Codex review tool. @param {Send} send */
export function makeCodexTool(send) {
  return tool(
    "codex",
    "Run ONE code review through your external Codex coworker (OpenAI's model, OpenAI's billing — " +
      "your Anthropic plan does not cover it) and get back a distilled receipt: verdict, findings " +
      "as one-liners, next steps, plus the path to the full review on disk. BLOCKING — a review is " +
      "a quality gate, so this returns when the review is done (minutes, not seconds). " +
      'kind:"review" is Codex\'s native review of the diff; kind:"adversarial-review" challenges ' +
      "the approach itself and returns schema-checked findings. Read-only: Codex never edits, " +
      "stages, or commits. The permission prompt on this call IS the human's consent — do not " +
      "offer a review in chat first and do not ask twice. One round per slice is the default.",
    {
      kind: z
        .enum(["review", "adversarial-review"])
        .optional()
        .describe(
          "'review' (default) — Codex's native review of the target diff. 'adversarial-review' — stress-tests the approach and returns structured findings.",
        ),
      base: z.string().optional().describe("Git ref to review against, e.g. 'main'."),
      scope: z
        .enum(["auto", "working-tree", "branch"])
        .optional()
        .describe("What to review: 'auto' (default), the working tree, or the whole branch."),
      focus: z
        .string()
        .optional()
        .describe("adversarial-review only: what to aim the review at, e.g. 'the save/load path'."),
    },
    async (input) => {
      const blocked = unavailable();
      if (blocked) return ok(blocked);

      const kind = input.kind ?? "review";
      const runId = `codex-${Date.now()}`;
      relay(send, "start", `${kind}${input.base ? ` vs ${input.base}` : ""}`, runId);

      /** @type {{ code: number, stdout: string, stderr: string }} */
      let run;
      try {
        run = await runCompanion(companionArgs(kind, input), send, runId);
      } catch (err) {
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
        relay(send, "done", `exited ${run.code} with no JSON`, runId);
        const detail = (run.stderr || run.stdout).trim().slice(0, 800);
        return ok(
          `Codex exited ${run.code} without JSON output. This is a BROKEN TOOL, not a review — ` +
            `surface it to the human.\n${detail}`,
        );
      }

      // Park the full review before distilling, so the receipt's "full review:" path is always
      // real — including when the companion returned structure but no prose (then the payload
      // itself is the record).
      const file = reviewFile(kind);
      const full = (payload.codex?.stdout ?? "").trim() || JSON.stringify(payload, null, 2);
      writeFileSync(file, full.endsWith("\n") ? full : `${full}\n`, "utf8");

      relay(send, "done", `${kind} finished (exit ${run.code})`, runId);
      return ok(
        kind === "adversarial-review"
          ? receiptFromStructured(payload, file)
          : receiptFromProse(payload, file),
      );
    },
  );
}

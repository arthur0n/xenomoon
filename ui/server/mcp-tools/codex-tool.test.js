// node:test coverage for the Codex bridge (mcp-tools/codex-tool.js) through its ONLY export, the
// tool factory. The distillers (receiptFromStructured, receiptFromProse, severityTally,
// findingLine) are module-private, so the cases below exercise them through real runs — they are
// never exported just for tests, matching hermes-tool.test.js.
//
// No `codex` CLI and no vendored clone are involved: CODEX_COMPANION points at a STUB script
// written here, which prints a recorded companion payload. That is the whole external surface —
// the tool spawns one process and reads its stdout — so stubbing it covers the real path.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TMP = mkdtempSync(path.join(tmpdir(), "xeno-codex-"));
const STUB = path.join(TMP, "stub-companion.mjs");
// config.js resolves a domain at import time; the trunk has none bound, so name one here (the
// pick is irrelevant to this tool — it never reads the domain).
process.env.XENOMOON_DOMAIN = "webapp";
process.env.GAME_DIR = TMP;
process.env.CODEX_ENABLED = "true";
// The env override doubles as the readiness seam: with CODEX_COMPANION overridden, the tool
// skips its pre-spend checkCodex() probe — which is what keeps this suite hermetic (no real
// `codex` CLI is ever shelled).
process.env.CODEX_COMPANION = STUB;
const { makeCodexTool } = await import("./codex-tool.js");
const { PROJECT_DIR } = await import("../core/config.js");

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */

/** Write the stub the tool will spawn. It echoes its argv into the payload so a test can assert
 * what the tool asked for, then prints `payload` as the companion's `--json` stdout.
 * @param {unknown} payload @param {number} [exitCode] @param {boolean} [json] */
function installStub(payload, exitCode = 0, json = true) {
  const body = json ? JSON.stringify(payload) : String(payload);
  writeFileSync(
    STUB,
    // The audit prompt is multi-line, so the substitutions are JSON-escaped — a raw newline
    // spliced into the payload string would corrupt the stub's own JSON output.
    `const argv = process.argv.slice(2);\n` +
      `const esc = (s) => JSON.stringify(s).slice(1, -1);\n` +
      `process.stdout.write(${JSON.stringify(body)}` +
      `.replace("__ARGV__", esc(argv.join(" "))).replace("__CWD__", esc(process.cwd())));\n` +
      `process.exit(${exitCode});\n`,
    "utf8",
  );
}

/** @returns {{ send: (o: OutMsg) => void, msgs: OutMsg[] }} */
function makeSend() {
  /** @type {OutMsg[]} */
  const msgs = [];
  return { send: (o) => msgs.push(o), msgs };
}

/** Call the tool and return its text result. Optional keys are spread in explicitly because the
 * SDK's InferShape keeps them required-as-`| undefined` (same trick as hermes-tool.test.js).
 * @param {{ kind?: "review" | "adversarial-review" | "audit", base?: string, scope?: "auto" | "working-tree" | "branch", focus?: string, cwd?: string, effort?: "low" | "medium" | "high" | "xhigh" }} input
 * @param {(o: OutMsg) => void} send @returns {Promise<string>} */
async function run(input, send) {
  const t = makeCodexTool(send);
  const res = await t.handler(
    {
      kind: undefined,
      base: undefined,
      scope: undefined,
      focus: undefined,
      cwd: undefined,
      effort: undefined,
      ...input,
    },
    {},
  );
  return /** @type {{ content: { text?: string }[] }} */ (res).content[0]?.text ?? "";
}

/** The review files the tool parked under the project's .xenomoon/codex/. @returns {string[]} */
function parked() {
  const dir = path.join(TMP, ".xenomoon", "codex");
  try {
    return readdirSync(dir).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

beforeEach(() => {
  process.env.CODEX_ENABLED = "true";
});

test("native review: receipt carries the prose and names the parked file", async () => {
  installStub({
    target: { label: "working tree" },
    codex: { status: 0, stdout: "# Review\n\nLooks fine, one nit in auth.js.", stderr: "" },
  });
  const { send, msgs } = makeSend();
  const text = await run({ kind: "review" }, send);

  assert.match(text, /target: working tree/);
  assert.match(text, /one nit in auth\.js/);
  const file = /full review: (.+)$/m.exec(text)?.[1];
  assert.ok(file, "receipt names the full-review path");
  assert.match(readFileSync(String(file), "utf8"), /one nit in auth\.js/);
  // Feed rows are the generic external-worker kind, so no client-side registry is needed.
  const rows = msgs.filter((m) => m.type === "extAgent");
  assert.equal(rows.at(0)?.phase, "start");
  assert.equal(rows.at(-1)?.phase, "done");
  assert.equal(rows.at(0)?.agentId, "codex");
});

test("long native review: receipt is a labelled skeleton, whole text on disk", async () => {
  // A finding at the very END, so a head-clip would drop it and the skeleton must not.
  const long =
    "## Findings\n\n" +
    Array.from({ length: 12 }, (_, i) => `- finding ${i}: ${"detail ".repeat(60)}`).join("\n\n") +
    "\n\n## Verdict\n\n- LAST: the auth token check is off by one\n";
  installStub({ target: { label: "branch" }, codex: { status: 0, stdout: long, stderr: "" } });
  const before = parked().length;
  const text = await run({ kind: "review" }, makeSend().send);

  assert.match(text, /^PARTIAL — Codex wrote \d+ chars/m, "partial is stated, not implied");
  assert.match(text, /^## Findings$/m, "headings survive");
  assert.match(text, /- finding 0: detail .*…$/m, "each finding keeps a lead line, truncated");
  assert.match(text, /LAST: the auth token check is off by one/, "the tail survives a head-clip");
  assert.match(text, /handoff-summarizer/, "names the cheap way to get the rest");
  assert.ok(text.length < long.length / 2, "receipt is far smaller than the review");

  const file = String(/full review: (.+)$/m.exec(text)?.[1]);
  assert.equal(readFileSync(file, "utf8").trim(), long.trim(), "disk copy is complete");
  assert.equal(parked().length, before + 1);
});

test("skeleton caps runaway reviews and says how many lines it dropped", async () => {
  const many = Array.from({ length: 200 }, (_, i) => `- finding ${i}: ${"pad ".repeat(10)}`).join(
    "\n",
  );
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: many, stderr: "" } });
  const text = await run({ kind: "review" }, makeSend().send);
  assert.match(text, /…\(140 more\)/, "the drop is counted out loud, not silent");
});

test("adversarial review: structured payload becomes verdict + one-liners + next steps", async () => {
  installStub({
    target: { label: "branch" },
    codex: { status: 0, stdout: "", stderr: "" },
    result: {
      verdict: "needs-attention",
      summary: "Two real problems.",
      findings: [
        {
          severity: "critical",
          title: "Token expiry is off by one",
          body: "…",
          file: "auth.js",
          line_start: 40,
          line_end: 42,
          confidence: "high",
          recommendation: "Use <= instead of <.\nSecond line is dropped.",
        },
        {
          severity: "low",
          title: "Stray log",
          body: "…",
          file: "app.js",
          line_start: 7,
          line_end: 7,
          confidence: "medium",
          recommendation: "Delete it.",
        },
      ],
      next_steps: ["fix auth.js", "re-review"],
    },
  });
  const text = await run({ kind: "adversarial-review", focus: "auth" }, makeSend().send);

  assert.match(text, /verdict: needs-attention · 2 finding\(s\) \(1 critical, 1 low\)/);
  assert.match(text, /summary: Two real problems\./);
  assert.match(
    text,
    /- \[critical\] Token expiry is off by one — auth\.js:40-42 \(confidence high\) → Use <= instead of <\./,
  );
  assert.ok(!text.includes("Second line is dropped"), "only the recommendation's first line");
  assert.match(text, /- \[low\] Stray log — app\.js:7 /, "single-line findings show one number");
  assert.match(text, /next: fix auth\.js · re-review/);
});

test("adversarial review: a missing structured result reports why, not a fake verdict", async () => {
  installStub({
    target: { label: "branch" },
    codex: { status: 0, stdout: "", stderr: "" },
    parseError: "model returned prose, not JSON",
  });
  const text = await run({ kind: "adversarial-review" }, makeSend().send);
  assert.match(text, /no structured output \(model returned prose, not JSON\)/);
  assert.ok(!/verdict:/.test(text), "no verdict is invented");
});

test("flags reach the companion; focus only on the adversarial pass", async () => {
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "argv: __ARGV__" } });
  const plain = await run(
    { kind: "review", base: "main", scope: "branch", focus: "ignored" },
    makeSend().send,
  );
  // --cwd is emitted ALWAYS (one code path, no "did it default?" ambiguity).
  assert.match(plain, new RegExp(`argv: review --cwd .+ --base main --scope branch --json$`, "m"));
  assert.ok(plain.includes(`--cwd ${PROJECT_DIR} `), "defaults to the bound project");

  // The adversarial receipt is built from `result`, not from the prose, so the echo rides there.
  installStub({
    target: { label: "t" },
    codex: { status: 0, stdout: "" },
    result: { verdict: "approve", summary: "argv: __ARGV__", findings: [], next_steps: [] },
  });
  const adv = await run({ kind: "adversarial-review", focus: "the save path" }, makeSend().send);
  assert.match(adv, /argv: adversarial-review --cwd .+ --json the save path$/m);
});

test("audit maps to the task verb: read-only, blocking, effort high, rubric in the prompt", async () => {
  installStub({ status: "completed", threadId: "th_1", rawOutput: "argv: __ARGV__" });
  const text = await run({ kind: "audit", focus: "the auth boundary" }, makeSend().send);

  assert.match(text, /argv: task --cwd .+ --effort high --json /);
  assert.ok(!text.includes("--write"), "an audit never opts into workspace-write");
  assert.ok(!text.includes("--background"), "blocking is the tool's contract");
  assert.ok(!/--base|--scope/.test(text), "task takes no review flags");
  // The rubric rides the prompt — task has no template and no outputSchema.
  assert.match(text, /EXHAUSTIVE ADVERSARIAL AUDIT/);
  assert.match(text, /Do NOT prefer one strong finding/);
  assert.match(text, /\[P0\]/);
  assert.match(text, /Never run `git fetch`/);
  assert.match(text, /TOTAL: <n> findings/);
  assert.match(text, /Weight these areas first, but audit everything in scope: the auth boundary/);
});

test("audit: base becomes a scope sentence in the prompt, never a flag", async () => {
  installStub({ status: "completed", rawOutput: "argv: __ARGV__" });
  const text = await run({ kind: "audit", base: "main" }, makeSend().send);
  assert.ok(!text.includes("--base"), "task has no --base flag");
  assert.match(text, /the changes on this branch relative to `main`/);
});

test("audit: effort is caller-tunable, and never leaks onto a review", async () => {
  installStub({ status: "completed", rawOutput: "argv: __ARGV__" });
  const audit = await run({ kind: "audit", effort: "medium" }, makeSend().send);
  assert.match(audit, /--effort medium/);

  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "argv: __ARGV__" } });
  const review = await run({ kind: "review", effort: "medium" }, makeSend().send);
  assert.ok(!review.includes("--effort"), "the native reviewer owns its own settings");
});

test("audit receipt and park file come from rawOutput, with the TOTAL headline first", async () => {
  const prose =
    "## [P0] Token check off by one\n- where: auth.js:40\n\n" +
    "TOTAL: 1 findings (1 P0, 0 P1, 0 P2, 0 P3)";
  installStub({ status: "completed", threadId: "th_9", turnId: "tu_9", rawOutput: prose });
  const text = await run({ kind: "audit" }, makeSend().send);

  assert.match(text, /^TOTAL: 1 findings \(1 P0, 0 P1, 0 P2, 0 P3\)$/m, "headline present");
  assert.match(text, /Token check off by one/);
  const file = String(/full review: (.+)$/m.exec(text)?.[1]);
  assert.match(file, /-audit\.md$/, "parked under the framework kind name, not 'task'");
  assert.match(readFileSync(file, "utf8"), /Token check off by one/, "park holds rawOutput");
  assert.match(text, /thread: th_9 · turn: tu_9/);
  assert.match(text, /resume: codex resume th_9/);
});

test("audit skeleton keeps more finding lines than a review skeleton", async () => {
  const many = Array.from({ length: 200 }, (_, i) => `- [P2] finding ${i}: ${"pad ".repeat(20)}`);
  installStub({
    status: "completed",
    rawOutput: `${many.join("\n")}\nTOTAL: 200 findings (0 P0, 0 P1, 200 P2, 0 P3)`,
  });
  const text = await run({ kind: "audit" }, makeSend().send);
  // 200 structural lines (the TOTAL trailer is not a bullet) minus the 120 audit cap.
  assert.match(text, /…\(80 more\)/, "audit cap is 120, not the review's 60");
  assert.match(text, /finding 100:/, "lines past the review cap survive");
});

test("cwd: a valid directory is reviewed in place and named on the receipt", async () => {
  installStub({
    target: { label: "t" },
    codex: { status: 0, stdout: "argv: __ARGV__ cwd: __CWD__" },
  });
  const text = await run({ kind: "review", cwd: TMP }, makeSend().send);
  assert.ok(text.includes(`--cwd ${TMP}`), "flag carries the worktree");
  // macOS tmpdir is a /private symlink, so the child's cwd may be the realpath — suffix-match.
  const echoed = / cwd: (.+)$/m.exec(text)?.[1] ?? "";
  assert.ok(echoed.endsWith(TMP.replace(/^\/private/, "")), "the companion RUNS in that tree");
  assert.match(text, new RegExp(`^tree: ${TMP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
});

test("cwd: a missing path is refused as a setup answer — nothing spawns, nothing parks", async () => {
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "should never run" } });
  const before = parked().length;
  const { send, msgs } = makeSend();
  const text = await run({ kind: "review", cwd: "/nope/never/here" }, send);
  assert.match(text, /is not a directory/);
  assert.match(text, /omit cwd to review the bound project/);
  assert.equal(msgs.length, 0, "no feed rows for a call that never ran");
  assert.equal(parked().length, before, "no park file");
});

test("cwd: a file (not a directory) is refused the same way", async () => {
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "should never run" } });
  const text = await run({ kind: "review", cwd: STUB }, makeSend().send);
  assert.match(text, /is not a directory/);
});

test("omitted cwd reviews the bound project and says so", async () => {
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "fine" } });
  const text = await run({ kind: "review" }, makeSend().send);
  assert.ok(text.includes(`tree: ${PROJECT_DIR} (bound project)`));
});

test("trace ids surface when the payload carries them, and are never invented", async () => {
  installStub({
    target: { label: "t" },
    codex: { status: 0, stdout: "fine" },
    threadId: "th_a",
    sourceThreadId: "th_src",
  });
  const withIds = await run({ kind: "review" }, makeSend().send);
  assert.match(withIds, /thread: th_a · source thread: th_src/);
  assert.match(withIds, /resume: codex resume th_a/);

  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "fine" } });
  const without = await run({ kind: "review" }, makeSend().send);
  assert.ok(!/thread:/.test(without), "no id line without ids");
  assert.ok(!/resume:/.test(without), "no resume hint without a thread");
});

test("nonzero exit with valid JSON comes back DEGRADED — data kept, verdict refused", async () => {
  installStub(
    { target: { label: "t" }, codex: { status: 3, stdout: "half a review", stderr: "" } },
    3,
  );
  const text = await run({ kind: "review" }, makeSend().send);
  assert.match(text, /^DEGRADED — the Codex companion exited 3\./, "prefix first");
  assert.match(text, /NOT lane evidence/);
  assert.match(text, /half a review/, "the partial data still rides along");
  const file = String(/full review: (.+)$/m.exec(text)?.[1]);
  assert.match(readFileSync(file, "utf8"), /half a review/, "still parked");
});

test("exit 0 never reads as DEGRADED", async () => {
  installStub({ target: { label: "t" }, codex: { status: 0, stdout: "clean" } });
  const text = await run({ kind: "review" }, makeSend().send);
  assert.ok(!/DEGRADED/.test(text));
});

test("non-JSON output is reported as a broken tool, not as a review", async () => {
  installStub("codex: not logged in", 1, false);
  const text = await run({ kind: "review" }, makeSend().send);
  assert.match(text, /BROKEN TOOL/);
  assert.match(text, /not logged in/);
});

test("Codex switched off returns a setup answer and spawns nothing", async () => {
  process.env.CODEX_ENABLED = "false";
  const { send, msgs } = makeSend();
  const text = await run({ kind: "review" }, send);
  assert.match(text, /Codex is off/);
  assert.equal(msgs.length, 0, "no feed rows for a call that never ran");
});

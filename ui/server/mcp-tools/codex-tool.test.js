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
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
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
 * @param {{ kind?: "review" | "adversarial-review" | "audit", base?: string, scope?: "auto" | "working-tree" | "branch", focus?: string, cwd?: string, effort?: "low" | "medium" | "high" | "xhigh", design?: string, only?: string }} input
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
      design: undefined,
      only: undefined,
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

// ── design attack (adversarial-review + design) and restrictive re-check (audit + only) ──────
// These need the EXACT argv array, not a space-joined echo, so this stub records it as JSON to a
// marker file. The file's absence after a call is the proof that nothing spawned.
const ARGV_FILE = path.join(TMP, "argv.json");

/** Like installStub, but records argv (as a JSON array) to ARGV_FILE.
 * @param {unknown} payload */
function installRecorder(payload) {
  rmSync(ARGV_FILE, { force: true });
  writeFileSync(
    STUB,
    `import { writeFileSync } from "node:fs";\n` +
      `writeFileSync(${JSON.stringify(ARGV_FILE)}, JSON.stringify(process.argv.slice(2)));\n` +
      `process.stdout.write(${JSON.stringify(JSON.stringify(payload))});\n`,
    "utf8",
  );
}

/** The argv the last recorded spawn received. @returns {string[]} */
function recorded() {
  const v = /** @type {unknown} */ (JSON.parse(readFileSync(ARGV_FILE, "utf8")));
  assert.ok(Array.isArray(v), "recorded argv is an array");
  return v.map(String);
}
const sha = (/** @type {string} */ s) => createHash("sha256").update(s).digest("hex");
const TASK_HEAD = ["task", "--cwd", PROJECT_DIR, "--effort", "high", "--json"];

test("design: rides the task verb with the design rubric, never a review flag", async () => {
  installRecorder({ status: "completed", rawOutput: "TOTAL: 0 findings (0 P0, 0 P1, 0 P2, 0 P3)" });
  await run(
    { kind: "adversarial-review", design: "Add a cache.", base: "main", scope: "branch" },
    makeSend().send,
  );
  const argv = recorded();
  assert.deepEqual(argv.slice(0, 6), TASK_HEAD, "exact verb and flags");
  assert.equal(argv.length, 7, "the prompt is ONE argv string");
  for (const f of ["--write", "--background", "--base", "--scope"])
    assert.ok(!argv.includes(f), `no ${f}`);
  const prompt = String(argv[6]);
  assert.ok(prompt.startsWith("You are attacking a DESIGN"), "the rubric opens the prompt");
  assert.match(prompt, /verify every fact it states/);
  assert.match(prompt, /Never write, edit or create any file/);
  assert.match(prompt, /\[P0\] data loss, a security hole/, "the shared ladder");
  assert.match(prompt, /TOTAL: <n> findings/, "the shared trailer");
  assert.ok(!prompt.includes("You are auditing code"), "not the audit opening");
});

test("design: the text arrives byte-for-byte — multibyte, quotes, newlines, leading dash", async () => {
  installRecorder({ status: "completed", rawOutput: "ok" });
  const design = `-x --write first line\nçãé 漢字 🚀 "double" 'single' \`tick\`\n\n  -- end\\n\n  \n`;
  await run({ kind: "adversarial-review", design }, makeSend().send);
  const prompt = String(recorded()[6]);
  assert.ok(prompt.includes(`--- DESIGN ---\n${design}\n--- END DESIGN ---`), "design intact");
});

test("design: focus is appended; receipt and park come from the audit's prose path", async () => {
  const prose =
    '## [P1] Cache never expires\n- where: design: "keep forever"\n\nTOTAL: 1 findings (0 P0, 1 P1, 0 P2, 0 P3)';
  installRecorder({ status: "completed", threadId: "th_d", rawOutput: prose });
  const text = await run(
    { kind: "adversarial-review", design: "keep forever", focus: "expiry" },
    makeSend().send,
  );
  assert.match(
    String(recorded()[6]),
    /Weight these areas first, but attack the whole design: expiry\./,
  );
  assert.match(text, /^TOTAL: 1 findings \(0 P0, 1 P1, 0 P2, 0 P3\)$/m, "TOTAL headline");
  assert.match(text, /Cache never expires/);
  assert.ok(!/verdict:/.test(text), "not the structured receipt");
  const file = String(/full review: (.+)$/m.exec(text)?.[1]);
  assert.match(file, /-design\.md$/);
  assert.match(readFileSync(file, "utf8"), /Cache never expires/);
});

test("design: over 64 KB in UTF-8 bytes is refused before any spawn; 64 KB exactly runs", async () => {
  installRecorder({ status: "completed", rawOutput: "ok" });
  const before = parked().length;
  const { send, msgs } = makeSend();
  // "é" is 2 bytes: 32769 chars = 65538 bytes — under the limit in chars, over it in bytes.
  const text = await run({ kind: "adversarial-review", design: "é".repeat(32769) }, send);
  assert.match(
    text,
    /design is 65538 bytes; the limit is 65536 bytes \(64 KB\)\. Nothing was run\./,
  );
  assert.ok(!existsSync(ARGV_FILE), "no spawn");
  assert.equal(msgs.length, 0, "no feed rows");
  assert.equal(parked().length, before, "no park file");

  await run({ kind: "adversarial-review", design: "é".repeat(32768) }, makeSend().send);
  assert.ok(existsSync(ARGV_FILE), "exactly 65536 bytes is allowed");
});

test("design: design + focus are bounded together — a small design with a huge focus is refused", async () => {
  installRecorder({ status: "completed", rawOutput: "ok" });
  const before = parked().length;
  const { send, msgs } = makeSend();
  const text = await run(
    { kind: "adversarial-review", design: "x", focus: "x".repeat(500000) },
    send,
  );
  assert.equal(
    text,
    "design + focus is 500001 bytes (design 1, focus 500000); the limit is 65536 bytes " +
      "(64 KB) for both together. Nothing was run. Shorten the design text or the focus, or " +
      "attack it in parts.",
  );
  assert.ok(!existsSync(ARGV_FILE), "no spawn");
  assert.equal(msgs.length, 0, "no feed rows");
  assert.equal(parked().length, before, "no park file");
});

test("design on another kind is refused, naming adversarial-review; nothing spawns", async () => {
  for (const kind of /** @type {const} */ (["review", "audit"])) {
    installRecorder({ status: "completed", rawOutput: "ok" });
    const { send, msgs } = makeSend();
    const text = await run({ kind, design: "a design" }, send);
    assert.equal(
      text,
      `design is read only by kind:"adversarial-review" (a design attack); this call is ` +
        `kind:"${kind}". Nothing was run. Call again with kind:"adversarial-review" and design.`,
    );
    assert.ok(!existsSync(ARGV_FILE), `no spawn for ${kind}`);
    assert.equal(msgs.length, 0);
  }
});

test("only on another kind is refused, naming audit; nothing spawns", async () => {
  for (const kind of /** @type {const} */ (["review", "adversarial-review"])) {
    installRecorder({ status: "completed", rawOutput: "ok" });
    const { send, msgs } = makeSend();
    const text = await run({ kind, only: "the fix" }, send);
    assert.equal(
      text,
      `only is read only by kind:"audit" (a re-check after a fix); this call is ` +
        `kind:"${kind}". Nothing was run. Call again with kind:"audit" and only.`,
    );
    assert.ok(!existsSync(ARGV_FILE), `no spawn for ${kind}`);
    assert.equal(msgs.length, 0);
  }
});

test("empty or whitespace design/only count as absent — old argv, no refusal", async () => {
  installRecorder({ result: { verdict: "approve", findings: [] } });
  await run({ kind: "adversarial-review", design: "  \n\t ", focus: "f" }, makeSend().send);
  assert.deepEqual(recorded(), ["adversarial-review", "--cwd", PROJECT_DIR, "--json", "f"]);

  installRecorder({ codex: { status: 0, stdout: "fine" } });
  await run({ kind: "review", design: "", only: "   " }, makeSend().send);
  assert.deepEqual(recorded(), ["review", "--cwd", PROJECT_DIR, "--json"]);

  installRecorder({ status: "completed", rawOutput: "ok" });
  await run({ kind: "audit", only: " " }, makeSend().send);
  assert.equal(sha(String(recorded()[6])), AUDIT_DEFAULT_SHA, "whitespace only = plain audit");
});

test("audit + only: a restrictive scope, never 'audit everything in scope'", async () => {
  installRecorder({ status: "completed", rawOutput: "ok" });
  await run(
    {
      kind: "audit",
      only: "the fix for finding 2 and the callers of what it changed",
      focus: "the retry loop",
      base: "main",
    },
    makeSend().send,
  );
  const argv = recorded();
  assert.deepEqual(argv.slice(0, 6), TASK_HEAD);
  const prompt = String(argv[6]);
  assert.match(
    prompt,
    /Scope: ONLY the fix for finding 2 and the callers of what it changed\. Read and report only what is inside this scope; a finding outside it is not reported/,
  );
  assert.ok(!prompt.includes("audit everything in scope"), "the exhaustive sentence is gone");
  assert.ok(!prompt.includes("relative to `main`"), "only replaces the scope sentence");
  assert.match(prompt, /Weight these areas first: the retry loop\./);
  assert.ok(prompt.startsWith("You are auditing code"), "still the audit rubric");
});

// sha256 of the audit prompt as the code at HEAD d0f480d builds it (before `design`/`only`):
// with no input, and with { focus: "the auth boundary", base: "main" }.
const AUDIT_DEFAULT_SHA = "467c24d832373cdcd9a07bad8839ea9af0fd3b807027219cbc8eff6133a169f2";
const AUDIT_FOCUS_BASE_SHA = "4689298170a2aa1a9a95d0b1553db18774367207cc64013b12fb98621c7c6075";

test("calls without the new fields build exactly the argv they built before", async () => {
  installRecorder({ codex: { status: 0, stdout: "fine" } });
  await run({ kind: "review", base: "main", scope: "branch" }, makeSend().send);
  assert.deepEqual(recorded(), [
    "review",
    "--cwd",
    PROJECT_DIR,
    "--base",
    "main",
    "--scope",
    "branch",
    "--json",
  ]);

  installRecorder({ result: { verdict: "approve", findings: [] } });
  await run({ kind: "adversarial-review", focus: "the save path", base: "main" }, makeSend().send);
  assert.deepEqual(recorded(), [
    "adversarial-review",
    "--cwd",
    PROJECT_DIR,
    "--base",
    "main",
    "--json",
    "the save path",
  ]);

  installRecorder({ status: "completed", rawOutput: "ok" });
  await run({ kind: "audit" }, makeSend().send);
  assert.deepEqual(recorded().slice(0, 6), TASK_HEAD);
  assert.equal(sha(String(recorded()[6])), AUDIT_DEFAULT_SHA, "audit prompt byte-identical");

  installRecorder({ status: "completed", rawOutput: "ok" });
  await run({ kind: "audit", focus: "the auth boundary", base: "main" }, makeSend().send);
  assert.equal(sha(String(recorded()[6])), AUDIT_FOCUS_BASE_SHA, "focus + base byte-identical");
});

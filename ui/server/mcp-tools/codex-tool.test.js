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
process.env.CODEX_COMPANION = STUB;
const { makeCodexTool } = await import("./codex-tool.js");

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */

/** Write the stub the tool will spawn. It echoes its argv into the payload so a test can assert
 * what the tool asked for, then prints `payload` as the companion's `--json` stdout.
 * @param {unknown} payload @param {number} [exitCode] @param {boolean} [json] */
function installStub(payload, exitCode = 0, json = true) {
  const body = json ? JSON.stringify(payload) : String(payload);
  writeFileSync(
    STUB,
    `const argv = process.argv.slice(2);\n` +
      `process.stdout.write(${JSON.stringify(body)}.replace("__ARGV__", argv.join(" ")));\n` +
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
 * @param {{ kind?: "review" | "adversarial-review", base?: string, scope?: "auto" | "working-tree" | "branch", focus?: string }} input
 * @param {(o: OutMsg) => void} send @returns {Promise<string>} */
async function run(input, send) {
  const t = makeCodexTool(send);
  const res = await t.handler(
    { kind: undefined, base: undefined, scope: undefined, focus: undefined, ...input },
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
  assert.match(plain, /argv: review --base main --scope branch --json$/m);

  // The adversarial receipt is built from `result`, not from the prose, so the echo rides there.
  installStub({
    target: { label: "t" },
    codex: { status: 0, stdout: "" },
    result: { verdict: "approve", summary: "argv: __ARGV__", findings: [], next_steps: [] },
  });
  const adv = await run({ kind: "adversarial-review", focus: "the save path" }, makeSend().send);
  assert.match(adv, /argv: adversarial-review --json the save path$/m);
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

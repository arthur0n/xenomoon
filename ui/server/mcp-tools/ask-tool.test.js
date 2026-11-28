// The question gate on mcp__ui__ask and mcp__ui__form: a question that names an issue is refused
// while that issue is not at an owner stop. Same pattern as task-tool.test.js: GAME_DIR is one temp
// project set before the dynamic imports (the task store reads it at import), tools are built with
// fakes and their handlers called directly. No SDK session, no child process.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** @typedef {{ input: { fields: { id: string }[] }, agent: string }} WaitPayload */

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-asktool-"));
process.env.GAME_DIR = scratch;
const { makeAskTool } = await import("./ask-tool.js");
const { makeFormTool } = await import("./form-tool.js");
const { makeTaskTool } = await import("./task-tool.js");
const store = await import("../features/tasks/tasks-store.js");

beforeEach(() => {
  rmSync(path.join(scratch, ".xenomoon"), { recursive: true, force: true });
});

/** First text block of a tool result. @param {unknown} r @returns {string} */
function textOf(r) {
  return /** @type {{ content: { text?: string }[] }} */ (r).content[0]?.text ?? "";
}

/** @param {unknown} r @returns {boolean} */
function isError(r) {
  return /** @type {{ isError?: boolean }} */ (r).isError === true;
}

/** Put an issue at a flow step through the real tasks tool.
 * @param {number} issue @param {"design" | undefined} to */
async function placeIssue(issue, to) {
  const t = makeTaskTool(() => {});
  const input = { op: "flow", issue, to };
  const r = await t.handler(/** @type {any} */ (input), {});
  assert.ok(!isError(r), textOf(r));
}

/** Ask tool with captured send and log. */
function makeAsk() {
  /** @type {unknown[]} */
  const sent = [];
  /** @type {[string, Record<string, unknown>][]} */
  const logs = [];
  const tool = makeAskTool(
    (m) => void sent.push(m),
    /** @type {any} */ (
      (/** @type {string} */ dir, /** @type {Record<string, unknown>} */ obj) =>
        void logs.push([dir, obj])
    ),
  );
  /** @param {Record<string, unknown>} over */
  const call = (over) =>
    tool.handler(
      /** @type {any} */ ({
        question: "Which colour?",
        recommendation: "blue",
        defaultAction: undefined,
        options: undefined,
        issue: undefined,
        _by: undefined,
        ...over,
      }),
      {},
    );
  return { call, sent, logs };
}

/** Form tool with a fake waitFor, an agent queue and a captured log.
 * @param {string[]} queue */
function makeForm(queue) {
  /** @type {{ kind: string, payload: WaitPayload }[]} */
  const waits = [];
  /** @type {[string, Record<string, unknown>][]} */
  const logs = [];
  const tool = makeFormTool(
    /** @type {any} */ (
      async (/** @type {string} */ kind, /** @type {WaitPayload} */ payload) => {
        waits.push({ kind, payload });
        return { values: { colour: "blue" } };
      }
    ),
    queue,
    /** @type {any} */ (
      (/** @type {string} */ dir, /** @type {Record<string, unknown>} */ obj) =>
        void logs.push([dir, obj])
    ),
  );
  /** @param {Record<string, unknown>} over */
  const call = (over) =>
    tool.handler(
      /** @type {any} */ ({
        title: "Pick a colour",
        description: undefined,
        fields: [{ id: "colour", label: "Colour", type: "text" }],
        submitLabel: undefined,
        issue: undefined,
        ...over,
      }),
      {},
    );
  return { call, waits, logs };
}

/** Tasks on the board whose title mentions the question text. @param {string} needle */
function filed(needle) {
  return store.readTasks().filter((t) => t.title.includes(needle));
}

test("refused ask: error result, nothing filed or sent, one log line", async () => {
  await placeIssue(84, undefined);
  const { call, sent, logs } = makeAsk();
  const r = await call({ issue: 84, question: "Which colour for #84?" });
  assert.equal(isError(r), true);
  assert.match(textOf(r), /^question refused:/);
  assert.equal(filed("Which colour for #84?").length, 0);
  assert.deepEqual(sent, []);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0]?.[1], {
    type: "question-refused",
    toolName: "mcp__ui__ask",
    agent: "background",
    issue: "84",
    at: "screening",
    question: "Which colour for #84?",
  });
});

test("refused ask: the logged question is cut to 300 characters", async () => {
  await placeIssue(84, undefined);
  const { call, logs } = makeAsk();
  await call({ issue: 84, question: "q".repeat(500) });
  assert.equal(/** @type {string} */ (logs[0]?.[1].question ?? "").length, 300);
});

test("refused ask: the agent label is _by when given, background when not", async () => {
  await placeIssue(84, undefined);
  const { call, logs } = makeAsk();
  await call({ issue: 84, _by: "builder" });
  await call({ issue: 84 });
  assert.equal(logs[0]?.[1].agent, "builder");
  assert.equal(logs[1]?.[1].agent, "background");
});

test("allowed ask (issue at an owner stop): filed and sent, no log, no error", async () => {
  await placeIssue(85, "design");
  const { call, sent, logs } = makeAsk();
  const r = await call({ issue: 85, question: "Allowed question?" });
  assert.equal(isError(r), false);
  assert.equal(filed("Allowed question?").length, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(logs, []);
});

test("ask with no issue, or an issue with no flow task: filed as before", async () => {
  const { call, sent, logs } = makeAsk();
  const a = await call({ question: "No issue?" });
  const b = await call({ issue: 99, question: "Unknown issue?" });
  assert.equal(isError(a), false);
  assert.equal(isError(b), false);
  assert.equal(filed("No issue?").length, 1);
  assert.equal(filed("Unknown issue?").length, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(logs, []);
});

test("refused form: error result, waitFor never called, queue entry consumed, one log line", async () => {
  await placeIssue(84, undefined);
  const queue = ["designer"];
  const { call, waits, logs } = makeForm(queue);
  const r = await call({ issue: 84 });
  assert.equal(isError(r), true);
  assert.match(textOf(r), /^question refused:/);
  assert.equal(waits.length, 0);
  assert.deepEqual(queue, []);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0]?.[1], {
    type: "question-refused",
    toolName: "mcp__ui__form",
    agent: "designer",
    issue: "84",
    at: "screening",
    question: "Pick a colour",
  });
});

test("allowed form: waitFor called once without issue, feedback field added, reply returned", async () => {
  await placeIssue(85, "design");
  for (const issue of [85, undefined]) {
    const { call, waits, logs } = makeForm(["main"]);
    const r = await call({ issue });
    assert.equal(isError(r), false);
    assert.equal(waits.length, 1);
    const w = waits[0];
    assert.ok(w);
    assert.equal(w.kind, "form");
    assert.equal("issue" in w.payload.input, false);
    assert.equal(w.payload.agent, "main");
    assert.equal(w.payload.input.fields.at(-1)?.id, "additional_feedback");
    assert.deepEqual(JSON.parse(textOf(r)), { colour: "blue" });
    assert.deepEqual(logs, []);
  }
});

test("non-numeric issue: refused, log carries the raw value and no `at`", async () => {
  const { call, sent, logs } = makeAsk();
  const r = await call({ issue: "abc", question: "Bad issue?" });
  assert.equal(isError(r), true);
  assert.match(textOf(r), /^question refused:/);
  assert.equal(filed("Bad issue?").length, 0);
  assert.deepEqual(sent, []);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.[1].issue, "abc");
  assert.equal("at" in (logs[0]?.[1] ?? {}), false);
});

test("refused ask: a long non-numeric issue is logged as its first 40 characters", async () => {
  const long = "x".repeat(10) + "0123456789".repeat(19);
  assert.equal(long.length, 200);
  const { call, logs } = makeAsk();
  const r = await call({ issue: long, question: "Long issue?" });
  assert.equal(isError(r), true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.[1].issue, long.slice(0, 40));
  assert.equal(String(logs[0]?.[1].issue).length, 40);
});

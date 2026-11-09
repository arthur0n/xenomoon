// The status-endpoint activity fields streamQuery keeps current (issue #60), driven through
// runWithRetry with a fake query (an async iterable of hand-built SDK messages) and a
// trackMessage stub — no SDK, no server.
// Static imports HOIST above any statement, so the env must be set via a dynamic import chain.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test } from "node:test";
import assert from "node:assert/strict";
const { runWithRetry, lastTextLine } = await import("./stream.js");

/** @typedef {import("./stream.js").SDKMessage} SDKMessage */
/** @typedef {import("./stream.js").TrackDeps} TrackDeps */
/** @typedef {import("./stream.js").Activity} Activity */

/** @param {string[]} texts @param {boolean} [withTool] @returns {SDKMessage} */
function assistant(texts, withTool = false) {
  const content = texts.map((text) => ({ type: "text", text }));
  if (withTool)
    content.push(/** @type {any} */ ({ type: "tool_use", id: "t", name: "x", input: {} }));
  return /** @type {SDKMessage} */ (
    /** @type {unknown} */ ({ type: "assistant", message: { content }, parent_tool_use_id: null })
  );
}
/** @type {SDKMessage} */
const RESULT = /** @type {any} */ ({ type: "result", subtype: "success", is_error: false });
/** @type {SDKMessage} */
const SYSTEM = /** @type {any} */ ({ type: "system", subtype: "task_progress" });

/** Run one fake query to its end. `onTrack(i)` runs inside trackMessage for message i.
 * @param {SDKMessage[]} messages @param {{ activity?: Activity, onTrack?: (i: number, d: TrackDeps) => void }} [opts] */
async function run(messages, { activity, onTrack } = {}) {
  const act = activity ?? { lastLine: "", runningAgents: 0, activitySeq: 0 };
  const busy = { value: false };
  /** @type {boolean[]} */
  const busySeen = [];
  /** @type {TrackDeps} */
  const trackDeps = {
    agentByTool: new Map(),
    bgSpawns: new Set(),
    bgBoard: new Map(),
    runningByTask: new Map(),
    send: () => {},
  };
  /** @type {number[]} */
  const seqs = [];
  let i = 0;
  await runWithRetry({
    makeQuery: () =>
      /** @type {any} */ ({
        async *[Symbol.asyncIterator]() {
          yield* messages;
        },
      }),
    trackMessage: (_m, d) => onTrack?.(i++, d),
    trackDeps,
    send: (o) => {
      if (o.type === "event") seqs.push(act.activitySeq);
    },
    abort: new AbortController(),
    busy,
    session: {},
    inbox: { push: () => {} },
    resumeId: null,
    onBusyChange: () => busySeen.push(busy.value),
    activity: act,
  });
  return { act, busy, busySeen, seqs };
}

test("runningAgents follows runningByTask.size; activitySeq bumps only when it changes", async () => {
  const chip = { taskId: "", toolUseId: "", label: "", desc: "", started: 0, background: false };
  const { act, seqs } = await run([SYSTEM, SYSTEM, SYSTEM, SYSTEM], {
    onTrack: (i, d) => {
      if (i === 0) d.runningByTask.set("a", chip);
      if (i === 2) d.runningByTask.set("b", chip);
      if (i === 3) d.runningByTask.clear();
    },
  });
  const [s0 = 0, s1 = 0, s2 = 0, s3 = 0] = seqs;
  assert.equal(act.runningAgents, 0);
  assert.ok(s0 > 0, "first change bumps");
  assert.equal(s1, s0, "no change, no bump");
  assert.ok(s2 > s1, "1 -> 2 bumps");
  assert.ok(s3 > s2, "2 -> 0 bumps");
});

test("lastTextLine: last non-empty trimmed line across text items, cut at 200", () => {
  const long = "x".repeat(250);
  assert.equal(
    lastTextLine(assistant(["first\nsecond", `  ${long}  \n\n   `], true)),
    long.slice(0, 200),
  );
  assert.equal(lastTextLine(assistant(["one\n two ", "\n"])), "two");
  assert.equal(lastTextLine(assistant([])), null);
});

test("assistant with text sets lastLine; one without text keeps it but bumps activitySeq", async () => {
  const { act, seqs } = await run([assistant(["hello\nworld  "]), assistant([], true)]);
  assert.equal(act.lastLine, "world");
  assert.ok(act.activitySeq > (seqs[1] ?? Infinity), "text-less assistant message still bumps");
});

test("result bumps activitySeq", async () => {
  const { act, seqs } = await run([SYSTEM, RESULT]);
  assert.ok(act.activitySeq > (seqs[1] ?? Infinity));
});

test("busy still flips true on assistant and false on result, each via onBusyChange", async () => {
  const { busy, busySeen } = await run([assistant(["hi"]), RESULT]);
  assert.deepEqual(busySeen, [true, false]);
  assert.equal(busy.value, false);
});

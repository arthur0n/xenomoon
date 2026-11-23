// Pure-function checks for the store reducer — run with bare node:
//   node ui/reducer.check.js
// There is no test runner in this project, but reduce() is DOM-free and pure,
// so it can be exercised directly. These assert the fold behavior AND the
// identity-diff invariant the per-slice store subscription depends on. Not part
// of `npm run validate`; run by hand after touching reducer.js.
import assert from "node:assert/strict";
import { absorbByText, reduce } from "./client/core/reducer.js";
import { initialState } from "./client/core/store.js";
import { chatItem } from "./lib/chat-items.js";

/** @typedef {import("./lib/types.js").ServerMsg} ServerMsg */
/** @typedef {import("./lib/types.js").ContentBlock} ContentBlock */

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

/** @param {ContentBlock[]} content @param {string} [subagent] @returns {ServerMsg} */
const assistant = (content, subagent) => ({
  type: "event",
  message: { type: "assistant", subagent_type: subagent, message: { content } },
});

/** @param {string} toolUseId @returns {ServerMsg} */
const toolResult = (toolUseId) => ({
  type: "event",
  message: {
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: toolUseId }] },
  },
});

/** @param {import("./lib/types.js").RunningAgentWire[]} agents @returns {ServerMsg} */
const running = (agents) => ({ type: "running", agents });

/** @param {Partial<import("./client/core/store.js").RunningAgent>} [over] @returns {import("./client/core/store.js").RunningAgent} */
const chip = (over = {}) => ({
  id: "tu",
  label: "w",
  desc: "build",
  started: 0,
  background: true,
  ...over,
});

check("tasks snapshot replaces tasks but keeps the chat ref (identity invariant)", () => {
  const s0 = initialState();
  const s1 = reduce(s0, {
    type: "tasks",
    tasks: [{ id: "t1", title: "x", owner: "agent", status: "pending", created: "" }],
  });
  assert.equal(s1.tasks.length, 1);
  assert.notEqual(s1.tasks, s0.tasks); // changed slice → new ref
  assert.equal(s1.chat, s0.chat); // untouched slice → same ref (per-slice notify)
});

check("main assistant text appends one chat entry and sets busy", () => {
  const s = reduce(initialState(), assistant([{ type: "text", text: "hello" }]));
  assert.equal(s.chat.length, 1);
  assert.equal(s.chat[0]?.kind, "agent");
  assert.equal(s.busy, true);
});

check("a sub-agent's text goes to the activity log, not the chat", () => {
  const s = reduce(initialState(), assistant([{ type: "text", text: "working" }], "developer"));
  assert.equal(s.chat.length, 0);
  assert.equal(s.activity.at(-1)?.kind, "say");
});

check("a Task spawn adds a chip; its tool_result removes it", () => {
  let s = reduce(
    initialState(),
    assistant([
      { type: "tool_use", id: "tu", name: "Task", input: { subagent_type: "developer" } },
    ]),
  );
  assert.equal(s.running.length, 1);
  s = reduce(s, toolResult("tu"));
  assert.equal(s.running.length, 0);
});

check("a backgrounded spawn's immediate tool_result does NOT remove its chip", () => {
  let s = reduce(
    initialState(),
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "w", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, toolResult("bg"));
  assert.equal(s.running.length, 1);
});

check("result clears foreground chips, keeps background, folds usage and busy", () => {
  let s = reduce(
    initialState(),
    assistant([{ type: "tool_use", id: "fg", name: "Task", input: { subagent_type: "f" } }]),
  );
  s = reduce(
    s,
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "b", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, {
    type: "event",
    message: {
      type: "result",
      subtype: "success",
      total_cost_usd: 0.25,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 4000,
      },
    },
  });
  assert.equal(s.running.length, 1);
  assert.equal(s.running[0]?.background, true);
  assert.equal(s.busy, false);
  // All four token classes are folded — cache reads included, not just in/out.
  assert.equal(s.usage.input, 100);
  assert.equal(s.usage.output, 50);
  assert.equal(s.usage.cacheCreate, 200);
  assert.equal(s.usage.cacheRead, 4000);
  assert.equal(s.usage.cost, 0.25);
});

check("idle clears busy + every running chip (the stuck-running backstop)", () => {
  let s = reduce(
    initialState(),
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "b", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, assistant([{ type: "text", text: "thinking" }])); // sets busy
  assert.equal(s.running.length, 1);
  assert.equal(s.busy, true);
  s = reduce(s, { type: "idle" });
  assert.equal(s.running.length, 0); // even background chips clear: the session is over
  assert.equal(s.busy, false);
  assert.equal(s.thinking.active, false);
});

check("idle is identity-preserving when nothing is live", () => {
  const s0 = initialState();
  assert.equal(reduce(s0, { type: "idle" }), s0);
});

check("a background permission_denied logs to activity AND raises a banner", () => {
  const s = reduce(initialState(), {
    type: "permission_denied",
    toolName: "Write",
    agent: "researcher",
    reason: "asyncAgent",
    background: true,
  });
  assert.equal(s.activity.at(-1)?.kind, "deny");
  assert.equal(s.chat.at(-1)?.kind, "banner");
});

check("a foreground permission_denied logs to activity only (no banner)", () => {
  const s = reduce(initialState(), {
    type: "permission_denied",
    toolName: "Bash",
    agent: "main",
    reason: "rule",
    background: false,
  });
  assert.equal(s.activity.at(-1)?.kind, "deny");
  assert.equal(s.chat.length, 0);
});

check("running snapshot drops a stale chip absent from the authoritative set", () => {
  const s0 = { ...initialState(), running: [chip({ taskId: "task-1" })] };
  const s1 = reduce(s0, running([])); // server: nothing live → the stale-card fix
  assert.equal(s1.running.length, 0);
  assert.notEqual(s1.running, s0.running);
});

check("running snapshot keeps a just-spawned chip not yet in the set (grace window)", () => {
  const s0 = { ...initialState(), running: [chip({ started: Date.now() })] };
  const s1 = reduce(s0, running([])); // its task_started hasn't landed in the snapshot yet
  assert.equal(s1.running.length, 1);
});

check("running snapshot keeps a matched chip's client fields and merges server taskId", () => {
  const s0 = { ...initialState(), running: [chip({ started: 123, stopping: true })] };
  const s1 = reduce(
    s0,
    running([
      { taskId: "task-1", toolUseId: "tu", label: "w", desc: "x", started: 999, background: true },
    ]),
  );
  assert.equal(s1.running.length, 1);
  assert.equal(s1.running[0]?.taskId, "task-1"); // gained from the server
  assert.equal(s1.running[0]?.started, 123); // client-only field preserved
  assert.equal(s1.running[0]?.stopping, true); // client-only field preserved
});

check("running snapshot adds a server chip the client never spawned", () => {
  const s1 = reduce(
    initialState(),
    running([
      { taskId: "task-1", toolUseId: "tu2", label: "w", desc: "b", started: 5, background: true },
    ]),
  );
  assert.equal(s1.running.length, 1);
  assert.equal(s1.running[0]?.id, "tu2");
  assert.equal(s1.running[0]?.label, "w");
});

check("an equivalent running snapshot is identity-preserving (no repaint)", () => {
  const s0 = { ...initialState(), running: [chip({ started: 123, taskId: "task-1" })] };
  const s1 = reduce(
    s0,
    running([
      {
        taskId: "task-1",
        toolUseId: "tu",
        label: "w",
        desc: "build",
        started: 123,
        background: true,
      },
    ]),
  );
  assert.equal(s1.running, s0.running); // same ref → per-slice notify skips it
});

// ---- history snapshot and the one chat item per main message (#96) ----

/** @param {import("./lib/types.js").HistoryItem[]} items @returns {ServerMsg} */
const history = (items) => ({ type: "history", items });
/** @type {import("./lib/types.js").HistoryItem[]} */
const SNAP = [
  { role: "user", text: "hi" },
  { role: "assistant", text: "hello there" },
];
const SNAP_CHAT = [
  { kind: "user", text: "hi" },
  { kind: "agent", who: "main", text: "hello there" },
];

check("history replaces the chat (banner, user, agent gone) and keeps other slices", () => {
  /** @type {import("./client/core/store.js").State} */
  const s0 = {
    ...initialState(),
    chat: [
      { kind: "banner", text: "denied" },
      { kind: "user", text: "old" },
      { kind: "agent", who: "main", text: "old answer" },
    ],
    approvals: [{ id: 7, kind: "permission", toolName: "Write" }],
    tasks: [{ id: "t1", title: "x", owner: "agent", status: "pending", created: "" }],
    activity: [{ kind: "say", agent: "dev", text: "working" }],
  };
  const s1 = reduce(s0, history(SNAP));
  assert.deepEqual(s1.chat, SNAP_CHAT);
  assert.equal(s1.approvals, s0.approvals);
  assert.equal(s1.tasks, s0.tasks);
  assert.equal(s1.activity, s0.activity);
});

check("a second identical history leaves the chat deep-equal (no doubles)", () => {
  const s1 = reduce(initialState(), history(SNAP));
  const s2 = reduce(s1, history(SNAP));
  assert.deepEqual(s2.chat, SNAP_CHAT);
  assert.equal(s2.chat.length, 2);
});

check("history with more or fewer entries than the page had gives exactly the snapshot", () => {
  const two = reduce(initialState(), history(SNAP));
  const more = reduce(two, history([...SNAP, { role: "user", text: "more" }]));
  assert.deepEqual(more.chat, [...SNAP_CHAT, { kind: "user", text: "more" }]);
  const fewer = reduce(more, history([SNAP[0] ?? { role: "user", text: "" }]));
  assert.deepEqual(fewer.chat, [{ kind: "user", text: "hi" }]);
});

check("a live main message and the same message as a history item give the same chat entry", () => {
  /** @type {ContentBlock[]} */
  const content = [
    { type: "text", text: " one " },
    { type: "tool_use", id: "u1", name: "Read", input: { file_path: "/a" } },
    { type: "text", text: "two" },
  ];
  const live = reduce(initialState(), assistant(content));
  const item = chatItem({ type: "assistant", message: { content } });
  assert.equal(live.chat.length, 1);
  assert.equal(live.chat[0]?.text, item?.text);
  assert.equal(live.activity.length > 0, true); // the tool use is still recorded
  const stored = reduce(initialState(), history(item ? [item] : []));
  assert.deepEqual(stored.chat, live.chat);
});

check(
  "an assistant text is never filtered by its first characters; a sub-agent message adds no main entry",
  () => {
    for (const text of ["<div>x</div>", "Caveat: the build is red", "<system-reminder>x"]) {
      const s = reduce(initialState(), assistant([{ type: "text", text }]));
      assert.equal(s.chat.length, 1, text);
      assert.equal(s.chat[0]?.kind, "agent");
      assert.equal(s.chat[0]?.text, text);
    }
    const sub = reduce(initialState(), {
      type: "event",
      message: {
        type: "assistant",
        parent_tool_use_id: "tu9",
        message: { content: [{ type: "text", text: "from a sub-agent" }] },
      },
    });
    assert.equal(sub.chat.length, 0);
  },
);

check("an assistant event with no text blocks adds no chat entry and does not throw", () => {
  const onlyTool = reduce(
    initialState(),
    assistant([{ type: "tool_use", id: "u2", name: "Read", input: { file_path: "/a" } }]),
  );
  assert.equal(onlyTool.chat.length, 0);
  const empty = reduce(initialState(), assistant([]));
  assert.equal(empty.chat.length, 0);
});

// ---- a typed turn the server has not confirmed survives a chat replace (#96) ----

/** The state chat.js addUser builds: the entry with its cid, the cid pending.
 * @param {import("./client/core/store.js").State} s @param {string} text @param {string} cid */
const typed = (s, text, cid) => ({
  ...s,
  chat: [...s.chat, /** @type {const} */ ({ kind: "user", text, cid })],
  pendingTurns: [...s.pendingTurns, cid],
});
/** @param {string} cid @returns {ServerMsg} */
const ack = (cid) => ({ type: "user_ack", cid });
/** @param {import("./client/core/store.js").State} s @param {string} text */
const count = (s, text) => s.chat.filter((e) => e.kind === "user" && e.text === text).length;

check("user_ack removes the cid from pendingTurns and keeps the chat reference", () => {
  const s1 = typed(initialState(), "go", "c1");
  const s2 = reduce(s1, ack("c1"));
  assert.deepEqual(s2.pendingTurns, []);
  assert.equal(s2.chat, s1.chat);
});

check(
  "a turn typed while disconnected survives a history without it, once, and stays pending",
  () => {
    const s1 = typed(initialState(), "go", "c1");
    const s2 = reduce(s1, history(SNAP));
    assert.deepEqual(s2.chat, [...SNAP_CHAT, { kind: "user", text: "go", cid: "c1" }]);
    assert.deepEqual(s2.pendingTurns, ["c1"]);
    assert.equal(s2.chat[2], s1.chat[0]); // same object
    const s3 = reduce(s2, history(SNAP));
    assert.equal(s3, s2); // equal result keeps the references
    const s4 = reduce(s3, ack("c1"));
    assert.deepEqual(s4.pendingTurns, []);
    const s5 = reduce(s4, history([...SNAP, { role: "user", text: "go", cid: "c1" }]));
    assert.equal(count(s5, "go"), 1);
    assert.deepEqual(s5.pendingTurns, []);
  },
);

check(
  "a lost ack: a history holding the pending cid shows the turn once and clears the cid",
  () => {
    const s1 = typed(initialState(), "go", "c1");
    const s2 = reduce(s1, history([...SNAP, { role: "user", text: "go", cid: "c1" }]));
    assert.equal(count(s2, "go"), 1);
    assert.deepEqual(s2.pendingTurns, []);
    assert.equal(s2.chat.length, 3);
  },
);

check("two pending turns keep their original order after a replace", () => {
  const s1 = typed(typed(initialState(), "first", "c1"), "second", "c2");
  const s2 = reduce(s1, history(SNAP));
  assert.deepEqual(
    s2.chat.map((e) => e.text),
    ["hi", "hello there", "first", "second"],
  );
  assert.deepEqual(s2.pendingTurns, ["c1", "c2"]);
});

check("an acknowledged local turn that is not in the snapshot is not kept by a replace", () => {
  const s1 = reduce(typed(initialState(), "go", "c1"), ack("c1"));
  const s2 = reduce(s1, history(SNAP));
  assert.deepEqual(s2.chat, SNAP_CHAT);
  assert.equal(count(s2, "go"), 0);
});

check("user_ack for an unknown cid returns the same state object", () => {
  const s1 = typed(initialState(), "go", "c1");
  assert.equal(reduce(s1, ack("zzz")), s1);
});

check(
  "a second tab: a history item with a cid this page never typed shows once, pendingTurns unchanged",
  () => {
    const s1 = typed(initialState(), "mine", "c1");
    const s2 = reduce(s1, history([...SNAP, { role: "user", text: "theirs", cid: "other" }]));
    assert.equal(count(s2, "theirs"), 1);
    assert.deepEqual(s2.pendingTurns, ["c1"]);
    assert.deepEqual(
      s2.chat.map((e) => e.text),
      ["hi", "hello there", "theirs", "mine"],
    );
  },
);
// ---- a pending typed turn matches a cid-less snapshot item by text (#96) ----

/** @param {string} text @returns {import("./lib/types.js").HistoryItem} */
const storedUser = (text) => ({ role: "user", text });

check("lost ack then disk resume: a cid-less stored turn absorbs the pending turn", () => {
  const s1 = typed(initialState(), "go", "c1");
  const items = [...SNAP, storedUser("go")];
  const s2 = reduce(s1, history(items));
  assert.equal(count(s2, "go"), 1);
  assert.deepEqual(s2.pendingTurns, []);
  assert.deepEqual(s2.chat, [...SNAP_CHAT, { kind: "user", text: "go" }]);
  assert.equal(reduce(s2, history(items)), s2);
});

check("two pending turns, one cid-less item: the newer is absorbed, the older stays", () => {
  const s1 = typed(typed(initialState(), "go", "c1"), "go", "c2");
  const older = s1.chat[0];
  const s2 = reduce(s1, history([...SNAP, storedUser("go")]));
  assert.deepEqual(s2.pendingTurns, ["c1"]);
  assert.equal(s2.chat.length, 4);
  assert.equal(s2.chat[3], older); // same object, after the snapshot
  assert.deepEqual(s2.chat.slice(0, 3), [...SNAP_CHAT, { kind: "user", text: "go" }]);
  assert.equal(count(s2, "go"), 2);
});

check("two pending turns, two cid-less items: both absorbed, none kept locally", () => {
  const s1 = typed(typed(initialState(), "go", "c1"), "go", "c2");
  const items = [storedUser("go"), ...SNAP, storedUser("go")];
  const s2 = reduce(s1, history(items));
  assert.deepEqual(s2.pendingTurns, []);
  assert.equal(count(s2, "go"), 2); // each item used once, not twice
  assert.deepEqual(
    s2.chat.map((e) => e.text),
    ["go", "hi", "hello there", "go"],
  ); // snapshot order unchanged
  assert.ok(s2.chat.every((e) => !("cid" in e)));
});

check("a different text is not absorbed: the pending turn is kept and stays pending", () => {
  const s1 = typed(initialState(), "go", "c1");
  const s2 = reduce(s1, history([...SNAP, storedUser("stop")]));
  assert.deepEqual(s2.pendingTurns, ["c1"]);
  assert.deepEqual(
    s2.chat.map((e) => e.text),
    ["hi", "hello there", "stop", "go"],
  );
  assert.equal(s2.chat[3], s1.chat[0]);
});

check("a snapshot item with another cid and the same text does not absorb the turn", () => {
  const s1 = typed(initialState(), "go", "c1");
  const s2 = reduce(s1, history([...SNAP, { role: "user", text: "go", cid: "other" }]));
  assert.deepEqual(s2.pendingTurns, ["c1"]);
  assert.equal(count(s2, "go"), 2);
  assert.equal(s2.chat[3], s1.chat[0]);
});

check("trimming: whitespace and multi-line local text match the stored trimmed text", () => {
  const s1 = typed(typed(initialState(), "  go  \n", "c1"), "a\nb\n", "c2");
  const s2 = reduce(s1, history([...SNAP, storedUser("go"), storedUser("a\nb")]));
  assert.deepEqual(s2.pendingTurns, []);
  assert.deepEqual(
    s2.chat.map((e) => e.text),
    ["hi", "hello there", "go", "a\nb"],
  );
});

check("an assistant item with the same text and no cid never absorbs a pending turn", () => {
  const s1 = typed(initialState(), "go", "c1");
  const s2 = reduce(s1, history([...SNAP, { role: "assistant", text: "go" }]));
  assert.deepEqual(s2.pendingTurns, ["c1"]);
  assert.equal(s2.chat.length, 4);
  assert.equal(s2.chat[3], s1.chat[0]);
  const typedEntry = /** @type {const} */ ({ kind: "user", text: "go", cid: "c1" });
  assert.equal(absorbByText([typedEntry], [{ role: "assistant", text: "go" }]).size, 0);
});

console.log(`\n${passed} checks passed`);

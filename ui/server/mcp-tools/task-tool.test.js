// node:test pattern for mcp-tools: build the tool with a captured `send`, invoke its
// handler directly (the SDK `tool()` wrapper exposes it as `.handler`), and assert on
// both the returned text and the board broadcast — no live SDK session anywhere.
// GAME_DIR is a temp dir so the board file (.xenomoon/tasks.json) never touches a real game.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-tasktool-"));
process.env.GAME_DIR = scratch;
const { makeTaskTool } = await import("./task-tool.js");
const store = await import("../features/tasks/tasks-store.js");

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").Task} Task */

beforeEach(() => {
  rmSync(path.join(scratch, ".xenomoon"), { recursive: true, force: true });
});

/** Build the tool with a capturing send. */
function makeTool() {
  /** @type {OutMsg[]} */
  const sent = [];
  const t = makeTaskTool((m) => void sent.push(m));
  /** The task list carried by the latest broadcast. @returns {Task[]} */
  const lastTasks = () => {
    const last = /** @type {{ tasks?: Task[] } | undefined} */ (sent.at(-1));
    return last?.tasks ?? [];
  };
  return { t, sent, lastTasks };
}

/** First text block of a tool result. @param {unknown} r @returns {string} */
function textOf(r) {
  return /** @type {{ content: { text?: string }[] }} */ (r).content[0]?.text ?? "";
}

/** Fill the optional keys the SDK's InferShape keeps required (as `| undefined`).
 * @param {{ op: "add" | "update" | "remove" | "complete_open" | "objective" | "flow", title?: string,
 *   owner?: "agent" | "user", note?: string, id?: string,
 *   status?: "pending" | "in_progress" | "done", _by?: string, issue?: string | number,
 *   to?: (typeof import("../features/tasks/flow-machine.js").FLOW_IDS)[number] }} input */
function args(input) {
  return {
    title: undefined,
    owner: undefined,
    note: undefined,
    tasks: undefined,
    id: undefined,
    status: undefined,
    _by: undefined,
    issue: undefined,
    to: undefined,
    ...input,
  };
}

test("add: persists the task, broadcasts the board, and summarizes open items", async () => {
  const { t, sent, lastTasks } = makeTool();
  const out = await t.handler(args({ op: "add", title: "build level", _by: "main" }), {});
  assert.match(textOf(out), /1 task \(0 done\)\. OPEN: t1 build level \[pending\]/);
  assert.equal(sent.length, 1);
  const task = lastTasks()[0];
  assert.equal(task?.agent, "main");
  assert.equal(task?.owner, "agent"); // owner defaults to agent
});

test("add without _by: attributed to 'background' (the bridge's own label)", async () => {
  const { t, lastTasks } = makeTool();
  await t.handler(args({ op: "add", title: "bg job" }), {});
  assert.equal(lastTasks()[0]?.agent, "background");
});

test("update then remove: the summary tracks closing and dropping the task", async () => {
  const { t } = makeTool();
  await t.handler(args({ op: "add", title: "one", _by: "main" }), {});
  const closed = await t.handler(args({ op: "update", id: "t1", status: "done", _by: "main" }), {});
  assert.match(textOf(closed), /1 task \(1 done\)\. All closed\./);
  const removed = await t.handler(args({ op: "remove", id: "t1", _by: "main" }), {});
  assert.match(textOf(removed), /0 tasks \(0 done\)\./);
});

test("complete_open: closes only the caller's own open agent tasks", async () => {
  const { t, lastTasks } = makeTool();
  await t.handler(args({ op: "add", title: "dig tunnels", _by: "godot-dev" }), {});
  await t.handler(args({ op: "add", title: "paint sky", _by: "level-designer" }), {});
  await t.handler(
    args({ op: "add", title: "approve palette", owner: "user", _by: "godot-dev" }),
    {},
  );
  await t.handler(args({ op: "complete_open", _by: "godot-dev" }), {});
  const byTitle = new Map(lastTasks().map((task) => [task.title, task.status]));
  assert.equal(byTitle.get("dig tunnels"), "done");
  assert.equal(byTitle.get("paint sky"), "pending"); // another agent's task is untouched
  assert.equal(byTitle.get("approve palette"), "pending"); // user-owned — never auto-closed
});

test("objective: pinned first in every result, survives complete_open, replaced not stacked, closed by status done", async () => {
  const { t, lastTasks } = makeTool();
  const obj = /** @param {Record<string, unknown>} extra */ (extra) =>
    t.handler(/** @type {any} */ ({ ...args({ op: "add" }), ...extra, op: "objective" }), {});
  let out = await obj({ title: "close the open issues", _by: "main" });
  assert.match(textOf(out), /^OBJECTIVE: close the open issues\n0 tasks/);
  const aim = lastTasks()[0];
  assert.equal(aim?.kind, "objective");
  assert.equal(aim?.owner, "user"); // clear of the pruner and every agent task-closer
  assert.equal(aim?.status, "in_progress");

  await t.handler(args({ op: "add", title: "fix #12", _by: "main" }), {});
  out = await t.handler(args({ op: "complete_open", _by: "main" }), {});
  assert.match(textOf(out), /^OBJECTIVE: close the open issues\n1 task \(1 done\)\. All closed\./);
  assert.equal(lastTasks().filter((x) => x.kind === "objective").length, 1);

  out = await obj({ title: "close the open issues in worker/", _by: "main" });
  assert.equal(lastTasks().filter((x) => x.kind === "objective").length, 1); // replaced, same slot
  assert.match(textOf(out), /^OBJECTIVE: close the open issues in worker\//);

  out = await obj({ status: "done", _by: "main" });
  assert.doesNotMatch(textOf(out), /^OBJECTIVE/);
  assert.equal(lastTasks().find((x) => x.kind === "objective")?.status, "done");
});

/** The open flow tasks on the board. @param {Task[]} list */
const openFlows = (list) => list.filter((x) => x.kind === "flow" && x.status !== "done");
/** First line of a tool result. @param {unknown} r */
const head = (r) => textOf(r).split("\n")[0] ?? "";
/** The path from Screening to Proof (no counted move). */
const TO_PROOF = /** @type {const} */ ([
  "direction",
  "contract",
  "design",
  "plan",
  "build",
  "review",
  "commit",
  "publish",
  "waiting-proof",
  "proof",
]);

/** Start `issue` and apply each move in turn; returns the last result.
 * @param {ReturnType<typeof makeTool>["t"]} t @param {number | string} issue
 * @param {ReadonlyArray<NonNullable<Parameters<typeof args>[0]["to"]>>} moves */
async function walk(t, issue, moves) {
  let out = await t.handler(args({ op: "flow", issue, _by: "main" }), {});
  for (const to of moves) out = await t.handler(args({ op: "flow", issue, to, _by: "main" }), {});
  return out;
}

/** Write a board by hand (a title-only flow task from before FlowState). @param {object[]} list */
function seedBoard(list) {
  mkdirSync(path.join(scratch, ".xenomoon"), { recursive: true });
  writeFileSync(path.join(scratch, ".xenomoon", "tasks.json"), JSON.stringify(list));
}

test("flow: the first call starts at Screening; a move updates the same task; two issues two tasks", async () => {
  const { t, lastTasks } = makeTool();
  let out = await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  assert.equal(
    head(out),
    "#84 is at Screening (triage 0/2, fix 0/3). Allowed next: direction, needs-information, waiting-owner.",
  );
  const first = openFlows(lastTasks())[0];
  assert.equal(first?.owner, "agent");
  assert.equal(first?.agent, "main");
  assert.equal(first?.status, "in_progress");
  assert.deepEqual(first?.flow, { issue: "84", at: "screening", triage: 0, fix: 0 });
  assert.equal(first?.title, "#84 · Screening · triage 0/2 · fix 0/3");
  out = await t.handler(
    args({ op: "flow", issue: "84", to: "direction", note: "n", _by: "main" }),
    {},
  );
  assert.match(head(out), /^#84 is at Direction .*Allowed next: triage, contract,/);
  assert.equal(openFlows(lastTasks()).length, 1);
  assert.equal(openFlows(lastTasks())[0]?.id, first?.id);
  assert.equal(openFlows(lastTasks())[0]?.title, "#84 · Direction · triage 0/2 · fix 0/3");
  assert.equal(openFlows(lastTasks())[0]?.note, "n");
  out = await t.handler(args({ op: "flow", issue: 9, _by: "main" }), {});
  assert.equal(openFlows(lastTasks()).length, 2);
  assert.match(textOf(out), /OPEN: t1 #84 · Direction.*t2 #9 · Screening/);
});

test("flow: a first call at a later step says placed at <Step> and records it", async () => {
  const { t, lastTasks } = makeTool();
  const out = await t.handler(args({ op: "flow", issue: 84, to: "review", _by: "main" }), {});
  assert.match(head(out), /^#84 placed at Review .*Allowed next: fix, commit, waiting-owner\.$/);
  assert.equal(lastTasks()[0]?.flow?.placed, "review");
  assert.equal(lastTasks()[0]?.title, "#84 · Review · triage 0/2 · fix 0/3 · placed at Review");
  const next = await t.handler(args({ op: "flow", issue: 84, to: "commit", _by: "main" }), {});
  assert.match(head(next), /^#84 is at Commit/); // only the first call says placed
});

test("flow: a title or status is refused with the new call shape, nothing stored", async () => {
  const { t, lastTasks } = makeTool();
  for (const extra of [{ title: "#84 · Design" }, { status: /** @type {const} */ ("done") }]) {
    const out = await t.handler(args({ op: "flow", issue: 84, _by: "main", ...extra }), {});
    assert.match(
      head(out),
      /^op "flow" refused: it takes no "title" or "status".*\{op:"flow", issue:84, to:"design"\}/,
    );
    assert.equal(lastTasks().length, 0);
  }
  await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  const before = JSON.stringify(store.readTasks());
  await t.handler(args({ op: "flow", issue: 84, to: "direction", title: "x", _by: "main" }), {});
  assert.equal(JSON.stringify(store.readTasks()), before);
});

test("flow: an issue that is not a number is refused", async () => {
  const { t, lastTasks } = makeTool();
  const out = await t.handler(args({ op: "flow", issue: "#84", _by: "main" }), {});
  assert.match(head(out), /^op "flow" refused: issue "#84" is not a number/);
  assert.equal(lastTasks().length, 0);
});

test("flow: a move the flow does not have is refused with the machine's error, task unchanged", async () => {
  const { t } = makeTool();
  await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  const before = JSON.stringify(store.readTasks());
  const out = await t.handler(args({ op: "flow", issue: 84, to: "build", _by: "main" }), {});
  assert.equal(
    head(out),
    'move to "build" refused: #84 is at Screening. Allowed: direction, needs-information, waiting-owner.',
  );
  assert.equal(JSON.stringify(store.readTasks()), before);
  const noTo = await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  assert.match(head(noTo), /^op "flow" refused: "to" is required once #84 is in the flow/);
  assert.equal(JSON.stringify(store.readTasks()), before);
});

test("flow: a budget refusal saves the forced waiting state and reports the error first", async () => {
  const { t, lastTasks } = makeTool();
  const out = await walk(t, 84, [
    "direction",
    "triage",
    "direction",
    "triage",
    "direction",
    "triage",
  ]);
  const lines = textOf(out).split("\n");
  assert.match(lines[0] ?? "", /^move refused: the triage budget is used \(2\/2\)/);
  assert.match(
    lines[1] ?? "",
    /^#84 is at Needs information \(from Direction\) .*Allowed next: direction\.$/,
  );
  const task = openFlows(lastTasks())[0];
  assert.deepEqual(task?.flow, {
    issue: "84",
    at: "needs-information",
    from: "direction",
    triage: 2,
    fix: 0,
  });
  assert.equal(task?.title, "#84 · Needs information (from Direction) · triage 2/2 · fix 0/3");
  assert.deepEqual(store.readTasks(), lastTasks()); // written, not only broadcast
});

test("flow: to done closes only from proof; then it is pruned", async () => {
  const { t, lastTasks } = makeTool();
  const first = await t.handler(args({ op: "flow", issue: 84, to: "done", _by: "main" }), {});
  assert.match(head(first), /^start refused: "done" is not a step/);
  assert.equal(lastTasks().length, 0);
  await walk(t, 84, ["direction"]);
  const early = await t.handler(args({ op: "flow", issue: 84, to: "done", _by: "main" }), {});
  assert.match(head(early), /^move to "done" refused: #84 is at Direction/);
  assert.equal(openFlows(store.readTasks()).length, 1);
  await walk(t, 9, []);
  await walk(t, 84, TO_PROOF.slice(1));
  const out = await t.handler(args({ op: "flow", issue: 84, to: "done", _by: "main" }), {});
  assert.equal(head(out), "#84 is Done; its flow task is closed.");
  assert.equal(lastTasks().find((x) => x.flow?.issue === "84")?.status, "done");
  assert.equal(openFlows(lastTasks()).length, 1); // #9 untouched
  assert.deepEqual(
    store.pruneDoneTasks()?.map((x) => x.flow?.issue),
    ["9"],
  );
});

test("flow: complete_open, closeOpenByAgent and the straggler sweep leave an open flow task open", async () => {
  const { t, lastTasks } = makeTool();
  await t.handler(args({ op: "flow", issue: 84, _by: "dev" }), {});
  await t.handler(args({ op: "add", title: "scratch", _by: "dev" }), {});
  const out = await t.handler(args({ op: "complete_open", _by: "dev" }), {});
  assert.equal(openFlows(lastTasks()).length, 1);
  assert.match(textOf(out), /OPEN: t1 #84 · Screening · triage 0\/2 · fix 0\/3 \[in_progress\]/);
  assert.equal(openFlows(store.closeOpenAgentTasks()).length, 1); // no agent: blunt close
  assert.equal(openFlows(store.closeOpenByAgent("dev")).length, 1); // subagent finished
  assert.equal(store.closeStragglerTasks(new Set(), false), null); // nothing to sweep
  assert.equal(store.pruneDoneTasks()?.length, 1); // drops "scratch", keeps the open flow task
  assert.equal(openFlows(store.readTasks()).length, 1);
});

test("flow: generic update and remove are refused, via the tool and the browser path", async () => {
  const { t, lastTasks } = makeTool();
  await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  const before = JSON.stringify(lastTasks());
  for (const extra of [{ status: /** @type {const} */ ("done") }, { title: "renamed" }]) {
    const out = await t.handler(args({ op: "update", id: "t1", _by: "main", ...extra }), {});
    assert.match(textOf(out), /op "update" refused: t1 .*only op "flow"/);
  }
  const out = await t.handler(args({ op: "remove", id: "t1", _by: "main" }), {});
  assert.match(textOf(out), /op "remove" refused: t1 .*only op "flow"/);
  assert.equal(JSON.stringify(lastTasks()), before);
  // A store caller without the owner origin (the browser path passes it; see the owner test).
  store.applyOp({ op: "remove", id: "t1" }, "now");
  store.applyOp({ op: "update", id: "t1", status: "done" }, "now");
  assert.equal(JSON.stringify(store.readTasks()), before);
});

test("flow: a caller without the owner origin cannot remove a flow task that reuses a cleaned-up id", () => {
  // A background task gets t1 and is removed; a flow task then gets t1; the background
  // cleanup (session-stream-tracker bridgeSettle) sends its remove for t1 again.
  const bg = store.addBackgroundTask("worker", undefined, "now");
  assert.equal(bg.id, "t1");
  store.applyOp({ op: "remove", id: "t1" }, "now");
  store.applyTaskOp({ op: "flow", issue: 84, _by: "main" }, "now");
  const before = JSON.stringify(store.readTasks());
  assert.equal(store.readTasks()[0]?.id, "t1");
  const res = store.applyTaskOp({ op: "remove", id: "t1" }, "now");
  assert.match(res.error ?? "", /op "remove" refused: t1 is an open flow task.*only the owner/);
  store.applyOp({ op: "remove", id: "t1" }, "now");
  assert.equal(JSON.stringify(store.readTasks()), before);
});

test("flow: the owner origin removes an open flow task but still cannot update it", () => {
  store.applyTaskOp({ op: "flow", issue: 84, _by: "main" }, "now");
  const before = JSON.stringify(store.readTasks());
  for (const extra of [{ status: "done" }, { title: "renamed" }, { note: "n" }]) {
    const res = store.applyTaskOp({ op: "update", id: "t1", ...extra }, "now", { by: "owner" });
    assert.match(res.error ?? "", /op "update" refused: t1/);
  }
  assert.equal(JSON.stringify(store.readTasks()), before);
  assert.deepEqual(store.applyOp({ op: "remove", id: "t1" }, "now", { by: "owner" }), []);
  assert.deepEqual(store.readTasks(), []);
});

test("flow: a done flow task cannot be updated (no reopen, no duplicate), but anyone may remove it", () => {
  store.applyTaskOp({ op: "flow", issue: 84, to: "proof", _by: "main" }, "now"); // t1
  store.applyTaskOp({ op: "flow", issue: 84, to: "done", _by: "main" }, "now");
  store.applyTaskOp({ op: "flow", issue: 84, to: "review", _by: "main" }, "now"); // t2
  const before = JSON.stringify(store.readTasks());
  const reopen = { op: "update", id: "t1", status: "in_progress", title: "changed" };
  for (const origin of [{}, /** @type {const} */ ({ by: "owner" })]) {
    const res = store.applyTaskOp(reopen, "now", origin);
    assert.match(res.error ?? "", /op "update" refused: t1 is a flow task; only op "flow"/);
  }
  assert.equal(JSON.stringify(store.readTasks()), before);
  assert.equal(openFlows(store.readTasks()).length, 1);
  const res = store.applyTaskOp({ op: "remove", id: "t1" }, "now"); // no owner origin
  assert.equal(res.error, undefined);
  assert.deepEqual(
    store.readTasks().map((x) => x.id),
    ["t2"],
  );
});

test("flow: add cannot forge a flow task (kind is not taken from an add spec)", () => {
  store.applyOp(/** @type {any} */ ({ op: "add", title: "#84 · x", kind: "flow" }), "now");
  assert.equal(store.readTasks()[0]?.kind, undefined);
});

test('flow: the issue number is canonical — 8 and "08" are one task, 8 and 84 are two', async () => {
  const { t, lastTasks } = makeTool();
  await t.handler(args({ op: "flow", issue: 8, _by: "main" }), {});
  await t.handler(args({ op: "flow", issue: "08", to: "direction", _by: "main" }), {});
  assert.deepEqual(
    openFlows(lastTasks()).map((x) => x.title),
    ["#8 · Direction · triage 0/2 · fix 0/3"],
  );
  await t.handler(args({ op: "flow", issue: 84, _by: "main" }), {});
  assert.equal(openFlows(lastTasks()).length, 2);
});

test("flow: a readable title-only task is upgraded on first touch, no duplicate", async () => {
  seedBoard([
    {
      id: "t1",
      title: "#084 · Design · triage 1/2 · fix 0/3 · agents 5",
      owner: "agent",
      status: "in_progress",
      kind: "flow",
      created: "x",
    },
  ]);
  const { t, lastTasks } = makeTool();
  const out = await t.handler(args({ op: "flow", issue: 84, to: "plan", _by: "main" }), {});
  assert.match(head(out), /^#84 is at Plan \(triage 1\/2, fix 0\/3\)/);
  assert.equal(lastTasks().length, 1);
  assert.equal(lastTasks()[0]?.id, "t1");
  assert.deepEqual(lastTasks()[0]?.flow, { issue: "84", at: "plan", triage: 1, fix: 0 });
  assert.equal(lastTasks()[0]?.title, "#84 · Plan · triage 1/2 · fix 0/3");
});

test("flow: an unreadable title-only task is refused, quoted, unchanged, no second task", async () => {
  const legacy = {
    id: "t1",
    title: "#84 · Somewhere · agents 5",
    owner: "agent",
    status: "in_progress",
    kind: "flow",
    created: "x",
  };
  seedBoard([legacy]);
  const { t, lastTasks } = makeTool();
  const out = await t.handler(args({ op: "flow", issue: 84, to: "plan", _by: "main" }), {});
  assert.match(
    head(out),
    /^op "flow" refused: the open flow task t1 "#84 · Somewhere · agents 5" cannot be read.*owner must remove/,
  );
  assert.deepEqual(lastTasks(), [legacy]);
  assert.deepEqual(store.readTasks(), [legacy]);
});

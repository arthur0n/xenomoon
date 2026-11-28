// plugin/hooks/flow-reject.mjs (#110): a refused commit moves the issue's open flow task to Fix,
// once per fingerprint. The function is called directly; the process runs once (CLI test).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFlow } from "../server/features/tasks/flow-task.js";
import { parseJSON } from "./json.js";

const HOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
  "flow-reject.mjs",
);
// A computed specifier, not a static import: tsc would follow a static one into plugin/hooks.
/** @typedef {import("./types.js").Task} Task */
/** @typedef {{ line: string, written: boolean }} Rejected */
/** @type {unknown} */
const loaded = await import(pathToFileURL(HOOK).href);
const { flowReject } =
  /** @type {{ flowReject: (dir: string, issue: string | number, fp: string, now: string) => Promise<Rejected> }} */ (
    loaded
  );

const NOW = "2026-11-28T10:00:00.000Z";
const FP1 = "a".repeat(40);
const FP2 = "b".repeat(40);
const roots = /** @type {string[]} */ ([]);

after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** A temp project folder; `tasks` (a list, or a raw string) is written when given.
 * @param {Task[] | string} [tasks] */
function project(tasks) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "flow-reject-"));
  roots.push(dir);
  mkdirSync(path.join(dir, ".xenomoon"));
  const file = path.join(dir, ".xenomoon", "tasks.json");
  if (tasks !== undefined)
    writeFileSync(file, typeof tasks === "string" ? tasks : JSON.stringify(tasks, null, 2) + "\n");
  return { dir, file };
}

/** A task list built with the framework's own setFlow: the issue placed at `at`, then each move.
 * @param {string} at @param {string[]} [moves] */
function flowList(at, moves = []) {
  let list = /** @type {Task[]} */ ([]);
  for (const to of [at, ...moves]) {
    const res = setFlow(list, { issue: 84, to }, NOW);
    assert.equal(res.list === list, false, res.error);
    list = res.list;
  }
  return list;
}

/** @param {string} file @returns {Task} */
const readTask = (file) => {
  const list = /** @type {Task[]} */ (parseJSON(readFileSync(file, "utf8")));
  assert.equal(list.length, 1);
  return /** @type {Task} */ (list[0]);
};

test("a flow task at commit and a new fingerprint moves to fix, counts the round, stores the fingerprint", async () => {
  const { dir, file } = project(flowList("commit"));
  const res = await flowReject(dir, 84, FP1, NOW);
  assert.equal(res.written, true);
  const t = readTask(file);
  assert.equal(t.flow?.at, "fix");
  assert.equal(t.flow?.fix, 1);
  assert.equal(t.flow?.rejected, FP1);
  assert.match(t.title, /Fix/);
  assert.match(t.title, /fix 1\/3/);
  assert.match(res.line, /#84/);
});

test("the same fingerprint again writes nothing and does not count again", async () => {
  const { dir, file } = project(flowList("commit"));
  await flowReject(dir, 84, FP1, NOW);
  const before = readFileSync(file);
  const res = await flowReject(dir, 84, FP1, NOW);
  assert.equal(res.written, false);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(readTask(file).flow?.fix, 1);
});

test("a different fingerprint is another refused commit and counts again", async () => {
  // fix -> commit again, as the flow would after the first fix round.
  const { dir, file } = project(flowList("commit"));
  await flowReject(dir, 84, FP1, NOW);
  const list = /** @type {Task[]} */ (parseJSON(readFileSync(file, "utf8")));
  const back = setFlow(list, { issue: 84, to: "commit" }, NOW).list;
  writeFileSync(file, JSON.stringify(back, null, 2) + "\n");
  const res = await flowReject(dir, 84, FP2, NOW);
  assert.equal(res.written, true);
  const t = readTask(file);
  assert.equal(t.flow?.at, "fix");
  assert.equal(t.flow?.fix, 2);
  assert.equal(t.flow?.rejected, FP2);
});

test("over the fix budget the issue waits for the owner, with from, rejected and the budget line", async () => {
  // placed at fix (round 1), two more rounds, then commit: fix is 3/3.
  const { dir, file } = project(flowList("fix", ["fix", "fix", "commit"]));
  assert.equal(readTask(file).flow?.fix, 3);
  const res = await flowReject(dir, 84, FP1, NOW);
  assert.equal(res.written, true);
  const t = readTask(file);
  assert.equal(t.flow?.at, "waiting-owner");
  assert.equal(t.flow?.from, "commit");
  assert.equal(t.flow?.rejected, FP1);
  assert.equal(t.flow?.fix, 3);
  assert.match(res.line, /budget is used/);
});

test("a task already waiting for the owner is left as it is", async () => {
  const { dir, file } = project(flowList("commit", ["waiting-owner"]));
  const before = readFileSync(file);
  const res = await flowReject(dir, 84, FP1, NOW);
  assert.equal(res.written, false);
  assert.deepEqual(readFileSync(file), before);
  assert.match(res.line, /Waiting/i);
});

test("a task waiting for the owner that would return to fix is not moved either", async () => {
  // Waiting from Fix may go back to Fix: only the waiting guard keeps the owner's hold.
  const { dir, file } = project(flowList("fix", ["waiting-owner"]));
  assert.equal(readTask(file).flow?.from, "fix");
  const before = readFileSync(file);
  const res = await flowReject(dir, 84, FP1, NOW);
  assert.equal(res.written, false);
  assert.deepEqual(readFileSync(file), before);
});

test("nothing is written without an open flow task, with no move to fix, or with no tasks file", async () => {
  const other = project(flowList("commit"));
  const otherBytes = readFileSync(other.file);
  const noTask = await flowReject(other.dir, 99, FP1, NOW);
  assert.equal(noTask.written, false);
  assert.match(noTask.line, /no open flow task/);
  assert.deepEqual(readFileSync(other.file), otherBytes);

  const design = project(flowList("design"));
  const designBytes = readFileSync(design.file);
  const noMove = await flowReject(design.dir, 84, FP1, NOW);
  assert.equal(noMove.written, false);
  assert.ok(noMove.line.length > 0);
  assert.deepEqual(readFileSync(design.file), designBytes);

  const none = project();
  const noFile = await flowReject(none.dir, 84, FP1, NOW);
  assert.equal(noFile.written, false);
  assert.match(noFile.line, /no tasks file/);
  assert.equal(existsSync(none.file), false);
});

test("a corrupt tasks file is not touched and does not throw", async () => {
  for (const text of ["{ not json", '{"a":1}\n']) {
    const { dir, file } = project(text);
    const res = await flowReject(dir, 84, FP1, NOW);
    assert.equal(res.written, false);
    assert.match(res.line, /not a JSON list/);
    assert.equal(readFileSync(file, "utf8"), text);
  }
});

test("CLI: from a sub-folder it finds the project and prints one line, exit 0; bad arguments too", () => {
  const { dir, file } = project(flowList("commit"));
  assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0);
  const sub = path.join(dir, "src", "deep");
  mkdirSync(sub, { recursive: true });
  const ok = spawnSync(process.execPath, [HOOK, sub, "84", FP1], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.split("\n").filter(Boolean).length, 1);
  assert.ok(ok.stdout.endsWith("\n"));
  assert.equal(readTask(file).flow?.rejected, FP1);

  const bad = spawnSync(process.execPath, [HOOK, "only-one-arg"], { encoding: "utf8" });
  assert.equal(bad.status, 0, bad.stderr);
  assert.equal(bad.stdout.split("\n").filter(Boolean).length, 1);
  assert.match(bad.stdout, /usage/);
});

test("CLI: a nested independent repo as <repo dir> moves nothing in the parent project", () => {
  const { dir, file } = project(flowList("commit"));
  assert.equal(spawnSync("git", ["init", "-q", dir]).status, 0);
  const nested = path.join(dir, "vendor", "inner");
  mkdirSync(nested, { recursive: true });
  assert.equal(spawnSync("git", ["init", "-q", nested]).status, 0);
  const bytes = readFileSync(file);
  const r = spawnSync(process.execPath, [HOOK, nested, "84", FP1], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing was moved/);
  assert.match(r.stdout, /not the project's repo/);
  assert.deepEqual(readFileSync(file), bytes);
});

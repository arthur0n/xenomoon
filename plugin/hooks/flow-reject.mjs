#!/usr/bin/env node
/* global process */
// Called by the commit hook when the content being committed is not the content that passed (#110):
// `node flow-reject.mjs <repo dir> <issue> <fingerprint>` moves the issue's open flow task to Fix
// (one counted round per refused fingerprint) and prints ONE line saying where the issue is now.
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {import("../../ui/lib/types.js").Task} Task */

const NOT_MOVED = "flow-reject: nothing was moved:";

/** The framework modules this hook uses, found through FRAMEWORK_DIR (never the server config). */
async function framework() {
  const { FRAMEWORK_DIR } = await import("./project-policy.mjs");
  /** @param {...string} p */
  const load = (...p) => import(path.join(FRAMEWORK_DIR, "ui", ...p));
  const [flowTask, machine, paths, settings, json] = await Promise.all([
    load("server", "features", "tasks", "flow-task.js"),
    load("server", "features", "tasks", "flow-machine.js"),
    load("lib", "project-paths.js"),
    load("lib", "project-settings.js"),
    load("lib", "json.js"),
  ]);
  const { canonicalIssue, fromLegacyTitle, WAITING_IDS, DONE } = machine;
  return {
    ...flowTask,
    canonicalIssue,
    fromLegacyTitle,
    WAITING_IDS,
    DONE,
    ...paths,
    ...settings,
    ...json,
  };
}

/** Whole content to a sibling temp file, then one rename. @param {string} file @param {Task[]} list */
function writeAtomic(file, list) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(list, null, 2) + "\n", { flag: "wx" });
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Move the open flow task of `issue` in `projectDir` to Fix and store `fingerprint` in its
 * `flow.rejected`. The same fingerprint again, no open flow task, or no move to Fix: nothing
 * is written. Over the fix budget the forced waiting state is written. Never throws.
 * @param {string} projectDir @param {string | number} issue @param {string} fingerprint @param {string} now
 * @returns {Promise<{ line: string, written: boolean }>}
 */
export async function flowReject(projectDir, issue, fingerprint, now) {
  /** @param {string} line @param {boolean} [written] */
  const out = (line, written = false) => ({ line, written });
  try {
    const fw = await framework();
    const key = fw.canonicalIssue(issue);
    if (!key) return out(`${NOT_MOVED} issue "${issue}" is not a number.`);
    if (typeof fingerprint !== "string" || !fingerprint.trim())
      return out(`${NOT_MOVED} the fingerprint is empty.`);
    if (!projectDir) return out(`${NOT_MOVED} no project was found (no .xenomoon folder).`);
    const file = fw.projectTasksFile(projectDir);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return out(`${NOT_MOVED} no tasks file at ${file}.`);
    }
    /** @type {unknown} */
    let parsed;
    try {
      parsed = fw.parseJSON(text);
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed))
      return out(`${NOT_MOVED} the tasks file ${file} is not a JSON list.`);
    const list = /** @type {Task[]} */ (parsed);
    const open = list.find((t) => fw.isOpenFlow(t) && fw.flowIssueOf(t) === key);
    // setFlow would START a flow placed at Fix when none is open: that is not a refused commit.
    if (!open) return out(`${NOT_MOVED} #${key} has no open flow task.`);
    if (open.flow && open.flow.rejected === fingerprint)
      return out(fw.flowLine(open.flow, false, false));
    // A waiting state belongs to the owner: a refused commit never takes the issue out of it.
    const current = open.flow ?? fw.fromLegacyTitle(open.title);
    if (current && (fw.WAITING_IDS.includes(current.at) || current.at === fw.DONE))
      return out(fw.flowLine(current, false, current.at === fw.DONE));
    const res = fw.setFlow(list, { op: "flow", issue: key, to: "fix" }, now);
    if (res.list === list)
      return out(res.error ?? res.info ?? `${NOT_MOVED} #${key} was not moved.`);
    const next = res.list.map((t) =>
      t.id === open.id && t.flow ? { ...t, flow: { ...t.flow, rejected: fingerprint } } : t,
    );
    writeAtomic(file, next);
    return out(res.error ?? res.info ?? "", true);
  } catch (e) {
    return out(`${NOT_MOVED} ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The real top folder of the git repo holding `dir`, or "" when git cannot tell. @param {string} dir */
function gitTop(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const top = r.status === 0 ? r.stdout.trim() : "";
  try {
    return top ? realpathSync(top) : "";
  } catch {
    return "";
  }
}

/** @returns {boolean} */
function runAsCli() {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

/** @param {string[]} args */
async function run(args) {
  const [repoDir, issue, fingerprint] = args;
  if (args.length !== 3 || !repoDir || !issue || !fingerprint)
    return `${NOT_MOVED} usage: flow-reject.mjs <repo dir> <issue number> <fingerprint>.`;
  const { resolveProjectDir } = await framework();
  const projectDir = resolveProjectDir(repoDir);
  if (!projectDir)
    return `${NOT_MOVED} no project was found from ${repoDir} (no .xenomoon folder).`;
  // A nested independent repo inside a project folder must not move the parent project's issue of
  // the same number: the project counts only when it is the commit's own repo.
  const projectTop = gitTop(projectDir);
  if (!projectTop || projectTop !== gitTop(repoDir))
    return `${NOT_MOVED} the commit's repo is not the project's repo (the flow task of #${issue} in ${projectDir} belongs to another repo).`;
  return (await flowReject(projectDir, issue, fingerprint, new Date().toISOString())).line;
}

if (runAsCli()) {
  run(process.argv.slice(2))
    .catch((e) => `${NOT_MOVED} ${e instanceof Error ? e.message : String(e)}`)
    .then((line) => {
      process.stdout.write(`${line.replace(/\s+/g, " ").trim()}\n`);
      process.exit(0);
    });
}

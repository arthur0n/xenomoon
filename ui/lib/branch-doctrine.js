/** The branch-model file, read for GATING — shared by the permission layer and the PreToolUse hook.
 *
 * `<project>/.xenomoon/branch-model` is the human's setup-time choice (see
 * `ui/server/cli/branch-model.js`): line 1 = the model, optional `prod=`/`dev=` lines override the
 * `main`/`development` defaults. `config.js getBranchModelBlock()` renders it as session prose;
 * THIS reader gives the gates the same three facts, because the routine/consequential line for a
 * push is drawn by that choice — a work-branch push under `pr-main` is pipeline routine, a push
 * that reaches `prod` is the consequential half.
 *
 * The gates only ever use the model to RELAX (open routine pushes that used to be hard-denied),
 * never to tighten — so `custom` and an absent file return null, and null means every push gates:
 * the safe fallback, and exactly how older installs behaved.
 *
 * Node builtins only, same rule as `migrations.js`: the hook loads this directly and must not drag
 * in `config.js`, whose import triggers a load-time domain probe.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The project's branch doctrine as the gates need it, or null when it cannot draw a line
 * (`custom` model, absent/unreadable file, empty projectDir) — null gates every push.
 * @param {string} projectDir
 * @returns {{ model: "pr-main" | "trunk" | "staged", prod: string, dev: string } | null} */
export function readBranchModel(projectDir) {
  if (!projectDir) return null;
  let raw;
  try {
    raw = readFileSync(path.join(projectDir, ".xenomoon", "branch-model"), "utf8");
  } catch {
    return null;
  }
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const model = lines[0] ?? "";
  if (model !== "pr-main" && model !== "trunk" && model !== "staged") return null;
  // Same parse as config.js getBranchModelBlock(): a `prod=`/`dev=` line with a value overrides.
  /** @param {string} prefix @param {string} fallback @returns {string} */
  const branch = (prefix, fallback) =>
    lines.find((l) => l.startsWith(prefix) && l.length > prefix.length)?.slice(prefix.length) ??
    fallback;
  return { model, prod: branch("prod=", "main"), dev: branch("dev=", "development") };
}

/**
 * Does the project's branch model SANCTION creating work branches? Under `pr-main` and `staged`
 * the convention IS "work happens on short-lived branches" — creating one follows the setup-time
 * decision, and asking again second-guesses the human's own standing answer (live bite
 * 2026-08-21: the pipeline asked for consent to create the feature branch its model prescribes).
 * `trunk` keeps no work branches, so a creation there is a DEVIATION worth its prompt; `custom`
 * and an absent file give no convention to check against, so they gate too.
 * @param {ReturnType<typeof readBranchModel>} doctrine
 * @returns {boolean} */
export function branchCreationRoutine(doctrine) {
  return !!doctrine && (doctrine.model === "pr-main" || doctrine.model === "staged");
}

/**
 * Does this push reach the deploy branch? Three answers:
 *   false — the command is the ROUTINE shape (`git push <remote> <branch>`, see
 *           `routinePushTarget`) and its branch is not `prod`: the pipeline's daily publish.
 *   true  — the routine shape targeting `prod`: this one ships.
 *   null  — no line can be drawn (no model, or not the routine shape): gates like true.
 * @param {string | null} target `routinePushTarget(cmd)`
 * @param {ReturnType<typeof readBranchModel>} doctrine
 * @returns {boolean | null} */
export function deployReaching(target, doctrine) {
  if (!doctrine || target === null) return null;
  return target === doctrine.prod;
}

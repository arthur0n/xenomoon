#!/usr/bin/env node
/* global process */
// Which project a hook's session is in, and that project's approvals (#84).
//
// One install serves several projects, each with its own session, so the policy cannot come from
// the install's `.xenomoon.json`: project B's session would apply project A's approvals. The hook
// payload's `cwd` names the session's folder; ui/lib/project-settings.js walks up from it to the
// project and reads `<project>/.xenomoon/settings.json`. That module is the ONE definition of both
// the walk and the normalisation; this file only finds it and fails toward ASK when it cannot.
// No environment variable picks the project: a nested session inherits env from another
// project's server.
//
// Two callers: consequential-gate.mjs imports `projectPolicy`, and require-codex-consent.sh runs
// this file as a CLI — `node project-policy.mjs <policyKey> <cwd>` prints `allow` or `ask`, and
// prints `ask` on every failure.
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // <plugin>/hooks

/** Where the framework actually is.
 *
 * FIRST the absolute path the installer recorded, because it lives inside the plugin tree and
 * therefore travels with a COPY of it. Deriving the root from the plugin's parent assumes the
 * plugin is loaded where it was built — an install route that copies the directory breaks that
 * silently, and a silent break here means the gates stop existing on the one surface they were
 * written for. Same failure the issuekit path hit, same fix.
 * @returns {string} */
function frameworkDir() {
  try {
    const recorded = readFileSync(path.join(HERE, "framework-root.generated"), "utf8")
      .split("\n")[0]
      .trim();
    if (recorded) return recorded;
  } catch {
    /* not installed through the CLI yet — fall back to the in-place layout */
  }
  return path.join(HERE, "..", "..");
}
export const FRAMEWORK_DIR = frameworkDir();

/** Every action asks: the answer when the shared module cannot be used at all. */
const ALL_ASK = Object.freeze({
  push: "ask",
  merge: "ask",
  dependencies: "ask",
  branchCreate: "ask",
  spend: "ask",
  spendPatterns: [],
  migrationPush: "ask",
  migrationsPending: "",
  codexReview: "ask",
});

/**
 * The session's project and its normalised policy. `projectDir` is "" when no project was found;
 * `why` then says why, and every action asks.
 * @param {unknown} cwd the hook payload's `cwd`
 * @returns {Promise<{ policy: typeof ALL_ASK, projectDir: string, why: string }>}
 */
export async function projectPolicy(cwd) {
  let mod;
  try {
    mod = await import(path.join(FRAMEWORK_DIR, "ui", "lib", "project-settings.js"));
  } catch {
    return {
      policy: ALL_ASK,
      projectDir: "",
      why: "ui/lib/project-settings.js could not be loaded (wrong framework root, or the file is absent)",
    };
  }
  const missing = ["resolveProjectDir", "readActionPolicy", "normalizeActionPolicy"].filter(
    (name) => typeof mod[name] !== "function",
  );
  if (missing.length)
    return {
      policy: ALL_ASK,
      projectDir: "",
      why: `ui/lib/project-settings.js loaded but is missing: ${missing.join(", ")} (version-skewed install)`,
    };
  try {
    const projectDir = typeof cwd === "string" ? mod.resolveProjectDir(cwd) : "";
    if (!projectDir)
      return {
        policy: mod.normalizeActionPolicy({}),
        projectDir: "",
        why: "no project was found from the session's folder (no `.xenomoon/` above it)",
      };
    return { policy: mod.readActionPolicy(projectDir), projectDir, why: "" };
  } catch {
    return { policy: ALL_ASK, projectDir: "", why: "the project's settings could not be read" };
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

if (runAsCli()) {
  const [key = "", cwd = ""] = process.argv.slice(2);
  projectPolicy(cwd).then(
    ({ policy }) => {
      const mode = /** @type {Record<string, unknown>} */ (policy)[key];
      process.stdout.write(mode === "allow" ? "allow\n" : "ask\n");
    },
    () => process.stdout.write("ask\n"),
  );
}

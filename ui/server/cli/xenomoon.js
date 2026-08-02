#!/usr/bin/env node
// The `xenomoon` CLI — real verbs instead of npm-run magic words. This file is the package
// `bin`: reachable via `npx github:arthur0n/xenomoon <verb>` on a fresh machine (only
// `install` makes sense there) and as a plain `xenomoon <verb>` once an install has been
// npm-linked. Every verb is a thin dispatcher onto the framework's own scripts, run against
// the install you are STANDING IN — see ROOT below for why cwd wins over this file's location.
//
//   xenomoon install          step zero: run from YOUR PROJECT folder — installs the
//                             framework beside it (default ../<project>-xm), then the
//                             questionnaire (domain → port → integrations → /onboard)
//   xenomoon doctor           health check for the bound project
//   xenomoon start [profile]  serve the UI in the FOREGROUND (logs in this terminal)
//   xenomoon up               serve the UI DETACHED (./start_server: PID file, port reclaim)
//   xenomoon stop             stop the detached server (./stop_server)
//   xenomoon restart          stop + start detached (the update/config reload verb)
//   xenomoon update           pull the latest framework (git)
//   xenomoon promote          apply approved promotions from the board
//   xenomoon list             every install on this machine, and which owns the global bin
//
// Any verb takes --install=<path> (or XENOMOON_INSTALL) to name its target explicitly.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, resolveInstall } from "./install-registry.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const OWN_ROOT = path.join(here, "..", "..", ".."); // the install this linked CLI ships inside
const argv = process.argv.slice(2);
const [verb, ...rest] = argv.filter((a) => !a.startsWith("--install="));
const override =
  argv
    .find((a) => a.startsWith("--install="))
    ?.split("=")
    .slice(1)
    .join("=") ??
  process.env.XENOMOON_INSTALL ??
  null;

// Verbs that act ON an install (as opposed to creating one, or reporting on all of them).
const ROOT_VERBS = ["doctor", "start", "up", "stop", "restart", "update", "promote"];

/** Resolve the target install for a ROOT_VERB, or exit non-zero listing the candidates. Ambiguity
 * must never be resolved by guessing: silently driving whichever install last won the global
 * `npm link` is precisely the bug the registry exists to eliminate. @returns {string} */
function targetRoot() {
  const r = resolveInstall(process.cwd(), OWN_ROOT, override);
  if (!r.root) {
    if (r.candidates?.length) {
      console.error(
        `xenomoon ${verb}: cwd is neither an install nor a known project, and ` +
          `${r.candidates.length} installs are registered — say which:\n` +
          r.candidates.map(([i, p]) => `  ${i}${p ? `  → ${p}` : ""}`).join("\n") +
          `\nRun it from one of those directories, or pass --install=<path>.`,
      );
    } else {
      console.error(`xenomoon ${verb}: ${r.how}`);
    }
    process.exit(1);
  }
  // Always announce: an unannounced wrong-install run is what made this failure invisible before.
  console.error(`xenomoon ${verb} → ${r.root}  (${r.how})`);
  return r.root;
}

const ROOT = ROOT_VERBS.includes(verb ?? "") ? targetRoot() : OWN_ROOT;

/** @param {string} script @param {string[]} [args] */
const run = (script, args = []) =>
  execFileSync("npm", ["run", script, "--", ...args], { cwd: ROOT, stdio: "inherit" });

switch (verb) {
  case "install":
  case undefined: // bare `npx github:arthur0n/xenomoon` = install
    execFileSync("node", [path.join(here, "bootstrap.js"), ...rest], { stdio: "inherit" });
    break;
  case "doctor":
    run("doctor", rest);
    break;
  case "start":
    run(rest.length ? "start-project" : "start", rest);
    break;
  case "up":
    execFileSync("bash", [path.join(ROOT, "start_server"), ...rest], {
      cwd: ROOT,
      stdio: "inherit",
    });
    break;
  case "stop":
    execFileSync("bash", [path.join(ROOT, "stop_server")], { cwd: ROOT, stdio: "inherit" });
    break;
  case "restart":
    // stop_server exits non-zero when nothing was running — a restart shouldn't care.
    try {
      execFileSync("bash", [path.join(ROOT, "stop_server")], { cwd: ROOT, stdio: "inherit" });
    } catch {
      /* nothing to stop */
    }
    execFileSync("bash", [path.join(ROOT, "start_server"), ...rest], {
      cwd: ROOT,
      stdio: "inherit",
    });
    break;
  case "update":
    // An installed clone is LEGITIMATELY dirty: the domain pack was copied over plugin/ at
    // install (README/hooks overlays), and learnings accumulate locally. --autostash parks
    // those changes around the pull and re-applies them (a pop conflict keeps the stash and
    // says so). Then the pack overlay is RE-APPLIED from the (possibly updated) domains/
    // tree — pack-owned files come back canonical even if the pop conflicted on them.
    execFileSync("git", ["pull", "--ff-only", "--autostash"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("npm", ["ci"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("node", [path.join(here, "install-capabilities.js")], {
      cwd: ROOT,
      stdio: "inherit",
    });
    break;
  case "promote":
    run("promote", ["--pending", ...rest]);
    break;
  case "list": {
    // The diagnostic that makes the shared global bin legible: what exists, what each install
    // drives, and which one happens to own `xenomoon` right now (ownership is irrelevant to
    // resolution — it is shown so a surprising `which xenomoon` stops being a mystery).
    const installs = Object.entries(readRegistry());
    if (!installs.length) {
      console.log(`No installs registered yet — they register on \`xenomoon install\`.`);
      break;
    }
    for (const [install, project] of installs) {
      const owns = path.resolve(install) === path.resolve(OWN_ROOT) ? "  ← owns `xenomoon`" : "";
      console.log(`${install}${project ? `  → ${project}` : "  (no project bound)"}${owns}`);
    }
    break;
  }
  default:
    console.error(
      `xenomoon: unknown verb "${verb}"\n` +
        `  install | doctor | start [profile] | up | stop | restart | update | promote | list\n` +
        `  any verb: --install=<path> to name the target install explicitly`,
    );
    process.exit(1);
}

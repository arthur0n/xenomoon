#!/usr/bin/env node
// The `xenomoon` CLI — real verbs instead of npm-run magic words. This file is the package
// `bin`: reachable via `npx github:arthur0n/xenomoon <verb>` on a fresh machine (only
// `install` makes sense there) and as a plain `xenomoon <verb>` once an install has been
// npm-linked. Every verb is a thin dispatcher onto the framework's own scripts, resolved
// relative to THIS file — so a linked CLI always drives the install it belongs to.
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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const ROOT = path.join(here, "..", "..", "..");
const [verb, ...rest] = process.argv.slice(2);

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
  default:
    console.error(
      `xenomoon: unknown verb "${verb}"\n` +
        `  install | doctor | start [profile] | up | stop | restart | update | promote`,
    );
    process.exit(1);
}

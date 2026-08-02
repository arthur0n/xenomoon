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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

/** Nearest ancestor of `from` that is a framework install (a package.json naming this package),
 * or null when you are outside one. @param {string} from @returns {string|null} */
function findInstallRoot(from) {
  for (let dir = path.resolve(from); ; ) {
    const pkg = path.join(dir, "package.json");
    try {
      if (existsSync(pkg)) {
        const meta = /** @type {{ name?: string }} */ (parseJSON(readFileSync(pkg, "utf8")));
        if (meta.name === "xenomoon-forge") return dir;
      }
    } catch {
      /* unreadable or not JSON — keep walking up */
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const OWN_ROOT = path.join(here, "..", "..", ".."); // the install this linked CLI ships inside
// The install a verb acts on: the one you're STANDING IN, else the one this CLI belongs to.
// `npm link` owns a single global `xenomoon` bin name, so with more than one install on the
// machine the most recent `xenomoon install` silently wins it — and a file-relative root then
// made every verb drive that winner from every directory (`xenomoon update` run inside install A
// would pull install B). cwd-first restores "the verb means the install I'm in"; the fallback
// keeps a bare `npx github:arthur0n/xenomoon` working from anywhere.
const ROOT = findInstallRoot(process.cwd()) ?? OWN_ROOT;
const [verb, ...rest] = process.argv.slice(2);

// Announce the target for every verb that mutates or serves an install — the silent wrong-install
// run is the failure this is guarding, so it has to be visible without asking for it. stderr, to
// keep stdout clean for anything parsing a verb's output.
if (["doctor", "start", "up", "stop", "restart", "update", "promote"].includes(verb ?? "")) {
  const how = ROOT === OWN_ROOT ? "linked CLI — cwd is not inside an install" : "cwd install";
  console.error(`xenomoon ${verb} → ${ROOT}  (${how})`);
}

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

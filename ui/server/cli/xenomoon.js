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
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry, resolveInstall } from "./install-registry.js";
import { shq } from "../../lib/shell.js";

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
  case "restart": {
    // stop_server exits 0 when nothing was running, so ANY failure here means the stop did not
    // complete — and starting on top of a server that could not be stopped is how an unstoppable
    // orphan gets a sibling. This used to swallow every non-zero status on the (since falsified)
    // premise that non-zero just meant "nothing to stop".
    try {
      execFileSync("bash", [path.join(ROOT, "stop_server")], { cwd: ROOT, stdio: "inherit" });
    } catch (err) {
      const status = /** @type {{ status?: number }} */ (err).status ?? 1;
      console.error(
        status === 3
          ? "restart: not starting — stop could not confirm the port is free (see above)."
          : `restart: not starting — stop failed (exit ${status}).`,
      );
      process.exit(status);
    }
    execFileSync("bash", [path.join(ROOT, "start_server"), ...rest], {
      cwd: ROOT,
      stdio: "inherit",
    });
    break;
  }
  case "update": {
    // ROOT's own copy, not `here`. install-capabilities resolves the framework it operates on from
    // its OWN file location and ignores cwd, so running the CLI's copy re-applied the overlay in
    // whichever install this linked `xenomoon` happens to live in — while the install named by
    // --install got the pull and no overlay. It is also the copy the pull is about to update, so an
    // update runs the NEW installer rather than the one shipped beside the CLI.
    const installer = path.join(ROOT, "ui", "server", "cli", "install-capabilities.js");
    // Checked BEFORE anything mutates. The overlay is not an optional last step — an install with
    // updated code and stale pack files is the mismatch this verb exists to repair — so a target
    // that cannot receive one must be refused while it is still untouched.
    if (!existsSync(installer)) {
      console.error(
        `xenomoon update: ${ROOT} does not look like a xenomoon install — no ui/server/cli/install-capabilities.js.\n` +
          `  Nothing was changed. Check the path, or run \`xenomoon list\` to see the registered installs.`,
      );
      process.exit(1);
    }
    // An installed clone is LEGITIMATELY dirty: the domain pack was copied over plugin/ at
    // install (README/hooks overlays), and learnings accumulate locally. --autostash parks
    // those changes around the pull and re-applies them (a pop conflict keeps the stash and
    // says so). Then the pack overlay is RE-APPLIED from the (possibly updated) domains/
    // tree — pack-owned files come back canonical even if the pop conflicted on them.
    execFileSync("git", ["pull", "--ff-only", "--autostash"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("npm", ["ci"], { cwd: ROOT, stdio: "inherit" });
    // Say exactly what state the install is in. "Update failed" after a successful pull and npm ci
    // reads as "nothing happened", and a half-updated install — new code, stale pack files — is the
    // one outcome nobody would go looking for.
    //
    // The two ways this fails need DIFFERENT recovery, which is why they are not one branch: when
    // the installer merely failed, running it again is the fix; when the pull took the file away,
    // pointing at it would hand out a command that cannot run, and re-running update would refuse at
    // the preflight for the very same reason.
    if (!existsSync(installer)) {
      console.error(
        `xenomoon update: ${ROOT} was pulled and its dependencies installed, but ui/server/cli/install-capabilities.js is GONE from the tree after the pull — the pack overlay could NOT be applied.\n` +
          `  The install has NEW framework code and STALE pack files, and re-running update will refuse for the same reason.\n` +
          `  Find a revision that still carries it:\n` +
          `    git -C ${shq(ROOT)} log --oneline -- ui/server/cli/install-capabilities.js\n` +
          `  or reinstall the framework beside your project: xenomoon install`,
      );
      process.exit(1);
    }
    try {
      execFileSync("node", [installer], { cwd: ROOT, stdio: "inherit" });
    } catch {
      console.error(
        `xenomoon update: ${ROOT} was pulled and its dependencies installed, but re-applying the pack overlay FAILED.\n` +
          `  The install has NEW framework code and STALE pack files. Re-run \`xenomoon update --install=${shq(ROOT)}\`, or apply the overlay directly:\n` +
          `    node ${shq(installer)}`,
      );
      process.exit(1);
    }
    break;
  }
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

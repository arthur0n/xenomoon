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
//   xenomoon start [profile]  serve the UI (bound project, or a named profile)
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
  case "update":
    execFileSync("git", ["pull", "--ff-only"], { cwd: ROOT, stdio: "inherit" });
    execFileSync("npm", ["ci"], { cwd: ROOT, stdio: "inherit" });
    break;
  case "promote":
    run("promote", ["--pending", ...rest]);
    break;
  default:
    console.error(
      `xenomoon: unknown verb "${verb}"\n` +
        `  install | doctor | start [profile] | update | promote`,
    );
    process.exit(1);
}

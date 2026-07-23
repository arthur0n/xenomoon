#!/usr/bin/env node
// Step-ZERO installer — the only command a fresh machine needs:
//
//   npx github:arthur0n/xenomoon
//
// npm fetches this repo into its cache just to run THIS file, which then creates the real,
// durable install: ask where (default ~/xenomoon), git-clone the framework there (or download
// the tarball when git is absent), npm ci, and hand straight off to the `forge new`
// questionnaire (folder → domain → port → integrations → /onboard). The npx cache copy is
// disposable; the clone is the install — updates are `git pull` (or re-download), learnings
// live in its domains/. Deliberately dependency-free and config.js-free (nothing is bound yet).
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";

const REPO = "https://github.com/arthur0n/xenomoon.git";
const TARBALL = "https://codeload.github.com/arthur0n/xenomoon/tar.gz/refs/heads/main";

/** Is `child` inside `parent` (or equal)? @param {string} parent @param {string} child */
function contains(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** @param {string} cmd @returns {boolean} */
function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const interactive = process.stdin.isTTY && process.stdout.isTTY;
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

console.log("Xenomoon — domain-focused agent framework (fork of Xenodot Forge)\n");

// 1. THE PROJECT COMES FIRST: you run this FROM your project folder — cwd IS the project.
//    (`cd myapp && npx github:arthur0n/xenomoon`.) Confirm it rather than ask for a path.
const cwd = process.cwd();
let project = cwd;
if (rl) {
  const a = (await rl.question(`Set up THIS folder as the project — ${cwd}? [Y/n] `))
    .trim()
    .toLowerCase();
  if (a === "n" || a === "no") {
    project = path.resolve((await rl.question("Project folder (absolute path): ")).trim() || cwd);
  }
}

// 2. Where the framework itself lives — a PER-PROJECT sibling by default (`<project>-xm`),
//    so each project's install (and its learnings) stays its own; a shared install is a
//    deliberate typed choice, never the default.
const defaultDir = path.join(path.dirname(project), `${path.basename(project)}-xm`);
let dest = process.argv[2] ?? null;
if (!dest && rl)
  dest = (await rl.question(`Framework install location [${defaultDir}]: `)).trim() || null;
// A RELATIVE answer resolves against the project's PARENT (sibling-shaped), never against
// cwd — cwd IS the project, and relative-to-cwd would aim inside it (then be refused).
dest = dest
  ? path.isAbsolute(dest)
    ? path.resolve(dest)
    : path.resolve(path.dirname(project), dest)
  : defaultDir;
if (contains(dest, project) || contains(project, dest)) {
  console.error(`✗ the framework (${dest}) and the project (${project}) must not nest.`);
  process.exit(1);
}

if (existsSync(dest) && readdirSync(dest).length > 0) {
  if (existsSync(path.join(dest, "package.json"))) {
    console.log(`Found an existing install at ${dest} — reusing it.`);
  } else {
    console.error(`✗ ${dest} exists and is not empty (and not a xenomoon install). Pick another.`);
    process.exit(1);
  }
} else {
  // 2. Fetch the framework: git when available (updates = git pull), tarball otherwise.
  mkdirSync(dest, { recursive: true });
  if (has("git")) {
    console.log(`Cloning into ${dest} …`);
    execFileSync("git", ["clone", "--depth", "1", REPO, dest], { stdio: "inherit" });
  } else {
    console.log(`git not found — downloading a snapshot into ${dest} …`);
    execSync(`curl -fsSL ${TARBALL} | tar -xz --strip-components=1 -C "${dest}"`, {
      stdio: "inherit",
    });
  }
}

// 3. Dependencies.
console.log("Installing dependencies (npm ci) …");
execFileSync("npm", ["ci"], { cwd: dest, stdio: "inherit" });

rl?.close();

// 4. Hand off to the questionnaire with the project already known — it asks the rest
//    (domain → port → integrations → the terminal-Claude-Code /onboard interview → npm start).
console.log(`\nFramework installed. Setting up ${project} …\n`);
// Global CLI: link the `xenomoon` bin so real verbs work everywhere (best-effort).
try {
  execFileSync("npm", ["link"], { cwd: dest, stdio: "ignore" });
  console.log("Linked the `xenomoon` CLI (install | doctor | start | update | promote).");
} catch {
  console.warn("Could not npm-link the CLI — use `npm run <script>` inside the install instead.");
}
execFileSync("npm", ["run", "install-project", "--", project], { cwd: dest, stdio: "inherit" });

#!/usr/bin/env node
// Step-zero installer — run it INSIDE the folder where you want everything to live
// (your workspace):
//
//   cd workspace/
//   npx github:arthur0n/xenomoon
//
// It explains itself, then asks two plain questions — your project folder, and the
// framework folder — BOTH inside the current directory (relative answers resolve here;
// nothing is ever created outside it unless you type an absolute path yourself). Then it
// clones the framework there, installs deps, links the `xenomoon` CLI, and hands off to
// the install questionnaire (domain → port → integrations → /onboard).
// Deliberately dependency-free and config.js-free (nothing is bound yet).
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";

const REPO = "https://github.com/arthur0n/xenomoon.git";
const TARBALL = "https://codeload.github.com/arthur0n/xenomoon/tar.gz/refs/heads/main";

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
if (!interactive) {
  console.error(
    "xenomoon install is interactive — run it in a terminal, inside the folder where you " +
      "want the framework to live.",
  );
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const cwd = process.cwd();

console.log(`Xenomoon — domain-focused agent framework (fork of Xenodot Forge)

This installs the framework into its own folder INSIDE the current directory
(${cwd}),
and binds it to your project. Your project is never modified (one .gitignore line
only); the framework folder holds everything it learns about your project.
`);

// 1. The project — you say where it is. Relative answers resolve INSIDE this directory.
const projectAnswer = (await rl.question("Project folder (your app): ")).trim();
if (!projectAnswer) {
  console.error("✗ a project folder is required.");
  process.exit(1);
}
const project = path.resolve(cwd, projectAnswer);
if (!existsSync(project)) {
  console.error(`✗ ${project} does not exist.`);
  process.exit(1);
}

// 2. The framework folder — default: next to the project, inside this directory.
const defaultName = `${path.basename(project)}-xm`;
const destAnswer = (await rl.question(`Framework folder [${defaultName}]: `)).trim();
const dest = path.resolve(cwd, destAnswer || defaultName);

if (existsSync(dest) && readdirSync(dest).length > 0) {
  if (existsSync(path.join(dest, "package.json"))) {
    console.log(`Found an existing install at ${dest} — reusing it.`);
  } else {
    console.error(`✗ ${dest} exists and is not empty (and not a xenomoon install). Pick another.`);
    process.exit(1);
  }
} else {
  // 3. Fetch the framework: git when available (updates = git pull), tarball otherwise.
  mkdirSync(dest, { recursive: true });
  // Hard timeouts + one retry: a stalled connection must never wedge the install.
  const fetchOnce = () => {
    if (has("git")) {
      console.log(`Cloning into ${dest} …`);
      execFileSync("git", ["clone", "--depth", "1", REPO, dest], {
        stdio: "inherit",
        timeout: 180_000,
      });
    } else {
      console.log(`git not found — downloading a snapshot into ${dest} …`);
      execSync(`curl -fsSL --max-time 180 ${TARBALL} | tar -xz --strip-components=1 -C "${dest}"`, {
        stdio: "inherit",
      });
    }
  };
  try {
    fetchOnce();
  } catch {
    console.warn("Fetch stalled/failed — clearing and retrying once …");
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    fetchOnce(); // a second failure throws loudly — network is genuinely down
  }
}

// 4. Dependencies + the global CLI (best-effort — real verbs instead of npm-run words).
console.log("Installing dependencies (npm ci) …");
execFileSync("npm", ["ci"], { cwd: dest, stdio: "inherit" });
try {
  execFileSync("npm", ["link"], { cwd: dest, stdio: "ignore" });
  console.log("Linked the `xenomoon` CLI (install | doctor | start | update | promote).");
} catch {
  console.warn("Could not npm-link the CLI — use `npm run <script>` inside the install instead.");
}

rl.close();

// 5. Hand off to the questionnaire with the project already known — it asks the rest
//    (domain → port → integrations → the terminal-Claude-Code /onboard interview).
console.log(`\nFramework installed at ${dest}. Setting up ${project} …\n`);
execFileSync("npm", ["run", "install-project", "--", project], { cwd: dest, stdio: "inherit" });

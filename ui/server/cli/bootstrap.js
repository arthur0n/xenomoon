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
import os from "node:os";

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
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

console.log("Xenomoon — domain-focused agent framework (fork of Xenodot Forge)\n");

// 1. Where does the install live? One install can serve the machine; per-project installs are
//    equally fine — it's just a folder.
const defaultDir = path.join(os.homedir(), "xenomoon");
let dest = process.argv[2] ?? null;
if (!dest && rl) dest = (await rl.question(`Install location [${defaultDir}]: `)).trim() || null;
dest = path.resolve(dest ?? defaultDir);

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

// 4. Hand off to the questionnaire — the rest of onboarding lives there (folder → domain →
//    port → integrations → the terminal-Claude-Code /onboard interview → npm start).
console.log("\nFramework installed. Continuing into project setup …\n");
execFileSync("npm", ["run", "new"], { cwd: dest, stdio: "inherit" });

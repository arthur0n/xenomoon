#!/usr/bin/env node
// Step-zero installer — run it INSIDE the folder where you want everything to live
// (your workspace):
//
//   cd workspace/
//   npx github:arthur0n/xenomoon [<project>] [--domain=<name>] [--name=…] [--port=…]
//
// One framework install per domain; a project is a profile of that install (#65). So it first
// asks for your project folder (unless given), then decides with bootstrap-target.js: when an
// install of the domain is registered on this machine it adds the project to THAT install (no
// clone); when none is, it clones ONE install named `<domain>-xm` in the current directory,
// installs deps, links the `xenomoon` CLI; then it hands off to the install questionnaire
// (port → integrations → /onboard). --install=<path> (or XENOMOON_INSTALL) names the install to
// use. With no --domain and no single registered install to fall back on, a terminal is asked
// for the domain (new.js's picklist) and the answer is forwarded so install-project does not ask.
// Deliberately dependency-free and config.js-free (nothing is bound yet).
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foreignBins, conflictReport } from "./link-conflicts.js";
import { readRegistry } from "./install-registry.js";
import { pickList } from "./picklist.js";
import { availableDomains, resolvePackDir } from "../core/domain-resolver.js";
import {
  bootstrapTarget,
  describeFolder,
  describeInstalls,
  explicitTarget,
  installFolder,
  parseBootstrapArgs,
} from "./bootstrap-target.js";
import { domainPickItems } from "./domain-pick-rows.js";

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

const { projectArg, domainArg, forwarded, ...parsed } = parseBootstrapArgs(process.argv.slice(2));
// xenomoon.js passes the install verb's --install= (or XENOMOON_INSTALL) through as --install=.
const installArg = parsed.installArg ?? process.env.XENOMOON_INSTALL ?? null;

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
if (!interactive && !projectArg) {
  console.error(
    "xenomoon install is interactive — run it in a terminal, inside the folder where you " +
      "want the framework to live (or pass the project folder as its first argument).",
  );
  process.exit(1);
}
const rl = interactive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;
const cwd = process.cwd();
const OWN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

console.log(`Xenomoon — domain-focused agent framework (fork of Xenodot Forge)

One framework install per domain, INSIDE the current directory
(${cwd}).
A project is added to its domain's install; your project is never modified (one .gitignore
line only); the install holds everything it learns about your projects.
`);

// 1. The project — you say where it is. Relative answers resolve INSIDE this directory.
const projectAnswer = (
  projectArg ??
  (await rl?.question("Project folder (your app): ")) ??
  ""
).trim();
if (!projectAnswer) {
  console.error("✗ a project folder is required.");
  process.exit(1);
}
const project = path.resolve(cwd, projectAnswer);
if (!existsSync(project)) {
  console.error(`✗ ${project} does not exist.`);
  process.exit(1);
}

// 2. The install — the domain's registered one, else ONE new install named after the domain.
//    The domain is compared under the pack's current name, as install-project stores it.
const known = availableDomains(OWN_ROOT);
/** @param {string | null} name @returns {string | null} */
const canonical = (name) => {
  if (!name) return null;
  try {
    return resolvePackDir(name, OWN_ROOT);
  } catch {
    return name;
  }
};
/** @param {string | null} domain @returns {import("./bootstrap-target.js").Target} */
const decide = (domain) => {
  if (installArg) {
    const dir = path.resolve(cwd, installArg);
    return explicitTarget(dir, describeFolder(dir), domain);
  }
  const folder = domain ? installFolder(cwd, domain) : cwd;
  return bootstrapTarget({
    domain,
    installs: describeInstalls(Object.keys(readRegistry())),
    project,
    folder,
    existing: () => describeFolder(folder), // read only on the create path
    known,
    interactive,
  });
};
let domain = canonical(domainArg);
let target = decide(domain);
if ("ask" in target && rl) {
  // The domain names the install, so it is asked HERE (new.js's picklist, this package's packs)
  // and forwarded — install-project then finds it given and does not ask again.
  const { items, detected } = domainPickItems(OWN_ROOT, project, target.options);
  const picked = await pickList(rl, {
    title: "Domain for this project — the capability pack its install carries.",
    items,
    note: detected
      ? [`Detected ${detected.id} from ${detected.why}.`]
      : ["Nothing in the project decided it — pick the one that matches your stack."],
    label: "Domain",
  });
  if (!picked.id) {
    console.error(
      `✗ pick 1-${items.length} or a name (${items.map((d) => d.id).join(", ")}) — got "${picked.answer.trim()}".`,
    );
    process.exit(1);
  }
  domain = canonical(picked.id);
  forwarded.push(`--domain=${picked.id}`);
  target = decide(domain);
}
if ("ask" in target) {
  console.error("✗ the domain is needed and could not be asked.");
  process.exit(1);
}
if ("refuse" in target) {
  for (const line of target.refuse) console.error(line);
  process.exit(1);
}
/** @param {string} dir */
const installProject = (dir) =>
  execFileSync("npm", ["run", "install-project", "--", project, ...forwarded], {
    cwd: dir,
    stdio: "inherit",
  });
if ("use" in target) {
  rl?.close();
  console.log(
    `Adding ${project} to the install at ${target.use} (one install per domain — no clone).\n`,
  );
  installProject(target.use);
  process.exit(0);
}
const dest = target.create;

if (target.reuse) {
  console.log(`Found an existing install at ${dest} — reusing it.`);
} else {
  // 3. Fetch the framework: git when available (updates = git pull), tarball otherwise.
  console.log(`No "${domain}" install is registered — creating it at ${dest}.`);
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

/** The install that currently owns the global `xenomoon` bin, or null when nothing does.
 * @returns {string|null} */
function globalLinkTarget() {
  try {
    const bin = execSync("command -v xenomoon", { encoding: "utf8" }).trim();
    // …/bin/xenomoon → (symlink) …/<install>/ui/server/cli/xenomoon.js → the install root
    return bin ? path.resolve(path.dirname(realpathSync(bin)), "..", "..", "..") : null;
  } catch {
    return null;
  }
}

// 4. Dependencies + the global CLI (best-effort — real verbs instead of npm-run words).
console.log("Installing dependencies (npm ci) …");
execFileSync("npm", ["ci"], { cwd: dest, stdio: "inherit" });
// There is exactly ONE global `xenomoon` bin name, so linking here takes it from any earlier
// install. That's fine — verbs resolve cwd-first — but it must never happen silently: an
// unannounced steal is what made `xenomoon update` appear to update the wrong project.
const priorLink = globalLinkTarget();
try {
  execFileSync("npm", ["link"], { cwd: dest, stdio: ["ignore", "ignore", "pipe"] });
  console.log("Linked the `xenomoon` CLI (install | doctor | start | update | promote).");
  if (priorLink && path.resolve(priorLink) !== path.resolve(dest)) {
    console.warn(
      `Note: the global \`xenomoon\` CLI previously pointed at\n` +
        `        ${priorLink}\n` +
        `      and now points here. Both installs still work — verbs act on the install you run\n` +
        `      them from, and each run prints the install it resolved to.`,
    );
  }
} catch (err) {
  const conflicts = foreignBins(dest);
  if (conflicts.length > 0) {
    for (const line of conflictReport(conflicts)) console.warn(line);
  } else {
    const raw = /** @type {{ stderr?: Buffer | string }} */ (err).stderr;
    const stderr = (typeof raw === "string" ? raw : (raw?.toString("utf8") ?? "")).trim();
    const why = stderr.split("\n").filter(Boolean).slice(-2).join("\n        ");
    console.warn(`Could not npm-link the CLI${why ? `:\n        ${why}` : "."}`);
  }
  console.warn("      The install itself is fine — use `npm run <script>` inside it meanwhile.");
}

rl?.close();

// 5. Hand off to the questionnaire with the project already known — it asks the rest
//    (port → integrations → the terminal-Claude-Code /onboard interview).
console.log(`\nFramework installed at ${dest}. Setting up ${project} …\n`);
installProject(dest);

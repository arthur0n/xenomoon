// Install-collision gate — a domain pack must never CLOBBER a trunk-tracked file.
//
// `forge new --domain X` copies the pack's capability tree INTO plugin/ (install-capabilities.js).
// Any pack file whose install target is a git-TRACKED path silently overwrites CORE content, and
// the local edit then rides every later `git pull --ff-only --autostash` as a stash/pop hazard.
// This bit twice for real: a trunk-tracked `library/sources/skill-sources.md` broke `xenomoon
// update` in every bound clone, and webapp's `library/README.md` quietly replaced the CORE library
// README (found 2026-08-15 by this check's first run).
//
// It models the REAL install surface, not a naive file walk — the two disagree, and the naive
// version reports phantom collisions:
//   - CAP_SUBDIRS (agents/skills/library) are copied WHOLESALE          -> collision if tracked
//   - hooks/*.sh are copied file-by-file                                 -> collision if tracked
//   - hooks.json is MERGED, never copied (mergeHooks)                    -> sanctioned, see below
//   - .claude-plugin/, templates/ are NOT installed at all               -> never a collision
//
// Bare-node, no deps; wired into `npm run validate`. Mirrors gen-skill-scope.js.
//   node ui/server/cli/check-install-paths.js
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRAMEWORK_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const DOMAINS_DIR = path.join(FRAMEWORK_DIR, "domains");

// Must mirror install-capabilities.js CAP_SUBDIRS.
const CAP_SUBDIRS = ["agents", "skills", "library"];

// Commands are not an install surface any more, and a pack that still ships them must FAIL rather
// than have them quietly dropped: the files would look installed to their author, the slash surface
// would silently not exist, and nothing would say why. Refusing is the only honest answer.
const FORBIDDEN_SUBDIRS = ["commands"];

// Paths a pack may legitimately write even though CORE tracks them, because the installer MERGES
// rather than overwrites. Keep this list tiny and justified — each entry is a file whose CORE
// content survives an install.
const SANCTIONED_MERGE = new Set(["plugin/hooks/hooks.json"]);

/** Mirrors install-capabilities.js UNSAFE_NAME — names that cannot be declared as install output
 * without changing what the manifest matches. */
const UNSAFE_NAME = /[\n\r\0*?[\]!#\\]|^\s|\s$/;

/** Every file under `dir`, relative to it. @param {string} dir @returns {string[]} */
function filesUnder(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d, /** @type {string} */ rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else out.push(r);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

/** plugin-relative install targets for one pack. @param {string} packPlugin @returns {string[]} */
function installTargets(packPlugin) {
  /** @type {string[]} */
  const targets = [];
  for (const sub of CAP_SUBDIRS)
    for (const rel of filesUnder(path.join(packPlugin, sub))) targets.push(`${sub}/${rel}`);
  // Hook SCRIPTS are copied; hooks.json is merged (still listed so the allowlist is explicit).
  for (const rel of filesUnder(path.join(packPlugin, "hooks"))) targets.push(`hooks/${rel}`);
  return targets;
}

const tracked = new Set(
  execFileSync("git", ["ls-files", "plugin"], { cwd: FRAMEWORK_DIR, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);

// A RENAMED pack must claim its old name. A bound clone bakes the pack NAME into .xenomoon.json,
// so renaming the directory leaves every such clone dying at loadDomain — before it can update to
// a fix. `formerNames` is the migration; git already knows the rename happened, so this makes
// forgetting it a gate failure rather than a silent trap discovered months later (it was: the
// expo→expoapp rename in 85bc04b bricked `xenomoon update` in this install until 2026-08-19).
/** @type {string[]} */
const unclaimedRenames = [];
{
  const log = execFileSync(
    "git",
    [
      "log",
      "--diff-filter=R",
      "--find-renames",
      "--name-status",
      "--format=",
      "--",
      "domains/*/domain.json",
    ],
    { cwd: FRAMEWORK_DIR, encoding: "utf8" },
  );
  const packOf = (/** @type {string} */ p) => p.split("/")[1] ?? "";
  for (const line of log.split("\n")) {
    const [status, from, to] = line.split("\t");
    if (!status?.startsWith("R") || !from || !to) continue;
    const [oldName, newName] = [packOf(from), packOf(to)];
    // Only the CURRENT pack matters: an old name re-created as its own pack, or a pack since
    // deleted, is not a migration this gate can or should speak for.
    if (!oldName || !newName || oldName === newName) continue;
    const file = path.join(DOMAINS_DIR, newName, "domain.json");
    if (!existsSync(file) || existsSync(path.join(DOMAINS_DIR, oldName, "domain.json"))) continue;
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue; // malformed pack — loadDomain reports that
    }
    const former = /** @type {{ formerNames?: unknown }} */ (parsed)?.formerNames;
    if (!Array.isArray(former) || !former.includes(oldName))
      unclaimedRenames.push(`    "${oldName}" → "${newName}"`);
  }
}

if (unclaimedRenames.length) {
  console.error(
    `✗ install-paths: ${unclaimedRenames.length} pack rename(s) with no migration declared:`,
  );
  for (const r of unclaimedRenames) console.error(r);
  console.error(
    "  Every clone installed under the OLD name bakes it into .xenomoon.json and now dies at\n" +
      "  loadDomain — it cannot even update to receive a fix. Add the old name to the new pack's\n" +
      '  `formerNames` in its domain.json (e.g. "formerNames": ["<old>"]) so those clones migrate\n' +
      "  themselves on the next update.",
  );
  process.exit(1);
}

/** @type {string[]} */
const collisions = [];
/** Packs shipping a capability class that is no longer installable. @type {string[]} */
const forbiddenDirs = [];
/** A pack shipping ignore semantics — see the check below. @type {string[]} */
const ignoreFiles = [];
if (existsSync(DOMAINS_DIR))
  for (const d of readdirSync(DOMAINS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const packPlugin = path.join(DOMAINS_DIR, d.name, "plugin");
    if (!existsSync(packPlugin)) continue;
    // A pack shipping a forbidden capability class is REFUSED, not silently dropped. `commands/`
    // stopped being an install surface when the framework's own were re-homed into skills — but a
    // pack that still ships them would look installed to its author while the files went nowhere,
    // with nothing anywhere saying why.
    for (const forbidden of FORBIDDEN_SUBDIRS)
      if (existsSync(path.join(packPlugin, forbidden)))
        forbiddenDirs.push(`    domains/${d.name}/plugin/${forbidden}/`);
    for (const rel of installTargets(packPlugin)) {
      // A pack may not ship a `.gitignore`. Copied into `plugin/`, it becomes LIVE git config for
      // that subtree, able to hide framework files that are not install output at all — the exact
      // inverse of the install manifest's purpose. The installer throws on this; catching it here
      // tells the pack AUTHOR at `npm run validate` time instead of at someone's install.
      if (path.basename(rel) === ".gitignore") {
        ignoreFiles.push(`    domains/${d.name}/plugin/${rel}  (ships ignore semantics)`);
        continue;
      }
      // A path segment carrying gitignore syntax would become an extra RULE in the generated
      // install manifest (a newline splits an entry, `*` matches siblings, `!` re-includes), so
      // install output could hide framework files it never wrote. The installer preflights the
      // same condition; this tells the pack author first.
      if (rel.split("/").some((seg) => UNSAFE_NAME.test(seg))) {
        ignoreFiles.push(`    domains/${d.name}/plugin/${rel}  (unsafe name)`);
        continue;
      }
      const target = `plugin/${rel}`;
      if (!tracked.has(target) || SANCTIONED_MERGE.has(target)) continue;
      collisions.push(
        `    domains/${d.name}/plugin/${rel}\n      installs over TRACKED ${target} — CORE content is lost on \`forge new --domain ${d.name}\``,
      );
    }
  }

if (ignoreFiles.length) {
  console.error(`✗ install-paths: ${ignoreFiles.length} pack file(s) cannot be safely installed:`);
  for (const f of ignoreFiles) console.error(f);
  console.error(
    "  A pack must not carry a .gitignore (installed into plugin/ it is live git config for that\n" +
      "  subtree), nor a filename containing gitignore syntax or control characters (it would become\n" +
      "  an extra rule in the generated manifest). Both let install output hide framework files it\n" +
      "  never wrote. Ignore rules for that tree belong to the framework — the generated\n" +
      "  plugin/.gitignore manifest is the only one.",
  );
  process.exit(1);
}

if (forbiddenDirs.length) {
  console.error(
    `✗ install-paths: ${forbiddenDirs.length} pack(s) ship a directory that is not installable:`,
  );
  for (const f of forbiddenDirs) console.error(f);
  console.error(
    "  `commands/` is not an install surface: a stage's method lives in its skill, its routing in\n" +
      "  the spine, and its dispatch in an orchestrator skill. Move the content there and delete the\n" +
      "  directory — leaving it would ship files that silently go nowhere.",
  );
  process.exit(1);
}

if (collisions.length) {
  console.error(`✗ install-paths: ${collisions.length} pack file(s) would clobber tracked CORE:`);
  for (const c of collisions) console.error(c);
  console.error(
    "  Fix: drop the pack's copy (CORE owns the path), rename it to a pack-specific name, or —\n" +
      "  if the installer genuinely MERGES it — add the path to SANCTIONED_MERGE with a reason.",
  );
  process.exit(1);
}
console.log(
  `ok  install-paths: no pack clobbers tracked CORE${SANCTIONED_MERGE.size ? ` (${SANCTIONED_MERGE.size} sanctioned merge target)` : ""}.`,
);

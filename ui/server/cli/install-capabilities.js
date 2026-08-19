// install-capabilities — the DOMAIN PICKER's one job. A domain is an install-time selector: it
// chooses which agents/skills/commands/hooks/orchestrator get installed into the framework's single
// capability tree (`plugin/`). This copies the picked pack's capabilities INTO `plugin/` and bakes the
// pack's runtime settings into the framework config, after which there is no "domain" at runtime — it
// is just the framework, one tree. Nothing under `domains/` is read once the framework is running.
//
// Idempotent + repairable: safe to re-run on an already-installed clone (it re-copies and re-bakes).
// Runs against the FRAMEWORK clone (frameworkDir), never the bound project — the project stays pure.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJSON } from "../../lib/json.js";
import {
  loadDomain,
  resolvePackDir,
  readProjectLock,
  writeProjectLock,
  PROJECT_LOCK_FILE,
} from "../core/domain-resolver.js";
import { writeInstallOutput } from "../core/install-output.js";
import { ensureDomainLibrary } from "../features/promotions/ensure-library.js";

/** Capability subdirs copied from the pack's plugin into the framework plugin. `.claude-plugin/`
 * (the pack's own manifest) is deliberately NOT copied — the base `plugin/.claude-plugin/plugin.json`
 * stays the single manifest. `hooks/` is handled separately (scripts copied + hooks.json merged).
 * @type {string[]} */
const CAP_SUBDIRS = ["agents", "skills", "commands", "library"];

/** Filenames that cannot be declared as install output without changing what the manifest matches:
 * gitignore metacharacters, control characters, or leading/trailing whitespace. */
const UNSAFE_NAME = /[\n\r\0*?[\]!#\\]|^\s|\s$/;

/** Recursively copy srcDir → dstDir, overwriting on every run (the pack is the source of truth for
 * what it installs). Executable `.sh` scripts keep their bit. Every destination file is pushed to
 * `written` so the installer can DECLARE its own output (see core/install-output.js).
 * @param {string} srcDir @param {string} dstDir @param {string[]} written */
function copyTree(srcDir, dstDir, written) {
  mkdirSync(dstDir, { recursive: true });
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name);
    const d = path.join(dstDir, e.name);
    if (e.isDirectory()) copyTree(s, d, written);
    else if (e.isFile()) {
      copyFileSync(s, d);
      if (e.name.endsWith(".sh")) chmodSync(d, 0o755);
      written.push(d);
    }
  }
}

/** Refuse the install BEFORE any write when the pack ships ignore semantics.
 *
 * A pack may not carry a `.gitignore`: copied into `plugin/`, it is LIVE git configuration for that
 * subtree, able to hide framework files that are not install output at all — the inverse of what
 * the install manifest is for. Ignore rules for that tree belong to the framework, and the only one
 * is the generated manifest at its root. `check-install-paths.js` reports the same condition at
 * `npm run validate` time so a pack author hears it first; this is the runtime backstop, and it
 * runs as a PREFLIGHT so a rejected pack leaves `plugin/` untouched rather than half-overlaid.
 * @param {string} packDir @param {string} domainName */
function preflightPack(packDir, domainName) {
  /** @type {string[]} */
  const offenders = [];
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (UNSAFE_NAME.test(e.name)) offenders.push(`${p}  (unsafe name)`);
        walk(p);
      } else if (e.name === ".gitignore") offenders.push(`${p}  (ships ignore semantics)`);
      // A name carrying gitignore syntax would become an extra RULE in the generated manifest — a
      // newline splits one entry in two, `*` matches siblings, `!` re-includes — letting install
      // output hide framework files it never wrote. Entries are escaped when written, but a name
      // this exotic is a defect in the pack, so refuse it rather than quietly encode it.
      else if (UNSAFE_NAME.test(e.name)) offenders.push(`${p}  (unsafe name)`);
    }
  };
  for (const sub of [...CAP_SUBDIRS, "hooks"]) walk(path.join(packDir, sub));
  if (offenders.length)
    throw new Error(
      `domain pack "${domainName}" has files that cannot be safely installed — nothing was ` +
        `installed:\n${offenders.map((f) => `  ${f}`).join("\n")}\n` +
        "A pack must not carry a .gitignore (installed into plugin/ it is live git config for that " +
        "subtree) nor a filename containing gitignore syntax or control characters (it would " +
        "become an extra ignore rule). Both can hide framework files that are not install output.",
    );
}

/** Merge a domain pack's hooks.json into the framework's, concatenating per-event hook lists. The
 * hook scripts they reference (via `${CLAUDE_PLUGIN_ROOT}/hooks/...`) are copied alongside into
 * `plugin/hooks/`, so the merged paths resolve. @param {string} baseFile @param {string} packFile */
function mergeHooks(baseFile, packFile) {
  if (!existsSync(packFile)) return;
  /** @param {string} f @returns {{description?:string, hooks?:Record<string, unknown[]>}} */
  const readHooks = (f) =>
    /** @type {{description?:string, hooks?:Record<string, unknown[]>}} */ (
      parseJSON(readFileSync(f, "utf8"))
    );
  const base = existsSync(baseFile) ? readHooks(baseFile) : { hooks: {} };
  const pack = readHooks(packFile);
  const merged = { ...(base.hooks ?? {}) };
  // Dedupe by structural equality so re-installing the same domain is idempotent (the base already
  // carries a prior install's merged entries — re-adding them would duplicate the hooks).
  for (const [event, list] of Object.entries(pack.hooks ?? {})) {
    const existing = merged[event] ?? [];
    const seen = new Set(existing.map((h) => JSON.stringify(h)));
    const additions = (Array.isArray(list) ? list : []).filter((h) => !seen.has(JSON.stringify(h)));
    merged[event] = [...existing, ...additions];
  }
  writeFileSync(
    baseFile,
    JSON.stringify({ description: base.description, hooks: merged }, null, 2) + "\n",
  );
}

/** Install a domain pack's capabilities into the framework's single `plugin/` tree and bake the
 * pack's runtime descriptor into `.xenomoon.json`. After this, `plugin/` holds every installed
 * agent/skill/command/hook + `plugin/orchestrator.md`, and the runtime reads the baked descriptor —
 * no `domains/` on any runtime path.
 * @param {string} frameworkDir the framework clone root
 * @param {string} domainName the picked domain pack
 * @returns {{ copied: string[], descriptor: import("../core/domain-resolver.js").DomainDescriptor }} */
export function installCapabilities(frameworkDir, domainName) {
  const descriptor = loadDomain(domainName, frameworkDir);
  const packDir = path.join(frameworkDir, descriptor.plugin); // domains/<name>/plugin
  const pluginDir = path.join(frameworkDir, "plugin");

  // PREFLIGHT — validate the whole install surface BEFORE writing a single file. Rejecting a bad
  // pack file mid-copy would leave the earlier files already written and undeclared (the manifest
  // is regenerated at the END), which is the exact publish/hide hazard this module exists to
  // remove. Refuse the install as a whole, or perform it as a whole.
  preflightPack(packDir, domainName);
  const copied = [];
  /** Every file this run writes into `plugin/` — the input to `plugin/.gitignore`. @type {string[]} */
  const written = [];

  // 1. Capabilities: agents / skills / commands / library → the single plugin tree.
  for (const sub of CAP_SUBDIRS) {
    const src = path.join(packDir, sub);
    if (!existsSync(src)) continue;
    copyTree(src, path.join(pluginDir, sub), written);
    copied.push(sub);
  }

  // 2. Hooks: copy the pack's hook scripts, then merge its hooks.json into the base. The merged
  //    hooks.json is NOT install output — it is the framework's own file with the pack's entries
  //    concatenated in — so it stays tracked and out of the generated ignore list.
  const packHooks = path.join(packDir, "hooks");
  if (existsSync(packHooks)) {
    for (const e of readdirSync(packHooks, { withFileTypes: true }))
      if (e.isFile() && e.name !== "hooks.json") {
        const d = path.join(pluginDir, "hooks", e.name);
        mkdirSync(path.dirname(d), { recursive: true });
        copyFileSync(path.join(packHooks, e.name), d);
        if (e.name.endsWith(".sh")) chmodSync(d, 0o755);
        written.push(d);
      }
    mergeHooks(path.join(pluginDir, "hooks", "hooks.json"), path.join(packHooks, "hooks.json"));
    copied.push("hooks");
  }

  // 3. Orchestrator prompt: the pack's orchestrator.md becomes the framework's single orchestrator.
  const packOrch = path.join(frameworkDir, descriptor.orchestrator);
  if (existsSync(packOrch)) {
    const dst = path.join(pluginDir, "orchestrator.md");
    copyFileSync(packOrch, dst);
    written.push(dst);
    copied.push("orchestrator.md");
  }

  // 3b. Declare what was written, so install output can never be staged as framework content.
  //     This REPLACES the manifest (the install owns it), so the learning scaffolds are ensured
  //     right after — they append themselves, and one install run leaves a complete list. Without
  //     this the scaffolds stay undeclared until doctor/promote next runs.
  writeInstallOutput(pluginDir, domainName, written);
  ensureDomainLibrary(pluginDir);

  // 4. Bake the pack's runtime descriptor into the framework config, so the runtime never resolves a
  //    live domain.json. `domain` (the name) is written by new.js; this adds the resolved values.
  const cfgFile = path.join(frameworkDir, ".xenomoon.json");
  /** @type {Record<string, unknown>} */
  let cfg = {};
  try {
    cfg = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(cfgFile, "utf8")));
  } catch {
    /* absent/invalid — start fresh */
  }
  writeFileSync(cfgFile, JSON.stringify({ ...cfg, domainDescriptor: descriptor }, null, 2) + "\n");

  return { copied, descriptor };
}

// --- CLI: `node ui/server/cli/install-capabilities.js` (used by `xenomoon update`) ------------
// Re-applies the BAKED domain's overlay onto plugin/ — repair/refresh after a framework pull.
// Reads the domain name from .xenomoon.json; a clone with no baked domain is a no-op (trunk).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const frameworkDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  /** @type {string | undefined} */
  let domainName;
  try {
    const cfg = /** @type {{ domain?: string }} */ (
      parseJSON(readFileSync(path.join(frameworkDir, ".xenomoon.json"), "utf8"))
    );
    domainName = cfg.domain;
  } catch {
    /* no config — trunk / uninstalled clone */
  }
  if (!domainName) {
    console.log("install-capabilities: no baked domain in .xenomoon.json — nothing to overlay.");
  } else {
    // A clone bound to a RENAMED pack heals here: resolvePackDir maps the baked (old) name onto the
    // pack that claims it via `formerNames`. Without this the clone cannot even update to receive
    // the fix — loadDomain throws first (observed: `expo` → `expoapp` bricked `xenomoon update`).
    const current = resolvePackDir(domainName, frameworkDir);

    // INSTALL FIRST, then persist the new name. The overlay is what makes the rename true; writing
    // the bindings before it succeeds would claim a migration that did not happen — and on a
    // malformed pack the retry would start from the new name, erasing the evidence that the clone
    // is mid-migration. Install throws → nothing is rewritten and the old binding still describes
    // what is actually on disk.
    const { copied } = installCapabilities(frameworkDir, current);
    console.log(
      `install-capabilities: re-applied the "${current}" pack overlay (${copied.join(", ") || "nothing to copy"}).`,
    );

    if (current !== domainName) {
      const cfgFile = path.join(frameworkDir, ".xenomoon.json");
      // Re-read: installCapabilities just re-baked domainDescriptor into this file.
      const cfg = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(cfgFile, "utf8")));
      writeFileSync(cfgFile, JSON.stringify({ ...cfg, domain: current }, null, 2) + "\n");
      // The project's OWN lock is the authoritative binding, so migrate it too — healing only the
      // framework config would leave the two disagreeing by name while meaning the same pack.
      const projectDir = typeof cfg.projectDir === "string" ? cfg.projectDir : null;
      const lockMigrated = projectDir && readProjectLock(projectDir) === domainName;
      if (lockMigrated) writeProjectLock(projectDir, current);
      console.log(
        `install-capabilities: pack "${domainName}" was renamed to "${current}" — binding updated` +
          (lockMigrated ? ` (framework config + the project's ${PROJECT_LOCK_FILE}).` : "."),
      );
    }
  }
}

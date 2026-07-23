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
import { parseJSON } from "../../lib/json.js";
import { loadDomain } from "../core/domain-resolver.js";

/** Capability subdirs copied from the pack's plugin into the framework plugin. `.claude-plugin/`
 * (the pack's own manifest) is deliberately NOT copied — the base `plugin/.claude-plugin/plugin.json`
 * stays the single manifest. `hooks/` is handled separately (scripts copied + hooks.json merged).
 * @type {string[]} */
const CAP_SUBDIRS = ["agents", "skills", "commands", "library"];

/** Recursively copy srcDir → dstDir, overwriting on every run (the pack is the source of truth for
 * what it installs). Executable `.sh` scripts keep their bit. @param {string} srcDir @param {string} dstDir */
function copyTree(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, e.name);
    const d = path.join(dstDir, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) {
      copyFileSync(s, d);
      if (e.name.endsWith(".sh")) chmodSync(d, 0o755);
    }
  }
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
  const copied = [];

  // 1. Capabilities: agents / skills / commands / library → the single plugin tree.
  for (const sub of CAP_SUBDIRS) {
    const src = path.join(packDir, sub);
    if (!existsSync(src)) continue;
    copyTree(src, path.join(pluginDir, sub));
    copied.push(sub);
  }

  // 2. Hooks: copy the pack's hook scripts, then merge its hooks.json into the base.
  const packHooks = path.join(packDir, "hooks");
  if (existsSync(packHooks)) {
    for (const e of readdirSync(packHooks, { withFileTypes: true }))
      if (e.isFile() && e.name !== "hooks.json") {
        const d = path.join(pluginDir, "hooks", e.name);
        mkdirSync(path.dirname(d), { recursive: true });
        copyFileSync(path.join(packHooks, e.name), d);
        if (e.name.endsWith(".sh")) chmodSync(d, 0o755);
      }
    mergeHooks(path.join(pluginDir, "hooks", "hooks.json"), path.join(packHooks, "hooks.json"));
    copied.push("hooks");
  }

  // 3. Orchestrator prompt: the pack's orchestrator.md becomes the framework's single orchestrator.
  const packOrch = path.join(frameworkDir, descriptor.orchestrator);
  if (existsSync(packOrch)) {
    copyFileSync(packOrch, path.join(pluginDir, "orchestrator.md"));
    copied.push("orchestrator.md");
  }

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

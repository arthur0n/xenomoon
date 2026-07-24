// The file-move half of promotion: resolve a project-local capability's source +
// plugin destination and move it. Pure (no argv, no process.exit), so both the
// CLI (`promote.js`) and the UI server (a one-click "Promote now" from the
// promotions board) share the exact same move semantics.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdirSync,
  cpSync,
} from "node:fs";
import path from "node:path";
import { FRAMEWORK_PLUGIN_DIR } from "../../core/config.js";
import { scanPath, denylistFor, businessTermsFor } from "./contamination.js";
import { ensureDomainLibrary } from "./ensure-library.js";

export const PROMOTE_KINDS = new Set(["skills", "agents", "tools", "library"]);

// smoke_*.gd / play_*.gd auto-join the gate by filename glob (tools/lib/checks.sh
// run_gd_bots) — no explicit reference needed.
const AUTO_GLOB_RE = /^(smoke|play)_.*\.gd$/;

/** Whether a project-local tool is actually wired into the gate: it either matches the
 * smoke_ / play_ auto-glob prefix, or its name is referenced by the project's validate.sh /
 * validate.local.sh / checks.sh. Used to reject promoting an orphan tool nothing runs.
 * @param {string} name @param {string} projectDir @returns {boolean} */
export function isGateWired(name, projectDir) {
  if (AUTO_GLOB_RE.test(name)) return true;
  const wiringFiles = [
    path.join(projectDir, "tools", "validate.sh"),
    path.join(projectDir, "tools", "validate.local.sh"),
    path.join(projectDir, "tools", "lib", "checks.sh"),
  ];
  return wiringFiles.some((file) => {
    try {
      return readFileSync(file, "utf8").includes(name);
    } catch {
      return false;
    }
  });
}

/** Resolve the project-local source path and the plugin destination for this capability.
 * @param {string} kind @param {string} name @param {string} projectDir
 * @param {string} [pluginDir] destination plugin root override (temp fixtures in tests);
 *   defaults to the base plugin so existing project-path callers are byte-identical. */
export function locate(kind, name, projectDir, pluginDir = FRAMEWORK_PLUGIN_DIR) {
  if (kind === "skills") {
    return {
      src: path.join(projectDir, ".claude", "skills", name),
      dst: path.join(pluginDir, "skills", name),
    };
  }
  if (kind === "agents") {
    const file = name.endsWith(".md") ? name : `${name}.md`;
    return {
      src: path.join(projectDir, ".claude", "agents", file),
      dst: path.join(pluginDir, "agents", file),
    };
  }
  if (kind === "library") {
    // name carries `<kind>/<slug>.md` (e.g. findings/jsdom-lockfile.md) — drafts live
    // project-local under .claude/library/, records land in the pack's library/.
    const file = name.endsWith(".md") ? name : `${name}.md`;
    return {
      src: path.join(projectDir, ".claude", "library", file),
      dst: path.join(pluginDir, "library", file),
    };
  }
  return {
    src: path.join(projectDir, "tools", name),
    dst: path.join(pluginDir, "tools", name),
  };
}

/** Move src→dst, falling back to copy+remove across filesystems. @param {string} src @param {string} dst */
function movePath(src, dst) {
  try {
    renameSync(src, dst);
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e)?.code !== "EXDEV") throw e;
    cpSync(src, dst, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

/** Promote one capability project→plugin. Never throws on a skip — returns the outcome so
 * the batch path can keep going. @param {string} kind @param {string} name @param {string} projectDir
 * @param {{ force?: boolean, pluginDir?: string }} [opts] force: promote despite a contamination
 * block (CLI --force). pluginDir: destination plugin root override (temp fixtures in tests);
 * defaults to the base plugin.
 * @returns {{ ok: boolean, msg: string }} */
export function promoteOne(kind, name, projectDir, opts = {}) {
  if (!PROMOTE_KINDS.has(kind)) return { ok: false, msg: `skip ${kind}/${name}: unknown kind` };
  const pluginDir = opts.pluginDir ?? FRAMEWORK_PLUGIN_DIR;
  ensureDomainLibrary(pluginDir); // lazily heal the pack's learning scaffolds (idempotent)
  const { src, dst } = locate(kind, name, projectDir, pluginDir);
  // Check "already in the plugin" BEFORE "missing project-local source": a capability already shipped
  // in the plugin usually has NO project-local copy, so the src-missing check would otherwise fire a
  // confusing "not found at <project path>" instead of the clear "already in the plugin" skip.
  if (existsSync(dst))
    return {
      ok: false,
      msg:
        `skip ${kind}/${name}: it is already in the plugin (${dst}). ` +
        `promote only ADDS new capabilities — it never UPDATES core. To improve it, edit it ` +
        `in the plugin directly (it re-materializes to every install); keep project-specific bits ` +
        `in a project-local extension the core sources. See plugin/docs/process/promotion.md → "Updating an existing core file".`,
    };
  if (!existsSync(src)) return { ok: false, msg: `skip ${kind}/${name}: not found at ${src}` };
  // Contamination gate: plugin/ ships to EVERY install, so a promoted capability must be AGNOSTIC.
  // res:// project-specific refs are a hard functional break for TOOLS only (a hardcoded resource fails other
  // installs' gates); skills/agents cite res:// convention paths legitimately, so they are gated on the
  // universal signals (codenames, absolute/sibling-project paths, provenance) instead. --force overrides.
  if (!opts.force) {
    // Library records additionally run the records-only mapping check ("our stack/our repo"
    // phrasing that only maps to ONE project must not ship). Every kind gets the per-project
    // privacy FLOOR: the bound project's proper nouns (denylist) and its verbatim
    // business-rule lines (businessTerms) — the scanner stays pure, the caller reads.
    const [hit] = scanPath(src, {
      checkRes: kind === "tools",
      checkMapping: kind === "library",
      denylist: denylistFor(projectDir),
      businessTerms: businessTermsFor(projectDir),
    });
    if (hit)
      return {
        ok: false,
        msg:
          `skip ${kind}/${name}: PROJECT-CONTAMINATION (${hit.signal}) — ` +
          `${path.relative(projectDir, hit.file)} contains "${hit.match}". ${hit.hint} ` +
          `plugin/ ships to every install, so it must be agnostic (the project's own facts live project-local). ` +
          `Fix it and re-promote, or pass --force to promote anyway. See plugin/docs/process/promotion.md.`,
      };
  }
  mkdirSync(path.dirname(dst), { recursive: true });
  movePath(src, dst);
  if (kind === "library") appendIndexLine(dst);
  return { ok: true, msg: `moved ${kind}/${name} → ${path.basename(pluginDir)}` };
}

/** Keep the promoted record queryable: append its line to the kind's `index.md` (sorted by
 * filename, per the library-record-writing contract). Best-effort — a malformed record still
 * promotes; the index line just carries an empty description. @param {string} dst */
function appendIndexLine(dst) {
  const indexFile = path.join(path.dirname(dst), "index.md");
  const slug = path.basename(dst);
  const title = slug.replace(/\.md$/, "");
  let description = "";
  try {
    description =
      readFileSync(dst, "utf8")
        .match(/^---\n[\s\S]*?^description:\s*(.+)$[\s\S]*?\n---/m)?.[1]
        ?.trim() ?? "";
  } catch {
    /* unreadable — keep the empty description */
  }
  const line = `- [${title}](${slug})${description ? ` — ${description}` : ""}`;
  let existing = "";
  try {
    existing = readFileSync(indexFile, "utf8");
  } catch {
    /* no index yet — start one */
  }
  if (existing.includes(`](${slug})`)) return; // re-promote of a forced copy — don't duplicate
  const lines = existing.split("\n");
  const entries = lines.filter((l) => l.startsWith("- ["));
  const head = lines
    .filter((l) => !l.startsWith("- ["))
    .join("\n")
    .trimEnd();
  const sorted = [...entries, line].sort();
  writeFileSync(indexFile, `${head}\n\n${sorted.join("\n")}\n`);
}

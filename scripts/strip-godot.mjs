#!/usr/bin/env node
// strip-godot.mjs — keep the fork Godot-free.
//
// WHY THIS EXISTS (read docs/whitelabel/SYNC.md + SEAMS.md for the full strategy):
//   xenomoon is a domain-NEUTRAL fork of the upstream Godot framework
//   (arthur0n/xenodot-forge). Godot stays EXCLUSIVELY upstream — the popular product —
//   and we pull only its DOMAIN-AGNOSTIC improvements. But every `sync-upstream.sh`
//   merge re-introduces the Godot payload (agents, skills, tools, the godot domain,
//   the starter, the asset/level UI features, the Godot "Hive" orchestrator). This
//   codemod deletes that payload DETERMINISTICALLY after each merge, so a sync can
//   never silently re-land Godot. It is the file-deletion half of the sync; in-file
//   divergences (asset/level wiring removed from spine modules) are merge conflicts the
//   sync resolves by hand — see docs/whitelabel/SEAMS.md.
//
// USAGE:
//   node scripts/strip-godot.mjs           delete the Godot payload, print a summary
//   node scripts/strip-godot.mjs --check   dry run; exit 1 if ANY Godot path remains
//                                           (asserts the tree is Godot-free; used in CI)
//
// GUARANTEES:
//   - Idempotent: a second run deletes nothing.
//   - Scoped to the SPINE + CORE plugin. NEVER touches `domains/**` (a domain pack owns
//     its own capabilities — e.g. the webapp domain ships its own bug-triage), except
//     the dead `domains/godot/` reference pack itself.

/* global process, console */
import { rmSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const CHECK_ONLY = process.argv.includes("--check");

// Whole directories that are Godot-only in the spine/CORE plugin. Removed recursively.
// (A non-Godot domain keeps its tools under domains/<name>/plugin/tools — NOT here.)
const GODOT_DIRS = [
  "domains/godot",
  "starter",
  "plugin/tools",
  // The CORE knowledge base ships EMPTY (per-domain libraries hold real research). Upstream's
  // is Godot research records — strip them; keep `plugin/library/README.md` (generic scaffold note).
  "plugin/library/addons",
  "plugin/library/transcripts",
  "plugin/library/verdicts",
  "plugin/library/sources",
  "plugin/library/tools",
  "plugin/library/research",
  "ui/server/features/assets",
  "ui/server/features/levels",
  "ui/client/features/assets",
  "ui/client/features/level-editor",
];

// Individual Godot files in the spine/CORE plugin.
const GODOT_FILES = [
  "ui/orchestrator.md", // the Godot "Hive" — domains ship their own orchestrator.md
  "ui/server/mcp-tools/asset-tool.js", // request_asset = Godot art sourcing
  "plugin/library/.gdignore", // tells Godot to skip the library — meaningless without Godot
];

// CORE plugin agents that are Godot-specific. The `godot-*` prefix is matched by glob
// below; these are the Godot agents WITHOUT that prefix. Top-level plugin/agents only —
// a domain's own agents (domains/<name>/plugin/agents/*) are never touched.
const GODOT_AGENTS = new Set([
  "game-designer",
  "level-designer",
  "art-director",
  "asset-advisor",
  "addon-researcher",
  "bug-triage", // the Godot bug-triage; the webapp domain ships its own
]);

/** Is this repo-relative POSIX path part of the Godot payload? @param {string} rel */
function isGodotPath(rel) {
  if (GODOT_FILES.includes(rel)) return true;
  if (GODOT_DIRS.some((d) => rel === d || rel.startsWith(d + "/"))) return true;
  // CORE plugin agents (top-level plugin/agents/ only — never domains/**).
  if (rel.startsWith("plugin/agents/") && !rel.slice("plugin/agents/".length).includes("/")) {
    const name = basename(rel, ".md");
    if (name.startsWith("godot-") || GODOT_AGENTS.has(name)) return true;
  }
  // CORE plugin skills (top-level plugin/skills/<skill>/... only).
  if (rel.startsWith("plugin/skills/")) {
    const seg = rel.slice("plugin/skills/".length).split("/")[0];
    if (seg.startsWith("godot-") || seg.startsWith("gd-utilities-")) return true;
  }
  return false;
}

/** Git-tracked files (so untracked local state is never deleted; matches rebrand.mjs).
 *  @returns {string[]} */
function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

// Disk-accurate: git ls-files still lists a deleted-but-uncommitted file, so intersect
// with what's actually on disk — both --check and the delete pass act on real files.
const hits = trackedFiles()
  .filter(isGodotPath)
  .filter((rel) => existsSync(join(ROOT, rel)));
// Directories to remove wholesale (recursively) — only those that still exist on disk.
const dirsPresent = GODOT_DIRS.filter((d) => existsSync(join(ROOT, d)));

if (CHECK_ONLY) {
  if (hits.length) {
    console.error(`✗ strip-godot --check: ${hits.length} Godot path(s) still present:`);
    for (const f of hits) console.error("   " + f);
    process.exit(1);
  }
  console.log("✓ strip-godot --check: tree is Godot-free.");
} else {
  const removedDirs = new Set();
  for (const d of dirsPresent) {
    rmSync(join(ROOT, d), { recursive: true, force: true });
    removedDirs.add(d);
  }
  // Remove individual files not already swept by a removed directory.
  let fileCount = 0;
  for (const rel of hits) {
    if (GODOT_DIRS.some((d) => rel === d || rel.startsWith(d + "/"))) continue;
    const abs = join(ROOT, rel);
    if (existsSync(abs)) {
      rmSync(abs, { force: true });
      fileCount++;
    }
  }
  // Drop now-empty CORE plugin dirs (tools/) so the tree stays clean.
  for (const d of ["plugin/tools"]) {
    const abs = join(ROOT, d);
    if (existsSync(abs) && readdirSync(abs).length === 0) rmSync(abs, { recursive: true, force: true });
  }
  console.log(
    `✓ strip-godot: removed ${removedDirs.size} dir(s) + ${fileCount} file(s).` +
      (removedDirs.size ? "\n   dirs: " + [...removedDirs].join(", ") : ""),
  );
}

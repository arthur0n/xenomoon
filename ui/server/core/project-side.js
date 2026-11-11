// Project-side files the server boot ensures inside the bound project: the gitignore
// block for the framework's working paths and the project log dir. `forge new` shares
// ensureIgnores so install and boot write the same block.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { projectLogDir } from "../../lib/project-paths.js";

/** The one home of the ignore rules, in the order ensureIgnores writes them.
 * @param {boolean} materializes @returns {string[]} */
function requiredIgnores(materializes) {
  // Always ignored: every domain writes session/task/autonomous state into <project>/.xenomoon/.
  const need = [".xenomoon/", ".claude/projects/"];
  // Materialize domains also drop working files (tools/, library/, …) into the project tree.
  if (materializes) need.push("/tools/", "/library", "/x-shared-assets", "/transcripts/");
  return need;
}

/** Make sure the project ignores the framework's generated/working paths, so they're never
 * committed. `.xenomoon/` (the per-project task board / autonomous / skill-setup state the framework
 * writes for EVERY domain) is ALWAYS ignored, so temp tasks never land in the project's repo;
 * materialize domains add their working dirs too. The domain lock itself is intentionally NOT
 * ignored: it is committed with the project. Throws on a write failure (`forge new` must fail
 * loudly). @param {string} dir @param {boolean} materializes @returns {number} rules added */
function ensureIgnores(dir, materializes) {
  const file = path.join(dir, ".gitignore");
  const need = requiredIgnores(materializes);
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    /* no .gitignore yet */
  }
  const lines = cur.split(/\r?\n/);
  const missing = need.filter((p) => !lines.includes(p));
  if (!missing.length) return 0;
  const block =
    "\n# Xenomoon Forge generated/working files — not repo content\n" + missing.join("\n") + "\n";
  if (cur) appendFileSync(file, block);
  else writeFileSync(file, block.trimStart());
  console.log(`gitignore: added ${missing.length} ignore rule(s) to ${file}`);
  return missing.length;
}

/** Total wrapper over ensureIgnores for the server boot: an unwritable or unreadable
 * `.gitignore` is reported, never thrown, so the boot keeps going.
 * @param {string} dir @param {boolean} materializes
 * @returns {{ ok: true, added: number } | { ok: false, reason: string, rules: string[] }} */
function tryEnsureIgnores(dir, materializes) {
  try {
    return { ok: true, added: ensureIgnores(dir, materializes) };
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code ?? String(e);
    return {
      ok: false,
      reason: `${path.join(dir, ".gitignore")}: ${code}`,
      rules: requiredIgnores(materializes),
    };
  }
}

/**
 * Create `<project>/.xenomoon/logs` only when the project dir exists and is a directory
 * (a symlink to one counts), so a default or mistyped project path never gets a log tree
 * created under it. Never throws for a missing project dir: the refusal is the returned reason.
 * @param {string} projectDir
 * @returns {{ created: boolean, dir: string, reason?: "exists" | "no project dir" | "not a directory" }}
 */
function ensureLogDir(projectDir) {
  const dir = projectLogDir(projectDir);
  const st = statSync(projectDir, { throwIfNoEntry: false });
  if (!st) return { created: false, dir, reason: "no project dir" };
  if (!st.isDirectory()) return { created: false, dir, reason: "not a directory" };
  if (existsSync(dir)) return { created: false, dir, reason: "exists" };
  mkdirSync(dir, { recursive: true });
  return { created: true, dir };
}

export { requiredIgnores, ensureIgnores, tryEnsureIgnores, ensureLogDir };

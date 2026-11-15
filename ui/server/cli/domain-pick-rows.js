// The domain picklist rows (#65): the file reads that feed domain-pick.js, kept out of it because
// that module is pure ("the caller reads the files"). ONE builder for both askers — new.js
// (install-project) and bootstrap.js (`xenomoon install`, before anything is cloned). Imports
// only domain-resolver.js and domain-pick.js, so bootstrap stays config.js-free.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import { loadDomain, resolvePackDir } from "../core/domain-resolver.js";
import { detect, order, summarize } from "./domain-pick.js";

/** A pack's RAW descriptor. `loadDomain` normalises into the runtime shape and drops
 * `description`, which is the one field a picklist row wants.
 * @param {string} name @param {string} frameworkDir
 * @returns {{ label?: string, description?: string }} */
function packDescriptor(name, frameworkDir) {
  try {
    const dir = resolvePackDir(name, frameworkDir);
    return /** @type {{ label?: string, description?: string }} */ (
      parseJSON(readFileSync(path.join(frameworkDir, "domains", dir, "domain.json"), "utf8"))
    );
  } catch {
    return { label: loadDomain(name, frameworkDir).label };
  }
}

/** The project's own package.json — {} when it has none or it is unreadable.
 * @param {string} dir @returns {{ dependencies?: Record<string, string>,
 *   devDependencies?: Record<string, string> }} */
function projectPkg(dir) {
  try {
    return /** @type {{ dependencies?: Record<string, string> }} */ (
      parseJSON(readFileSync(path.join(dir, "package.json"), "utf8"))
    );
  } catch {
    return {};
  }
}

/** Names in the project root — empty when it cannot be read.
 * @param {string} dir @returns {string[]} */
function projectFiles(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The domain picklist rows: each pack's one-line summary, the pack the project's own files point
 * at first, plus that detection (for the picklist note).
 * @param {string} frameworkDir the package whose `domains/` the packs are read from
 * @param {string} projectDir   the project the detection reads
 * @param {string[]} names      the packs to list, in their listed order
 * @returns {{ items: { id: string, summary: string }[],
 *   detected: import("./domain-pick.js").Detection }} */
export function domainPickItems(frameworkDir, projectDir, names) {
  const detected = detect(
    projectPkg(projectDir),
    projectFiles(projectDir),
    existsSync(path.join(projectDir, ".xenomoon", "workspace.json")),
  );
  const items = names.map((id) => ({ id, summary: summarize(packDescriptor(id, frameworkDir)) }));
  return { items: order(items, detected), detected };
}

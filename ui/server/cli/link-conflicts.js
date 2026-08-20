// Which of an install's global bin names some OTHER tool already owns.
//
// npm links a package's bins ALL-OR-NOTHING: one foreign file at one name aborts the whole
// link with EEXIST, so a stale `issuekit` left by an unrelated install silently costs you
// `xenomoon` too. The installer used to report that as "could not npm-link the CLI", which
// names neither the culprit nor the fix. This finds the culprit.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";

/** @typedef {{ name: string, owner: string }} BinConflict */

/** Bins declared by the install at `dest` that resolve OUTSIDE it — i.e. belong to something
 * else. Never throws: a missing npm, an unreadable manifest or a dangling link all mean "we
 * cannot tell", and a failed diagnosis must not become a second failure.
 * @param {string} dest install root @returns {BinConflict[]} */
export function foreignBins(dest) {
  try {
    const pkg = /** @type {{ bin?: Record<string, string> }} */ (
      parseJSON(readFileSync(path.join(dest, "package.json"), "utf8"))
    );
    const prefix = execFileSync("npm", ["prefix", "-g"], { encoding: "utf8" }).trim();
    // realpath BOTH sides or they never compare equal: a link resolves to the real path while
    // `dest` may still carry a symlinked one (/tmp → /private/tmp, a symlinked home or
    // workspace). Comparing the two forms reports our OWN bin as someone else's.
    const ours = realpathSync(path.resolve(dest)) + path.sep;
    /** @type {BinConflict[]} */
    const found = [];
    for (const name of Object.keys(pkg.bin ?? {})) {
      // POSIX puts bins in <prefix>/bin; Windows puts them in <prefix> itself.
      const at = [path.join(prefix, "bin", name), path.join(prefix, name)].find((p) =>
        existsSync(p),
      );
      if (!at) continue;
      // realpath, not readlink: a chain of links still has to land inside this install.
      const owner = realpathSync(at);
      if (!owner.startsWith(ours)) found.push({ name, owner });
    }
    return found;
  } catch {
    return [];
  }
}

/** The lines to print when a link failed and `conflicts` explains why.
 * @param {BinConflict[]} conflicts @returns {string[]} */
export function conflictReport(conflicts) {
  const names = conflicts.map((c) => `\`${c.name}\``).join(" and ");
  return [
    `Could not link the CLI: ${names} already on your PATH, owned by something else —`,
    ...conflicts.map((c) => `        ${c.name} → ${c.owner}`),
    `      npm links every bin or none, so the other verbs went down with it. Remove the`,
    `      path(s) above, then run \`npm link\` inside the install to get them back.`,
  ];
}

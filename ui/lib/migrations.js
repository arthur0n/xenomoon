/** The migration check, shared by BOTH gates.
 *
 * It lives here for the same reason the command matchers do: the permission layer and the PreToolUse
 * hook must give one answer, and a check that exists in only one of them makes a CORE policy depend
 * on which surface the push happened to come from.
 *
 * Node builtins only — a hook loads this directly, and it must not drag in config.js, whose import
 * triggers a load-time domain probe.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Are there migrations this checkout would push AHEAD of?
 *
 * The project names one of ITS OWN npm scripts. Not a command line — a NAME. An arbitrary shell
 * string from config would be executed here, before the human ever sees the prompt, which makes
 * anything that can edit `.xenomoon.json` able to run code at a high-trust moment; the value of a
 * migration check comes nowhere near justifying that. A script name is different in kind: the code
 * it runs lives in the project's package.json, in the repository, where it is reviewed like any
 * other code. Run with `shell: false`, so the name cannot smuggle an argument.
 *
 * Three outcomes, and "broken" is NOT "clean": a renamed script or a missing binary must surface as
 * a broken opt-in, or a project pushes ahead of its schema believing a gate is watching.
 * @param {string} script @param {string} cwd
 * @returns {{ state: "clean" | "pending" | "broken", detail: string }} */
export function migrationsPending(script, cwd) {
  // The name is a package.json key, never a command. Anything else is a misconfiguration, not an
  // instruction to run something clever.
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(script))
    return { state: "broken", detail: `\`${script}\` is not a valid npm script name` };

  // Present in the project's OWN manifest? A missing script makes npm exit non-zero, which would
  // otherwise read as "migrations pending" and hide the real problem.
  try {
    const parsed = /** @type {unknown} */ (
      JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"))
    );
    const pkg = /** @type {{ scripts?: Record<string, unknown> }} */ (parsed);
    if (typeof pkg.scripts?.[script] !== "string")
      return { state: "broken", detail: `the project has no \`${script}\` script` };
  } catch {
    return { state: "broken", detail: "the project's package.json could not be read" };
  }

  try {
    execFileSync("npm", ["run", "--silent", script], {
      cwd,
      timeout: 10_000,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { state: "clean", detail: "" };
  } catch (e) {
    const err = /** @type {{ status?: number, stdout?: Buffer, stderr?: Buffer }} */ (e);
    // No exit status at all means it never ran to completion — a timeout, or npm missing. That is
    // the checker failing, not a verdict about migrations.
    if (typeof err.status !== "number")
      return {
        state: "broken",
        detail: `\`${script}\` did not complete (timed out, or npm is unavailable)`,
      };
    const text = (/** @type {Buffer | undefined} */ b) => (b ? b.toString() : "");
    const out = `${text(err.stdout)}${text(err.stderr)}`.trim();
    return {
      state: "pending",
      detail: out || "the project's migration check reported pending migrations",
    };
  }
}

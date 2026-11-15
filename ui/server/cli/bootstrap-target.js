// Which install `xenomoon install` (bootstrap.js) adds a project to (#65): one framework install
// per domain, and a project is a profile of that install, never a clone of its own. The decision
// is pure (`bootstrapTarget`); `describeInstalls` and `describeFolder` are the only file reads,
// and they feed it. Dependency-free like bootstrap.js: nothing here imports config.js.
import { lstatSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isInstallDir } from "./install-registry.js";
import { installedDomain, readInstallConfig } from "./project-entry.js";

/** @typedef {{ dir: string, domain: string | null }} KnownInstall */
/** What the folder a new install would take holds today.
 * @typedef {{ kind: "absent" | "empty" | "other" }
 *   | { kind: "install", domain: string | null }
 *   | { kind: "unreadable", code: string }} Folder */
/** @typedef {{ use: string }
 *   | { create: string, reuse: boolean }
 *   | { ask: "domain", options: string[] }
 *   | { refuse: string[] }} Target */

/** Flags that take a value, as `--flag=value` or `--flag value` (new.js accepts both). */
const VALUE_FLAGS = ["--domain", "--name", "--port", "--install"];

/** bootstrap.js's arguments: an optional project folder (the first positional), --install, and
 * every other flag forwarded to install-project as given (--domain is also read here).
 * @param {string[]} args
 * @returns {{ projectArg: string | null, installArg: string | null, domainArg: string | null,
 *   forwarded: string[] }} */
export function parseBootstrapArgs(args) {
  /** @type {{ projectArg: string | null, installArg: string | null, domainArg: string | null,
   *   forwarded: string[] }} */
  const out = { projectArg: null, installArg: null, domainArg: null, forwarded: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (!a.startsWith("--")) {
      if (out.projectArg === null) out.projectArg = a;
      else out.forwarded.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = eq === -1 ? a : a.slice(0, eq);
    const takesNext = eq === -1 && VALUE_FLAGS.includes(key);
    const value = eq !== -1 ? a.slice(eq + 1) : takesNext ? (args[++i] ?? null) : null;
    if (key === "--install") {
      out.installArg = value;
      continue;
    }
    if (key === "--domain") out.domainArg = value;
    out.forwarded.push(a, ...(takesNext && value !== null ? [value] : []));
  }
  return out;
}

/** The folder a new install of `domain` takes: named after the domain, in the directory
 * bootstrap runs in (the same place today's per-project name was resolved against).
 * @param {string} cwd @param {string} domain @returns {string} */
export function installFolder(cwd, domain) {
  return path.resolve(cwd, `${domain}-xm`);
}

/** Each registered install with its installed domain. A dir that is gone or no longer an install
 * has domain null, and so does a half-finished one (installedDomain needs both config fields).
 * @param {string[]} dirs @returns {KnownInstall[]} */
export function describeInstalls(dirs) {
  return dirs.map((dir) => ({
    dir,
    domain: isInstallDir(dir) ? installedDomain(readInstallConfig(dir)) : null,
  }));
}

/** What `dir` holds. Never throws: anything that is not a directory (a regular file, a socket…)
 * is "other" — not an install and not empty, so a clone never goes over it; a path that exists
 * (a broken symlink included) but whose stat or listing fails is "unreadable" with the error code.
 * @param {string} dir @returns {Folder} */
export function describeFolder(dir) {
  try {
    lstatSync(dir);
  } catch (err) {
    if (codeOf(err) === "ENOENT") return { kind: "absent" };
    return { kind: "unreadable", code: codeOf(err) };
  }
  try {
    if (!statSync(dir).isDirectory()) return { kind: "other" };
    if (isInstallDir(dir))
      return { kind: "install", domain: installedDomain(readInstallConfig(dir)) };
    return readdirSync(dir).length === 0 ? { kind: "empty" } : { kind: "other" };
  } catch (err) {
    return { kind: "unreadable", code: codeOf(err) };
  }
}

/** A filesystem error's code, or "unknown error". @param {unknown} err @returns {string} */
function codeOf(err) {
  const code = /** @type {{ code?: unknown } | null} */ (err)?.code;
  return typeof code === "string" ? code : "unknown error";
}

/** @param {KnownInstall[]} list @returns {string[]} */
const listed = (list) => list.map((i) => `  ${i.dir}  (${i.domain})`);

/** A new install of `domain` at `dir`, given what `dir` holds today.
 * @param {string} domain @param {string} dir @param {Folder} folder @returns {Target} */
function createAt(domain, dir, folder) {
  if (folder.kind === "absent" || folder.kind === "empty") return { create: dir, reuse: false };
  if (folder.kind === "install" && (folder.domain === null || folder.domain === domain)) {
    return { create: dir, reuse: true };
  }
  const what =
    folder.kind === "install"
      ? `is an install of the "${folder.domain}" domain`
      : folder.kind === "unreadable"
        ? `cannot be read (${folder.code})`
        : "is not empty and not a xenomoon install";
  return {
    refuse: [
      `✗ ${dir} ${what}; a new "${domain}" install would go there.`,
      `  Move that folder, or run from another directory.`,
    ],
  };
}

/**
 * @typedef {object} TargetInput
 * @property {string | null} domain    the chosen domain (canonical), null when none was given
 * @property {KnownInstall[]} installs every registered install with its installed domain
 * @property {string} project          the project dir (for the messages)
 * @property {string} folder           where a new install of `domain` would go (installFolder)
 * @property {() => Folder} existing   what that folder holds today — called only when no
 *   registered install decides it, so an irrelevant folder is never read
 * @property {string[]} [known]        the domains this package ships; empty = do not check
 * @property {boolean} [interactive]   a terminal can answer: ask the domain instead of refusing
 */

/** Decide: add the project to the registered install of the domain, create that domain's one
 * install, or refuse. Never two installs of one domain picked by guess, never a clone over a
 * folder that is something else.
 * @param {TargetInput} input @returns {Target} */
export function bootstrapTarget(input) {
  const { domain, installs, project, folder, existing, known = [], interactive = false } = input;
  const withDomain = installs.filter((i) => i.domain !== null);
  if (!domain) {
    const [only] = withDomain;
    if (only && withDomain.length === 1) return { use: only.dir };
    if (interactive) return { ask: "domain", options: known };
    return {
      refuse: [
        withDomain.length === 0
          ? `✗ no domain given and no install registered on this machine; the new install is named after its domain.`
          : `✗ no domain given and ${withDomain.length} installs are registered:`,
        ...listed(withDomain),
        `  Pass --domain=<name>${known.length ? ` (available: ${known.join(", ")})` : ""}, e.g. xenomoon install ${project} --domain=${known[0] ?? "webapp"}`,
      ],
    };
  }
  const matches = withDomain.filter((i) => i.domain === domain);
  const [match] = matches;
  if (match && matches.length === 1) return { use: match.dir };
  if (matches.length > 1) {
    return {
      refuse: [
        `✗ ${matches.length} registered installs have the "${domain}" domain; one install per domain is expected:`,
        ...listed(matches),
        `  Say which: xenomoon install ${project} --install=<path> --domain=${domain}`,
      ],
    };
  }
  if (known.length > 0 && !known.includes(domain)) {
    return { refuse: [`✗ unknown domain "${domain}" (available: ${known.join(", ")}).`] };
  }
  return createAt(domain, folder, existing());
}

/** The install named explicitly (--install=<path> or XENOMOON_INSTALL), or a refusal.
 * @param {string} dir @param {Folder} folder @param {string | null} domain @returns {Target} */
export function explicitTarget(dir, folder, domain) {
  if (folder.kind !== "install") return { refuse: [`✗ not a xenomoon install: ${dir}`] };
  if (domain && folder.domain && folder.domain !== domain) {
    return {
      refuse: [`✗ ${dir} has the "${folder.domain}" domain installed, not "${domain}".`],
    };
  }
  return { use: dir };
}

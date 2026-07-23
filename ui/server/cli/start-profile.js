// Multi-project launcher: named per-project profiles saved in .xenomoon.json (gitignored),
// so parallel binds (each project on its own port/domain) start with one short command instead
// of a hand-typed `XENOMOON_DOMAIN=… PORT=… npm start <path>` line. Like setup.js this is a
// BOOTSTRAP tool: it deliberately does NOT import config.js (which resolves the active domain
// at load time) — it only reads .xenomoon.json and spawns the server with the right env.
//
// Usage: npm run start-project -- <name>                                  start a saved profile
//        npm run start-project -- --add <name> <dir> [--port=N] [--domain=d]   save/update a profile
//        npm run start-project -- --remove <name>                          delete a profile
//        npm run start-project                                             list profiles
//
// A profile's `domain` is exported as XENOMOON_DOMAIN (env beats the file-level `domain` key in
// the resolver, and must match the project's own .xenomoon-project.json lock — a mismatch is
// refused at boot, never silently applied). Caller env (PORT / XENOMOON_DOMAIN) wins over the
// profile, so one-off overrides still work.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");
const SERVER = path.join(FRAMEWORK_DIR, "ui", "server", "core", "index.js");

/** @typedef {{ dir: string, port?: number, domain?: string }} Profile */

/** Read .xenomoon.json (or {} if absent/invalid). @returns {Record<string, unknown>} */
function readConfig() {
  try {
    return /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    return {};
  }
}

/** The saved profiles map (never null). @returns {Record<string, Profile>} */
function readProfiles() {
  const p = readConfig().projects;
  return p && typeof p === "object" ? /** @type {Record<string, Profile>} */ (p) : {};
}

/** Merge a patch into .xenomoon.json, preserving every other field.
 * @param {Record<string, unknown>} patch */
function mergeConfig(patch) {
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), ...patch }, null, 2) + "\n");
}

const argv = process.argv.slice(2);
/** @param {string} name @returns {string | undefined} */
const val = (name) =>
  argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const positional = argv.filter((a) => !a.startsWith("--"));

/** One line per profile, for --list and error hints. @returns {string} */
function listing() {
  const profiles = readProfiles();
  const names = Object.keys(profiles);
  if (!names.length) {
    return "  (none — add one: npm run start-project -- --add <name> <dir> [--port=N] [--domain=d])";
  }
  return names
    .map((n) => {
      const p = profiles[n];
      const extras = [p?.domain && `domain=${p.domain}`, p?.port && `port=${p.port}`]
        .filter(Boolean)
        .join(" ");
      return `  ${n}  →  ${p?.dir}${extras ? `  (${extras})` : ""}`;
    })
    .join("\n");
}

if (argv.includes("--add")) {
  const [name, dir] = positional;
  if (!name || !dir) {
    console.error("usage: npm run start-project -- --add <name> <dir> [--port=N] [--domain=d]");
    process.exit(1);
  }
  /** @type {Profile} */
  const profile = { dir: path.resolve(dir) };
  const port = Number(val("port"));
  if (Number.isInteger(port) && port > 0) profile.port = port;
  const domain = val("domain");
  if (domain) profile.domain = domain;
  mergeConfig({ projects: { ...readProfiles(), [name]: profile } });
  console.log(`Saved profile "${name}" → ${CONFIG_FILE}`);
  console.log(listing());
} else if (argv.includes("--remove")) {
  const [name] = positional;
  const profiles = readProfiles();
  if (!name || !profiles[name]) {
    console.error(`no such profile "${name ?? ""}" — saved profiles:\n${listing()}`);
    process.exit(1);
  }
  delete profiles[name];
  mergeConfig({ projects: profiles });
  console.log(`Removed profile "${name}".`);
  console.log(listing());
} else if (!positional.length) {
  console.log(`Saved profiles (${CONFIG_FILE}):\n${listing()}`);
  console.log("\nStart one: npm run start-project -- <name>");
} else {
  const name = positional[0] ?? "";
  const profile = readProfiles()[name];
  if (!profile) {
    console.error(`no such profile "${name}" — saved profiles:\n${listing()}`);
    process.exit(1);
  }
  // Caller env wins over the profile, so `PORT=4000 npm run start-project -- maggie` still overrides.
  const env = { ...process.env };
  if (profile.port && !process.env.PORT) env.PORT = String(profile.port);
  if (profile.domain && !process.env.XENOMOON_DOMAIN) env.XENOMOON_DOMAIN = profile.domain;
  console.log(
    `Starting "${name}" → ${profile.dir}` +
      `${env.XENOMOON_DOMAIN ? `  domain=${env.XENOMOON_DOMAIN}` : ""}` +
      `${env.PORT ? `  port=${env.PORT}` : ""}`,
  );
  // Supervisor loop: the server signals a self-restart request with exit code 87
  // (POST /api/restart — "apply & restart" in the UI); any other exit ends the profile.
  // XENOMOON_SUPERVISED tells the server a supervisor will respawn it, so it must NOT
  // spawn a detached copy of itself (that path is for bare `npm start`).
  env.XENOMOON_SUPERVISED = "1";
  const run = () => {
    const child = spawn(process.execPath, [SERVER, profile.dir], { stdio: "inherit", env });
    child.on("exit", (code) => {
      if (code === 87) {
        console.log(`Restart requested — respawning "${name}"…`);
        run();
        return;
      }
      process.exit(code ?? 0);
    });
  };
  run();
}

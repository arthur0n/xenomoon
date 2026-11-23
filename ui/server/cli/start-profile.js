// Multi-project launcher: named per-project profiles saved in .xenomoon.json (gitignored),
// so parallel binds (each project on its own port/domain) start with one short command instead
// of a hand-typed `XENOMOON_DOMAIN=… PORT=… npm start <path>` line. Like setup.js this is a
// BOOTSTRAP tool: it deliberately does NOT import config.js (which resolves the active domain
// at load time) — it only reads .xenomoon.json and spawns the server with the right env.
//
// Usage: npm run start-project -- <name>             start a saved profile
//        npm run start-project -- --remove <name>    delete a profile
//        npm run start-project                       list profiles
//
// A project is added only by `npm run install-project -- <dir>` (#65), which prepares it; the
// old `--add`, which wrote a map entry with no preparation, exits 1 naming it and writes nothing.
//
// A profile's `domain` is exported as XENOMOON_DOMAIN (env beats the file-level `domain` key in
// the resolver, and must match the project's own .xenomoon-project.json lock — a mismatch is
// refused at boot, never silently applied). Caller env (PORT / XENOMOON_DOMAIN) wins over the
// profile, so one-off overrides still work.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addProjectCommand, readInstallConfig, removeProjectEntry } from "./project-entry.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");
const CONFIG_FILE = path.join(FRAMEWORK_DIR, ".xenomoon.json");
const SERVER = path.join(FRAMEWORK_DIR, "ui", "server", "core", "index.js");

/** @typedef {{ dir: string, port?: number, domain?: string }} Profile */

/** The saved profiles map (never null), for display and start only. @returns {Record<string, Profile>} */
function readProfiles() {
  const p = readInstallConfig(FRAMEWORK_DIR).projects;
  return p && typeof p === "object" ? /** @type {Record<string, Profile>} */ (p) : {};
}

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));

/** One line per profile, for --list and error hints. @returns {string} */
function listing() {
  const profiles = readProfiles();
  const names = Object.keys(profiles);
  if (!names.length) {
    return `  (none — add one: ${addProjectCommand()})`;
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
  const dir = positional[1];
  console.error(
    "start-project: --add is gone; nothing was written.\n" +
      `  Add a project with: ${addProjectCommand(dir ? `"${path.resolve(dir)}"` : undefined)}`,
  );
  process.exit(1);
} else if (argv.includes("--remove")) {
  const [name] = positional;
  const why = removeProjectEntry(FRAMEWORK_DIR, name ?? "");
  if (why) {
    console.error(
      why.noSuchName
        ? `${why.error} — saved profiles:\n${listing()}`
        : `start-project: ${why.error}`,
    );
    process.exit(1);
  }
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
  // Caller env wins over the profile, so `PORT=4000 npm run start-project -- <profile>` still overrides.
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

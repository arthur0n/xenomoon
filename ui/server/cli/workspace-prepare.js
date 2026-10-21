// workspace-prepare — clone a multi-repo stack into a NEW parent folder and point every `origin`
// at a new remote base (a client's GitHub org, say). #38; manifest format:
// plugin/docs/workspace-manifest.md.
//
//   node ui/server/cli/workspace-prepare.js --manifest <workspace.json> --target <new parent> \
//        --base <remote base> [--apply]
//
// DRY-RUN by default: prints the plan and touches nothing. `--apply` acts, per repo:
//   git clone <remote> <target>/<path>      (the stack's current origin is the source)
//   git remote rename origin upstream       (the source stays fetchable as `upstream`)
//   git remote add origin <base>/<name>.git (the new home; NOT pushed — creating it is yours)
// then writes <target>/.xenomoon/workspace.json with the new remotes (`mirror` is dropped: it
// belongs to the source owner). Refuses, before acting on anything, a target inside the framework
// repo, a repo folder that already exists, or a target that already holds a manifest. A git
// failure mid-way stops at once and names what was already done — no rollback, no guessing.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readManifest, WORKSPACE_FILE } from "../../lib/workspace.js";

const FRAMEWORK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** @typedef {import("../../lib/workspace.js").WorkspaceManifest} WorkspaceManifest */
/** @typedef {{ name: string, path: string, dir: string, from: string, origin: string }} Step */

/** Is `dir` (non-empty) present? An empty folder is fine to clone into.
 * @param {string} dir @returns {boolean} */
const occupied = (dir) => existsSync(dir) && readdirSync(dir).length > 0;

/** The plan, or the refusals that stop it. Pure apart from existence checks.
 * @param {WorkspaceManifest} manifest @param {string} target @param {string} base
 * @param {string} [frameworkDir]
 * @returns {{ steps: Step[], refusals: string[] }} */
export function plan(manifest, target, base, frameworkDir = FRAMEWORK_DIR) {
  const root = path.resolve(target);
  /** @type {string[]} */
  const refusals = [];
  const fw = path.resolve(frameworkDir);
  if (root === fw || root.startsWith(fw + path.sep))
    refusals.push(`target ${root} is inside the framework repo — a workspace never lives there`);
  if (!base.trim()) refusals.push("--base is empty");
  if (existsSync(path.join(root, WORKSPACE_FILE)))
    refusals.push(`target already holds a workspace manifest (${path.join(root, WORKSPACE_FILE)})`);
  const b = base.trim().replace(/\/+$/, "");
  const steps = manifest.repos.map((r) => ({
    name: r.name,
    path: r.path,
    dir: path.resolve(root, r.path),
    from: r.remote,
    origin: `${b}/${r.name}.git`,
  }));
  for (const s of steps)
    if (occupied(s.dir)) refusals.push(`${s.dir} already exists and is not empty`);
  return { steps, refusals };
}

/** The manifest the prepared workspace gets: new origins, the source kept as `upstream`.
 * @param {Step[]} steps @returns {WorkspaceManifest} */
export function preparedManifest(steps) {
  return {
    version: 1,
    repos: steps.map((s) => ({ name: s.name, path: s.path, remote: s.origin, upstream: s.from })),
  };
}

/** Act on a plan with no refusals. THROWS on the first git failure, naming what already landed.
 * @param {Step[]} steps @param {string} target @param {(line: string) => void} [log] */
export function applyPlan(steps, target, log = console.log) {
  /** @type {string[]} */
  const done = [];
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] });
  for (const s of steps) {
    try {
      mkdirSync(path.dirname(s.dir), { recursive: true });
      git(["clone", "--quiet", s.from, s.dir]);
      git(["-C", s.dir, "remote", "rename", "origin", "upstream"]);
      git(["-C", s.dir, "remote", "add", "origin", s.origin]);
    } catch (e) {
      const why = e instanceof Error ? e.message.split("\n")[0] : String(e);
      throw new Error(
        `workspace-prepare: ${s.name} failed (${why}). Already prepared: [${done.join(", ")}].`,
        { cause: e },
      );
    }
    done.push(s.name);
    log(`  ✓ ${s.name}  ${s.dir}  origin=${s.origin}  upstream=${s.from}`);
  }
  const file = path.join(path.resolve(target), WORKSPACE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(preparedManifest(steps), null, 2)}\n`);
  log(`  ✓ manifest  ${file}`);
}

/** @param {string[]} argv @returns {number} exit code */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      target: { type: "string" },
      base: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  if (!values.manifest || !values.target || !values.base) {
    console.error(
      "usage: workspace-prepare --manifest <workspace.json> --target <new parent> --base <remote base> [--apply]",
    );
    return 2;
  }
  const manifest = readManifest(path.resolve(values.manifest));
  const { steps, refusals } = plan(manifest, values.target, values.base);
  console.log(
    `${values.apply ? "APPLY" : "DRY-RUN"} — ${steps.length} repos → ${path.resolve(values.target)}`,
  );
  for (const s of steps) console.log(`  ${s.name}: clone ${s.from} → ${s.dir}; origin=${s.origin}`);
  if (refusals.length) {
    for (const r of refusals) console.error(`  ✗ ${r}`);
    console.error("workspace-prepare: refused — nothing was changed.");
    return 1;
  }
  if (!values.apply) {
    console.log("Nothing changed. Re-run with --apply to act.");
    return 0;
  }
  applyPlan(steps, values.target);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}

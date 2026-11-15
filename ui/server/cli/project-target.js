// Which ONE project a project-acting `xenomoon` verb works on. Pure: no filesystem, no env.
//
// One install serves several projects (the `projects` map in its .xenomoon.json), but the shell
// scripts behind `up`/`stop`/`restart` select a server by PORT alone and `doctor` prepares
// whatever folder config.js falls back to. A verb that names no project therefore acts on the
// install's root port and root project — the wrong one, from inside any other project. So the
// CLI decides here, before any script runs, and refuses rather than guesses.
//
// The cwd lookup lives HERE, over the resolved install's own projects, whatever way the install was
// resolved: an explicit --install / XENOMOON_INSTALL resolution carries no `project`, and a project
// of some OTHER install can never match because only this install's projects are searched.
import { shq } from "../../lib/shell.js";
import { MAX_PORT, isPort, projectAt } from "./profiles.js";

/** Verbs that act on one project of the resolved install. */
export const PROJECT_VERBS = ["doctor", "start", "up", "stop", "restart"];

/** Of those, the verbs whose script selects its server by port. */
const PORT_VERBS = ["start", "up", "stop", "restart"];

/**
 * @typedef {object} TargetInput
 * @property {import("./install-registry.js").Resolution & { root: string }} resolution
 * @property {import("./profiles.js").ProjectEntry[]} projects  the resolved install's projects
 * @property {string|null} rootProjectDir  the install file's root `projectDir`, if any
 * @property {string|null} flag  the `--project=<name>` value, if given
 * @property {string} cwd  where the verb was run; the project containing it is chosen
 * @property {string|null} envPort  the caller's inherited PORT, if any
 * @property {string} verb
 */

/** @typedef {{ project: import("./profiles.js").ProjectEntry } | { refuse: string[] }} Target */

/** Decide the project, or the lines that tell the user how to choose one.
 * Order: `--project=<name>` → the project cwd stands in → the install's only project.
 * @param {TargetInput} input @returns {Target} */
export function projectTarget({ resolution, projects, rootProjectDir, flag, cwd, envPort, verb }) {
  const install = resolution.root;
  /** @param {string} reason @param {string[]} [hint] @returns {Target} */
  const refuse = (reason, hint = []) => ({
    refuse: [
      `xenomoon ${verb}: ${reason} — nothing was run.`,
      `  install: ${install}  (${resolution.how})`,
      `  projects: ${projects.length ? projects.map((p) => p.name).join(", ") : "(none)"}`,
      ...hint,
      `  Projects are started and stopped from the hub: (cd ${shq(install)} && npm run hub)`,
    ],
  });
  const choose = `  Choose one: xenomoon ${verb} --project=<name>, or run it from inside the project folder.`;

  if (!projects.length) {
    const dir = rootProjectDir ?? "<your project folder>";
    return refuse(
      rootProjectDir
        ? `this install predates the projects map — its project ${rootProjectDir} is not in it`
        : "this install has no projects",
      [`  Add it, in the install: (cd ${shq(install)} && npm run install-project -- ${shq(dir)})`],
    );
  }

  /** @type {import("./profiles.js").ProjectEntry | null | undefined} */
  let project;
  if (flag !== null) {
    project = projects.find((p) => p.name === flag);
    if (!project) return refuse(`no project named "${flag}" in this install`, [choose]);
  } else {
    project = projectAt(cwd, projects).match;
    if (!project && projects.length === 1) project = projects[0];
    if (!project) return refuse(`${projects.length} projects and cwd is in none of them`, [choose]);
  }

  const problem = PORT_VERBS.includes(verb) ? portProblem(project, envPort, verb, install) : null;
  return problem ? refuse(problem[0], problem.slice(1)) : { project };
}

/** Why a port verb cannot run on `project`: it has no port, or the caller's PORT names another
 * one. The scripts select their server by PORT alone, so an inherited PORT that differs from the
 * project's would stop, or start on, whichever project owns that other port.
 * @param {import("./profiles.js").ProjectEntry} project @param {string|null} envPort
 * @param {string} verb @param {string} install
 * @returns {[string, ...string[]] | null} reason, then hints */
function portProblem(project, envPort, verb, install) {
  const where = `projects["${project.name}"].port in ${install}/.xenomoon.json`;
  if (project.port === null) {
    return [
      `project "${project.name}" has no port, and ${verb} selects its server by port`,
      `  Give it one: set ${where}.`,
    ];
  }
  if (!envPort) return null;
  // Compared as a number (#65): "04001" and " 4001 " are port 4001; only digits are a port.
  const text = envPort.trim();
  const asked = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!isPort(asked)) {
    return [
      `PORT=${envPort} is set in the environment, but it is not a port (an integer from 1 to ${MAX_PORT})`,
      `  A project's port lives in the install's projects map (${where}): unset PORT and run it again.`,
    ];
  }
  if (asked !== project.port) {
    return [
      `PORT=${envPort} is set in the environment, but project "${project.name}" runs on port ${project.port}`,
      `  A project's port lives in the install's projects map, not in PORT: other projects own the`,
      `  other ports. To change it, set ${where}; otherwise unset PORT and run it again.`,
    ];
  }
  return null;
}

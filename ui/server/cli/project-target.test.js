// projectTarget: --project wins, then the project cwd stands in, then the only project; every
// refusal names the install, its projects and the way to choose (or the command that adds one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectTarget } from "./project-target.js";

const INSTALL = "/ws/alpha-xm";
/** @param {string} name @param {number|null} port */
const entry = (name, port) => ({ install: INSTALL, name, dir: `/ws/${name}`, port });
const A = entry("a", 4001);
const B = entry("b", 4002);
const base = { root: INSTALL, how: "explicit --install" };

/** @param {Partial<import("./project-target.js").TargetInput>} over */
const target = (over) =>
  projectTarget({
    resolution: base,
    projects: [A, B],
    rootProjectDir: null,
    flag: null,
    cwd: "/ws",
    envPort: null,
    verb: "stop",
    ...over,
  });

/** @param {import("./project-target.js").Target} t */
const refusal = (t) => {
  assert.ok("refuse" in t, "expected a refusal");
  return t.refuse.join("\n");
};

test("--project=<name> wins over the project cwd stands in", () => {
  const t = target({ flag: "a", cwd: "/ws/b/src" });
  assert.deepEqual(t, { project: A });
});

test("the project cwd stands in is chosen when no --project is given", () => {
  const t = target({ resolution: { root: INSTALL, how: 'cwd is project "b"' }, cwd: "/ws/b" });
  assert.ok("project" in t);
  assert.equal(t.project.dir, "/ws/b");
  assert.equal(t.project.port, 4002);
});

test("an explicit install still finds the project cwd is in (no resolution.project needed)", () => {
  const t = target({ cwd: "/ws/b/src/deep" });
  assert.deepEqual(t, { project: B });
});

test("cwd inside another install's project is no match: the usual refusal", () => {
  const other = { install: "/ws/beta-xm", name: "c", dir: "/ws/c", port: 5001 };
  const msg = refusal(
    target({ projects: [A, B], cwd: "/ws/c", resolution: { ...base, project: other } }),
  );
  assert.match(msg, /2 projects and cwd is in none of them/);
  assert.match(msg, /projects: a, b/);
});

test("an inherited PORT that differs from the project's port is refused, naming both", () => {
  const msg = refusal(target({ cwd: "/ws/b", envPort: "4001", verb: "restart" }));
  assert.match(msg, /PORT=4001 is set in the environment, but project "b" runs on port 4002/);
  assert.match(msg, /port lives in the install's projects map/);
  assert.match(msg, /set projects\["b"\]\.port in \/ws\/alpha-xm\/\.xenomoon\.json/);
});

test("#65: an inherited PORT is compared as a number: 04001 and ' 4001 ' are port 4001", () => {
  assert.deepEqual(target({ cwd: "/ws/a", envPort: "04001" }), { project: A });
  assert.deepEqual(target({ cwd: "/ws/a", envPort: " 4001 " }), { project: A });
});

test("#65: an inherited PORT that is not a port is refused as not a port", () => {
  for (const bad of ["abc", "70000"]) {
    const msg = refusal(target({ cwd: "/ws/a", envPort: bad }));
    assert.match(msg, new RegExp(`PORT=${bad} is set in the environment, but it is not a port`));
    assert.match(msg, /an integer from 1 to 65535/);
  }
});

test("#65: a different valid PORT spelled with a leading zero is still refused, naming both", () => {
  const msg = refusal(target({ cwd: "/ws/a", envPort: "04002" }));
  assert.match(msg, /PORT=04002 is set in the environment, but project "a" runs on port 4001/);
});

test("an inherited PORT equal to the project's port is accepted; doctor ignores PORT", () => {
  assert.deepEqual(target({ cwd: "/ws/b", envPort: "4002" }), { project: B });
  assert.deepEqual(target({ cwd: "/ws/b", envPort: "4001", verb: "doctor" }), { project: B });
});

test("an install with exactly one project uses it", () => {
  const t = target({ projects: [A] });
  assert.ok("project" in t);
  assert.equal(t.project.dir, "/ws/a");
  assert.equal(t.project.port, 4001);
});

test("several projects and none chosen is refused with the names and how to choose", () => {
  const msg = refusal(target({}));
  assert.match(msg, /2 projects and cwd is in none of them/);
  assert.match(msg, /install: \/ws\/alpha-xm/);
  assert.match(msg, /projects: a, b/);
  assert.match(msg, /xenomoon stop --project=<name>, or run it from inside the project folder/);
  assert.match(msg, /started and stopped from the hub: \(cd '\/ws\/alpha-xm' && npm run hub\)/);
});

test("an unknown --project name is refused, listing the real names", () => {
  const msg = refusal(target({ flag: "zed" }));
  assert.match(msg, /no project named "zed"/);
  assert.match(msg, /projects: a, b/);
  assert.match(msg, /--project=<name>/);
});

test("a project with no port is refused for a port verb, with where to set it", () => {
  const msg = refusal(target({ flag: "a", projects: [entry("a", null), B], verb: "up" }));
  assert.match(msg, /project "a" has no port, and up selects its server by port/);
  assert.match(msg, /set projects\["a"\]\.port in \/ws\/alpha-xm\/\.xenomoon\.json/);
});

test("doctor does not need a port", () => {
  const t = target({ flag: "a", projects: [entry("a", null)], verb: "doctor" });
  assert.ok("project" in t);
  assert.equal(t.project.dir, "/ws/a");
  assert.equal(t.project.port, null);
});

test("a pre-projects-map install gets the exact command that adds its project", () => {
  const msg = refusal(target({ projects: [], rootProjectDir: "/ws/legacy", verb: "doctor" }));
  assert.match(msg, /predates the projects map/);
  assert.match(msg, /\(cd '\/ws\/alpha-xm' && npm run install-project -- '\/ws\/legacy'\)/);
  assert.match(msg, /projects: \(none\)/);
});

test("an install with no projects and no projectDir says so", () => {
  const msg = refusal(target({ projects: [] }));
  assert.match(msg, /this install has no projects/);
  assert.match(msg, /npm run install-project -- '<your project folder>'/);
});

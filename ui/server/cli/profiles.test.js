import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  parseProfiles,
  projectAt,
  projectsOf,
  projectsOfInstalls,
  readProfiles,
  salvageProfiles,
} from "./profiles.js";

/** @param {string} code @returns {() => never} */
const failWith = (code) => () => {
  throw Object.assign(new Error(`${code}: simulated`), { code });
};

/** A fake readFile serving `<install>/.xenomoon.json` from a map install → file text; any other
 * path is ENOENT. @param {Record<string, string>} files @returns {(file: string) => string} */
const fakeFiles = (files) => (file) => {
  const text = files[path.dirname(file)];
  if (path.basename(file) === ".xenomoon.json" && text !== undefined) return text;
  return failWith("ENOENT")();
};

/** @param {Record<string, unknown>} projects @param {Record<string, unknown>} [rest] */
const config = (projects, rest = {}) => JSON.stringify({ ...rest, projects });

/** @param {string} install @param {string} name @param {string} dir @param {number|null} [port] */
const entry = (install, name, dir, port = null) => ({ install, name, dir, port });

test("two valid profiles parse into a map", () => {
  const text = JSON.stringify({
    domain: "webapp",
    projects: {
      alpha: { dir: "/tmp/project-a", port: 3001, domain: "webapp" },
      beta: { dir: "/tmp/project-b" },
    },
  });
  assert.deepEqual(parseProfiles(text), {
    ok: true,
    projects: {
      alpha: { dir: "/tmp/project-a", port: 3001, domain: "webapp" },
      beta: { dir: "/tmp/project-b" },
    },
    port: null,
    projectDir: null,
  });
});

test("a config without projects gives an empty map", () => {
  assert.deepEqual(parseProfiles(JSON.stringify({ domain: "webapp" })), {
    ok: true,
    projects: {},
    port: null,
    projectDir: null,
  });
});

test("invalid JSON is refused", () => {
  const r = parseProfiles("{ not json");
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("JSON"), JSON.stringify(r));
});

test("projects given as an array is refused", () => {
  const r = parseProfiles(JSON.stringify({ projects: [{ dir: "/tmp/project-a" }] }));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("projects"), JSON.stringify(r));
});

test("a profile without dir is refused on dir", () => {
  const r = parseProfiles(JSON.stringify({ projects: { alpha: { port: 3001 } } }));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes('projects["alpha"].dir'), JSON.stringify(r));
});

test("a profile with a string port is refused on port", () => {
  const r = parseProfiles(
    JSON.stringify({ projects: { alpha: { dir: "/tmp/project-a", port: "3000" } } }),
  );
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes('projects["alpha"].port'), JSON.stringify(r));
});

test("#65: a map entry with port 65536 is invalid; 65535 is valid; salvage drops 65536", () => {
  /** @param {number} port */
  const text = (port) => JSON.stringify({ projects: { alpha: { dir: "/tmp/a", port } } });
  assert.deepEqual(parseProfiles(text(65536)), {
    ok: false,
    reason: 'projects["alpha"].port is above 65535',
  });
  assert.equal(parseProfiles(text(65535)).ok, true);
  const files = { "/i": text(65536) };
  assert.equal(salvageProfiles("/i", { readFile: fakeFiles(files) })?.entries[0]?.port, null);
});

test("a missing config file gives an empty map", () => {
  assert.deepEqual(readProfiles("/tmp/project-a", { readFile: failWith("ENOENT") }), {
    ok: true,
    projects: {},
    port: null,
    projectDir: null,
  });
});

test("a positive integer root port is carried through, any other value is null", () => {
  assert.deepEqual(parseProfiles(JSON.stringify({ port: 4100 })), {
    ok: true,
    projects: {},
    port: 4100,
    projectDir: null,
  });
  assert.equal(
    /** @type {{ port: unknown }} */ (parseProfiles(JSON.stringify({ port: "4100" }))).port,
    null,
  );
  assert.equal(
    /** @type {{ port: unknown }} */ (parseProfiles(JSON.stringify({ port: 0 }))).port,
    null,
  );
});

test("an unreadable config file is refused with the error code", () => {
  const r = readProfiles("/tmp/project-a", { readFile: failWith("EACCES") });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("EACCES"), JSON.stringify(r));
});

test("a saved root projectDir is carried through", () => {
  assert.deepEqual(parseProfiles(JSON.stringify({ projectDir: "/tmp/project-a" })), {
    ok: true,
    projects: {},
    port: null,
    projectDir: "/tmp/project-a",
  });
});

test("a non-string projectDir is refused on projectDir", () => {
  const r = parseProfiles(JSON.stringify({ projectDir: 42 }));
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason.includes("projectDir"), JSON.stringify(r));
});

test("projectsOf lists an install's projects sorted by name, with absolute dir and port or null", () => {
  const readFile = fakeFiles({
    "/i/one": config(
      { zeta: { dir: "/w/zeta", port: 3002 }, alpha: { dir: "rel/alpha" } },
      { projectDir: "/w/root", port: 4100 },
    ),
  });
  assert.deepEqual(projectsOf("/i/one", { readFile }), [
    entry("/i/one", "alpha", "/i/one/rel/alpha"),
    entry("/i/one", "zeta", "/w/zeta", 3002),
  ]);
});

test("projectsOf resolves the install path itself", () => {
  const readFile = fakeFiles({ "/i/one": config({ a: { dir: "/w/a" } }) });
  assert.deepEqual(projectsOf("/i/x/../one/", { readFile }), [entry("/i/one", "a", "/w/a")]);
});

test("projectsOf ignores the root projectDir", () => {
  const readFile = fakeFiles({ "/i/one": config({}, { projectDir: "/w/root" }) });
  assert.deepEqual(projectsOf("/i/one", { readFile }), []);
});

test("projectsOf gives [] for an invalid or unreadable install file", () => {
  const bad = fakeFiles({ "/i/one": config({ a: { port: 3000 } }) });
  assert.deepEqual(projectsOf("/i/one", { readFile: bad }), []);
  assert.deepEqual(projectsOf("/i/one", { readFile: failWith("EACCES") }), []);
});

test("projectsOfInstalls concatenates installs in sorted order and ignores the map values", () => {
  const readFile = fakeFiles({
    "/i/b": config({ x: { dir: "/w/bx" } }),
    "/i/a": config({ y: { dir: "/w/ay" }, x: { dir: "/w/ax" } }),
  });
  assert.deepEqual(projectsOfInstalls({ "/i/b": null, "/i/a": "/w/ignored" }, { readFile }), [
    entry("/i/a", "x", "/w/ax"),
    entry("/i/a", "y", "/w/ay"),
    entry("/i/b", "x", "/w/bx"),
  ]);
});

test("projectsOfInstalls skips a missing or invalid install file without throwing", () => {
  const readFile = fakeFiles({
    "/i/bad": "{ not json",
    "/i/good": config({ g: { dir: "/w/g" } }),
  });
  const installs = { "/i/bad": null, "/i/gone": null, "/i/good": null };
  assert.deepEqual(projectsOfInstalls(installs, { readFile }), [entry("/i/good", "g", "/w/g")]);
});

test("projectAt matches the project dir itself and a path below it", () => {
  const projects = [entry("/i/a", "p", "/w/p")];
  assert.deepEqual(projectAt("/w/p", projects), { match: projects[0], ambiguous: [] });
  assert.deepEqual(projectAt("/w/p/src/deep", projects), { match: projects[0], ambiguous: [] });
});

test("projectAt compares on path segments: /w/p does not contain /w/pq", () => {
  const projects = [entry("/i/a", "p", "/w/p")];
  assert.deepEqual(projectAt("/w/pq", projects), { match: null, ambiguous: [] });
  assert.deepEqual(projectAt("/w", projects), { match: null, ambiguous: [] });
});

test("projectAt picks the deepest enclosing project", () => {
  const outer = entry("/i/a", "outer", "/w/p");
  const inner = entry("/i/b", "inner", "/w/p/sub");
  assert.deepEqual(projectAt("/w/p/sub/x", [outer, inner]), { match: inner, ambiguous: [] });
  assert.deepEqual(projectAt("/w/p/sub/x", [inner, outer]), { match: inner, ambiguous: [] });
});

test("projectAt refuses as ambiguous when two installs list the same deepest dir", () => {
  const a = entry("/i/a", "p", "/w/p");
  const b = entry("/i/b", "q", "/w/p");
  const outer = entry("/i/c", "o", "/w");
  assert.deepEqual(projectAt("/w/p/x", [outer, a, b]), { match: null, ambiguous: [a, b] });
});

test("projectAt resolves cwd before comparing", () => {
  const projects = [entry("/i/a", "p", "/w/p")];
  assert.deepEqual(projectAt("/w/q/../p/./src/", projects), { match: projects[0], ambiguous: [] });
});

test("salvageProfiles keeps every field valid on its own when parseProfiles refuses the file", () => {
  const readFile = fakeFiles({
    "/i/one": config(
      { a: { dir: "/w/alpha-shop", port: 3118 }, broken: { dir: "beta-app", port: "oops" }, c: 7 },
      { projectDir: "/w/root" },
    ),
  });
  assert.equal(readProfiles("/i/one", { readFile }).ok, false);
  assert.deepEqual(salvageProfiles("/i/one", { readFile }), {
    projectDir: "/w/root",
    entries: [
      { name: "a", dir: "/w/alpha-shop", port: 3118 },
      { name: "broken", dir: path.resolve("/i/one", "beta-app"), port: null },
      { name: "c", dir: null, port: null },
    ],
  });
});

test("salvageProfiles trusts nothing in invalid JSON, a non-object root or a missing file", () => {
  const readFile = fakeFiles({ "/i/bad": "{nope", "/i/arr": "[]" });
  assert.equal(salvageProfiles("/i/bad", { readFile }), null);
  assert.equal(salvageProfiles("/i/arr", { readFile }), null);
  assert.equal(salvageProfiles("/i/none", { readFile }), null);
});

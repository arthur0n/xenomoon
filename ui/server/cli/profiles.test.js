import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProfiles, readProfiles } from "./profiles.js";

/** @param {string} code @returns {() => never} */
const failWith = (code) => () => {
  throw Object.assign(new Error(`${code}: simulated`), { code });
};

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

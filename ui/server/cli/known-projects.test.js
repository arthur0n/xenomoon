// The term list the contamination gate accuses files with. It has to be complete enough to
// catch a real leak and narrow enough that the framework's own vocabulary survives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { knownProjectTerms, namesFor, isUsableTerm } from "./known-projects.js";

test("a project's folder name is a term", () => {
  assert.deepEqual(namesFor("/ws/alpha"), ["alpha"]);
  assert.deepEqual(namesFor("/ws/Alpha"), ["alpha"], "matching is case-insensitive");
});

test("every registered install contributes, not just a bound one", () => {
  // The gap this closes: the trunk binds nothing, so the old list was empty and the gate
  // passed by having nothing to look for.
  const terms = knownProjectTerms({
    installs: { "/ws/alpha-xm": "/ws/alpha", "/ws/beta-xm": "/ws/beta" },
  });
  assert.deepEqual(terms, ["alpha", "beta"]);
});

test("a bound project counts even when the registry is empty", () => {
  assert.deepEqual(knownProjectTerms({ boundProjectDir: "/ws/gamma" }), ["gamma"]);
});

test("nothing known yields no terms — and the caller must say so, not pass silently", () => {
  assert.deepEqual(knownProjectTerms({}), []);
  assert.deepEqual(knownProjectTerms(), []);
});

test("generic words are never terms", () => {
  // A project named `api` would otherwise make the gate reject the framework's own vocabulary.
  for (const generic of ["ui", "app", "api", "core", "test", "docs", "project"])
    assert.equal(isUsableTerm(generic), false, generic);
  assert.equal(isUsableTerm("abc"), false, "too short to be evidence");
  assert.equal(isUsableTerm("alpha"), true);
});

test("generic project names are dropped from the list, not the whole list", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/api-xm": "/ws/api", "/ws/alpha-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha"]);
});

test("duplicates collapse and the order is stable", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/a-xm": "/ws/zulu", "/ws/b-xm": "/ws/zulu", "/ws/c-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha", "zulu"]);
});

test("junk registry entries are skipped rather than crashing the gate", () => {
  const terms = knownProjectTerms({
    installs: { "/ws/a-xm": null, "/ws/b-xm": "", "/ws/c-xm": 42, "/ws/d-xm": "/ws/alpha" },
  });
  assert.deepEqual(terms, ["alpha"]);
});

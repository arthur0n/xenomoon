// How the `builders` audience token resolves — and, more importantly, whether the answer is
// DECIDABLE. The distinction is a safety property of the skill-scope gate: "no domain answered"
// must be tolerated (a clean clone is a legitimate state) while "a domain answered, and its answer
// is none" must still be enforced. Conflating them once turned CI red on every push, and the
// obvious fix for that would have let a zero-builder pack ship agents preloading skills outside
// their audience with the gate reporting green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveBuilders } from "./skill-registry.js";

/** A throwaway framework root. @param {{ descriptor?: unknown, packs?: Record<string, unknown> }} shape */
function fixture(shape) {
  const root = mkdtempSync(path.join(tmpdir(), "xm-builders-"));
  if (shape.descriptor !== undefined) {
    writeFileSync(
      path.join(root, ".xenomoon.json"),
      JSON.stringify({ domainDescriptor: shape.descriptor }),
    );
  }
  for (const [name, domain] of Object.entries(shape.packs ?? {})) {
    mkdirSync(path.join(root, "domains", name), { recursive: true });
    writeFileSync(path.join(root, "domains", name, "domain.json"), JSON.stringify(domain));
  }
  return root;
}

test("a baked descriptor wins, and names the cohort", () => {
  const root = fixture({
    descriptor: { builders: ["developer"] },
    packs: { web: { builders: [] } },
  });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }), {
    builders: ["developer"],
    source: "baked",
  });
});

test("a baked EMPTY list is an answer, not an absence — the gate must still enforce", () => {
  const root = fixture({ descriptor: { builders: [] } });
  assert.deepEqual(resolveBuilders(root, {}), { builders: [], source: "baked" });
});

test("no binding falls back to the domain the environment names (how CI runs the gate)", () => {
  const root = fixture({ packs: { web: { builders: ["developer"] } } });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }), {
    builders: ["developer"],
    source: "env",
  });
});

test("a pack that declares an empty cohort has also answered", () => {
  const root = fixture({ packs: { web: { builders: [] } } });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }), {
    builders: [],
    source: "env",
  });
});

test("a bare trunk with no binding and no env is UNBOUND — nobody answered", () => {
  assert.deepEqual(resolveBuilders(fixture({}), {}), { builders: [], source: "unbound" });
});

test("a descriptor without a builders key is not an answer", () => {
  const root = fixture({ descriptor: { engine: { name: "node" } } });
  assert.deepEqual(resolveBuilders(root, {}), { builders: [], source: "unbound" });
});

test("an EXPLICIT env name that matches no pack is invalid, never tolerated as unbound", () => {
  const root = fixture({ packs: { web: { builders: ["developer"] } } });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "nope" }), {
    builders: [],
    source: "invalid",
  });
});

test("an env name is never used as a path escape", () => {
  const root = fixture({ packs: { web: { builders: ["developer"] } } });
  for (const hostile of ["../web", "web/../web", "/etc", "..", "we b"]) {
    assert.equal(
      resolveBuilders(root, { XENOMOON_DOMAIN: hostile }).source,
      "invalid",
      `rejected: ${hostile}`,
    );
  }
});

test("non-string entries are dropped rather than trusted into an audience", () => {
  const root = fixture({ descriptor: { builders: ["developer", 7, null, "tester"] } });
  assert.deepEqual(resolveBuilders(root, {}).builders, ["developer", "tester"]);
});

test("a BAKED descriptor that exists but cannot be parsed is invalid, not absent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-builders-"));
  writeFileSync(path.join(root, ".xenomoon.json"), "{ not json");
  assert.deepEqual(resolveBuilders(root, {}), { builders: [], source: "invalid" });
});

test("an env-NAMED pack that exists but cannot be parsed is invalid, not unbound", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-builders-"));
  mkdirSync(path.join(root, "domains", "web"), { recursive: true });
  writeFileSync(path.join(root, "domains", "web", "domain.json"), "{ broken");
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }), {
    builders: [],
    source: "invalid",
  });
});

test("a FORMER domain name resolves to the pack that renamed itself", () => {
  const root = fixture({
    packs: { expoapp: { formerNames: ["expo"], builders: ["developer"] } },
  });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "expo" }), {
    builders: ["developer"],
    source: "env",
  });
});

test("two packs claiming one former name is ambiguous, never a coin flip", () => {
  const root = fixture({
    packs: {
      a: { formerNames: ["old"], builders: ["dev-a"] },
      b: { formerNames: ["old"], builders: ["dev-b"] },
    },
  });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "old" }), {
    builders: [],
    source: "invalid",
  });
});

test("a live directory ALSO claimed as a former name is a conflict, as the real resolver says", () => {
  // domain-resolver.js throws here: while both exist a clone keeps loading the OLD pack, then
  // silently switches the day that directory is deleted. This gate must not pass what it refuses.
  const root = fixture({
    packs: { web: { builders: ["direct"] }, other: { formerNames: ["web"], builders: ["former"] } },
  });
  assert.equal(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }).source, "invalid");
});

test("a named pack with no builders key has still answered — no cohort, decidably", () => {
  const root = fixture({ packs: { web: { engine: { name: "node" } } } });
  assert.deepEqual(resolveBuilders(root, { XENOMOON_DOMAIN: "web" }), {
    builders: [],
    source: "env",
  });
});

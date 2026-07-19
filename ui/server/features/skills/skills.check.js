// Pure-function checks for computeSessionSkills (the testable core of resolveSessionSkills) — run:
//   node ui/server/features/skills/skills.check.js
// No test runner: computeSessionSkills is pure, so it's exercised directly. Guards the override
// semantics Layer 1 depends on (default-deny, wildcard, per-name, floor always-on, dedup).
// Importing skills.js triggers config.js's one-time engine probe — harmless, hand-run only.
import assert from "node:assert/strict";
import { computeSessionSkills } from "./skills.js";
import { ORCHESTRATOR_FRAMEWORK_SKILLS } from "./skill-catalog.js";
import { ORCH, readSkills, readAgents, expectedByAudience } from "./skill-registry.js";

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

const floor = ["caveman", "graphify"];
const candidates = ["init", "verify", "code-review"];
const sorted = (/** @type {string[]} */ a) => [...a].sort();

check("default-deny: no overrides → floor only (no built-ins, no domain skills)", () => {
  const out = computeSessionSkills({ floor, candidates, overrides: {} });
  assert.deepEqual(sorted(out), sorted(["caveman", "graphify"]));
});

check('wildcard "*":"on" → floor + ALL candidates', () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { "*": "on" } });
  assert.deepEqual(sorted(out), sorted([...floor, ...candidates]));
});

check('wildcard "on" + a per-name "off" removes just that one', () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { "*": "on", verify: "off" } });
  assert.ok(out.includes("init") && out.includes("code-review"));
  assert.ok(!out.includes("verify"));
});

check("default-deny + a per-name on → only that built-in is added to the floor", () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { init: "on" } });
  assert.deepEqual(sorted(out), sorted([...floor, "init"]));
});

check("floor is ALWAYS in, even when overrides try to disable it", () => {
  const out = computeSessionSkills({
    floor,
    candidates,
    overrides: { "*": "off", caveman: "off" },
  });
  assert.ok(out.includes("caveman") && out.includes("graphify"));
});

check("result is de-duplicated when a name is in both floor and candidates", () => {
  const out = computeSessionSkills({
    floor: ["caveman"],
    candidates: ["caveman"],
    overrides: { "*": "on" },
  });
  assert.deepEqual(out, ["caveman"]);
});

// --- caveman-forge rename + sub-agents-only scoping (real registry, config-free reads) ---

check("orchestrator floor carries no caveman variant (terse thinking is sub-agents-only)", () => {
  assert.ok(!ORCHESTRATOR_FRAMEWORK_SKILLS.includes("caveman"));
  assert.ok(!ORCHESTRATOR_FRAMEWORK_SKILLS.includes("caveman-forge"));
});

check('readSkills() has "caveman-forge" and NOT the shadowed builtin "caveman"', () => {
  const skills = readSkills();
  assert.ok(skills.has("caveman-forge"));
  assert.ok(!skills.has("caveman"));
});

check("caveman-forge projects onto every CORE agent and NOT onto the orchestrator", () => {
  const skills = readSkills();
  const agents = readAgents();
  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  const expected = expectedByAudience(skills, agentNames, workers);
  assert.ok(!(expected.get(ORCH) ?? new Set()).has("caveman-forge"));
  for (const name of agentNames)
    assert.ok(
      (expected.get(name) ?? new Set()).has("caveman-forge"),
      `agent \`${name}\` missing caveman-forge`,
    );
});

console.log(`ok  skills: ${passed} computeSessionSkills checks passed`);

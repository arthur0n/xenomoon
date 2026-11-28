// plugin/hooks/chrome-profile-gate.mjs (#110): a session may select only the project's own Chrome
// profile (`browser.deviceId` in the project's settings). The decision is tested as a function;
// the process (stdin, the settings file, the deny JSON) is spawned twice only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJSON } from "./json.js";

const HOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugin",
  "hooks",
  "chrome-profile-gate.mjs",
);
// A computed specifier, not a static import: tsc would follow a static one into the hook and on
// into plugin/hooks/project-policy.mjs, which is not under ui/ and is not type-clean.
/** @typedef {{ verdict: "pass" } | { verdict: "deny", reason: string }} Decision */
/**
 * @typedef {object} Gate
 * @property {Record<"wrongProfile" | "notReady" | "switchRefused" | "unreadable", string>} REASONS
 * @property {string} SELECT_TOOL
 * @property {string} SWITCH_TOOL
 * @property {(browser: unknown, call: Record<string, unknown>) => Decision} chromeProfileDecision
 */
/** @type {unknown} */
const loaded = await import(pathToFileURL(HOOK).href);
const gate = /** @type {Gate} */ (loaded);
const { REASONS, SELECT_TOOL, SWITCH_TOOL, chromeProfileDecision } = gate;
const HOOKS_JSON = path.join(path.dirname(HOOK), "hooks.json");
const ID1 = "00000000-0000-0000-0000-000000000001";
const ID2 = "00000000-0000-0000-0000-000000000002";

/** @param {unknown} deviceId */
const select = (deviceId) => ({ tool_name: SELECT_TOOL, tool_input: { deviceId } });

test("select_browser: the project's own id passes, another id or none is denied as the wrong profile", () => {
  const browser = { deviceId: ID1 };
  assert.deepEqual(chromeProfileDecision(browser, select(ID1)), { verdict: "pass" });
  const wrong = { verdict: "deny", reason: REASONS.wrongProfile };
  assert.deepEqual(chromeProfileDecision(browser, select(ID2)), wrong);
  assert.deepEqual(
    chromeProfileDecision(browser, { tool_name: SELECT_TOOL, tool_input: {} }),
    wrong,
  );
  assert.deepEqual(chromeProfileDecision(browser, { tool_name: SELECT_TOOL }), wrong);
});

test("select_browser: no configured id (empty, missing, not a string) is denied as setup not ready", () => {
  const notReady = { verdict: "deny", reason: REASONS.notReady };
  for (const browser of [{ deviceId: "" }, {}, null, undefined, { deviceId: 5 }])
    assert.deepEqual(
      chromeProfileDecision(browser, select(ID1)),
      notReady,
      JSON.stringify(browser),
    );
  // An empty configured id must not match an empty requested id.
  assert.deepEqual(chromeProfileDecision({ deviceId: "" }, select("")), notReady);
});

test("switch_browser is always denied, also when the project has an id", () => {
  const refused = { verdict: "deny", reason: REASONS.switchRefused };
  assert.deepEqual(chromeProfileDecision({ deviceId: ID1 }, { tool_name: SWITCH_TOOL }), refused);
  assert.deepEqual(chromeProfileDecision({ deviceId: "" }, { tool_name: SWITCH_TOOL }), refused);
});

test("no refusal reason contains the project's id or the requested id", () => {
  const decisions = [
    chromeProfileDecision({ deviceId: ID1 }, select(ID2)),
    chromeProfileDecision({ deviceId: ID1 }, { tool_name: SWITCH_TOOL, tool_input: select(ID2) }),
    chromeProfileDecision({ deviceId: "" }, select(ID2)),
  ];
  for (const d of decisions) {
    assert.equal(d.verdict, "deny");
    if (d.verdict === "deny") for (const id of [ID1, ID2]) assert.ok(!d.reason.includes(id));
  }
  for (const reason of Object.values(REASONS))
    for (const id of [ID1, ID2]) assert.ok(!reason.includes(id));
});

const root = mkdtempSync(path.join(os.tmpdir(), "chrome-gate-"));
after(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run the hook with `input` on stdin; the process folder is the temp root, never a project.
 * @param {string} input */
function runHook(input) {
  const r = spawnSync("node", [HOOK], { input, encoding: "utf8", cwd: root });
  return { status: r.status, out: r.stdout };
}

/** @param {{ status: number | null, out: string }} r @param {string} reason */
function assertDenied(r, reason) {
  assert.equal(r.status, 0);
  assert.deepEqual(parseJSON(r.out), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

test("process: select_browser with another id than the project's prints the deny JSON and exits 0", () => {
  const proj = path.join(root, "proj");
  mkdirSync(path.join(proj, ".xenomoon"), { recursive: true });
  writeFileSync(
    path.join(proj, ".xenomoon", "settings.json"),
    JSON.stringify({ browser: { deviceId: ID1 } }),
  );
  const r = runHook(JSON.stringify({ ...select(ID2), cwd: proj }));
  assertDenied(r, REASONS.wrongProfile);
});

test("process: input that is not JSON is denied (fails closed)", () => {
  assertDenied(runHook("not json {"), REASONS.unreadable);
});

test("hooks.json registers the gate for exactly select_browser and switch_browser", () => {
  const hooks =
    /** @type {{ hooks: { PreToolUse: { matcher?: string, hooks: { command: string }[] }[] } }} */ (
      parseJSON(readFileSync(HOOKS_JSON, "utf8"))
    ).hooks;
  const entries = hooks.PreToolUse.filter((e) =>
    e.hooks.some((h) => h.command.includes("chrome-profile-gate.mjs")),
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0]?.matcher?.split("|").sort(), [SELECT_TOOL, SWITCH_TOOL]);
});

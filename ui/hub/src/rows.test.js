// Tests for the hub page's list logic (rows.js): screen state, order, actions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actionsOf, rowItems, screenOf, sortRows } from "./rows.js";

/** @typedef {import("./rows.js").HubViewRow} HubViewRow */

/** @param {Partial<HubViewRow>} over @returns {HubViewRow} */
function row(over = {}) {
  return {
    id: "a1",
    install: "/i",
    name: "alpha",
    project: "/p",
    port: 4100,
    domain: null,
    state: "off",
    ...over,
  };
}

/** @param {"idle" | "working" | "waiting"} state @param {string} [lastLine] */
function on(state, lastLine = "last") {
  const status = {
    name: "alpha",
    path: "/p",
    domain: "webapp",
    port: 4100,
    pid: 1,
    state,
    sessions: 1,
    lastLine,
    at: "t",
  };
  return row({ state: "on", status });
}

void test("on + waiting is needs-you and carries the waiting text", () => {
  assert.deepEqual(screenOf(on("waiting", "approve deploy?")), {
    state: "needs-you",
    label: "needs you",
    waiting: "approve deploy?",
  });
});

void test("working and idle carry no waiting text", () => {
  assert.deepEqual(screenOf(on("working")), { state: "working", label: "working" });
  assert.deepEqual(screenOf(on("idle")), { state: "idle", label: "idle" });
});

void test("on with watch no-stream is 'on, update this install' even when the probe said waiting", () => {
  assert.deepEqual(screenOf({ ...on("waiting"), watch: "no-stream" }), {
    state: "no-stream",
    label: "on, update this install",
  });
});

void test("on without a status yet is on-no-status", () => {
  assert.deepEqual(screenOf(row({ state: "on" })), {
    state: "on-no-status",
    label: "on, no status yet",
  });
});

void test("off, held, unknown, unbound show their own plain words", () => {
  const labels = /** @type {const} */ (["off", "held", "unknown", "unbound"]).map(
    (state) => screenOf(row({ state })).label,
  );
  assert.deepEqual(labels, [
    "off",
    "port used by another project",
    "state not known",
    "no port set",
  ]);
});

void test("order: needs-you, working, idle, no-status, no-stream, held, unknown, unbound, off", () => {
  const rows = [
    row({ id: "off", state: "off" }),
    row({ id: "unb", state: "unbound", port: null }),
    row({ id: "unk", state: "unknown" }),
    row({ id: "held", state: "held" }),
    { ...on("idle"), id: "ns", watch: /** @type {const} */ ("no-stream") },
    row({ id: "nos", state: "on" }),
    { ...on("idle"), id: "idle" },
    { ...on("working"), id: "work" },
    { ...on("waiting"), id: "wait" },
  ];
  assert.deepEqual(
    sortRows(rows).map((r) => r.id),
    ["wait", "work", "idle", "nos", "ns", "held", "unk", "unb", "off"],
  );
});

void test("inside a group by name then id, whatever the input order", () => {
  const rows = [
    row({ id: "b", name: "beta" }),
    row({ id: "z", name: "alpha" }),
    row({ id: "y", name: "alpha" }),
  ];
  const expected = ["y", "z", "b"];
  assert.deepEqual(
    sortRows(rows).map((r) => r.id),
    expected,
  );
  assert.deepEqual(
    sortRows([...rows].reverse()).map((r) => r.id),
    expected,
  );
});

void test("an on row offers stop and open at its address", () => {
  assert.deepEqual(actionsOf(on("idle"), []), {
    open: { url: "http://127.0.0.1:4100/", startFirst: false },
    start: false,
    stop: true,
  });
});

void test("an off row offers start, and open means start first", () => {
  assert.deepEqual(actionsOf(row(), [row()]), {
    open: { url: "http://127.0.0.1:4100/", startFirst: true },
    start: true,
    stop: false,
  });
});

void test("an off stale row offers nothing (lifecycle refuses its start)", () => {
  const stale = row({ stale: { file: "/i/.xenomoon.json", reason: "bad json" } });
  assert.deepEqual(actionsOf(stale, [stale]), { open: null, start: false, stop: false });
});

void test("an off row whose port another row holds on offers nothing", () => {
  const off = row();
  const peer = { ...on("idle"), id: "b2", name: "beta" };
  assert.deepEqual(actionsOf(off, [off, peer]), { open: null, start: false, stop: false });
});

void test("held, unknown and unbound rows offer nothing", () => {
  for (const state of /** @type {const} */ (["held", "unknown", "unbound"])) {
    assert.deepEqual(
      actionsOf(row({ state }), []),
      { open: null, start: false, stop: false },
      state,
    );
  }
});

void test("rowItems returns the sorted rows with screen and actions", () => {
  const items = rowItems([row({ id: "o" }), { ...on("waiting", "q?"), id: "w" }]);
  assert.deepEqual(
    items.map((i) => [i.row.id, i.screen.state, i.actions.stop]),
    [
      ["w", "needs-you", true],
      ["o", "off", false],
    ],
  );
});

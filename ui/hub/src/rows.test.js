// Tests for the hub page's list logic (rows.js): screen state, order, actions, address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actionsOf, addressOf, rowItems, screenOf, sortRows, tabNameOf } from "./rows.js";

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

void test("an on row with a port offers stop and open", () => {
  assert.deepEqual(actionsOf(on("idle"), []), { start: false, stop: true, open: true });
});

void test("an off row offers start, and not open", () => {
  assert.deepEqual(actionsOf(row(), [row()]), { start: true, stop: false, open: false });
});

void test("an off stale row offers nothing (lifecycle refuses its start)", () => {
  const stale = row({ stale: { file: "/i/.xenomoon.json", reason: "bad json" } });
  assert.deepEqual(actionsOf(stale, [stale]), { start: false, stop: false, open: false });
});

void test("an off row whose port another row holds on offers nothing", () => {
  const off = row();
  const peer = { ...on("idle"), id: "b2", name: "beta" };
  assert.deepEqual(actionsOf(off, [off, peer]), { start: false, stop: false, open: false });
});

void test("held, unknown and unbound rows offer nothing", () => {
  for (const state of /** @type {const} */ (["held", "unknown", "unbound"])) {
    assert.deepEqual(
      actionsOf(row({ state }), []),
      { start: false, stop: false, open: false },
      state,
    );
  }
});

void test("every row state gives start, stop and open, and only an on row offers open", () => {
  const states = /** @type {const} */ (["on", "off", "held", "unknown", "unbound"]);
  for (const state of states) {
    const actions = actionsOf(row({ state }), []);
    assert.deepEqual(Object.keys(actions).sort(), ["open", "start", "stop"], state);
    assert.equal(actions.open, state === "on", state);
  }
  assert.equal(actionsOf(on("waiting"), []).open, true);
});

void test("addressOf: an on row with a port gives its address; off or no port gives nothing", () => {
  assert.equal(addressOf(on("idle")), "http://127.0.0.1:4100/");
  assert.equal(addressOf({ ...on("idle"), watch: "no-stream" }), "http://127.0.0.1:4100/");
  assert.equal(addressOf(row({ state: "on", port: null })), null);
  for (const state of /** @type {const} */ (["off", "held", "unknown", "unbound"])) {
    assert.equal(addressOf(row({ state })), null, state);
  }
});

void test("addressOf and open: an on row whose port is not an integer from 1 to 65535 gives no address", () => {
  const bad = ["80@evil.example", "4100", 0, 65536, 4100.5, NaN];
  for (const port of bad) {
    const r = row({ state: "on", port: /** @type {number} */ (/** @type {unknown} */ (port)) });
    assert.equal(addressOf(r), null, String(port));
    assert.equal(actionsOf(r, []).open, false, String(port));
  }
  assert.equal(addressOf(row({ state: "on", port: 4100 })), "http://127.0.0.1:4100/");
});

void test("rowItems returns the sorted rows with screen and actions", () => {
  const items = rowItems([row({ id: "o" }), { ...on("waiting", "q?"), id: "w" }]);
  assert.deepEqual(
    items.map((i) => [i.row.id, i.screen.state, i.actions.stop, i.address]),
    [
      ["w", "needs-you", true, "http://127.0.0.1:4100/"],
      ["o", "off", false, null],
    ],
  );
});

void test("open is offered on every on state that has a port", () => {
  const cases = {
    "needs-you": on("waiting"),
    working: on("working"),
    idle: on("idle"),
    "on-no-status": row({ state: "on" }),
    "no-stream": { ...on("idle"), watch: /** @type {const} */ ("no-stream") },
  };
  for (const [name, r] of Object.entries(cases)) {
    assert.equal(screenOf(r).state, name);
    assert.equal(actionsOf(r, []).open, true, name);
  }
});

void test("open is not offered on off, held, unknown, unbound, nor on an on row without a port", () => {
  for (const state of /** @type {const} */ (["off", "held", "unknown", "unbound"])) {
    assert.equal(actionsOf(row({ state }), [row({ state })]).open, false, state);
  }
  assert.equal(actionsOf(row({ state: "on", port: null }), []).open, false);
});

void test("rowItems carries open on each item", () => {
  const items = rowItems([row({ id: "o" }), { ...on("idle"), id: "i" }]);
  assert.deepEqual(
    items.map((i) => [i.row.id, i.actions.open]),
    [
      ["i", true],
      ["o", false],
    ],
  );
});

void test("tabNameOf: same id and port same name, another port or id another name, never starts with _", () => {
  const a = row({ id: "a1", port: 4100 });
  assert.equal(tabNameOf(a), tabNameOf(row({ id: "a1", port: 4100, name: "other" })));
  assert.notEqual(tabNameOf(a), tabNameOf(row({ id: "a1", port: 4101 })));
  assert.notEqual(tabNameOf(a), tabNameOf(row({ id: "b2", port: 4100 })));
  for (const id of ["a1", "_x", "0"]) assert.ok(!tabNameOf(row({ id })).startsWith("_"), id);
});

// tasks.js (#108): a flow task's row has no status toggle and a "Flow" stamp; its × asks
// window.confirm (naming the issue) and sends the remove only on accept. Other rows remove at once.
// The module loads under a minimal fake document; the click decision is tested through
// removeClick with a stubbed confirm and send, the row shape through createRow.
import { test, after } from "node:test";
import assert from "node:assert/strict";

/** A minimal DOM node: what createRow/updateRow touch. */
class Node {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag;
    /** @type {Node[]} */ this.children = [];
    this.className = "";
    this.text = "";
    this.title = "";
    /** @type {Node | null} */ this.parent = null;
    /** @type {Record<string, string>} */ this.dataset = {};
    /** @type {(() => void) | null} */ this.onclick = null;
    this.style = { setProperty() {}, removeProperty() {}, display: "" };
    const cls = () => new Set(this.className.split(" ").filter(Boolean));
    const put = (/** @type {Set<string>} */ s) => {
      this.className = [...s].join(" ");
    };
    this.classList = {
      add: (/** @type {string[]} */ ...c) => {
        put(new Set([...cls(), ...c]));
      },
      remove: (/** @type {string[]} */ ...c) => {
        const s = cls();
        for (const x of c) s.delete(x);
        put(s);
      },
      contains: (/** @type {string} */ c) => cls().has(c),
      toggle: (/** @type {string} */ c, /** @type {boolean} */ on) => {
        if (on) this.classList.add(c);
        else this.classList.remove(c);
      },
    };
  }
  /** @param {...Node} xs */
  append(...xs) {
    for (const x of xs) x.parent = this;
    this.children.push(...xs);
  }
  /** @returns {Node | null} */
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  /** @param {Node} n */
  replaceWith(n) {
    const p = /** @type {Node} */ (this.parent);
    p.children[p.children.indexOf(this)] = n;
    n.parent = p;
  }
  /** @param {...Node} xs */
  replaceChildren(...xs) {
    this.children = xs;
  }
  setAttribute() {}
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(/** @type {string} */ v) {
    this.text = v;
    this.children = [];
  }
  /** First descendant carrying the class of a ".cls" selector. @param {string} sel @returns {Node | null} */
  querySelector(sel) {
    const want = sel.slice(1);
    for (const c of this.children) {
      if (c.className.split(" ").includes(want)) return c;
      const hit = c.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
}

/** @type {{ document?: unknown, location?: unknown, WebSocket?: unknown, window?: unknown }} */
const g = globalThis;
const KEYS = /** @type {const} */ (["document", "location", "WebSocket", "window"]);
const prev = {
  document: g.document,
  location: g.location,
  WebSocket: g.WebSocket,
  window: g.window,
};
const had = {
  document: "document" in g,
  location: "location" in g,
  WebSocket: "WebSocket" in g,
  window: "window" in g,
};
g.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: (/** @type {string} */ t) => new Node(t),
};
// tasks.js → websocket.js reads `location` and connects at import time: a fake socket that is
// "open" (so the real `send` writes to it, recorded in `wire`) and never closes, so no network
// and no reconnect timer.
/** @type {object[]} */
const wire = [];
g.location = { search: "", host: "test.invalid" };
g.WebSocket = class {
  static OPEN = 1;
  readyState = 1;
  /** @param {string} s */
  send(s) {
    /** @type {unknown} */
    const msg = JSON.parse(s);
    wire.push(/** @type {object} */ (msg));
  }
};
/** What the real button's window.confirm is asked, and what it answers.
 * @type {{ yes: boolean, asked: string[] }} */
const confirmStub = { yes: false, asked: [] };
g.window = {
  confirm: (/** @type {string} */ q) => (confirmStub.asked.push(q), confirmStub.yes),
};
const { createRow, updateRow, removeClick, flowRemoveText } = await import("./tasks.js");
after(() => {
  for (const k of KEYS) {
    if (had[k]) g[k] = prev[k];
    else delete g[k];
  }
});

/** @typedef {import("../../../lib/types.js").Task} Task */
/** @type {Task} */
const flow = {
  id: "t3",
  title: "#84 · Design · triage 0/2 · fix 0/3",
  owner: "agent",
  status: "in_progress",
  kind: "flow",
  created: "now",
};
/** @type {Task} */
const plain = { id: "t4", title: "write tests", owner: "agent", status: "pending", created: "now" };

/** A stubbed confirm that answers `yes` and records its questions. @param {boolean} yes */
function stubAsk(yes) {
  /** @type {string[]} */ const asked = [];
  return { asked, ask: (/** @type {string} */ q) => (asked.push(q), yes) };
}

void test("flow remove, cancelled: confirm names the issue and nothing is sent", () => {
  const { asked, ask } = stubAsk(false);
  /** @type {object[]} */ const sent = [];
  removeClick(flow, ask, (m) => void sent.push(m));
  assert.deepEqual(asked, ["Remove the flow state of #84? The issue then starts again from zero."]);
  assert.deepEqual(sent, []);
});

void test("flow remove, accepted: exactly one remove with the task id", () => {
  const { ask } = stubAsk(true);
  /** @type {object[]} */ const sent = [];
  removeClick(flow, ask, (m) => void sent.push(m));
  assert.deepEqual(sent, [{ type: "task_update", op: "remove", id: "t3" }]);
});

void test("a normal row removes at once, without a confirm", () => {
  const { asked, ask } = stubAsk(false);
  /** @type {object[]} */ const sent = [];
  removeClick(plain, ask, (m) => void sent.push(m));
  assert.deepEqual(asked, []);
  assert.deepEqual(sent, [{ type: "task_update", op: "remove", id: "t4" }]);
});

void test("a flow row has no status toggle, a Flow stamp and the title as given", () => {
  const row = /** @type {Node} */ (/** @type {unknown} */ (createRow(flow)));
  assert.equal(row.querySelector(".task-tick"), null);
  assert.equal(row.children[0]?.onclick, null);
  assert.equal(row.querySelector(".owner-chip")?.textContent, "Flow");
  assert.equal(row.querySelector(".task-title")?.textContent, flow.title);
  assert.equal(
    flowRemoveText(flow),
    "Remove the flow state of #84? The issue then starts again from zero.",
  );
});

void test("a normal row keeps its status toggle", () => {
  const row = /** @type {Node} */ (/** @type {unknown} */ (createRow(plain)));
  assert.equal(typeof row.querySelector(".task-tick")?.onclick, "function");
});

// A reused server id: the reconciler keeps the row and calls updateRow with the new task. The
// real buttons must act on the CURRENT task. Driven through the row's own onclick handlers.

/** @param {Task} t @returns {Node} */
const rowOf = (t) => /** @type {Node} */ (/** @type {unknown} */ (createRow(t)));
/** @param {Node} row @param {Task} t */
const rerender = (row, t) => {
  updateRow(/** @type {HTMLElement} */ (/** @type {unknown} */ (row)), t);
};
/** Click the row's × with confirm answering `yes`; returns what confirm asked and what was sent.
 * @param {Node} row @param {boolean} yes */
function clickRemove(row, yes) {
  confirmStub.yes = yes;
  confirmStub.asked = [];
  wire.length = 0;
  row.querySelector(".task-remove")?.onclick?.();
  return { asked: confirmStub.asked, sent: [...wire] };
}
/** @param {string} title @returns {Task} */
const flowAs = (title) => ({ ...flow, id: "t1", title });
/** @type {Task} */
const plainT1 = { ...plain, id: "t1" };

void test("reused id, normal → flow: the × asks for the current issue and cancel sends nothing", () => {
  const row = rowOf(plainT1);
  rerender(row, flowAs("#84 · Design · triage 0/2 · fix 0/3"));
  assert.equal(row.querySelector(".task-tick"), null);
  const { asked, sent } = clickRemove(row, false);
  assert.deepEqual(asked, ["Remove the flow state of #84? The issue then starts again from zero."]);
  assert.deepEqual(sent, []);
  assert.deepEqual(clickRemove(row, true).sent, [{ type: "task_update", op: "remove", id: "t1" }]);
});

void test("reused id, flow #84 → flow #85: the confirm names #85", () => {
  const row = rowOf(flowAs("#84 · Design · triage 0/2 · fix 0/3"));
  rerender(row, flowAs("#85 · Screening · triage 0/2 · fix 0/3"));
  assert.deepEqual(clickRemove(row, false).asked, [
    "Remove the flow state of #85? The issue then starts again from zero.",
  ]);
});

void test("reused id, flow → normal: the toggle is back and sends an update; × needs no confirm", () => {
  const row = rowOf(flowAs("#84 · Design · triage 0/2 · fix 0/3"));
  rerender(row, plainT1);
  wire.length = 0;
  row.querySelector(".task-tick")?.onclick?.();
  assert.deepEqual(wire, [{ type: "task_update", op: "update", id: "t1", status: "in_progress" }]);
  const { asked, sent } = clickRemove(row, false);
  assert.deepEqual(asked, []);
  assert.deepEqual(sent, [{ type: "task_update", op: "remove", id: "t1" }]);
});

// Drives the real re-attach path: handleConnection(ws, ?resume=<id>) on a hand-built live session
// in the registry. Proves the order session, history (the window), flushed buffer, resync.
// No SDK query starts: the live branch returns before runSession. Doubles only, no server, no disk.
process.env.XENOMOON_DOMAIN ??= "webapp";
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
process.env.GAME_DIR = path.join(os.tmpdir(), `xenomoon-no-project-${process.pid}-${Date.now()}`);
import { parseJSON } from "../../lib/json.js";
const { handleConnection } = await import("./session.js");
const { registerLive } = await import("./registry.js");
const { teardown } = await import("./connection.js");
const { createChatWindow } = await import("./chat-window.js");

/** @typedef {import("./connection.js").LiveSession} LiveSession */
/** @typedef {import("ws").WebSocket} WebSocket */
/** @typedef {{ type: string, id?: string, items: unknown[], message: { message: { content: unknown[] } } }} Wire */

const ID = "sess-reattach";
/** @type {LiveSession[]} */
let made = [];

beforeEach(() => {
  mock.method(console, "log", () => {});
});
afterEach(() => {
  for (const ls of made) teardown(ls); // clears the grace timer, drops the registry entry
  made = [];
  mock.restoreAll();
});

/** A socket double: OPEN, records what it was sent and how it was closed. */
function makeSocket() {
  /** @type {Wire[]} */
  const sent = [];
  /** @type {Array<[number, string]>} */
  const closed = [];
  const ws = /** @type {WebSocket} */ (
    /** @type {unknown} */ ({
      readyState: 1,
      OPEN: 1,
      on: () => {},
      send: (/** @type {string} */ s) => sent.push(/** @type {Wire} */ (parseJSON(s))),
      close: (/** @type {number} */ code, /** @type {string} */ reason) => {
        closed.push([code, reason]);
      },
    })
  );
  return { ws, sent, closed };
}

const mainEvent = () => ({
  type: "event",
  message: {
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      content: [
        { type: "text", text: "hello" },
        { type: "tool_use", id: "tu1", name: "Read", input: {} },
      ],
    },
  },
});

/** A registered live session: 3 window items, buffer [status, main event, result], detached. */
function liveSession() {
  const chat = createChatWindow([
    { role: "user", text: "one" },
    { role: "assistant", text: "two" },
    { role: "user", text: "three" },
  ]);
  /** @type {LiveSession} */
  const ls = /** @type {LiveSession} */ (
    /** @type {unknown} */ ({
      id: ID,
      conn: {
        socket: null,
        buffer: [{ type: "status", text: "s" }, mainEvent(), { type: "result" }],
      },
      inbox: { close: () => {} },
      pending: new Map(),
      abort: new AbortController(),
      session: {},
      busy: { value: false },
      send: (/** @type {any} */ obj) => {
        const s = ls.conn.socket;
        if (s) s.send(JSON.stringify(obj));
      },
      endLog: () => {},
      graceTimer: null,
      announced: true,
      done: false,
      resync: () => {
        ls.send({ type: "marker" });
      },
      lastLine: "",
      runningAgents: 0,
      activitySeq: 0,
      chat,
    })
  );
  made.push(ls);
  registerLive(ID, ls);
  return ls;
}

/** @param {Wire[]} list @param {number} i @returns {Wire} */
function at(list, i) {
  const m = list[i];
  assert.ok(m, `message ${i} missing`);
  return m;
}

const attach = (/** @type {WebSocket} */ ws) => {
  handleConnection(
    ws,
    /** @type {import("node:http").IncomingMessage} */ ({ url: `/?resume=${ID}` }),
  );
};

test("re-attach sends session, then the 3-item window, then the flushed buffer, then resync", () => {
  liveSession();
  const { ws, sent } = makeSocket();
  attach(ws);
  const types = sent.map((m) => m.type);
  assert.deepEqual(types, ["session", "history", "status", "event", "result", "marker"]);
  assert.equal(at(sent, 0).id, ID);
  assert.deepEqual(at(sent, 1).items, [
    { role: "user", text: "one" },
    { role: "assistant", text: "two" },
    { role: "user", text: "three" },
  ]);
  assert.deepEqual(at(sent, 3).message.message.content, [
    { type: "tool_use", id: "tu1", name: "Read", input: {} },
  ]);
});

test("a second re-attach gets the window again and closes the first socket with 4000", () => {
  liveSession();
  const first = makeSocket();
  attach(first.ws);
  const second = makeSocket();
  attach(second.ws);
  assert.equal(at(second.sent, 0).type, "session");
  assert.equal(at(second.sent, 1).type, "history");
  assert.equal(at(second.sent, 1).items.length, 3);
  assert.deepEqual(first.closed, [[4000, "session re-attached"]]);
});

test("the window sent is a snapshot: a later chat item does not change it", () => {
  const ls = liveSession();
  const { ws, sent } = makeSocket();
  attach(ws);
  const history = at(
    sent,
    sent.findIndex((m) => m.type === "history"),
  );
  ls.chat.add({ role: "assistant", text: "four" });
  assert.equal(history.items.length, 3);
  assert.equal(ls.chat.items().length, 4);
});

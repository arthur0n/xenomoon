// The chat window: the last CHAT_WINDOW chat items of a live session, fed by messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatWindow } from "./chat-window.js";
import { CHAT_WINDOW } from "../../lib/chat-items.js";

/** @param {number} n @returns {import("../../lib/types.js").HistoryItem} */
const item = (n) => ({ role: "user", text: `m${n}` });
/** @param {number} from @param {number} to */
const range = (from, to) => Array.from({ length: to - from }, (_, i) => item(from + i));
/** @param {unknown} message */
const asMsg = (message) => /** @type {import("../../lib/chat-items.js").ChatSource} */ (message);

test("a seed longer than the window keeps its last CHAT_WINDOW items in order", () => {
  const w = createChatWindow(range(0, CHAT_WINDOW + 20));
  assert.deepEqual(w.items(), range(20, CHAT_WINDOW + 20));
});

test("add past the window drops the oldest item", () => {
  const w = createChatWindow(range(0, CHAT_WINDOW));
  w.add(item(CHAT_WINDOW));
  assert.equal(w.items().length, CHAT_WINDOW);
  assert.deepEqual(w.items(), range(1, CHAT_WINDOW + 1));
});

test("addMessage adds main-conversation text and returns the item", () => {
  const w = createChatWindow();
  const got = w.addMessage(
    asMsg({
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "text", text: " hello " }] },
    }),
  );
  assert.deepEqual(got, { role: "assistant", text: "hello" });
  assert.deepEqual(w.items(), [{ role: "assistant", text: "hello" }]);
});

test("addMessage returns null and adds nothing for sub-agent, tool-only and wrapper messages", () => {
  const w = createChatWindow();
  const text = (/** @type {string} */ t) => ({ content: [{ type: "text", text: t }] });
  const cases = [
    { type: "assistant", parent_tool_use_id: "toolu_1", message: text("sub") },
    {
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "tool_use", id: "t", name: "x", input: {} }] },
    },
    { type: "user", parent_tool_use_id: null, message: text("<command-name>x</command-name>") },
  ];
  for (const c of cases) assert.equal(w.addMessage(asMsg(c)), null);
  assert.deepEqual(w.items(), []);
  const kept = { type: "user", parent_tool_use_id: null, message: text("Caveat: local") };
  assert.deepEqual(w.addMessage(asMsg(kept)), { role: "user", text: "Caveat: local" });
  assert.deepEqual(w.items(), [{ role: "user", text: "Caveat: local" }]);
});

test("items returns a new array each call: changing it leaves the window as it was", () => {
  const w = createChatWindow(range(0, 3));
  const a = w.items();
  a.push(item(99));
  a.length = 0;
  assert.notEqual(w.items(), w.items());
  assert.deepEqual(w.items(), range(0, 3));
});

test("120 mixed adds end with exactly the last CHAT_WINDOW items in order", () => {
  const w = createChatWindow();
  for (let i = 0; i < 120; i++) {
    if (i % 2) w.add(item(i));
    else w.addMessage(asMsg({ type: "user", message: { content: `m${i}` } }));
  }
  assert.deepEqual(w.items(), range(70, 120));
});

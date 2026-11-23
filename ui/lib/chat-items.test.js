// chat-items.js (#96): one chat item per message, stored or live, and the window.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_WINDOW,
  LOCAL_COMMAND_CAVEAT,
  WRAPPER_TAGS,
  chatItem,
  lastChatItems,
} from "./chat-items.js";

/** @param {string} text */
const blocks = (text) => ({ content: [{ type: "text", text }] });

void test("a stored entry and the live SDK form of the same message give the same item", () => {
  const stored = { type: "assistant", isSidechain: false, message: blocks("hello") };
  const live = { type: "assistant", parent_tool_use_id: null, message: blocks("hello") };
  assert.deepEqual(chatItem(stored), { role: "assistant", text: "hello" });
  assert.deepEqual(chatItem(live), chatItem(stored));
});

void test("string content and block content both give a trimmed item; blocks join with a newline", () => {
  assert.deepEqual(chatItem({ type: "user", message: { content: "  hi  " } }), {
    role: "user",
    text: "hi",
  });
  const two = {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }],
    },
  };
  assert.equal(chatItem(two)?.text, "a\nb");
});

void test("sidechain, sub-agent, synthetic and replayed messages give null", () => {
  const message = blocks("x");
  assert.equal(chatItem({ type: "assistant", isSidechain: true, message }), null);
  assert.equal(chatItem({ type: "assistant", parent_tool_use_id: "tu", message }), null);
  assert.equal(chatItem({ type: "user", isSynthetic: true, message }), null);
  assert.equal(chatItem({ type: "user", isReplay: true, message }), null);
  assert.equal(chatItem({ type: "result", message }), null);
});

void test("a tool-result-only user message and empty or whitespace text give null", () => {
  const result = { content: [{ type: "tool_result", tool_use_id: "t" }] };
  assert.equal(chatItem({ type: "user", message: result }), null);
  assert.equal(chatItem({ type: "assistant", message: blocks("") }), null);
  assert.equal(chatItem({ type: "assistant", message: blocks(" \n ") }), null);
  assert.equal(chatItem({ type: "user", message: { content: "  " } }), null);
});

/** @param {"user" | "assistant"} type @param {string} text @param {object} [extra] */
const stored = (type, text, extra = {}) => ({
  type,
  isSidechain: false,
  message: { content: text },
  ...extra,
});
/** @param {"user" | "assistant"} type @param {string} text */
const live = (type, text) => ({ type, parent_tool_use_id: null, message: blocks(text) });

void test("a user entry opening with any WRAPPER_TAGS tag, as <tag> or <tag attr>, or the caveat gives null", () => {
  assert.equal(WRAPPER_TAGS.length, 11);
  const texts = [
    ...WRAPPER_TAGS.flatMap((t) => [`<${t}>x</${t}>`, `  <${t} a="1">x`]),
    `${LOCAL_COMMAND_CAVEAT}, so ignore them`,
  ];
  for (const text of texts) {
    assert.equal(chatItem(stored("user", text)), null, `stored: ${text}`);
    assert.equal(chatItem(live("user", text)), null, `live: ${text}`);
  }
});

void test("isMeta, isCompactSummary and isVisibleInTranscriptOnly give null for user and assistant", () => {
  for (const flag of ["isMeta", "isCompactSummary", "isVisibleInTranscriptOnly"]) {
    for (const type of /** @type {const} */ (["user", "assistant"])) {
      assert.equal(chatItem(stored(type, "hello", { [flag]: true })), null, `${flag} ${type}`);
    }
  }
});

void test("kept: assistant text is never prefix-filtered; ordinary user text starting with < or Caveat: stays", () => {
  const cases = /** @type {const} */ ([
    ["assistant", "<div>hi</div>"],
    ["assistant", "Caveat: this may be slow"],
    ["assistant", "<command-name>x</command-name>"],
    ["assistant", `${LOCAL_COMMAND_CAVEAT}, so`],
    ["user", "<div>hello</div> — explain this"],
    ["user", "<pasted_content>x"],
    ["user", "Caveat: is this right?"],
    ["user", "<command-namex>y"],
    ["user", "a < b"],
  ]);
  for (const [role, text] of cases) {
    const want = { role, text };
    assert.deepEqual(chatItem(stored(role, text)), want, `stored: ${role} ${text}`);
    assert.deepEqual(chatItem(live(role, text)), want, `live: ${role} ${text}`);
  }
});

void test("lastChatItems keeps the last CHAT_WINDOW in order and returns a copy", () => {
  assert.equal(CHAT_WINDOW, 50);
  const items = Array.from({ length: CHAT_WINDOW + 7 }, (_, i) => i);
  const last = lastChatItems(items);
  assert.equal(last.length, CHAT_WINDOW);
  assert.equal(last[0], 7);
  assert.equal(last.at(-1), CHAT_WINDOW + 6);
  const short = [1, 2, 3];
  const copy = lastChatItems(short);
  assert.deepEqual(copy, short);
  assert.notEqual(copy, short);
});

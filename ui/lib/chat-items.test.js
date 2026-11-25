// chat-items.js (#96): one chat item per message, stored or live, and the window.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_WINDOW,
  LOCAL_COMMAND_CAVEAT,
  WRAPPER_TAGS,
  chatItem,
  historyItems,
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

/** A stored user entry. @param {number} n @param {string} at */
const entry = (n, at) => ({ type: "user", uuid: `u${n}`, timestamp: at, message: blocks(`m${n}`) });
/** @param {number} n */
const day = (n) => `2026-01-${String(n).padStart(2, "0")}T00:00:00.000Z`;

void test("historyItems (#100): a compact that writes old entries again at the end keeps the real last ones last, each once", () => {
  const old = [entry(1, day(1)), entry(2, day(2))];
  const recent = [entry(3, day(3)), entry(4, day(4))];
  const summary = {
    type: "user",
    uuid: "s",
    timestamp: day(5),
    isCompactSummary: true,
    message: blocks("summary"),
  };
  // file order after a compact: the conversation, then the old entries again, then the summary
  const got = historyItems([...old, ...recent, ...old, summary]);
  assert.deepEqual(
    got.map((i) => i.text),
    ["m1", "m2", "m3", "m4"],
  );
});

void test("historyItems (#100): the window is the last CHAT_WINDOW by time, not by place in the file", () => {
  const all = Array.from({ length: CHAT_WINDOW + 10 }, (_, i) =>
    entry(i, day(1).replace("00:00:00", `00:${String(i).padStart(2, "0")}:00`)),
  );
  const got = historyItems([...all, ...all.slice(0, 30)]);
  assert.equal(got.length, CHAT_WINDOW);
  assert.equal(got[0]?.text, "m10");
  assert.equal(got.at(-1)?.text, `m${CHAT_WINDOW + 9}`);
});

void test("historyItems (#100): entries with no uuid or no timestamp keep the file order", () => {
  const plain = [
    { type: "user", message: blocks("a") },
    { type: "assistant", message: blocks("b") },
    { type: "user", message: blocks("a") },
  ];
  assert.deepEqual(
    historyItems(plain).map((i) => i.text),
    ["a", "b", "a"],
  );
  const mixed = [
    entry(1, day(2)),
    { type: "assistant", message: blocks("after m1") },
    entry(2, day(1)),
  ];
  assert.deepEqual(
    historyItems(mixed).map((i) => i.text),
    ["m2", "m1", "after m1"],
  );
});

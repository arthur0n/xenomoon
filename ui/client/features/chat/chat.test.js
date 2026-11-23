// chat.js (#96): extendsDrawn tells an append from a redraw by entry identity;
// onChat, driven through the store with a minimal fake document, redraws only entries.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

/** A minimal DOM node: children, append (moves), remove, text. */
class Node {
  /** @param {string} tag */
  constructor(tag) {
    this.tagName = tag;
    /** @type {Node[]} */ this.children = [];
    /** @type {Node | null} */ this.parent = null;
    this.className = "";
    this.text = "";
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    this.clientHeight = 100;
  }
  /** @param {...(Node | string)} xs */
  append(...xs) {
    for (const x of xs) {
      const n = typeof x === "string" ? Object.assign(new Node("#text"), { text: x }) : x;
      n.remove();
      n.parent = this;
      this.children.push(n);
    }
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(/** @type {string} */ v) {
    this.text = v;
    this.children = [];
  }
  querySelector() {
    return null;
  }
}

const inner = new Node("div");
const scroll = new Node("div");
/** @type {Record<string, Node>} */
const ids = { "chat-inner": inner, "chat-scroll": scroll };
const fakeDocument = {
  getElementById: (/** @type {string} */ id) => ids[id] ?? null,
  createElement: (/** @type {string} */ t) => new Node(t),
  createTextNode: (/** @type {string} */ t) => Object.assign(new Node("#text"), { text: t }),
  createDocumentFragment: () => new Node("#frag"),
};
/** @type {{ document?: unknown }} */
const g = globalThis;
const hadDocument = "document" in g;
const prevDocument = g.document;
g.document = fakeDocument;
const chat = await import("./chat.js");
const store = await import("../../core/store.js");

before(() => {
  chat.initChat();
});
after(() => {
  if (hadDocument) g.document = prevDocument;
  else delete g.document;
});

/** @param {import("../../core/store.js").ChatEntry[]} chatArr */
const setChat = (chatArr) => {
  store.update((s) => ({ ...s, chat: chatArr }));
};
/** @param {string} text @returns {import("../../core/store.js").ChatEntry} */
const user = (text) => ({ kind: "user", text });
const entries = () => inner.children.filter((n) => n.className === "msg-user");
const texts = () => entries().map((n) => n.textContent);

/** Start each redraw test from an empty chat, no indicator, one fresh card. */
function reset() {
  store.update((s) => ({ ...s, thinking: { active: false, label: "" } }));
  setChat([]);
  for (const n of inner.children.filter((c) => c.className !== "msg-user")) n.remove();
  const card = new Node("div");
  card.className = "card";
  inner.append(card);
  return card;
}

void test("extendsDrawn is true only for the same entries in order, at least as long", () => {
  const a = user("a");
  /** @type {import("../../core/store.js").ChatEntry} */
  const b = { kind: "agent", who: "main", text: "b" };
  /** @type {import("../../core/store.js").ChatEntry} */
  const c = { kind: "agent", who: "main", text: "c" };
  assert.equal(chat.extendsDrawn([], []), true);
  assert.equal(chat.extendsDrawn([], [a]), true);
  assert.equal(chat.extendsDrawn([a], [a, b]), true); // append
  assert.equal(chat.extendsDrawn([a, b], [a, b]), true); // unchanged
  assert.equal(chat.extendsDrawn([a, b], [a, c]), false); // same length, new object
  assert.equal(chat.extendsDrawn([a, b], [a]), false); // shorter
  assert.equal(chat.extendsDrawn([a], [{ ...a }, b]), false); // equal content, other object
  assert.equal(chat.extendsDrawn([a, b], [b, a]), false); // order
});

void test("onChat: an append draws only the new entry and keeps the existing nodes", () => {
  reset();
  const a = user("a");
  const b = user("b");
  setChat([a, b]);
  const [nodeA, nodeB] = entries();
  setChat([a, b, user("c")]);
  const after3 = entries();
  assert.equal(after3.length, 3);
  assert.equal(after3[0], nodeA);
  assert.equal(after3[1], nodeB);
  assert.deepEqual(texts(), ["a", "b", "c"]);
});

void test("onChat: a same-length replacement redraws the entries, keeps the card, indicator stays last", () => {
  const card = reset();
  const a = user("a");
  const b = user("b");
  setChat([a, b]);
  chat.showThinking();
  const [oldA, oldB] = entries();
  scroll.scrollTop = 0;
  setChat([user("X"), user("Y")]); // same length, new entry objects
  assert.deepEqual(texts(), ["X", "Y"]);
  assert.equal(oldA?.parent, null);
  assert.equal(oldB?.parent, null);
  assert.ok(inner.children.includes(card));
  assert.equal(inner.children.at(-1)?.className, "msg-thinking");
  assert.equal(scroll.scrollTop, 1000); // a redraw scrolls to the bottom
});

void test("onChat: an empty array removes every entry node and keeps the card and indicator", () => {
  const card = reset();
  setChat([user("a"), user("b")]);
  chat.showThinking();
  setChat([]);
  assert.equal(entries().length, 0);
  assert.ok(inner.children.includes(card));
  assert.equal(inner.children.at(-1)?.className, "msg-thinking");
});

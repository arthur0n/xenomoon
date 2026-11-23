// Chat column, rendered from the store: user messages, agent messages (markdown
// + copy), session banners, and the "thinking…" indicator. An array that extends
// the drawn one only appends its new entries; any other array (a history
// snapshot) redraws the chat entries. The indicator stays below the latest.
import { $, el } from "../../core/dom.js";
import { paint, agentLabel, agentInitial } from "../agents/agents.js";
import { renderMarkdown } from "../../core/markdown.js";
import { subscribe, update } from "../../core/store.js";

const chatScroll = () => $("chat-scroll");
export const scrollChat = () => {
  const box = chatScroll();
  box.scrollTop = box.scrollHeight;
};

/** A client turn id in the server's `[A-Za-z0-9_-]{1,64}` rule. `crypto.randomUUID` exists only in
 * a secure context (localhost); a page opened by another host name uses `getRandomValues`.
 * @returns {string} */
function newCid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Echo a user message into the chat as a pending turn — also used by the transcript wizard
 * that posts a prompt on the user's behalf. The caller sends the returned cid on its `user_input`.
 * @param {string} text @param {string[]} [images] attached-image thumbnails (data URLs)
 * @returns {string} the turn's client id */
export function addUser(text, images) {
  const cid = newCid();
  update((s) => ({
    ...s,
    chat: [...s.chat, { kind: "user", text, ...(images?.length ? { images } : {}), cid }],
    pendingTurns: [...s.pendingTurns, cid],
  }));
  return cid;
}

/** Show the pulsing "thinking…" indicator until the turn produces output. */
export function showThinking() {
  update((s) => ({ ...s, thinking: { active: true, label: "thinking…" } }));
}

/** @param {string} who @param {string} text @returns {HTMLElement} */
function agentMsg(who, text) {
  const wrap = el("div", "msg-agent");
  const head = el("span", "who");
  head.append(paint(el("span", "agent-avatar", agentInitial(who)), who), ` ${agentLabel(who)}`);
  const copy = el("button", "copy-btn", "⧉");
  copy.title = "Copy message";
  copy.onclick = () => {
    void navigator.clipboard.writeText(text).then(
      () => {
        copy.textContent = "✓";
        setTimeout(() => {
          copy.textContent = "⧉";
        }, 1200);
      },
      () => {
        copy.textContent = "✕";
      },
    );
  };
  const body = el("div", "body");
  body.append(renderMarkdown(text));
  wrap.append(head, copy, body);
  return wrap;
}

/** @param {import("../../core/store.js").ChatEntry} entry @returns {HTMLElement} */
function renderEntry(entry) {
  if (entry.kind === "user") {
    const wrap = el("div", "msg-user");
    for (const src of entry.images ?? []) {
      const img = document.createElement("img");
      img.className = "msg-image";
      img.src = src;
      img.alt = "attached image";
      wrap.append(img);
    }
    if (entry.text) wrap.append(entry.text);
    return wrap;
  }
  if (entry.kind === "banner") return el("div", "session-banner", entry.text);
  return agentMsg(entry.who ?? "main", entry.text);
}

/** True when `chat` starts with exactly the entry objects of `drawn` (same
 * references, in order), so drawing it only needs `chat.slice(drawn.length)`.
 * @param {readonly import("../../core/store.js").ChatEntry[]} drawn
 * @param {readonly import("../../core/store.js").ChatEntry[]} chat
 * @returns {boolean} */
export function extendsDrawn(drawn, chat) {
  if (chat.length < drawn.length) return false;
  return drawn.every((entry, i) => chat[i] === entry);
}

/** @type {HTMLElement | null} */
let thinkingEl = null;
/** The chat array whose entries are in the DOM, and their nodes (same order). */
/** @type {readonly import("../../core/store.js").ChatEntry[]} */
let drawn = [];
/** @type {HTMLElement[]} */
let entryNodes = [];

/** @param {readonly import("../../core/store.js").ChatEntry[]} chat */
function onChat(chat) {
  const inner = $("chat-inner");
  const box = chatScroll();
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const append = extendsDrawn(drawn, chat);
  if (!append) {
    for (const node of entryNodes) node.remove(); // cards and the indicator stay
    entryNodes = [];
  }
  for (const entry of chat.slice(entryNodes.length)) {
    const node = renderEntry(entry);
    entryNodes.push(node);
    inner.append(node);
  }
  drawn = chat;
  if (thinkingEl) inner.append(thinkingEl); // keep the indicator below the latest
  if (nearBottom || !append) scrollChat();
}

/** @param {import("../../core/store.js").Thinking} t */
function onThinking(t) {
  if (!t.active) {
    thinkingEl?.remove();
    thinkingEl = null;
    return;
  }
  const label = t.label || "thinking…";
  if (!thinkingEl) {
    thinkingEl = el("div", "msg-thinking");
    thinkingEl.append(el("span", "thinking-dot"), el("span", "thinking-status", label));
    $("chat-inner").append(thinkingEl);
    scrollChat();
    return;
  }
  const status = thinkingEl.querySelector(".thinking-status");
  if (status) status.textContent = label;
}

export function initChat() {
  subscribe("chat", onChat);
  subscribe("thinking", onThinking);
}

// Composer — the message input box, its auto-grow, send, and quick-fill chips.
import { $, $$, $input, fillComposer } from "./dom.js";
import { addUser } from "./chat.js";
import { send } from "./websocket.js";

const textarea = $input("composer-input");

function autoGrow() {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

function sendMessage() {
  const text = textarea.value.trim();
  if (!text) return;
  addUser(text);
  send({ type: "user_input", text });
  $("session-meta").textContent = "running";
  textarea.value = "";
  autoGrow();
}

/** Wire the composer input, send button, Enter-to-send and the quick chips. */
export function initComposer() {
  textarea.addEventListener("input", autoGrow);
  $("send-btn").addEventListener("click", sendMessage);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $$(".chip[data-fill]").forEach((chip) => {
    chip.addEventListener("click", () => {
      fillComposer(chip.getAttribute("data-fill") ?? "");
    });
  });
}

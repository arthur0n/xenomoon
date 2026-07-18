// Composer — the message input box, its auto-grow, send, quick-fill chips, and
// pasted-image attachments (sent as base64 image blocks with the next message).
import { $, $$, $input, fillComposer } from "../../core/dom.js";
import { addUser, showThinking } from "./chat.js";
import { send } from "../../core/websocket.js";
import { subscribe, update } from "../../core/store.js";

const textarea = $input("composer-input");

/** @typedef {{ media_type: string, data: string, dataUrl: string }} Attachment */
/** Pasted images waiting to go out with the next message. @type {Attachment[]} */
let attachments = [];

function autoGrow() {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

/** Reflect the hive's turn state on the send button: while a foreground turn
 * holds the session, a new message only QUEUES (delivered when the turn ends),
 * so say so in gray. When idle (or only background workers run) it sends now.
 * @param {boolean} busy */
function updateSendBtn(busy) {
  const btn = $("send-btn");
  btn.textContent = busy ? "Queue Message" : "Send";
  btn.classList.toggle("queued", busy);
}

/** Read a pasted image, downscaling when needed: the API rejects images over
 * ~5MB / 8000px, so anything big is redrawn at ≤2000px and re-encoded as JPEG.
 * @param {File} file @returns {Promise<Attachment>} */
async function readImage(file) {
  const dataUrl = await /** @type {Promise<string>} */ (
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        resolve(/** @type {string} */ (r.result));
      };
      r.onerror = () => {
        reject(r.error ?? new Error("file read failed"));
      };
      r.readAsDataURL(file);
    })
  );
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => {
      resolve(undefined);
    };
    img.onerror = () => {
      reject(new Error("image decode failed"));
    };
    img.src = dataUrl;
  });
  const side = Math.max(img.width, img.height);
  if (file.size <= 4 * 1024 * 1024 && side <= 2000)
    return { media_type: file.type, data: dataUrl.slice(dataUrl.indexOf(",") + 1), dataUrl };
  const scale = Math.min(1, 2000 / side);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: jpeg.slice(jpeg.indexOf(",") + 1), dataUrl: jpeg };
}

/** Re-render the thumbnail chips above the composer from `attachments`. */
function renderAttachments() {
  const box = $("composer-attachments");
  box.replaceChildren();
  box.hidden = attachments.length === 0;
  attachments.forEach((att, i) => {
    const chip = document.createElement("span");
    chip.className = "attach-chip";
    const img = document.createElement("img");
    img.src = att.dataUrl;
    img.alt = "pasted image";
    const remove = document.createElement("button");
    remove.textContent = "✕";
    remove.title = "Remove image";
    remove.onclick = () => {
      attachments.splice(i, 1);
      renderAttachments();
    };
    chip.append(img, remove);
    box.append(chip);
  });
}

/** @param {ClipboardEvent} e */
function onPaste(e) {
  const files = Array.from(e.clipboardData?.items ?? []).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  if (!files.length) return;
  e.preventDefault();
  void Promise.all(files.map(readImage)).then((imgs) => {
    attachments.push(...imgs);
    renderAttachments();
  });
}

function sendMessage() {
  const text = textarea.value.trim();
  if (!text && !attachments.length) return;
  addUser(
    text,
    attachments.map((a) => a.dataUrl),
  );
  showThinking();
  send({
    type: "user_input",
    text,
    images: attachments.map(({ media_type, data }) => ({ media_type, data })),
  });
  // Optimistically mark the hive busy + running; statusbar renders the line and
  // the button below reads `busy`.
  update((s) => ({ ...s, busy: true, session: { ...s.session, status: "running" } }));
  textarea.value = "";
  attachments = [];
  renderAttachments();
  autoGrow();
}

/** Wire the composer input, send button, Enter-to-send and the quick chips. */
export function initComposer() {
  textarea.addEventListener("input", autoGrow);
  textarea.addEventListener("paste", onPaste);
  $("send-btn").addEventListener("click", sendMessage);
  subscribe("busy", updateSendBtn);
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

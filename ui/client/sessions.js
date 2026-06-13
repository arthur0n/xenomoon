// Recent sessions (resumable) — the sidebar list that links to ?resume=<id>.
// Collapsed it shows the latest few; the toggle below expands the rest.
import { $, el } from "./dom.js";
import { fetchJSON } from "../lib/json.js";
import { resumeId } from "./state.js";

const VISIBLE = 3; // collapsed view
const MAX = 12; // expanded view cap

/** @param {import("../lib/types.js").RecentSession} s @returns {HTMLElement} */
function sessionCard(s) {
  const card = el("div", "session-card");
  card.style.cursor = "pointer";
  card.title = "Resume this session";

  const nameRow = el("span", "name");
  nameRow.append(s.title);
  const delBtn = el("button", "session-del-btn", "×");
  delBtn.title = "Delete session";
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (delBtn.classList.contains("confirm")) {
      void fetch(`/api/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" }).then(() =>
        loadSessions(),
      );
    } else {
      delBtn.classList.add("confirm");
      delBtn.textContent = "del?";
      setTimeout(() => {
        delBtn.classList.remove("confirm");
        delBtn.textContent = "×";
      }, 2000);
    }
  };
  nameRow.append(delBtn);
  card.append(nameRow);
  card.append(el("span", "meta", s.when.replace("T", " · ")));

  card.onclick = () => {
    card.classList.add("loading");
    const meta = card.querySelector(".meta");
    if (meta) meta.textContent = "resuming…";
    location.href = `${location.pathname}?resume=${encodeURIComponent(s.id)}`;
  };
  return card;
}

export async function loadSessions() {
  const sessions = /** @type {import("../lib/types.js").RecentSession[]} */ (
    await fetchJSON("/api/sessions")
  );
  const box = $("recent-sessions");
  box.replaceChildren();
  const items = sessions.filter((s) => s.id !== resumeId).slice(0, MAX);
  items.forEach((s, i) => {
    const card = sessionCard(s);
    if (i >= VISIBLE) card.classList.add("overflow");
    box.append(card);
  });
  const toggle = $("sessions-toggle");
  const hidden = items.length - VISIBLE;
  toggle.style.display = hidden > 0 ? "" : "none";
  const collapsedLabel = `▾ expand · ${hidden} more`;
  toggle.textContent = box.classList.contains("expanded") ? "▴ collapse" : collapsedLabel;
  toggle.onclick = () => {
    const expanded = box.classList.toggle("expanded");
    toggle.textContent = expanded ? "▴ collapse" : collapsedLabel;
  };
}

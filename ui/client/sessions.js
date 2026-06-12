// Recent sessions (resumable) — the sidebar list that links to ?resume=<id>.
import { $, el } from "./dom.js";
import { fetchJSON } from "../lib/json.js";
import { resumeId } from "./state.js";

export async function loadSessions() {
  const sessions = /** @type {import("../lib/types.js").RecentSession[]} */ (
    await fetchJSON("/api/sessions")
  );
  const box = $("recent-sessions");
  box.replaceChildren();
  sessions
    .filter((s) => s.id !== resumeId)
    .slice(0, 8)
    .forEach((s) => {
      const card = el("div", "session-card");
      card.style.cursor = "pointer";
      card.title = "Resume this session";
      card.append(el("span", "name", s.title));
      card.append(el("span", "meta", s.when.replace("T", " · ")));
      card.onclick = () => {
        card.classList.add("loading");
        const meta = card.querySelector(".meta");
        if (meta) meta.textContent = "resuming…";
        location.href = `${location.pathname}?resume=${encodeURIComponent(s.id)}`;
      };
      box.append(card);
    });
}

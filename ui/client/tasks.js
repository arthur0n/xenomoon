// Tasks board — the orchestrator's persistent to-do list, rendered in the right
// rail between the approvals panel and the activity log. The agent mutates it
// via the mcp__ui__tasks tool; the server broadcasts a `tasks` message and we
// repaint. The user can advance a task's status or remove it; both send a
// `task_update` back to the server (the source of truth is .xenodot/tasks.json).
import { $, el } from "./dom.js";
import { send } from "./websocket.js";

/** Status click order: pending → in_progress → done → pending. */
const NEXT_STATUS = { pending: "in_progress", in_progress: "done", done: "pending" };
const TICK = { pending: "○", in_progress: "◐", done: "✓" };

/** @param {import("../lib/types.js").Task} t @returns {HTMLElement} */
function taskRow(t) {
  const row = el("div", `task-row status-${t.status} owner-${t.owner}`);

  const tick = el("button", "task-tick", TICK[t.status] ?? "○");
  tick.title = `mark ${NEXT_STATUS[t.status] ?? "pending"}`;
  tick.onclick = () => {
    send({ type: "task_update", op: "update", id: t.id, status: NEXT_STATUS[t.status] });
  };

  const body = el("div", "task-body");
  const titleRow = el("div", "task-title-row");
  titleRow.append(
    el("span", `owner-chip owner-${t.owner}`, t.owner),
    el("span", "task-title", t.title),
  );
  body.append(titleRow);
  if (t.note) body.append(el("div", "task-note", t.note));

  const remove = el("button", "task-remove", "×");
  remove.title = "remove task";
  remove.onclick = () => {
    send({ type: "task_update", op: "remove", id: t.id });
  };

  row.append(tick, body, remove);
  return row;
}

/** @param {import("../lib/types.js").Task[]} tasks */
export function renderTasks(tasks) {
  const list = $("tasks-list");
  list.replaceChildren();
  const open = tasks.filter((t) => t.status !== "done").length;
  $("tasks-badge").textContent = String(open);
  $("tasks-empty").style.display = tasks.length ? "none" : "";
  tasks.forEach((t) => {
    list.append(taskRow(t));
  });
}

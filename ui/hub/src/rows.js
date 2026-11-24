// The hub page's list logic, pure: each row's screen state and label, the list order, the buttons
// a row offers, the address it shows and offers to open, and the tab name it opens in. No React, no DOM.
// Rows come from GET /api/hub/status and /api/hub/stream (HubViewRow, ui/server/features/hub/server.js:19-21).
// Start and stop are offered only when ui/server/features/hub/lifecycle.js would not always refuse them.

import { isPort } from "../../lib/port.js";

/** A row as the hub sends it: the HubRow (ui/server/features/hub/rows.js:23-31) plus the probe result
 * (ui/server/features/hub/status.js:9-11: state on|held|off|unbound|unknown, status, reason, conflict)
 * plus `watch: "no-stream"` (server.js:19-20, set in withEntry server.js:54-59). `status` is the project
 * status payload (ui/server/core/http/status.js:15-17: state idle|working|waiting, lastLine, sessions, at).
 * @typedef {import("../../server/features/hub/server.js").HubViewRow} HubViewRow */
/** @typedef {import("../../server/features/hub/server.js").HubView} HubView */

/**
 * `on-no-status`: the row is on but carries no readable project status (not heard yet).
 * @typedef {"needs-you" | "working" | "idle" | "on-no-status" | "no-stream" | "held" | "unknown" | "unbound" | "off"} ScreenState
 */
/** `waiting` (the project's lastLine) is present only on "needs-you".
 * @typedef {{ state: ScreenState, label: string, waiting?: string }} RowScreen */
/** `open`: the project's own page can be opened (exactly when addressOf gives an address).
 * @typedef {{ start: boolean, stop: boolean, open: boolean }} RowActions */
/** `address`: the project's own page, shown and offered to open, only while its server is on.
 * @typedef {{ row: HubViewRow, screen: RowScreen, actions: RowActions, address: string | null }} RowItem */

/** @type {Record<ScreenState, string>} */
export const LABELS = {
  "needs-you": "needs you",
  working: "working",
  idle: "idle",
  "on-no-status": "on, no status yet",
  "no-stream": "on, update this install",
  held: "port used by another project",
  unknown: "state not known",
  unbound: "no port set",
  off: "off",
};

/** Sort rank per screen state: needs you first, the on rows, the rest, off last.
 * @type {Record<ScreenState, number>} */
const RANK = {
  "needs-you": 0,
  working: 1,
  idle: 2,
  "on-no-status": 3,
  "no-stream": 4,
  held: 5,
  unknown: 6,
  unbound: 7,
  off: 8,
};

/** Screen states of a running server of this project (stop applies). */
const ON_STATES = new Set(["needs-you", "working", "idle", "on-no-status", "no-stream"]);

/** @param {HubViewRow} row @returns {ScreenState} */
function stateOf(row) {
  if (row.state !== "on") return row.state;
  if (row.watch === "no-stream") return "no-stream";
  const project = row.status?.state;
  if (project === "waiting") return "needs-you";
  if (project === "working" || project === "idle") return project;
  return "on-no-status";
}

/** The row's screen state and label; the waiting text only for "needs-you".
 * @param {HubViewRow} row @returns {RowScreen} */
export function screenOf(row) {
  const state = stateOf(row);
  const screen = { state, label: LABELS[state] };
  return state === "needs-you" ? { ...screen, waiting: row.status?.lastLine ?? "" } : screen;
}

/** @param {string} a @param {string} b @returns {number} */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Rank, then name, then id: two events with the same rows give the same order. Returns a new array.
 * @param {HubViewRow[]} rows @returns {HubViewRow[]} */
export function sortRows(rows) {
  return rows
    .map((row) => ({ row, rank: RANK[stateOf(row)] }))
    .sort((a, b) => a.rank - b.rank || byText(a.row.name, b.row.name) || byText(a.row.id, b.row.id))
    .map(({ row }) => row);
}

/** The project's own address while its server is on and its port is an integer from 1 to 65535
 * (a number, not a string); null otherwise.
 * @param {HubViewRow} row @returns {string | null} */
export function addressOf(row) {
  const port = /** @type {unknown} */ (row.port);
  return row.state === "on" && isPort(port) ? `http://127.0.0.1:${port}/` : null;
}

/** The browser window name the row's page opens in: the same for the same id and port, another for
 * another port. Starts with a letter, since names starting with "_" are reserved.
 * @param {HubViewRow} row @returns {string} */
export function tabNameOf(row) {
  return `xenomoon-${row.id}-${row.port}`;
}

/** Whether lifecycle.js doStart could go on for an off row: not stale (lifecycle.js:92-99), a port
 * (lifecycle.js:100-103), no other row on the same port that is on (lifecycle.js:108-110).
 * @param {HubViewRow} row @param {HubViewRow[]} rows @returns {boolean} */
function canStart(row, rows) {
  if (row.stale || row.port === null) return false;
  return !rows.some((r) => r.id !== row.id && r.port === row.port && r.state === "on");
}

/** The buttons a row offers. On rows: stop, and open while they have a port. Off rows: start when lifecycle would start them. Held / unknown: lifecycle refuses both start and stop
 * (refuseUnclear, lifecycle.js:74-87), and the port serves another or an unclear server, so nothing.
 * Unbound: start is refused (no port) and stop is a no-op (lifecycle.js:132-134), so nothing.
 * @param {HubViewRow} row @param {HubViewRow[]} rows all rows of the same view
 * @returns {RowActions} */
export function actionsOf(row, rows) {
  const state = stateOf(row);
  const open = addressOf(row) !== null;
  if (ON_STATES.has(state)) return { start: false, stop: true, open };
  if (state === "off" && row.port !== null && canStart(row, rows))
    return { start: true, stop: false, open };
  return { start: false, stop: false, open };
}

/** The whole list for the page: sorted, each row with its screen, actions and address.
 * @param {HubViewRow[]} rows @returns {RowItem[]} */
export function rowItems(rows) {
  return sortRows(rows).map((row) => ({
    row,
    screen: screenOf(row),
    actions: actionsOf(row, rows),
    address: addressOf(row),
  }));
}

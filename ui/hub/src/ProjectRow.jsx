// One project row: name, state label (and the waiting text for "needs you"), the project's address
// while it is on, and the buttons its `actions` (rows.js) allow: Open (the project's own tab), Start,
// Stop. A running request marks its button busy and blocks the row's buttons; a refusal (a blocked
// tab included) stays on the row in words until the next success. Both live in row-ops.js (keyed by
// row id), so they survive the row moving to another group.

import { openProject } from "./open-project.js";
import { tabNameOf } from "./rows.js";

/** @typedef {ReturnType<typeof import("./hub-api.js").makeHubApi>} HubApi */
/** @typedef {import("./hub-api.js").RowResult} RowResult */
/** @typedef {import("./rows.js").RowItem} RowItem */
/** @typedef {import("./row-ops.js").Busy} Busy */
/** @typedef {import("./row-ops.js").RowOp} RowOp */

/** @type {Record<Busy, [string, string]>} [idle text, busy text] */
const BUTTON_TEXT = {
  start: ["Start", "Starting…"],
  stop: ["Stop", "Stopping…"],
  open: ["Open", "Opening…"],
};

/**
 * @param {{
 *   item: RowItem,
 *   api: HubApi,
 *   op: RowOp,
 *   run: (id: string, kind: Busy, call: () => Promise<RowResult>) => boolean,
 * }} props */
export default function ProjectRow({ item, api, op, run }) {
  const { row, screen, actions, address } = item;
  const { busy, problem } = op;

  /** @param {Busy} kind @param {() => Promise<RowResult>} call @param {string} variant */
  const button = (kind, call, variant) => {
    const [idle, working] = BUTTON_TEXT[kind];
    const text = busy === kind ? working : idle;
    return (
      <button
        type="button"
        className={`btn ${variant}`}
        data-control={kind}
        aria-label={`${text} ${row.name}`}
        aria-busy={busy === kind || undefined}
        aria-disabled={busy !== null || undefined}
        onClick={() => {
          run(row.id, kind, call);
        }}
      >
        {text}
      </button>
    );
  };

  return (
    <li
      className="row"
      data-row={row.id}
      data-state={screen.state}
      aria-busy={busy !== null || undefined}
    >
      <span className="marker" aria-hidden="true" />
      <div className="row-main">
        <h3 className="row-name">{row.name}</h3>
        <p className="row-meta">
          <span className="row-state">{screen.label}</span>
          {address ? (
            <span className="mono row-address">{address}</span>
          ) : (
            row.port !== null && <span className="mono row-port">:{row.port}</span>
          )}
        </p>
        {screen.waiting !== undefined && (
          <p className="row-waiting">{screen.waiting || "It is waiting for you."}</p>
        )}
        {problem && (
          <p className="row-problem" role="alert">
            {problem.reason}
          </p>
        )}
      </div>
      <div className="row-actions">
        {actions.open &&
          address &&
          button(
            "open",
            () => Promise.resolve(openProject({ name: tabNameOf(row), address })),
            "btn-quiet",
          )}
        {actions.start && button("start", () => api.startRow(row.id), "")}
        {actions.stop && button("stop", () => api.stopRow(row.id), "btn-quiet")}
      </div>
    </li>
  );
}

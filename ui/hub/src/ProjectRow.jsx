// One project row: name, state label (and the waiting text for "needs you"), and the buttons its
// `actions` (rows.js) allow. A running request marks its button busy and blocks the row's buttons;
// a refusal or failed open stays on the row in words until the next success. Both live in row-ops.js
// (keyed by row id), so they survive the row moving to the other group.

/** @typedef {ReturnType<typeof import("./hub-api.js").makeHubApi>} HubApi */
/** @typedef {import("./hub-api.js").OpenResult} OpenResult */
/** @typedef {import("./hub-api.js").RowResult} RowResult */
/** @typedef {import("./rows.js").RowItem} RowItem */
/** @typedef {import("./row-ops.js").Busy} Busy */
/** @typedef {import("./row-ops.js").RowOp} RowOp */

/** @type {Record<Busy, [string, string]>} [idle text, busy text] */
const BUTTON_TEXT = {
  start: ["Start", "Starting…"],
  stop: ["Stop", "Stopping…"],
  open: ["Start and open", "Opening…"],
};

/**
 * @param {{
 *   item: RowItem,
 *   api: HubApi,
 *   op: RowOp,
 *   run: (id: string, kind: Busy, call: () => Promise<RowResult | OpenResult>) => boolean,
 * }} props */
export default function ProjectRow({ item, api, op, run }) {
  const { row, screen, actions } = item;
  const { busy, problem } = op;

  /** @param {Busy} kind @param {() => Promise<RowResult | OpenResult>} call @param {string} variant */
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

  const open = actions.open;
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
          {row.port !== null && <span className="mono row-port">:{row.port}</span>}
        </p>
        {screen.waiting !== undefined && (
          <p className="row-waiting">{screen.waiting || "It is waiting for you."}</p>
        )}
        {problem && (
          <p className="row-problem" role="alert">
            {problem.reason}
            {problem.href && (
              <>
                {" "}
                <a href={problem.href} target="_blank" rel="noopener noreferrer">
                  {problem.href}
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <div className="row-actions">
        {open && !open.startFirst && (
          <a
            className="btn btn-primary"
            href={open.url}
            target="_blank"
            rel="noopener noreferrer"
            data-control="link"
            aria-label={`Open ${row.name} in a new tab`}
          >
            Open
          </a>
        )}
        {open?.startFirst && button("open", () => api.openRow(row), "btn-primary")}
        {actions.start && button("start", () => api.startRow(row.id), "")}
        {actions.stop && button("stop", () => api.stopRow(row.id), "btn-quiet")}
      </div>
    </li>
  );
}

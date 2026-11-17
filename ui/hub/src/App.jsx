// The hub page: every project as one row, fed only by the hub client's stream (hub-api.js) and the
// list logic of rows.js (order, state, label, buttons). Projects that need you come first, in their
// own group; the page adds grouping, the connection notices, the tab title, and each row's running
// request (row-ops.js), with focus put back on the same control when a row moves group.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import HubHeader from "./HubHeader.jsx";
import HubNotices from "./HubNotices.jsx";
import ProjectRow from "./ProjectRow.jsx";
import { IDLE, makeRowOps } from "./row-ops.js";
import { rowItems } from "./rows.js";

/** @typedef {ReturnType<typeof import("./hub-api.js").makeHubApi>} HubApi */
/** @typedef {import("./hub-api.js").HubSnapshot} HubSnapshot */
/** @typedef {import("./rows.js").HubViewRow} HubViewRow */
/** @typedef {import("./rows.js").RowItem} RowItem */
/** @typedef {import("./row-ops.js").RowOps} RowOps */
/** @typedef {{ ops: RowOps, opMap: ReadonlyMap<string, import("./row-ops.js").RowOp> }} OpsProps */

/** @param {{ id: string, title: string, items: RowItem[], api: HubApi, className: string } & OpsProps} props */
function RowGroup({ id, title, items, api, className, ops, opMap }) {
  return (
    <section className={`group ${className}`} aria-labelledby={id}>
      <h2 id={id} className="group-title">
        {title} <span className="group-count">{items.length}</span>
      </h2>
      <ul className="rows">
        {items.map((item) => (
          <ProjectRow
            key={item.row.id}
            item={item}
            api={api}
            op={opMap.get(item.row.id) ?? IDLE}
            run={ops.run}
          />
        ))}
      </ul>
    </section>
  );
}

/** @param {{ api: HubApi }} props @returns {import("react").JSX.Element} */
export default function App({ api }) {
  const [snapshot, setSnapshot] = useState(/** @type {HubSnapshot | null} */ (null));
  useEffect(() => api.subscribe(setSnapshot), [api]);

  // hub-api.js checks only id and state; the rows are the hub's HubViewRow (server.js:19-21).
  const rows = /** @type {HubViewRow[]} */ (/** @type {unknown} */ (snapshot?.rows ?? []));
  const items = rowItems(rows);
  const needs = items.filter((i) => i.screen.state === "needs-you");
  const rest = items.filter((i) => i.screen.state !== "needs-you");
  const stale = snapshot?.connection === "reconnecting";
  const [ops] = useState(makeRowOps);
  const opMap = useSyncExternalStore(ops.subscribe, ops.snapshot);
  const ids = rows.map((r) => r.id).join("\n");
  useEffect(() => {
    ops.keep(ids ? ids.split("\n") : []);
  }, [ops, ids]);
  const refocus = useRefocus();

  useEffect(() => {
    document.title = needs.length ? `(${needs.length}) XenomoonForge Hub` : "XenomoonForge Hub";
  }, [needs.length]);

  return (
    <div className="hub">
      <HubHeader connection={snapshot?.connection ?? "connecting"} />
      <main
        className="hub-main"
        data-stale={stale || undefined}
        onFocus={refocus.onFocus}
        onBlur={refocus.onBlur}
      >
        <HubNotices snapshot={snapshot} />
        {needs.length > 0 && (
          <RowGroup
            id="g-needs"
            title="Needs you"
            items={needs}
            api={api}
            className="g-needs"
            ops={ops}
            opMap={opMap}
          />
        )}
        {rest.length > 0 && (
          <RowGroup
            id="g-rest"
            title={needs.length ? "Other projects" : "Projects"}
            items={rest}
            api={api}
            className="g-rest"
            ops={ops}
            opMap={opMap}
          />
        )}
      </main>
    </div>
  );
}

/** A row that moves group is remounted, and its focused control with it. This remembers the last
 * focused row control (row id + control kind) and, after each render that left focus on the body,
 * focuses the same control of the same row when it still exists. A blur the user made (the element
 * is still in the page) forgets it. */
function useRefocus() {
  const last = useRef(/** @type {{ row: string, control: string, el: Element } | null} */ (null));
  useLayoutEffect(() => {
    const want = last.current;
    if (!want || (document.activeElement && document.activeElement !== document.body)) return;
    const sel = `[data-row="${CSS.escape(want.row)}"] [data-control="${CSS.escape(want.control)}"]`;
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    else last.current = null; // the row or its control is gone: never jump to it later
  });
  return {
    /** @param {import("react").FocusEvent} e */
    onFocus: (e) => {
      const t = e.target;
      const row = t.closest("[data-row]")?.getAttribute("data-row");
      const control = t.getAttribute("data-control");
      last.current = row && control ? { row, control, el: t } : null;
    },
    /** @param {import("react").FocusEvent} e */
    onBlur: (e) => {
      const t = e.target;
      queueMicrotask(() => {
        if (last.current?.el === t && t.isConnected) last.current = null;
      });
    },
  };
}

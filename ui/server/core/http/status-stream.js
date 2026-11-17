// The live status stream (#92): the `/api/status` snapshot as Server-Sent Events, so the hub hears
// a change instead of polling. One event at connect, then one per real change (`state`, `sessions`
// or `lastLine`; the `at` timestamp alone is not a change). The payload source and the change
// subscription come in as deps, so a test drives it with no config or env.
import { redactFor } from "./status-redact.js";

/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */
/** @typedef {{
 *   payload: () => unknown,
 *   subscribe: (listener: () => void) => () => void,
 * }} StatusStreamDeps */
/** @typedef {{ res: Res, release: () => void }} StreamConn */

const SSE_HEADERS = Object.freeze({
  "content-type": "text/event-stream",
  "cache-control": "no-store",
  connection: "keep-alive",
});

/** The fields whose change is worth an event, as one comparable string.
 * @param {unknown} view @returns {string} */
function changeKey(view) {
  const v = /** @type {Record<string, unknown>} */ (view ?? {});
  return JSON.stringify([v.state, v.sessions, v.lastLine]);
}

/** @param {StatusStreamDeps} deps @returns {{ handle: (req: Req, res: Res) => void, closeAll: () => void }} */
export function makeStatusStream({ payload, subscribe }) {
  /** @type {Set<StreamConn>} */
  const open = new Set();

  /** Leaves the open set once; the set membership is what makes close + closeAll safe together.
   * @param {StreamConn} conn */
  const drop = (conn) => {
    if (!open.delete(conn)) return;
    conn.release();
  };

  /** @param {Req} req @param {Res} res */
  const handle = (req, res) => {
    // Same rule as `/api/status`: any Origin, allowed or not, never receives `lastLine`.
    const view = () => redactFor(req.headers, payload());
    let lastKey = "";
    // Backpressure: once `write` returns false nothing more is queued for this reader. No queue
    // is kept either; on `drain` the status is read again, so only the latest one is sent.
    let blocked = false;
    const send = () => {
      if (blocked) return;
      const v = view();
      const key = changeKey(v);
      if (key === lastKey) return;
      lastKey = key;
      blocked = !res.write(`data: ${JSON.stringify(v)}\n\n`);
    };
    const onDrain = () => {
      blocked = false;
      send();
    };
    res.writeHead(200, SSE_HEADERS);
    res.on("drain", onDrain);
    const unsubscribe = subscribe(send);
    /** @type {StreamConn} */
    const conn = {
      res,
      release: () => {
        unsubscribe();
        res.off("drain", onDrain);
      },
    };
    open.add(conn);
    res.on("close", () => {
      drop(conn);
    });
    send();
  };

  const closeAll = () => {
    for (const conn of [...open]) {
      drop(conn);
      conn.res.end();
    }
  };

  return { handle, closeAll };
}

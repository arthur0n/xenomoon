// The live status stream (#92): the `/api/status` snapshot as Server-Sent Events, so the hub hears
// a change instead of polling. One event at connect, then one per real change (`state`, `sessions`
// or `lastLine`; the `at` timestamp alone is not a change). The payload source and the change
// subscription come in as deps, so a test drives it with no config or env; `changeKey` overrides it.
import { redactFor } from "./status-redact.js";

/** @typedef {import("node:http").IncomingMessage} Req */
/** @typedef {import("node:http").ServerResponse} Res */
/** @typedef {{
 *   payload: () => unknown,
 *   subscribe: (listener: () => void) => () => void,
 *   changeKey?: (view: unknown) => string,
 * }} StatusStreamDeps */
/** @typedef {{ res: Res, release: () => void }} StreamConn */

const SSE_HEADERS = Object.freeze({
  "content-type": "text/event-stream",
  "cache-control": "no-store",
  connection: "keep-alive",
});

/** The project fields whose change is worth an event, as one comparable string.
 * @param {unknown} view @returns {string} */
function projectChangeKey(view) {
  const v = /** @type {Record<string, unknown>} */ (view ?? {});
  return JSON.stringify([v.state, v.sessions, v.lastLine]);
}

/** `changeKey` builds the comparable string from a connection's view; it decides "changed".
 * @param {StatusStreamDeps} deps @returns {{ handle: (req: Req, res: Res) => void, closeAll: () => void }} */
export function makeStatusStream({ payload, subscribe, changeKey = projectChangeKey }) {
  /** @type {Set<StreamConn>} */
  const open = new Set();
  // Set by closeAll, never cleared: a request handled after it would stay open past the close.
  let closed = false;

  /** Leaves the open set once; the set membership is what makes close + closeAll safe together.
   * @param {StreamConn} conn */
  const drop = (conn) => {
    if (!open.delete(conn)) return;
    conn.release();
  };

  /** @param {Req} req @param {Res} res */
  const handle = (req, res) => {
    if (closed) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "shutting down" }));
      return;
    }
    // A reader that left before this call (e.g. during an awaited first read) already had its
    // `close`; a listener added now never fires, so registering it would keep it forever (#93).
    if (res.destroyed) return;
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

  /** Ends every open response; from now on `handle` answers 503 and subscribes nothing. */
  const closeAll = () => {
    closed = true;
    for (const conn of [...open]) {
      drop(conn);
      conn.res.end();
    }
  };

  return { handle, closeAll };
}

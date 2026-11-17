// The hub's stream watcher (#93): one GET per "on" row to its project's /api/status/stream on
// 127.0.0.1, the latest status per row kept in memory, listeners told on each change. One timer
// re-reads the rows and reopens dropped streams; a 404 row is kept as "no-stream" and asked again
// only every `noStreamRetryTicks` refreshes. Sends no Origin (so `lastLine` comes through), never
// writes to a project, and `stop()` leaves no timer, socket or listener call behind.
import http from "node:http";
import { samePath } from "./status.js";

/** @typedef {import("../../core/http/status.js").StatusPayload} StatusPayload */
/** A row as the hub knows it; only `state: "on"` with a port is watched (HubRowStatus fits).
 * `project` is the folder an event must name to be stored for the row.
 * @typedef {{ id: string, port: number | null, project: string, state?: string }} WatchRow */
/** @typedef {{ kind: "stream", status: StatusPayload } | { kind: "no-stream" }} WatchEntry */
/** `entry` is null when the row's stored status was dropped (row stopped, left, or moved port).
 * @typedef {(id: string, entry: WatchEntry | null) => void} WatchListener */
/** @typedef {{ port: number, project: string, controller: AbortController }} WatchConn */
/**
 * @typedef {{
 *   rows: () => WatchRow[] | Promise<WatchRow[]>,
 *   intervalMs?: number,
 *   noStreamRetryTicks?: number,
 * }} WatcherOptions
 */

export const STREAM_PATH = "/api/status/stream";

/** Bytes one event may take, finished or not. A status payload is a few hundred bytes; its two
 * open-ended fields are `path` (PATH_MAX is 4096 on Linux) and `lastLine`, which for a waiting
 * project is the pending card's question text, not capped (core/http/status.js pendingText).
 * 64 KiB holds both with room to spare; past it the stream is aborted. */
export const MAX_EVENT_BYTES = 64 * 1024;

/** @param {string} s */
const tooBig = (s) => Buffer.byteLength(s) > MAX_EVENT_BYTES;

/** Complete events' `data` out of event-stream text; `rest` is the unfinished tail.
 * @param {string} text @returns {{ datas: string[], rest: string }} */
export function parseEvents(text) {
  const blocks = text.replace(/\r\n?/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  /** @type {string[]} */
  const datas = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""));
    if (lines.length > 0) datas.push(lines.join("\n"));
  }
  return { datas, rest };
}

/** The event's JSON as a status payload, or null when it is not one.
 * @param {string} data @returns {StatusPayload | null} */
function toStatus(data) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const v = /** @type {StatusPayload} */ (raw);
  return v && typeof v === "object" && typeof v.path === "string" ? v : null;
}

/** @typedef {{ status: (s: StatusPayload) => void, noStream: () => void, end: () => void }} StreamHandlers */

/** One GET of the stream on 127.0.0.1:port; `end` runs once the stream is over for any reason.
 * A response it will not read (not 200, or an event over MAX_EVENT_BYTES) is destroyed.
 * @param {number} port @param {AbortSignal} signal @param {StreamHandlers} on */
function openStream(port, signal, on) {
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    on.end();
  };
  /** @param {import("node:http").IncomingMessage} res */
  const onResponse = (res) => {
    res.on("error", end);
    res.on("close", end);
    if (res.statusCode !== 200) {
      res.destroy();
      if (res.statusCode === 404) on.noStream();
      end();
      return;
    }
    res.setEncoding("utf8");
    let buffer = "";
    res.on("data", (/** @type {string} */ chunk) => {
      const { datas, rest } = parseEvents(buffer + chunk);
      buffer = rest;
      if (tooBig(rest) || datas.some(tooBig)) {
        res.destroy();
        end();
        return;
      }
      for (const data of datas) {
        const status = toStatus(data);
        if (status) on.status(status);
      }
    });
  };
  const req = http.get(
    {
      host: "127.0.0.1",
      port,
      path: STREAM_PATH,
      agent: false,
      headers: { accept: "text/event-stream" },
      signal,
    },
    onResponse,
  );
  req.on("error", end);
}

/** @param {WatchRow} row @returns {row is WatchRow & { port: number }} */
const isWatched = (row) => row.state === "on" && typeof row.port === "number";

/** The latest entry per row, bound to the port and project it was received for, and its
 * listeners. Silenced for good by `clear()`. */
function makeEntryStore() {
  /** @type {Map<string, { entry: WatchEntry, key: string, port: number, project: string }>} */
  const entries = new Map();
  /** @type {Set<WatchListener>} */
  const listeners = new Set();
  let silenced = false;
  /** @param {string} id @param {WatchEntry | null} entry */
  const notify = (id, entry) => {
    for (const l of [...listeners]) {
      if (silenced) return;
      try {
        l(id, entry);
      } catch {
        // one listener's error never stops the watcher or the other listeners
      }
    }
  };
  return {
    /** Store and notify, unless the entry is the one already stored for this port and project.
     * @param {string} id @param {WatchEntry} entry @param {{ port: number, project: string }} at */
    set: (id, entry, { port, project }) => {
      const key = JSON.stringify([port, project, entry]);
      if (entries.get(id)?.key === key) return;
      entries.set(id, { entry, key, port, project });
      notify(id, entry);
    },
    /** @param {string} id */
    drop: (id) => {
      if (entries.delete(id)) notify(id, null);
    },
    /** @param {string} id @returns {WatchEntry | null} */
    get: (id) => entries.get(id)?.entry ?? null,
    /** The row's entry only when it was received for the row's own port and project.
     * @param {WatchRow} row @returns {WatchEntry | null} */
    entryFor: (row) => {
      const stored = entries.get(row.id);
      return stored?.port === row.port && stored.project === row.project ? stored.entry : null;
    },
    ids: () => [...entries.keys()],
    /** @returns {Map<string, WatchEntry>} */
    all: () => new Map([...entries].map(([id, { entry }]) => [id, entry])),
    /** @param {WatchListener} listener @returns {() => void} unsubscribe */
    onChange: (listener) => {
      if (!silenced) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear: () => {
      silenced = true;
      entries.clear();
      listeners.clear();
    },
  };
}

/** @param {WatcherOptions} options */
export function makeWatcher({ rows, intervalMs = 2000, noStreamRetryTicks = 30 }) {
  const store = makeEntryStore();
  /** @type {Map<string, WatchConn>} */
  const conns = new Map();
  /** Port each tracked row was last seen on, so a port change starts it over. @type {Map<string, number>} */
  const ports = new Map();
  /** Refreshes left before a no-stream row is asked again. @type {Map<string, number>} */
  const noStreamWait = new Map();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Promise<void> | null} */
  let running = null;
  let started = false;
  let stopped = false;

  /** Close the row's stream and drop what is stored for it. @param {string} id */
  const forget = (id) => {
    conns.get(id)?.controller.abort();
    conns.delete(id);
    ports.delete(id);
    noStreamWait.delete(id);
    store.drop(id);
  };

  /** @param {string} id @param {number} port @param {string} project */
  const connect = (id, port, project) => {
    /** @type {WatchConn} */
    const conn = { port, project, controller: new AbortController() };
    conns.set(id, conn);
    const current = () => !stopped && conns.get(id) === conn;
    openStream(port, conn.controller.signal, {
      status: (status) => {
        if (!current()) return;
        // another project on this port: not stored, closed, asked again on a later refresh
        if (!samePath(status.path, project)) conn.controller.abort();
        else store.set(id, { kind: "stream", status }, conn);
      },
      noStream: () => {
        if (!current()) return;
        noStreamWait.set(id, noStreamRetryTicks);
        store.set(id, { kind: "no-stream" }, conn);
      },
      end: () => {
        if (conns.get(id) !== conn) return;
        conns.delete(id);
        // a dropped stream's last status no longer overrides the probe; no-stream is kept
        if (store.get(id)?.kind === "stream") store.drop(id);
      },
    });
  };

  /** @param {string} id @param {number} port @param {string} project */
  const ensure = (id, port, project) => {
    ports.set(id, port);
    if (conns.has(id)) return;
    const wait = noStreamWait.get(id);
    if (wait !== undefined && wait > 1) {
      noStreamWait.set(id, wait - 1);
      return;
    }
    noStreamWait.delete(id);
    connect(id, port, project);
  };

  /** @param {WatchRow[]} list */
  const reconcile = (list) => {
    const want = new Map(list.filter(isWatched).map((r) => [r.id, r]));
    for (const id of new Set([...ports.keys(), ...conns.keys(), ...store.ids()])) {
      if (want.get(id)?.port !== ports.get(id)) forget(id);
    }
    for (const [id, row] of want) ensure(id, row.port, row.project);
  };

  /** Read the rows once and follow them; concurrent calls share one run. Never rejects.
   * @returns {Promise<void>} */
  const refresh = () => {
    if (stopped) return Promise.resolve();
    running ??= Promise.resolve()
      .then(() => rows())
      .then(
        (list) => {
          if (!stopped) reconcile(list);
        },
        () => {
          // the row source failed this time: keep what is open, try again next tick
        },
      )
      .finally(() => {
        running = null;
      });
    return running;
  };

  const tick = async () => {
    timer = null;
    await refresh();
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  return {
    /** First refresh now, then one every `intervalMs`. Resolves after the first refresh. */
    start: () => {
      if (started || stopped) return Promise.resolve();
      started = true;
      return tick();
    },
    refresh,
    /** A row's entry, never one received for another port or project on the same id. */
    get: store.entryFor,
    entries: store.all,
    onChange: store.onChange,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      for (const conn of conns.values()) conn.controller.abort();
      conns.clear();
      ports.clear();
      noStreamWait.clear();
      store.clear();
    },
  };
}

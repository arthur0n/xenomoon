// The hub page's one link to the hub (same origin, never a project server): the row stream with its
// own bounded reconnect, start/stop as results in words, and openRow, which reserves a tab inside the
// click, starts an off row, waits for the stream to show it on, then sends the tab there. EventSource,
// fetch, timers and window.open are injected, so the tests run in Node with fakes.

/** A hub row as the stream sends it; this module reads only id, state, port and `project`, the
 * project folder (HubRow.project, ui/server/features/hub/rows.js:27,59).
 * @typedef {{ id: string, state: string, port?: number | null, project?: string } & Record<string, unknown>} HubPageRow */
/** @typedef {"live" | "reconnecting"} HubConnection */
/** @typedef {{ rows: HubPageRow[], errors: unknown[], connection: HubConnection }} HubSnapshot */
/** @typedef {{ ok: true } | { ok: false, reason: string }} RowResult */
/** @typedef {{ ok: true, href: string } | { ok: false, reason: string, href?: string }} OpenResult */
/**
 * The part of EventSource this module uses.
 * @typedef {{
 *   onmessage: ((ev: MessageEvent) => void) | null,
 *   onerror: ((ev: Event) => void) | null,
 *   close: () => void,
 * }} StreamLike */
/** @typedef {new (url: string) => StreamLike} StreamCtor */
/** @typedef {{ set: (fn: () => void, ms: number) => unknown, clear: (handle: unknown) => void }} Timers */
/** @typedef {(url: string, init: { method: string, signal: AbortSignal }) => Promise<{ status: number, text: () => Promise<string> }>} FetchLike */
/** The part of a window.open result this module uses.
 * @typedef {{ opener: unknown, location: { href: string }, close: () => void }} TabLike */
/** @typedef {(url: string, features: string) => TabLike | null} OpenTab */
/**
 * @typedef {{
 *   EventSourceImpl?: StreamCtor,
 *   fetchImpl?: FetchLike,
 *   timers?: Timers,
 *   openTab?: OpenTab,
 *   waitOnMs?: number,
 * }} HubApiDeps */

export const STREAM_URL = "/api/hub/stream";
export const RETRY_MIN_MS = 1000;
export const RETRY_MAX_MS = 15000;
export const WAIT_ON_MS = 30000;
/** A start can wait behind one op on its port (lifecycle.js serializes per port), and each op is a
 * status probe of up to 1.5 s (status.js:81) plus a script of up to 20 s (lifecycle.js:26,35). */
export const POST_TIMEOUT_MS = 45000;

/** @type {Timers} */
const defaultTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => {
    clearTimeout(/** @type {number} */ (handle));
  },
};

/** @type {OpenTab} */
const defaultOpenTab = (url, features) => window.open(url, "_blank", features);

/** The rows of one stream event, or null when the event is not a hub view.
 * @param {unknown} data @returns {{ rows: HubPageRow[], errors: unknown[] } | null} */
export function parseView(data) {
  if (typeof data !== "string") return null;
  /** @type {unknown} */
  let view;
  try {
    view = JSON.parse(data);
  } catch {
    return null;
  }
  if (!view || typeof view !== "object") return null;
  const { rows, errors } = /** @type {{ rows?: unknown, errors?: unknown }} */ (view);
  if (!Array.isArray(rows)) return null;
  /** @type {unknown[]} */
  const list = rows;
  if (!list.every(isRow)) return null;
  /** @type {unknown[]} */
  const errorList = Array.isArray(errors) ? errors : [];
  return { rows: list, errors: errorList };
}

/** @param {unknown} r @returns {r is HubPageRow} */
function isRow(r) {
  if (!r || typeof r !== "object") return false;
  const { id, state } = /** @type {{ id?: unknown, state?: unknown }} */ (r);
  return typeof id === "string" && typeof state === "string";
}

/** The project's own page for a row, or null when it has no port.
 * @param {HubPageRow} row @returns {string | null} */
export function projectAddress(row) {
  return typeof row.port === "number" ? `http://127.0.0.1:${row.port}/` : null;
}

/** @param {unknown} body @param {number} status @returns {string} */
function reasonOf(body, status) {
  const b = /** @type {{ reason?: unknown, error?: unknown }} */ (body ?? {});
  if (typeof b.reason === "string" && b.reason) return b.reason;
  if (typeof b.error === "string" && b.error) return `the hub refused (${status}): ${b.error}`;
  return `the hub answered ${status}`;
}

/** The answer to one POST, read in full; a network error or an abort is a reason in words.
 * @param {FetchLike} fetchImpl @param {string} url @param {AbortSignal} signal
 * @returns {Promise<RowResult>} */
async function readAnswer(fetchImpl, url, signal) {
  /** @type {{ status: number, text: () => Promise<string> }} */
  let res;
  /** @type {string} */
  let text;
  try {
    res = await fetchImpl(url, { method: "POST", signal });
    text = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `the hub could not be reached: ${message}` };
  }
  /** @type {unknown} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: `the hub answered ${res.status} with something that is not JSON` };
  }
  const { ok: bodyOk } = /** @type {{ ok?: unknown }} */ (body ?? {});
  const okBody = bodyOk === true;
  if (res.status >= 200 && res.status < 300 && okBody) return { ok: true };
  return { ok: false, reason: reasonOf(body, res.status) };
}

/** One start/stop POST under one deadline that covers the request and the reading of its body: on
 * expiry the request is aborted and the result is a reason; the timer is cleared on every path.
 * @param {FetchLike} fetchImpl @param {Timers} timers @param {string} id
 * @param {"start" | "stop"} action @returns {Promise<RowResult>} */
async function postRow(fetchImpl, timers, id, action) {
  const controller = new AbortController();
  /** @type {unknown} */
  let handle = null;
  /** @type {Promise<null>} */
  const expired = new Promise((resolve) => {
    handle = timers.set(() => {
      controller.abort();
      resolve(null);
    }, POST_TIMEOUT_MS);
  });
  const url = `/api/hub/rows/${encodeURIComponent(id)}/${action}`;
  try {
    const got = await Promise.race([readAnswer(fetchImpl, url, controller.signal), expired]);
    if (got) return got;
    return {
      ok: false,
      reason: `the hub did not answer the ${action} within ${Math.round(POST_TIMEOUT_MS / 1000)} s`,
    };
  } finally {
    timers.clear(handle);
  }
}

/**
 * The hub page's client. One object per page; `subscribe` may be called more than once.
 * @param {HubApiDeps} [deps]
 */
export function makeHubApi(deps = {}) {
  const timers = deps.timers ?? defaultTimers;
  const openTab = deps.openTab ?? defaultOpenTab;
  const waitOnMs = deps.waitOnMs ?? WAIT_ON_MS;
  /** @type {HubPageRow[]} */
  let latest = [];
  /** Whether any view has arrived, so `latest` says which rows exist. */
  let heard = false;
  /** Called with every fresh row list, from any subscription. @type {Set<() => void>} */
  const waiters = new Set();

  /**
   * One stream subscription. Every `error` closes the EventSource and reconnects on our own timer
   * (1 s, doubling to 15 s, reset by a good event): the browser stops for good after a non-200
   * answer such as the 503 at shutdown, and its own retry after a drop would race ours.
   * @param {(snapshot: HubSnapshot) => void} listener
   * @returns {() => void} closes the subscription */
  const subscribe = (listener) => {
    const Ctor =
      deps.EventSourceImpl ?? /** @type {StreamCtor} */ (/** @type {unknown} */ (EventSource));
    /** @type {StreamLike | null} */
    let source = null;
    /** @type {unknown} */
    let timer = null;
    let delay = RETRY_MIN_MS;
    let closed = false;
    /** @type {{ rows: HubPageRow[], errors: unknown[] }} */
    let last = { rows: [], errors: [] };

    const connect = () => {
      timer = null;
      const es = new Ctor(STREAM_URL);
      source = es;
      es.onmessage = (ev) => {
        const view = parseView(ev.data);
        if (closed || source !== es || !view) return;
        delay = RETRY_MIN_MS;
        last = view;
        latest = view.rows;
        heard = true;
        listener({ ...view, connection: "live" });
        for (const w of [...waiters]) w();
      };
      es.onerror = () => {
        if (closed || source !== es) return;
        es.close();
        source = null;
        listener({ ...last, connection: "reconnecting" });
        timer = timers.set(connect, delay);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      source?.close();
      source = null;
      if (timer !== null) timers.clear(timer);
      timer = null;
    };
  };

  /** The row once the stream shows it on; "changed" when the row with this id is gone or points to
   * another project folder or port than `was`; null when `waitOnMs` runs out first.
   * @param {HubPageRow} was the row as it was at the click
   * @returns {Promise<HubPageRow | "changed" | null>} */
  const waitOn = (was) =>
    new Promise((resolve) => {
      const check = () => {
        const row = latest.find((r) => r.id === was.id);
        if (!row && !heard) return false;
        if (!row || row.project !== was.project || row.port !== was.port) finish("changed");
        else if (row.state === "on") finish(row);
        else return false;
        return true;
      };
      /** @param {HubPageRow | "changed" | null} row */
      const finish = (row) => {
        waiters.delete(check);
        timers.clear(handle);
        resolve(row);
      };
      const handle = timers.set(() => {
        finish(null);
      }, waitOnMs);
      if (!check()) waiters.add(check);
    });

  /** @param {string} id @returns {Promise<RowResult>} */
  const startRow = (id) => postRow(deps.fetchImpl ?? fetch, timers, id, "start");
  /** @param {string} id @returns {Promise<RowResult>} */
  const stopRow = (id) => postRow(deps.fetchImpl ?? fetch, timers, id, "stop");

  /**
   * Open the row's project page in a new tab. Call it straight from the click handler: for an off
   * row the tab is reserved before the first await (a popup blocker allows it only there), its
   * opener is cut, and it is sent to the project once the stream shows the row on.
   * @param {HubPageRow} row @returns {Promise<OpenResult>} */
  const openRow = async (row) => {
    if (row.state === "on") {
      const href = projectAddress(row);
      if (!href) return { ok: false, reason: "this project has no port" };
      // With noopener window.open always returns null, so a blocked tab cannot be told apart.
      openTab(href, "noopener,noreferrer");
      return { ok: true, href };
    }
    // The folder and port of the click: an entry re-pointed meanwhile is not where the tab goes.
    const was = { id: row.id, state: row.state, port: row.port, project: row.project };
    const tab = openTab("about:blank", "");
    if (tab) tab.opener = null;
    const fail = /** @param {string} reason @param {string | null} [href] @returns {OpenResult} */ (
      reason,
      href = null,
    ) => {
      tab?.close();
      return href ? { ok: false, reason, href } : { ok: false, reason };
    };
    const started = await startRow(was.id);
    if (!started.ok) return fail(started.reason);
    const on = await waitOn(was);
    if (on === "changed")
      return fail("the project changed while it started (another folder or port, or removed)");
    if (!on) return fail(`the project did not come on within ${Math.round(waitOnMs / 1000)} s`);
    const href = projectAddress(on);
    if (!href) return fail("this project has no port");
    if (!tab) return fail("the browser blocked the new tab; open the project with the link", href);
    tab.location.href = href;
    return { ok: true, href };
  };

  return { subscribe, startRow, stopRow, openRow };
}

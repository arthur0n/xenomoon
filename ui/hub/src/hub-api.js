// The hub page's one link to the hub (same origin, never a project server): the row stream with its
// own bounded reconnect, and start/stop as results in words. EventSource, fetch and timers are
// injected, so the tests run in Node with fakes.

/** A hub row as the stream sends it; this module reads only id and state.
 * @typedef {{ id: string, state: string } & Record<string, unknown>} HubPageRow */
/** @typedef {"live" | "reconnecting"} HubConnection */
/** @typedef {{ rows: HubPageRow[], errors: unknown[], connection: HubConnection }} HubSnapshot */
/** @typedef {{ ok: true } | { ok: false, reason: string }} RowResult */
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
/**
 * @typedef {{
 *   EventSourceImpl?: StreamCtor,
 *   fetchImpl?: FetchLike,
 *   timers?: Timers,
 * }} HubApiDeps */

export const STREAM_URL = "/api/hub/stream";
export const RETRY_MIN_MS = 1000;
export const RETRY_MAX_MS = 15000;
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
        listener({ ...view, connection: "live" });
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

  /** @param {string} id @returns {Promise<RowResult>} */
  const startRow = (id) => postRow(deps.fetchImpl ?? fetch, timers, id, "start");
  /** @param {string} id @returns {Promise<RowResult>} */
  const stopRow = (id) => postRow(deps.fetchImpl ?? fetch, timers, id, "stop");

  return { subscribe, startRow, stopRow };
}

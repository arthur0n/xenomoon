// The running request (start, stop or open) and the last refusal of each row, keyed by row id and
// kept outside the row component: a row that moves to the other group (and is remounted) stays busy and keeps its message,
// a second request for a row never starts while one runs, and the result for a row that has left the
// list is dropped. No React; App.jsx reads it through useSyncExternalStore.

/** @typedef {"start" | "stop" | "open"} Busy */
/** @typedef {{ reason: string }} Problem */
/** @typedef {{ busy: Busy | null, problem: Problem | null }} RowOp */
/** @typedef {{ ok: true } | { ok: false, reason: string }} OpResult */

/** @type {RowOp} */
export const IDLE = Object.freeze({ busy: null, problem: null });

export function makeRowOps() {
  /** Replaced, never mutated, on every change, so it is a valid store snapshot.
   * @type {ReadonlyMap<string, RowOp>} */
  let ops = new Map();
  /** The ids of the rows on the page, or null before the first list. @type {Set<string> | null} */
  let present = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /** @param {(next: Map<string, RowOp>) => void} change */
  const update = (change) => {
    const next = new Map(ops);
    change(next);
    ops = next;
    for (const l of [...listeners]) l();
  };

  /** @param {() => void} listener @returns {() => void} */
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /** The rows now on the page: the refusals of the others are forgotten (a running request is kept
   * until it ends, so a row that comes back meanwhile is still busy).
   * @param {Iterable<string>} ids */
  const keep = (ids) => {
    present = new Set(ids);
    const gone = [...ops].filter(([id, op]) => !present?.has(id) && op.busy === null);
    if (gone.length)
      update((m) => {
        for (const [id] of gone) m.delete(id);
      });
  };

  /** Starts `call` at once unless this row has one running. A refusal sets its reason as the row's
   * problem; a successful start or stop clears it, a successful open leaves it as it was.
   * @param {string} id @param {Busy} kind @param {() => Promise<OpResult>} call
   * @returns {boolean} false when a request for this row already runs */
  const run = (id, kind, call) => {
    const was = ops.get(id) ?? IDLE;
    if (was.busy !== null) return false;
    update((m) => m.set(id, { busy: kind, problem: was.problem }));
    /** @param {OpResult} res */
    const done = (res) => {
      if (present && !present.has(id)) {
        update((m) => m.delete(id));
        return;
      }
      const problem = !res.ok ? { reason: res.reason } : kind === "open" ? was.problem : null;
      update((m) => m.set(id, { busy: null, problem }));
    };
    /** `call` runs here, synchronously (a new tab needs the click's user activation); a throw
     * from it ends the request as a rejection does. @type {Promise<OpResult>} */
    let pending;
    try {
      pending = call();
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(done, (/** @type {unknown} */ err) => {
      done({ ok: false, reason: err instanceof Error ? err.message : String(err) });
    });
    return true;
  };

  return {
    subscribe,
    keep,
    run,
    /** @returns {ReadonlyMap<string, RowOp>} */
    snapshot: () => ops,
  };
}

/** @typedef {ReturnType<typeof makeRowOps>} RowOps */

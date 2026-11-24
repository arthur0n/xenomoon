// Tests for openProject (open-project.js) with a stand-in window that records its calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_REASON, FAILED_REASON, openProject } from "./open-project.js";

const target = { name: "tab-alpha", address: "http://127.0.0.1:4100/" };

/** @param {string[]} calls @param {boolean} readable @param {string} [href] */
function tab(calls, readable, href = "about:blank") {
  return {
    location: {
      get href() {
        calls.push("href");
        if (!readable) throw new Error("cross-origin");
        return href;
      },
      /** @param {string} url */
      replace(url) {
        calls.push(`replace:${url}`);
      },
    },
    focus() {
      calls.push("focus");
    },
  };
}

/** @param {string[]} calls @param {ReturnType<typeof tab> | null} w */
function winOf(calls, w) {
  return {
    /** @param {string} url @param {string} name */
    open(url, name) {
      calls.push(`open:${JSON.stringify(url)}:${name}`);
      return w;
    },
  };
}

void test("the named tab is asked for with an empty address and the given name", () => {
  /** @type {string[]} */ const calls = [];
  openProject(target, winOf(calls, tab(calls, true)));
  assert.equal(calls[0], 'open:"":tab-alpha');
});

void test("a new readable tab is sent to the address once, then focused", () => {
  /** @type {string[]} */ const calls = [];
  const result = openProject(target, winOf(calls, tab(calls, true)));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    calls.filter((c) => c !== "href"),
    ['open:"":tab-alpha', "replace:http://127.0.0.1:4100/", "focus"],
  );
});

void test("a readable tab that is not blank (the hub's own origin) is sent to the address once, then focused", () => {
  /** @type {string[]} */ const calls = [];
  const w = tab(calls, true, "http://127.0.0.1:4000/somewhere");
  const result = openProject(target, winOf(calls, w));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    calls.filter((c) => c !== "href"),
    ['open:"":tab-alpha', "replace:http://127.0.0.1:4100/", "focus"],
  );
});

void test("a tab whose location.href throws is not navigated and is focused", () => {
  /** @type {string[]} */ const calls = [];
  const result = openProject(target, winOf(calls, tab(calls, false)));
  assert.deepEqual(result, { ok: true });
  assert.ok(!calls.some((c) => c.startsWith("replace:")));
  assert.equal(calls.at(-1), "focus");
});

void test("a blocked tab gives the blocked reason and nothing else is called", () => {
  /** @type {string[]} */ const calls = [];
  const result = openProject(target, winOf(calls, null));
  assert.deepEqual(result, { ok: false, reason: BLOCKED_REASON });
  assert.deepEqual(calls, ['open:"":tab-alpha']);
});

void test("the result is returned synchronously, not as a Promise", () => {
  /** @type {string[]} */ const calls = [];
  const result = openProject(target, winOf(calls, tab(calls, true)));
  assert.ok(!(result instanceof Promise));
  assert.equal(typeof (/** @type {any} */ (result).then), "undefined");
  assert.equal(result.ok, true);
});

void test("win.open throwing gives the failed reason and does not throw", () => {
  const win = {
    open() {
      throw new Error("popup crashed");
    },
  };
  assert.deepEqual(openProject(target, win), { ok: false, reason: FAILED_REASON });
});

void test("location.replace throwing gives the failed reason and the tab is not focused", () => {
  /** @type {string[]} */ const calls = [];
  const w = tab(calls, true);
  w.location.replace = () => {
    throw new Error("navigation refused");
  };
  const result = openProject(target, winOf(calls, w));
  assert.deepEqual(result, { ok: false, reason: FAILED_REASON });
  assert.ok(!calls.includes("focus"));
});

void test("focus throwing gives the failed reason and does not throw", () => {
  /** @type {string[]} */ const calls = [];
  const w = tab(calls, true);
  w.focus = () => {
    throw new Error("focus refused");
  };
  const result = openProject(target, winOf(calls, w));
  assert.deepEqual(result, { ok: false, reason: FAILED_REASON });
  assert.ok(calls.includes("replace:http://127.0.0.1:4100/"));
});

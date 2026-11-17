// Build-at-start of the hub page over throwaway repo roots: stale check, publish, failure, lock.
// The Vite run is a fake, except one test that really builds the placeholder page with Vite.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  ensureHubBuilt,
  hubPaths,
  hubStaleness,
  reclaimLock,
  runViteBuild,
  RECORD_NAME,
} from "./build.js";
import { withDeadline } from "../../core/http/test-deadline.js";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

/** A repo root with a minimal ui/hub/ and a lockfile. */
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-build-"));
  roots.push(root);
  const hub = path.join(root, "ui", "hub");
  fs.mkdirSync(path.join(hub, "src"), { recursive: true });
  fs.writeFileSync(path.join(hub, "index.html"), "<div id=root></div>");
  fs.writeFileSync(path.join(hub, "src", "main.jsx"), "export {};");
  fs.writeFileSync(path.join(hub, "vite.config.js"), "export default {};");
  fs.writeFileSync(path.join(root, "package-lock.json"), '{"react":"19.0.0"}');
  return root;
}

/** Fake Vite: writes index.html with `label`, records each outDir it wrote.
 * @param {string} label @param {string[]} [outDirs] */
const fakeVite =
  (label, outDirs = []) =>
  async (/** @type {{ outDir: string }} */ { outDir }) => {
    outDirs.push(outDir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), label);
    return { ok: true, output: "built" };
  };

/** @param {string} root */
const page = (root) => fs.readFileSync(path.join(hubPaths(root).distDir, "index.html"), "utf8");

/** A root with one completed fake build. */
async function builtRoot() {
  const root = makeRoot();
  await ensureHubBuilt({ root, runVite: fakeVite("v1") });
  return root;
}

test("a missing page is stale", () => {
  assert.deepEqual(hubStaleness(makeRoot()), { stale: true, reason: "no built page" });
});

test("a completed build is published with its record and is then not stale", async () => {
  const root = makeRoot();
  const res = await ensureHubBuilt({ root, runVite: fakeVite("v1") });
  assert.equal(res.built, true);
  assert.equal(page(root), "v1");
  /** @type {unknown} */
  const raw = JSON.parse(fs.readFileSync(hubPaths(root).recordFile, "utf8"));
  const rec = /** @type {{ inputs: Record<string, string> }} */ (raw);
  assert.ok(rec.inputs["ui/hub/src/main.jsx"]);
  assert.deepEqual(hubStaleness(root), { stale: false, reason: "up to date" });
  const left = fs.readdirSync(hubPaths(root).hubDir).filter((n) => n.startsWith(".build"));
  assert.deepEqual(left, [], "no temporary folder or lock left behind");
});

test("a fresh page is not rebuilt", async () => {
  const root = await builtRoot();
  const res = await ensureHubBuilt({ root, runVite: fakeVite("v2") });
  assert.equal(res.built, false);
  assert.equal(page(root), "v1");
});

test("a rebuild replaces the old page and leaves no temporary folder", async () => {
  const root = await builtRoot();
  fs.writeFileSync(path.join(root, "ui/hub/src/main.jsx"), "export const v = 2;");
  const res = await ensureHubBuilt({ root, runVite: fakeVite("v2") });
  assert.equal(res.built, true);
  assert.equal(page(root), "v2");
  assert.equal(hubStaleness(root).stale, false);
  const left = fs.readdirSync(hubPaths(root).hubDir).filter((n) => n.startsWith(".build"));
  assert.deepEqual(left, []);
});

/** @type {[string, (root: string) => void, RegExp][]} */
const CHANGES = [
  [
    "a modified source",
    (r) => {
      fs.writeFileSync(path.join(r, "ui/hub/src/main.jsx"), "x");
    },
    /^changed ui\/hub\/src\/main.jsx/,
  ],
  [
    "an added file",
    (r) => {
      fs.writeFileSync(path.join(r, "ui/hub/src/b.jsx"), "x");
    },
    /^added ui\/hub\/src\/b.jsx/,
  ],
  [
    "a removed file",
    (r) => {
      fs.rmSync(path.join(r, "ui/hub/src/main.jsx"));
    },
    /^removed ui\/hub\/src\/main.jsx/,
  ],
  [
    "a lockfile-only change",
    (r) => {
      fs.writeFileSync(path.join(r, "package-lock.json"), '{"react":"19.1.0"}');
    },
    /^changed package-lock.json/,
  ],
  [
    "a Vite config change",
    (r) => {
      fs.writeFileSync(path.join(r, "ui/hub/vite.config.js"), "//");
    },
    /^changed ui\/hub\/vite.config.js/,
  ],
];
for (const [name, change, reason] of CHANGES) {
  test(`${name} makes the page stale`, async () => {
    const root = await builtRoot();
    change(root);
    const st = hubStaleness(root);
    assert.equal(st.stale, true);
    assert.match(st.reason, reason);
  });
}

test("a failed build throws Vite's output and keeps the old page and old record", async () => {
  const root = await builtRoot();
  const recBefore = fs.readFileSync(hubPaths(root).recordFile, "utf8");
  fs.writeFileSync(path.join(root, "ui/hub/src/main.jsx"), "broken");
  /** Fails after writing a partial page, so only the exit status tells the failure. */
  const failing = async (/** @type {{ root: string, outDir: string }} */ o) => {
    await fakeVite("partial")(o);
    return { ok: false, output: "SyntaxError in main.jsx" };
  };
  await assert.rejects(ensureHubBuilt({ root, runVite: failing }), /SyntaxError in main.jsx/);
  assert.equal(page(root), "v1");
  assert.equal(fs.readFileSync(hubPaths(root).recordFile, "utf8"), recBefore);
  assert.equal(hubStaleness(root).stale, true, "still stale: the record is the old build's");
});

test("a second build during a first waits for it and never writes a folder", async () => {
  const root = makeRoot();
  /** @type {string[]} */
  const outDirs = [];
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise((/** @type {(v?: unknown) => void} */ r) => (release = r));
  /** @type {() => void} */
  let started = () => {};
  const running = new Promise((/** @type {(v?: unknown) => void} */ r) => (started = r));
  const slow = async (/** @type {{ root: string, outDir: string }} */ o) => {
    started();
    await gate;
    return fakeVite("first", outDirs)(o);
  };
  const first = ensureHubBuilt({ root, runVite: slow });
  await withDeadline(
    "first build to start",
    (res) =>
      void running.then(() => {
        res();
      }),
  );
  const second = ensureHubBuilt({ root, runVite: fakeVite("second", outDirs), pollMs: 2 });
  release();
  /** @typedef {Awaited<ReturnType<typeof ensureHubBuilt>>} Res */
  const [a, b] = await withDeadline(
    "both builds",
    /** @type {(res: (v: [Res, Res]) => void, rej: (e: Error) => void) => void} */
    (res, rej) => void Promise.all([first, second]).then(res, rej),
  );
  assert.equal(a.built, true);
  assert.equal(b.built, false, "the second re-checked after waiting and found the page fresh");
  assert.equal(outDirs.length, 1);
  assert.equal(page(root), "first");
});

test("a second build refuses with a clear message when the first outlasts the wait", async () => {
  const root = makeRoot();
  fs.mkdirSync(hubPaths(root).lockDir);
  fs.writeFileSync(
    path.join(hubPaths(root).lockDir, "owner.json"),
    JSON.stringify({ pid: process.pid }),
  );
  const opts = { root, runVite: fakeVite("x"), waitMs: 10, pollMs: 2 };
  await assert.rejects(ensureHubBuilt(opts), /another build \(pid \d+\) still holds/);
  assert.equal(fs.existsSync(hubPaths(root).distDir), false);
});

test("a lock left by a dead process is recovered", async () => {
  const root = makeRoot();
  fs.mkdirSync(hubPaths(root).lockDir);
  // pid far above any live pid on macOS/Linux defaults
  fs.writeFileSync(
    path.join(hubPaths(root).lockDir, "owner.json"),
    JSON.stringify({ pid: 2 ** 30 }),
  );
  const res = await ensureHubBuilt({ root, runVite: fakeVite("v1"), waitMs: 10, pollMs: 2 });
  assert.equal(res.built, true);
  assert.equal(fs.existsSync(hubPaths(root).lockDir), false);
});

/** A lock folder last touched `ageMs` ago, with an owner file only when `pid` is given.
 * @param {string} root @param {number} ageMs @param {number} [pid] */
function makeOldLock(root, ageMs, pid) {
  const { lockDir } = hubPaths(root);
  fs.mkdirSync(lockDir);
  if (pid !== undefined)
    fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid }));
  const past = new Date(Date.now() - ageMs);
  fs.utimesSync(lockDir, past, past);
}

test("a live owner's lock older than the old 120 s age limit is never taken over", async () => {
  const root = makeRoot();
  makeOldLock(root, 200_000, process.pid);
  const opts = { root, runVite: fakeVite("v1"), waitMs: 10, pollMs: 2 };
  await assert.rejects(ensureHubBuilt(opts), /another build \(pid \d+\) still holds/);
  assert.equal(fs.existsSync(path.join(hubPaths(root).lockDir, "owner.json")), true);
  assert.equal(fs.existsSync(hubPaths(root).distDir), false);
});

test("a lock folder without an owner file does not block forever", async () => {
  const root = makeRoot();
  makeOldLock(root, 10_000);
  const opts = { root, runVite: fakeVite("v1"), waitMs: 10, pollMs: 2 };
  const res = await ensureHubBuilt(opts);
  assert.equal(res.built, true);
  assert.equal(fs.existsSync(hubPaths(root).lockDir), false);
});

test("a failed build leaves no temporary build folder and no lock in ui/hub/", async () => {
  const root = makeRoot();
  const failing = async (/** @type {{ root: string, outDir: string }} */ o) => {
    await fakeVite("partial")(o);
    return { ok: false, output: "boom" };
  };
  await assert.rejects(ensureHubBuilt({ root, runVite: failing }), /boom/);
  const left = fs.readdirSync(hubPaths(root).hubDir).filter((n) => n.startsWith(".build"));
  assert.deepEqual(left, []);
});

test("the default really builds the placeholder page with Vite", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-build-real-"));
  roots.push(root);
  const src = path.join(REPO, "ui", "hub");
  const filter = (/** @type {string} */ s) => !/[/\\](dist|\.build[^/\\]*)$/.test(s);
  fs.cpSync(src, path.join(root, "ui", "hub"), { recursive: true, filter });
  fs.copyFileSync(path.join(REPO, "package-lock.json"), path.join(root, "package-lock.json"));
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"), "dir");
  const res = await ensureHubBuilt({ root, runVite: runViteBuild });
  assert.equal(res.built, true);
  assert.match(page(root), /<script type="module"[^>]*src="\/assets\/.+\.js"/);
  assert.ok(fs.existsSync(path.join(hubPaths(root).distDir, RECORD_NAME)));
  assert.equal(hubStaleness(root).stale, false);
});

/** Write (or overwrite) the lock's owner file.
 * @param {string} root @param {{ pid: number, token: string }} owner */
function writeLock(root, owner) {
  const { lockDir } = hubPaths(root);
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify(owner));
}

/** @param {string} root @returns {unknown} */
function lockToken(root) {
  /** @type {unknown} */
  const raw = JSON.parse(fs.readFileSync(path.join(hubPaths(root).lockDir, "owner.json"), "utf8"));
  return /** @type {{ token?: unknown }} */ (raw).token;
}

/** @param {string} root */
const buildEntries = (root) =>
  fs.readdirSync(hubPaths(root).hubDir).filter((n) => n.startsWith(".build"));

const DEAD = { pid: 2 ** 30, token: "dead" };

test("three builds started together against a dead owner's lock run one at a time", async () => {
  const root = makeRoot();
  writeLock(root, DEAD);
  const s = { active: 0, max: 0, runs: 0 };
  /** Fails after a short wait, so every caller builds in turn. */
  const counting = async () => {
    s.active++;
    s.runs++;
    s.max = Math.max(s.max, s.active);
    await pause(15);
    s.active--;
    return { ok: false, output: "fake failure" };
  };
  const calls = [1, 2, 3].map(() => ensureHubBuilt({ root, runVite: counting, pollMs: 1 }));
  /** @typedef {PromiseSettledResult<Awaited<ReturnType<typeof ensureHubBuilt>>>[]} Settled */
  const results = await withDeadline(
    "three builds",
    /** @type {(res: (v: Settled) => void) => void} */
    (res) => void Promise.allSettled(calls).then(res),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ["rejected", "rejected", "rejected"],
  );
  assert.equal(s.runs, 3);
  assert.equal(s.max, 1, "never two builds at once");
  assert.deepEqual(buildEntries(root), []);
});

/** @param {number} ms */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test("two processes started together against a dead owner's lock build one at a time", async () => {
  const root = makeRoot();
  writeLock(root, DEAD);
  const log = path.join(root, "log");
  const buildUrl = new URL("./build.js", import.meta.url).href;
  const code = `import fs from "node:fs"; import { ensureHubBuilt } from ${JSON.stringify(buildUrl)};
const [root, log] = process.argv.slice(1);
const runVite = async () => {
  fs.appendFileSync(log, "start\\n");
  await new Promise((r) => setTimeout(r, 150));
  fs.appendFileSync(log, "end\\n");
  return { ok: false, output: "" };
};
await ensureHubBuilt({ root, runVite, pollMs: 2 }).catch(() => {});`;
  const child = () =>
    new Promise((res) => {
      spawn(process.execPath, ["--input-type=module", "-e", code, root, log]).on("close", res);
    });
  await withDeadline(
    "both child builds",
    (res, rej) =>
      void Promise.all([child(), child()]).then(() => {
        res();
      }, rej),
  );
  assert.equal(fs.readFileSync(log, "utf8"), "start\nend\nstart\nend\n");
});

test("a waiter that judged an older lock dead never removes the newer lock", () => {
  const root = makeRoot();
  writeLock(root, { pid: process.pid, token: "newer" });
  assert.equal(reclaimLock(hubPaths(root).lockDir, { pid: DEAD.pid, token: "older" }), false);
  assert.equal(lockToken(root), "newer");
});

test("a dead lock whose claim another waiter holds is left to that waiter", () => {
  const root = makeRoot();
  writeLock(root, DEAD);
  fs.mkdirSync(path.join(hubPaths(root).hubDir, ".build-claim-dead"));
  assert.equal(reclaimLock(hubPaths(root).lockDir, DEAD), false);
  assert.equal(lockToken(root), "dead");
});

test("release leaves a lock that holds another acquisition's token", async () => {
  const root = makeRoot();
  const takenOver = async (/** @type {{ root: string, outDir: string }} */ o) => {
    writeLock(root, { pid: process.pid, token: "other" });
    return fakeVite("v1")(o);
  };
  await ensureHubBuilt({ root, runVite: takenOver });
  assert.equal(lockToken(root), "other");
});

test("a failing second rename puts the old page back and fails the build", async () => {
  const root = await builtRoot();
  fs.writeFileSync(path.join(root, "ui/hub/src/main.jsx"), "export const v = 2;");
  const renameDir = (/** @type {string} */ from, /** @type {string} */ to) => {
    if (path.basename(from).startsWith(".build-tmp-")) throw new Error("fake rename failure");
    fs.renameSync(from, to);
  };
  const opts = { root, runVite: fakeVite("v2"), renameDir };
  await assert.rejects(ensureHubBuilt(opts), /could not publish[\s\S]*fake rename failure/);
  assert.equal(page(root), "v1");
  assert.deepEqual(buildEntries(root), []);
});

test("folders left by a crashed build are removed by the next build", async () => {
  const root = await builtRoot();
  const { hubDir } = hubPaths(root);
  for (const n of [".build-old-a", ".build-tmp-b", ".build-dead-c", ".build-cand-d"])
    fs.mkdirSync(path.join(hubDir, n, "x"), { recursive: true });
  fs.writeFileSync(path.join(root, "ui/hub/src/main.jsx"), "export const v = 2;");
  await ensureHubBuilt({ root, runVite: fakeVite("v2") });
  assert.equal(page(root), "v2");
  assert.deepEqual(buildEntries(root), []);
});

test("a missing page next to a crashed build's old page is simply rebuilt", async () => {
  const root = makeRoot();
  const old = path.join(hubPaths(root).hubDir, ".build-old-a");
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, "index.html"), "v0");
  const res = await ensureHubBuilt({ root, runVite: fakeVite("v1") });
  assert.deepEqual(res, { built: true, reason: "no built page" });
  assert.equal(page(root), "v1");
  assert.deepEqual(buildEntries(root), []);
});

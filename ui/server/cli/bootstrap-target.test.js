// bootstrap-target.js — which install `xenomoon install` adds a project to (#65), plus a dry
// probe of bootstrap.js itself: a temp registry, fake installs whose `install-project` script
// only records its argv, and a stub `git` that records and fails every call. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapTarget,
  describeFolder,
  describeInstalls,
  explicitTarget,
  installFolder,
  parseBootstrapArgs,
} from "./bootstrap-target.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP = path.join(HERE, "bootstrap.js");
const XENOMOON = path.join(HERE, "xenomoon.js");
const CWD = "/ws";
const PROJECT = "/ws/app";
/** @typedef {import("./bootstrap-target.js").Folder} Folder */
/** `existing` is given as the Folder it describes; the decision gets it as a lazy read.
 * @param {Partial<Omit<import("./bootstrap-target.js").TargetInput, "existing">>
 *   & { existing?: Folder }} over */
const input = ({ existing = { kind: "absent" }, ...over }) => ({
  domain: "webapp",
  installs: [],
  project: PROJECT,
  folder: installFolder(CWD, "webapp"),
  existing: () => existing,
  known: ["webapp", "expoapp"],
  ...over,
});

/** A fake install: package.json named xenomoon whose install-project writes its argv to a marker.
 * @param {string} dir @param {Record<string, unknown> | null} cfg */
function fakeInstall(dir, cfg) {
  mkdirSync(dir, { recursive: true });
  const script = `node -e "require('fs').writeFileSync('ran.json', JSON.stringify(process.argv.slice(1)))"`;
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "xenomoon", scripts: { "install-project": script } }),
  );
  if (cfg) writeFileSync(path.join(dir, ".xenomoon.json"), JSON.stringify(cfg));
  return dir;
}
const WEBAPP = { domain: "webapp", domainDescriptor: { name: "webapp" } };

test("one registered install of the domain → use it", () => {
  const installs = [
    { dir: "/i/web", domain: "webapp" },
    { dir: "/i/expo", domain: "expoapp" },
  ];
  assert.deepEqual(bootstrapTarget(input({ installs })), { use: "/i/web" });
});

test("no registered install of the domain → create <cwd>/<domain>-xm", () => {
  const installs = [{ dir: "/i/expo", domain: "expoapp" }];
  assert.deepEqual(bootstrapTarget(input({ installs })), { create: "/ws/webapp-xm", reuse: false });
});

test("two registered installs of the domain → refuse, listing both", () => {
  const installs = [
    { dir: "/i/a", domain: "webapp" },
    { dir: "/i/b", domain: "webapp" },
  ];
  const r = bootstrapTarget(input({ installs }));
  assert.ok("refuse" in r);
  const text = r.refuse.join("\n");
  assert.match(text, /2 registered installs have the "webapp" domain/);
  assert.match(text, /\/i\/a/);
  assert.match(text, /\/i\/b/);
  assert.match(text, /xenomoon install \/ws\/app --install=<path> --domain=webapp/);
});

test("the domain-named folder is an unregistered install of the same domain → reuse it", () => {
  const existing = /** @type {const} */ ({ kind: "install", domain: "webapp" });
  assert.deepEqual(bootstrapTarget(input({ existing })), { create: "/ws/webapp-xm", reuse: true });
});

test("the domain-named folder is something else → refuse, never clone over it", () => {
  const r = bootstrapTarget(input({ existing: { kind: "other" } }));
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /webapp-xm is not empty and not a xenomoon install/);
});

test("the domain-named folder is an install of another domain → refuse", () => {
  const existing = /** @type {const} */ ({ kind: "install", domain: "expoapp" });
  const r = bootstrapTarget(input({ existing }));
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /an install of the "expoapp" domain/);
});

test("no --domain: the only domain install is used; none or several → refuse naming --domain", () => {
  const one = [{ dir: "/i/web", domain: "webapp" }];
  assert.deepEqual(bootstrapTarget(input({ domain: null, installs: one })), { use: "/i/web" });
  const none = bootstrapTarget(input({ domain: null }));
  assert.ok("refuse" in none);
  assert.match(none.refuse.join("\n"), /Pass --domain=<name> \(available: webapp, expoapp\)/);
  const two = [...one, { dir: "/i/expo", domain: "expoapp" }];
  const r = bootstrapTarget(input({ domain: null, installs: two }));
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /2 installs are registered/);
});

test("no --domain in a terminal: none or several installs → ask the domain, one → use it", () => {
  const one = [{ dir: "/i/web", domain: "webapp" }];
  const ask = { ask: "domain", options: ["webapp", "expoapp"] };
  assert.deepEqual(bootstrapTarget(input({ domain: null, interactive: true })), ask);
  const two = [...one, { dir: "/i/expo", domain: "expoapp" }];
  assert.deepEqual(bootstrapTarget(input({ domain: null, installs: two, interactive: true })), ask);
  const only = bootstrapTarget(input({ domain: null, installs: one, interactive: true }));
  assert.deepEqual(only, { use: "/i/web" });
  // A given domain is never asked again, terminal or not.
  assert.deepEqual(bootstrapTarget(input({ interactive: true })), {
    create: "/ws/webapp-xm",
    reuse: false,
  });
});

test("no --domain, not a terminal: still the refusal naming --domain, never an ask", () => {
  const r = bootstrapTarget(input({ domain: null, interactive: false }));
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /no domain given and no install registered/);
});

test("an unknown domain is refused before anything is cloned", () => {
  const r = bootstrapTarget(input({ domain: "nope" }));
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /unknown domain "nope"/);
});

test("half-finished config and a vanished dir do not count as having the domain", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  const half = fakeInstall(path.join(root, "half"), { domain: "webapp" }); // no descriptor
  const full = fakeInstall(path.join(root, "full"), WEBAPP);
  const gone = path.join(root, "gone");
  assert.deepEqual(describeInstalls([half, full, gone]), [
    { dir: half, domain: null },
    { dir: full, domain: "webapp" },
    { dir: gone, domain: null },
  ]);
  const installs = describeInstalls([half, gone]);
  assert.deepEqual(bootstrapTarget(input({ installs })), { create: "/ws/webapp-xm", reuse: false });
});

test("describeFolder and explicitTarget", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  const full = fakeInstall(path.join(root, "full"), WEBAPP);
  mkdirSync(path.join(root, "empty"));
  writeFileSync(path.join(root, "file.txt"), "x");
  assert.deepEqual(describeFolder(path.join(root, "nope")), { kind: "absent" });
  assert.deepEqual(describeFolder(path.join(root, "empty")), { kind: "empty" });
  assert.deepEqual(describeFolder(root), { kind: "other" });
  assert.deepEqual(describeFolder(full), { kind: "install", domain: "webapp" });
  assert.deepEqual(explicitTarget(full, describeFolder(full), "webapp"), { use: full });
  assert.ok("refuse" in explicitTarget(full, describeFolder(full), "expoapp"));
  assert.ok("refuse" in explicitTarget(root, describeFolder(root), null));
});

test("one registered install of the domain → use it, the destination folder is never read", () => {
  const installs = [{ dir: "/i/web", domain: "webapp" }];
  const existing = () => assert.fail("the destination folder was read");
  assert.deepEqual(bootstrapTarget({ ...input({ installs }), existing }), { use: "/i/web" });
});

test("describeFolder on a regular file → other, no throw", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "xm-bt-")), "webapp-xm");
  writeFileSync(file, "");
  assert.deepEqual(describeFolder(file), { kind: "other" });
});

const IS_ROOT = process.getuid?.() === 0;

test(
  "describeFolder on a directory it cannot list → unreadable with EACCES, no throw",
  { skip: IS_ROOT && "root lists a mode-000 directory anyway" },
  () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "xm-bt-")), "webapp-xm");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "f"), "");
    chmodSync(dir, 0o000);
    try {
      assert.deepEqual(describeFolder(dir), { kind: "unreadable", code: "EACCES" });
    } finally {
      chmodSync(dir, 0o755);
    }
  },
);

test("describeFolder on a broken symlink → unreadable with ENOENT, not absent", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  const link = path.join(root, "webapp-xm");
  symlinkSync(path.join(root, "gone"), link);
  assert.deepEqual(describeFolder(link), { kind: "unreadable", code: "ENOENT" });
});

test("no registered install + an unreadable <cwd>/<domain>-xm → refuse naming the path and the code", () => {
  const folder = "/ws/webapp-xm";
  const r = bootstrapTarget(input({ folder, existing: { kind: "unreadable", code: "EACCES" } }));
  assert.deepEqual(r, {
    refuse: [
      `✗ /ws/webapp-xm cannot be read (EACCES); a new "webapp" install would go there.`,
      `  Move that folder, or run from another directory.`,
    ],
  });
});

test("no registered install + a regular file at <cwd>/<domain>-xm → refuse, never clone", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "xm-bt-"));
  const folder = installFolder(cwd, "webapp");
  writeFileSync(folder, "x");
  const r = bootstrapTarget({ ...input({ folder }), existing: () => describeFolder(folder) });
  assert.ok("refuse" in r);
  assert.match(r.refuse.join("\n"), /webapp-xm is not empty and not a xenomoon install/);
});

test("parseBootstrapArgs: positional project, --install consumed, the rest forwarded", () => {
  assert.deepEqual(
    parseBootstrapArgs(["app", "--domain", "webapp", "--port=4100", "--install=/i"]),
    {
      projectArg: "app",
      installArg: "/i",
      domainArg: "webapp",
      forwarded: ["--domain", "webapp", "--port=4100"],
    },
  );
});

/** A sandbox for the dry probe: workspace, project, registry, stub git on PATH.
 * @param {string[]} installs registered install dirs */
function sandbox(installs = []) {
  const root = mkdtempSync(path.join(tmpdir(), "xm-bt-probe-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const gitLog = path.join(root, "git.log");
  writeFileSync(path.join(bin, "git"), `#!/bin/sh\necho "$@" >> "${gitLog}"\nexit 1\n`);
  chmodSync(path.join(bin, "git"), 0o755);
  mkdirSync(path.join(root, "app"));
  const registry = path.join(root, "installs.json");
  return { root, gitLog, registry, bin, installs };
}
/** @param {ReturnType<typeof sandbox>} box @param {string[]} args @param {string} [script] */
function runBootstrap(box, args, script = BOOTSTRAP) {
  const installs = Object.fromEntries(box.installs.map((d) => [d, null]));
  writeFileSync(box.registry, JSON.stringify({ version: 1, installs }));
  /** @type {NodeJS.ProcessEnv} */ const env = {
    ...process.env,
    XENOMOON_REGISTRY: box.registry,
    PATH: `${box.bin}:${process.env.PATH}`,
  };
  delete env.XENOMOON_INSTALL;
  return spawnSync("node", [script, ...args], { cwd: box.root, env, encoding: "utf8" });
}

test("probe: a registered webapp install gets the project — install-project ran, no clone", () => {
  const box = sandbox();
  box.installs.push(fakeInstall(path.join(box.root, "some-xm"), WEBAPP));
  const r = runBootstrap(box, ["app", "--domain=webapp"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Adding .*app to the install at .*some-xm/);
  const ran = /** @type {unknown} */ (
    JSON.parse(readFileSync(path.join(box.installs[0] ?? "", "ran.json"), "utf8"))
  );
  assert.deepEqual(ran, [path.join(realpathSync(box.root), "app"), "--domain=webapp"]);
  assert.equal(existsSync(box.gitLog), false, "git was never called");
});

test("probe: a regular FILE named webapp-xm in the cwd does not stop the registered install", () => {
  const box = sandbox();
  box.installs.push(fakeInstall(path.join(box.root, "some-xm"), WEBAPP));
  writeFileSync(path.join(box.root, "webapp-xm"), "x");
  const r = runBootstrap(box, ["app", "--domain=webapp"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Adding .*app to the install at .*some-xm/);
  assert.equal(existsSync(path.join(box.installs[0] ?? "", "ran.json")), true);
  assert.equal(existsSync(box.gitLog), false, "git was never called");
});

test("probe: two registered webapp installs → exit 1, both listed, nothing ran", () => {
  const box = sandbox();
  box.installs.push(fakeInstall(path.join(box.root, "a-xm"), WEBAPP));
  box.installs.push(fakeInstall(path.join(box.root, "b-xm"), WEBAPP));
  const r = runBootstrap(box, ["app", "--domain=webapp"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /2 registered installs have the "webapp" domain/);
  assert.match(r.stderr, /a-xm[\s\S]*b-xm/);
  for (const d of box.installs) assert.equal(existsSync(path.join(d, "ran.json")), false);
  assert.equal(existsSync(box.gitLog), false, "git was never called");
});

test("probe: no webapp install registered → clones into <cwd>/webapp-xm (stub git refuses)", () => {
  const box = sandbox();
  const r = runBootstrap(box, ["app", "--domain=webapp"]);
  assert.notEqual(r.status, 0);
  const calls = readFileSync(box.gitLog, "utf8").trim().split("\n");
  assert.ok(calls.length >= 1);
  for (const c of calls)
    assert.match(c, new RegExp(`^clone .* ${path.join(realpathSync(box.root), "webapp-xm")}$`));
});

test("probe: `xenomoon install --install=<path>` reaches that install — no registry, no clone", () => {
  const box = sandbox(); // nothing registered: without the flag this would clone webapp-xm
  const inst = fakeInstall(path.join(box.root, "named-xm"), WEBAPP);
  const r = runBootstrap(box, ["install", "app", `--install=${inst}`, "--domain=webapp"], XENOMOON);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Adding .*app to the install at .*named-xm/);
  const ran = /** @type {unknown} */ (
    JSON.parse(readFileSync(path.join(inst, "ran.json"), "utf8"))
  );
  assert.deepEqual(ran, [path.join(realpathSync(box.root), "app"), "--domain=webapp"]);
  assert.equal(existsSync(box.gitLog), false, "git was never called");
});

test("probe: no --domain, nothing registered, not a terminal → exit 1 naming --domain, nothing ran", () => {
  const box = sandbox();
  const r = runBootstrap(box, ["app"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Pass --domain=<name>/);
  assert.equal(existsSync(path.join(box.root, "webapp-xm")), false);
  assert.equal(existsSync(box.gitLog), false, "git was never called");
});

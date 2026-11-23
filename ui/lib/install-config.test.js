// install-config.js: strict read, refusing update, atomic write, and no empty read while writing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseJSON } from "./json.js";
import { readInstallConfigStrict, updateInstallConfig } from "./install-config.js";

const isWin = process.platform === "win32";

/** Run `fn` with a fresh temp install dir (real path), removed afterwards. @param {(dir: string, file: string) => void | Promise<void>} fn */
async function withInstall(fn) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "xm-installcfg-")));
  try {
    await fn(dir, path.join(dir, ".xenomoon.json"));
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} dir */
const tmpLeftovers = (dir) => readdirSync(dir).filter((n) => n.endsWith(".tmp"));

test("update keeps untouched keys and writes 2-space JSON with a trailing newline", async () => {
  await withInstall((dir, file) => {
    const start = {
      projects: { alpha: { path: "/a" } },
      domain: "webapp",
      port: 3111,
      hermes: { on: true },
    };
    writeFileSync(file, JSON.stringify(start));
    const res = updateInstallConfig(dir, (c) => ({ next: { ...c, codex: { model: "x" } } }));
    assert.ok("ok" in res);
    const onDisk = readFileSync(file, "utf8");
    assert.deepEqual(JSON.parse(onDisk), { ...start, codex: { model: "x" } });
    assert.equal(onDisk, `${JSON.stringify({ ...start, codex: { model: "x" } }, null, 2)}\n`);
  });
});

test("a missing file reads as existed:false with {}, and an update creates it", async () => {
  await withInstall((dir, file) => {
    const read = readInstallConfigStrict(dir);
    assert.deepEqual(read, { ok: true, config: {}, existed: false });
    const res = updateInstallConfig(dir, () => ({ next: { port: 1 } }));
    assert.ok("ok" in res);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { port: 1 });
    assert.deepEqual(readInstallConfigStrict(dir), {
      ok: true,
      config: { port: 1 },
      existed: true,
    });
  });
});

/** @type {[string, string][]} */
const BAD_FILES = [
  ["empty", ""],
  ["invalid JSON", '{"projects": '],
  ["an array", '["a"]'],
  ["null", "null"],
  ["a number", "42"],
  ["a string", '"text"'],
];

for (const [label, content] of BAD_FILES) {
  test(`a file that is ${label} is an error, the callback is not called, the file is untouched`, async () => {
    await withInstall((dir, file) => {
      writeFileSync(file, content);
      const read = readInstallConfigStrict(dir);
      assert.ok("error" in read, "strict read must error");
      let called = false;
      const res = updateInstallConfig(dir, () => {
        called = true;
        return { next: {} };
      });
      assert.ok("error" in res, "update must error");
      assert.equal(called, false);
      assert.equal(readFileSync(file, "utf8"), content);
      assert.deepEqual(tmpLeftovers(dir), []);
    });
  });
}

test("a refusing or throwing callback writes nothing and returns an error", async () => {
  await withInstall((dir, file) => {
    const before = '{"keep":true}';
    writeFileSync(file, before);
    const refused = updateInstallConfig(dir, () => ({ refuse: "not now" }));
    assert.deepEqual(refused, { error: "not now" });
    const thrown = updateInstallConfig(dir, () => {
      throw new Error("boom");
    });
    assert.ok("error" in thrown);
    assert.equal(thrown.error, `${file}: update callback threw; nothing was written`);
    assert.ok(!thrown.error.includes("boom"), "a thrown message must not reach the error");
    assert.equal(readFileSync(file, "utf8"), before);
    assert.deepEqual(tmpLeftovers(dir), []);
  });
});

test("a successful update leaves no temp file and keeps the file's permission bits", async () => {
  await withInstall((dir, file) => {
    writeFileSync(file, "{}");
    chmodSync(file, 0o640);
    const res = updateInstallConfig(dir, () => ({ next: { a: 1 } }));
    assert.ok("ok" in res);
    assert.deepEqual(tmpLeftovers(dir), []);
    assert.deepEqual(readdirSync(dir), [".xenomoon.json"]);
    if (!isWin) assert.equal(statSync(file).mode & 0o777, 0o640);
  });
});

test("a failed write leaves no temp file and the old content intact", async (t) => {
  if (isWin || process.getuid?.() === 0) {
    t.skip("needs a directory the user cannot write to");
    return;
  }
  await withInstall((dir, file) => {
    const before = '{"old":1}';
    writeFileSync(file, before);
    chmodSync(dir, 0o500);
    let res;
    try {
      res = updateInstallConfig(dir, () => ({ next: { new: 2 } }));
    } finally {
      chmodSync(dir, 0o700);
    }
    assert.ok("error" in res, "update must report the failed write");
    assert.equal(readFileSync(file, "utf8"), before);
    assert.deepEqual(tmpLeftovers(dir), []);
  });
});

// Child: read + parse the file in a loop; prints "ready" after the first read, then counts
// reads, bad reads and the distinct `n` values it parsed until stdin sends anything, and
// prints {reads, bad, distinct}. A new `n` seen means a read landed between two writes.
const READER = `
const fs = require("node:fs");
const file = process.argv[1];
let reads = 0, bad = 0, stop = false;
const seen = new Set();
process.stdin.on("data", () => { stop = true; });
function once() {
  try { seen.add(JSON.parse(fs.readFileSync(file, "utf8")).n); } catch { bad++; }
  reads++;
}
once();
console.log("ready");
reads = 0; bad = 0; seen.clear();
(function loop() {
  if (stop) { console.log(JSON.stringify({ reads, bad, distinct: seen.size })); process.exit(0); }
  for (let i = 0; i < 20; i++) once();
  setImmediate(loop);
})();
`;

test("a reader looping during many updates never sees an empty or invalid file", async () => {
  await withInstall(async (dir, file) => {
    const pad = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`key${i}`, "x".repeat(40)]),
    );
    writeFileSync(file, JSON.stringify({ n: 0, ...pad }));
    const child = spawn(process.execPath, ["-e", READER, file], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let out = "";
    /** @type {() => void} */
    let onReady = () => undefined;
    const ready = new Promise((resolve) => {
      onReady = () => {
        resolve(undefined);
      };
    });
    const done = new Promise((resolve) => {
      child.on("close", () => {
        resolve(undefined);
      });
    });
    child.stdout.on("data", (d) => {
      out += String(d);
      if (out.includes("ready")) onReady();
    });
    await ready;
    for (let i = 1; i <= 150; i++) {
      const res = updateInstallConfig(dir, (c) => ({ next: { ...c, n: i } }));
      assert.ok("ok" in res);
    }
    child.stdin.write("stop\n");
    await done;
    const line = out.trim().split("\n").pop() ?? "";
    const { reads, bad, distinct } =
      /** @type {{ reads: number, bad: number, distinct: number }} */ (parseJSON(line));
    assert.ok(
      distinct >= 5,
      `reads must land between writes: only ${distinct} distinct contents seen`,
    );
    assert.equal(bad, 0, `${bad} of ${reads} reads saw an empty or invalid file`);
    assert.equal(existsSync(file), true);
  });
});

// Short enough to sit whole inside the ~10-character snippet V8 quotes in a parse error.
const FILE_MARKER = "sk-leak";
const LEAK = "sk-thrown";

test("errors never quote the file's content", async () => {
  await withInstall((dir, file) => {
    const content = `{"hermes":{"apiKey":${FILE_MARKER}}}`;
    writeFileSync(file, content);
    const read = readInstallConfigStrict(dir);
    const upd = updateInstallConfig(dir, () => ({ next: {} }));
    for (const res of [read, upd]) {
      assert.ok("error" in res);
      assert.ok(res.error.includes(file), "the error names the file");
      assert.ok(!res.error.includes(FILE_MARKER), res.error);
    }
    assert.equal(readFileSync(file, "utf8"), content);
  });
});

class CustomFailure extends Error {
  /** @param {string} secret */
  constructor(secret) {
    super("failed");
    /** @type {string} */
    this.detail = secret;
  }
}

/** @type {[string, () => unknown][]} */
const THROWN_VALUES = [
  ["an Error with the secret in message", () => new Error(LEAK)],
  ["an Error with the secret in code", () => Object.assign(new Error("failed"), { code: LEAK })],
  ["an Error with the secret in name", () => Object.assign(new Error("failed"), { name: LEAK })],
  ["a custom class with the secret in a property", () => new CustomFailure(LEAK)],
  ["a thrown string", () => LEAK],
  ["a thrown plain object", () => ({ secret: LEAK })],
];

for (const [label, make] of THROWN_VALUES) {
  test(`a callback throwing ${label} returns an error without the secret and writes nothing`, async () => {
    await withInstall((dir, file) => {
      const content = '{"keep":true}';
      writeFileSync(file, content);
      const res = updateInstallConfig(dir, () => {
        throw make();
      });
      assert.ok("error" in res, JSON.stringify(res));
      assert.ok(res.error.includes(file), "the error names the file");
      assert.ok(!res.error.includes(LEAK), res.error);
      assert.equal(readFileSync(file, "utf8"), content);
      assert.deepEqual(tmpLeftovers(dir), []);
    });
  });
}

test("a dangling symlink is an error and stays untouched; no entry at all is existed:false", async (t) => {
  if (isWin) {
    t.skip("symlinks need privileges on Windows");
    return;
  }
  await withInstall((dir, file) => {
    assert.deepEqual(readInstallConfigStrict(dir), { ok: true, config: {}, existed: false });
    const missing = path.join(dir, "missing.json");
    symlinkSync(missing, file);
    const read = readInstallConfigStrict(dir);
    assert.ok(
      "error" in read && read.error.includes("is a symlink to a missing file"),
      JSON.stringify(read),
    );
    let called = false;
    const res = updateInstallConfig(dir, () => {
      called = true;
      return { next: { a: 1 } };
    });
    assert.ok("error" in res && res.error.includes("is a symlink to a missing file"));
    assert.equal(called, false);
    assert.equal(lstatSync(file).isSymbolicLink(), true);
    assert.equal(existsSync(missing), false);
    assert.deepEqual(tmpLeftovers(dir), []);
  });
});

test("an update through a symlink writes the real target and the link stays a link", async (t) => {
  if (isWin) {
    t.skip("symlinks need privileges on Windows");
    return;
  }
  await withInstall((dir, file) => {
    const realDir = path.join(dir, "real");
    mkdirSync(realDir);
    const target = path.join(realDir, "cfg.json");
    writeFileSync(target, '{"old":1}');
    symlinkSync(target, file);
    const res = updateInstallConfig(dir, () => ({ next: { fresh: 2 } }));
    assert.ok("ok" in res);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { fresh: 2 });
    assert.equal(lstatSync(file).isSymbolicLink(), true);
    assert.deepEqual(tmpLeftovers(dir), []);
    assert.deepEqual(tmpLeftovers(realDir), []);
  });
});

test("a config path that cannot be read (a directory) is an error, never {}", async () => {
  await withInstall((dir, file) => {
    mkdirSync(file);
    const read = readInstallConfigStrict(dir);
    assert.ok("error" in read && read.error.includes("cannot be read"), JSON.stringify(read));
    let called = false;
    const res = updateInstallConfig(dir, () => {
      called = true;
      return { next: {} };
    });
    assert.ok("error" in res);
    assert.equal(called, false);
    assert.equal(statSync(file).isDirectory(), true);
  });
});

/** @type {[string, () => unknown][]} */
const BAD_RETURNS = [
  ["undefined", () => undefined],
  ["the bare config", () => ({ keep: true })],
  ["a next that is not an object", () => ({ next: [1] })],
];

for (const [label, ret] of BAD_RETURNS) {
  test(`a callback returning ${label} is an error and writes nothing`, async () => {
    await withInstall((dir, file) => {
      const before = '{"keep":true}';
      writeFileSync(file, before);
      const res = updateInstallConfig(dir, /** @type {never} */ (ret));
      assert.ok(
        "error" in res && res.error.includes("neither { next } nor { refuse }"),
        JSON.stringify(res),
      );
      assert.equal(readFileSync(file, "utf8"), before);
      assert.deepEqual(tmpLeftovers(dir), []);
    });
  });
}

test("a rename that fails after the temp was written removes the temp", async () => {
  await withInstall((dir, file) => {
    writeFileSync(file, '{"old":1}');
    const res = updateInstallConfig(dir, () => {
      // Runs after the read, before the write: a non-empty directory now sits at the target,
      // so the rename of the temp file over it fails.
      rmSync(file);
      mkdirSync(file);
      writeFileSync(path.join(file, "inner"), "x");
      return { next: { new: 2 } };
    });
    assert.ok("error" in res && res.error.includes("write failed"), JSON.stringify(res));
    assert.deepEqual(tmpLeftovers(dir), []);
    assert.equal(statSync(file).isDirectory(), true);
  });
});

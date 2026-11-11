// project-side.js (#62): the gitignore block and the project log dir the boot ensures.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureIgnores, ensureLogDir, requiredIgnores, tryEnsureIgnores } from "./project-side.js";

/** Run `fn` with a fresh temp dir, removed afterwards. @param {(dir: string) => void} fn */
function withTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "xm-projside-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} dir */
const lines = (dir) => readFileSync(path.join(dir, ".gitignore"), "utf8").split(/\r?\n/);

test("ensureIgnores writes the block with .xenomoon/ and .claude/projects/ when no .gitignore", () => {
  withTmp((dir) => {
    ensureIgnores(dir, false);
    const l = lines(dir);
    assert.ok(l.includes(".xenomoon/"));
    assert.ok(l.includes(".claude/projects/"));
    assert.ok(!l.includes("/tools/"));
  });
});

test("ensureIgnores is idempotent: a second run changes nothing", () => {
  withTmp((dir) => {
    ensureIgnores(dir, true);
    const before = readFileSync(path.join(dir, ".gitignore"), "utf8");
    ensureIgnores(dir, true);
    assert.equal(readFileSync(path.join(dir, ".gitignore"), "utf8"), before);
  });
});

test("ensureIgnores with materializes adds the four working-dir entries", () => {
  withTmp((dir) => {
    ensureIgnores(dir, true);
    const l = lines(dir);
    for (const p of ["/tools/", "/library", "/x-shared-assets", "/transcripts/"]) {
      assert.ok(l.includes(p), p);
    }
  });
});

test("ensureIgnores appends to an existing .gitignore, keeping its first line", () => {
  withTmp((dir) => {
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    ensureIgnores(dir, false);
    const l = lines(dir);
    assert.equal(l[0], "node_modules/");
    assert.ok(l.includes(".xenomoon/"));
  });
});

test("requiredIgnores lists the two always rules, plus the four working-dir rules in written order", () => {
  const base = [".xenomoon/", ".claude/projects/"];
  assert.deepEqual(requiredIgnores(false), base);
  assert.deepEqual(requiredIgnores(true), [
    ...base,
    "/tools/",
    "/library",
    "/x-shared-assets",
    "/transcripts/",
  ]);
  withTmp((dir) => {
    ensureIgnores(dir, true);
    assert.deepEqual(lines(dir).slice(1, -1), requiredIgnores(true));
  });
});

test("ensureLogDir creates <dir>/.xenomoon/logs in an existing project and reports created", () => {
  withTmp((dir) => {
    const res = ensureLogDir(dir);
    const want = path.join(dir, ".xenomoon", "logs");
    assert.deepEqual(res, { created: true, dir: want });
    assert.ok(statSync(want).isDirectory());
  });
});

test("ensureLogDir refuses a missing project dir: nothing created, reason returned", () => {
  withTmp((dir) => {
    const missing = path.join(dir, "no-such-project");
    const res = ensureLogDir(missing);
    assert.deepEqual(res, {
      created: false,
      dir: path.join(missing, ".xenomoon", "logs"),
      reason: "no project dir",
    });
    assert.equal(existsSync(missing), false);
  });
});

test("tryEnsureIgnores on a read-only .gitignore refuses with the file named, never throws", () => {
  withTmp((dir) => {
    const file = path.join(dir, ".gitignore");
    writeFileSync(file, "node_modules/\n");
    chmodSync(file, 0o444);
    try {
      const res = tryEnsureIgnores(dir, true);
      assert.equal(res.ok, false);
      assert.ok(!res.ok && res.reason.includes(file) && res.reason.includes("EACCES"));
      assert.deepEqual(!res.ok && res.rules, [
        ".xenomoon/",
        ".claude/projects/",
        "/tools/",
        "/library",
        "/x-shared-assets",
        "/transcripts/",
      ]);
      assert.equal(readFileSync(file, "utf8"), "node_modules/\n");
    } finally {
      chmodSync(file, 0o644);
    }
  });
});

test("tryEnsureIgnores on a normal dir reports ok with the two rules added", () => {
  withTmp((dir) => {
    assert.deepEqual(tryEnsureIgnores(dir, false), { ok: true, added: 2 });
  });
});

test("ensureLogDir refuses a project path that is a file: nothing created under it", () => {
  withTmp((dir) => {
    const file = path.join(dir, "not-a-dir");
    writeFileSync(file, "");
    const res = ensureLogDir(file);
    assert.deepEqual(res, {
      created: false,
      dir: path.join(file, ".xenomoon", "logs"),
      reason: "not a directory",
    });
    assert.equal(existsSync(path.join(file, ".xenomoon")), false);
  });
});

test("ensureLogDir follows a symlinked project dir and creates the log dir", () => {
  withTmp((dir) => {
    const real = path.join(dir, "real");
    mkdirSync(real);
    const link = path.join(dir, "link");
    symlinkSync(real, link);
    assert.equal(ensureLogDir(link).created, true);
    assert.ok(statSync(path.join(real, ".xenomoon", "logs")).isDirectory());
  });
});

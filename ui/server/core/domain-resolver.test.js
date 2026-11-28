// domain-resolver — the optional `browser` descriptor field ("chrome" is the only accepted value).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDomain } from "./domain-resolver.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "domain-resolver-test-"));
after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A temp framework dir holding one scratch pack "p" whose domain.json is the minimal valid one
 *  plus `extra`. @param {string} id @param {Record<string, unknown>} extra @returns {string} */
function scratchFramework(id, extra) {
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, "domains/p"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "domains/p/domain.json"),
    JSON.stringify({
      engine: { name: "node", projectFile: "package.json" },
      inventory: { scenes: [], scripts: [".js"] },
      plugin: "domains/p/plugin",
      orchestrator: "domains/p/orchestrator.md",
      ...extra,
    }),
  );
  return dir;
}

test('the real web pack declares browser "chrome" through the real loader', () => {
  assert.equal(loadDomain("webapp").browser, "chrome");
});

test("a pack with no browser yields a descriptor with no browser key at all", () => {
  const real = loadDomain("expoapp");
  assert.equal(Object.hasOwn(real, "browser"), false);
  const scratch = loadDomain("p", scratchFramework("absent", {}));
  assert.equal(Object.hasOwn(scratch, "browser"), false);
});

test('a browser other than "chrome" is refused with an error naming the field', () => {
  const dir = scratchFramework("firefox", { browser: "firefox" });
  assert.throws(
    () => loadDomain("p", dir),
    (e) => {
      assert.ok(e instanceof Error);
      assert.equal(e.message, 'domain "p": domain.json missing/invalid fields: browser ("chrome")');
      return true;
    },
  );
});

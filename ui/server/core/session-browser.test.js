// browserExtraArgs: the exact string "chrome" is the one value that adds the SDK `--chrome` flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browserExtraArgs } from "./session-browser.js";

test('"chrome" gives the boolean flag the SDK reads as `null`', () => {
  assert.deepEqual(browserExtraArgs("chrome"), { chrome: null });
});

test("absent and wrong values add no flag", () => {
  for (const value of [undefined, "firefox", "Chrome", true]) {
    assert.deepEqual(browserExtraArgs(value), {});
  }
});

test("session.js passes the descriptor's browser through browserExtraArgs", () => {
  const src = readFileSync(new URL("./session.js", import.meta.url), "utf8");
  assert.equal(src.includes("extraArgs: browserExtraArgs(DOMAIN.browser)"), true);
});

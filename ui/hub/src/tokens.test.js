// tokens.js on strings, plus one run on the real ui/agent-ui.css and ui/hub/src/hub.css.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { readTokens, rootBlock, tokenBlock } from "./tokens.js";

const PAGE = ".a { color: var(--accent); border: 1px solid var(--green, red); }";

void test("rootBlock: a :root example inside a comment before the real block is not taken", () => {
  const css = "/* Example: :root { --example: 1; } */\n:root {\n  --accent: #c2a17a;\n}\n";
  assert.equal(rootBlock(css), ":root {\n  --accent: #c2a17a;\n}");
});

void test("tokenBlock: a block that lacks a token the page reads fails the build, naming it", () => {
  assert.throws(
    () => tokenBlock(":root { --accent: #c2a17a; /* --green: x; */ }", PAGE),
    /does not declare --green, which ui\/hub\/src\/hub.css reads/,
  );
});

void test("readTokens: what the page reads, minus what it declares itself, comments ignored", () => {
  const page = `${PAGE} .b { --own: 1; width: var(--own); } /* var(--commented) */`;
  assert.deepEqual(readTokens(page), ["--accent", "--green"]);
});

void test("tokenBlock: the real agent-ui.css declares every token the real hub.css reads", () => {
  const ui = fs.readFileSync(new URL("../../agent-ui.css", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("./hub.css", import.meta.url), "utf8");
  const block = tokenBlock(ui, page);
  assert.ok(
    block.startsWith(":root {") && block.includes("--accent:") && block.includes("--green:"),
  );
  assert.ok(readTokens(page).length >= 20, "hub.css reads the token set");
});

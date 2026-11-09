// Frontmatter subset (#73 row 1): single-level inline mappings, CRLF input, and the
// write-back of a mapping. Fake values only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, formatValue, setFrontmatterFields } from "./frontmatter.js";
import { toRecord } from "./records.js";

const GEN = "generated: { by: human:arthur, at: 2026-11-02T10:00:00Z }";

test("inline mapping parses to a plain object", () => {
  const { data } = parseFrontmatter(`---\nname: x\n${GEN}\n---\nbody\n`);
  assert.deepEqual(data?.generated, { by: "human:arthur", at: "2026-11-02T10:00:00Z" });
});

test("inline mapping without spaces inside the braces", () => {
  const { data } = parseFrontmatter("---\ng: {a:1,b:2}\n---\n");
  assert.deepEqual(data?.g, { a: "1", b: "2" });
});

test("mapping values split on the first colon only", () => {
  const { data } = parseFrontmatter("---\ng: {by: human:arthur:x}\n---\n");
  assert.deepEqual(data?.g, { by: "human:arthur:x" });
});

test("mapping values lose one pair of matching quotes", () => {
  const { data } = parseFrontmatter(`---\ng: {a: "q:1", b: 'z', c: "m'}\n---\n`);
  assert.deepEqual(data?.g, { a: "q:1", b: "z", c: `"m'` });
});

test("empty mapping parses to {}", () => {
  const { data } = parseFrontmatter("---\ng: {}\n---\n");
  assert.deepEqual(data?.g, {});
});

test("a nested { keeps the value a string", () => {
  const { data } = parseFrontmatter("---\ng: {a: {b: c}}\n---\n");
  assert.equal(data?.g, "{a: {b: c}}");
});

test("CRLF frontmatter parses the same as LF", () => {
  const lf = `---\nname: x\ntags: [a, b]\n${GEN}\n---\nbody\n`;
  const crlf = lf.replace(/\n/g, "\r\n");
  const a = parseFrontmatter(lf);
  const b = parseFrontmatter(crlf);
  assert.notEqual(b.data, null);
  assert.deepEqual(b.data, a.data);
});

test("formatValue writes a mapping as { k: v, k2: v2 }", () => {
  assert.equal(formatValue({ by: "human:arthur", at: "t" }), "{ by: human:arthur, at: t }");
  assert.equal(formatValue({}), "{}");
});

test("setFrontmatterFields round-trips a mapping untouched", () => {
  const text = `---\nname: x\n${GEN}\n---\nbody\n`;
  const before = parseFrontmatter(text).data;
  const out = setFrontmatterFields(text, { status: "accepted" });
  const after = parseFrontmatter(out).data;
  assert.deepEqual(after?.generated, before?.generated);
  assert.equal(after?.status, "accepted");
  assert.ok(out.split("\n").includes(GEN));
  const rewritten = setFrontmatterFields(text, { generated: before?.generated ?? {} });
  assert.ok(rewritten.split("\n").includes(GEN));
});

test("toRecord treats a mapping as neither scalar nor list", () => {
  const r = toRecord("s", "decision", { title: { a: "b" }, tags: { a: "b" } });
  assert.equal(r.title, "s");
  assert.deepEqual(r.tags, []);
});

test("a prettier-wrapped flow list parses to the full list and round-trips single-line", () => {
  const text = [
    "---",
    "amends:",
    "  [",
    "    inbound-routing-by-address-in-pipeline,",
    "    agent-per-email-address,",
    "    one-message-one-run-agent-owns-thread,",
    "  ]",
    "tags: [email, security]",
    "---",
    "body",
  ].join("\n");
  const { data, body } = parseFrontmatter(text);
  const amends = [
    "inbound-routing-by-address-in-pipeline",
    "agent-per-email-address",
    "one-message-one-run-agent-owns-thread",
  ];
  assert.deepEqual(data?.amends, amends);
  assert.deepEqual(data?.tags, ["email", "security"]);
  assert.equal(body, "body");
  assert.deepEqual(parseFrontmatter(`---\namends: [a,\n  b,\n  c,]\n---\n`).data?.amends, [
    "a",
    "b",
    "c",
  ]);
  const out = setFrontmatterFields("---\nx: 1\n---\n", { amends });
  assert.match(
    out,
    /^amends: \[inbound-routing-by-address-in-pipeline, agent-per-email-address, one-message-one-run-agent-owns-thread\]$/m,
  );
  assert.deepEqual(parseFrontmatter(out).data?.amends, amends);
});

test("a wrapped list closes on the first `]` outside quotes", () => {
  const { data } = parseFrontmatter('---\ntags: ["x]y",\n z\n]\nnext: v\n---\n');
  assert.deepEqual(data?.tags, ["x]y", "z"]);
  assert.equal(data?.next, "v");
});

test("an unclosed quote in a list: the value stays a string and the next key survives", () => {
  const { data } = parseFrontmatter('---\ntags: ["x]y,\n z\n]\nnext: v\n---\n');
  assert.equal(typeof data?.tags, "string");
  assert.equal(data?.next, "v");
});

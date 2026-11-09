// migrateRecord (#73 row 4b): legacy record text → the OKF v0.2 frontmatter + short body shape.
// Every fixture's output must pass the strict field check and the body check, and migrating the
// output again must return it unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../../../lib/frontmatter.js";
import { bodyProblems, fieldProblems } from "../../../lib/records.js";
import { migrateRecord } from "./library-migrate.js";

const MTIME = new Date("2026-10-15T23:30:00Z");

/** Migrate, assert the output is standard and a fixed point, return it. @param {string} text */
function migrate(text, folder = "decisions", slug = "use-hub") {
  const out = migrateRecord({ text, folder, slug, mtime: MTIME });
  const { data, body } = parseFrontmatter(out.text);
  assert.ok(data, "output has frontmatter");
  assert.deepEqual(fieldProblems(data, { strict: true, folder }), []);
  assert.deepEqual(bodyProblems(body), []);
  const again = migrateRecord({ text: out.text, folder, slug, mtime: MTIME });
  assert.equal(again.changed, false);
  assert.equal(again.text, out.text);
  return { ...out, data, body };
}

/** The non-blank lines of one `##` section of a body. @param {string} body @param {string} heading */
function section(body, heading) {
  const lines = body.split("\n");
  const at = lines.indexOf(heading);
  assert.notEqual(at, -1, `${heading} missing`);
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines.slice(at + 1, end === -1 ? undefined : end).filter((l) => l.trim());
}

/** A strict-clean frontmatter block plus `body`. @param {string} body */
const modern = (body) =>
  `---\ntype: decisions\ntitle: T\ndescription: D.\ngenerated: { by: human:x, at: 2026-01-01T00:00:00Z }\n---\n\n${body}`;

const LEGACY = [
  "---",
  "name: use-hub",
  "kind: decisions",
  "status: accepted",
  "date: 2026-09-30",
  "source: hub M19",
  "---",
  "",
  "# Use the hub",
  "",
  "## Context",
  "",
  "The old way was slow.",
  "",
  "## Decision",
  "",
  "- Use the hub for all calls.",
  "- Keep the cache.",
  "- Log every call.",
  "",
  "## Why",
  "",
  "It is faster.",
  "It is audited.",
  "",
].join("\n");

test("(a) legacy record: fields mapped, source kept, decision = first bullet, rest opens Context", () => {
  const out = migrate(LEGACY);
  assert.equal(out.changed, true);
  assert.equal(
    out.text,
    [
      "---",
      "type: decisions",
      "title: Use the hub",
      "description: Use the hub for all calls.",
      "status: stable",
      "source: hub M19",
      "generated: { by: human:migrate, at: 2026-09-30T00:00:00Z }",
      "---",
      "",
      "Use the hub for all calls.",
      "",
      "## Why",
      "",
      "It is faster.",
      "It is audited.",
      "",
      "## Context",
      "",
      "- Keep the cache.",
      "- Log every call.",
      "",
      "The old way was slow.",
      "",
    ].join("\n"),
  );
});

test("status map: proposed → draft, superseded → deprecated, absent stays absent", () => {
  const draft = migrate(LEGACY.replace("status: accepted", "status: proposed"));
  assert.equal(draft.data.status, "draft");
  const dep = migrate(LEGACY.replace("status: accepted", "status: superseded"));
  assert.equal(dep.data.status, "deprecated");
  const none = migrate(LEGACY.replace("status: accepted\n", ""));
  assert.equal(none.data.status, undefined);
});

test("(b) a 5-line ## Why keeps 3; the 2 overflow lines go to the end of Context", () => {
  const why = "## Why\n\nw1\nw2\nw3\nw4\nw5\n";
  const out = migrate(modern(`## Context\n\nc1\n\n${why}`));
  assert.deepEqual(section(out.body, "## Why"), ["w1", "w2", "w3"]);
  assert.deepEqual(section(out.body, "## Context"), ["c1", "w4", "w5"]);
});

test("(c) a body over 20 non-blank lines drops trailing Context lines until it fits", () => {
  const ctx = Array.from({ length: 19 }, (_, i) => `c${i + 1}`).join("\n");
  const input = modern(`## Why\n\nw1\n\n## Context\n\n${ctx}\n`);
  assert.equal(
    input
      .split("\n---\n")[1]
      ?.split("\n")
      .filter((l) => l.trim()).length,
    22,
  );
  const out = migrate(input);
  assert.equal(out.body.split("\n").filter((l) => l.trim()).length, 20);
  assert.deepEqual(section(out.body, "## Context"), ctx.split("\n").slice(0, 16));
});

test("(d) body-only file: frontmatter created from H1, first paragraph and mtime; rest in Context", () => {
  const text =
    "# Framework sources\n\nRegistry of sources. What we took.\n\n## General\n\n- **a** — one.\n\nLast paragraph.\n";
  const out = migrate(text, "sources", "framework-sources");
  assert.equal(
    out.text,
    [
      "---",
      "type: sources",
      "title: Framework sources",
      "description: Registry of sources.",
      "generated: { by: human:migrate, at: 2026-10-15T00:00:00Z }",
      "---",
      "",
      "Registry of sources. What we took.",
      "",
      "## Why",
      "",
      "Registry of sources.",
      "",
      "## Context",
      "",
      "**General**",
      "",
      "- **a** — one.",
      "",
      "Last paragraph.",
      "",
    ].join("\n"),
  );
});

test("(e) CRLF input → LF output, no \\r anywhere", () => {
  const out = migrate(LEGACY.replace(/\n/g, "\r\n"));
  assert.equal(out.text.includes("\r"), false);
  assert.equal(out.text, migrate(LEGACY).text);
});

test("(f) an already-migrated record comes back unchanged, byte for byte", () => {
  const text = modern("Decide.\n\n## Why\n\nBecause.\n\n## Context\n\n\n  odd   spacing kept  \n");
  const out = migrateRecord({ text, folder: "decisions", slug: "x", mtime: MTIME });
  assert.equal(out.changed, false);
  assert.equal(out.text, text);
});

test("(g) ## Changes is dropped with its lines", () => {
  const out = migrate(modern("Decide.\n\n## Why\n\nBecause.\n\n## Changes\n\n- ch1\n- ch2\n"));
  assert.doesNotMatch(out.text, /Changes|ch1|ch2/);
});

test("(h) an unknown ## Notes section becomes a bold line in Context", () => {
  const out = migrate(modern("## Why\n\nBecause.\n\n## Notes\n\nn1\n"));
  assert.deepEqual(section(out.body, "## Context"), ["**Notes**", "n1"]);
  assert.doesNotMatch(out.body, /^## Notes/m);
});

test("(i) a fenced `## Why` line inside ## Context stays content, not a heading", () => {
  const fenced = "## Context\n\n```md\n## Why\nfake\n```\n";
  const out = migrate(modern(`## Why\n\nBecause.\n\n${fenced}\n## Notes\n\nn1\n`));
  assert.deepEqual(section(out.body, "## Why"), ["Because."]);
  assert.match(out.body, /## Context\n\n```md\n## Why\nfake\n```\n\n\*\*Notes\*\*\n\nn1\n$/);
});

test("(j) a prettier-wrapped amends list keeps all 3 links, written single-line", () => {
  const text = [
    "---",
    "name: auto-response-loop-brake",
    "kind: verdicts",
    "description: Brake.",
    "status: accepted",
    "amends:",
    "  [",
    "    inbound-routing-by-address-in-pipeline,",
    "    agent-per-email-address,",
    "    one-message-one-run-agent-owns-thread,",
    "  ]",
    "tags: [email, security]",
    "---",
    "",
    "Brake the loop.",
    "",
  ].join("\n");
  const { data, text: out } = migrate(text, "verdicts");
  assert.deepEqual(data.amends, [
    "inbound-routing-by-address-in-pipeline",
    "agent-per-email-address",
    "one-message-one-run-agent-owns-thread",
  ]);
  assert.match(
    out,
    /^amends: \[inbound-routing-by-address-in-pipeline, agent-per-email-address, one-message-one-run-agent-owns-thread\]$/m,
  );
});

test("(k) an empty amends: or supersedes: [] is dropped, not written", () => {
  const text = "---\nkind: verdicts\ndescription: D.\namends:\nsupersedes: []\n---\n\nX.\n";
  const { data, text: out } = migrate(text, "verdicts");
  assert.equal("amends" in data, false);
  assert.equal("supersedes" in data, false);
  assert.doesNotMatch(out, /amends|supersedes/);
});

test("(l) decision line = the joined first paragraph; description = its first sentence", () => {
  const text = [
    "# Wrapped",
    "",
    "The hub serves every call, which keeps",
    "one audit trail. Callers never reach",
    "the vendor directly.",
    "",
    "Second paragraph.",
    "",
  ].join("\n");
  const { data, body } = migrate(text);
  assert.equal(
    body.trimStart().split("\n")[0],
    "The hub serves every call, which keeps one audit trail. Callers never reach the vendor directly.",
  );
  assert.equal(data.description, "The hub serves every call, which keeps one audit trail.");
});

test("(m) type is forced to the folder name; the old value is kept nowhere", () => {
  const text = "---\ntype: source-list\ntitle: S\ndescription: D.\n---\n\nX.\n";
  const { data, text: out } = migrate(text, "sources");
  assert.equal(data.type, "sources");
  assert.doesNotMatch(out, /source-list/);
});

test("(n) with a description, (1) (2) (3) Decision items open Context as separate lines", () => {
  const text = [
    "---",
    "description: Brake the loop.",
    "---",
    "",
    "# Brake",
    "",
    "## Decision",
    "",
    "(1) Stop after three replies.",
    "(2) Log the stop.",
    "(3) Alert the owner.",
    "",
  ].join("\n");
  const { body } = migrate(text);
  assert.equal(body.trimStart().split("\n")[0], "Brake the loop.");
  assert.deepEqual(section(body, "## Context"), [
    "(1) Stop after three replies.",
    "(2) Log the stop.",
    "(3) Alert the owner.",
  ]);
});

test("(n2) without a description, the (1) line is the decision line and Context opens with (2)", () => {
  const text = "# Brake\n\n## Decision\n\n(1) Stop after three replies.\n(2) Log the stop.\n";
  const { body } = migrate(text);
  assert.equal(body.trimStart().split("\n")[0], "(1) Stop after three replies.");
  assert.equal(section(body, "## Context")[0], "(2) Log the stop.");
});

test("(a2) with a description: decision line = description; the whole ## Decision, then the preamble, opens Context", () => {
  const out = migrate(
    LEGACY.replace("source: hub M19", "description: Route calls through the hub."),
  );
  assert.equal(out.body.trimStart().split("\n")[0], "Route calls through the hub.");
  assert.deepEqual(section(out.body, "## Context"), [
    "- Use the hub for all calls.",
    "- Keep the cache.",
    "- Log every call.",
    "The old way was slow.",
  ]);
});

test("(o) a list key that fails to parse keeps every raw line, and strict reports it", () => {
  const text = '---\ntype: decisions\ntitle: T\ndescription: D.\ntags: ["x]y,\n z\n]\n---\n\nX.\n';
  const out = migrateRecord({ text, folder: "decisions", slug: "t", mtime: MTIME });
  assert.match(out.text, /\ntags: \["x\]y,\n z\n\]\n/);
  const { data } = parseFrontmatter(out.text);
  assert.ok(fieldProblems(data ?? {}, { strict: true }).some((p) => p.startsWith("`tags`")));
});

test("(p) a longer fence is closed only by a fence at least as long: it migrates intact", () => {
  const body = "D\n## Context\n~~~~\n~~~\n## Why\nw\n~~~~\n";
  const out = migrate(modern(body));
  assert.equal(out.changed, true);
  assert.match(out.body, /\n~~~~\n~~~\n## Why\nw\n~~~~\n/);
  // The fenced `## Why` is content: the real one is the description fallback, before Context.
  assert.deepEqual(section(out.body, "## Why"), ["D."]);
});

test("(q) a description that reads as structure is written bold as decision and Why", () => {
  const out = migrate(
    '---\nname: x\nkind: verdicts\ndescription: "# Decision"\n---\n',
    "verdicts",
    "x",
  );
  assert.equal(out.body.trimStart().split("\n")[0], "**# Decision**");
  assert.deepEqual(section(out.body, "## Why"), ["**# Decision**"]);
});

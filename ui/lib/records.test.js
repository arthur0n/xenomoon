// Record fields (#23): the parser reads the new keys, toRecord normalizes them, fieldProblems
// flags bad shapes. Fake slugs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, setFrontmatterFields } from "./frontmatter.js";
import {
  toRecord,
  fieldProblems,
  bodyProblems,
  buildIndex,
  linkProblems,
  isClientShareable,
  indexLine,
  OKF_STATUS,
  RECORD_STATUSES,
  LEGACY_STATUSES,
} from "./records.js";

const doc = `---
name: pick-queue
kind: verdicts
description: adopt queue-a: only one with retries
status: amended
supersedes: [old-queue]
amends: [findings/queue-trap, other]
tags: [infra, queue]
date: 2026-10-21
---
# Pick a queue
`;

test("parser reads the new fields, lists as arrays", () => {
  const { data } = parseFrontmatter(doc);
  assert.ok(data);
  assert.equal(data.status, "amended");
  assert.equal(toRecord("pick-queue", "verdicts", data).status, "stable");
  assert.deepEqual(data.supersedes, ["old-queue"]);
  assert.deepEqual(data.amends, ["findings/queue-trap", "other"]);
  assert.deepEqual(data.tags, ["infra", "queue"]);
  assert.equal(data.date, "2026-10-21");
  assert.deepEqual(fieldProblems(data), [], "legacy form passes non-strict");
});

test("empty inline list parses to []", () => {
  const { data } = parseFrontmatter("---\ntags: []\ndescription: x\n---\n");
  assert.deepEqual(data?.tags, []);
});

/** @param {string} slug @param {Record<string, any>} f */
const rec = (slug, f, kind = "verdicts") => toRecord(slug, kind, { description: "d", ...f });

test("toRecord defaults: status stable, OKF type/title, folder kind, empty generated", () => {
  const r = toRecord("some-slug", "findings", { type: "source-list", description: "d" });
  assert.equal(r.kind, "source-list");
  assert.equal(r.title, "some-slug");
  assert.equal(r.status, "stable");
  assert.deepEqual([r.supersedes, r.amends, r.tags, r.date], [[], [], [], ""]);
  assert.deepEqual(r.generated, { by: "", at: "" });
  assert.equal(r.legacy, false);
  assert.equal(toRecord("s", "findings", {}).kind, "findings");
});

test("toRecord: OKF type/title win over legacy kind/name; legacy status maps to OKF", () => {
  const both = toRecord("s", "folder", { type: "verdicts", kind: "old", title: "T", name: "N" });
  assert.deepEqual([both.kind, both.title, both.legacy], ["verdicts", "T", true]);
  const old = toRecord("s", "folder", { kind: "findings", name: "N" });
  assert.deepEqual([old.kind, old.title], ["findings", "N"]);
  /** @type {Record<string, string>} */
  const seen = {};
  for (const s of LEGACY_STATUSES) seen[s] = toRecord("s", "v", { status: s }).status;
  assert.deepEqual(seen, {
    proposed: "draft",
    accepted: "stable",
    amended: "stable",
    superseded: "deprecated",
  });
  assert.equal(toRecord("s", "v", { status: "accepted" }).legacy, true);
  assert.equal(toRecord("s", "v", { status: "draft" }).legacy, false);
  assert.equal(toRecord("s", "v", { date: "2026-10-21" }).legacy, true);
});

test("generated: parsed from an inline mapping, validated (offset required, mapping required)", () => {
  const { data } = parseFrontmatter(
    "---\ndescription: d\ngenerated: { by: human:arthur, at: 2026-11-02T10:00:00+02:00 }\n---\n",
  );
  assert.ok(data);
  assert.deepEqual(toRecord("s", "v", data).generated, {
    by: "human:arthur",
    at: "2026-11-02T10:00:00+02:00",
  });
  assert.deepEqual(fieldProblems(data), []);
  assert.deepEqual(
    fieldProblems({ description: "d", generated: { by: "x", at: "2026-11-02T10:00:00Z" } }),
    [],
  );
  const noOffset = fieldProblems({
    description: "d",
    generated: { by: "x", at: "2026-11-02T10:00:00" },
  });
  assert.equal(noOffset.length, 1);
  assert.match(
    noOffset[0] ?? "",
    /generated\.at `2026-11-02T10:00:00` is not ISO 8601 with an offset/,
  );
  const scalar = fieldProblems({ description: "d", generated: "2026-11-02T10:00:00Z" });
  assert.equal(scalar.length, 1);
  assert.match(scalar[0] ?? "", /`generated` must be an inline mapping/);
  assert.deepEqual(toRecord("s", "v", { generated: "x" }).generated, { by: "", at: "" });
});

test("fieldProblems flags bad status, date, scalar lists, missing description", () => {
  const p = fieldProblems({ status: "done", date: "21/10/2026", tags: "infra" });
  assert.equal(p.length, 4);
  assert.ok(p.some((x) => x.includes("status `done` is not one of draft|stable|deprecated")));
  assert.deepEqual(fieldProblems({ description: "d", status: "superseded" }), []);
  assert.deepEqual(fieldProblems({ description: "d", status: "deprecated" }), []);
});

test("fieldProblems strict: names each legacy field and a missing type/title/generated", () => {
  const legacy = {
    name: "n",
    kind: "verdicts",
    date: "2026-10-21",
    status: "accepted",
    description: "d",
  };
  assert.deepEqual(fieldProblems(legacy), [], "non-strict accepts the legacy form");
  assert.deepEqual(fieldProblems(legacy, { strict: true }), [
    "legacy field `name`",
    "legacy field `kind`",
    "legacy field `date`",
    "legacy field status `accepted`",
    "missing `type`",
    "missing `title`",
    "missing `generated`",
  ]);
  const okf = {
    type: "verdicts",
    title: "T",
    description: "d",
    status: "stable",
    generated: { by: "x", at: "2026-11-02T10:00:00Z" },
  };
  assert.deepEqual(fieldProblems(okf, { strict: true }), []);
});

test("RECORD_STATUSES is the OKF triple; every legacy status maps into it", () => {
  assert.deepEqual([...RECORD_STATUSES], ["draft", "stable", "deprecated"]);
  const okf = /** @type {readonly string[]} */ (RECORD_STATUSES);
  for (const s of LEGACY_STATUSES) assert.ok(okf.includes(OKF_STATUS[s]));
});

test("setFrontmatterFields replaces, appends, keeps body; adds a block when none", () => {
  const out = setFrontmatterFields(doc, { status: "deprecated", supersedes: ["a", "b"], x: "1" });
  const { data, body } = parseFrontmatter(out);
  assert.equal(data?.status, "deprecated");
  assert.deepEqual(data?.supersedes, ["a", "b"]);
  assert.equal(data?.x, "1");
  assert.equal(body, "# Pick a queue\n");
  const fresh = parseFrontmatter(setFrontmatterFields("# T\n", { description: "d" }));
  assert.equal(fresh.data?.description, "d");
  assert.equal(fresh.body, "# T\n");
});

test("indexLine tail: draft and deprecated marked, stable (and legacy accepted/amended) bare", () => {
  assert.equal(indexLine(rec("s", { status: "draft" })), "- [s](s.md) — d _(draft)_");
  assert.equal(indexLine(rec("s", { status: "superseded" })), "- [s](s.md) — d _(deprecated)_");
  assert.equal(indexLine(rec("s", { status: "deprecated" })), "- [s](s.md) — d _(deprecated)_");
  assert.equal(indexLine(rec("s", {})), "- [s](s.md) — d");
  assert.equal(indexLine(rec("s", { status: "amended" })), "- [s](s.md) — d");
});

test("buildIndex keeps the header, sorts by filename, marks non-stable status", () => {
  const head = "# verdicts — index\n\nOne line per record.\n";
  const a = toRecord("b-slug", "verdicts", { title: "B", description: "db", status: "deprecated" });
  const b = toRecord("a-slug", "verdicts", { description: "da" });
  const out = buildIndex(`${head}\n- [stale](gone.md) — old\n`, [a, b]);
  assert.equal(out, `${head}\n- [a-slug](a-slug.md) — da\n- [B](b-slug.md) — db _(deprecated)_\n`);
  assert.equal(buildIndex(out, []), head);
  assert.equal(buildIndex(out, [a, b]), out);
});

test("linkProblems: clean chain passes (legacy superseded counts as deprecated)", () => {
  const recs = [
    rec("old", { status: "superseded" }),
    rec("new", { supersedes: ["old"] }),
    rec("older", { status: "deprecated" }),
    rec("newer", { supersedes: ["older"] }),
    rec("note", { amends: ["verdicts/new"] }, "findings"),
  ];
  assert.deepEqual(linkProblems(recs), []);
});

test("linkProblems: an amends target of any status passes", () => {
  for (const status of ["draft", "stable", "amended", "accepted"]) {
    const recs = [rec("base", { status }), rec("note", { amends: ["verdicts/base"] }, "findings")];
    assert.deepEqual(linkProblems(recs), [], status);
  }
});

test("linkProblems: a deprecated record needs exactly one superseder (0 and 2 both fail)", () => {
  const zero = linkProblems([rec("lonely", { status: "deprecated" })]);
  assert.deepEqual(zero, ["verdicts/lonely: status is `deprecated` but no record supersedes it"]);
  const two = linkProblems([
    rec("old", { status: "deprecated" }),
    rec("a", { supersedes: ["old"] }),
    rec("b", { supersedes: ["old"] }),
  ]);
  assert.deepEqual(two, [
    "verdicts/old: status is `deprecated` and 2 records supersede it (expected exactly one)",
  ]);
});

test("linkProblems: missing targets, non-deprecated supersedes target, self link", () => {
  const recs = [
    rec("old", {}),
    rec("new", { supersedes: ["old", "ghost"] }),
    rec("note", { amends: ["nope"] }, "findings"),
    rec("me", { supersedes: ["me"] }),
  ];
  const p = linkProblems(recs);
  assert.ok(
    p.includes(
      "verdicts/new: supersedes `verdicts/old`, whose status is `stable` (expected deprecated)",
    ),
  );
  assert.ok(p.some((x) => x.includes("supersedes `ghost`, which does not exist")));
  assert.ok(p.some((x) => x.includes("amends `nope`, which does not exist")));
  assert.ok(p.some((x) => x.includes("verdicts/me: supersedes itself")));
  assert.equal(p.length, 4);
});

test("audience: absent = internal, `client` parses, bad value flagged (#47)", () => {
  const { data } = parseFrontmatter("---\ndescription: d\naudience: client\n---\n");
  assert.equal(toRecord("s", "verdicts", data ?? {}).audience, "client");
  assert.equal(toRecord("s", "verdicts", { description: "d" }).audience, "internal");
  assert.deepEqual(fieldProblems({ description: "d", audience: "client" }), []);
  assert.ok(fieldProblems({ description: "d", audience: "public" })[0]?.includes("audience"));
});

test("isClientShareable: client AND stable only (#47)", () => {
  assert.equal(isClientShareable(rec("s", { audience: "client" })), true);
  assert.equal(isClientShareable(rec("s", { audience: "client", status: "stable" })), true);
  assert.equal(isClientShareable(rec("s", { audience: "client", status: "amended" })), true);
  assert.equal(isClientShareable(rec("s", { audience: "client", status: "deprecated" })), false);
  assert.equal(isClientShareable(rec("s", { audience: "client", status: "draft" })), false);
  assert.equal(isClientShareable(rec("s", { audience: "client", status: "superseded" })), false);
  assert.equal(isClientShareable(rec("s", {})), false);
});

// bodyProblems (#73): decision line, no H1, `## Why` required, section caps, 20-line total.
const n = (/** @type {string} */ p, /** @type {number} */ k) =>
  Array.from({ length: k }, (_, i) => `${p}${i + 1}`).join("\n");

test("bodyProblems: a full 20-line body with all four sections passes", () => {
  const body = `Decision line.\n\n## Context\n${n("c", 4)}\n## Why\n${n("w", 3)}\n## Rejected\n${n("r", 5)}\n## Consequences\n${n("k", 3)}\n`;
  assert.equal(body.split("\n").filter((l) => l.trim()).length, 20);
  assert.deepEqual(bodyProblems(body), []);
});

test("bodyProblems: empty body, heading as decision line, H1", () => {
  assert.deepEqual(bodyProblems(""), ["missing decision line"]);
  assert.deepEqual(bodyProblems("  \n\n"), ["missing decision line"]);
  assert.deepEqual(bodyProblems("## Why\nw\n"), [
    "the first non-blank line must be the decision line, not a heading",
  ]);
  assert.deepEqual(bodyProblems("D\n# Title\n## Why\nw\n"), [
    "H1 heading `# Title` is not allowed",
  ]);
});

test("bodyProblems: `## Why` missing, Why over 3, Rejected over 5, Consequences over 3", () => {
  assert.deepEqual(bodyProblems("D\n## Context\nc\n"), ["missing `## Why`"]);
  assert.deepEqual(bodyProblems(`D\n## Why\n${n("w", 4)}\n`), [
    "`## Why` has 4 non-blank lines, cap 3",
  ]);
  assert.deepEqual(bodyProblems(`D\n## Why\nw\n## Rejected\n${n("r", 6)}\n`), [
    "`## Rejected` has 6 non-blank lines, cap 5",
  ]);
  assert.deepEqual(bodyProblems(`D\n## Why\nw\n## Consequences\n${n("k", 4)}\n`), [
    "`## Consequences` has 4 non-blank lines, cap 3",
  ]);
});

test("bodyProblems: unknown and duplicate `##` headings; `###` is content; match is exact", () => {
  assert.deepEqual(bodyProblems("D\n## Why\nw\n## Notes\nx\n"), [
    "unknown heading `## Notes` (allowed: ## Why, ## Context, ## Rejected, ## Consequences)",
  ]);
  assert.deepEqual(bodyProblems("D\n## Why\nw\n## Why\nx\n"), ["duplicate heading `## Why`"]);
  assert.deepEqual(bodyProblems("D\n## Why  \nw\n### Sub\n"), []);
  assert.deepEqual(bodyProblems("D\n## Why\n### a\n### b\n### c\n### d\n"), [
    "`## Why` has 4 non-blank lines, cap 3",
  ]);
  assert.deepEqual(bodyProblems("D\n## why\nw\n"), [
    "unknown heading `## why` (allowed: ## Why, ## Context, ## Rejected, ## Consequences)",
    "missing `## Why`",
  ]);
});

test("bodyProblems: fenced lines count toward caps and the 20-line total", () => {
  const body = `D\n## Why\n${n("w", 3)}\n## Context\n\`\`\`\n${n("x", 13)}\n\`\`\`\n`;
  assert.deepEqual(bodyProblems(body), ["body has 21 non-blank lines, cap 20"]);
  assert.deepEqual(bodyProblems("D\n## Why\n~~~\nx\ny\n~~~\n"), [
    "`## Why` has 4 non-blank lines, cap 3",
  ]);
});

test("bodyProblems: a heading inside a fence is content, not a heading", () => {
  assert.deepEqual(bodyProblems("D\n## Context\n```\n## Why\n# H1\n## Notes\n```\n"), [
    "missing `## Why`",
  ]);
});

test("fieldProblems strict: type must equal the folder; an empty link list is reported", () => {
  const okf = {
    type: "source-list",
    title: "T",
    description: "d",
    generated: { by: "x", at: "2026-11-02T10:00:00Z" },
  };
  assert.deepEqual(fieldProblems(okf, { strict: true }), [], "no folder given: type not compared");
  assert.deepEqual(fieldProblems(okf, { strict: true, folder: "sources" }), [
    "`type` `source-list` is not the folder name `sources`",
  ]);
  assert.deepEqual(
    fieldProblems(
      { ...okf, type: "sources", amends: "", supersedes: [] },
      { strict: true, folder: "sources" },
    ),
    ["`supersedes` is empty: drop the key", "`amends` is empty: drop the key"],
  );
  assert.deepEqual(fieldProblems({ ...okf, amends: "" }), [], "non-strict stays silent");
});

test("bodyProblems: a shorter fence of the same char does not close a longer one (CommonMark)", () => {
  assert.ok(
    bodyProblems("D\n## Context\n~~~~\n~~~\n## Why\nw\n~~~~\n").includes("missing `## Why`"),
  );
});

test("fieldProblems: a list or mapping in a scalar field is a problem, never read as absent", () => {
  const data =
    parseFrontmatter(
      "---\ntitle: T\ndescription: D.\naudience: client\nstatus: { state: draft }\n---\n",
    ).data ?? {};
  assert.ok(fieldProblems(data).includes("`status` must be a scalar"), fieldProblems(data).join());
  const r = toRecord("s", "verdicts", data);
  assert.notEqual(r.status, "stable");
  assert.equal(isClientShareable(r), false);
  const listed = parseFrontmatter("---\ndescription: D.\naudience: [client]\n---\n").data ?? {};
  assert.ok(fieldProblems(listed).includes("`audience` must be a scalar"));
  assert.equal(isClientShareable(toRecord("s", "verdicts", listed)), false);
});

test("generatedProblems: generated.by is required and non-empty", () => {
  const data =
    parseFrontmatter("---\ndescription: D.\ngenerated: { at: 2026-01-01T00:00:00Z }\n---\n").data ??
    {};
  assert.deepEqual(fieldProblems(data), ["missing `generated.by`"]);
});

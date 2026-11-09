// Records CLI (#73 row 4a): `new` writes the OKF v0.2 skeleton, amend/supersede take the
// challenge, log to <kind>/log.md and refuse records that fail the strict check. Every test runs
// the CLI as a process against a temp library; nothing touches the real library folders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./library-records.js", import.meta.url));
const today = () => new Date().toISOString().slice(0, 10);

/** A fresh, empty library root outside any git repo. */
const lib = () => mkdtempSync(path.join(tmpdir(), "library-records-"));

/**
 * Run the CLI against `root`; returns exit code and output. `unset` drops variables from the env.
 * @param {string} root @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string, unset?: (k: string) => boolean }} [o]
 */
function cli(root, args, o = {}) {
  const env = { ...process.env, ...o.env };
  for (const k of Object.keys(env)) if (o.unset?.(k)) delete env[k];
  const r = spawnSync("node", [CLI, ...args, "--root", root], {
    encoding: "utf8",
    cwd: o.cwd,
    env,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** `new` through the CLI itself, asserting it worked. @param {string} root @param {string[]} args */
function mk(root, args) {
  const r = cli(root, ["new", ...args, "--by", "human:test"]);
  assert.equal(r.code, 0, r.err);
}

/** @param {string} root @param {string} rel */
const read = (root, rel) => readFileSync(path.join(root, rel), "utf8");

/** The non-blank lines of one `##` section. @param {string} text @param {string} heading */
function section(text, heading) {
  const lines = text.split("\n");
  const at = lines.indexOf(heading);
  assert.notEqual(at, -1, `${heading} missing`);
  const end = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return lines.slice(at + 1, end === -1 ? undefined : end).filter((l) => l.trim());
}

test("new with defaults writes the OKF skeleton, creates the index, passes check", () => {
  const root = lib();
  mk(root, ["decisions", "use-x", "--description", "Use X for Y."]);
  const text = read(root, "decisions/use-x.md");
  assert.match(text, /^---\ntype: decisions\ntitle: use-x\ndescription: Use X for Y\.\n/);
  assert.match(text, /\nstatus: draft\ntags: \[\]\n/);
  assert.match(
    text,
    /\ngenerated: \{ by: human:test, at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \}\n/,
  );
  assert.doesNotMatch(text, /^(name|kind|date):/m);
  assert.doesNotMatch(text, /^# /m);
  assert.doesNotMatch(text, /## Decision/);
  assert.match(text, /\n---\n\nUse X for Y\.\n\n## Why\n\n## Rejected\n\n## Consequences\n/);
  assert.match(
    read(root, "decisions/index.md"),
    /- \[use-x\]\(use-x\.md\) — Use X for Y\. _\(draft\)_/,
  );
  assert.equal(cli(root, ["check"]).code, 0);
});

test("new: --by sets generated.by; without it and no git user.name it is human:unknown", () => {
  const root = lib();
  mk(root, ["decisions", "a", "--description", "A."]);
  assert.match(read(root, "decisions/a.md"), /generated: \{ by: human:test, /);
  const r = cli(root, ["new", "decisions", "b", "--description", "B."], {
    cwd: root,
    env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    // Any inherited git identity or repo pointer would leak a user.name into the child.
    unset: (k) =>
      ["GIT_CONFIG_COUNT", "GIT_DIR", "GIT_WORK_TREE", "GIT_AUTHOR_NAME"].includes(k) ||
      /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(k),
  });
  assert.equal(r.code, 0, r.err);
  assert.match(read(root, "decisions/b.md"), /generated: \{ by: human:unknown, /);
});

test("new --status accepted refuses, names the allowed statuses, writes nothing", () => {
  const root = lib();
  const r = cli(root, ["new", "decisions", "a", "--description", "A.", "--status", "accepted"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("draft|stable|deprecated"), r.err);
  assert.equal(existsSync(path.join(root, "decisions", "a.md")), false);
});

test("amend without --rejected/--consequences/--keep-sections refuses and writes nothing", () => {
  const root = lib();
  mk(root, ["decisions", "a", "--description", "A."]);
  const before = read(root, "decisions/a.md");
  const r = cli(root, ["amend", "decisions/a", "--note", "n"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("--keep-sections"), r.err);
  assert.ok(r.err.includes("a change must say what was rejected and what follows"), r.err);
  assert.equal(read(root, "decisions/a.md"), before);
  assert.equal(existsSync(path.join(root, "decisions", "log.md")), false);
});

test("amend --rejected appends to ## Rejected and logs the note, status and body otherwise kept", () => {
  const root = lib();
  mk(root, ["decisions", "a", "--description", "A.", "--status", "stable"]);
  const r = cli(root, ["amend", "decisions/a", "--note", "n", "--rejected", "x"]);
  assert.equal(r.code, 0, r.err);
  const text = read(root, "decisions/a.md");
  assert.deepEqual(section(text, "## Rejected"), ["- x"]);
  assert.match(text, /\nstatus: stable\n/);
  assert.doesNotMatch(text, /## Changes/);
  assert.doesNotMatch(text, /\bn$/m);
  assert.equal(
    read(root, "decisions/log.md"),
    `# decisions — log\n\n## ${today()}\n\n- **Update** a — n\n`,
  );
  assert.equal(cli(root, ["check"]).code, 0);
  // still strict-clean: a second amend (which runs the strict check) is accepted
  assert.equal(cli(root, ["amend", "decisions/a", "--note", "m", "--rejected", "z"]).code, 0);
  assert.deepEqual(section(read(root, "decisions/a.md"), "## Rejected"), ["- x", "- z"]);
});

test("log.md: today's section goes before older ones; a second amend appends under one heading", () => {
  const root = lib();
  mk(root, ["decisions", "a", "--description", "A."]);
  writeFileSync(
    path.join(root, "decisions", "log.md"),
    "# decisions — log\n\n## 2020-01-01\n\n- **Update** a — old\n",
  );
  assert.equal(cli(root, ["amend", "decisions/a", "--note", "n1", "--keep-sections"]).code, 0);
  assert.equal(cli(root, ["amend", "decisions/a", "--note", "n2", "--keep-sections"]).code, 0);
  const log = read(root, "decisions/log.md");
  assert.equal(
    log,
    `# decisions — log\n\n## ${today()}\n\n- **Update** a — n1\n- **Update** a — n2\n\n## 2020-01-01\n\n- **Update** a — old\n`,
  );
});

test("amend --via gives the carrying record amends: [target], its body untouched", () => {
  const root = lib();
  mk(root, ["decisions", "a", "--description", "A."]);
  mk(root, ["other", "b", "--description", "B."]);
  const bodyOf = (/** @type {string} */ t) => t.slice(t.indexOf("\n---\n"));
  const before = read(root, "other/b.md");
  const r = cli(root, [
    "amend",
    "decisions/a",
    "--note",
    "n",
    "--via",
    "other/b",
    "--keep-sections",
  ]);
  assert.equal(r.code, 0, r.err);
  const after = read(root, "other/b.md");
  assert.match(after, /\namends: \[decisions\/a\]\n/);
  assert.equal(bodyOf(after), bodyOf(before));
  assert.equal(cli(root, ["check"]).code, 0);
});

test("supersede: old deprecated, new supersedes it and gains the consequence, default note logged", () => {
  const root = lib();
  mk(root, ["decisions", "old", "--description", "Old.", "--status", "stable"]);
  mk(root, ["decisions", "new", "--description", "New.", "--status", "stable"]);
  const r = cli(root, ["supersede", "decisions/old", "decisions/new", "--consequences", "y"]);
  assert.equal(r.code, 0, r.err);
  assert.match(read(root, "decisions/old.md"), /\nstatus: deprecated\n/);
  const next = read(root, "decisions/new.md");
  assert.match(next, /\nsupersedes: \[old\]\n/);
  assert.deepEqual(section(next, "## Consequences"), ["- y"]);
  assert.match(
    read(root, "decisions/log.md"),
    /- \*\*Update\*\* old — superseded by decisions\/new\n/,
  );
  assert.match(read(root, "decisions/index.md"), /- \[old\]\(old\.md\) — Old\. _\(deprecated\)_/);
  assert.equal(cli(root, ["check"]).code, 0);
});

test("supersede without the challenge flags refuses and writes nothing", () => {
  const root = lib();
  mk(root, ["decisions", "old", "--description", "Old."]);
  mk(root, ["decisions", "new", "--description", "New."]);
  const before = [read(root, "decisions/old.md"), read(root, "decisions/new.md")];
  const r = cli(root, ["supersede", "decisions/old", "decisions/new"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("--keep-sections"), r.err);
  assert.deepEqual([read(root, "decisions/old.md"), read(root, "decisions/new.md")], before);
  assert.equal(existsSync(path.join(root, "decisions", "log.md")), false);
});

test("amend refuses a legacy-shaped record, naming field and body problems, writing nothing", () => {
  const root = lib();
  mkdirSync(path.join(root, "decisions"));
  const legacy =
    "---\nname: a\nkind: decisions\ntitle: A\ndescription: A.\nstatus: accepted\ndate: 2026-01-01\n---\n\n# A\n\n## Decision\n\nUse A.\n";
  writeFileSync(path.join(root, "decisions", "a.md"), legacy);
  const r = cli(root, ["amend", "decisions/a", "--note", "n", "--keep-sections"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("legacy field `name`"), r.err);
  assert.ok(r.err.includes("unknown heading `## Decision`"), r.err);
  assert.equal(read(root, "decisions/a.md"), legacy);
  assert.equal(existsSync(path.join(root, "decisions", "log.md")), false);
});

/** Every file under `root` → its contents. @param {string} root */
function tree(root) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const d of readdirSync(root).sort())
    for (const f of readdirSync(path.join(root, d)).sort())
      out[`${d}/${f}`] = read(root, `${d}/${f}`);
  return out;
}

/** A strict-clean record (built by hand, so it may sit anywhere). @param {string} slug */
const modernRecord = (slug) =>
  `---\ntype: decisions\ntitle: ${slug}\ndescription: D.\ngenerated: { by: human:x, at: 2026-01-01T00:00:00Z }\n---\n\nD.\n\n## Why\n\nw\n`;

/** One legacy record. @param {string} slug @param {string} line */
const legacyRecord = (slug, line) =>
  `---\nname: ${slug}\nkind: decisions\nstatus: accepted\ndate: 2026-09-30\n---\n\n# ${slug}\n\n## Decision\n\n${line}\n\n## Changes\n\n- old\n`;

/** A temp root: decisions (indexed, 2 legacy records) + sources (no index, 1 body-only file). */
function legacyLibrary() {
  const root = lib();
  mkdirSync(path.join(root, "decisions"));
  mkdirSync(path.join(root, "sources"));
  writeFileSync(path.join(root, "decisions", "index.md"), "# decisions — index\n");
  writeFileSync(path.join(root, "decisions", "a.md"), legacyRecord("a", "Use A."));
  writeFileSync(path.join(root, "decisions", "b.md"), legacyRecord("b", "Use B."));
  writeFileSync(
    path.join(root, "sources", "list.md"),
    "# Sources\n\nWhat we read.\n\n## Web\n\n- x\n",
  );
  return root;
}

test("migrate: legacy + unindexed body-only folder → standard records, sources index created, check passes", () => {
  const root = legacyLibrary();
  const r = cli(root, ["migrate"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /wrote .*sources\/list\.md/);
  assert.match(r.out, /migrated 3 of 3 records in 2 folders\n$/);
  assert.ok(existsSync(path.join(root, "sources", "index.md")));
  assert.match(read(root, "sources/index.md"), /- \[Sources\]\(list\.md\) — What we read\./);
  assert.match(
    read(root, "decisions/a.md"),
    /^---\ntype: decisions\ntitle: a\ndescription: Use A\.\nstatus: stable\n/,
  );
  assert.doesNotMatch(read(root, "decisions/a.md"), /^(name|kind|date):|## Changes/m);
  const check = cli(root, ["check"]);
  assert.equal(check.code, 0, check.err);
});

test("migrate twice: the second run exits 0 and leaves every file byte-identical", () => {
  const root = legacyLibrary();
  assert.equal(cli(root, ["migrate"]).code, 0);
  const before = tree(root);
  const r = cli(root, ["migrate"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /migrated 0 of 3 records in 2 folders/);
  assert.doesNotMatch(r.out, /wrote /);
  assert.deepEqual(tree(root), before);
});

test("migrate: a problem the transform cannot fix (unknown status word) exits 1 and is printed", () => {
  const root = legacyLibrary();
  writeFileSync(
    path.join(root, "decisions", "c.md"),
    legacyRecord("c", "Use C.").replace("status: accepted", "status: wip"),
  );
  const before = read(root, "decisions/c.md");
  const r = cli(root, ["migrate"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("c.md: status `wip` is not one of draft|stable|deprecated"), r.err);
  assert.match(r.out, /migrated 3 of 4 records in 2 folders/);
  assert.doesNotMatch(r.out, /wrote .*c\.md/);
  assert.equal(read(root, "decisions/c.md"), before);
});

test("new refuses a value the frontmatter cannot hold (comma in a mapping, newline), writes nothing", () => {
  const root = lib();
  const comma = cli(root, [
    "new",
    "decisions",
    "a",
    "--description",
    "A.",
    "--by",
    "human:Doe, Jane",
  ]);
  assert.equal(comma.code, 1);
  assert.ok(comma.err.includes("`generated` cannot be written as frontmatter:"), comma.err);
  const nl = cli(root, [
    "new",
    "decisions",
    "b",
    "--description",
    "B.",
    "--title",
    "T\naudience: client",
  ]);
  assert.equal(nl.code, 1);
  assert.ok(nl.err.includes("`title` cannot be written as frontmatter:"), nl.err);
  assert.equal(existsSync(path.join(root, "decisions")), false);
});

test("supersede refuses a second superseder of the same record: files and log unchanged", () => {
  const root = lib();
  for (const s of ["old", "a", "b"])
    mk(root, ["decisions", s, "--description", `${s}.`, "--status", "stable"]);
  assert.equal(cli(root, ["supersede", "decisions/old", "decisions/a", "--keep-sections"]).code, 0);
  const before = tree(root);
  const r = cli(root, ["supersede", "decisions/old", "decisions/b", "--keep-sections"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("exactly one"), r.err);
  assert.deepEqual(tree(root), before);
});

test("a reference outside kebab-case kind/slug is refused before anything is read or written", () => {
  const parent = lib();
  const root = path.join(parent, "lib");
  mkdirSync(path.join(root, "decisions"), { recursive: true });
  // `../outside` would resolve to <parent>/outside.md and log to <root>/../log.md = <parent>/log.md.
  writeFileSync(path.join(parent, "outside.md"), modernRecord("outside"));
  const before = read(parent, "outside.md");
  const r = cli(root, ["amend", "../outside", "--note", "n", "--rejected", "x"]);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes("must be kind/slug in kebab-case"), r.err);
  assert.equal(read(parent, "outside.md"), before);
  assert.equal(existsSync(path.join(parent, "log.md")), false);
  assert.equal(existsSync(path.join(root, "log.md")), false);
});

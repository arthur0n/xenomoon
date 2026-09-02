// issuekit — shared plumbing: shell helpers, argv parsing, project config, `gh --json` shapes.
//
// Split out of issuekit.js so the CLI's two halves (the attempt LOG and the branch/PR PLUMBING)
// stay under the repo's file-size limit and can be read independently.
//
// IMPORTANT: always shells to RAW `gh` (never `rtk gh`, which truncates labels).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

/**
 * Flags parsed off argv. A flag is a string when it took a value and `true` when it is one of
 * the known booleans, so every read that needs a string coerces — see `str()`.
 * @typedef {Record<string, string | boolean | undefined>} Flags
 */

/**
 * The slice of `gh --json` output this tool reads. Everything is optional: `gh` omits fields
 * that were not requested, and a partial object must never crash the CLI mid-write.
 * @typedef {{ number?: number, title?: string, state?: string, url?: string, body?: string,
 *   labels?: ({ name?: string } | string)[],
 *   comments?: { body?: string, author?: { login?: string }, createdAt?: string }[],
 *   baseRefName?: string, headRefName?: string, mergeStateStatus?: string, mergeable?: string,
 *   statusCheckRollup?: { conclusion?: string, state?: string, status?: string, name?: string, context?: string }[],
 *   conclusion?: string, headSha?: string, displayTitle?: string, updatedAt?: string }} GhNode
 */

/**
 * `.issuekit.json` — written by `init`, read by everything. Every key is optional: a config
 * written by an older version must still load rather than crash the CLI.
 * @typedef {{ repo?: string, ghUser?: string, base?: string, branchPrefix?: string,
 *   mergeMethod?: string, deployWorkflow?: string, prodBranch?: string }} IssuekitConfig
 */

/** Read a flag as a string, or undefined. @param {string | boolean | undefined} v */
export const str = (v) => (v === undefined || v === true || v === false ? undefined : String(v));

/** A flag read where BLANK counts as unset (`--label ""` means "no label", not an empty label).
 * @param {string | boolean | undefined} v @param {string} fallback @returns {string} */
export const strOr = (v, fallback) => {
  const s = str(v);
  return s?.trim() ? s : fallback;
};

/** Parse JSON that may be anything at all; a non-object (or invalid) payload reads as null.
 * @param {string} raw @returns {Record<string, unknown> | null} */
export const parseObject = (raw) => {
  try {
    const parsed = /** @type {unknown} */ (JSON.parse(raw));
    return parsed && typeof parsed === "object"
      ? /** @type {Record<string, unknown>} */ (parsed)
      : null;
  } catch {
    return null;
  }
};

// ── tiny shell helpers ───────────────────────────────────────────────────────
/** @param {string} cmd @param {string[]} args @param {{ input?: string, allowFail?: boolean }} [opts] */
export function run(cmd, args, { input, allowFail } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0 && !allowFail) {
    const msg = (r.stderr || r.stdout || `${cmd} failed`).trim();
    throw new Error(msg);
  }
  return { status: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/** @param {string[]} args @param {{ input?: string, allowFail?: boolean }} [opts] */
export const gh = (args, opts) => run("gh", args, opts);

/** Raw `gh --json` output. Callers pick the shape via `ghNode` / `ghNodes` — nothing reads it
 * untyped, so a field this tool never requested can never be dereferenced by accident.
 * @param {string[]} args @returns {unknown} */
export const ghJson = (args) => JSON.parse(gh(args).out || "null");

/** One issue/PR node. @param {string[]} args @returns {GhNode} */
export const ghNode = (args) => /** @type {GhNode} */ (ghJson(args) ?? {});

/** A list of issue/PR nodes. @param {string[]} args @returns {GhNode[]} */
export const ghNodes = (args) => /** @type {GhNode[]} */ (ghJson(args) ?? []);

/** @param {string[]} args */
export function git(args) {
  const r = run("git", args, { allowFail: true });
  return r.status === 0 ? r.out : "";
}

// ── arg parsing ──────────────────────────────────────────────────────────────
export const BOOL = new Set([
  "close",
  "force",
  "full",
  "template",
  "help",
  "apply",
  "when-green",
  "set-upstream",
  "digest",
]);

/** @param {string[]} argv @returns {{ pos: string[], flags: Flags }} */
export function parseArgs(argv) {
  /** @type {string[]} */
  const pos = [];
  /** @type {Flags} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i] ?? "";
    // Short flags too (`-m "msg"`), not just `--long`. A bare "-" is a VALUE — it means stdin for
    // the `*-file` flags — so it is never read as a flag name.
    if (t.startsWith("-") && t !== "-") {
      const name = t.replace(/^--?/, "");
      if (BOOL.has(name)) flags[name] = true;
      else if (i + 1 < argv.length && !(argv[i + 1] ?? "").startsWith("--"))
        flags[name] = argv[++i];
      else flags[name] = true;
    } else pos.push(t);
  }
  return { pos, flags };
}

/** A `.issuekit.json` that EXISTS but cannot be read is fatal, never "absent": treating it as
 * absent would let `resolveRepo` fall back to whatever repo the cwd happens to point at, so a
 * corrupt project binding would silently write issues to the wrong repository.
 * @param {string} raw @param {string} where @returns {IssuekitConfig} */
function parseConfig(raw, where) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${where} is not valid JSON — fix it or delete it`, { cause: e });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${where} must contain a JSON object`);
  return /** @type {IssuekitConfig} */ (parsed);
}

/** @param {string} [start] @returns {{ path: string, dir: string, cfg: IssuekitConfig } | null} */
export function findConfig(start = process.cwd()) {
  let dir = start;
  for (;;) {
    const p = join(dir, ".issuekit.json");
    if (existsSync(p)) return { path: p, dir, cfg: parseConfig(readFileSync(p, "utf8"), p) };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// repo: --repo > .issuekit.json > current repo (gh resolves from cwd remote)
/** @param {Flags} flags @returns {string} */
export function resolveRepo(flags) {
  const flagRepo = str(flags.repo);
  if (flagRepo) return flagRepo;
  const c = findConfig();
  if (c?.cfg?.repo) return c.cfg.repo;
  const r = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    allowFail: true,
  });
  if (r.status === 0 && r.out) return r.out;
  throw new Error(
    "No repo. Pass --repo owner/name, run `issuekit init`, or run inside a GitHub repo.",
  );
}

// gh identity switch — a project that authenticates as its own GitHub account (not the human's
// default) pins it in .issuekit.json, so every write lands as that identity.
//
// FAIL CLOSED for anything that writes. A pinned identity that could not be activated used to be
// ignored (`allowFail`), which meant the comment, issue or PR quietly landed under whatever
// account happened to be logged in — wrong audit trail, possibly wrong permissions, and
// unrecoverable once posted. A read may proceed with a warning; a write may not.
/** @param {Flags} flags @param {{ mutating?: boolean }} [opts] */
export function maybeSwitchUser(flags, { mutating = true } = {}) {
  const user = str(flags.user) ?? findConfig()?.cfg?.ghUser;
  if (!user) return;
  const sw = gh(["auth", "switch", "--user", user], { allowFail: true });
  if (sw.status === 0) return;
  const active = gh(["api", "user", "-q", ".login"], { allowFail: true });
  const now = active.status === 0 && active.out ? active.out : "the active account";
  if (!mutating) {
    console.error(`issuekit: warning — could not switch to ${user}; reading as ${now}`);
    return;
  }
  throw new Error(
    `pinned gh identity "${user}" could not be activated (${sw.err || "gh auth switch failed"}) — ` +
      `a write would land as ${now}. Run \`gh auth login --user ${user}\`, or pass --user explicitly.`,
  );
}

/** @param {string} name @param {string} body */
export const tmpFile = (name, body) => {
  const p = join(tmpdir(), `issuekit-${name}-${process.pid}.md`);
  writeFileSync(p, body);
  return p;
};

export const agentName = () => process.env.ISSUEKIT_AGENT ?? process.env.USER ?? "agent";

export const shortHead = () => git(["rev-parse", "--short", "HEAD"]) || "no-git";

export const nowIso = () => new Date().toISOString();

// ── branch & PR conventions (the tool carries the convention; agents pass a number) ──
// .issuekit.json keys: base (work-branch target; default = repo default branch),
// branchPrefix (default "fix"), mergeMethod (squash|merge|rebase; default squash),
// deployWorkflow + prodBranch (for deploy-check).
export const cfgOf = () => findConfig()?.cfg ?? {};

/** @param {string} s */
export const indent = (s) =>
  s
    .split("\n")
    .map((l) => "  | " + l)
    .join("\n");

/** @param {string} t */
export const slugify = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

// Countable token-audit markers: one line per deterministic op that replaces what used to be a
// whole agent dispatch (see xenomoon .claude/token-audits — ids pr-plumb-cli, commit-push-cli).
// The `op=` suffix is what separates a real fire from a prose mention of the marker in a doc.
/** @param {string} policy @param {string} op */
export const mark = (policy, op) => {
  console.log(`policy:"${policy}" op=${op}`);
};
/** @param {string} op */
export const plumbMark = (op) => {
  mark("pr-plumb-cli", op);
};

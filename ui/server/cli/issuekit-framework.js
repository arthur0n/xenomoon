// `issuekit framework-fix <verb>`: the one way an agent session fixes the framework in a bound
// install. It acts on the framework checkout this script lives in, never on the process cwd.
// One fix at a time: `start` refuses while the checkout is off `main` and names the open fix.
// Logic takes the checkout dir and injectable runners, so tests need no real git or gh.
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, slugify } from "./issuekit-lib.js";
import { boundInstall, currentBranch, frameworkRemote, runGit } from "./install-main-guard.js";

/** @typedef {import("./install-main-guard.js").GitRunner} GitRunner */
/** @typedef {typeof run} ExecRunner */
/** @typedef {{ git?: GitRunner, exec?: ExecRunner, bound?: (dir: string) => boolean }} FixDeps */
/** @typedef {{ files: string[], message?: string, title?: string, body?: string }} SubmitArgs */
/** @typedef {{ number: number, url: string }} FixPr */
/** @typedef {{ remote: string, repo: string, branch: string, pr: FixPr | null }} PublishPlan */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The framework checkout this script lives in. */
export const FRAMEWORK_DIR = path.resolve(HERE, "..", "..", "..");

/** The name check run on the slug (`--text` mode reads stdin, exit 1 on a hit). */
export const NAME_CHECK = path.join(HERE, "check-project-names.js");

export const NOT_BOUND = "this checkout runs no projects; commit here as usual";

/** Files the pre-commit hook stages by itself (update-badges.js, `.husky/pre-commit`). */
export const HOOK_STAGED = [
  "README.md",
  ".claude-plugin/marketplace.json",
  "FEATURES.md",
  ".claude/framework-audits/LEDGER.md",
];

/** @param {{ out: string, err: string }} r @returns {string} */
const outputOf = (r) => (r.err || r.out).trim();

/**
 * The open PR whose head is `branch` on the framework repo. The branch name is name-checked
 * first; on a hit `{ named }` carries the check's message and gh is not called.
 * @param {string} dir @param {string} branch @param {FixDeps} [deps]
 * @returns {{ pr: { number: number, url: string } | null } | { error: string } | { named: string }}
 */
export function openFixPr(dir, branch, deps = {}) {
  const { git = runGit, exec = run } = deps;
  const named = nameRefusal(dir, `${branch}\n`, deps);
  if (named) return { named };
  const target = frameworkRemote(dir, { run: git });
  if ("error" in target) return { error: target.error };
  const args = ["pr", "list", "-R", target.repo, "--head", branch, "--state", "open"];
  const r = exec("gh", [...args, "--json", "number,url", "--limit", "1"], {
    cwd: dir,
    allowFail: true,
  });
  if (r.status !== 0) return { error: outputOf(r) || "gh failed" };
  try {
    const list = /** @type {unknown} */ (JSON.parse(r.out || "[]"));
    const first = Array.isArray(list) ? /** @type {Record<string, unknown>} */ (list[0]) : null;
    if (!first) return { pr: null };
    const url = typeof first.url === "string" ? first.url : "";
    return { pr: { number: Number(first.number), url } };
  } catch {
    return { error: "gh printed no JSON" };
  }
}

/** The refusal for a checkout on `branch` instead of main.
 * @param {string} dir @param {string} branch @param {FixDeps} [deps] @returns {string} */
export function openFixRefusal(dir, branch, deps = {}) {
  const found = openFixPr(dir, branch, deps);
  if ("named" in found) return found.named;
  if ("error" in found) {
    return `a framework fix is open: branch ${branch}; its PR could not be read (${found.error}); add to it or wait until it is merged`;
  }
  if (!found.pr) {
    return `a framework fix is open: branch ${branch}, with no open PR; add to it, or merge or drop it and run git switch main`;
  }
  return `a framework fix is open: branch ${branch}, PR #${found.pr.number} ${found.pr.url}; add to it or wait until it is merged`;
}

/** The staged paths at `dir`, or null when git cannot list them.
 * @param {string} dir @param {GitRunner} git @returns {string[] | null} */
function stagedFiles(dir, git) {
  const staged = git(dir, ["diff", "--cached", "--name-only", "-z"]);
  return staged.status === 0 ? staged.stdout.split("\0").filter(Boolean) : null;
}

/**
 * Refusal for `start` at `dir`, or null when the checkout is a bound install on main with
 * nothing staged. Unstaged and untracked files do not block.
 * @param {string} dir @param {FixDeps} [deps] @returns {string | null}
 */
export function startRefusal(dir, deps = {}) {
  const { git = runGit, bound = boundInstall } = deps;
  if (!bound(dir)) return NOT_BOUND;
  const branch = currentBranch(dir, { run: git });
  if (!branch) return "the framework checkout is on a detached HEAD; run git switch main first";
  if (branch !== "main") return openFixRefusal(dir, branch, deps);
  const files = stagedFiles(dir, git);
  if (!files) return "git could not list the staged files of the framework checkout";
  if (files.length > 0) {
    return `main has staged changes (${files.join(", ")}); unstage them with git restore --staged <paths>, then run start again`;
  }
  return null;
}

/** The name check's refusal for `text`, or null when it names no known project.
 * @param {string} dir @param {string} text @param {FixDeps} [deps] @returns {string | null} */
export function nameRefusal(dir, text, { exec = run } = {}) {
  const r = exec(process.execPath, [NAME_CHECK, "--text"], {
    cwd: dir,
    input: text,
    allowFail: true,
  });
  if (r.status === 0) return null;
  return outputOf(r) || `the name check failed (exit ${String(r.status)})`;
}

export const SUBMIT_HINT =
  'issuekit framework-fix submit --files <paths> -m "<message>" --title "<title>" --body "<body>"';

/**
 * `start <slug>`: from a clean main, create and switch to `fix/<slug>`.
 * @param {string} dir @param {string} slug @param {FixDeps} [deps]
 * @returns {{ ok: true, branch: string, line: string } | { ok: false, refusal: string }}
 */
export function frameworkFixStart(dir, slug, deps = {}) {
  const { git = runGit } = deps;
  const refused = startRefusal(dir, deps);
  if (refused) return { ok: false, refusal: refused };
  const name = slugify(slug);
  if (!name)
    return {
      ok: false,
      refusal: `the slug "${slug}" has no letters or digits; pass a short name of the fix`,
    };
  const branch = `fix/${name}`;
  const named = nameRefusal(dir, `${slug}\n${branch}\n`, deps);
  if (named) return { ok: false, refusal: named };
  if (git(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0) {
    return {
      ok: false,
      refusal: `branch ${branch} already exists; pick another slug or delete it`,
    };
  }
  const made = git(dir, ["switch", "-c", branch]);
  if (made.status !== 0) return { ok: false, refusal: `git could not create ${branch} from main` };
  return { ok: true, branch, line: `on ${branch}. Next: ${SUBMIT_HINT}` };
}

/** @type {Record<string, "message" | "title" | "body">} */
const TEXT_FLAGS = {
  "-m": "message",
  "--message": "message",
  "--title": "title",
  "--body": "body",
};

/**
 * `submit`'s flags from the raw argv after the verb: `--files` (comma-separated and/or
 * repeated), `-m`/`--message`, `--title` and `--body`. Other flags are skipped with their value.
 * @param {string[]} argv @returns {SubmitArgs}
 */
export function parseSubmitArgs(argv) {
  /** @type {SubmitArgs} */
  const out = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i] ?? "";
    const next = argv[i + 1];
    const key = TEXT_FLAGS[t];
    if (t === "--files" && next !== undefined && !next.startsWith("--")) {
      out.files.push(
        ...next
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      );
      i++;
    } else if (key && next !== undefined) {
      out[key] = next;
      i++;
    } else if (t.startsWith("-") && next !== undefined && !next.startsWith("-")) i++;
  }
  return out;
}

/**
 * Refusal for publishing `branch` (the checked-out one, or null on a detached HEAD), or null
 * when it is a plain fix branch: never main, a name with `:`, or one starting `+` or `refs/`.
 * @param {string | null} branch @returns {string | null}
 */
export function publishBranchRefusal(branch) {
  if (!branch) {
    return "the framework checkout is on a detached HEAD; run git switch main, then issuekit framework-fix start <slug>";
  }
  if (branch === "main") {
    return "the framework checkout is on main; run issuekit framework-fix start <slug> first";
  }
  if (branch.includes(":") || branch.startsWith("+") || branch.startsWith("refs/")) {
    return `the branch name ${branch} is not pushed (it contains ":" or starts with "+" or "refs/"); run issuekit framework-fix start <slug> from main`;
  }
  return null;
}

/** The refusal for one `--files` path, or null when it is a file inside `dir`.
 * @param {string} dir @param {string} p @returns {string | null} */
function pathRefusal(dir, p) {
  const rel = path.relative(dir, path.resolve(dir, p));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return `--files names ${p}, which lies outside the framework checkout ${dir}; paths are relative to its root`;
  }
  const st = statSync(path.join(dir, rel), { throwIfNoEntry: false });
  if (!st)
    return `--files names ${p}, which does not exist in ${dir}; paths are relative to its root`;
  if (st.isDirectory()) return `--files names ${p}, a folder; name its files one by one`;
  return null;
}

/**
 * Refusal for `submit` at `dir`, or null when a fix branch is checked out, nothing is staged,
 * a message is given and every named path is a file inside the checkout.
 * @param {string} dir @param {SubmitArgs} args @param {FixDeps} [deps] @returns {string | null}
 */
export function submitRefusal(dir, { files, message }, deps = {}) {
  const { git = runGit, bound = boundInstall } = deps;
  if (!bound(dir)) return NOT_BOUND;
  const branchRefused = publishBranchRefusal(currentBranch(dir, { run: git }));
  if (branchRefused) return branchRefused;
  if (!message?.trim()) return 'submit needs -m "<message>", the commit message';
  if (files.length === 0) {
    return `submit needs --files <paths>: the files of the fix, comma-separated or repeated, relative to ${dir}`;
  }
  for (const p of files) {
    const refused = pathRefusal(dir, p);
    if (refused) return refused;
  }
  const staged = stagedFiles(dir, git);
  if (!staged) return "git could not list the staged files of the framework checkout";
  if (staged.length > 0) {
    return `something is already staged (${staged.join(", ")}); unstage it with git restore --staged <paths>, then submit again`;
  }
  return null;
}

/** `p` as git names it: relative to `dir`, with forward slashes.
 * @param {string} dir @param {string} p @returns {string} */
const repoPath = (dir, p) => path.relative(dir, path.resolve(dir, p)).split(path.sep).join("/");

/**
 * Refusal when a HOOK_STAGED file that is not among `named` has local changes (the pre-commit
 * hook stages those files whole, so the edit would ride along), or null.
 * @param {string} dir @param {string[]} named @param {GitRunner} git @returns {string | null}
 */
function hookStagedRefusal(dir, named, git) {
  const r = git(dir, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--",
    ...HOOK_STAGED,
  ]);
  if (r.status !== 0)
    return "git could not list the local changes of the files the commit hook stages";
  const changed = r.stdout
    .split("\0")
    .filter(Boolean)
    .map((e) => e.slice(3));
  const loose = changed.find((f) => !named.includes(f));
  return loose
    ? `${loose} has local changes and the commit hook would include it; name it in --files or restore it`
    : null;
}

/**
 * The commit half of `submit`: stage only the named files and commit them with the checkout's
 * own hooks. A refused commit, or one that holds a file neither named nor in HOOK_STAGED, is
 * undone with every working-tree change kept and nothing left staged.
 * @param {string} dir @param {SubmitArgs} args @param {FixDeps} [deps]
 * @returns {{ ok: true, sha: string, branch: string, files: string[] } | { ok: false, refusal: string }}
 */
export function frameworkFixCommit(dir, args, deps = {}) {
  const { git = runGit, exec = run } = deps;
  const refused = submitRefusal(dir, args, deps);
  if (refused) return { ok: false, refusal: refused };
  const branch = currentBranch(dir, { run: git }) ?? "";
  const named = args.files.map((p) => repoPath(dir, p));
  const loose = hookStagedRefusal(dir, named, git);
  if (loose) return { ok: false, refusal: loose };
  const unstage = () => git(dir, ["reset", "--quiet"]);
  const added = exec("git", ["add", "--", ...named], { cwd: dir, allowFail: true });
  if (added.status !== 0) {
    unstage();
    return { ok: false, refusal: `git add refused; nothing is staged:\n${outputOf(added)}` };
  }
  const msg = args.message ?? "";
  const made = exec("git", ["commit", "-m", msg], { cwd: dir, allowFail: true });
  if (made.status !== 0) {
    unstage();
    const why = outputOf(made);
    return {
      ok: false,
      refusal: `the commit was refused; nothing is staged and your changes are kept:\n${why}`,
    };
  }
  const sha = git(dir, ["rev-parse", "HEAD"]).stdout.trim();
  const tree = git(dir, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"]);
  const inCommit = tree.stdout.split("\0").filter(Boolean);
  const allowed = new Set([...named, ...HOOK_STAGED]);
  const extra = inCommit.filter((f) => !allowed.has(f));
  if (tree.status !== 0 || extra.length > 0) {
    git(dir, ["reset", "--soft", "HEAD~1"]);
    unstage();
    const what = tree.status !== 0 ? "files git could not list" : extra.join(", ");
    return {
      ok: false,
      refusal: `the commit picked up files you did not name (${what}); it was taken back, nothing is staged and every change is kept in the working tree`,
    };
  }
  return { ok: true, sha, branch, files: inCommit };
}

/** The last line of every publish. @param {string} branch @returns {string} */
export const waitsLine = (branch) =>
  `the PR waits for the owner; the framework folder stays on ${branch} until it is merged`;

/** The publish-only re-run of `submit`. @param {SubmitArgs} args @returns {string} */
const retryHint = ({ title = "<title>", body = "<body>" }) =>
  `issuekit framework-fix submit --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} (no --files, no -m: it publishes the branch without a new commit)`;

/** The publish refusal when the open PR of `branch` was not read.
 * @param {string} branch @param {{ error: string } | { named: string }} found @returns {string} */
const prReadRefusal = (branch, found) =>
  "named" in found
    ? `${found.named}\nnothing was committed or pushed`
    : `the open PR of ${branch} could not be read (${found.error}); nothing was committed or pushed`;

/**
 * What publishing the checked-out branch needs, or a refusal when the checkout is unbound, the
 * branch is not publishable, there is no publishing remote, the open PR cannot be read, or the
 * branch has no open PR and `--title`/`--body` are missing (required for its first publish).
 * @param {string} dir @param {SubmitArgs} args @param {FixDeps} [deps]
 * @returns {{ plan: PublishPlan } | { refusal: string }}
 */
export function publishPlan(dir, { title, body }, deps = {}) {
  const { git = runGit, bound = boundInstall } = deps;
  if (!bound(dir)) return { refusal: NOT_BOUND };
  const branch = currentBranch(dir, { run: git });
  const refused = publishBranchRefusal(branch);
  if (refused || !branch) return { refusal: refused ?? "the framework checkout has no branch" };
  const target = frameworkRemote(dir, { run: git });
  if ("error" in target) return { refusal: target.error };
  const found = openFixPr(dir, branch, deps);
  if (!("pr" in found)) return { refusal: prReadRefusal(branch, found) };
  if (!found.pr && (!title?.trim() || !body?.trim())) {
    return {
      refusal: `the first publish of ${branch} needs --title "<title>" and --body "<body>": they become the PR's title and description; nothing was committed or pushed`,
    };
  }
  return { plan: { ...target, branch, pr: found.pr } };
}

/**
 * The publish half of `submit`: name-check the branch name, the messages of its commits not on
 * `<remote>/main`, the title and the body; push the branch with the checkout's hooks; open the
 * PR with the `spine` label, or, when one is open, leave it to the push. Merges nothing.
 * @param {string} dir @param {PublishPlan} plan @param {SubmitArgs} args @param {FixDeps} [deps]
 * @returns {{ ok: true, lines: string[] } | { ok: false, refusal: string }}
 */
export function frameworkFixPublish(dir, plan, args, deps = {}) {
  const { git = runGit, exec = run } = deps;
  const { remote, repo, branch, pr } = plan;
  const { title = "", body = "" } = args;
  const log = git(dir, ["log", "--format=%H%n%B%x00", `refs/remotes/${remote}/main..HEAD`]);
  if (log.status !== 0) {
    return {
      ok: false,
      refusal: `git could not compare ${branch} with ${remote}/main; run git fetch ${remote}, then submit again`,
    };
  }
  const commits = log.stdout
    .split("\0")
    .map((c) => c.trim())
    .filter(Boolean);
  if (commits.length === 0) {
    return {
      ok: false,
      refusal: `${branch} has no commits that are not on ${remote}/main; nothing to publish`,
    };
  }
  const messages = commits.map((c) => c.slice(c.indexOf("\n") + 1));
  const named = nameRefusal(dir, `${[branch, ...messages, title, body].join("\n")}\n`, deps);
  if (named) return { ok: false, refusal: `${named}\nnothing was pushed` };
  const pushed = exec("git", ["push", "-u", remote, branch], { cwd: dir, allowFail: true });
  if (pushed.status !== 0) {
    return {
      ok: false,
      refusal: `git push ${remote} ${branch} was refused; nothing was published:\n${outputOf(pushed)}`,
    };
  }
  const done = `pushed ${branch} to ${remote}`;
  if (pr)
    return {
      ok: true,
      lines: [`${done}; PR #${pr.number} ${pr.url} was updated by the push`, waitsLine(branch)],
    };
  const ghArgs = ["pr", "create", "-R", repo, "--base", "main", "--head", branch];
  const made = exec("gh", [...ghArgs, "--title", title, "--body", body, "--label", "spine"], {
    cwd: dir,
    allowFail: true,
  });
  if (made.status !== 0) {
    const why = outputOf(made) || `exit ${String(made.status)}`;
    return {
      ok: false,
      refusal: `${done}, but gh pr create failed:\n${why}\nretry: ${retryHint(args)}`,
    };
  }
  const url = made.out.split("\n").pop() ?? "";
  return { ok: true, lines: [`${done}; opened PR ${url}`, waitsLine(branch)] };
}

/**
 * `submit`: with `--files`/`-m`, commit (frameworkFixCommit), then publish; with neither, publish
 * the branch's existing commits only (the re-run after a failed publish). The publish needs are
 * checked before any commit, so a refusal there leaves the tree as it was.
 * @param {string} dir @param {SubmitArgs} args @param {FixDeps} [deps]
 * @returns {{ ok: true, lines: string[] } | { ok: false, refusal: string }}
 */
export function frameworkFixSubmit(dir, args, deps = {}) {
  const planned = publishPlan(dir, args, deps);
  if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
  /** @type {string[]} */
  const lines = [];
  if (args.files.length > 0 || args.message !== undefined) {
    const made = frameworkFixCommit(dir, args, deps);
    if (!made.ok) return made;
    lines.push(`committed ${made.sha.slice(0, 7)} on ${made.branch}`);
  }
  const published = frameworkFixPublish(dir, planned.plan, args, deps);
  if (published.ok) return { ok: true, lines: [...lines, ...published.lines] };
  const kept =
    lines.length > 0
      ? [
          ...lines,
          `the commit stays on ${planned.plan.branch}; to publish it: ${retryHint({ files: [] })}`,
        ]
      : [];
  return { ok: false, refusal: [published.refusal, ...kept].join("\n") };
}

/** @type {Record<string, (pos: string[], argv: string[]) => void>} */
const VERBS = {
  start: (pos) => {
    const r = frameworkFixStart(FRAMEWORK_DIR, pos.join(" "));
    if (!r.ok) throw new Error(r.refusal);
    console.log(r.line);
  },
  submit: (_pos, argv) => {
    const r = frameworkFixSubmit(FRAMEWORK_DIR, parseSubmitArgs(argv));
    if (!r.ok) throw new Error(r.refusal);
    console.log(r.lines.join("\n"));
  },
};

/** CLI handler of `issuekit framework-fix <verb> …`. A refusal throws (issuekit exits 1).
 * `argv` is the raw argv after the verb: issuekit's parser keeps only the last of a repeated flag.
 * @param {string[]} pos @param {string[]} [argv] */
export function cmdFrameworkFix(pos, argv = process.argv.slice(4)) {
  const [verb = "", ...rest] = pos;
  const handler = VERBS[verb];
  if (!handler) throw new Error(`framework-fix needs a verb: ${Object.keys(VERBS).join(" | ")}`);
  if (verb === "start" && rest.length === 0) throw new Error("framework-fix start needs a <slug>");
  handler(rest, argv);
}

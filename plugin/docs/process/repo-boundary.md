# Repo boundary — why the framework and the project are separate repos

The framework is INSTALLED (a fork/clone of `arthur0n/xenomoon`); projects are BOUND to
it. They never share a repo, and the boundary is what makes the learning loop work:

- **The domain can only learn in one place.** One install serves N projects; every
  approved learning lands in the install's `domains/<name>/` and benefits the next
  project immediately. Vendoring the framework per project would fragment learnings.
- **The project is never a git actor for the framework.** Nothing a bound project does
  pushes, commits, or hosts framework files. Users update the framework with
  `git pull upstream` and contribute learnings via PRs — both in the INSTALL, never the
  project.
- **Privacy is physical.** Project facts (business rules, data model) live only in the
  project's own files; the contamination gate polices the one crossing point
  (promotions).

## What lives WHERE

In the **project** (the complete list):

- `.xenomoon-project.json` — the domain lock (committed, tiny; only for domains that
  materialize)
- Its own `CLAUDE.md` (incl. `## Business rules / product facts`), `docs/conventions.md`,
  `design/` PRDs
- `.claude/` — project-local skills/agents + learning DRAFTS (`.claude/library/`)
  awaiting promotion
- `.xenomoon/` — runtime state (tasks, promotions queue, handoffs) — **gitignored**

In the **install** (framework checkout): everything else — spine (`ui/`), CORE plugin
(`plugin/`), domain packs (`domains/<name>/plugin/` incl. the learned `skills/` +
`library/`).

## Paths: validation, not layout

Any two LOCAL absolute paths work — sessions run with cwd = the project and reach the
framework via explicit `additionalDirectories` + env, never via folder adjacency. Same
parent directory is recommended for tidiness only. The install validates the real
constraints instead (see `ui/server/cli/validate-path.js`): absolute, writable, local
disk (no iCloud/network mounts), and no nesting of one inside the other.

---
description: Turn your install's approved domain learnings into a PR against the upstream framework — domain files only, contamination-gated, never project data
argument-hint: "[domain-name, default = the active domain]"
---

# /contribute — send domain learnings upstream

Your install's domain pack grew (promoted skills / library records). This stages ONLY those
learnings on a branch and opens a PR against the framework trunk (`arthur0n/xenomoon`), so
other installs can benefit. Routing contract: `plugin/docs/process/updates-routing.md` —
only DOMAIN-scope content is ever PR-able.

Arguments: `$ARGUMENTS`

## Hard scope rules (refuse, don't improvise)

- Stage ONLY paths under `domains/<name>/plugin/{skills,library}/` (+ their index files).
- NEVER stage: `.xenomoon.json`, anything under `.claude/`, `ui/`, `plugin/` (CORE), other
  domains, or any file naming the bound project. A diff that wants those is not a
  contribution — stop and say why.
- Uncommitted unrelated changes in the checkout → stop and tell the user to commit/stash
  first (the branch must contain learnings only).

## Steps

1. **Collect the candidates:** `git status --porcelain -- domains/<name>/plugin/skills
domains/<name>/plugin/library` plus committed-but-unpushed learning commits. Nothing →
   "nothing to contribute" and stop.
2. **Gate locally before any push:**
   - `node ui/server/cli/gen-contamination.js` (the direct-to-plugin scan — same scanner
     the promote gate runs; it must pass over the staged learnings),
   - `npm run check:agnostic`,
   - `npm run validate`.
3. **Branch + commit:** `git switch -c contrib/<name>-<short-desc>`; commit ONLY the scoped
   paths, message `feat(<name>): <what the domain learned>` (one learning theme per PR —
   split unrelated learnings).
4. **Open the PR** with `gh pr create` against the upstream trunk: body lists each
   skill/record with its one-line description + the reason it generalizes (from the
   promotion's `reason`). Note that CI re-runs the same gates (pr-domain workflow).
5. **Return to your branch** (`git switch -`) — the working install keeps running on its
   own trunk; the PR lives independently.

## Collisions (documented convention, no tooling yet)

If upstream later lands a same-named capability: on your next `git pull upstream`, YOUR
version wins locally — move upstream's copy aside (`<name>.upstream/`) and merge by hand.
Descriptive slugs keep this rare.

# Contributing to Xenomoon

The framework learns from real projects. Your install's domain packs grow via the
promotions board; the good, GENERAL learnings come back here as PRs. The routing contract
is `plugin/docs/process/updates-routing.md` — read it first.

## What is PR-able

- **Domain learnings only**: files under `domains/<name>/plugin/skills/` and
  `domains/<name>/plugin/library/` (+ their kind indexes) that passed your local promote
  gate. Use the shipped `/contribute` command — it stages exactly this and runs the gates.
- Framework (spine) fixes are welcome too, but as ordinary code PRs with `npm run validate`
  green — they are NOT "learnings" and never route through promotions.

## What is never PR-able

- **Project data**: business rules, data models, product facts, project names — anything
  the contamination scanner flags (per-project denylist + business-rule lines + provenance
  - one-project mapping). PROJECT-scope content stays in the project.
- Your `.xenomoon.json`, `.claude/` local config, logs, runtime state.

## The gates your PR must pass (CI re-runs them)

1. Path scope: changed files ⊆ `domains/**` (+ docs) for a learning PR.
2. `node ui/server/cli/gen-contamination.js` — the direct-to-plugin contamination scan.
3. `npm run check:agnostic` + `npm run validate` + `npm test`.

## Update / collision convention

Update your fork with `git pull upstream main`. On a conflict inside `domains/**`: your
local version wins; save upstream's copy aside (`<name>.upstream/`) and merge by hand.
Give promoted capabilities descriptive slugs so collisions stay rare.

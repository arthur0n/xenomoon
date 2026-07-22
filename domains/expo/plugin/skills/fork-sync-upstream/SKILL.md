---
name: fork-sync-upstream
description: Domain-agnostic runbook for merging an upstream repo into a long-lived product fork — delta triage, install-before-commit, recurring conflict shapes (union objects, moved types + fork-only keys, size-cap trips), validate gates, and when NOT to merge. Load when syncing a fork with upstream or diagnosing a broken post-sync tree. Written platform-neutral; promotable out of this domain.
---

# Fork ⇄ upstream sync — the runbook

For a fork that is a real product (own commits, own release train) tracking a living
upstream. The invariants: upstream is never pushed to (guard it in a pre-push hook),
one sync = one merge commit, and the fork's local commits ride on top. Project
specifics (remote names, package layout, validate commands) come from the project's
docs — this is the shape of the work.

## 1. Triage the delta before merging

```
git fetch upstream
git log --oneline main..upstream/main
```

Read every commit subject and classify:

- **Code-only vs config/schema/dependency changes.** Diff-stat the sensitive paths
  (manifest/lockfiles, native or infra config, DB migrations). This decides the
  post-sync cost: hot-reloadable, rebuild-needed, or migration-bearing.
- **Work you already did fork-side.** A fix you ported ahead of upstream (or filed
  for upstream with a patch) will come back as a near-identical commit — expect a
  conflict whose resolution is "take upstream's side" so future syncs stay clean.
- **Surprises.** An unexpected commit (odd name, meta/tooling change) gets inspected
  (`git show`) before you merge it into a tree you ship from.

## 2. Merge mechanics

- `git merge --no-ff --no-commit upstream/main` — resolve, THEN commit once.
- **Install dependencies BEFORE the merge commit** (all workspaces the delta
  touches): commit hooks lint incoming files and fail on unresolved imports from
  packages that aren't installed yet.
- Name the merge commit for the round: what upstream work it brings, in issue/feature
  terms — the fork's history is read round-by-round later.

## 3. The recurring conflict shapes

Years of syncs produce the same four conflicts; recognize them on sight:

1. **Union objects** — a wide literal (a props/state/shell object) where the fork
   added keys on one side and upstream on the other. Resolution is the union: keep
   both key sets. Never drop a fork-only key to make the diff smaller.
2. **Moved/refactored declarations + fork-only members** — upstream extracts a type
   or module (e.g. splits a big type into its own file); the fork had added members to
   the old location. Take upstream's refactor, then **re-add the fork-only members in
   the new location**, commented as fork-only. Symptom of missing one: the type
   checker fails on fork code that consumes the member.
3. **Size-cap trips** — the union of both sides pushes a function/file past a lint
   budget (max-lines etc.) that neither side tripped alone. Fix by compacting
   mechanically (dense destructures, extracted helpers), never by weakening the rule.
   Note: pre-commit staged-file linting can pass while the package-level gate fails —
   run the full gate, don't trust the hook.
4. **Both-sides-identical** — the same fix landed on both sides (you ported it, they
   applied your patch). The conflict is often comment-only; take upstream's wording
   so the next sync is conflict-free.

Fork-only files (new scripts, fork-specific plugins/docs) never conflict — that's the
design reason to prefer additive fork changes over edits to shared files.

## 4. Gate, push, record

- Run the **full validate gate of every workspace the delta touched** — not just the
  one you resolved conflicts in.
- Pre-push guards (schema-drift checks etc.) false-positive on comment-only changes
  to watched files; a real schema change WITH its committed migration passes
  legitimately. Only bypass (`--no-verify`) after verifying the diff is what the
  guard mis-flagged, and never toward upstream.
- After pushing, run the project's post-sync verification (test suite, UAT round,
  device check) and record the round: what came in, what conflicted, how it was
  resolved. The record is what makes conflict shapes recognizable next time.

## 5. When NOT to merge

- **Never while an agent/test run is live on the same tree** — a merge mid-run
  mutates files under the runner (and with hot-reloading dev servers, mid-flow).
  Queue the sync behind the run.
- **Not before checking upstream moved again** — upstream may have advanced while
  you worked; fetch and re-read the delta immediately before merging, not from
  memory.
- Small, frequent syncs beat rare big-bangs: every shape in §3 gets worse
  superlinearly with delta size.

## Division of labor (fork model)

Shared feature work belongs upstream; the fork syncs it in. Fixes discovered
fork-side that touch shared code go upstream as a filed issue **with the
ready-to-apply patch** (the fork ships its copy immediately; §3.4 absorbs the echo).
If upstream owns deployment of shared backends, the fork never deploys or re-verifies
them — its gate is code-level parity only.

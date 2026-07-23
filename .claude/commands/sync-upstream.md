---
description: Pull curated framework updates UP from the godot source (arthur0n/xenodot-forge, "xenodot") into THIS xenomoon trunk. Human-gated and analysis-driven — review the incoming commits, merge on a throwaway sync branch, resolve each conflict by judgment (identity → bronze OURS; engine/godot payload → drop; seam files → keep our seam + upstream behavior), re-drop the SEAMS.md divergences, re-run the rebrand codemod, then run the agnostic gate + validate. Never pushes, never touches the trunk.
argument-hint: "[--from <remote>] [--branch <branch>] [--no-test]"
allowed-tools: Bash, Read, Edit
model: opus
---

# Sync upstream — pull the godot source's curated wins into our xenomoon trunk

This is the **UP** direction: the godot source (`arthur0n/xenodot-forge`, "xenodot") moves
all the time, and this repo — the agnostic **xenomoon** framework — rides only the curated,
domain-agnostic parts of it. The mechanical parts are deterministic (fetch, branch, the
rebrand codemod, the leakage gate, validate) — but the **merge is analysis, not a recipe**:
you decide, conflict by conflict, what is an agnostic framework win we take and what is
godot/engine/identity payload we drop. That judgment is why this is a command and not the
old blind `scripts/sync-upstream.sh`. See `docs/fork/SYNC.md` (the runbook) and
`docs/fork/SEAMS.md` (the conflict-surface contract + the intentional divergences).

> Direction check: this is `xenodot → xenomoon`. The **down** direction (framework → the
> consumers that ride it, e.g. xm-probius) is a different, consumer-shipped command,
> `/sync-framework`. Don't confuse them — this one is repo-local and never ships.

## The one rule the analysis serves

We track upstream closely but ship a **different product**: an agnostic framework with a
bronze "lunar" identity and **no engine payload**. So on every conflict:

- **Godot/engine payload → drop it.** No `.tscn`/`.gd`/`.import`/`.godot` files, no godot
  skills/agents/library, no godot-docs MCP. These have no value for our Node/web domains.
- **Identity (color/branding) → OURS, always.** Keep the bronze ringed-planet emblem +
  Lunar-Bronze / Moon-Gold palette + the brand word "XenomoonForge". NEVER take upstream's
  green alien-head emblem or alien-green palette (`.claude/CLAUDE.md` "Always" → Identity).
- **Agnostic framework wins → take them,** plus our rebrand + our behavioral seam edits.

Everything upstream-specific that we deliberately don't carry is enumerated in
`SEAMS.md` → "Intentional upstream divergences." That list is the re-drop checklist for
step 5 — the merge re-introduces those files by design (lineage is preserved), so each sync
re-drops them.

## Arguments

Parse `$ARGUMENTS`: `--from <remote>` (the godot source remote, default `upstream`),
`--branch <branch>` (default `main`), `--no-test` (skip the slow `npm run test:onboarding`
gate — faster, less safe; still runs validate). Let `REF = <remote>/<branch>`.

## Steps

1. **Preflight (deterministic — stop if it fails).** Confirm a clean tree
   (`rtk git status --porcelain` empty; if not, stop and tell the user to commit/stash).
   Confirm you're on the trunk (`rtk git branch --show-current` = `main`, our branded trunk);
   if not, stop. Resolve the remote: `rtk git remote get-url <remote>`. It MUST be a
   **`xenodot-forge`** repo (`arthur0n/xenodot-forge`) — the godot source we pull FROM. If it
   resolves to `arthur0n/xenomoon` (our own publish target) or this repo's `origin`, stop: that's
   the wrong direction (that's what `/sync-framework` is for downstream, and we never sync our own
   publish target back in). If the remote is missing, tell the user to add it
   (`git remote add upstream https://github.com/arthur0n/xenodot-forge.git`) and stop.

2. **Fetch + review the incoming work (ANALYZE — this is a checkpoint, not a rubber stamp).**
   `rtk git fetch <remote> <branch>`, then `rtk git log --oneline --reverse main..$REF` and
   `rtk git diff --stat main..$REF | tail -40`. If empty → already current, say so and stop.
   Otherwise **read** the commit list and triage what's landing into three buckets, and say so
   to the human before touching anything:
   - **Agnostic framework wins we want** — spine refactors, new CORE skills/hooks/MCP-tools, a
     test suite, security gates, self-improvement/framework-audit commands, Hermes/codex/graphify
     improvements. These are the point of the sync.
   - **Godot/engine payload we'll drop** — engine files, `godot-*` skills/agents, `godot-docs`,
     the game library. Cross-check against `SEAMS.md` "Intentional upstream divergences."
   - **Identity/branding hunks we resolve as OURS** — anything touching `ui/index.html`,
     `ui/agent-ui.css`, emblem/favicon assets, or the settings glyph.
     If a large release is landing (dozens of commits, thousands of lines), say so explicitly —
     the merge below will be a real analysis session, not a rubber stamp. Name anything that looks
     like it would regress our product (e.g. a re-pixel of the UI, a port change, a re-godot-ing).

3. **Branch — never touch the trunk.** `rtk git switch -C sync-upstream-<branch>`. All work
   happens here; `main` is only advanced by the human after they review this branch. (This is
   safer than the old script's merge-straight-onto-`main`, especially for a large release.)

4. **Merge, then resolve each conflict by JUDGMENT (the core analysis step).**
   `rtk git merge --no-ff $REF`. Expect **two kinds** of conflict and never blanket `-X`:
   list the unmerged files (`rtk git diff --name-only --diff-filter=U`) and decide each.
   - **Rebranded-identifier conflicts** (the common case): upstream edited a line that our
     committed rebrand had flipped `xenodot → xenomoon`. Keep **our xenomoon spelling + upstream's
     real change** on that line. Don't hand-fix every occurrence — resolve the substantive hunk,
     then step 6's `rebrand.mjs` re-flips any `xenodot` the merge re-introduced.
   - **Identity / color / branding** (`ui/index.html`, `ui/agent-ui.css`, emblem/favicon assets,
     settings glyph) → **OURS**: `rtk git checkout --ours -- <file>` then `rtk git add <file>`.
     Take upstream's structural/behavioral change by hand only if it's real and non-cosmetic, but
     every color/emblem/brand hunk stays bronze. Keep our settings glyph `⚙` (drop upstream's `🎛️`).
   - **Behavioral seam files** (the SHORT list in `SEAMS.md` "Upstream files we are allowed to
     edit": `package.json`, `ui/server/core/config.js`, `ui/server/core/http/project-state.js`,
     `ui/server/cli/{new,doctor,gen-manifest}.js`, `ui/server/features/skills/skill-registry.js`,
     `README.md`) → **keep our seam edit AND fold in upstream's real behavior change.** These
     resolve by hand, hunk by hunk — our domain-resolver hook stays, upstream's new logic lands
     around it. `README.md` stays fully OURS (our product's front page).
   - **Port** → OURS: `3117` in `ui/server/core/config.js` + `ui/smoke-test.js` (upstream defaults
     to `8338`). Our `start_server`/`stop_server` (`.xm-run/`) stay OURS.
     Show the human the conflict list and your per-file decision, then `rtk git commit` (no args —
     keep the merge message) to finish the merge.

5. **Re-drop the intentional divergences (SEAMS.md checklist — the merge re-introduced them).**
   The merge brings back everything we deliberately don't carry, because lineage is preserved.
   Re-drop each, per `SEAMS.md` "Intentional upstream divergences":
   - **godot-docs** (`plugin/agents/godot-docs-evangelist.md`, `plugin/skills/godot-docs/`,
     `ui/docs-block.md`, the `DOCS_*`/`getDocsConfig`/`mcp__godot-docs__*` wiring, the
     `@nuskey8/godot-docs-mcp` dep) — **KEEP** `ui/server/mcp-tools/ui-server.js`.
   - **godot skills/agents/library** — `plugin/skills/godot-*`, `plugin/agents/{game-designer,
level-designer,godot-*}.md`, and ALL of `plugin/library/` **EXCEPT** our two CORE files
     (`README.md`, `token-audits/LEDGER.md`). KEEP the domain-agnostic wins that shipped alongside
     (e.g. Hermes learning-nudges in `ui/server/mcp-tools/hermes-tool.js`).
   - **grep-usage-log hook** (`plugin/hooks/grep-usage-log.sh` + its `Bash|Grep` PreToolUse entry
     in `plugin/hooks/hooks.json`) — overlaps our `rtk-usage-log.sh`. KEEP `graphify-update.sh`.
   - **FEATURES.md**, **`starter/`**, **`ui/orchestrator.md`** — not carried (our layout differs).
     Watch for **new** godot-only content this release adds (grep the new files) and drop it too,
     then note it so `SEAMS.md`'s divergence list can be extended. Commit the re-drop.

6. **Re-run the rebrand codemod (deterministic — must end idempotent).**
   `node scripts/rebrand.mjs` to re-flip any `xenodot` the merge re-introduced, then
   `rtk git commit -am "rebrand: re-flip merged upstream"`. Prove it:
   `node scripts/rebrand.mjs --check` must exit 0. Then the invariant:
   `rtk git grep -i xenodot` must return **only** `arthur0n` provenance lines + the skipped
   `docs/fork/**` and `scripts/` machinery. Anything else = the rename map or a re-drop
   is incomplete — fix it and re-run.

7. **Agnostic gate (deterministic — run it, read the result, don't eyeball it).**
   `rtk npm run check:agnostic`. It exits non-zero and prints offenders if godot engine files,
   game role-map keys, or hardcoding leaked into the spine. If it fails, that's a resolution or
   re-drop mistake from steps 4–5 — fix those files and re-run until clean. Never route around it.

8. **Validate + tests (deterministic — must pass).** `rtk npm run validate` (tsc + eslint
   zero-warnings + structure + skill-scope), then `XENOMOON_DOMAIN=webapp rtk npm run test`
   (reducer + skills — needs a bound domain), and unless `--no-test`,
   `rtk npm run test:onboarding` (7/7 — the godot-free clean-install regression). If anything
   fails, fix what the merge broke before handing off.

9. **Report + hand off (STOP — never push, never fast-forward the trunk).** Summarize: how
   many commits pulled + the release version, which wins we took, which divergences we re-dropped,
   which identity/seam conflicts and how each resolved, rebrand `--check` = idempotent, gate =
   clean, validate + tests = green. Tell the human the `sync-upstream-<branch>` branch is ready and
   THEY advance the trunk + publish:
   ```
   git switch main && git merge --ff-only sync-upstream-<branch>
   gh auth switch --user Pexelins            # publish goes out as Pexelins (repo-local cred pin)
   git push xenomoon main                    # the ONLY allowed target; pre-push hook blocks xenodot-forge
   ```
   This command's authority ends at the sync branch.

## Never

- **Never push** and never fast-forward/merge into `main` — your output is the sync branch for
  the human to review. Publishing (`git push xenomoon main`) is theirs. (The `.husky/pre-push`
  hook is the backstop: it hard-blocks any push to a `xenodot-forge` repo — the source and our
  fork-of-it alike — but this command never pushes at all.)
- **Never blanket `-X theirs`/`-X ours`.** Resolve conflicts file-by-file with visible reasoning —
  that analysis is the whole point of using a command here instead of the old script.
- **Never take upstream's identity.** Every color/emblem/brand/favicon hunk resolves as OURS
  (bronze). Reintroducing the green alien identity is a hard regression (`.claude/CLAUDE.md`).
- **Never carry the engine/godot payload.** Re-drop the `SEAMS.md` divergences every sync; the
  agnostic gate (step 7) is the tripwire — never silence it.
- **Never leave the tree half-rebranded.** `node scripts/rebrand.mjs --check` must exit 0 and
  `git grep -i xenodot` must show only the denylisted `arthur0n`/docs/scripts lines.

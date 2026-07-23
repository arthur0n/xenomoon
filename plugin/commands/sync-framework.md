---
description: Pull framework updates DOWN into this consumer repo (a domain test like xm-probius, or a project's spine). Human-gated and analysis-driven — review the incoming commits, merge on a throwaway sync branch, resolve each conflict by judgment (spine/identity/pack → theirs), then run the deterministic agnostic gate + validate. Never pushes, never touches the trunk.
argument-hint: "[--from <remote>] [--branch <branch>] [--project <name>]"
allowed-tools: Bash, Read, Edit
model: opus
---

# Sync framework — ride the framework's updates without re-forking it

The framework (`arthur0n/xenomoon`) moves all the time; a consumer rides those updates
with this command. The mechanical parts are deterministic (fetch, branch, the leakage
gate, validate) — but the **merge is analysis, not a recipe**: you decide, conflict by
conflict, what is the agnostic framework's to win and what is a genuine local fix to keep.
That judgment is why this is a command and not a script. See `docs/fork/DOWNSTREAM.md`.

## The one rule the analysis serves

The framework spine + domain packs are **agnostic** and the framework owns them — a consumer
must not fork them into a project-specific variant. A project's facts (stack, conventions,
commands, tenancy) live in the **project's own `CLAUDE.md`**, never baked into `domains/` or
the spine. So on conflict the framework's version (theirs) almost always wins; the rare
exception is a real spine bug you fixed locally and mean to upstream.

## Arguments

Parse `$ARGUMENTS`: `--from <remote>` (the framework remote, default `upstream`),
`--branch <branch>` (default `main`), `--project <name>` (the bound project, e.g. `lexflow` —
feeds the gate's hardcoding tripwire). Let `REF = <remote>/<branch>`.

## Steps

1. **Preflight (deterministic — stop if it fails).** Confirm a clean tree
   (`rtk git status --porcelain` empty; if not, stop and tell the user to commit/stash).
   Resolve the remote: `rtk git remote get-url <remote>`. It MUST be the framework
   (`arthur0n/xenomoon`) — if it's a `xenodot-forge` URL (the godot source) or this repo's
   own origin, stop: that's the wrong direction. If the remote is missing, tell the user to
   add it (`git remote add upstream https://github.com/arthur0n/xenomoon.git`) and stop.

2. **Fetch + review the incoming work (ANALYZE — this is a checkpoint, not a rubber stamp).**
   `rtk git fetch <remote> <branch>`, then `rtk git log --oneline --reverse HEAD..$REF`.
   If empty → already current, say so and stop. Otherwise **read** the commit list and skim
   `rtk git diff --stat HEAD..$REF`: what's landing — spine refactor, new CORE skill/hook,
   domain-pack change, identity? Summarize it for the human before you touch anything. If
   anything looks like it would regress this consumer, name it now.

3. **Branch — never touch the trunk.** `rtk git switch -C sync-framework-<branch>`. All work
   happens here; the trunk is only updated by the human after they review this branch.

4. **Merge, then resolve each conflict by JUDGMENT (the core analysis step).**
   `rtk git merge --no-ff $REF`. If it conflicts, do **not** blanket `-X theirs` — list the
   unmerged files (`rtk git diff --name-only --diff-filter=U`) and decide each:
   - **Spine** (`ui/**`), **identity** (`ui/index.html`, `ui/agent-ui.css`, emblem/favicon
     assets), **domain pack** (`domains/<name>/**`), **CORE plugin** (`plugin/**`) → the
     framework wins: `rtk git checkout --theirs -- <file>` then `rtk git add <file>`.
   - **A genuine local framework bug-fix** you intend to keep (e.g. an ENOENT guard the
     framework lacks) → keep ours for that hunk, and note it so it gets filed upstream — a
     consumer-local patch that never goes up will re-conflict every sync.
   - Anything **project-specific** that crept into a tracked framework file → strip it; it
     belongs in the project's own `CLAUDE.md`.
     Show the human the conflict list and your per-file decision, then `rtk git commit` to
     finish the merge.

5. **Agnostic gate (deterministic — run it, read the result, don't eyeball it).**
   `bash "$CLAUDE_PLUGIN_ROOT/../scripts/check-spine-agnostic.sh"` (add `--project <name>` if
   given). It exits non-zero and prints offenders if game/godot identity or the project's name
   leaked into the spine. **If the script isn't present** — a consumer adopting `/sync-framework`
   for the first time receives both the command and the gate via this very sync — run the same
   three checks inline: engine payload `rtk git ls-files -- '*.tscn' '*.gd' '*.import' '*.godot'`
   (any output = leak); game role-map keys
   `rtk git grep -nIE '"(game|level)-designer"[[:space:]]*:' -- '*.js'` (any hit = leak); and with
   `--project <name>`, hardcoding `rtk git grep -nIE '<name>' -- domains plugin ui/server`. If it
   fails, that's a resolution mistake from step 4 — fix those files (take theirs / remove the
   project string) and re-run until clean. Never route around it.

6. **Validate (deterministic — must pass).** `rtk npm run validate`. If it fails, fix what the
   merge broke before handing off.

7. **Report + hand off (STOP — never push, never fast-forward the trunk).** Summarize: how
   many commits pulled, which conflicts and how you resolved each, gate = clean, validate =
   green. Tell the human the `sync-framework-<branch>` branch is ready and THEY merge it into
   the trunk and publish. This command's authority ends at the sync branch.

## Never

- **Never push** and never fast-forward/merge into the trunk branch — your output is the sync
  branch for the human to review. Publishing is theirs.
- **Never blanket `-X theirs`/`-X ours`.** Resolve conflicts file-by-file with visible
  reasoning — that analysis is the whole point of using a command here.
- **Never resolve a spine/identity/pack conflict as OURS** to preserve a consumer's flavor —
  that re-forks the agnostic framework. Theirs wins; project facts live in the project's CLAUDE.md.
- **Never silence the gate** (no skipping `check-spine-agnostic.sh`, no `--no-validate` hack) —
  if it fails, scrub the leak.
- **Never bake project specifics into a tracked framework file.**

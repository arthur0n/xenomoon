---
name: framework-sync
agents: [orchestrator]
domain: universal
description: Pull framework updates DOWN into this consumer repo — review the incoming commits, merge on a throwaway branch, resolve every conflict by judgement (spine, identity and packs go to the framework), then run the agnostic gate and validate. Never pushes, never touches the trunk. Load when syncing an install with the framework, or when a sync left conflicts to resolve.
---

# Riding the framework's updates without re-forking it

The framework moves; a consumer rides those updates rather than drifting away from them. The
mechanical parts are deterministic — fetch, branch, gate, validate — but **the merge is analysis,
not a recipe.** You decide, conflict by conflict, what is the framework's to win and what is a
genuine local fix worth keeping. That judgement is why this is not a script.

## The one rule the analysis serves

**The spine and the domain packs are AGNOSTIC, and the framework owns them.** A consumer must not
fork them into a project-specific variant. A project's facts — its stack, conventions, commands,
tenancy — live in the project's own `CLAUDE.md`, never baked into a tracked framework file.

So on conflict, **theirs almost always wins.** The rare exception is a real framework bug you fixed
locally and intend to send upstream.

## 0. What you are syncing, exactly

Three inputs, each with a default, because a sync that guesses its own source is not reproducible
and the branch it hands over cannot be reviewed against anything:

| input     | default    | what it is                                                           |
| --------- | ---------- | -------------------------------------------------------------------- |
| `from`    | `upstream` | the remote holding the framework                                     |
| `branch`  | `main`     | the branch on that remote                                            |
| `project` | —          | the bound project's name, which feeds the gate's hardcoding tripwire |

`REF` is `<from>/<branch>` throughout. **Never infer the branch from context** — say which you are
using, in the summary, before you merge anything.

## 1. Preflight — deterministic, and it stops the run

- Clean tree (`git status --porcelain` empty). Not clean → stop and have it committed or stashed.
- Resolve the remote (`git remote get-url <remote>`, default `upstream`). **It must be the
  framework.** Pointing at this repo's own origin, or at the engine source the framework was forked
  from, means the sync is running in the wrong direction — stop. Missing remote → say how to add it,
  and stop.

## 2. Fetch, then READ what is landing

`git fetch <remote> <branch>`, then `git log --oneline --reverse HEAD..<remote>/<branch>`. Empty
means already current — say so and stop.

Otherwise skim `git diff --stat HEAD..<remote>/<branch>` and **summarise it for the human before
touching anything**: spine refactor, a new CORE skill or hook, a pack change, identity. If something
looks like it would regress this consumer, name it now, not after the merge.

This step is a checkpoint, not a rubber stamp. A sync that surprises the human afterwards was not
reviewed.

## 3. Branch — never the trunk

`git switch -C sync-framework-<branch>`. All work happens there. The trunk is updated by the human,
after they review it.

## 4. Merge, and resolve each conflict by judgement

`git merge --no-ff <remote>/<branch>`. On conflict, **never blanket `-X theirs` or `-X ours`.** List
the unmerged files (`git diff --name-only --diff-filter=U`) and decide each one:

| what conflicted                                                                                                                                            | resolution                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| the spine (`ui/**`), the framework's identity (its index page, stylesheet, emblem/favicon assets), a domain pack (`domains/<name>/**`), CORE (`plugin/**`) | **theirs** — `git checkout --theirs -- <file>` then `git add <file>`                                                                   |
| a genuine local framework bug-fix you mean to keep (an ENOENT guard the framework lacks, say)                                                              | keep ours for that hunk, **and note it for upstreaming** — a consumer-local patch that never goes up re-conflicts on every single sync |
| anything project-specific that crept into a tracked framework file                                                                                         | strip it. It belongs in the project's own `CLAUDE.md`                                                                                  |

Show the human the conflict list and your per-file decision, then commit to finish the merge.

## 5. The agnostic gate — run it, read it, never eyeball it

**Run it from the repo ROOT, not from wherever you happen to be:**

```bash
cd "$(git rev-parse --show-toplevel)" && bash scripts/check-spine-agnostic.sh --project <name>
```

A relative path resolves against the current directory, so from any subdirectory the script "is not
present" even though it is — and you would fall through to the weaker fallback below at exactly the
step that is supposed to be deterministic. The script exits non-zero and prints offenders when
engine identity or the project's own name has leaked into the spine.

**Only if the script genuinely does not exist** — a consumer adopting this flow for the first time
receives both the skill and the gate through this very sync — run these three inline, from the root:
engine payload (`git ls-files -- '*.tscn' '*.gd' '*.import' '*.godot'`, any output is a leak); game
role-map keys (`git grep -nIE '"(game|level)-designer"[[:space:]]*:' -- '*.js'`, any hit is a leak);
and hardcoding (`git grep -niE '<name>' -- domains plugin ui/server`, case-insensitive).

**Say in the report that you used the fallback.** It is a weaker check than the script: the script
derives the project's terms from `.xenomoon.json` rather than taking one name you passed it, so the
inline version misses every term you did not think to type. Once the sync lands, the script is there
— re-run the real gate before the human merges.

A failure here is a resolution mistake from step 4 — take theirs, or remove the project string, and
re-run until clean. **Never route around it.**

## 6. Validate

`npm run validate`. If it fails, fix what the merge broke before handing anything off.

## 7. Report, and STOP

How many commits came in · which files conflicted and how you resolved each · gate clean · validate
green · the branch name. Then tell the human the branch is ready and **they** merge and publish.

**Your authority ends at the sync branch.**

## Never

- **Never push, and never fast-forward or merge into the trunk.** Publishing is the human's.
- **Never blanket `-X theirs` / `-X ours`.** File-by-file, with visible reasoning — that analysis is
  the entire reason a model does this instead of a script.
- **Never resolve a spine, identity or pack conflict as OURS** to preserve a consumer's flavour.
  That is how a fork starts.
- **Never silence the gate**, and never bake project specifics into a tracked framework file.

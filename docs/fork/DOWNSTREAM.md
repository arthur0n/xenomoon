# Downstream sync — push the framework DOWN into the tests/projects that ride it

`SYNC.md` covers the **up** direction (pulling the godot _source_ into the framework).
This covers the **down** direction: pulling the **framework** into the repos that consume it.
The framework moves all the time; consumers ride it with the `/sync-framework` command
(deterministic mechanics, human-gated analysis of the merge — not a blind script).

## The three tiers (each link is one-way, fetch-only)

```
arthur0n/xenodot-forge        the GODOT product — engine, .tscn/.gd, alien-green identity
        │  fetch only · curated, domain-agnostic bits only · rebrand on the way in
        │  (the /sync-upstream command + scripts/rebrand.mjs — see SYNC.md)
        ▼
arthur0n/xenomoon  (= this repo's `main`)   the agnostic FRAMEWORK — bronze "lunar" identity,
        │                                    domain-agnostic spine, CORE plugin/ + domain packs
        │  fetch only  (the /sync-framework command)
        ▼
xm-probius, <other projects' spines>   the CONSUMERS — framework + ONE active domain, pointed
                                        at a real project; project facts stay in the project
```

**upstream is only for godot.** `arthur0n/xenodot-forge` is the engine product. We never push to it
(the `pre-push` hook blocks it) and we pull only curated, domain-agnostic updates — the engine
payload never lands. Identity/color hunks always resolve as OURS (bronze), per `.claude/CLAUDE.md`.

**The framework is updated all the time.** Spine refactors, new CORE skills/hooks, agnostic
domain-pack improvements — they land here on `main` and publish to `arthur0n/xenomoon`. Consumers
do not re-derive them; they re-sync.

## xm-probius — the ongoing test

**xm-probius is the live test of the framework**, not a separate product. It is the framework with
the `webapp` domain active, bound to a real project (`probius/lexflow`, a React + tRPC/Lambda app).
We use it to exercise the issue-driven pipeline against real work and to find what the framework
still gets wrong.

Because it is a _consumer_, two rules hold:

1. **The spine + domain pack track the framework — take THEIRS on conflict.** A consumer must not
   fork `domains/<name>/` into a project-specific variant (that was the LexFlow-hardcoded mistake the
   first sync undid). The pack is a generic head start; it reads the project's own `CLAUDE.md` for
   stack, conventions, commands, and tenancy. Project facts live in `probius/lexflow/CLAUDE.md`, never
   in the framework. (`.claude/CLAUDE.md`: "Never put project-specific files in the framework.")
2. **Local framework fixes flow back UP, not sideways.** If the test surfaces a real spine bug (e.g.
   `saveSkillSetup` needing `mkdir -p` before write), fix it, then file it into the framework so the
   next `/sync-framework` is conflict-free. Don't let consumer-local patches accumulate.

## Routine downstream sync

In the consumer repo (e.g. xm-probius, where `upstream` = arthur0n/xenomoon = the framework),
run the slash command and let it walk the steps with you:

```
/sync-framework --project lexflow
```

It fetches the framework, shows you the incoming commits, merges on a throwaway
`sync-framework-main` branch, resolves each conflict by judgment (spine/identity/pack → theirs),
runs the deterministic gate (`scripts/check-spine-agnostic.sh`, also `npm run check:agnostic`) +
`npm run validate`, and stops. It never pushes and never touches the trunk — you review the sync
branch and merge it yourself:

```bash
git switch main && git merge --ff-only sync-framework-main
```

`--project <name>` fails the gate if the project's name is baked into the spine — the tripwire for
rule 1. The gate also fails on any game/godot identity (`game-designer`, `blockout`, `.tscn`, the
engine payload). See `SEAMS.md` for the intentional divergences the up-sync preserves.

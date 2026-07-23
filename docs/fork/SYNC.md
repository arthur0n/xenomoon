# Upstream sync — pull framework changes in, never push back

> This is the **up** direction (godot source → framework). For the **down** direction
> (framework → the tests/projects that consume it, e.g. xm-probius) see
> [`DOWNSTREAM.md`](DOWNSTREAM.md) + the `/sync-framework` command.

This repo is a **fork** of the framework **`arthur0n/xenodot-forge`**. The relationship is
**one-way**: we **only ever fetch** from the source to pull its (curated) improvements into our own
product, **xenomoon**. We **never push to any `xenodot-forge` repo** — a `pre-push` hook
(`.husky/pre-push`) hard-blocks any push whose target URL contains `xenodot-forge` (the source
`arthur0n/xenodot-forge` **and** our GitHub fork-of-it `Pexelins/xenodot-forge`). Our one publish
target is the `xenomoon` remote.

## Branch & repo model

| Branch | Role                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `main` | **Our xenomoon trunk** — branded end-to-end; what we develop, run, and publish. The `scripts/rebrand.mjs` codemod is **committed** here. |

We keep **no** local upstream-mirror branch (the old `forge` trunk + pristine-`main` split is
retired — `main` is now the trunk). When syncing, `upstream/main` is read directly.

Remotes:

```
xenomoon  https://github.com/arthur0n/xenomoon.git        OUR repo — the ONLY push target
origin    https://github.com/Pexelins/xenodot-forge.git   our fork-of-the-source — FETCH/backup ONLY (push blocked: a xenodot-forge repo)
upstream  https://github.com/arthur0n/xenodot-forge.git   the forked source — FETCH ONLY, never push
```

> Pushes from this repo go out as **Pexelins** via a repo-local credential pin in `.git/config`
> (it overrides the machine keychain, which may hold another account's token) and target the
> `xenomoon` remote only. The pre-push hook is the backstop: it blocks any push to a `xenodot-forge`
> repo — the `upstream` source and the `origin` fork-of-it alike.

> The trunk is rebranded (xenomoon) and the rebrand is **committed**. `scripts/rebrand.mjs` is a
> **post-merge fixer**: after merging upstream's xenodot into our xenomoon trunk, re-run it to
> rebrand the newly-arrived xenodot, then resolve the overlaps.

## Routine sync (pull upstream improvements in)

Drive it with the **`/sync-upstream`** command (repo-local, analysis-driven — it replaced the
old blind `scripts/sync-upstream.sh`). It fetches the source, shows you the incoming commits,
merges on a throwaway `sync-upstream-main` branch, resolves each conflict by judgment (identity
→ bronze OURS; engine/godot payload → drop; seam files → keep our seam + upstream behavior),
re-drops the `SEAMS.md` divergences, re-runs the rebrand codemod, runs the agnostic gate +
validate + onboarding, and STOPS. It never pushes and never touches the trunk.

```
/sync-upstream                 # from = upstream, branch = main; --no-test to skip onboarding
```

Then you review the sync branch and advance + publish yourself:

```bash
git switch main && git merge --ff-only sync-upstream-main
gh auth switch --user Pexelins        # publish goes out as Pexelins (repo-local cred pin)
git push xenomoon main                # the ONLY allowed target; pre-push hook blocks xenodot-forge
```

Under the hood the command runs, in order: `git fetch upstream` → branch → `git merge --no-ff
upstream/main` → resolve + re-drop divergences → `node scripts/rebrand.mjs` (+ `--check`) →
`npm run check:agnostic` → `npm run validate` + `npm run test` + `npm run test:onboarding`.

## Conflicts

A merge conflict appears where upstream edited a line we also changed (a rebranded identifier, or a
seam listed in `SEAMS.md`). Resolve to keep our xenomoon version **plus** upstream's real change,
then re-run the codemod so nothing is left half-xenodot. The denylist (`arthur0n` lines,
`docs/fork/**`, `scripts/` machinery) is preserved automatically.

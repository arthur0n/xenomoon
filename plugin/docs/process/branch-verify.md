# Branch forensics — proving what a branch actually holds

For any agent doing branch surgery: cleanup verdicts, containment checks, deploy
verification. Every rule here was paid for in a live project (2026-08: 26 dead
branches, a deploy red for 11 days behind green PR gates).

## Containment is proven by CONTENT, never by `--merged`

`git branch --merged` LIES in a squash-merge repo — the squashed commit on the target
has a different hash, so a fully-landed branch reports as unmerged forever. Prove
containment instead:

```bash
rtk proxy git cherry origin/<prod> <branch>   # every line `-` → patch-equal upstream
rtk proxy git diff origin/<prod>...<branch>   # empty → nothing unique
```

A branch once reported `+` (unmerged) from `git cherry` yet was byte-identical to the
target on every file it touched — when cherry and the diff disagree, per-file two-dot
diffs (`git diff origin/<prod>..<branch> -- <file>`) are the final authority.
**Never delete a branch you cannot prove contained.**

## Three-dot diffs INFLATE

`git diff <prod>...<branch>` shows everything since the merge-base — commits that
belong to OTHER merged work show up as if the branch owned them (430 phantom
insertions in the live case). Before believing a branch holds unique work, confirm
with two-dot per-file comparison.

## Squash-merge subjects carry `(#PR)`

Squash-merging appends the PR number to the commit subject. Anything that parses
`#N` out of commit messages MUST classify PR vs issue — this exact gap crashed a
deploy gate and blocked every deploy. A rule a CI refactor could silently drop needs
a TEST pinning it, or it will be dropped again.

## A green PR gate says NOTHING about deploy health

PR checks and the deploy workflow are different pipelines; one was red for 11 days
while every PR stayed green. After any merge/push to the deploying branch, check the
LAST COMPLETED run's conclusion — once, never polling an in-flight run:

```bash
rtk proxy gh run list --workflow=<deploy>.yml --branch=<prod> --status=completed \
  --limit=1 --json conclusion,headSha,displayTitle
```

Fail on any non-success conclusion. "Merged" is not a receipt; the deploy conclusion is.

## Exact output matters here

`rtk` compacts git/gh output and can corrupt this analysis. Use `rtk proxy git …` /
`rtk proxy gh …` (raw passthrough) for cherry, diff, log, and run-list wherever the
verdict depends on exact bytes.

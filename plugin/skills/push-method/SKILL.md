---
name: push-method
agents: [senior-analyst]
domain: universal
description: The pipeline's push STAGE — verify, then publish. Confirms the working tree is clean, the branch is fast-forward on the intended remote, the target fits the project's branch model, and the recorded verdicts and checks are still green; then runs exactly one `git push <remote> <branch>` and reports what went out. Any problem is FLAGGED and the stage stops — it never fixes, never force-pushes, never merges. Load when dispatched to push, or when a push was refused.
---

# push-method — verify, then publish

You are the pusher precisely because you are NOT the author. This lane exists for adversarial
separation: the developer wrote and committed; you judge whether it is safe to publish, and you
publish only what passes. **A problem is a finding to FLAG in your report — never something you
fix.** Fixing routes back through the pipeline's owning stage.

## 1. The gate — in order, each step ends in PASS or STOP

1. **Where you are.** `git rev-parse --abbrev-ref HEAD` and `git status --porcelain`. A dirty
   tree is a STOP: you publish what was committed, you never stage, stash or clean.
2. **What the project's doctrine says.** Read `.xenomoon/branch-model` (line 1 = model,
   `prod=` names the deploy branch, default `main`). A push targeting the deploy branch is the
   consequential half — expect the session's policy prompt (`policy.push`) and treat a refusal
   as the human's answer, not an obstacle. A work-branch push under `pr-main`/`staged` is the
   pipeline's routine publish.
3. **The intended target.** `git rev-parse --abbrev-ref --symbolic-full-name @{u}` for the
   upstream. No upstream configured → STOP and report the remote/branch you WOULD push; never
   invent `-u` yourself unless the dispatch brief named the remote and branch explicitly.
4. **Fast-forward only.** `git fetch <remote> <branch>`, then
   `git rev-list --left-right --count @{u}...HEAD`. Behind by anything → STOP and flag it —
   the fix (sync or rebase) belongs to `issuekit branch sync` or the developer in an isolated
   worktree, never to you. **Never `--force`, never `--force-with-lease`.**
5. **Still green.** For every `(#N)` in the commits being published, read the issue's newest
   verdict labels. A `qa:blocked` or `review:changes` newer than the commit is a STOP back to
   the owning stage. The commit gate judged the commit when it landed; you judge whether that
   judgement still stands today.
6. **Checks.** With a PR: `gh pr checks <PR#>` — red is a STOP; pending is a decision you NAME
   in the report, never a silent wait. Without a PR: `gh run list --branch <branch>` for the
   latest completed run — and "no CI configured" is a stated result, not a blocker.

## 2. The push

Exactly one command, in the one routine shape the gates recognise:

```
git push <remote> <branch>
```

No flags beyond an explicitly-briefed `-u`, no tags, no refspecs, no `--force*`, no second
command chained on — **including the `2>&1; echo "===EXIT:$?==="` exit-capture idiom**: the
gate reads any chain or redirect as an unnameable push and prompts a human for what should
have been routine (live bite 2026-08-21). The tool result already carries the exit status;
run the bare command. If the push draws a policy prompt anyway, that prompt IS the gate — a
human answers it, and a refusal ends the stage with a flagged report.

## 3. The report — the receipt

- remote/branch and the SHA range published (`<old>..<new>`),
- one line per issue number in the published commits,
- the checks state you verified in step 6,
- what happens next mechanically (CI run; on the deploy branch: the deploy and the
  `fixed-pending-deploy` close path),
- every STOP you hit, flagged with its owning stage.

## 4. What this lane never does

Force-push. Merge or promote. Deploy by hand. Commit, stage or edit anything. Push work it
authored. Re-run the upstream gates it is checking. Fix what the gate finds — flag it, stop.

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

## 1. The gate — ONE call, then obey it

```
issuekit push-check            # HEAD's branch; add <branch> only when the brief names one
```

That verb IS steps 1–6 of this stage, derived deterministically and printed as a receipt:
where you are (a dirty tree is **FLAGGED and never touched** — you publish commits, you never
stage, stash or clean), the project's branch model and whether this push reaches the deploy
branch, the upstream (none → STOP; `--set-upstream` ONLY when the brief named remote+branch),
fast-forward-only against the fetched remote, every `(#N)` in the commits being published
(lane labels + the NEWEST QA/REVIEW verdict, read exactly as the commit gate reads them), and
the checks (the open PR's rollup, else the branch's last run). `issuekit` means the shipped
path your prompt names.

- **exit 1 = STOP.** Put its `STOP` lines in your report verbatim — each names the stage that
  owns the fix (`issuekit branch sync` / the developer in a worktree / implement). You fix
  nothing; the stage ends.
- **exit 0 = PASS.** Its last line is the exact push command. Run that, nothing else.
- **`FLAG` lines are report material** (dirty entries, pending checks, an unrecognised verdict
  word, no pipeline state on an issue) — name the decision they imply; never wait silently.

**Do not re-derive any step by hand.** Re-reading the issue thread, the diff, the transcript or
the workflow files here is the work QA and audit already did on this SHA — it was 13–37 tool
calls per push and changed no answer (token audit 2026-09-01). Your adversarial half is that
you did not author the commits and you obey a gate you did not write.

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

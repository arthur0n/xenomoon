---
name: worktree-discipline
agents: [developer]
domain: universal
description: Git surgery — rebases, merge-conflict resolution, splitting commits — happens in an ISOLATED worktree, never in the user's checkout. Their uncommitted work is never staged, stashed, parked or reset. Load before any git operation beyond add/commit on your own change.
---

# Git surgery happens in an isolated worktree

The user's checkout is theirs. It holds work in progress you cannot see the value of, and the
destructive verbs (`reset`, `checkout <path>`, `stash`, `clean`) are gated framework-wide precisely
because an agent once ran them "to clean the baseline" and destroyed an entire uncommitted build.

So when the slice is git work — rebase a PR branch, resolve merge conflicts, split or reorder
commits — do all of it somewhere else:

```bash
git worktree add ../wt-<slug> <branch>   # a separate checkout of the same repo
cd ../wt-<slug>                          # do EVERY step here
# … rebase / resolve / commit …
git push origin <branch>
cd -                                     # back to the user's checkout, untouched
git worktree remove ../wt-<slug>
```

## The rules

- **Never** stage, stash, park, reset or check out anything in the user's working tree. Not "just
  to try it", not "I'll restore it after" — the restore is the step that fails.
- **Work from `origin/<branch>`** in the worktree, so you are resolving against what the remote
  actually has rather than a local state that may be stale.
- **Remove the worktree when done.** A left-behind worktree makes the next `git worktree list`
  ambiguous and eventually blocks a branch delete.
- **Never force-push** unless the brief explicitly says so, and say that you did.
- A **stale local branch in the user's checkout is their concern** — mention it as an FYI, never
  "fix" it by moving their HEAD.

## Prefer the tool over raw git

Where the project's tracker CLI has a verb for it, use the verb — it does the operation server-side
and touches nothing local:

- stale PR branch → `issuekit pr update <PR#>` (merges base in server-side, re-fires checks)
- stale local branch → `issuekit branch sync <name>` (safe pointer move; refuses when checked out)

Reach for a worktree only for what those verbs cannot do: a real conflict resolution that needs a
human-grade merge, or history surgery the brief asked for.

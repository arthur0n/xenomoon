#!/usr/bin/env bash
# PreToolUse(Bash) guard: block destructive / working-tree-discarding git for ALL callers
# (subagents AND the main session). A refactor agent once ran `git checkout <file>` + `git stash`
# to "clean the baseline" and destroyed an entire uncommitted build — this prevents a recurrence.
#
# Blocks:  git reset | checkout | restore | stash | clean   (also when rtk-prefixed or in an && chain)
# Allows:  git status | diff | log | show | add | commit | push | pull | fetch | switch | branch ...
#          (commit/push don't discard work; use `git switch -c` to create branches)
# ASKS:    a SINGLE explicit-pathspec `git checkout <file>` / `git restore <file>` — the one
#          legitimate destructive case (restoring a known-noise file like a dirtied lockfile to
#          its committed state). Human approval IS the gate: the command must be the whole line
#          (no chaining), every arg a plain path (no flags, no `.`, no globs). Everything broader
#          stays a hard deny.
#
# Reads the PreToolUse payload on stdin; emits a decision (exit 0) only on a match.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+(reset|checkout|restore|stash|clean)([[:space:]]|$)'; then
  # Escape hatch: whole command is one checkout/restore with explicit file pathspecs only.
  if printf '%s' "$cmd" | grep -Eq '^[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(checkout|restore)([[:space:]]+--)?([[:space:]]+[A-Za-z0-9_./][A-Za-z0-9_./-]*)+[[:space:]]*$' &&
    ! printf '%s' "$cmd" | grep -Eq '[;&|<>]' &&
    ! printf '%s' "$cmd" | grep -Eq '[[:space:]]\.([[:space:]]|$)'; then
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Single-file git checkout/restore DISCARDS uncommitted changes to the named path(s), restoring the committed version. This is the one destructive-git form allowed with explicit human approval (e.g. restoring a dirtied lockfile). Confirm only if losing the working-tree edits to these exact files is intended."}}'
    exit 0
  fi
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Destructive git is blocked by Xenomoon Forge safety policy. git reset/checkout/restore/stash/clean discard or rewrite uncommitted working-tree changes and once wiped an entire uncommitted build. Use read-only git (status/diff/log/show), `git switch -c` to branch; add/commit/push are allowed. The ONE exception: a single un-chained `git restore <file>` with explicit file paths surfaces a human approval prompt. Anything broader: ask the human to run it."}}'
fi
exit 0

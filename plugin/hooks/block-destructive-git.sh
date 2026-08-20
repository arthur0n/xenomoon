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

# The deny below names `issuekit`, and a terminal session has no prompt block telling it which one.
# Sourcing is best-effort: a missing helper must never cost this guard its deny, so a fallback note
# stands in. (Defined BEFORE the source so the source can override it, not the other way round.)
issuekit_note() { printf ' (`issuekit` means the copy shipped with this framework.)'; }
# shellcheck source=./issuekit-path.sh
. "$(dirname "$0")/issuekit-path.sh" 2>/dev/null || true

decision() { # $1 = allow|deny|ask, $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}' \
    "$1" "$(printf '%s' "$2" | jq -Rs .)"
}
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+(reset|checkout|restore|stash|clean)([[:space:]]|$)'; then
  # Escape hatch: whole command is one checkout/restore with explicit file pathspecs only.
  if printf '%s' "$cmd" | grep -Eq '^[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(checkout|restore)([[:space:]]+--)?([[:space:]]+[A-Za-z0-9_./][A-Za-z0-9_./-]*)+[[:space:]]*$' &&
    ! printf '%s' "$cmd" | grep -Eq '[;&|<>]' &&
    ! printf '%s' "$cmd" | grep -Eq '[[:space:]]\.([[:space:]]|$)'; then
    decision ask "Single-file git checkout/restore DISCARDS uncommitted changes to the named path(s), restoring the committed version. This is the one destructive-git form allowed with explicit human approval (e.g. restoring a dirtied lockfile). Confirm only if losing the working-tree edits to these exact files is intended."
    exit 0
  fi
  decision deny "Destructive git is blocked by Xenomoon Forge safety policy. git reset/checkout/restore/stash/clean discard or rewrite uncommitted working-tree changes and once wiped an entire uncommitted build. Pipeline work NEVER needs the user's checkout moved — the internal tool carries the convention: stale PR branch → \`issuekit pr update <PR#>\` (merges base in server-side, re-fires checks, touches nothing local); stale local branch → \`issuekit branch sync <name>\` (safe pointer move, refuses when checked out).$(issuekit_note) Only for real conflict resolution: work from origin/<branch> in an isolated worktree (git worktree add). A stale local branch is the human's own concern — mention it as FYI, never escalate it as a blocker. Read-only git, git switch -c, add/commit/push stay allowed; a single un-chained \`git restore <file>\` with explicit paths surfaces a human approval prompt."
fi
exit 0

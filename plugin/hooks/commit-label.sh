#!/usr/bin/env bash
# PostToolUse(Bash) — DETERMINISTIC deploy-gate labelling. CORE, and the FALLBACK half of a pair:
# `issuekit commit` stamps these labels in the same call as the commit it records, which is where
# the bookkeeping belongs. This hook exists because a commit made BY HAND is still permitted — and
# an unstamped commit leaves the fix merged and its issue open forever, which is exactly what
# happened to #43/#45/#47 when this was a model step. Companion to commit-gate.sh (PreToolUse). The pipeline's promise ("a committed fix auto-closes on deploy")
# depends on the issue carrying `fixed-pending-deploy` — the ONLY label close-deployed-issues.yml
# reads. Leaving that to a model step (commit step 6) orphaned #43/#45/#47: the fix merged but the
# label never flipped, so the issue never closed. This hook re-derives the label from the commit
# itself, the instant it lands, for ALL callers — no prompt discipline.
#
#   git commit references (#N) AND that commit is now HEAD  → stamp `committed` +
#       `fixed-pending-deploy`, drop `needs-deploy` on #N. Idempotent, non-fatal, never blocks
#       (PostToolUse — the commit already ran; we only reconcile labels).
#   commit failed / HEAD doesn't cite (#N) / gh unreachable → silent no-op (never surface noise).
#
# Keys on the SAME `(#N)` shape as commit-gate (parenthesised). A `Closes #N` non-gated commit does
# NOT match — those close on merge by keyword and must not be deploy-gated. Loads in bound-project
# sessions for every caller; reads the PostToolUse payload on stdin.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"

# Command parsing is SHARED with the gate — see commit-parse.sh. Answering "is this a commit" and
# "which issue" with a second regex is how this hook fell behind when the gate learned `git -C`.
# shellcheck source=./commit-parse.sh
. "$(dirname "$0")/commit-parse.sh"
is_commit "$cmd" || exit 0

n="$(commit_issue "$cmd")"
[ -z "$n" ] && exit 0

# Confirm the commit actually landed: HEAD's subject must cite the same (#N). Guards against a
# failed/empty commit (nothing staged, hook-denied, pre-commit failure) where HEAD didn't move.
cdir="$(commit_dir "$cmd")"
# Multi-repo workspace (ui/lib/workspace.js, probe #35 item 17): `cd <child> && git commit` leaves
# the hook's cwd at the workspace PARENT, which is not a repo — `git log` was empty and the labels
# were silently never stamped. Resolve the child from the leading `cd`; if that still finds no
# repo inside a workspace, say so to the agent instead of a silent no-op.
ws_root() { d="$PWD"; while [ "$d" != "/" ]; do [ -f "$d/.xenomoon/workspace.json" ] && { echo "$d"; return; }; d="$(dirname "$d")"; done; }
if [ -z "$cdir" ] && ! git rev-parse --git-dir >/dev/null 2>&1; then
  cdir="$(printf '%s' "$cmd" | sed -nE "s/^[[:space:]]*cd[[:space:]]+(\"([^\"]*)\"|'([^']*)'|([^[:space:]&;]+))[[:space:]]*(&&|;).*/\2\3\4/p")"
  if [ -z "$cdir" ] || ! git -C "$cdir" rev-parse --git-dir >/dev/null 2>&1; then
    ws="$(ws_root)"
    if [ -n "$ws" ]; then
      msg="commit-label: deploy-gate labels for #$n were NOT stamped — the hook runs at the workspace parent ($ws), not in a repo, and could not tell which child repo committed. Stamp them with \`issuekit commit\`, or commit as \`git -C <child> commit\`."
      jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$m}}'
    fi
    exit 0
  fi
fi
if [ -n "$cdir" ]; then
  head_subject="$(git -C "$cdir" log -1 --pretty=%s 2>/dev/null || true)"
else
  head_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
fi
printf '%s' "$head_subject" | grep -qF "(#$n)" || exit 0

# Reconcile the deploy-gate labels. Idempotent, so running after `issuekit commit` (which already
# stamped them) is a no-op rather than a conflict. Best-effort — never fail the turn if gh is down.
# …and label the issue of THAT repo: `gh` resolves the repo from its working directory, so running
# it here would stamp whatever repo the hook happens to sit in.
(
  [ -n "$cdir" ] && cd "$cdir" 2>/dev/null
  gh issue edit "$n" \
    --add-label committed \
    --add-label fixed-pending-deploy \
    --remove-label needs-deploy >/dev/null 2>&1
) || exit 0

exit 0

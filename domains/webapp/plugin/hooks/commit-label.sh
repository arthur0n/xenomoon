#!/usr/bin/env bash
# PostToolUse(Bash) — DETERMINISTIC deploy-gate labelling for the webapp pipeline. Companion to
# commit-gate.sh (PreToolUse). The pipeline's promise ("a committed fix auto-closes on deploy")
# depends on the issue carrying `fixed-pending-deploy` — the ONLY label close-deployed-issues.yml
# reads. Leaving that to a model step (/commit step 6) orphaned #43/#45/#47: the fix merged but the
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
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+commit([[:space:]]|$)' || exit 0

n="$(printf '%s' "$cmd" | grep -oE '\(#[0-9]+\)' | head -1 | tr -dc '0-9')"
[ -z "$n" ] && exit 0

# Confirm the commit actually landed: HEAD's subject must cite the same (#N). Guards against a
# failed/empty commit (nothing staged, hook-denied, pre-commit failure) where HEAD didn't move.
head_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
printf '%s' "$head_subject" | grep -qF "(#$n)" || exit 0

# Reconcile the deploy-gate labels. Best-effort — never fail the turn if gh is down or offline.
gh issue edit "$n" \
  --add-label committed \
  --add-label fixed-pending-deploy \
  --remove-label needs-deploy >/dev/null 2>&1 || exit 0

exit 0

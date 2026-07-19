#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC commit gate for the webapp pipeline. The pipeline's promise
# ("commit is automatic ONLY when fully green") must not depend on any model remembering it, so
# this hook re-derives the gate from the issue's labels at the moment `git commit` runs:
#
#   commit references (#N)  → gh labels MUST show qa:pass + review:pass and NO qa:blocked /
#                             review:changes → explicit ALLOW (no prompt; the pipeline earned it).
#                             Any gate miss → DENY naming the exact failing condition.
#   no (#N) in the message  → ASK (a non-pipeline commit is the human's call, not blocked).
#   gh unreachable / error  → ASK (fail-closed to the human, never fail-open).
#
# Loads only in bound-project sessions (this domain plugin), for ALL callers — orchestrator and
# sub-agents alike. Reads the PreToolUse payload on stdin; emits a decision only when it matches.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+commit([[:space:]]|$)' || exit 0

decision() { # $1 = allow|deny|ask, $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}' \
    "$1" "$(printf '%s' "$2" | jq -Rs .)"
}

n="$(printf '%s' "$cmd" | grep -oE '\(#[0-9]+\)' | head -1 | tr -dc '0-9')"
if [ -z "$n" ]; then
  decision ask "No (#N) issue reference in this commit — pipeline commits must cite their issue. A non-pipeline commit (chore/docs) is the human's call: approve to proceed."
  exit 0
fi

labels="$(gh issue view "$n" --json labels -q '.labels[].name' 2>/dev/null)"
if [ -z "$labels" ]; then
  decision ask "Commit cites (#$n) but the issue's labels could not be read (gh failed or no such issue). Fail-closed: human approval required."
  exit 0
fi

has() { printf '%s\n' "$labels" | grep -qxF "$1"; }
if has "qa:blocked"; then
  decision deny "Gate: issue #$n carries qa:blocked — QA blocked this fix. Route back to /implement; a stale block outranks a pass."
elif has "review:changes"; then
  decision deny "Gate: issue #$n carries review:changes — review demanded changes. Route back to /implement."
elif ! has "qa:pass"; then
  decision deny "Gate: issue #$n lacks qa:pass — run /qa $n first. Commit is earned, not asserted."
elif ! has "review:pass"; then
  decision deny "Gate: issue #$n lacks review:pass — run /audit $n first."
else
  decision allow "Gate green for #$n: qa:pass + review:pass present, no blocks. Deterministic auto-commit permitted (push stays the human gate)."
fi
exit 0

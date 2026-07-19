#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC push gate for the webapp pipeline. "Push is the human gate"
# is the pipeline's one hard human checkpoint (push → CI → deploy → issues auto-close), so it is
# enforced here, not by prompt discipline:
#
#   sub-agent (agent_id present) → DENY. No pipeline agent ever pushes — not the developer,
#                                  not a backgrounded worker. The orchestrator relays to the human.
#   main session                 → ASK. The human confirms every push in the UI; approving IS
#                                  the gate. Never silent, never automatic.
#
# Reads the PreToolUse payload on stdin; emits a decision only on a `git push` match.
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+push([[:space:]]|$)' || exit 0

agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
if [ -n "$agent_id" ]; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Sub-agents never push — push is the HUMAN gate (push triggers CI deploy, which closes fixed-pending-deploy issues). Report ready-to-push to the orchestrator; the human pushes."}}'
else
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"git push publishes and triggers the CI deploy — this is the pipeline'"'"'s human gate. Confirm to push."}}'
fi
exit 0

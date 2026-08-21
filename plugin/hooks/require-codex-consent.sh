#!/usr/bin/env bash
# PreToolUse(Bash) consent gate: a Codex REVIEW run surfaces a human approval prompt —
# the prompt IS the consent, for ALL callers (main session and subagents alike).
# This replaces the prose consent clause that contradicted the "use it by default"
# doctrine and got rationalized around (live bite 2026-08-11: four reviews fired in one
# session with zero consent). Mechanism over prose: nobody offers in chat, nobody asks
# twice — dispatching the review raises this one prompt, the human clicks, done.
#
# POLICY-AWARE (2026-08-21): `.xenomoon.json` policy.codexReview governs the prompt.
#   ask   (default, and the fallback on ANY read error) → this prompt, exactly as before.
#   allow (the literal string, per-project opt-in)      → the hook stays silent and the
#         review runs — what an unattended run needs, since a backgrounded/headless
#         caller has no approver and the SDK auto-denies the ask. The opt-in is a human
#         decision recorded in config, never derived from billing mode.
#
# Gates:   codex-companion.mjs review | adversarial-review   (any path, any chaining)
# Ignores: every other companion verb (task/status/result/cancel — the rescue path has
#          its own economics) and all non-Codex commands.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
if printf '%s' "$cmd" | grep -q 'codex-companion\.mjs' &&
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]-])(adversarial-)?review([[:space:]]|"|$)'; then
  # The framework root travels with the plugin (framework-root.generated, written at install) —
  # same resolution consequential-gate.mjs uses. Fail toward ASK: an unreadable root, config or
  # key is today's behavior, never a silent allow.
  root="$(head -n1 "$(dirname "$0")/framework-root.generated" 2>/dev/null | tr -d '[:space:]')"
  mode=""
  [ -n "$root" ] && mode="$(jq -r '.policy.codexReview // empty' "$root/.xenomoon.json" 2>/dev/null)"
  [ "$mode" = "allow" ] && exit 0
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Codex review runs on external OpenAI billing and takes real time. This prompt IS the consent gate — approve to run this one review. One review round per slice is the default; further rounds should come back through this prompt, never fire silently. (Per-project opt-out: policy.codexReview: allow in .xenomoon.json.)"}}'
fi
exit 0

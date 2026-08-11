#!/usr/bin/env bash
# PreToolUse(Bash) consent gate: a Codex REVIEW run always surfaces a human approval
# prompt — the prompt IS the consent, for ALL callers (main session and subagents alike).
# This replaces the prose consent clause that contradicted the "use it by default"
# doctrine and got rationalized around (live bite 2026-08-11: four reviews fired in one
# session with zero consent). Mechanism over prose: nobody offers in chat, nobody asks
# twice — dispatching the review raises this one prompt, the human clicks, done.
#
# Gates:   codex-companion.mjs review | adversarial-review   (any path, any chaining)
# Ignores: every other companion verb (task/status/result/cancel — the rescue path has
#          its own economics) and all non-Codex commands.
# A backgrounded/headless caller has no approver, so the SDK auto-denies the ask — by
# design: an unattended context cannot consent to an externally billed review.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
if printf '%s' "$cmd" | grep -q 'codex-companion\.mjs' &&
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]-])(adversarial-)?review([[:space:]]|"|$)'; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Codex review runs on external OpenAI billing and takes real time. This prompt IS the consent gate — approve to run this one review. One review round per slice is the default; further rounds should come back through this prompt, never fire silently."}}'
fi
exit 0

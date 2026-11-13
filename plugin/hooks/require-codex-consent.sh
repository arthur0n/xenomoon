#!/usr/bin/env bash
# PreToolUse(Bash) consent gate: a Codex REVIEW run surfaces a human approval prompt —
# the prompt IS the consent, for ALL callers (main session and subagents alike).
# This replaces the prose consent clause that contradicted the "use it by default"
# doctrine and got rationalized around (live bite 2026-08-11: four reviews fired in one
# session with zero consent). Mechanism over prose: nobody offers in chat, nobody asks
# twice — dispatching the review raises this one prompt, the human clicks, done.
#
# POLICY-AWARE (2026-08-21; per project since #84): the SESSION's project's policy.codexReview,
# in `<project>/.xenomoon/settings.json`, governs the prompt. The project is resolved from the
# payload's `cwd` by project-policy.mjs (beside this file) through ui/lib/project-settings.js —
# the same resolution consequential-gate.mjs uses, never a second walk-up in bash, and never
# the install's `.xenomoon.json`, which one install shares between several projects.
#   ask   (default, and the fallback on ANY failure) → this prompt, exactly as before.
#   allow (the literal string, per-project opt-in)      → the hook stays silent and the
#         review runs — what an unattended run needs, since a backgrounded/headless
#         caller has no approver and the SDK auto-denies the ask. The opt-in is a human
#         decision recorded in config, never derived from billing mode.
#
# Gates:   codex-companion.mjs review | adversarial-review   (any path, any chaining)
#          codex-companion.mjs task   (a spend verb too — live bite 2026-08-26: ~12
#          review-shaped runs went through codex-rescue → `task` with zero prompts)
#          raw `codex exec|review|apply|resume`   (the freehand binary — an agent that greps
#          the machine and invents its own pattern bypasses receipt, parking, AND consent;
#          the sanctioned route is the mcp__ui__codex tool)
# Ignores: companion status/result/cancel (they spend nothing), `codex login|logout`,
#          `codex --version|--help`, `codex app-server` (the companion's own child),
#          and all non-Codex commands.
payload="$(cat)" # stdin is read ONCE; the command and the cwd both come from this copy
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
if printf '%s' "$cmd" | grep -q 'codex-companion\.mjs' &&
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]-])(adversarial-)?review([[:space:]]|"|$)'; then
  # Fail toward ASK: no cwd, no node, no framework root, an import error or an unreadable
  # settings file all leave mode empty or "ask" — never a silent allow.
  # Only a JSON STRING is a cwd: `jq -r` prints a number or an object as text, so the type is
  # checked in jq. `-j` and the trailing `x` keep the value byte-exact (command substitution strips
  # trailing newlines). `--` ends node's own options, and the cwd is one quoted argument after the
  # script, so whatever it holds (`-e`, `--eval=…`, spaces, quotes) reaches the script as data.
  # A missing node, a non-zero exit or any output but `allow` asks.
  # A cwd holding a NUL (`\u0000`) is no project: bash cannot carry the byte, so command
  # substitution drops it and `/proj/a\u0000` would arrive as `/proj/a`, a real project. It is
  # rejected in jq, by codepoint (`explode`), before it reaches the shell.
  cwd="$(printf '%s' "$payload" | jq -j 'if (.cwd | type) == "string" and (.cwd | explode | any(. == 0) | not) then .cwd else empty end' 2>/dev/null; printf x)"
  cwd="${cwd%x}"
  mode=""
  if [ -n "$cwd" ]; then
    mode="$(node -- "$(dirname "$0")/project-policy.mjs" codexReview "$cwd" 2>/dev/null)" || mode=""
  fi
  [ "$mode" = "allow" ] && exit 0
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Codex review runs on external OpenAI billing and takes real time. This prompt IS the consent gate — approve to run this one review. One review round per slice is the default; further rounds should come back through this prompt, never fire silently. (Per-project opt-out: policy.codexReview: allow in <project>/.xenomoon/settings.json.)"}}'
  exit 0
fi
# Companion `task` — same billing, no template, and the verb reviews hid behind (codex-rescue
# forwards to it). Always ask: the policy.codexReview opt-in was recorded for tool-routed
# reviews, not for freehand spend.
if printf '%s' "$cmd" | grep -q 'codex-companion\.mjs' &&
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]-])task([[:space:]]|"|$)'; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"A Codex task spends external OpenAI billing. If this is a review or an audit, use the mcp__ui__codex tool instead (kind: review / adversarial-review / audit) — it parks the full output and returns a receipt. Approve only for a genuine fix-it or one-off task."}}'
  exit 0
fi
# Raw `codex` binary running a spend verb. Matching only the spend verbs naturally lets
# login/logout/--version/--help/app-server through, and `codex-companion` cannot match
# (the hyphen breaks the word boundary).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])codex[[:space:]]+(exec|review|apply|resume)([[:space:]]|"|$)'; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Raw codex runs on external OpenAI billing with no receipt, no parked review, and no consent trail. Use the mcp__ui__codex tool instead: kind adversarial-review to challenge an approach, kind audit for an exhaustive pass, kind review for the native diff review. Approve only if raw codex is genuinely needed."}}'
  exit 0
fi
exit 0

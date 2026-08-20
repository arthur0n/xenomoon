#!/usr/bin/env bash
# UserPromptSubmit — mechanical debrief-queue capture. NON-BLOCKING, best-effort: when a
# user turn reads like a correction (a rules override, "why did you", shouting), append one
# keyed line to the bound project's `.xenomoon/debrief-queue.md` deterministically.
#
# Why a hook: the spine already orders the orchestrator to append these lines itself
# ("deterministic, same turn, never skipped") — but that is model behavior, and the learning
# loop is subordinate to task momentum, so it fires least exactly when it's needed most
# (live bite 2026-08-11: every debrief trigger fired in one session; one line was appended).
# The prose rule stays; this is the backstop that fills the queue whether or not the model
# is mid-pipeline. Coarse matching is fine — the queue is triage input, debrief and
# /harvest-sessions dedup downstream. NEVER blocks or modifies the prompt (always exit 0).
payload="$(cat)"
prompt="$(printf '%s' "$payload" | jq -r '.prompt // empty' 2>/dev/null)"
[ -z "$prompt" ] && exit 0

# Project dir from the payload cwd (session cwd = PROJECT_DIR); fall back to $PWD. Only
# append where the framework's state dir already exists — never scaffold one.
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$PWD"
[ -d "$cwd/.xenomoon" ] || exit 0

lower="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"
hit=""
case "$lower" in
  *"why are you"* | *"why did you"* | *"you didn't"* | *"you did not"* | \
  *"i didn't ask"* | *"i did not ask"* | *"not what i asked"* | *"don't do that"* | \
  *"do not do that"* | *"stop doing"* | *"without my approval"* | *"follow the rules"* | \
  *"breaking the rules"* | *"broke the rules"*) hit="phrase" ;;
esac

# Shouting: ≥12 alphabetic chars and more than half of them uppercase.
if [ -z "$hit" ]; then
  alpha="$(printf '%s' "$prompt" | tr -cd '[:alpha:]')"
  upper="$(printf '%s' "$prompt" | tr -cd '[:upper:]')"
  if [ "${#alpha}" -ge 12 ] && [ $((${#upper} * 2)) -gt "${#alpha}" ]; then hit="caps"; fi
fi
[ -z "$hit" ] && exit 0

# One keyed line, first 120 chars of the prompt flattened; same shape the spine specifies.
excerpt="$(printf '%s' "$prompt" | tr '\n\t' '  ' | cut -c1-120)"
{
  printf -- '- %s · user-turn(%s) · override · %s\n' \
    "$(date +%Y-%m-%d 2>/dev/null || echo unknown)" "$hit" "$excerpt" \
    >> "$cwd/.xenomoon/debrief-queue.md"
} 2>/dev/null
exit 0

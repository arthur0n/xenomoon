#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit) — keep the game's graphify knowledge graph fresh.
# NON-BLOCKING, best-effort: after a code/doc edit lands, refresh graphify-out/ with an
# AST-only `graphify update` (no LLM, no token cost). NEVER blocks, denies, or fails the
# tool call (always exit 0). OPT-IN and triple-gated — no-ops unless the CLI is installed,
# a graph ALREADY exists (the first full build stays a manual/skill action, see
# plugin/skills/graphify, so a freshly scaffolded empty game never triggers one), AND
# auto-refresh was explicitly enabled for this game (`touch graphify-out/.autoupdate`, or
# `export XENOMOON_GRAPHIFY_AUTOUPDATE=1`). Off by default so building a graph once never
# silently commits you to background rebuilds on every edit.
#
# Fires for sub-agents too (builders do the edits); same plugin-hook mechanism as the
# PreToolUse hooks here. cwd = the game project (session cwd = PROJECT_DIR).
payload="$(cat)"

# Need the CLI; silently skip if absent (graphify is optional — `npm run doctor` flags it).
command -v graphify >/dev/null 2>&1 || exit 0

# Game dir from the payload cwd (fallback to $PWD).
gamedir="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$gamedir" ] && gamedir="$PWD"
out="$gamedir/graphify-out"

# Only refresh an EXISTING graph; first build is manual (avoids churn on an empty game).
[ -f "$out/graph.json" ] || exit 0

# Opt-in gate: auto-refresh is OFF until explicitly enabled for THIS game. graphify-out/ is
# gitignored, so the sentinel is a per-developer choice; the env var is a global override.
# Without one of these, exit before spawning anything — non-users pay only the checks above.
[ -n "$XENOMOON_GRAPHIFY_AUTOUPDATE" ] || [ -f "$out/.autoupdate" ] || exit 0

# Edited path — skip generated/config/runtime noise + our own outputs (self-trigger guard).
fp="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)"
case "$fp" in
  */graphify-out/* | */.xenomoon/* | */.claude/* | */.godot/* | */logs/*) exit 0 ;;
  graphify-out/* | .xenomoon/* | .claude/* | .godot/* | logs/*) exit 0 ;;
esac

# Debounce: coalesce a burst of edits. Skip if a refresh started in the last 20s (stale lock
# past that is treated as crashed and overwritten).
lock="$out/.update.lock"
if [ -f "$lock" ]; then
  now="$(date +%s 2>/dev/null || echo 0)"
  prev="$(cat "$lock" 2>/dev/null || echo 0)"
  [ $((now - prev)) -lt 20 ] && exit 0
fi
date +%s >"$lock" 2>/dev/null

# AST-only update, detached + non-blocking; log for debugging. Never affects the tool call.
(cd "$gamedir" 2>/dev/null && graphify update . >>graphify-out/.update.log 2>&1
  rm -f graphify-out/.update.lock) >/dev/null 2>&1 &

exit 0

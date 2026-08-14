#!/usr/bin/env bash
# PreToolUse(Grep|Glob) graphify-first nudge: in a repo that HAS a graphify knowledge
# graph (graphify-out/graph.json), the FIRST raw code-search of a session is denied ONCE
# with a pointer to `graphify query` — a scoped subgraph is usually far smaller than the
# Grep/Read fan-out it replaces (token-audit 2026-08-13: a solutioning session did 44
# Greps + 99 Reads ≈ 114k tok with the graph sitting unused; project rule already says
# graphify-first, but nothing enforced it).
#
# ONE-SHOT per session: after the single nudge every Grep/Glob is allowed — a legit
# literal search costs at most one retry, and a model that switches to `graphify query`
# was the whole point. Countable: the denial embeds `policy:"graphify-first"`, so a later
# /token-audit run tallies fires × ~5k tok (conservative avoided-fan-out delta).
#
# Deterministic gate: graph.json existence, walked up from the search path (tool_input
# .path if absolute, else the hook payload's cwd). No graph → silent allow. Fail-OPEN
# everywhere: missing field / unwritable state → exit 0 so this can never block work.
set -o pipefail

payload="$(cat)"

tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
case "$tool" in Grep|Glob) ;; *) exit 0 ;; esac

sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$sid" ] || exit 0

# Resolve the directory being searched: absolute tool_input.path wins, else session cwd.
start="$(printf '%s' "$payload" | jq -r '.tool_input.path // empty' 2>/dev/null)"
case "$start" in /*) [ -d "$start" ] || start="$(dirname "$start")" ;; *) start="" ;; esac
[ -n "$start" ] || start="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
[ -d "$start" ] || exit 0

# Walk up to find the knowledge graph; none → nothing to route to, allow.
graph=""
dir="$start"
while [ -n "$dir" ] && [ "$dir" != "/" ]; do
  if [ -f "$dir/graphify-out/graph.json" ]; then graph="$dir/graphify-out/graph.json"; break; fi
  dir="$(dirname "$dir")"
done
[ -n "$graph" ] || exit 0

# One-shot per session: state file exists → already nudged, allow everything.
sdir="${TMPDIR:-/tmp}/xenomoon-graphify-first"
mkdir -p "$sdir" 2>/dev/null || exit 0
state="$sdir/${sid//[^A-Za-z0-9._-]/_}.done"
[ -f "$state" ] && exit 0
: > "$state" 2>/dev/null || exit 0

root="$(dirname "$(dirname "$graph")")"
reason="xenomoon graphify-first: this repo has a knowledge graph ($root/graphify-out). For where/how/architecture questions run \`graphify query \"<question>\"\` (or \`graphify path\`/\`explain\`) FIRST — a scoped subgraph beats a Grep/Read fan-out. Searching for a specific literal string? Re-run this exact search; it will pass (one-time nudge). [policy:\"graphify-first\"]"
jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0

#!/usr/bin/env bash
# PreToolUse(Bash) dedup for issue-thread fetches: deny a REPEAT of the SAME `gh issue view <N> …
# comments` / `issuekit show <N>` command in the same context (session + agent) when the issue's
# `updatedAt` is UNCHANGED since the first fetch and that fetch is still RECENT (within a window
# of Bash events). A repeat re-dumps a byte-identical thread the model already has — a token audit
# (2026-09-01, id issue-digest) found one session fetching #295's comments 29× (107k chars), with
# 2–8 identical repeats inside single sub-agent contexts.
#
# Deterministic: `updatedAt` moves on any comment/label/body change, so a thread that changed is
# always allowed through; only a genuinely identical dump is denied. The key is the WHOLE command
# (whitespace-normalised) — a different jq filter on the same issue is a different view and passes.
# Countable: every denial carries `policy:"issue-digest" op=dedup`.
#
# SAFETY — same window rule as read-dedup: after compaction a re-fetch legitimately re-hydrates,
# so only a repeat within WINDOW Bash-events of the last real fetch is denied. Keyed per context:
# a sub-agent's FIRST fetch never collides with the orchestrator's (each has its own context).
# Fail-OPEN everywhere: no session id, no `-R owner/repo` to check against, gh unreachable,
# unwritable state → exit 0 (allow). Never blocks real work.
set -o pipefail
WINDOW="${XENOMOON_ISSUE_DEDUP_WINDOW:-15}"

payload="$(cat)"
tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool" = "Bash" ] || exit 0
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# Only the two thread-fetch shapes. Everything else advances nothing and exits at once.
fetch_re='(^|&&|\|\||;|\|)[[:space:]]*(rtk[[:space:]]+)?((gh[[:space:]]+issue[[:space:]]+view[[:space:]]+[0-9]+[^&|;]*comments)|((node[[:space:]]+[^[:space:]]*issuekit\.js|issuekit)[[:space:]]+show[[:space:]]+[0-9]+))'
printf '%s' "$cmd" | grep -Eq "$fetch_re" || exit 0

sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
aid="$(printf '%s' "$payload" | jq -r '.agent_id // "main"' 2>/dev/null)"
[ -n "$sid" ] || exit 0

num="$(printf '%s' "$cmd" | grep -Eo '(view|show)[[:space:]]+[0-9]+' | head -1 | grep -Eo '[0-9]+')"
repo="$(printf '%s' "$cmd" | grep -Eo '(-R|--repo)[[:space:]]+[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' | head -1 | awk '{print $2}')"
if [ -z "$repo" ]; then
  # issuekit resolves the repo from .issuekit.json; gh from the cwd remote. Same lookup, else allow.
  cfg="$(find_cfg() { d="$PWD"; while [ "$d" != "/" ]; do [ -f "$d/.issuekit.json" ] && { echo "$d/.issuekit.json"; return; }; d="$(dirname "$d")"; done; }; find_cfg)"
  [ -n "$cfg" ] && repo="$(jq -r '.repo // empty' "$cfg" 2>/dev/null)"
fi
[ -n "$num" ] && [ -n "$repo" ] || exit 0

dir="${TMPDIR:-/tmp}/xenomoon-issue-dedup"
mkdir -p "$dir" 2>/dev/null || exit 0
ctx="${sid//[^A-Za-z0-9._-]/_}.${aid//[^A-Za-z0-9._-]/_}"
state="$dir/$ctx.tsv"   # lines: key<TAB>updatedAt<TAB>seq_of_last_real_fetch
seqf="$dir/$ctx.seq"    # monotonic counter of matching Bash events in this context

key="$(printf '%s' "$cmd" | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//')"
seq="$(cat "$seqf" 2>/dev/null || echo 0)"; seq=$((seq + 1))
printf '%s' "$seq" > "$seqf" 2>/dev/null || exit 0

prev="$(grep -F "$key"$'\t' "$state" 2>/dev/null | tail -1)"
if [ -n "$prev" ]; then
  pseq="$(printf '%s' "$prev" | cut -f3)"
  if [ $((seq - pseq)) -le "$WINDOW" ]; then
    # Only now pay for a gh call: is the thread still the one already in context?
    now="$(gh issue view "$num" -R "$repo" --json updatedAt -q .updatedAt 2>/dev/null)"
    pupd="$(printf '%s' "$prev" | cut -f2)"
    if [ -n "$now" ] && [ "$now" = "$pupd" ]; then
      reason="xenomoon issue-dedup: #$num on $repo is unchanged (updatedAt $now) since fetch $pseq of $seq in this context — that thread is already in your context; re-fetch only if it was compacted out, or narrow the view: issuekit show $num --digest --lane <qa|review|analysis>. [policy:\"issue-digest\" op=dedup]"
      jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      exit 0
    fi
  fi
fi

# Allow, and record this fetch with the thread revision it will see.
now="$(gh issue view "$num" -R "$repo" --json updatedAt -q .updatedAt 2>/dev/null)"
[ -n "$now" ] || exit 0
tmp="$state.$$"
{ grep -Fv "$key"$'\t' "$state" 2>/dev/null; printf '%s\t%s\t%s\n' "$key" "$now" "$seq"; } > "$tmp" 2>/dev/null && mv "$tmp" "$state" 2>/dev/null
exit 0

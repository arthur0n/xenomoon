#!/usr/bin/env bash
# PreToolUse(Read) dedup: deny a REPEAT Read of the same (file_path, offset, limit) when
# the file's mtime is UNCHANGED since the last time it was actually read this session AND
# that last real read is still RECENT (within a small window of Read events). Such a read
# re-dumps byte-identical content the model already has in context — pure token churn (a
# token-audit measured ~156/323 full reads/session were no-mutation re-reads ≈ 218k tok).
#
# Deterministic: mtime is exact — an Edit/Write/external change bumps it, so a stale read
# is always allowed through; only genuinely-identical content is denied. Countable: every
# denial embeds the marker `policy:"read-dedup"` in the reason, so a later /token-audit run
# tallies denials × ~1.4k tok (avg full-read payload) into a hard actual saving.
#
# SAFETY — the "recent window" is the whole point. After context compaction/summarization a
# re-read is legitimately RE-HYDRATING content that fell out of context; blocking that would
# starve the model. So we only dedup when the last REAL read of that view is within
# WINDOW Read-events back (very likely still in context). Older → allowed (re-hydrate).
#
# State is per-session under TMPDIR (session_id keyed). Fail-OPEN everywhere: any missing
# field / stat error / unwritable state → exit 0 (allow) so this can never block real work.
set -o pipefail
WINDOW="${XENOMOON_READ_DEDUP_WINDOW:-20}"   # Read-events; last real read must be within this to dedup

payload="$(cat)"

# Only the Read tool; anything else → let the normal layer decide.
tool="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool" = "Read" ] || exit 0

sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
fp="$(printf '%s' "$payload"  | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
off="$(printf '%s' "$payload" | jq -r '.tool_input.offset // "-"' 2>/dev/null)"
lim="$(printf '%s' "$payload" | jq -r '.tool_input.limit // "-"' 2>/dev/null)"
# No session id or path, or a non-file (dir) read → can't safely dedup.
[ -n "$sid" ] && [ -n "$fp" ] && [ -f "$fp" ] || exit 0

# Current mtime (BSD stat first, then GNU). Unreadable → fail open.
mt="$(stat -f %m "$fp" 2>/dev/null || stat -c %Y "$fp" 2>/dev/null)"
[ -n "$mt" ] || exit 0

dir="${TMPDIR:-/tmp}/xenomoon-read-dedup"
mkdir -p "$dir" 2>/dev/null || exit 0
state="$dir/${sid//[^A-Za-z0-9._-]/_}.tsv"   # lines: key<TAB>mtime<TAB>seq_of_last_real_read
seqf="$dir/${sid//[^A-Za-z0-9._-]/_}.seq"    # monotonic Read-event counter

key="$fp"$'\x1f'"$off"$'\x1f'"$lim"

# Advance the clock on EVERY read event (allow or deny) so "recent" is measured in reads.
seq="$(cat "$seqf" 2>/dev/null || echo 0)"
seq=$((seq + 1))
printf '%s' "$seq" > "$seqf" 2>/dev/null || exit 0

# Look up the last record for this exact view.
prev="$(grep -F "$key"$'\t' "$state" 2>/dev/null | tail -1)"
if [ -n "$prev" ]; then
  pmt="$(printf '%s' "$prev" | cut -f2)"
  pseq="$(printf '%s' "$prev" | cut -f3)"
  if [ "$pmt" = "$mt" ] && [ $((seq - pseq)) -le "$WINDOW" ]; then
    # Byte-identical view, still recent → DENY. Do NOT refresh seq: the window must stay
    # anchored to the last real context-entry, so it re-hydrates once that ages out.
    reason="xenomoon read-dedup: $fp unchanged (mtime) since a read ${pseq} of ${seq} this session — byte-identical content is already in context; re-read only if it was compacted out. [policy:\"read-dedup\"]"
    jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
    exit 0
  fi
fi

# Allow: record this as the new last-real-read (drop any prior line for this key).
tmp="$state.$$"
{ grep -Fv "$key"$'\t' "$state" 2>/dev/null; printf '%s\t%s\t%s\n' "$key" "$mt" "$seq"; } > "$tmp" 2>/dev/null && mv "$tmp" "$state" 2>/dev/null
exit 0

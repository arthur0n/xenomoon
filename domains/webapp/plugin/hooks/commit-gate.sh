#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC commit gate for the webapp pipeline. The pipeline's promise
# ("commit is automatic ONLY when fully green") must not depend on any model remembering it, so
# this hook re-derives the gate from the issue's labels at the moment `git commit` runs:
#
#   commit references (#N)  → gh labels MUST show qa:pass + review:pass and NO qa:blocked /
#                             review:changes, AND the SHA each verdict recorded must be the
#                             PARENT of this commit (current HEAD) → explicit ALLOW (no prompt;
#                             the pipeline earned it). Any gate miss → DENY naming the exact
#                             failing condition.
#   no (#N) in the message  → ASK (a non-pipeline commit is the human's call, not blocked).
#   gh unreachable / error  → ASK (fail-closed to the human, never fail-open).
#
# The SHA binding is the point: a label is a STICKER anyone can move, so a label-only gate
# passes the second, third and fourth commit citing the same issue without re-verifying any of
# them — the guarantee decays with every commit. The tester/reviewer therefore stamp
# `qa-verified: <sha>` / `review-verified: <sha>` in their verdict comment, and a commit is
# allowed only on the code those verdicts actually saw. Pre-binding issues carry no marker at
# all; those ASK rather than deny, so an old green still commits with one human approval.
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
  decision ask "No (#N) issue reference — an issue-less commit bypasses the whole pipeline gate. Approve ONLY a true chore/docs commit. A code/CI/infra change belongs to an issue: deny this, file it (/feedback), and let the pipeline commit it with (#N)."
  exit 0
fi

issue="$(gh issue view "$n" --json labels,comments 2>/dev/null)"
labels="$(printf '%s' "$issue" | jq -r '.labels[]?.name' 2>/dev/null)"
if [ -z "$labels" ]; then
  decision ask "Commit cites (#$n) but the issue's labels could not be read (gh failed or no such issue). Fail-closed: human approval required."
  exit 0
fi

# The code this commit will actually record: its parent is the current HEAD.
head_sha="$(git rev-parse HEAD 2>/dev/null)"
if [ -z "$head_sha" ]; then
  decision ask "Commit cites (#$n) but HEAD could not be resolved (unborn branch or not a git repo), so the recorded QA/review SHAs cannot be checked. Fail-closed: human approval required."
  exit 0
fi

# Newest marker each verdict stamped, read ONLY from a comment that actually declares a PASS.
#
# The marker alone is not enough: a blocking verdict also records which SHA it judged, and reading
# markers across all comments would let one partial failure ship a rejected fix — the blocking
# comment posts, its label edit then fails leaving a stale pass label, and the gate would see a
# pass label plus a matching marker at HEAD. So each comment is checked as a UNIT: the verdict
# header and the marker must live in the same comment. (The agents also emit distinct markers for
# blocking verdicts — `qa-blocked-at:` / `review-changes-at:` — so this is belt and braces.)
#
# And it reads the LATEST verdict in each lane, not the latest PASS. Filtering to passes first
# would let an older pass outlive a newer block at the SAME sha: the blocking comment posts, its
# label edit fails, and the gate would still find a matching pass marker behind it. The newest
# verdict is the verdict.
latest_verdict() { # $1 = lane regex, $2 = pass regex, $3 = marker key → "BLOCKED" | "<key>: <sha>" | ""
  printf '%s' "$issue" |
    jq -r --arg lane "$1" --arg pass "$2" --arg key "$3" '
      ([ .comments[]?.body // "" | select(test($lane)) ] | last) as $c
      | if   $c == null        then ""
        elif ($c | test($pass)) then ([ $c | scan($key + ": [0-9a-f]{7,40}") ] | last // "")
        else "BLOCKED" end' 2>/dev/null
}
qa_verdict="$(latest_verdict '🧪 QA —' '🧪 QA — PASS' 'qa-verified')"
review_verdict="$(latest_verdict '🔎 REVIEW —' '🔎 REVIEW — pass' 'review-verified')"

# When TWO reviewers ran, NEITHER writes the lane verdict: each posts EVIDENCE under its own header
# (`## 🔎 CODEX REVIEW`, `## 🔎 INTERNAL REVIEW`) with no marker and no label, and `/audit` folds
# both into the single `## 🔎 REVIEW` verdict where any block wins. So evidence newer than the lane
# verdict means the reconciliation never happened — an interrupted run — and the standing verdict
# predates a reviewer nobody folded in. Comparing against the LANE verdict (not against "any review
# comment") is what makes this hold in both interruption orders: die after Codex, or die after the
# internal reviewer, and either way the newest thing on the issue is unreconciled evidence.
evidence_unreconciled="$(printf '%s' "$issue" | jq -r '
  ([ .comments[]?.body // "" ] | to_entries) as $all
  | (([$all[] | select(.value | test("🔎 (CODEX|INTERNAL) REVIEW")) | .key] | last) // -1) as $ev
  | (([$all[] | select(.value | test("🔎 REVIEW —")) | .key] | last) // -1) as $rv
  | if $ev > $rv then "yes" else "" end' 2>/dev/null)"
# `/pre-pr` sets NO label — deliberately: it adds judgement, not another sticker to collect, and the
# gate-depth rules let a sev:low change skip it. So this gate does NOT require a `ready` verdict.
# But a `not-ready` that was WRITTEN must still bite: an unanswered "this does not deliver what was
# agreed" is not advisory, and leaving it advisory means the one stage that reads the design against
# the finished work is the one stage anybody can ignore. Blocking-only, and asymmetric on purpose.
#
# Only STRUCTURALLY VALID lane reports count, both to set the block and to clear it: the header at
# the start of a line AND the lane's own signature footer. This lane has no SHA marker to
# cross-check, so without that, quoting a verdict in a discussion comment — or typing
# "## 🚦 PRE-PR — ready" — would clear a real not-ready. Anchoring at line start also means a
# markdown-quoted ("> ## 🚦 …") copy of an old verdict does not count as a new one.
prepr_blocked="$(printf '%s' "$issue" | jq -r '
  def lane_report: test("(^|\n)## 🚦 PRE-PR — (ready|not-ready)")
                   and test("(^|\n)\\*pre-PR review · senior-analyst");
  ([ .comments[]?.body // "" | select(lane_report) ] | last) as $c
  | if ($c != null and ($c | test("(^|\n)## 🚦 PRE-PR — not-ready"))) then "yes" else "" end' 2>/dev/null)"
qa_sha="$(printf '%s' "$qa_verdict" | grep -v BLOCKED | awk '{print $2}')"
review_sha="$(printf '%s' "$review_verdict" | grep -v BLOCKED | awk '{print $2}')"
short() { printf '%s' "${1:0:7}"; }

has() { printf '%s\n' "$labels" | grep -qxF "$1"; }
if [ "$qa_verdict" = "BLOCKED" ]; then
  # The newest QA verdict blocks, whatever the labels say. A stale `qa:pass` next to a newer block
  # is precisely the partial-failure this ordering exists to catch — the comment is the verdict.
  decision deny "Gate: the NEWEST QA verdict on #$n is BLOCKED (the labels may still say qa:pass — a label edit that failed does not unblock a fix). Route back to /implement, then re-run /qa $n."
elif [ "$review_verdict" = "BLOCKED" ]; then
  decision deny "Gate: the NEWEST review verdict on #$n demanded changes (whatever the labels say). Route back to /implement, then re-run /audit $n."
elif [ -n "$prepr_blocked" ]; then
  decision deny "Gate: the NEWEST pre-PR verdict on #$n is not-ready — the delivery does not match what was agreed (dropped scope, unasked additions, or not one coherent PR). It carries no label by design, but an unanswered not-ready still blocks. Address its findings via /implement, then re-run /pre-pr $n."
elif [ -n "$evidence_unreconciled" ]; then
  decision ask "A reviewer's findings on #$n (a '## 🔎 CODEX REVIEW' / '## 🔎 INTERNAL REVIEW' comment) landed AFTER the lane's own verdict, and no reconciled '## 🔎 REVIEW' followed — so the standing verdict predates a reviewer nobody folded in. Re-run /audit $n; it folds every reviewer into ONE verdict where any block wins. Approve only if you have read those findings yourself and they raise nothing."
elif has "qa:blocked"; then
  decision deny "Gate: issue #$n carries qa:blocked — QA blocked this fix. Route back to /implement; a stale block outranks a pass."
elif has "review:changes"; then
  decision deny "Gate: issue #$n carries review:changes — review demanded changes. Route back to /implement."
elif ! has "qa:pass"; then
  decision deny "Gate: issue #$n lacks qa:pass — run /qa $n first. Commit is earned, not asserted."
elif ! has "review:pass"; then
  decision deny "Gate: issue #$n lacks review:pass — run /audit $n first."
elif [ -z "$qa_sha" ] || [ -z "$review_sha" ]; then
  decision ask "Issue #$n is label-green but carries no PASS-verdict SHA marker — either its verdicts predate SHA binding, or the newest verdict was a BLOCK/changes whose marker carries no authority (no $([ -z "$qa_sha" ] && printf 'qa-verified')$([ -z "$qa_sha" ] && [ -z "$review_sha" ] && printf ' / ')$([ -z "$review_sha" ] && printf 'review-verified') marker), so the pass cannot be tied to the code being committed. Approve only if you know this green covers HEAD $(short "$head_sha"); otherwise re-run /qa $n and /audit $n."
elif [ "$qa_sha" != "$head_sha" ]; then
  decision deny "Gate: QA verified #$n at $(short "$qa_sha") — committing on $(short "$head_sha"). The pass belongs to code that is no longer HEAD; re-run /qa $n (a label is a sticker, the SHA is the artifact)."
elif [ "$review_sha" != "$head_sha" ]; then
  decision deny "Gate: review verified #$n at $(short "$review_sha") — committing on $(short "$head_sha"). The pass belongs to code that is no longer HEAD; re-run /audit $n."
else
  decision allow "Gate green for #$n: qa:pass + review:pass, no blocks, both verdicts verified at HEAD $(short "$head_sha"). Deterministic auto-commit permitted (push stays the human gate)."
fi
exit 0

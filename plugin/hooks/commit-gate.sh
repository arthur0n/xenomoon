#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC commit gate. CORE: every project gets it, because "commit only
# when green" is the pipeline's promise and a promise enforced by memory is not enforced. The pipeline's promise
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
# CAPABILITY DETECTION. This gate encodes ONE pipeline: GitHub issues carrying lane labels and
# SHA-marked verdict comments. A project that does not run that pipeline must not be judged by it —
# so when the cited issue shows NO pipeline state at all (no lane label, no verdict comment), the
# gate ASKS instead of denying. Absence of evidence is a question for the human, never a verdict.
#
# Loads for ALL callers — orchestrator and sub-agents alike. Reads the PreToolUse payload on stdin;
# emits a decision only when it matches.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"

# The detector must recognise EVERY command shape the carve-outs let through, or the carve-out
# grants an exception for a commit this gate never sees. `git -C <path> commit` and `git -c k=v
# commit` are both allowed there, so both are matched here.
commit_token='(^|[^[:alnum:]_])git([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'
printf '%s' "$cmd" | grep -Eq "$commit_token" || exit 0

decision() { # $1 = allow|deny|ask, $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}' \
    "$1" "$(printf '%s' "$2" | jq -Rs .)"
}

# ONE commit per command. The gate evaluates the issue state once, before the line runs, so a
# second commit in the same line would be judged by the first one's verdict — on a HEAD that has
# already moved, possibly citing a different issue. The SHA binding is only a binding if every
# commit is checked against the code it actually records.
# `grep -c` counts LINES, and a chained command is one line — count the matches themselves.
if [ "$(printf '%s' "$cmd" | grep -Eo "$commit_token" | wc -l | tr -d ' ')" -gt 1 ]; then
  decision deny "This command runs more than one \`git commit\`. The gate judges the issue state ONCE, before the line runs, so every commit after the first would ride on a verdict recorded for different code. Split them into separate commands — each one gets its own check."
  exit 0
fi

# The issue must come from the COMMIT, not from anywhere in the line. Reading the first `(#N)` in
# the whole command let an earlier reference — `echo "(#123)" && git commit -m "fix (#456)"` — pick
# the gate's target, so a green issue could authorise a commit that records a blocked one. Only the
# text from the commit token onward is the commit's own (multi-commit lines were denied above, so
# the greedy match lands on the single commit this line runs).
#
# It also stops at the next command. Slicing to end-of-line let text AFTER the commit supply the
# reference — `git commit -m chore && echo "(#456)"` would have gated an issue-less commit against
# #456. If a message legitimately contains `&&`, the reference is lost and the gate falls to its
# "no (#N)" ASK: a human decides, which is the safe direction.
commit_args="$(printf '%s' "$cmd" | sed -E "s/^.*${commit_token}//" | sed -E 's/[[:space:]]*(&&|\|\||;|\|).*$//')"

# And the reference must come from the MESSAGE, not from any argument that happens to contain one.
# `git commit -m chore --author='A (#456) <a@b>'` would otherwise gate an issue-less commit against
# #456. Only `-m` / `--message` values are read; a `(#N)` sitting elsewhere in the arguments is
# ignored, so such a commit falls to the "no (#N)" ASK rather than borrowing someone else's verdict.
msg="$(printf '%s' "$commit_args" | sed -nE "s/.*(-m|--message)[[:space:]=]+'([^']*)'.*/\\2/p")"
[ -n "$msg" ] || msg="$(printf '%s' "$commit_args" | sed -nE 's/.*(-m|--message)[[:space:]=]+"([^"]*)".*/\2/p')"
[ -n "$msg" ] || msg="$(printf '%s' "$commit_args" | sed -nE 's/.*(-m|--message)[[:space:]=]+([^[:space:]]+).*/\2/p')"
n="$(printf '%s' "$msg" | grep -oE '\(#[0-9]+\)' | head -1 | tr -dc '0-9')"
if [ -z "$n" ]; then
  decision ask "No (#N) issue reference — an issue-less commit bypasses the whole pipeline gate. Approve ONLY a true chore/docs commit. A code/CI/infra change belongs to an issue: deny this, file it (/feedback), and let the pipeline commit it with (#N)."
  exit 0
fi

issue="$(gh issue view "$n" --json labels,comments 2>/dev/null)"
# "Could not READ the issue" and "the issue has no labels" are different facts. Conflating them —
# by testing the label list for emptiness — meant an issue whose labels were removed, or whose
# label write failed after a BLOCKING verdict was posted, never reached the deny branches at all:
# the comment said blocked, the gate asked, and a human approval shipped it.
if [ -z "$issue" ] || ! printf '%s' "$issue" | jq -e 'has("comments")' >/dev/null 2>&1; then
  decision ask "Commit cites (#$n) but the issue could not be read (gh failed, no such issue, or unusable output). Fail-closed: human approval required."
  exit 0
fi
labels="$(printf '%s' "$issue" | jq -r '.labels[]?.name' 2>/dev/null)"

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
# The EMOJI IS DECORATION, but the HEADING is STRUCTURE. Both patterns anchor to the start of a
# line (`(^|\n)## `), so a comment QUOTING a verdict ("> ## QA — PASS") or mentioning one inline
# cannot supersede a real blocking one — the rule the PRE-PR parser already used. Real issues carry `## QA — PASS` without it (6 of 10 sampled on a live
# project), and a verdict this gate cannot see is a verdict that silently does not count — the
# label-only path then decides, which is the failure the SHA binding exists to prevent.
qa_verdict="$(latest_verdict '(^|\n)## (🧪 )?QA —' '(^|\n)## (🧪 )?QA — PASS' 'qa-verified')"
review_verdict="$(latest_verdict '(^|\n)## (🔎 )?REVIEW —' '(^|\n)## (🔎 )?REVIEW — pass' 'review-verified')"

# When TWO reviewers ran, NEITHER writes the lane verdict: each posts EVIDENCE under its own header
# (`## 🔎 CODEX REVIEW`, `## 🔎 INTERNAL REVIEW`) with no marker and no label, and `/audit` folds
# both into the single `## 🔎 REVIEW` verdict where any block wins. So evidence newer than the lane
# verdict means the reconciliation never happened — an interrupted run — and the standing verdict
# predates a reviewer nobody folded in. Comparing against the LANE verdict (not against "any review
# comment") is what makes this hold in both interruption orders: die after Codex, or die after the
# internal reviewer, and either way the newest thing on the issue is unreconciled evidence.
evidence_unreconciled="$(printf '%s' "$issue" | jq -r '
  ([ .comments[]?.body // "" ] | to_entries) as $all
  | (([$all[] | select(.value | test("(^|\n)## (🔎 )?(CODEX|INTERNAL) REVIEW")) | .key] | last) // -1) as $ev
  | (([$all[] | select(.value | test("(^|\n)## (🔎 )?REVIEW —")) | .key] | last) // -1) as $rv
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
# Does this issue show any sign of THIS pipeline? The evidence must be pipeline-SPECIFIC: a `qa:` /
# `review:` lane label, or a verdict heading at the start of a line. Generic lifecycle labels
# (`triaged`, `implemented`, `committed`) are ordinary GitHub vocabulary — counting them would flip
# an unrelated project into enforcement and deny every commit it makes for missing labels nobody
# there writes.
pipeline_state="$(printf '%s' "$issue" | jq -r '
  ([ .labels[]?.name // "" | select(test("^(qa|review)[:]")) ] | length) as $l
  | ([ .comments[]?.body // "" | select(test("(^|\n)## (🧪 )?QA —|(^|\n)## (🔎 )?REVIEW —|(^|\n)## (🚦 )?PRE-PR —")) ] | length) as $c
  | if ($l + $c) > 0 then "yes" else "" end' 2>/dev/null)"

prepr_blocked="$(printf '%s' "$issue" | jq -r '
  def lane_report: test("(^|\n)## (🚦 )?PRE-PR — (ready|not-ready)")
                   and test("(^|\n)\\*pre-PR review · senior-analyst");
  ([ .comments[]?.body // "" | select(lane_report) ] | last) as $c
  | if ($c != null and ($c | test("(^|\n)## (🚦 )?PRE-PR — not-ready"))) then "yes" else "" end' 2>/dev/null)"
qa_sha="$(printf '%s' "$qa_verdict" | grep -v BLOCKED | awk '{print $2}')"
review_sha="$(printf '%s' "$review_verdict" | grep -v BLOCKED | awk '{print $2}')"
short() { printf '%s' "${1:0:7}"; }

has() { printf '%s\n' "$labels" | grep -qxF "$1"; }
if [ -z "$pipeline_state" ]; then
  decision ask "Commit cites (#$n), but that issue carries no pipeline state at all — no qa:/review: label, no QA or review verdict comment. This gate judges ONE pipeline (labelled stages + SHA-bound verdicts); a project that does not run it should not be denied by it. Approve if this project commits without the staged pipeline; otherwise run the stages first."
elif [ "$qa_verdict" = "BLOCKED" ]; then
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

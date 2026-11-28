#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC commit gate. CORE: every project gets it, because "commit only
# when green" is the flow's promise (plugin/docs/flow/commit.md), and a promise enforced by memory
# is not enforced. This hook re-derives the verdict from the issue itself at the moment `git commit`
# runs:
#
#   commit references (#N)  → gh labels MUST show qa:pass + review:pass and NO qa:blocked /
#                             review:changes, AND the SHA each verdict recorded must be the
#                             PARENT of this commit (current HEAD) → explicit ALLOW (no prompt;
#                             the flow's Review or Fix step earned it). Any gate miss → DENY
#                             naming the exact failing condition and the flow step to go back to.
#   no (#N) in the message  → ASK (a non-pipeline commit is the human's call, not blocked).
#   gh unreachable / error  → ASK (fail-closed to the human, never fail-open).
#
# The SHA binding is the point: a label is a STICKER anyone can move, so a label-only gate
# passes the second, third and fourth commit citing the same issue without re-verifying any of
# them — the guarantee decays with every commit. The tester/reviewer therefore stamp
# `qa-verified: <sha>` / `review-verified: <sha>` in the pass comments the flow's Review or Fix
# step writes (plugin/docs/flow/review.md), and a commit is
# allowed only on the code those verdicts actually saw. Pre-binding issues carry no marker at
# all; those ASK rather than deny, so an old green still commits with one human approval.
#
# CONTENT BINDING (#110). A sha says which commit the pass sat on, not what was in the working tree
# when it ran: an edit made after the pass would ride on it. So the pass comments also carry
# `qa-content: <id>` / `review-content: <id>` (written with `issuekit fingerprint`), and after the
# sha checks the gate runs tree-fingerprint.sh on the commit's repo. A different id → DENY, the pass
# is cancelled and flow-reject.mjs moves the flow task to Fix (one counted round per content). No
# content mark, or content the commit would not record (unstaged / untracked, or a staged file in
# `.xenomoon/` the id leaves out) → ASK. ONE folder is the commit's repo for all of it.
#
# CAPABILITY DETECTION. This gate encodes ONE pipeline: GitHub issues carrying lane labels and
# SHA-marked verdict comments. A project that does not run that pipeline must not be judged by it —
# so when the cited issue shows NO pipeline state at all (no lane label, no verdict comment), the
# gate ASKS instead of denying. Absence of evidence is a question for the human, never a verdict.
#
# Loads for ALL callers — orchestrator and sub-agents alike. Reads the PreToolUse payload on stdin;
# emits a decision only when it matches.
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
jq_rc=$?
# jq missing, or jq failing on the payload, used to leave `cmd` empty and exit 0 with no decision —
# the gate gone for every commit. The ask below is STATIC (printf only): `decision` quotes with jq.
if [ "$jq_rc" -ne 0 ]; then
  if printf '%s' "$payload" | grep -Eq '(^|[^[:alnum:]_])git[^&|;]*[[:space:]]commit([[:space:]]|$)'; then
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"The commit gate could not read the command (jq missing or failed), so it cannot judge this command. Install jq, or approve only if you know this commit is green."}}'
  fi
  exit 0
fi
payload_cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
hook_dir="$(dirname "$0")"

decision() { # $1 = allow|deny|ask, $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}' \
    "$1" "$(printf '%s' "$2" | jq -Rs .)"
}

# Command parsing is SHARED with the label stamp — see commit-parse.sh for why one parser.
#
# `decision` is defined ABOVE this on purpose. A missing or unreadable parser used to leave
# `is_commit` undefined; `is_commit "$cmd" || exit 0` then exited 0 with no JSON at all, and a
# packaging or permissions error silently removed the gate from every commit.
parser="$(dirname "$0")/commit-parse.sh"
# shellcheck source=./commit-parse.sh
if [ ! -r "$parser" ] || ! . "$parser" || ! command -v is_commit >/dev/null 2>&1; then
  # Speak up ONLY for something that looks like a commit. Prompting on every git command would turn
  # `git status` and `git log` into approval requests in a broken install — and a human trained to
  # approve reflexively is worse than no gate at all, because the real warnings lose their signal.
  if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[^&|;]*[[:space:]]commit([[:space:]]|$)'; then
    decision ask "The commit gate could not load its command parser ($parser). It cannot judge this command, and it will not stay silent about a git command it cannot judge. Reinstall the plugin, or approve only if you know this commit is green."
  fi
  exit 0
fi
is_commit "$cmd" || exit 0

# ONE commit per command. The gate evaluates the issue state once, before the line runs, so a
# second commit in the same line would be judged by the first one's verdict — on a HEAD that has
# already moved, possibly citing a different issue. The SHA binding is only a binding if every
# commit is checked against the code it actually records.
if [ "$(commit_count "$cmd")" -gt 1 ]; then
  decision deny "This command runs more than one \`git commit\`. The gate judges the issue state ONCE, before the line runs, so every commit after the first would ride on a verdict recorded for different code. Split them into separate commands — each one gets its own check."
  exit 0
fi

# ONE repo per commit. git applies every `-C` in sequence, while commit_dir returns only the last, so a
# command with two `-C` folders cannot be tied to one repo here.
if [ "$(commit_dir_count "$cmd")" -gt 1 ]; then
  decision ask "This command names more than one -C folder, so the gate cannot tell which repo the commit records. Give the commit with one -C, or run it from inside the repo."
  exit 0
fi

# The issue must come from the COMMIT's own message — commit-parse.sh explains the narrowings.
n="$(commit_issue "$cmd")"
if [ -z "$n" ]; then
  decision ask "No (#N) issue reference — an issue-less commit bypasses the whole commit gate. Approve ONLY a true chore/docs commit. A code/CI/infra change belongs to an issue: deny this, file it (feedback), and let the flow commit it with (#N) at its Commit step."
  exit 0
fi

# Everything below is about ONE repo: the one this commit runs in. `git -C ../sib commit` records
# there, so its issue lives there too — reading the issue here while comparing SHAs against ../sib
# would judge one repo's commit by another repo's pipeline state, and issue numbers collide freely
# across repos.
# ONE folder is that repo: the `-C` dir (a relative one resolved against the payload's cwd), else the
# payload's cwd, else the hook's own working folder. The sha, the issue, the fingerprint and the
# rejection all use it.
cdir="$(commit_dir "$cmd")"
base="${payload_cwd:-$PWD}"
case "$cdir" in
  "") repo_dir="$base" ;;
  /*) repo_dir="$cdir" ;;
  *) repo_dir="$base/$cdir" ;;
esac
issue="$(cd "$repo_dir" 2>/dev/null && gh issue view "$n" --json labels,comments 2>/dev/null)"
# "Could not READ the issue" and "the issue has no labels" are different facts. Conflating them —
# by testing the label list for emptiness — meant an issue whose labels were removed, or whose
# label write failed after a BLOCKING verdict was posted, never reached the deny branches at all:
# the comment said blocked, the gate asked, and a human approval shipped it.
if [ -z "$issue" ] || ! printf '%s' "$issue" | jq -e 'has("comments")' >/dev/null 2>&1; then
  decision ask "Commit cites (#$n) but the issue could not be read (gh failed, no such issue, or unusable output). Fail-closed: human approval required."
  exit 0
fi
labels="$(printf '%s' "$issue" | jq -r '.labels[]?.name' 2>/dev/null)"

# The code this commit will actually record: its parent is HEAD — of that same repo.
head_sha="$(git -C "$repo_dir" rev-parse HEAD 2>/dev/null)"
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
# A verdict word this gate does not know is NOT a block — it is an unread verdict, and saying
# "demanded changes" about it is simply false. Real data proved the difference matters: a live
# project's lane carried `## 🔎 REVIEW — approve (Codex adversarial)`, Codex's own vocabulary pasted
# straight into the lane instead of being mapped to `pass` at its source. The gate called that a
# demand for changes and denied the commit, citing a verdict that had actually approved. Three
# states, then: pass, a RECOGNISED block, and anything else — which asks, quoting the heading so the
# human can see the word nobody taught this gate.
latest_verdict() { # $1 lane rx, $2 pass rx, $3 marker key, $4 block rx → "BLOCKED"|"UNKNOWN <hdr>"|"<key>: <sha>"|""
  printf '%s' "$issue" |
    jq -r --arg lane "$1" --arg pass "$2" --arg key "$3" --arg block "$4" '
      ([ .comments[]?.body // "" | select(test($lane)) ] | last) as $c
      | if   $c == null         then ""
        elif ($c | test($pass))  then ([ $c | scan($key + ": [0-9a-f]{7,40}") ] | last // "")
        elif ($c | test($block)) then "BLOCKED"
        else "UNKNOWN " + (($c | match($lane + "[^\\n]*").string) | ltrimstr("\n") | .[0:120])
        end' 2>/dev/null
}
# The parenthetical may not span lines: a heading is ONE line, and `[^)]*` would let a pasted
# multi-line block be read as a verdict.
# The EMOJI IS DECORATION, and so is a PARENTHETICAL — real verdicts on a live project were
# written `## QA — PASS` (no emoji, 4 of 10 sampled issues) and `## 🔎 REVIEW (Codex) — changes`
# (annotated lane). A verdict this gate cannot see is a verdict that silently does not count, and
# the label alone then decides — which is the failure the SHA binding exists to prevent. But the
# HEADING is STRUCTURE. Both patterns anchor to the start of a
# line (`(^|\n)## `), so a comment QUOTING a verdict ("> ## QA — PASS") or mentioning one inline
# cannot supersede a real blocking one.
#
# The EMOJI, though, is decoration: a live project wrote `## QA — PASS` without it in 6 of 10
# sampled issues. A verdict this gate cannot see is a verdict that silently does not count, and the
# label-only path then decides — the exact failure the SHA binding exists to prevent.
#
# The blocking words are the lanes' own vocabulary, matched case-insensitively — the verdict is a
# heading written by an agent, and `Changes` is the same verdict as `changes`.
#
# The two are deliberately ASYMMETRIC. A pass must be the WHOLE verdict — the canonical word, at
# most a note from a KNOWN list, and then the end of the line — because a bare prefix match reads
# `— pass-with-caveats` and `— passed but needs-attention` as clean passes, and with a marker
# present the gate would call a qualified verdict a SHA-bound green.
#
# The note is an ALLOWLIST, not a filter for bad words. A live issue really does say
# `## 🧪 QA — PASS (re-QA)`, so some note must be accepted — but "any note without the word blocked"
# greens `PASS (pending deploy)`, `PASS (not verified)`, `PASS (partial)`, and every other way of
# saying "yes, but". Naming the few notes that mean nothing about the verdict is the only version of
# this that cannot be widened by a phrase nobody thought of.
#
# A block, by contrast, matches on the leading word alone. Blocks should bite widely, and anything
# that escapes both patterns lands in UNKNOWN, which asks rather than allows.
PASS_NOTE='( \((re-?QA|re-?review|re-?run|round [0-9]+)\))?[ \t]*(\n|$)'
QA_LANE='(^|\n)## (🧪 )?QA( \([^)\n]*\))? —'
QA_PASS="(?i)(^|\n)## (🧪 )?QA( \([^)\n]*\))? — PASS$PASS_NOTE"
QA_BLOCK='(?i)(^|\n)## (🧪 )?QA( \([^)\n]*\))? — (blocked|fail)'
REVIEW_LANE='(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? —'
REVIEW_PASS="(?i)(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? — pass$PASS_NOTE"
REVIEW_BLOCK='(?i)(^|\n)## (🔎 )?REVIEW( \([^)\n]*\))? — (changes|needs-attention|blocked|reject)'
qa_verdict="$(latest_verdict "$QA_LANE" "$QA_PASS" 'qa-verified' "$QA_BLOCK")"
review_verdict="$(latest_verdict "$REVIEW_LANE" "$REVIEW_PASS" 'review-verified' "$REVIEW_BLOCK")"
# The content marks, read by the SAME rules: only from the lane's newest verdict, when it is a pass.
# A content id is a full 40-hex tree id; anything shorter is treated as no mark (it cannot be compared).
content_mark() { printf '%s' "$1" | grep -E ': [0-9a-f]{40}$' | awk '{print $2}'; }
qa_content="$(content_mark "$(latest_verdict "$QA_LANE" "$QA_PASS" 'qa-content' "$QA_BLOCK")")"
review_content="$(content_mark "$(latest_verdict "$REVIEW_LANE" "$REVIEW_PASS" 'review-content' "$REVIEW_BLOCK")")"

# When TWO reviewers ran, NEITHER writes the lane verdict: each posts EVIDENCE under its own header
# (`## 🔎 CODEX REVIEW`, `## 🔎 INTERNAL REVIEW`) with no marker and no label, and the Review step folds
# both into the single `## 🔎 REVIEW` verdict where any block wins. So evidence newer than the lane
# verdict means the reconciliation never happened — an interrupted run — and the standing verdict
# predates a reviewer nobody folded in. Comparing against the LANE verdict (not against "any review
# comment") is what makes this hold in both interruption orders: die after Codex, or die after the
# internal reviewer, and either way the newest thing on the issue is unreconciled evidence.
evidence_unreconciled="$(printf '%s' "$issue" | jq -r '
  ([ .comments[]?.body // "" ] | to_entries) as $all
  | (([$all[] | select(.value | test("(^|\n)## (🔎 )?(CODEX|INTERNAL) REVIEW")) | .key] | last) // -1) as $ev
  | (([$all[] | select(.value | test("(^|\n)## (🔎 )?REVIEW( \\([^)\\n]*\\))? —")) | .key] | last) // -1) as $rv
  | if $ev > $rv then "yes" else "" end' 2>/dev/null)"
# Does this issue show any sign of THIS pipeline? The evidence must be pipeline-SPECIFIC: a `qa:` /
# `review:` lane label, or a verdict heading at the start of a line. Generic lifecycle labels
# (`triaged`, `implemented`, `committed`) are ordinary GitHub vocabulary — counting them would flip
# an unrelated project into enforcement and deny every commit it makes for missing labels nobody
# there writes.
# An old PRE-PR comment (a retired stage, it vetoes nothing now) still counts as such evidence.
pipeline_state="$(printf '%s' "$issue" | jq -r '
  ([ .labels[]?.name // "" | select(test("^(qa|review)[:]")) ] | length) as $l
  | ([ .comments[]?.body // "" | select(test("(^|\n)## (🧪 )?QA( \\([^)\\n]*\\))? —|(^|\n)## (🔎 )?REVIEW( \\([^)\\n]*\\))? —|(^|\n)## (🚦 )?PRE-PR —")) ] | length) as $c
  | if ($l + $c) > 0 then "yes" else "" end' 2>/dev/null)"

# A non-sha state must never be mistaken for one: field 2 of `UNKNOWN ## 🔎 REVIEW — approve` is a
# heading fragment, not a marker, and letting it through would compare it to HEAD and deny with a
# nonsense sha.
qa_sha="$(printf '%s' "$qa_verdict" | grep -vE 'BLOCKED|UNKNOWN' | awk '{print $2}')"
review_sha="$(printf '%s' "$review_verdict" | grep -vE 'BLOCKED|UNKNOWN' | awk '{print $2}')"
short() { printf '%s' "${1:0:7}"; }
# The flow step a missing pass goes back to: Review when no QA or review verdict was ever written,
# Fix otherwise. It only picks the words of a refusal, never the decision.
if [ -z "$qa_verdict" ] && [ -z "$review_verdict" ]; then back_step="Review"; else back_step="Fix"; fi

# Up to five names from stdin, then the count of the rest.
name_files() {
  awk 'NF { n++; if (n <= 5) l = l (n > 1 ? ", " : "") $0 } END { if (n > 5) l = l " and " (n - 5) " more"; print l }'
}

# The last step, once both shas are HEAD: is the content being committed the content that passed?
content_check() {
  local fp rc diff_lanes line top unstaged staged_xm
  fp="$(bash "$hook_dir/tree-fingerprint.sh" "$repo_dir" 2>&1)"
  rc=$?
  if [ "$rc" -ne 0 ] || ! printf '%s' "$fp" | grep -Eqx '[0-9a-f]{40}'; then
    decision ask "Issue #$n is green at HEAD $(short "$head_sha"), but the content fingerprint of $repo_dir could not be computed (${fp:-no output, exit $rc}), so the pass cannot be tied to the content being committed. Approve only if you know nothing changed since the pass."
    return
  fi
  diff_lanes=""
  [ "$qa_content" != "$fp" ] && diff_lanes="QA's mark qa-content $(short "$qa_content")"
  if [ "$review_content" != "$fp" ]; then
    [ -n "$diff_lanes" ] && diff_lanes="$diff_lanes and "
    diff_lanes="${diff_lanes}review's mark review-content $(short "$review_content")"
  fi
  if [ -n "$diff_lanes" ]; then
    line="$(node "$hook_dir/flow-reject.mjs" "$repo_dir" "$n" "$fp" 2>/dev/null)"
    [ -n "$line" ] || line="The flow task could not be moved (node or flow-reject.mjs could not run)."
    decision deny "Gate: the content of #$n changed after the pass — $diff_lanes, the content being committed is $(short "$fp"). The pass is cancelled; a refused content counts as one fix round, once per content. $line Go back to the flow's Fix step for a new pass on this content."
    return
  fi
  top="$(git -C "$repo_dir" rev-parse --show-toplevel 2>/dev/null)"
  unstaged="$({
    git -C "$top" diff --name-only -- . ':(exclude,top).xenomoon'
    git -C "$top" ls-files --others --exclude-standard -- . ':(exclude,top).xenomoon'
  } 2>/dev/null | sort -u)"
  staged_xm="$(git -C "$top" diff --cached --name-only -- ':(top).xenomoon' 2>/dev/null)"
  if [ -n "$unstaged" ]; then
    decision ask "Issue #$n matches the pass, but content is not staged: $(printf '%s\n' "$unstaged" | name_files). The commit would record less than the pass saw. Stage it first in a command of its own, or approve if those files are not part of this change."
  elif [ -n "$staged_xm" ]; then
    decision ask "Issue #$n matches the pass, but a staged file is under .xenomoon/ ($(printf '%s\n' "$staged_xm" | name_files)), and the content fingerprint does not cover that folder. Approve only if that file belongs in this commit."
  else
    decision allow "Gate green for #$n: qa:pass + review:pass, no blocks, both verdicts verified at HEAD $(short "$head_sha"), and the content matches the pass ($(short "$fp")). Deterministic auto-commit permitted (publishing is the flow's Publish step, gated by policy.push)."
  fi
}

has() { printf '%s\n' "$labels" | grep -qxF "$1"; }
if [ -z "$pipeline_state" ]; then
  decision ask "Commit cites (#$n), but that issue carries no pipeline state at all — no qa:/review: label, no QA or review verdict comment. This gate judges ONE pipeline (labelled stages + SHA-bound verdicts); a project that does not run it should not be denied by it. Approve if this project commits without that pipeline; otherwise place the issue in the flow (a new issue starts at Screening) and commit it at the flow's Commit step."
elif [ "$qa_verdict" = "BLOCKED" ]; then
  # The newest QA verdict blocks, whatever the labels say. A stale `qa:pass` next to a newer block
  # is precisely the partial-failure this ordering exists to catch — the comment is the verdict.
  decision deny "Gate: the NEWEST QA verdict on #$n is BLOCKED (the labels may still say qa:pass — a label edit that failed does not unblock a fix). Go back to the flow's Fix step; its new pass at HEAD is what lets this commit through."
elif [ "$review_verdict" = "BLOCKED" ]; then
  decision deny "Gate: the NEWEST review verdict on #$n demanded changes (whatever the labels say). Go back to the flow's Fix step; its new pass at HEAD is what lets this commit through."
elif has "qa:blocked"; then
  decision deny "Gate: issue #$n carries qa:blocked — QA blocked this fix, and a stale block outranks a pass. Go back to the flow's Fix step."
elif has "review:changes"; then
  decision deny "Gate: issue #$n carries review:changes — review demanded changes. Go back to the flow's Fix step."
# The label denies sit ABOVE the unreadable-verdict asks on purpose. An unrecognised heading beside a
# blocking LABEL is not an open question — it is a block whose wording drifted, and asking about it
# would let the one case this change was written for downgrade a hard deny to a prompt.
elif [ "${qa_verdict%% *}" = "UNKNOWN" ]; then
  decision ask "The newest QA verdict on #$n uses a word this gate does not know, so it cannot tell a pass from a block: \"${qa_verdict#UNKNOWN }\". The canonical QA verdict is PASS or BLOCKED. Go back to the flow's Fix step so the pass is written in words the gate can read; approve only if you have read that comment yourself and it is a genuine pass."
elif [ "${review_verdict%% *}" = "UNKNOWN" ]; then
  decision ask "The newest review verdict on #$n uses a word this gate does not know, so it cannot tell a pass from a block: \"${review_verdict#UNKNOWN }\". The canonical review verdict is pass or changes — an external reviewer's own vocabulary (approve / needs-attention) must be MAPPED when it is folded into the lane, never pasted raw. Go back to the flow's Fix step so the pass is written in words the gate can read; approve only if you have read that comment yourself and it is a genuine pass."
elif [ -n "$evidence_unreconciled" ]; then
  decision ask "A reviewer's findings on #$n (a '## 🔎 CODEX REVIEW' / '## 🔎 INTERNAL REVIEW' comment) landed AFTER the lane's own verdict, and no reconciled '## 🔎 REVIEW' followed — so the standing verdict predates a reviewer nobody folded in. Go back to the flow's Fix step; its reviewer writes ONE verdict that folds in every finding, where any block wins. Approve only if you have read those findings yourself and they raise nothing."
elif ! has "qa:pass"; then
  decision deny "Gate: issue #$n lacks qa:pass. Go back to the flow's $back_step step; it writes the pass this commit needs."
elif ! has "review:pass"; then
  decision deny "Gate: issue #$n lacks review:pass. Go back to the flow's $back_step step; it writes the pass this commit needs."
elif [ -z "$qa_sha" ] || [ -z "$review_sha" ]; then
  decision ask "Issue #$n is label-green but carries no PASS-verdict SHA marker — either its verdicts predate SHA binding, or the newest verdict was a BLOCK/changes whose marker carries no authority (no $([ -z "$qa_sha" ] && printf 'qa-verified')$([ -z "$qa_sha" ] && [ -z "$review_sha" ] && printf ' / ')$([ -z "$review_sha" ] && printf 'review-verified') marker), so the pass cannot be tied to the code being committed. Approve only if you know this green covers HEAD $(short "$head_sha"); otherwise go back to the flow's Fix step for a new pass at HEAD."
elif [ "$qa_sha" != "$head_sha" ]; then
  decision deny "Gate: QA verified #$n at $(short "$qa_sha") — committing on $(short "$head_sha"). The pass belongs to code that is no longer HEAD (a label is a sticker, the SHA is the artifact). Go back to the flow's Fix step for a new pass at HEAD."
elif [ "$review_sha" != "$head_sha" ]; then
  decision deny "Gate: review verified #$n at $(short "$review_sha") — committing on $(short "$head_sha"). The pass belongs to code that is no longer HEAD. Go back to the flow's Fix step for a new pass at HEAD."
# The content marks sit BELOW the sha denies on purpose: a pass at the wrong sha is a deny whatever
# its content marks say, and asking about a missing mark first would downgrade that deny to a prompt.
elif [ -z "$qa_content" ] || [ -z "$review_content" ]; then
  decision ask "Issue #$n is green at HEAD $(short "$head_sha") but its pass carries no content mark (no $([ -z "$qa_content" ] && printf 'qa-content')$([ -z "$qa_content" ] && [ -z "$review_content" ] && printf ' / ')$([ -z "$review_content" ] && printf 'review-content') mark), so the pass cannot be tied to the content being committed. Approve only if you know nothing changed since the pass; otherwise go back to the flow's Fix step for a new pass (the tester and reviewer write the mark with \`issuekit fingerprint\`)."
else
  content_check
fi
exit 0

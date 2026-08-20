#!/usr/bin/env bash
# PreToolUse(Bash) ROLE gate: the MAIN LOOP (orchestrator) routes work — it never mutates the
# repo itself. Sub-agents are untouched; they are the ones meant to have this access.
#
# Why a hook when ui-control.js already denies the same class: that deny lives in the SDK
# permission layer (orchestratorGate → canUseTool), which exists ONLY inside a web-UI server
# session. A plain terminal session on a bound project loads the PLUGIN but not the server, so
# the orchestrator there had the full affordance while the spine told it otherwise. Post-mortem
# (2026-08-17): "a rule I have to RECALL loses to a tool that's PRESENT in every turn" — the
# session could recite the prohibition while breaking it a dozen times. This closes the
# affordance at the tool boundary, so there is nothing left to remember.
#
#   main loop + mutating git      → DENY   (dispatch the owning agent; conflicts go to a worktree)
#   main loop + merge/promote     → ASK    (consequential + irreversible: the HUMAN consents;
#                                           gh pr merge, issuekit pr merge / promote / prune --apply)
#   main loop + read-only git     → allow  (status/log/diff/show/fetch/ls-remote/rev-parse,
#                                           `branch`/`worktree list` — investigation IS its job)
#   main loop + issuekit (rest)   → allow  (search/new/attempt/resolve/branch/pr are the
#                                           SANCTIONED plumbing path — the line is ROLE, not risk)
#   sub-agent (agent_id present)  → allow  (the developer legitimately does git surgery)
#
# Carve-out: when the domain pack ships commit-gate.sh, an add/commit-only line is the pipeline's
# commit stage and is allowed through to THAT gate (which re-derives qa/review + their SHAs).
# Mirrors ui-control.js hasCommitGateHook() so both layers agree.
#
# Reads the PreToolUse payload on stdin; emits a decision (exit 0) only on a match.
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# Sub-agents keep full access — this gate is about the orchestrator's ROLE, not about risk.
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
[ -n "$agent_id" ] && exit 0

decision() { # $1 = deny|ask, $2 = reason
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":%s}}' \
    "$1" "$(printf '%s' "$2" | jq -Rs .)"
}

# This gate's whole job is routing the orchestrator to issuekit, and a terminal session has no
# prompt block saying which issuekit. Fallback first, so a missing helper costs the note, never the
# decision.
issuekit_note() { printf ' (`issuekit` means the copy shipped with this framework.)'; }
# shellcheck source=./issuekit-path.sh
. "$(dirname "$0")/issuekit-path.sh" 2>/dev/null || true

# Consequential + irreversible: merging and promoting to prod are the human's call, never a
# routing shortcut. ASK rather than DENY — the human IS the sanctioned approver here.
consent_re='(^|&&|\|\||;|\|)[[:space:]]*(rtk[[:space:]]+)?(gh[[:space:]]+pr[[:space:]]+merge|issuekit[[:space:]]+promote|issuekit[[:space:]]+pr[[:space:]]+merge|issuekit[[:space:]]+branch[[:space:]]+prune[^&|;]*--apply)([[:space:]]|$)'
if printf '%s' "$cmd" | grep -Eq "$consent_re"; then
  decision ask "Merge / promote is consequential and irreversible — the human gates it, not the orchestrator's throughput judgment. Confirm only if this merge is the agreed next step (and its checks are green: \`issuekit pr merge <PR#> --when-green\` refuses on a red run instead of merging blind).$(issuekit_note)"
  exit 0
fi

# The pipeline's commit stage: let add/commit through to the COMMIT GATE, which re-derives the lane
# verdicts and their recorded SHAs.
#
# The line must actually CONTAIN a commit. A standalone `git add` reaches no gate at all — the
# commit gate only judges `git commit` — so allowing it would let the main loop stage the user's
# working tree with nothing checking it and no prompt, for someone else to commit later. Staging
# rides along with the commit it is for, or not at all. (ui-control.js enforces the same pair for
# web-UI sessions; this hook is the terminal's half.)
addcommit_re='^[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(add|commit)[^&|;]*(&&[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(add|commit)[^&|;]*)*$'
commit_re='(^|&&|\|\||;|\|)[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit([[:space:]]|$)'
if [ -f "${CLAUDE_PLUGIN_ROOT:-}/hooks/commit-gate.sh" ] &&
  printf '%s' "$cmd" | grep -Eq "$addcommit_re" &&
  printf '%s' "$cmd" | grep -Eq "$commit_re"; then
  exit 0
fi

# State-mutating git. Read verbs stay open. Three shapes, mirroring ui-control.js GIT_MUTATE_RE:
# always-mutating subcommands; worktree/remote/submodule whose mutating VERB is the next word
# (their list/status forms stay open); and `git branch`, a READ unless a delete/move/force flag
# is present.
git_pre='(^|&&|\|\||;|\|)[[:space:]]*(rtk[[:space:]]+)?git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?'
mutate_re="${git_pre}""((add|commit|stash|rebase|merge|reset|push|pull|cherry-pick|revert|am|apply|restore|switch|checkout|rm|mv|clean|tag)([[:space:]]|"'$'")"'|worktree[[:space:]]+(add|remove|move|prune|repair|lock|unlock)|remote[[:space:]]+(add|remove|rm|rename|set-url|set-head|set-branches|prune)|submodule[[:space:]]+(add|update|init|deinit|sync|set-url|set-branch|absorbgitdirs)|branch[[:space:]]+([^&|;]*[[:space:]])?(-[DdMmCcf]|--(delete|move|copy|force|set-upstream-to|unset-upstream))([[:space:]]|$))'

if printf '%s' "$cmd" | grep -Eq "$mutate_re"; then
  decision deny "Orchestrator never touches the working tree — mutating git is denied for the MAIN LOOP (sub-agents keep it; read-only git stays open, since investigation is your job). The sanctioned paths: PR/branch plumbing → issuekit (\`issuekit branch <#>\`, \`issuekit pr <#>\`, \`issuekit pr update <PR#>\`, \`issuekit branch sync <name>\`) — ONE Bash call by you, never an agent dispatch; anything that changes code → dispatch the owning agent; a real conflict → have it work in an ISOLATED worktree from origin/<branch>, so the user's uncommitted changes are never staged, stashed or parked. Commits land via the pipeline's commit stage.$(issuekit_note)"
fi
exit 0

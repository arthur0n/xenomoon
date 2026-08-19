#!/usr/bin/env bash
# Shared commit-command parsing for the commit gate (PreToolUse) and the label stamp (PostToolUse).
#
# These two hooks MUST agree on three questions — is this a commit, how many commits are in the
# line, and which issue does the commit cite. When each answered them with its own regex they
# drifted: the gate learned to recognise `git -C <path> commit` while the stamp did not, so a
# hand-made commit in that shape landed gated but UNSTAMPED — the fix merged, the issue open.
# One parser, sourced by both, is the only version of this that stays true.

# Every shape the main-loop carve-outs allow through: an optional `rtk` wrapper is covered by the
# leading non-word class, and `-C <path>` / `-c key=value` may repeat before the subcommand.
# A `-C` path may be QUOTED, and a real one often is: `git -C "repo with spaces" commit` was not
# recognised as a commit at all, so the gate exited silently and the stamp never ran — a hand commit
# landing entirely outside the pipeline. Both quote styles and the bare form are accepted.
GIT_OPT='[[:space:]]+-[cC][[:space:]]+("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)'
COMMIT_TOKEN="(^|[^[:alnum:]_])git(${GIT_OPT})*[[:space:]]+commit([[:space:]]|$)"

# Is there a commit in this command at all?
# $1 = the command
is_commit() { printf '%s' "$1" | grep -Eq "$COMMIT_TOKEN"; }

# How many commits does this command run? `grep -c` counts LINES, and a chained command is one
# line, so the matches themselves are counted.
# $1 = the command
commit_count() { printf '%s' "$1" | grep -Eo "$COMMIT_TOKEN" | wc -l | tr -d ' '; }

# The issue this COMMIT cites — never a reference from elsewhere in the line.
#
# Two narrowings, each closing a way for the wrong issue to be picked: the slice starts at the
# commit token and stops at the next top-level separator (so `echo "(#123)" && git commit …` and
# `git commit … && echo "(#456)"` cannot supply it), and only `-m` / `--message` values are read
# (so a reference inside `--author` or a pathspec cannot either). No reference found prints
# nothing, and each caller decides what that means.
# $1 = the command
commit_issue() {
  local args msg
  args="$(printf '%s' "$1" | sed -E "s/^.*${COMMIT_TOKEN}//" | sed -E 's/[[:space:]]*(&&|\|\||;|\|).*$//')"
  msg="$(printf '%s' "$args" | sed -nE "s/.*(-m|--message)[[:space:]=]+'([^']*)'.*/\2/p")"
  [ -n "$msg" ] || msg="$(printf '%s' "$args" | sed -nE 's/.*(-m|--message)[[:space:]=]+"([^"]*)".*/\2/p')"
  [ -n "$msg" ] || msg="$(printf '%s' "$args" | sed -nE 's/.*(-m|--message)[[:space:]=]+([^[:space:]]+).*/\2/p')"
  printf '%s' "$msg" | grep -oE '\(#[0-9]+\)' | head -1 | tr -dc '0-9'
}

# The directory the commit actually runs in. `git -C <path> commit` commits in ANOTHER repo, so a
# caller that checks HEAD — or edits an issue — in the hook's own cwd is inspecting the wrong tree
# and can label an issue in a repo that never committed. Prints nothing when there is no -C, which
# every caller reads as "here".
# $1 = the command
commit_dir() {
  local before raw
  # Only the options BEFORE the subcommand can select the repo — so a `-C` inside the commit
  # message is not mistaken for one.
  before="$(printf '%s' "$1" | sed -E 's/[[:space:]]+commit([[:space:]].*)?$//')"
  raw="$(printf '%s' "$before" |
    grep -oE -- "-C[[:space:]]+(\"[^\"]*\"|'[^']*'|[^[:space:]]+)" | tail -1 |
    sed -E 's/^-C[[:space:]]+//')"
  # strip one layer of quoting, so callers can use the value directly
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "$raw"
}

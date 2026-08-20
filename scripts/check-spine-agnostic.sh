#!/usr/bin/env bash
# check-spine-agnostic.sh — the ONE deterministic check behind /sync-framework.
# It answers a yes/no question with no judgment: did game/godot identity or a
# named project's specifics leak into the framework spine? Everything that needs
# *analysis* (which conflict takes theirs, is this agnostic or project-specific,
# is a finding worth keeping) lives in the /sync-framework command, not here.
#
# Detection is by-construction precise so it never trips on docs that merely
# *discuss* these patterns (this script, the command, the fork runbooks):
#   - godot engine payload  -> file PRESENCE by extension (not a content grep)
#   - game identity         -> the role-MAP keys, in *.js only (where the map lives)
#   - project hardcoding     -> the project's name in the spine, minus this command's own doc
#
# Exit 0 = clean. Exit 1 = leak (printed). Exit 2 = usage error.
#
#   --project <term>   also fail if this term is hardcoded into the spine
#   --no-project       skip check 3 entirely (opt out of the auto-derived terms)
#
# Check 3 AUTO-DERIVES its terms from the bound project when no --project is given: `npm run
# check:agnostic` (and CI) pass no flag, so the branch used to be dead in the only gate anyone
# actually runs — it fired solely from /sync-framework. The terms come from `denylistFor()` in
# ui/server/features/promotions/contamination.js — ONE definition of "a project proper noun"
# (project dir basename + package.json name, generic words and <3-char junk filtered), shared
# with the contamination gate so the two can't drift apart. No bound project, no node, no
# descriptor -> no terms, and check 3 skips exactly as before.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=""
SKIP_PROJECT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="${2:-}"; shift 2 ;;
    --no-project) SKIP_PROJECT=1; shift ;;
    *) echo "usage: check-spine-agnostic.sh [--project <term>] [--no-project]" >&2; exit 2 ;;
  esac
done

DERIVED=0
if [ -z "$PROJECT" ] && [ "$SKIP_PROJECT" = 0 ] && [ -f .xenomoon.json ] && command -v node >/dev/null 2>&1; then
  # An ERE alternation of the bound project's proper nouns ("acme|acme-web"), or empty.
  PROJECT="$(node --input-type=module -e '
import { readFileSync } from "node:fs";
import { denylistFor } from "./ui/server/features/promotions/contamination.js";
const dir = JSON.parse(readFileSync(".xenomoon.json", "utf8")).projectDir;
if (typeof dir === "string" && dir) console.log(denylistFor(dir).join("|"));
' 2>/dev/null || true)"
  [ -n "$PROJECT" ] && DERIVED=1
fi

leak=0

# 1. Godot engine payload — any engine file in the tree is a hard leak.
engine=$(git ls-files -- '*.tscn' '*.gd' '*.import' '*.godot' || true)
if [ -n "$engine" ]; then
  echo "FAIL: godot engine files present —" >&2
  echo "$engine" >&2
  leak=1
fi

# 2. Game identity — the role-MAP keys live in JS (e.g. ui/client/.../agents.js).
KEYS='"(game|level)-designer"[[:space:]]*:'
if git grep -nIE "$KEYS" -- '*.js' >/dev/null 2>&1; then
  echo "FAIL: game role-map keys in the spine —" >&2
  git grep -nIE "$KEYS" -- '*.js' >&2 || true
  leak=1
fi

# 3. Project hardcoding — the bound project's name baked into the framework. Case-INSENSITIVE:
#    the terms arrive lowercased, and a leak writes the project's name the way prose does
#    ("Acme"), so a case-sensitive match would sail straight past the real thing.
#
#    NO EXCLUSIONS. There used to be one, for a shipped command doc that named a project as an
#    example — and it outlived the file by the whole re-homing that deleted it, sitting here as a
#    pathspec for something no longer in the tree. Its successor is a shipped SKILL, and a skill
#    naming somebody's project is the contamination this check exists to catch, so the allowance
#    should not follow the content. Everything under domains/, plugin/ and ui/server/ ships to every
#    project; if one of them ever needs an example, it uses a made-up name.
if [ "$SKIP_PROJECT" = 0 ] && [ -n "$PROJECT" ] &&
   git grep -nIEi "$PROJECT" -- domains plugin ui/server >/dev/null 2>&1; then
  echo "FAIL: project term '$PROJECT' hardcoded into the framework (it belongs in the project's own CLAUDE.md) —" >&2
  git grep -nIEi "$PROJECT" -- domains plugin ui/server >&2 || true
  leak=1
fi

if [ "$leak" = 0 ]; then
  # Plain `if`s, not `[ x ] && y` chains: under `set -e` a false test at the end of the list
  # exits the script before the ok line ever prints (it did, silently, until this comment).
  scope="no project hardcoding"
  if [ "$SKIP_PROJECT" = 1 ]; then
    scope="project check SKIPPED (--no-project)"
  elif [ -n "$PROJECT" ]; then
    if [ "$DERIVED" = 1 ]; then
      scope="$scope (terms: '$PROJECT', auto-derived from .xenomoon.json)"
    else
      scope="$scope (terms: '$PROJECT')"
    fi
  else
    scope="$scope (NO project bound — check 3 did not run)"
  fi
  echo "ok — spine agnostic: no godot engine files, no game role-map keys, $scope."
fi
exit "$leak"

#!/usr/bin/env bash
# Where THIS install's issuekit lives — for hook messages that tell an agent to use it.
#
# The system prompt names the path for sessions the framework's own server spawns. Hooks are the
# OTHER surface: a terminal `claude` session loads the plugin and gets these guards with no prompt
# block at all, so a deny that says "use `issuekit pr update`" is, on a machine carrying an older
# standalone copy on PATH, routing someone to a different program — precisely when the guard is
# trying to route them away from raw git. Both surfaces must name the same path or the convention
# only holds where it was already easy.
#
# Hooks are invoked as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh"`, so the plugin root is known
# and the framework root is its parent.

ISSUEKIT_PATH=""

# FIRST: the absolute path the installer recorded, which lives inside the plugin tree and therefore
# travels with it. Deriving from CLAUDE_PLUGIN_ROOT's parent (below) assumes the plugin is loaded
# where it was built; an install route that COPIES the directory breaks that quietly — the guard
# still fires, its advice just stops naming a path. The recorded file survives the copy.
_ik_recorded="$(dirname "$0")/issuekit-path.generated"
if [ -r "$_ik_recorded" ]; then
  _ik="$(head -1 "$_ik_recorded" 2>/dev/null || true)"
  [ -n "$_ik" ] && [ -f "$_ik" ] && ISSUEKIT_PATH="$_ik"
fi

# THEN: the in-place layout, for a tree that has not been installed through the CLI yet.
if [ -z "$ISSUEKIT_PATH" ] &&
  [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] &&
  [ -f "$CLAUDE_PLUGIN_ROOT/../ui/server/cli/issuekit.js" ]; then
  ISSUEKIT_PATH="$(cd "$CLAUDE_PLUGIN_ROOT/../ui/server/cli" && pwd -P)/issuekit.js"
fi

# One sentence to append to a message that named `issuekit`. Resolving is best-effort by design: a
# guard must still fire with its full reason when the path cannot be worked out, so the fallback
# states the rule without the path rather than staying silent about it.
#
# The path is SHELL-QUOTED in the suggestion. Install roots contain spaces often enough
# (`/Users/me/Code/My Project/…`) that a bare one turns the advice into a command that runs something
# else — at the exact moment the reader is already stuck on a denied command.
_ik_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
issuekit_note() {
  if [ -n "$ISSUEKIT_PATH" ]; then
    printf ' (`issuekit` here means THIS install'"'"'s copy — run it as `node %s`; a bare `issuekit` on PATH may be an older version missing verbs this pipeline needs.)' "$(_ik_quote "$ISSUEKIT_PATH")"
  else
    printf ' (`issuekit` means the copy shipped with this framework — not necessarily a bare `issuekit` on PATH, which may be an older version.)'
  fi
}

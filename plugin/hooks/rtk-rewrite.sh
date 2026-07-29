#!/usr/bin/env bash
# PreToolUse(Bash) — route shell commands through rtk (Rust Token Killer) when it is
# installed on this machine. rtk rewrites the command to its token-filtered equivalent
# (`git status` → `rtk git status`, 60-90% output reduction on common dev commands) and
# passes anything it has no filter for through unchanged.
#
# rtk is EXTERNAL and optional: the framework never ships or requires it. This hook is
# the "verify it exists and bring it in" step — `command -v` gates it, so on a machine
# without rtk it exits 0 silently and sessions behave exactly as before. Runs FIRST in
# the Bash chain so the destructive-op guards and the usage logger see the final command.
command -v rtk >/dev/null 2>&1 || exit 0
exec rtk hook claude

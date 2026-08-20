#!/usr/bin/env bash
# Shared port + ownership rules for ./start_server and ./stop_server. SOURCE it, do not run it, and
# only after `cd`-ing to the install root.
#
# These two scripts must agree on three questions — which port this install binds, which listener on
# it is OURS, and what to do about one that is not. When each answered on its own, they disagreed in
# the most damaging direction: stop refused to touch a server it could not prove was ours (good),
# while start killed WHATEVER held the port, no questions asked. Two installs both defaulting to
# 3117 is the common case, so starting one silently killed the other — and any unrelated program on
# that port with it.

# Port: env override → the bound install's configured port → the default. Both scripts must resolve
# it identically or one of them reclaims, announces or inspects a port the server never binds.
CONFIGURED_PORT="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(".xenomoon.json","utf8")).port??"")}catch{console.log("")}' 2>/dev/null || true)"
PORT="${PORT:-${CONFIGURED_PORT:-3117}}"

# PHYSICAL path. `cd` keeps the logical spelling (symlinks intact) while lsof reports the kernel's
# canonical cwd, so comparing raw strings would call this install's own server a stranger.
INSTALL_DIR="$(pwd -P)"

# Whose server is this? A cwd EQUAL to the install is ours, and so is one beneath it — a server
# started from a subdirectory is still this install's. But "beneath it" is not ownership on its own:
# a nested checkout, a git worktree or a fixture app under this tree is a DIFFERENT install with its
# own lifecycle.
#
# So the boundary is the NEAREST install root, not the path prefix: walk up from the listener's cwd
# and stop at whichever comes first. Reaching this install first means ours; meeting another install
# marker on the way means it belongs to that one. The walk stops at INSTALL_DIR without requiring a
# marker there, so an unbound trunk still recognises its own server.
# $1 = the listener's cwd
belongs_to_this_install() {
  local dir="$1"
  [ -n "$dir" ] || return 1
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ "$dir" = "$INSTALL_DIR" ]; then return 0; fi
    # a nearer install root — that server is its business, not ours
    if [ -f "$dir/.xenomoon.json" ]; then return 1; fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# The working directory of a process, or nothing when it cannot be read.
# $1 = pid
listener_cwd() {
  lsof -p "$1" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

# The entry point every UI server runs. Recorded here because "is this our server?" must be asked
# the same way everywhere.
SERVER_ENTRY="ui/server/core/index.js"

# Is this PID really one of our servers? A recorded PID is only a number, and the OS reuses numbers:
# by the time a stale ui.pid is read, that PID may belong to somebody else's editor, shell or build.
# Signalling it on the strength of a file we wrote hours ago is how a stop command kills a stranger.
#
# Two proofs, both required: the process RUNS this install's server entry, and its working directory
# belongs to this install. The command alone would match a sibling install's server; the cwd alone
# would match any process a user happened to start from this directory.
#
# "Runs" means the entry is the SCRIPT ARGUMENT — the very first thing after the node binary, which
# is how start_server launches it. Anything looser is forgeable by accident: a test first accepted
# the entry appearing anywhere in the command line, and a bystander whose argv merely MENTIONED the
# path (`node -e '… /* ui/server/core/index.js */'`) passed the proof and was killed for it. The
# position is what separates running the file from talking about it.
#
# `ps -o args=` is a flat string, so word boundaries are whitespace, not real argv boundaries — the
# reason a "whole word anywhere" test was not enough either. Position survives that flattening: a
# `node -e <code>` command line puts code, not a path, in the script slot.
# $1 = pid
is_our_server_process() {
  local pid="$1" args # `set --` below overwrites $1, so keep the pid before it does
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [ -n "$args" ] || return 1
  # shellcheck disable=SC2086 # deliberate word splitting: these are argv words
  set -- $args
  [ $# -ge 2 ] || return 1
  shift # drop the node binary; the script argument is now $1
  case "$1" in
    "$SERVER_ENTRY" | "./$SERVER_ENTRY" | "$INSTALL_DIR/$SERVER_ENTRY") ;;
    *) return 1 ;;
  esac
  belongs_to_this_install "$(listener_cwd "$pid")"
}

# Stop a PID that has ALREADY been proven ours, and do not return until that is true or hopeless:
# SIGTERM → wait → RE-PROVE → SIGKILL → wait. Returns 0 when the process is gone, 1 when it is not.
#
# Both scripts call this because both were claiming victory on delivery rather than on death. A
# server that is SIGSTOPped or stuck in shutdown swallows the TERM and keeps the port, and a "stop"
# that only means "signal sent" told the user it was down, deleted the pid file, and let a restart
# start a sibling on a port that was never freed.
#
# The re-proof before SIGKILL is not ceremony: by then the earlier proof is seconds old, and a PID
# freed by the TERM can already belong to somebody else.
# $1 = pid
stop_proven_pid() {
  local pid="$1" i
  # Re-prove before the FIRST signal too. The caller's proof is already in the past by the time we
  # get here, and a PID freed in between belongs to whoever the OS gave it to next — so the proof
  # has to sit adjacent to the signal, not merely upstream of it.
  kill -0 "$pid" 2>/dev/null || return 0 # already gone: nothing to stop, and nothing to signal
  if ! is_our_server_process "$pid"; then
    echo "  PID $pid is no longer this install's server — not signalling it."
    return 1
  fi
  kill "$pid" 2>/dev/null || true
  for i in $(seq 1 25); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  if is_our_server_process "$pid"; then
    echo "  PID $pid did not stop on request — forced it."
    kill -9 "$pid" 2>/dev/null || true
  fi
  for i in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.2
  done
  return 1
}

# Scan the port, publishing BOTH answers as globals: PORT_LISTENERS (the PIDs) and LSOF_COMPLAINT.
#
# Globals rather than a printed result, because the two must arrive together. lsof answers "nothing
# is listening" and "I could not look" with the SAME exit code, separable only by whether it
# complained on stderr — and a function whose output is captured with $(…) runs in a SUBSHELL, so a
# complaint assigned inside it never reaches the caller. Written that way first, and it silently
# turned "could not check" back into "port is clear": the exact failure the complaint exists to
# prevent, reintroduced by the plumbing meant to share it.
#
# Callers MUST check LSOF_COMPLAINT before reading an empty PORT_LISTENERS as a clear port.
PORT_LISTENERS=""
LSOF_COMPLAINT=""
port_listeners() {
  local err
  err="$(mktemp)"
  PORT_LISTENERS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>"$err" || true)"
  LSOF_COMPLAINT="$(head -1 "$err")" # its first line says what went wrong; the rest is a usage dump
  rm -f "$err"
}

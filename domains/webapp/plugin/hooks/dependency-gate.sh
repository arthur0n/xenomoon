#!/usr/bin/env bash
# PreToolUse(Bash) — DETERMINISTIC dependency gate. A new dependency is a DESIGN decision, not an
# implementation detail: an uninvited `pnpm install <pkg>` once wrote a ~350-line jsdom subtree
# into the lockfile that no agent could clean (destructive git is gated). Enforced here, not by
# prompt discipline:
#
#   lockfile-MUTATING commands (pnpm add/remove, pnpm/npm/yarn/bun install|add|uninstall with
#   package args, bare `pnpm install` / `npm install` — which re-resolve and re-pin):
#     sub-agent (agent_id present) → DENY. Name the exact dep in the ANALYSIS/PRD and surface
#                                    the decision to the human; never install uninvited.
#     main session                 → ASK. The human approves each lockfile change explicitly.
#
#   lockfile-FAITHFUL syncs pass through untouched: `pnpm install --frozen-lockfile`, `npm ci`.
#
# Reads the PreToolUse payload on stdin; emits a decision only on a match.
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"

# Any package-manager invocation of an installing/removing subcommand?
printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])(pnpm|npm|yarn|bun)[[:space:]]+(add|remove|install|i|uninstall|rm)([[:space:]]|$)' || exit 0

# Faithful syncs are free: frozen-lockfile installs and npm ci (no mutation possible).
if printf '%s' "$cmd" | grep -Eq -- '--frozen-lockfile' ||
  printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])npm[[:space:]]+ci([[:space:]]|$)'; then
  exit 0
fi

agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
if [ -n "$agent_id" ]; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Dependency changes are a DESIGN decision — agents never install/add/remove packages (this mutates the lockfile, which agents cannot clean; an uninvited test-lib install once dirtied it for good). If the fix genuinely needs a new dependency: name the exact package in your report/ANALYSIS and surface the decision to the human. To sync node_modules to the COMMITTED lockfile, use `pnpm install --frozen-lockfile` (allowed)."}}'
else
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"This mutates package.json and/or the lockfile (adds/removes/re-pins dependencies). A dependency change is a design decision — confirm to proceed. For a lockfile-faithful sync use `pnpm install --frozen-lockfile` / `npm ci` (those pass without asking)."}}'
fi
exit 0

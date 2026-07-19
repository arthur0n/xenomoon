---
description: Run the project's capped Playwright acceptance suite against a running app (POC-first, Clerk storageState) — out-of-band of the per-issue chain
argument-hint: "[scenario — default poc]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `uat-runner` agent. It runs ONLY the project's own `e2e`/`uat` npm
script against an **already-running** app (it asks for the base URL, never boots
servers), reuses a saved Clerk session, and refuses to exceed the resource caps. The
agent is the stable core; this command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Resolve the repo** if you need it: use `{{REPO}}`; else
   `gh repo view --json nameWithOwner -q .nameWithOwner`.

2. **Scenario = the argument, default `poc`.** `poc` = the minimal proof, run before any
   larger investment: load the base URL with the saved session → assert a known
   post-login element → confirm one critical user-scoped read path renders non-empty.
   Nothing larger until the POC is stable across runs.

3. **Spawn one `uat-runner` agent** (Agent tool, `subagent_type: "uat-runner"`) with the
   scenario, e.g. _"UAT poc."_ It will ask you for the **base URL** via `mcp__ui__ask`
   (it does not boot servers — the app must already be up).

4. **Report** the agent's result: scenario, pass/blocked, the load-bearing assertion
   (post-login element + non-empty read path), the base URL, and — on failure — the next
   move.

## Caps (the runner refuses to exceed them — past unbounded runs killed the machine)

The run is headless, `workers: 1`, `fullyParallel: false`, chromium-only, `retries: 0`,
with strict per-test/expect/action/nav timeouts + a global cap; `trace`/`video` off,
`screenshot` only-on-failure; explicit teardown. These live in the **project's Playwright
config** — the runner runs the project's script, never a hand-assembled unbounded
`playwright test`. If the project's config isn't capped, the runner refuses until it is.

## One-time Clerk setup (manual, human)

Auth is a saved `storageState`, never an automated login:

1. A **human signs in once** through the real Clerk form and saves the session to a
   **gitignored** `.auth/clerk-user.json` (per the project `CLAUDE.md` → Acceptance
   testing).
2. The Playwright config's `use.storageState` reuses that file — the runner never types
   credentials and never drives the Clerk form.
3. **Rotation = re-run the manual sign-in.** If a run fails auth (bounced to sign-in,
   post-login element absent), the runner reports "storageState stale — re-run the manual
   sign-in"; the human refreshes the file. Never automate the Clerk form.

## Notes

- **UAT is out-of-band of the per-issue chain.** It does NOT apply `qa:*`/`review:*` and
  does NOT gate any commit. It's batch acceptance.
- A **`uat:blocked` failure files a new `/feedback` bug** (with the failing step) — it
  doesn't loop an existing issue back.
- Run `/uat poc` after a batch of fixes deploys, to confirm the app still loads a real
  user's data end-to-end. Grow the suite only once the POC proves stable.

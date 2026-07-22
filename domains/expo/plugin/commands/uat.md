---
description: Run the project's Maestro acceptance flows on a booted iOS Simulator against an already-running app (POC-first, persisted session) — out-of-band of the per-issue chain
argument-hint: "[scenario — default poc | <flow name>]"
allowed-tools: Bash, Agent, Read, Grep, Glob
---

Trigger for the `maestro-runner` agent. It runs ONLY the project's own Maestro / e2e
script against an app **already running on a booted iOS Simulator** (it never boots
servers and never rebuilds the app), reuses a persisted auth session, and returns
PASS / FAIL / BLOCKED with screenshot evidence. The agent is the stable core; this
command is just the trigger.

Arguments: `$ARGUMENTS`

## Steps

1. **Scenario = the argument, default `poc`.** `poc` = the minimal proof, run before any
   larger investment: launch the app with the persisted session → assert a known
   post-login element → confirm one critical user-scoped read path renders non-empty.
   A named flow runs just that flow. Nothing larger until the POC is stable across runs.

2. **Preconditions are the human's/orchestrator's job, not the runner's**: a booted
   simulator with the app installed and (for dev builds) Metro up from THIS checkout,
   plus a persisted auth session from the one-time manual sign-in. The project
   `CLAUDE.md` → Acceptance testing documents the device, launch script, and session
   mechanism. The runner verifies these and reports BLOCKED if missing — it doesn't
   fix them.

3. **Spawn one `maestro-runner` agent** (Agent tool, `subagent_type: "maestro-runner"`)
   with the scenario, e.g. _"UAT poc."_

4. **Report** the agent's result: scenario, PASS/FAIL/BLOCKED, the load-bearing
   evidence (assertion or failing step + screenshot), the simulator device, and — on
   failure — the next move.

## Auth (one-time, manual)

Maestro **cannot automate Sign in with Apple** or any real sign-in form:

1. A **human signs in once** in the app on the simulator; the session persists on the
   device (keychain/secure storage — mechanism per the project `CLAUDE.md`).
2. Flows launch the already-authenticated app and assert past the gate.
3. **Rotation = re-run the manual sign-in.** If a run bounces to sign-in or dies
   pre-app, the runner reports "persisted session stale — re-run the manual sign-in";
   never script the form.

## Notes

- **UAT is out-of-band of the per-issue chain.** It applies no `qa:*`/`review:*` labels
  and gates no commit. It's batch acceptance.
- A **FAIL files a new `/feedback` bug** (with the failing step + screenshot) — it
  doesn't loop an existing issue back. A **BLOCKED** is an environment/harness finding,
  not a feature bug.
- Run `/uat poc` after a batch of fixes ships to the simulator build, to confirm the app
  still loads a real user's data end-to-end. Grow to named flows only once the POC
  proves stable.

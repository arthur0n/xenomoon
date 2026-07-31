---
name: android-local-uat
agents: [uat-runner]
description: Running Maestro acceptance flows against an Expo/RN Android app on the emulator — ordered flow execution, adb text-input limits, state-wipe rituals, cold-start launch-anchor flakes, and the audit-before-repair discipline after UI changes. Load when executing or diagnosing a Maestro UAT run on Android.
---

# Maestro UAT on the Android emulator — discipline

The Android mirror of `ios-local-uat` (auth via persisted session, PASS/FAIL/BLOCKED
verdicts, screenshot evidence — all of that carries over). These are the
Android-specific constraints and the run discipline learned the hard way.

## Execution mechanics

- **Order is not what you think.** Maestro ignores `config.yaml` ordering when given a
  directory — the runner script must pass **ordered file arguments** explicitly.
  Order matters because of state coupling (see the wipe ritual below).
- **`adb input text` cannot type accents.** Assertion text may be accented; _typed_
  text must stay ASCII. Write flows accordingly (type "vestido", assert "PRÓXIMA").
- **Optional parity blocks cost real time.** An `optional: true` wait for a testID
  that doesn't exist on this platform burns its full timeout every run. Porting a
  sibling-platform guard verbatim is fine for textual parity, but document in the flow
  comment that it's a no-op here and keep its timeout small.

## The state-wipe ritual

A suite that ends with a signed-out/`clearState` flow **wipes local state** (session
and/or local onboarding flags) as its last act. Consequences to plan for:

- After every full run, the app is signed out; the next signed-in run needs the
  project's manual sign-in ritual first (Maestro never automates real sign-in).
- Local onboarding flags are gone too — the next human session walks the full
  first-run gate. Keep the exact gate-dismissal ritual (button labels × counts, e.g.
  "ENTENDI, then COMEÇAR, then PULAR ×5") written in the project's CLAUDE.md, and
  **update it whenever onboarding changes** — a redesign that adds a question or an
  intro panel silently invalidates the documented ritual.
- Corollary: you cannot re-run a single failed signed-in flow after the suite
  finished — the wipe already happened. Diagnose from artifacts (Maestro's command
  JSON, screenshots), don't blindly relaunch.

## Cold-start launch-anchor flakes

Every flow starts by anchoring on a home-screen element with a timeout. Under memory
pressure — typically right after a long live-backend flow — first paint can exceed a
20s anchor. That failure is the **launch subflow**, not the flow's behavior under
test: classify it BLOCKED-shaped (env/timing), harden the anchor timeout toward the
suite's post-wipe cold-start ceiling (~30s), and re-verify. A flow that fails inside
its own body is a real FAIL; a flow that never got past the anchor is not.

## Don't mutate the tree during a run

Editing app source while the suite runs triggers Metro hot-reload **mid-flow** and
flakes whatever was on screen. Merges, formatters, and codegen count as edits. One
tree, one activity at a time: land code first, then run UAT — never both in parallel
on the same checkout.

## After a UI redesign: audit before repairing

A big visual redesign usually breaks fewer flows than expected — flows anchor on
testIDs and stable labels, not layout. Before rewriting flows, audit: grep the flows
for every asserted testID/label, then grep the new UI for each one. Repair only the
genuinely-changed anchors; additive UI (a new lane, a new pill) typically needs zero
flow changes plus at most one new smoke assertion. Rewriting green flows to "match
the redesign" is churn that destroys their regression value.

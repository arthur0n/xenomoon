---
name: expo-sim-run
agents: [maestro-runner]
description: Launch knowledge for Expo/RN iOS apps on the Simulator — the failure modes between "code compiles" and "app usable on a booted sim". Load when verifying sim-launch preconditions, diagnosing a red-screen / missing-native-module error, or explaining why a launch is BLOCKED. The launch specifics (scheme, device, script name) always come from the project's CLAUDE.md; this skill is the generic playbook around them.
---

# Expo iOS Simulator launch — the generic playbook

An Expo/RN app "running on the simulator" is a chain: **booted simulator → native build
installed → Metro bundler up (dev builds) → app launched and past its gates**. Each link
has a known failure mode. The project's `CLAUDE.md` names the concrete script, scheme,
and target device — read it first; this skill is the diagnostic knowledge around it.

## The chain, link by link

1. **Booted simulator.** `xcrun simctl list devices booted` — the project's target
   device (from `CLAUDE.md`) must be booted. Boot with
   `xcrun simctl boot "<device>"` + `open -a Simulator`. Idempotent: booting a booted
   device is a no-op error you can ignore.

2. **Native build.** Prefer the project's own sim script (the domain `sim` command)
   over `expo run:ios`: on some machines `expo run:ios` fails its certificate check
   even for sim builds, and the reliable path is **raw `xcodebuild`** against the
   workspace with signing disabled (`CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES`,
   `-destination 'generic/platform=iOS Simulator'`), then `xcrun simctl install` +
   `simctl launch`. A project that hit this ships a script encoding it — use that
   script; never re-derive the invocation ad hoc.

3. **Metro bundler identity (dev builds) — the classic trap.** Metro serves one
   checkout on port 8081. If a **different checkout** (another project, another clone)
   owns the port, the app loads a foreign bundle and dies with red-screen
   **"Cannot find native module"** errors that look like build failures but aren't.
   Check who owns the port before trusting any red screen:
   `lsof -nP -iTCP:8081 -sTCP:LISTEN` — verify the process's working directory is THIS
   checkout. Wrong owner → that Metro must be stopped and this project's dev server
   started; do not "fix" the phantom native-module error in code.

4. **Launch gates.** First launch may hit system dialogs (verification prompts,
   permission alerts) and app-side onboarding gates. These are launch-flow concerns —
   for UAT they belong in the project's launch subflow (see `maestro-sim-uat`), not in
   per-flow logic.

## JS change vs native rebuild — the routing rule

- **Hot-reload is enough**: TS/TSX/JS-only changes — Metro reloads them; no rebuild.
- **Full native rebuild required**: adding/upgrading a native dependency, changing the
  Expo config (`app.json` plugins, entitlements, splash, icons), or touching the
  generated native shell. Symptom of skipping it: the JS calls a native module the
  installed binary doesn't contain → the same "cannot find native module" red screen
  as the Metro-identity trap. Check Metro ownership FIRST (cheap), then suspect a
  missing rebuild.

## Verdict for runners

A broken link in this chain is **BLOCKED**, never FAIL — the app wasn't testable. Name
the broken link and the one-line fix (boot the device / run the project's sim script /
reclaim the Metro port / re-run the native build).

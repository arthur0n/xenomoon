---
name: domain-conventions
agents: [developer, tester]
domain: expoapp
description: The Expo / React Native non-negotiables — the project's package scripts are the only authority (a global tsc shadows the workspace pin), platform-specific APIs are cross-platform defects, and every change must declare which side of the native-rebuild line it is on. Load before writing code in an Expo/RN project; the project's own CLAUDE.md overrides anything here.
---

# Expo / React Native conventions — the floor under every change

Generic orientation for an Expo/RN project targeting both platforms. **The project's `CLAUDE.md` is
authoritative** — where it disagrees, it wins.

## Verify ONLY through the project's package scripts

`pnpm validate`, `npm run build`, whatever `CLAUDE.md` lists — never a bare compiler binary. A
globally installed `tsc` **shadows the workspace's pinned TypeScript** and reports phantom errors
the project's own gate passes cleanly. Seen live, and it costs an hour every time.

If a bare tool disagrees with the package script, **the package script is the authority.** Report
what the script said.

## Cross-platform by default

This is one codebase and two products; a platform-specific API is a live defect on the other lane,
not a limitation.

- iOS-only RN APIs (`ActionSheetIOS`, `Alert.prompt`, …) break the Android lane. Use the
  cross-platform equivalent the project's conventions name; its lint guard usually blocks these
  already.
- The mirror holds: an Android-only native module must be platform-gated (`Platform.OS` around
  `requireNativeModule`) or iOS crashes at boot — before any screen renders, so it reads as "the
  app is broken" rather than "that feature is missing".

## Declare which side of the native-rebuild line you are on

**Say it in your report, every time.** It sets everyone's expectations before anyone tries to test.

- **JS/TS only** → hot-reloads through Metro. Testable immediately.
- **Native deps, Expo config plugins, the native shell, `app.json` native config** → needs a full
  native rebuild (EAS/xcodebuild, minutes not seconds). A stale generated project silently reuses
  the old native config, so "it didn't change anything" is the expected symptom of skipping it.

## Never add or remove a dependency

Unless the spec names that exact package. In this stack a new dep frequently crosses the native
line too, turning an implementation detail into a rebuild everyone else has to absorb. Tests use
the project's existing runner.

## Launching to check your work

Load the pack's `ios-local-run` / `android-local-run` skill for the project's launch lane. Never
improvise an `xcodebuild` or `gradle` invocation — the lane encodes the flags that make a local
build reproducible, and a hand-rolled one usually produces a build nobody else can repeat.

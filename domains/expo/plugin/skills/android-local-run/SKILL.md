---
name: android-local-run
agents: [uat-runner]
description: Launch knowledge for Expo/RN Android apps on the emulator — the failure modes between "code compiles" and "app usable on a booted AVD". Load when verifying emulator-launch preconditions, diagnosing a red-screen / stale-native-project error, or explaining why a launch is BLOCKED. The launch specifics (AVD name, Metro port, script name) always come from the project's CLAUDE.md; this skill is the generic playbook around them.
---

# Expo Android emulator launch — the generic playbook

The Android mirror of `ios-local-run`. An Expo/RN app "running on the emulator" is a
chain: **booted AVD → current native build installed → Metro up on the RIGHT port →
app launched and past its gates**. Each link has a known failure mode. The project's
`CLAUDE.md` names the concrete AVD, port, and script — read it first.

## Environment: a CLI-only SDK is normal

No Android Studio required. The chain needs only:

```bash
export ANDROID_HOME=<sdk root>            # e.g. a homebrew android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
export JAVA_HOME=<jdk17 root>
```

`adb devices` is the ground truth for "is an emulator up" — check it before booting
another one. The project's launch script should encode the full boot stack
(resolve AVD → boot → wait for `sys.boot_completed` → Metro → build → install →
launch); use that script, never re-derive it ad hoc.

## The stale-prebuild trap (CNG projects)

With Continuous Native Generation, `android/` is disposable output of `expo prebuild`.
The classic guard — "prebuild only if `android/` is absent" — **silently ignores native
config changes**: a new config plugin or an `app.json` edit lands, the stale `android/`
is reused, the build exits 0, and the change simply isn't in the APK. No error anywhere.

The correct guard re-prebuilds when native config is NEWER than the generated project:

```bash
if [ ! -d android ]; then
  npx expo prebuild -p android
elif [ -n "$(find app.json plugins -newer android/gradle.properties 2>/dev/null | head -1)" ]; then
  npx expo prebuild -p android --clean
fi
```

`--clean` is safe exactly when `android/` is pure CNG output (gitignored, no manual
native edits) — verify that before wiring it into a script.

## Metro port identity — the Android twist

Two checkouts sharing Metro's default port produce phantom "cannot find native module"
red screens (same trap as iOS — see `ios-local-run`). The Android twist: on the emulator
the app dials **`10.0.2.2:<port>` — the HOST — directly**, so `adb reverse` alone
CANNOT remap a port baked into the APK. A second checkout must bake its own port into
the debug build via the gradle property `reactNativeDevServerPort` (a config plugin
using `withGradleProperties`; the RN gradle plugin's finalizeDsl hook overrides any
`resValue` attempt, so the property is the only override that sticks).

Diagnosis order on any red screen: (1) who owns the Metro port (`lsof -nP
-iTCP:<port> -sTCP:LISTEN`, cwd must be THIS checkout), (2) was a native-config change
built into the installed APK (stale-prebuild trap), (3) only then suspect the code.

## JS change vs native rebuild — the routing rule

- **Hot-reload is enough**: TS/TSX/JS-only changes.
- **Rebuild + reinstall required**: native deps, `app.json` / config-plugin changes,
  anything under the generated shell. A plugin that only mods the OTHER platform
  (e.g. an iOS-only StoreKit plugin) still dirties `app.json` — the staleness guard
  will re-prebuild; that's correct and harmless, let it run.
- To reset JS state without a rebuild: `adb shell am force-stop <pkg> && adb shell am
start -n <pkg>/.MainActivity`. First paint after that can take 15–30s while Metro
  rebundles — a black screen there is loading, not a crash.

## Shell-script hygiene (macOS hosts)

Launch scripts run under stock macOS `/bin/bash` **3.2**, which mishandles a UTF-8
ellipsis (`…`) immediately after a `$VAR` interpolation under `set -u` — the bytes are
parsed into the variable name and the script dies with a spurious "unbound variable".
Use ASCII `...` in echo strings. Symptom: the script aborts right after an
interpolating log line, with an error naming a variable that plainly exists.

## Live-connection noise

A WebSocket "reconnecting…" banner on the emulator is usually a live-connection
hiccup that settles on its own or on relaunch — not a freeze, not a build problem.
Don't diagnose transport flaps as app breakage.

## Verdict for runners

A broken link in this chain is **BLOCKED**, never FAIL — the app wasn't testable.
Name the broken link and the one-line fix (boot the AVD / re-run prebuild `--clean` /
reclaim or rebake the Metro port / reinstall the build).

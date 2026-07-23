---
name: ios-local-uat
agents: [uat-runner]
description: Running Maestro acceptance flows against an Expo/RN iOS app on the Simulator — persisted-session auth (Maestro cannot drive Sign in with Apple), gate-aware launch subflows, the dev-overlay tap-eating trap, and the PASS/FAIL/BLOCKED verdict discipline with screenshot evidence. Load when executing or diagnosing a Maestro UAT run.
---

# Maestro UAT on the iOS Simulator — discipline

Maestro drives the real UI of the installed app. That gives true end-to-end evidence —
and three structural constraints every run must respect.

## 1. Auth is a persisted session, never an automated form

Maestro **cannot automate Sign in with Apple** (secure system UI) — and no real
sign-in form should ever be scripted with credentials. The contract:

- A human signs in **once** in the app on the simulator; the app persists the session
  (keychain / secure storage). Flows then launch **already authenticated**.
- The project `CLAUDE.md` → Acceptance testing documents the mechanism and the re-auth
  procedure. Rotation = the human re-runs the manual sign-in.
- A run that bounces to the sign-in screen or dies before the app's home surface means
  **stale session → BLOCKED**, with the message "persisted session stale — re-run the
  manual sign-in on the simulator". Never work around it.

## 2. The launch subflow owns gates and dialogs

Keep one shared **launch subflow** that every flow runs first. It owns:

- **System dialogs** (account verification prompts, permission alerts) — dismissed as
  _optional_ steps, so their absence doesn't fail the flow.
- **App-side gates** (onboarding steps, mandatory capture screens). Every hard gate the
  app adds must gain a case in the launch subflow — otherwise **every flow dies pre-app
  at once**, which is the signature of an un-gated launch subflow (all-flows-BLOCKED,
  same first-screen screenshot). When you see it, report "launch subflow lacks a case
  for gate X" as a harness finding; don't chase per-flow ghosts.
- What Maestro **cannot** cross: system camera/mic capture UI and other secure system
  surfaces. Flows must be designed to stop at, or route around, those — a flow stuck on
  one is BLOCKED (out of harness scope), not FAIL.

## 3. The dev-overlay tap trap (recurring — check before blaming the app)

In Debug builds, an in-app dev overlay (e.g. the RN LogBox warning banner triggered by
an unguarded `console.warn`) renders **on top of bottom navigation** and silently eats
taps. Signature: a flow taps a nav item, nothing happens, screenshot shows a yellow/log
banner at the bottom edge. This is a **harness/regression finding, not a feature FAIL**:

- Verdict: BLOCKED, with the screenshot and the offending warning text.
- Durable fix to recommend: route dev logging through a guarded helper (or gate
  `console.warn` in dev builds) so a stray warning can't re-break tap targets — this
  class regresses repeatedly once two different call sites have caused it.
- **Why it keeps regressing**: strict `no-console` eslint configs allow only
  `warn`/`error`, so _informational_ logs get written as `console.warn` — and every
  logging change silently reintroduces the banner. The pattern that holds: a
  `LogBox.ignoreLogs([...])` **prefix-regex allow-list** in the app entry
  (`__DEV__`-gated), extended **in the same change** that adds any info-level warn.
  Review checks: (a) each regex matched character-for-character against the exact
  emit string — an anchor/punctuation miss = suppression silently fails = banner is
  back; (b) suppress _informational_ prefixes only — failure logs must keep
  bannering loudly.
- **Routine events are never `console.error`**: anything that fires in a normal
  dev/sim flow must be warn+suppressed, not error. Known traps: `expo-iap`'s
  `purchaseErrorListener` fires on plain user cancellation
  (`ErrorCode.UserCancelled = "user-cancelled"`) — branch it; StoreKit products
  absent in non-store sim builds; WS reconnect/close churn.

## Verdict + evidence discipline

- Screenshots are the evidence — read them **before** deciding FAIL vs BLOCKED; never
  verdict from exit codes alone.
- **PASS**: assertions held. **FAIL**: the flow reached the feature and the app
  misbehaved (real bug → file `/feedback`). **BLOCKED**: environment/harness broke
  (session, gates, overlay, Metro, backend unreachable) — name the precondition and
  the one-line fix.
- Report per flow: name, verdict, failing step (if any), screenshot path, duration.
- Run flows via the project's own e2e script only; keep runs bounded (no retry loops,
  no timeout raises).

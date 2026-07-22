---
name: android-play-ship
description: Shipping an Expo/RN Android app to Google Play internal testing via EAS — preflight discipline for build-time secrets, the pnpm config-plugin require trap that masquerades as a login failure, service-account auto-submit, first-publish propagation, signing-key registration, and the iOS-IAP-on-Android catalog gap. Load when building/submitting an Android release or diagnosing a failed ship or a broken Play install.
---

# Play internal-testing ship — the EAS + Play Console playbook

## Preflight before burning a build

A production EAS build takes ~20–40 min; every failure it can die of at minute 25 must
be asserted in a 5-second preflight first:

- **Every build-time secret exists in the EAS project env** (`eas env:list
production`). Build-phase-only deps (e.g. a Sentry upload token) are invisible to
  `validate` — the rule is: a commit that adds a build-phase secret provisions it
  (`eas env:create`) and adds it to the preflight's required-vars list in the same
  change. Platform-specific vars (e.g. an Android-only Google web client id) must not
  gate the other platform's ship.
- **The submit path is complete**: `--auto-submit` reads the service-account key path
  from `eas.json`; the key is a gitignored secret, so a fresh checkout builds fine and
  then fails the submit at the very end. Assert the file exists in preflight.

## The require-trap that looks like a login failure

`eas-cli` internally spawns `expo config --json`. If ANY config plugin `require`s a
package the app doesn't declare — the classic being `@expo/config-plugins` instead of
the always-resolvable **`expo/config-plugins`** subpath — that spawn exits 1 under
pnpm's strict node_modules, `eas env:list` fails, and a naive preflight reports
**"could not read EAS env (not logged in?)"**. Direct `npx expo config --json` can
still appear to work, deepening the misdirection. Diagnose with
`EXPO_DEBUG=1 DEBUG='*' eas env:list …` and read the PluginError in the spawn trace.
Rule: plugins always import `expo/config-plugins`.

## Submit + release mechanics

- Auto-submit via a Google Cloud **service account** (JSON key, gitignored; grant it
  release permission in Play Console; enable the Play Developer API). Once proven, the
  whole ship is one command: preflight && `eas build -p android --profile production
--auto-submit`.
- `versionCode` auto-increments per EAS build; a **canceled** build's number is simply
  skipped — canceling never blocks the next build.
- A killed local CLI does NOT kill the cloud build: check `eas build:list` and
  `eas build:cancel <id>` explicitly, then verify status went to `canceled`.

## First-publish propagation — "Item not found"

A brand-new package's FIRST internal release can serve testers "Item not found" for
hours after the API reports the release live. Google exposes **no propagation
status** — `status: completed` reflects configuration, not edge serving, so
re-polling the API is useless. Discipline: wait hours, retry the install; if it still
404s, opt-in + install with a **second Google account/device** to split
account-level from app-level causes. Subsequent releases to an already-served track
propagate fast.

## Signing keys × auth providers

With Play App Signing there are **three** signing identities, each with its own SHA-1:
the debug keystore, the EAS upload key, and Google's Play App Signing key. Anything
keyed to a signing fingerprint (Google OAuth clients, Clerk native-app SHA-256s, etc.)
must be registered **three times, one per fingerprint** — an integration that works on
a debug build and dies on the Play-installed build is almost always the missing
Play-App-Signing entry.

## IAP: the store catalog is per-store

Product IDs configured in App Store Connect **do not exist on Google Play** — the
same `getAvailableItems` call returns `[]` on Android until products are created in
Play Console (a separate Play Billing setup with its own review/fee model, plus
RTDN webhooks server-side). An empty catalog is not a code bug; plan the wallet UI to
degrade explicitly (hide/explain purchase entry points) and treat the per-store
catalog + billing-policy decision (Play Billing vs external checkout where lawful) as
an owner-level work item, not a port detail.

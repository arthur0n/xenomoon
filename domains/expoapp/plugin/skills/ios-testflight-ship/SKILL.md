---
name: ios-testflight-ship
agents: [builders]
description: Shipping an Expo/RN iOS app to TestFlight via EAS — preflight for the download-once API key and the App Store Connect record, the export-compliance answer that silently strands every build in Processing, build numbers that burn permanently, credentials and capabilities that must be regenerated together, and the paid-agreements gap that makes the IAP catalog come back empty. Load when building/submitting an iOS release or diagnosing a build testers cannot see.
---

# TestFlight ship — the EAS + App Store Connect playbook

The Android lane's discipline applies here too; what differs is that iOS fails LATE and QUIETLY. A
Play submission that is going to fail usually fails at submit. An iOS one uploads cleanly, reports
success, and then simply never appears for testers — with no error anywhere in the build log,
because the thing that stopped it is a question waiting in a web console.

## Preflight before burning a build

A production iOS build plus processing is 30–60 min. Everything that can kill it at the end must be
asserted in seconds first:

- **The submit credential exists locally.** `eas submit` authenticates with an App Store Connect API
  key (`.p8`). That file is **download-once** — Apple will never serve it again, only let you revoke
  and mint a new one — so it is gitignored, and a fresh checkout builds for forty minutes and then
  fails the submit. Assert the path in `eas.json` resolves to a real file BEFORE building.
- **The app record already exists.** Submission targets an existing App Store Connect app; the
  bundle identifier must be registered and the record created. EAS will not conjure one, and this
  failure also lands after the build.
- **Every build-time secret is in the EAS project env** (`eas env:list production`) — same rule as
  Android: the commit that introduces a build-phase secret provisions it and adds it to the
  preflight's required list in the same change. Keep platform-specific vars from gating the other
  platform's ship.

## Export compliance — the build that uploads fine and nobody can see

This is the iOS trap that wastes the most time, because nothing reports it as an error.

If `ITSAppUsesNonExemptEncryption` is not declared in the app config, App Store Connect holds every
uploaded build pending a **manual encryption answer** in the web UI. The build shows as processed,
`eas submit` exited 0, the pipeline is green — and testers see nothing. The symptom looks exactly
like slow propagation, so the usual reaction is to wait longer, which never helps.

Declare it in the app config so it is answered at upload time rather than by a human clicking. If a
build is already stuck, answering it in App Store Connect releases that build; declaring it in
config prevents the next one.

**That covers the common case, not every case.** `ITSAppUsesNonExemptEncryption: false` is the
answer for an app using no encryption, or only the exempt kinds (HTTPS and the platform's own
standard cryptography). An app that genuinely uses non-exempt encryption declares `true` and then
owes Apple the export documentation workflow — with an `ITSEncryptionExportComplianceCode` in the
config once approved. If builds keep stalling after you declared the key, that is the branch you are
on, and no amount of config editing shortens it.

## Processing, and what "uploaded" does not mean

After upload the build sits in **Processing** for minutes to hours. It cannot reach anyone until
that finishes, and it is not a status you can hurry. But "processed" is not "visible", and the
reasons a processed build is still invisible are different problems in different consoles — so
check them in this order before concluding anything:

1. **Still processing.** Apple's, unfixable, just wait.
2. **Not distributed to a group.** The dullest cause and the easiest to skip past: a processed build
   reaches nobody until it is added to a tester group, unless that group has automatic distribution
   turned on. Nothing is wrong, nothing is pending — it is simply sitting there. Check this BEFORE
   the two below, because both of those are stories about being blocked and this one is not.
3. **Waiting on the export-compliance answer** (above). Look for the build flagged as missing
   compliance rather than assuming propagation.
4. **External testing waiting on review.** See below.

**Internal vs external testing is not the same lane.** Internal testers (members of the team, up to 100) need **no review** — but see point 2: no review does not mean automatically delivered. External
testers require **Beta App Review**, a human queue measured in days for a first submission. A plan
that says "ship to TestFlight today" and means external testers is a plan with a review queue in it.

## Build numbers burn permanently

`buildNumber` (CFBundleVersion) must be unique and increasing within a marketing version, and once
App Store Connect has seen one it is **spent forever** — deleting or expiring the build does not
free it. There is no equivalent of "canceling skips the number, no harm done".

Let EAS own the increment (remote versioning) rather than hand-editing, and never try to re-upload a
number that was already accepted: the rejection message talks about the version being used, which
reads like a conflict you can resolve, and it is not.

## Credentials and capabilities move together

EAS manages the distribution certificate and provisioning profile remotely, which is what makes the
happy path painless and the unhappy path confusing:

- **Distribution certificates are limited per account.** Revoking one to "clean up" invalidates
  profiles that other builds — possibly other people's — depend on. Revoke deliberately, never as a
  first debugging step.
- **A capability added in config is not a capability in the profile**, and the two ways that bites
  are opposite, so name which one you are looking at:
  - **Entitlement-bearing capabilities** (App Groups, Sign in with Apple, associated domains, push)
    must exist on the App ID and in the provisioning profile. Missing or mismatched, they fail
    LOUDLY — code signing, install, or submission validation rejects the build. Regenerate the
    profile after changing the config, and check the built app's entitlements against the embedded
    profile rather than guessing.
  - **Service-side setup** behind a correctly-entitled capability fails QUIETLY. Push is the usual
    one: the entitlement can be perfectly in place while no **APNs key** is registered with the
    project, and that is a runtime no-op with no build error anywhere.

  Reaching for the runtime explanation when the profile is the problem — or the reverse — is how an
  afternoon disappears.

## IAP: agreements gate the catalog

The Android lane's warning has an iOS-shaped twin. A correctly written client gets an empty catalog
back for reasons that live entirely in the owner console, and every instinct says the purchase code
is broken. **Two independent prerequisites, and neither is reliably the more common one** — so do
not work down a fixed list, read what the console is already telling you:

- **The product records.** Bundle ID and product IDs matching what the client asks for, metadata
  complete, the product in a submitted/cleared state, available in the storefront you are testing
  from. Any of these missing and the product simply is not in the catalog.
- **The account's agreements.** Paid products need the Paid Applications agreement active with
  banking and tax complete; other offerings can be gated by a different agreement. App Store Connect
  reports this per-agreement under Agreements/Tax/Banking **and names the one it is waiting on** —
  which beats deducing it.

That naming is the shortcut: if the console flags an agreement, that is the answer; if it does not,
you are looking at product state. Only when both are clean does the client become a suspect.

TestFlight purchases run against the sandbox and cost nothing, but they still need the catalog to
exist, so this empty-array symptom shows up in testing long before it would in production. As on
Android: an empty catalog is an owner-level work item, not a port detail, and the wallet UI should
degrade explicitly rather than render a broken purchase flow.

---
name: webapp-uat
agents: [uat-runner]
domain: webapp
description: The browser acceptance lane — prove an issue by the project's own capped e2e script, or by looking at the page through Chrome in the project's profile, as the `Proof:` line of the contract says. Covers the caps that must already live in the config, the saved-session ritual, the Chrome profile, and what the minimal proof scenario asserts. Load for the Proof step, or any UAT run, on a web app.
---

# The browser lane

The app is already running — locally or deployed. You drive it, assert what a user would see, and
report. You never boot it and never write test code.

## 1. The project's own suite

If the `Proof:` line of the contract asks for the suite, run the project's own e2e/UAT script, and only it:

- take the command from `CLAUDE.md`'s command list (`npm run e2e`, `npm run uat`, whatever the
  project defines — pnpm, yarn, others);
- pass the base URL the way the project's config expects, usually an env var it documents;
- **never** an ad-hoc `npx playwright test`. That is how a run escapes the caps.

**The caps must already be in the config**, not in your command line: headless, a single worker,
parallelism off, one browser, no retries, strict per-test/expect/action/navigation timeouts plus a
global one, trace and video off, screenshots only on failure, explicit teardown.

**If the config does not encode them, do not run it.** Report that the config must be capped first.
An uncapped browser suite is the thing that has actually taken machines down, and adding flags to a
permissive config just moves the cap somewhere nobody will look next time.

## 2. The session is saved, never typed

The suite reuses a gitignored saved auth state that a human established once by signing in manually
— the project's acceptance block documents where it lives and how to refresh it.

**You never automate the sign-in form and never type credentials.** If the state file is missing, or
the run lands on a sign-in page, or the post-login element never appears: **BLOCKED**, with the
refresh instruction verbatim. Rotating it is the human's job, and a UAT agent that logs itself in is
a UAT agent that can be phished by its own test fixture.

## 3. The minimal proof of the suite, first

Default scenario is `poc`, and it is deliberately small — run it before investing in anything
larger:

1. load the base URL **with the saved session**;
2. assert a **known post-login element** renders — this proves the session is live rather than
   silently redirected;
3. confirm **one user-scoped read path** returns something non-empty — proves the app is talking to
   its data, not just painting a shell.

A `poc` that passes says the app is up, authenticated, and reading. That is the floor everything
else builds on; if it fails, nothing bigger is worth running yet.

## 4. The browser look

A look at the page through Chrome counts as the proof, equal to the suite. The `Proof:` line of the
issue's contract says which one, and what must be seen. The Design gives the exact page.

- what you may do in the browser depends on what the `Proof:` line asks.
- the Chrome profile is the project's: its id is `browser.deviceId` in the project's
  `.xenomoon/settings.json`. Before opening any page, call `mcp__claude-in-chrome__select_browser`
  with that id. Names of browsers are not reliable; only the id is used. Never pick another browser
  and never call `switch_browser`.
- setup not ready, each with its one-line fix, never a failed proof and never a guess:
  - no `browser.deviceId` in the settings → add the id of the project's Chrome profile to
    `.xenomoon/settings.json` as `browser.deviceId`;
  - the id is not among the connected browsers → open Chrome in that profile with the Claude
    extension running;
  - the page shows a sign-in instead of the app → sign in once in that profile.
- **never sign in.** Never type credentials.
- **capture evidence**: the step, what was expected, what was shown.
- **name the identity in the verdict**: which user or tenant, and which profile. "It looked logged
  in" is not evidence of anything.
- **say in the verdict which way ran**: the suite or the browser look.

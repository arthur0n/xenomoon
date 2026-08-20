---
name: webapp-uat
agents: [uat-runner]
domain: webapp
description: The browser acceptance lane — run the project's own capped e2e script against a running app with a saved auth session, or drive the browser directly when the project has no suite. Covers the caps that must already live in the config, the saved-session ritual, and what the minimal proof scenario asserts. Load when running UAT on a web app.
---

# The browser lane

The app is already running — locally or deployed. You drive it, assert what a user would see, and
report. You never boot it and never write test code.

## 1. Prefer the project's own suite

If the project has an e2e/UAT script, **that is the lane**. Run it, and only it:

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

## 3. The minimal proof, first

Default scenario is `poc`, and it is deliberately small — run it before investing in anything
larger:

1. load the base URL **with the saved session**;
2. assert a **known post-login element** renders — this proves the session is live rather than
   silently redirected;
3. confirm **one user-scoped read path** returns something non-empty — proves the app is talking to
   its data, not just painting a shell.

A `poc` that passes says the app is up, authenticated, and reading. That is the floor everything
else builds on; if it fails, nothing bigger is worth running yet.

## 4. No suite? Drive the browser directly — basically

A project without an e2e suite still deserves acceptance. Use the browser capability available in
your session to do exactly what `poc` describes: open the URL, confirm the post-login element, read
one user-scoped path. Nothing more.

**If you have no browser capability, that is BLOCKED — say so and stop.** A browser lane without a
browser is not a lane, and reporting anything else would put a verdict on a run that never happened.
Say plainly that the direct path needs a browser tool the run did not have, so the gap reads as a
missing capability rather than as a flaky lane.

**Keep it deliberately small**, because this path has none of the protections the suite has: no
config caps, no saved-state discipline, no artefacts unless you capture them. So:

- **one page, a handful of assertions, then stop.** No crawling, no exploratory clicking.
- **capture what you saw** — a screenshot or the text you asserted on — because without the suite's
  artefacts your report is the only evidence.
- **never sign in — and prove WHOSE session you are using.** The saved state is the identity
  boundary, and the direct path does not get to skip it: load the same documented saved session the
  suite uses. **A signed-in browser profile is not that.** Without the documented state, the run is
  BLOCKED, not a PASS — a stale profile or the wrong account satisfies "a post-login element
  rendered" perfectly while reading someone else's data, or the wrong environment's.
- **name the identity in the verdict**: which user or tenant, and where the state came from. "It
  looked logged in" is not evidence of anything.
- **say in the verdict that you used the direct path**, not the project's suite. They are not equally
  trustworthy, and a reader deciding whether to believe a PASS needs to know which one ran.

This is a fallback, not a destination. When a project starts relying on it, the finding to report is
that the project needs a capped suite.

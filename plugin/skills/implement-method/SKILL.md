---
name: implement-method
agents: [developer]
domain: universal
description: The method of the Build step and the fix rounds of the Fix step — read the confirmed Design (`## 🔬 ANALYSIS`) and the next piece of the Plan (in Fix, the open findings), build exactly that, PROVE it with the project's own commands plus the red-then-green test, mark the piece finished, and hand back uncommitted. Load for Build or a fix round.
---

# Build and fix rounds — the method

The route, the stops and the counters come from the flow checklist named in the brief
(`plugin/docs/flow/build.md` or `plugin/docs/flow/fix.md`). This skill is the method. When the two
disagree on route or stops, the checklist decides.

## 0. The input

No `## 🔬 ANALYSIS` on the issue that the owner confirmed at Design → stop and say so: building
from a design nobody confirmed discards the step before you.

Read the issue body (the contract) and the **newest** ANALYSIS, trimmed head and tail because the
spec fields sit at the end:

```bash
issuekit show <N> --digest --lane analysis
```

(`issuekit` = the shipped path your prompt names; `--full` lifts the cap if a field was elided.)
Then the `## 📋 PLAN` comment: your work is its next unfinished piece. In a fix round the open
findings of the review are the fix list, and nothing else is.

A linked PRD (`**PRD:**` line) is also your spec: build to its **Acceptance** unchanged, because QA
grades against the same text.

## 1. Build one piece

One piece at a time, in the Plan's order. In the right package, to the project's conventions, the
smallest diff that does it, reusing the project's existing helpers.

**Something is missing to deliver a line the Design already has** (a file it did not name, a step
in the project's workflow) → it is part of this work: do it and name it first in your report.
**The work would change what the Design decided** (another approach, another behaviour, another
table) → stop and report the Design line and the fact that breaks it: the issue waits for the
owner. No way around it, and no question about something he cannot refuse. Work bigger than the
contract → stop and say so; a new issue needs the owner's word.

## 2. Prove it — with the project's own commands

Read the project's `CLAUDE.md` command list; all must be green for every package you touched.

- **validate** (type-check, lint at zero warnings, unit tests) and **build**.
- **The test the spec's TESTABILITY named**, including any extract-to-pure-function refactor it
  specified. It goes **red without the change and green with it**: a test that passes on the old
  code guards nothing. Skip only when the spec marked it not automatable.
- **Schema change** → generate the migration with the project's tool, read the SQL, ship it with
  the code, add the scope entry for any new user-owned table. Never hand-apply SQL.

**Never weaken a check to go green**: no skipped test, no disabled lint rule, no widened type.
Green by weakening looks the same as green by fixing at the moment it happens.

**Never add or remove a dependency** unless the design names that exact package: a new dependency
is a design decision and dirties a lockfile the pipeline cannot clean.

No secrets, no `.env` values, no hand-edited generated files.

Red after the piece → fix once. Still red → stop with the red check, and count the one fix on the
issue.

## 3. Record and hand back

Mark the piece finished on the issue (tick it in `## 📋 PLAN`) and on the board (`mcp__ui__tasks`).
When the last piece is green, label `implemented` as a record; a label that does not exist fails
the edit, so say which.

**Do not commit, push, or open a PR.** Leave the change in the working tree.

## 4. Report

- **Files changed**, one line each, and a 2–3 line summary.
- **Verification**: the commands and their result, the test added and its red-then-green status.
- **Ship path**: what deploy it needs, whether a migration rides along.
- **Any deviation** from the design, any security or scoping surface touched, follow-ups, issue URL.

Never report the issue as fixed or done: done is the Proof step.

**Backgrounded?** Your last action is the `agent-report` protocol: write the full report to
`.xenomoon/handoffs/<slug>.md` with the gate line FIRST, then files, done, caveats, blocked. Write
it last so it reflects the final state; the relayed result is just `<path> — gate PASS|FAIL`.

**Language: the project's.** Where the project's own instructions state a language for its
tracker, write the PROSE in it; otherwise English. The `implemented` label, the `## 🔬 ANALYSIS`
and `## 📋 PLAN` headings and their field names stay as written: code finds them by literal match.

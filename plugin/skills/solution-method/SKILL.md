---
name: solution-method
agents: [senior-analyst]
domain: universal
description: The solution stage's own method — verify the triage cause against real code (CONFIRMED/REFINED/WRONG), design the minimal fix, decide testability concretely, decide ship impact (deploy / migration), verify the scoping, then post the `## 🔬 ANALYSIS` implementation spec + the solution-ready label. Load when designing a fix from a triage record.
---

# Solution — the method

The triage record is your **starting hypothesis, not truth**. Investigation discipline lives in
`code-investigation`; intent rules live in `intent-guardrails`; this skill is the design stage:
verify, design, decide testability and ship impact, hand off.

## 0. Gate

Issue already carries `solution-ready` and this is not a forced re-run → post nothing, report
`already designed — skipped`. Read the labels only to decide that.

No triage record on the issue → stop and say so. Designing a fix for an unproven cause is the
failure this stage exists to catch, so do not silently do triage's job as well.

## 1. Verify the cause — the second read that stops reverted fixes

Open the cited files yourself. Falsify per `code-investigation`: if the triage cause were true,
what else must hold, and does the known-good code share the same pattern? Then state one of:

- **CONFIRMED** — triage nailed it.
- **REFINED** — roughly right, precise cause or location differs. State the correction.
- **WRONG** — misdiagnosed. State the real cause with `path:line` evidence.

Triage can be confidently wrong. This pass is where that gets caught — before anyone writes code
against it. Inspect only what settles the cause and the design; do not wander the codebase.

## 2. Design the fix — concrete and minimal

Exact files and functions to change, the change to make, and why. **No code patch** — describe it
precisely enough that implementation is mechanical.

Keep logic where this project keeps it: if the convention says a handler calls a shared pure
function, do not inline the formula. Name the edge cases and risks explicitly — scoping leaks,
enum/label drift, swallowed errors, auth boundaries.

Check the blast radius before you commit to it: `graphify affected "<file>"` names what depends on
the code you are about to change, which turns "small fix" into a checkable claim.

## 3. Decide testability — concretely, no dodging

Can this bug be guarded by an automated regression test, and with what?

- **Hermetic unit test** — the bug is isolatable logic (a calculation, a parser, a wrong
  condition, a mapping). Name the function and what it must assert, following the project's test
  pattern.
- **Smoke / integration** — a data path needing the real dependency (scoping, transactions). Name
  what the flow exercises, using the project's integration command.
- **New fixture or helper** — no existing test fits but the path _is_ automatable. Describe the
  small helper to build, or the extract-to-pure-function refactor that makes a test possible. The
  developer implements whatever you specify here.
- **Not automatable** — only when genuinely pure visual/animation with no isolatable logic. Say so
  and why. **Do not default here to dodge work** — this field is where quality is quietly lost.

## 4. Decide ship impact — two separate questions

- **Deploy:** does shipping require one, and of what? Back-end change, front-end change, or both,
  using this project's actual deploy targets from its `CLAUDE.md`. Deploy is CI-only, never manual.
  A shared change ships with whichever side imports it.
- **Migration:** does the fix change the schema? If yes, say so — produce it with the project's
  migrate command, review the SQL, commit alongside, add a scope entry for any new user-owned
  table. Never hand-apply SQL.

For a native/mobile project the second question is _local testability_: does testing this need a
native rebuild (new native dep, native config change), or does it hot-reload? Say which — it sets
everyone's expectations for the next hour.

## 5. Verify the scoping triage proposed

Triage sized the work as a session-sized unit. Confirm it against the real design: if the fix you
just specified cannot land in one session, say so now and propose the split — the pipeline's cost
of discovering that during implementation is far higher.

## 6. Write-back — the implementation spec

Terse, scannable, one line per field, verbatim values, omit empty fields. Write to a temp file and
post it (avoids shell-quoting problems).

```
## 🔬 ANALYSIS — <one-line summary>

**SEVERITY:** sev:<level> · **AREA:** area:<area> · **CONFIDENCE:** <high|medium|low>
**VERDICT:** CONFIRMED | REFINED | WRONG (reframed) — <one line>
**REAL CAUSE:** <only if REFINED/WRONG — corrected cause + `path:line` evidence>

**SYMPTOM:** <what the reporter saw>

**FIX:**
- `path:line` — <exact change>

**STEPS:**
1. <terse imperative>

**WATCH:** <edge cases, risks — scoping leaks, enum/label drift, auth boundary, swallowed errors>
**TEST:** <how to confirm fixed — manual steps>
**TESTABILITY:** <kind + where + what it asserts; or "not automatable: <why>". Note any
extract-to-shared refactor needed to make it testable.>
**SHIP:** <deploy target(s) or no> · <migration yes|no> — <one line why>
**SCOPING:** <session-sized as triaged, or the proposed split>

**NEEDS FROM REPORTER:** <needs-info only: exact steps, account, screenshot, env…>

---
*solution · senior-analyst · <output of: git rev-parse --short HEAD>*
```

Then label: add `solution-ready`, plus the ship labels this project uses (deploy needed, migration
needed, `needs-info` when blocked on the reporter). A label that does not exist fails the edit —
say which one, never silently drop it.

**The FIX / STEPS / WATCH / TEST / TESTABILITY / SHIP block IS the spec** the implement stage
builds from. If a developer would have to guess anything material, the spec is not finished.

## Routing back

Intent conflict → the product owner, not a deeper trace. `needs-info` → waits on the reporter.
Cause turned out WRONG and the real one is a different area → say so plainly; a re-triage is
cheaper than a fix built on a corrected-in-passing hypothesis.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes to its tracker, write the PROSE in that language. Absent any such
statement, English.

**The structure is never translated**: the `## 🔬 ANALYSIS` heading, EVERY field name in the template above (SEVERITY, AREA, CONFIDENCE, VERDICT, REAL CAUSE, SYMPTOM, FIX, STEPS, WATCH, TEST, TESTABILITY, SHIP, SCOPING, NEEDS FROM REPORTER), the signature footer, and EVERY label this stage adds — `solution-ready`, `needs-info`, and the project's ship labels — stay exactly as written. The VERDICT values are structure — `CONFIRMED` / `REFINED` / `WRONG` decide whether the issue advances to implement or goes back to triage. `needs-info` in particular is a routing verdict the dispatcher reads to stop the queue; translated, a blocked issue is neither stopped nor findable. A translated heading or label is a record the
gates and queues cannot see — literal matching is how every stage after this one finds your work.

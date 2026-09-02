---
name: implement-method
agents: [developer]
domain: universal
description: The implement stage's method — read the ANALYSIS spec (and a PRD's Acceptance when one exists), build exactly that, PROVE it with the project's own validate/build/test plus the regression test the spec named, label `implemented`, and hand back uncommitted. Load when implementing a solution-ready issue.
---

# Implement — the method

The spec is the `## 🔬 ANALYSIS` comment the solution stage left: **FIX / STEPS / WATCH / TEST /
TESTABILITY / SHIP**. Your job is to make exactly that true, prove it with the project's own
commands, and hand back — uncommitted.

## 0. Gate

No `solution-ready` label and no ANALYSIS on the issue → stop and say it needs `solution`
first. Building from an unproven cause is what the stage before you exists to prevent; doing it
anyway silently discards that protection.

Already `implemented` and not a forced re-run → report that and stop.

## 1. Read the spec — the LATEST analysis, not the whole thread

Your spec is the issue body plus the **latest** ANALYSIS; everything older is prior-stage chatter.
Trim deterministically and keep head+tail of long comments — the spec fields sit at the END of an
analysis, so a head-only cap would delete exactly what you need:

```bash
issuekit show <N> --digest --lane analysis
```

(`issuekit` = the shipped path your prompt names.) That prints labels, the body and the NEWEST
`## 🔬 ANALYSIS`, capped head+tail at 8000 chars (2500 head / 4500 tail) with the elision named —
the same trim this skill used to do by hand with jq. `--full` lifts the cap if the elision took
a field you need.

**A linked PRD is also your spec.** If the issue carries a `**PRD:**` line, its **Acceptance**
block is what you build to — unchanged, because the QA stage grades against that same text. Two
readings of one Acceptance is how generator and judge drift apart.

## 2. Build exactly that

In the right package, to the project's conventions, smallest diff that fully fixes it. Reuse the
project's existing helpers rather than adding new ones.

**If the spec is wrong or incomplete, do the CORRECT thing and flag the deviation loudly** in your
report. Silent divergence is worse than a wrong spec: the next stage grades against a spec nobody
updated. Never expand scope on your own authority — a bigger fix is a new slice.

## 3. Prove it — with the project's own commands

Not assumed ones: read the project's `CLAUDE.md` command list. All must be green.

- **validate** (type-check + lint at zero warnings + unit tests) — nothing is "done" while it fails.
- **build**.
- **The regression test the spec's TESTABILITY named**, including any small extract-to-pure-function
  refactor it specified. It must **flip red → green**: a test that passes against the pre-fix code
  guards nothing. Skip only when the spec explicitly marked the bug not-automatable.
- **Schema change** → generate the migration with the project's tool, **read the SQL**, commit it
  alongside, and add the scope entry for any new user-owned table. Never hand-apply SQL.

**Never weaken a check to go green** — not a skipped test, not a disabled lint rule, not a widened
type. The gate exists because green-by-weakening is indistinguishable from green-by-fixing at the
moment it happens, and only one of them ships working code.

**Never add or remove a dependency** unless the spec names that exact package. A new dep is a
design decision, it often crosses a rebuild/lockfile boundary, and a dirtied lockfile cannot be
cleaned from inside the pipeline (destructive git is gated). Tests use the project's existing runner.

## 4. Label and hand back

Label `implemented` once validate + build + test are green and the regression test is in place —
that label is what the QA sweep looks for. If the edit fails on a missing label, say which one;
never silently drop it.

**Do not commit, push, or open a PR.** The pipeline's commit stage commits (after QA and review
pass, the commit gate enforces it) and the push stage publishes — never the author. Leave the
change in the working tree.

## 5. Report

- **Files changed** — one line each — and a 2–3 line summary of the fix.
- **Verification** — the validate/build result, the test added and its red→green status.
- **Ship path** — what deploy it needs, whether a migration rides along.
- **Any deviation** from the spec, any security/scoping surface touched, follow-ups, issue URL.

**Definition of done is DEPLOY-GATED.** You produce an implemented change awaiting QA → review →
commit → deploy. Never report an issue as "fixed" or "done": deploy-gated issues have silently
stayed open for weeks when this was treated as a footnote.

**Backgrounded?** Your last action is the `agent-report` protocol — write the full report to
`.xenomoon/handoffs/<slug>.md` with the gate line FIRST, then files, done, caveats, blocked. Write
it last so it reflects final state; the relayed result is just `<path> — gate PASS|FAIL`.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes to its tracker, write the PROSE in that language. Absent any such
statement, English.

**The structure is never translated**: the `implemented` label stays exactly as written — pipeline-dispatch queues on it BOTH ways (implement takes `solution-ready` and not `implemented`; QA takes `implemented` with no `qa:*`), so a translated one leaves the issue invisible to QA and permanently re-offered for implementation. The upstream `## 🔬 ANALYSIS` field names you are building against are structure too. A translated heading or label is a record the
gates and queues cannot see — literal matching is how every stage after this one finds your work.

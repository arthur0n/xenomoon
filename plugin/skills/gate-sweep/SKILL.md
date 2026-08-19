---
name: gate-sweep
agents: [junior-analyst]
domain: universal
description: The mechanical quality sweep on a change — run each touched package's OWN validate verbatim, check diff and commit hygiene, spot-check the repo's rules against the diff, and return QUICK-PASS or a numbered FIX list with path:line. Not a review of the fix's correctness. Sets no labels. Load when sweeping an implemented change before the adversarial review.
---

# Gate sweep — the mechanical pass

This is **not a review of whether the fix is right** — that is the adversarial lane. This is the
cheap, checkable half: did the gates actually run, does the diff contain only this change, is the
commit shaped correctly. It exists so **the orchestrator never runs these checks itself** — a
verification the router performs is a verification nobody independent performed.

You are diff-scoped and bounded: minutes, not hours. No re-architecture opinions.

## 1. The gates — each touched package's OWN command, verbatim

Read the project's `CLAUDE.md` command list and run what it defines, from the cwd it defines, for
**every** package the diff touches. Do not skip one because another passed.

**Never a bare or global compiler.** A globally installed `tsc` shadows the workspace's pinned
version and reports phantom errors the project's own gate passes cleanly — an hour lost, every
time. If a bare tool disagrees with the package script, the package script is the authority.

Report the exact summary counts, not an impression: "validate ok (142 tests)", not "looks green".

## 2. Diff hygiene

- **Every file belongs to THIS change.** An unrelated file in the diff is a finding, not a bonus —
  it rides through review unexamined and lands in someone's blame.
- **A schema change carries its generated migration in the same change.** A migration that arrives
  later is a deploy that fails between them.
- **Nothing generated, vendored or machine-written is hand-edited** — if it needs to change, the
  generator's input does.
- **No secrets, no `.env` values, no credentials.** Ever, in any form.

## 3. Commit-message hygiene

- The subject references the issue as `(#N)` — **never `Closes #N`**, which closes the issue at
  merge, before the fix is actually live.
- The body says what changed and why in a line or two, not a restatement of the diff.
- Attribution lines the project requires are present.

## 4. Repo-rule spot checks — on the diff only

Check the project's own hard rules against the changed lines: no weakened lint rule, no widened
type, no disabled test, no rule-dodging literal. **A rule weakened to reach green is the finding**,
even when everything is green — that is precisely how green becomes meaningless.

Where the pack ships a `domain-conventions` skill, its floor applies here too.

## 5. The verdict

```
QUICK-PASS — gates: <package: command → result + counts, one line each>
```

or

```
FIX LIST — gates: <as above>
1. `path:line` — <what is wrong, one line>
2. `path:line` — <…>
```

Nothing else. **You set no labels** — `qa:*` belongs to the QA gate and `review:*` to the
adversarial lane; a mechanical sweep must never be mistakable for either.

A FIX list routes straight back to the implement stage. If something needs a heavyweight
adversarial read (money paths, auth, prompts, data scoping), **say so in one line and stop** —
naming it is your job, judging it is the senior lane's.

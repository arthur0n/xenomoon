---
name: gate-sweep
agents: [junior-analyst]
domain: universal
description: The mechanical quality sweep on a change — run each touched package's OWN validate verbatim, check diff and commit hygiene, spot-check the repo's rules against the diff, report whether the last change actually deployed, and return QUICK-PASS or a numbered FIX list with path:line. Not a review of the fix's correctness. Sets no labels. Load when sweeping an implemented change before the adversarial review.
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

## 5. Deploy status — "merged" is not "shipped"

A clean working tree says nothing about whether the LAST change actually reached production. Ask the
tool that already answers this — `issuekit deploy-check`, whose whole job is the last COMPLETED
deploy run's conclusion ("merged ≠ done") — and report its answer in one line.

**Use that, or a command the project itself documents. Do not invent a signal.** Not a health
endpoint you guessed at, not a version string you found, not a production URL you decided to probe:
a sweep that picks its own source of truth can report reassuring news while the real deploy gate is
red, which is worse than reporting nothing. No declared signal and no deploy-check → say
`deploy: not checked — no declared signal` and move on.

**Two different questions, and the answer only covers one of them.** deploy-check reports the last
COMPLETED run and never polls one in flight — so a green conclusion means _the pipeline is healthy_,
not _this change is live_. Run it right after a merge and it will happily report the PREVIOUS
deploy's success while yours is still queued.

Which line you may write depends on what you are sweeping, and in this lane the usual answer is the
last one:

    deploy: <conclusion> @ <sha> — this change            merged, and the SHAs match
    deploy: <conclusion> @ <sha> — NOT this change yet    merged, and they do not
    deploy: <conclusion> @ <sha> — pipeline only          the change is not merged, so
                                                          nothing here is about it
    deploy: not checked — no declared signal              nothing to ask

**The third is the normal case.** This sweep runs on an implemented change that is still
uncommitted, so there is no deploy candidate to compare against — and writing "this change" or "NOT
this change yet" would be inventing an attribution the evidence cannot support. Only claim the first
two when a merge SHA genuinely exists.

This is here because a deploy pipeline can sit red for days while every PR gate stays green. Nothing
in a per-change checklist looks at the deployed state, so a broken deploy is invisible to exactly
the routine that runs most often — and each new green sweep quietly reinforces the belief that
everything shipped. Two separate breaks once hid in one such window.

**Not a blocker on its own.** A red deploy is not this change's fault and does not make the diff
wrong; it is a finding to name, because the person reading this sweep is the one who can act on it.

## 6. Ownership — who does what with what you find

- A defect you find routes to the **implement** stage to be fixed, and to the **QA** stage for a
  verdict. You name it; you do not fix it.
- The **orchestrator coordinates and never fixes**. A router that starts patching the thing it is
  routing has stopped being able to judge it.
- **You set no labels at all.** `qa:*` belongs to the QA stage — and only after the gates ran
  verbatim — while `review:*` belongs to the adversarial lane. A mechanical sweep must never be
  mistakable for either, because both of those are verdicts and this is an inventory.

Stating it here is not bureaucracy: this checklist is the point where somebody holding a FIX list is
most tempted to just apply it.

## 7. The verdict

```
QUICK-PASS — gates: <package: command → result + counts, one line each>
           deploy: <one of the four §5 lines — "pipeline only" unless a merge SHA exists>
```

or

```
FIX LIST — gates: <as above>
           deploy: <as above>
1. `path:line` — <what is wrong, one line>
2. `path:line` — <…>
```

Nothing else, and **you set no labels** — see §6.

A FIX list routes straight back to the implement stage. If something needs a heavyweight
adversarial read (money paths, auth, prompts, data scoping), **say so in one line and stop** —
naming it is your job, judging it is the senior lane's.

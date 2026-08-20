---
name: pipeline-dispatch
agents: [orchestrator]
domain: universal
description: How to run a pipeline stage — resolve the repo, pick the target (one issue, or the stage's own queue), pass force, brief the agent, and report one line per issue. Also the parts only the router can do: choosing which reviewers run and reconciling their verdicts into one. Load before dispatching triage, solution, implement, sweep, qa, audit or pre-pr.
---

# Dispatching a stage

Each stage is an agent plus a skill. What is left over — which repo, which issue, what to say in the
brief, what to report — is yours, and this is it. The agents own the method; you own the routing.

## 1. Resolve the repo, once

Take it from the project's `CLAUDE.md` (the repo, and which `gh` account to use if the project pins
one). **A `gh` 404 on the repo stops the stage** — say so rather than guessing an account, because
guessing writes verdicts to a repo nobody is watching.

## 2. Pick the target

A **number** targets that issue. **Empty** means the stage's own queue, and each stage has a
different one — the queue IS the stage's definition of "not done yet":

| stage       | with no number                                                                               | order        |
| ----------- | -------------------------------------------------------------------------------------------- | ------------ |
| `triage`    | open issues without `triaged` and without `needs-info`                                       | newest first |
| `solution`  | `triaged` present, `solution-ready` absent, no open blocker label                            | newest first |
| `implement` | `solution-ready` and not `implemented` — **list them and ask which**, never auto-run a queue | —            |
| `sweep`     | the working tree as it stands (no issue needed)                                              | —            |
| `qa`        | `implemented` with no `qa:*` verdict yet                                                     | oldest first |
| `audit`     | query-then-inspect — see §5, it is not a label predicate                                     | oldest first |
| `pre-pr`    | nothing: it needs a target, so say what you need                                             | —            |

**How many at once is per stage, and the reasons differ:**

- **triage FANS OUT** — it is the pipeline's one parallel point. Several read-only triage agents may
  run at once; they touch nothing.
- **solution is serial** — two specs racing on the same issue produce two different fixes.
- **implement is ONE at a time** — builders share a working tree. More than one only when the briefs
  state genuinely disjoint file scopes.
- **qa is serial** — the gates it runs share that same tree.
- **`implement` with no number LISTS and ASKS.** Every other queue may run one issue after another;
  a builder loose on a queue writes code nobody asked for.

**`--force` anywhere in the arguments** re-runs a stage that already has its label. Pass it through
in the brief; do not decide for the agent whether its own work is stale.

## 3. Brief the agent

**Which agent, and which lane.** Both matter: several stages share an agent and differ only by the
skill they load, so a brief that omits the lane gets generic behaviour from the right agent.

| stage     | `subagent_type`  | skill named in the brief |
| --------- | ---------------- | ------------------------ |
| triage    | `junior-analyst` | `triage-method`          |
| sweep     | `junior-analyst` | `gate-sweep`             |
| solution  | `senior-analyst` | `solution-method`        |
| audit     | `senior-analyst` | `adversarial-review`     |
| pre-pr    | `senior-analyst` | `pre-pr-review`          |
| implement | `developer`      | `implement-method`       |
| qa        | `tester`         | `qa-method`              |

The brief names the skill, the issue, the repo, and force:

> _"Audit issue #42 in owner/repo — run the `adversarial-review` skill. focus=auth. force=false."_

Put the repo IN the brief. An agent that has to discover which repo it is working on will guess, and
its first action is usually a label-only gate that must not open a project file to answer.

**Keep it short.** A brief that re-specifies what the skill already says invites the agent to follow
the brief instead of the skill, and the two drift.

## 4. Report

One line per issue, and **what belongs in that line is the stage's own** — these fields are what
makes a run auditable afterwards:

| stage     | report                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| triage    | `sev · area · necessary/fold/not-necessary · the cause` — plus which issues were SKIPPED as already triaged, and any label that failed to apply |
| solution  | `confirmed/refined/wrong · ships deploy/migration? · the regression test it specified`                                                          |
| implement | `files changed · validate/build/test · the regression test going red→green`                                                                     |
| sweep     | the verdict VERBATIM: `QUICK-PASS` with the gates and their counts, or the numbered FIX list with `path:line`                                   |
| qa        | `PASS/BLOCKED · validate/build/test/smoke · whether the regression test actually guards the bug`                                                |
| audit     | `pass/changes · top finding · WHICH reviewers ran (codex\|internal\|both)`                                                                      |
| pre-pr    | `ready/not-ready · delivered · dropped · unasked · what the human must do before merge`                                                         |

**A label that failed to apply is reported, never swallowed** — the labels are how the next stage
finds its work, so a silent failure strands the issue.

**A DEVIATION FROM THE SPEC IS A HEADLINE, not a detail.** If the implementer built something other
than what the `## 🔬 ANALYSIS` spec (or the PRD's Acceptance) described — a different approach, an
extra change, a dropped caveat — say so first, before the files and the gates. That delta is the one
part of the work NOBODY has reviewed: the spec was reviewed, and the deviation replaced it. Do not
advance it silently on the strength of green gates; green means the code works, not that it is the
code that was agreed.

Then **execute the next stage yourself** if the verdict routes onward — never hand the user a
command to type. But a stage COMPLETING is not the same as the issue ADVANCING, and several
verdicts deliberately go nowhere:

| verdict                                              | where it goes                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `needs-info`                                         | **stops.** The pipeline cannot proceed without the reporter; nothing downstream can invent the missing facts.                                 |
| `fold` / `not-necessary`                             | **stops, and it is a RESULT, not a failure** — the cheapest fix is the one nobody implements. Report it; closing the issue stays the human's. |
| solution `wrong`                                     | back to **triage**, not forward to implement — the cause itself was wrong, and building on it builds the wrong thing.                         |
| `qa:blocked` · `review:changes` · pre-pr `not-ready` | back to **implement**, with the findings as the fix list.                                                                                     |

And the ones that DO advance. Each stage's success has its own name, so "did it pass" is the wrong
question to ask generically — `refined` and `QUICK-PASS` are successes, and treating them as
anything else strands finished work:

| stage    | success verdict                                                     | goes to                                                  |
| -------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| triage   | `necessary`                                                         | solution                                                 |
| solution | `confirmed` **or `refined`** — a refined cause is a good one, found | implement                                                |
| sweep    | `QUICK-PASS`                                                        | qa                                                       |
| qa       | `PASS`                                                              | audit (reviewer choice per §5)                           |
| audit    | `pass`                                                              | pre-pr on a full-gate change, otherwise the commit stage |
| pre-pr   | `ready`                                                             | the commit stage                                         |

Bounded: **3 loop-backs per issue.** Still red after three → stop looping and surface the open
findings to the human. A fourth attempt at the same wall is not persistence.

## 4b. UAT is dispatched, but it is not a stage

`uat-runner` takes a **scenario**, not an issue — default `poc`, the minimal proof. It runs on its
own cadence against whatever is deployed or running, so it has no queue, no place in the chain, and
no verdict that advances anything.

**It gates nothing.** A `uat:fail` files a NEW issue through intake and enters the pipeline like any
other bug; it does not reopen a closed issue and does not turn a green commit red. A `uat:blocked`
files nothing at all — it is a setup problem, and the report says which precondition failed.

Brief it with the scenario and the target (base URL, device — ask rather than assume). The lane
skill comes from the installed pack.

## 5. Reviewers: choosing, and reconciling

This is the part no agent can do, because it is about how many opinions to buy and what to do when
they disagree.

**Codex does not replace the internal senior.** Codex is an external reviewer with no stake in how
the fix was designed; the internal `senior-analyst` knows this project's conventions. They see
different things:

- **auth · money · data scoping · migrations · anything irreversible** → both
- **ordinary product code** → the internal senior; add Codex when the change is large
- **trivial glue, cosmetic, sev:low** → the sweep may be enough; say so rather than performing
  ceremony

Propose the choice and let the human decide when it is not obvious — Codex spends their money, and
skipping review spends their trust.

**Run Codex through the `codex-review` subagent**, never your own Bash: the full review then stays
out of your context and you get a receipt back. (This replaced an older instruction to run the
companion directly in a background Bash — one route, so the raw output cannot leak into the router's
context. If the subagent is not available in a given install, that is a setup problem to report, not
a reason to shell out.) Its vocabulary is not the lane's — map
`approve` → `pass` and `needs-attention` → `changes` when you record it. Never paste its verdict
wording into the lane raw; a live project did, and the gate read `## 🔎 REVIEW — approve` as a block.

### Audit with no number: query, THEN inspect

"Needs review" is not a label question, so the sweep is two steps and the order matters:

```bash
# candidates: QA-passed and not already blocked. review:pass is NOT excluded — a pass at a stale
# SHA wears exactly that label, and excluding it hides the case being swept for.
gh issue list -R <repo> --state open --label "qa:pass" \
  --search "-label:review:changes" --json number,title,updatedAt --limit 100
```

Then read each candidate's newest lane verdict and evidence comments, and keep it only if it is
**unreviewed** (no lane verdict) or **unreconciled** (evidence newer than the lane verdict). Drop
anything already passed — re-reviewing it burns an opus run to reprint a verdict.

**Staleness is NOT a sweep question.** A `review-verified:` marker that differs from your HEAD means
"reviewed on other code", which is the normal state of every issue whose change is not in your
working tree right now. Treating that as stale would dispatch billed reviews against a diff those
issues have nothing to do with. Judge staleness only for the issue whose change is actually in this
tree — the commit gate does exactly that, at commit time, for exactly that issue. List the others as
`reviewed at <short sha> — not this checkout`.

Run what survives, oldest first. If more than ~10 survive, do those and **say how many you left** —
a silent cap reads as "swept everything". An empty sweep is a result: say `nothing awaiting review`,
never invent work.

**When two reviewers ran, NEITHER writes the lane verdict.** Each posts evidence under its own
header (`## 🔎 CODEX REVIEW`, `## 🔎 INTERNAL REVIEW`) with no marker and no label. Then **you write
exactly one `## 🔎 REVIEW`**, and:

- **either reviewer says `changes` → the verdict is `changes`.** No averaging, no "the other one was
  happy". Both readings go in the comment, attributed — disagreement is a result, not a problem to
  resolve into a summary nobody can audit.
- **both pass → `pass`**, and say in the PROBED line that both ran.

The reason for the header discipline is mechanical: the gate and the review skill both treat the
**newest** `## 🔎 REVIEW` as authoritative, so two reviewers posting there means the later erases the
earlier — a Codex block overwritten by an internal pass, on exactly the change that earned two
reviewers.

**If a run dies after the evidence but before the reconciliation**, the commit gate will ask about
it. Re-running `audit` fixes it — say in the brief that evidence is already on the issue awaiting
reconciliation, or the reviewer's skip gate will report "already reviewed" and the ask stays
unanswerable.

## 6. Two targets that are not issue numbers

- **`pre-pr` given a PR number** → resolve it to its issue first
  (`gh pr view <N> --json number,title,body,baseRefName,headRefName`), because the design it judges
  against lives on the issue. Pass both, and the base branch so it diffs against the right thing. A
  PR referencing no issue is worth saying out loud: the lane can still read it, but with nothing
  agreed to judge against, its answers are opinion — label them as such.
- **`pre-pr` before QA has passed** → there is nothing settled to judge. Send the issue to `qa`
  first, or say that plainly. This lane deliberately does not re-run gates, so running it early
  produces a readiness verdict about work that may still move.
- **`sweep` with no number** → the uncommitted working tree. The gates and diff hygiene run the
  same; only "does this file belong to THIS change" loses its reference, so the agent reports scope
  doubts instead of asserting them.

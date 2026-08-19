---
name: issue-intake
agents: [orchestrator]
domain: universal
description: Turn raw notes into tracked work — separate a DEFECT from product INTENT before anything else, file a clean issue, and link a PRD on the issue when the product-owner writes one. Load when someone drops feedback, a bug report, or a "we want X" that has to become an issue.
---

# Intake — what kind of thing is this?

## 0. Resolve the repo before anything writes

Intake's first real action CREATES something on GitHub, and a create cannot be taken back quietly.
So settle the target first: take the repo (and the `gh` account the project pins, if any) from the
project's `CLAUDE.md`, or resolve it with
`gh repo view --json nameWithOwner -q .nameWithOwner` (a read, and allowed). **A 404, or an account
that does not match what the project documents, stops intake** — do not guess and do not file
"somewhere".

issuekit resolves the repo itself from `.issuekit.json`, so normally you pass nothing; check it
agrees with the project's own docs, and pass `--repo` only when you must override it deliberately.

Someone just described something. Before it becomes an issue, it has to be classified, because the
two kinds go to entirely different places and the wrong choice wastes an entire pipeline run.

## 1. DEFECT or INTENT — decide this first

**DEFECT** — something is **broken** against how it already works: a crash, an error, a wrong
result, data blank or leaked, a regression. → a `bug` issue, investigated by triage.

**INTENT / product change** — a statement about how the product **should** behave: a new feature, a
vague ask ("we want X"), a "we don't use Y, do Z" that expresses a business rule or a change of
direction. **This is not a bug.** There is no defect to trace; there is a decision to capture. → the
product-owner interviews, captures the rule verbatim, and writes a PRD.

**Never file intent as a bug and send it to triage.** The triage stage would manufacture a code
hypothesis for a thing that was never broken — which is the exact failure this pipeline exists to
stop, and it burns a real investigation to conclude "working as designed".

If a note mixes both — a genuine bug AND an "and also it should…" — **split it**: a `bug` issue for
the defect, and route the intent to the design path.

## 2. Restructure the notes into a clean issue

**Do not invent facts.** Use only what the notes contain; leave a field out rather than filling it.

**Title:** short, specific, almost imperative — "Stats page shows blank after completing a session".

**Body:**

```
**What happened:** …
**Expected:** …            (only if implied)
**Steps to reproduce:**    (only if given)
1. …
**Account / area:** …      (e.g. signed-in user, which feature/screen)
**Env:** …                 (prod URL / local dev — only if given)

> Filed from raw notes.
```

**Label:** `bug` for a defect, `feedback` otherwise. An intent note filed here for tracking is
`feedback` — **never `bug`**, because the label is what routes it later.

**Several distinct problems in one note → one issue each.** A muddled issue cannot be triaged, fixed
or closed as a unit, and it will be reopened for the half nobody addressed.

**File it through issuekit, not raw `gh`:**

```
issuekit new --title "<title>" --body-file <file> --label <bug|feedback>
```

Raw `gh issue` is DENIED for the orchestrator — the tracker is owned by issuekit, and the deny
message names the shipped path if `issuekit` is not on PATH. `new` also warns on a probable
duplicate before creating, which raw `gh` does not. Echo each number and URL.

## 3. Route it

- **Defect** → triage it, or say plainly that it is ready for triage. Run the stage yourself; do not
  hand the user a command.
- **Intent** → the design path below.

## 4. The design path — the PRD, and linking it

Intent goes to the **`product-owner`**, foreground only: it round-trips forms with the human, so a
backgrounded run cannot pause for the answers and stalls. It interviews, captures business rules
verbatim, may propose a human-gated addition to the project's own library, and writes one small PRD
to `design/<slug>.md`.

**Linking the PRD on the issue is yours** — the product-owner stays domain-neutral and does not
touch GitHub:

- **the intent already had an issue** → edit it: add a `**PRD:** design/<slug>.md` line near the top
  of the body, inline the PRD's **Acceptance** block, and add the `design` label —
  `issuekit patch <N> --body-file <file> --add-label design`
- **no issue yet, and the work warrants tracking** → open one —
  `issuekit new --title "<PRD title>" --body-file <file> --label design` — with the same PRD line
  and Acceptance block in the body
- **the slice is trivial and needs no tracker entry** → skip the issue, and say so

If a label does not exist and the edit fails, **say which** — never silently drop it. The `design`
label is how the next stage finds this work.

## 5. Then keep going

Report the PRD path, the ordered slices with what each touches, any open questions the product-owner
left, and the issue numbers or URLs. Then **execute the next stage yourself** — an agreed small
slice goes to implement; a genuine defect that surfaced instead goes to triage.

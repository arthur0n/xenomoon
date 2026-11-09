---
name: library-record-writing
agents: [researcher]
domain: universal
description: How the researcher writes the words of a durable `library/<kind>/` record — decision first, why in three lines, one rule per record, and the post-adopt/post-build 4-field Lesson. Use whenever the researcher writes a verdict doc (`library/tools/<slug>.md`, …) so the record is queryable and agnostic. Fields, caps and the change rule live in `plugin/docs/library-record-standard.md`; the CLI writes them.
---

# Writing a library record (the shared method)

A researcher's durable artifact is a `library/<kind>/<slug>.md` record — written on EVERY verdict, including "build it ourselves" / "build thin", so the next session doesn't re-research. The format is `plugin/docs/library-record-standard.md`; `library-record-create` runs the CLI. This skill owns how to write the words.

## Write the words

Fields, body caps and the change rule are in `plugin/docs/library-record-standard.md`; do not copy them here or into a record.

- **Decision first.** The first line is the verdict (adopt/reject/park + the deciding reason). `description` carries the same one line, not a summary of the body.
- **Why in three lines.** The deciding reason only; the options you turned down go one per line under `## Rejected`.
- **Run the tool, then the words.** `new` writes the frontmatter and regenerates `index.md`; `check` (part of `npm run validate`) fails on drift. Never edit `index.md` or `log.md` by hand.

## Conventions and guidelines — one rule, one place

A convention ("how we name queues") or guideline ("prefer retries with a cap") is a record like any other, with one extra discipline:

- **One rule per record.** Its slug names the rule (`verdicts/queue-naming`); the decision line states it once.
- **Reference by slug, never restate.** A skill, agent or other record that depends on the rule writes `see verdicts/queue-naming` — a copy is a second home that will drift.
- **Change it where it lives.** A refinement is an amend, a reversal is a supersede (`library-record-revise`); the kind's `log.md` and the `supersedes` chain ARE the history.
- **No ledgers.** No running list of decisions, no changelog file, no "rules.md" collecting many rules — the kind index is generated from the records, and git holds the rest.

## One page, no more

The body caps are in the standard. A catalog/registry nobody reads is research nobody reuses.
When the record IS a capability (a skill/agent you authored or rewrote), it also meets
the skill-writing doctrine — `plugin/docs/process/skill-writing.md` (checkable
completion criteria, no no-ops, description = triggers, positive form).

## The Lesson section (post-adopt / post-build)

Once the thing you evaluated is actually installed/built and USED, append a tiny **Lesson** section to this SAME doc (never fork a new file) — 4 fields, plain and AGNOSTIC:

- **What** — the one fact worth remembering.
- **Why** — why it matters / what it prevents next time.
- **Gotcha** — the trap that bit us (a broken assumption, a sharp edge).
- **Universal vs project** — generalizes to any project, or specific to THIS one? Concrete project facts (exact business names/numbers, this project's own data model or bugs) use the placeholder standard (`plugin/docs/process/promotion.md`, criterion 1) or stay in the project's own local library — never in `library/` (it ships to every install).

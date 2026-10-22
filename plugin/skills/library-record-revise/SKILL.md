---
name: library-record-revise
agents: [researcher]
domain: universal
description: Change a decision record that already exists — amend it (same record, change logged) or supersede it (a new record replaces it, both records edited). Use when a new verdict contradicts, refines or replaces a record found by `library-record-search`; a second record that silently contradicts the first is the failure this prevents.
---

# Amend or supersede a record

`REC` is `node "$XENOMOON_LIBRARY/../../ui/server/cli/library-records.js"`; add
`--root <project>/.claude/library` for a project library. Records are named `kind/slug`.

## Pick one

- **Amend** — the decision stands, a detail changes (a number, a scope, a caveat). One record.
- **Supersede** — the decision itself changes. A new record replaces the old one.

## Amend

1. Edit the record body in place so it states the current rule.
2. Log it: `$REC amend <kind/slug> --note "<what changed and why>"` — sets `status: amended`,
   bumps `date`, adds a dated line under `## Changes`. When another record carries the reason,
   add `--by <kind/slug>`; that record gets `amends: [<slug>]`.

## Supersede

1. Write the replacement with `library-record-create`.
2. Link both: `$REC supersede <kind/old> <kind/new>` — old gets `status: superseded`, new gets
   `supersedes: [<old>]`. Leave the old body as history.

Done when: `$REC check` passes (it also fails on a broken `supersedes`/`amends` link or a status
that disagrees with one).

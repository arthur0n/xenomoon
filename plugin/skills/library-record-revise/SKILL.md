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

## The tool asks first

`amend` and `supersede` refuse to finish until you answer two questions: what was rejected and
what follows. Answer with `--rejected "<text>"`, `--consequences "<text>"` or `--keep-sections`
(both sections stay as they are). The tool asks; do not rely on remembering. The change note goes
to the kind's `log.md`, never the body. Rules: `plugin/docs/library-record-standard.md`.

## Amend

1. Edit the body so it states the current rule.
2. `$REC amend <kind/slug> --note "<what changed and why>" (--rejected "…" | --consequences "…" | --keep-sections)`.
   When another record carries the reason, add `--via <kind/slug>`; that record gets `amends`.

## Supersede

1. Write the replacement with `library-record-create`.
2. `$REC supersede <kind/old> <kind/new> [--note "…"] (--rejected "…" | --consequences "…" | --keep-sections)`
   — old becomes deprecated, new gets `supersedes`. Leave the old body as history.

Done when: `$REC check` passes (it also fails on a broken `supersedes`/`amends` link).

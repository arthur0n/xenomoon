# Library record standard

## Frontmatter

- `type` — the kind folder name (`verdicts`, `findings`, `tools`, ...).
- `title` — the display name.
- `description` — the decision, one line.
- `status` — `draft`, `stable` or `deprecated`. Absent means `stable`.
- `tags: [a, b]` — inline list.
- `generated: { by: <who>, at: <ISO 8601 with offset> }` — author and time.
- `supersedes: [kind/slug]` — records this one replaces. A bare slug means the same kind.
- `amends: [kind/slug]` — records this one changes and does not replace.
- `audience` — `internal` or `client` (absent: `internal`). A client reads a record only when `client` and `stable`. Other keys are allowed.

## Body

- The first line is the decision. No H1: the title is frontmatter.
- `## Why` is required, at most 3 non-blank lines.
- `## Context` is optional. No other `##` section.
- `## Rejected` at most 5 lines, one option per line.
- `## Consequences` at most 3 lines.
- At most 20 non-blank lines in total, headings and fenced lines included.

## Change rule

- `amend` and `supersede` refuse to finish without `--rejected "<text>"`, `--consequences "<text>"` or `--keep-sections`.
- The change note goes to `<kind>/log.md`, never into the body.
- `log.md` has `## YYYY-MM-DD` sections, newest first, with lines `- **Update** <slug> — <note>`.
- Amend keeps the status. A superseded record becomes `deprecated` and has exactly one superseder.
- `index.md` and `log.md` are generated. Never edit them by hand.

## CLI

`node ui/server/cli/library-records.js <command> [--root <library dir>]`:

- `new <kind> <slug> --description "<decision>" [--title] [--tags a,b] [--status draft|stable|deprecated] [--by <who>]`
- `search [--tag t] [--status s] [--kind k] [--text word]`
- `amend <kind/slug> --note "<what changed>" [--via <kind/slug>] (--rejected|--consequences|--keep-sections)`
- `supersede <kind/old> <kind/new> [--note] (--rejected|--consequences|--keep-sections)`
- `check` — fields, body caps, links and index drift.
- `migrate [root...]` — rewrite legacy records to this standard.

## Example

```markdown
---
type: verdicts
title: example-record
description: Use one retry with a cap of three for queue jobs.
status: stable
tags: [queue, retries]
generated: { by: human:example, at: 2026-11-08T18:01:42.227Z }
---

Use one retry with a cap of three for queue jobs.

## Why

A capped retry clears short outages and cannot loop forever.
```

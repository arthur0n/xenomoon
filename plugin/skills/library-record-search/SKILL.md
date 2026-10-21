---
name: library-record-search
agents: [researcher, junior-analyst, senior-analyst]
domain: universal
description: Search library records by tag, status, kind or a word, with no database — a small CLI filters the frontmatter, then you judge meaning by reading the descriptions. Use when `library-first` points you at the library and the kind indexes are too many to read, or when you need every record with one tag or status (e.g. all `proposed`).
---

# Search records

`REC` is `node "$XENOMOON_LIBRARY/../../ui/server/cli/library-records.js"`; add
`--root <project>/.claude/library` to search a project library.

1. **Filter mechanically** — any mix of filters, each narrows:

   ```bash
   $REC search --tag queue --status accepted
   $REC search --kind verdicts --text retries
   ```

   One line per hit: `kind/slug (status) [tags] — description`.

2. **Judge meaning yourself** — read the descriptions; open only the records whose verdict
   bears on the question. A `superseded` hit is history: follow the record that supersedes it
   (`$REC search --text <old-slug>` also matches `supersedes` / `amends` lists).

Done when: you name the records that answer the question, or state "none found" and propose
one (the `library-first` output line).

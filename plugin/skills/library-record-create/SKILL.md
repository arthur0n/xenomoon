---
name: library-record-create
agents: [researcher]
domain: universal
description: Create one decision record in `library/<kind>/` with its kind index regenerated; the format is `plugin/docs/library-record-standard.md`. Use when a verdict, finding or tool decision must be kept and no existing record covers it (search first with `library-record-search`). Changing an existing record is `library-record-revise`.
---

# Create a decision record

`REC` below is `node "$XENOMOON_LIBRARY/../../ui/server/cli/library-records.js"`; `--root` defaults
to the framework library, pass `<project>/.claude/library` for a project record.

1. **Search first** — `$REC search --text "<key word>"`. A hit
   means revise that record, not a second one.
2. **Write the skeleton** — the CLI sets the frontmatter and regenerates the index:

   ```bash
   $REC new <kind> <slug> \
     --title "<title>" --description "<one-line verdict>" --tags a,b [--status stable] \
     [--root <project>/.claude/library]
   ```

   Status starts `draft`; pass `stable` only when the human already said yes.

3. **Fill the body** — the sections and caps are in `plugin/docs/library-record-standard.md`;
   the writing method is `library-record-writing`.

Done when: `$REC check` passes and the new line shows in `<kind>/index.md`.

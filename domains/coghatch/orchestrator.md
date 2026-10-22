# Stack knowledge domain block

The spine above is the doctrine; this block is the knowledge domain. The project is a
**workspace**: a parent folder holding the stack's repos and `.xenomoon/workspace.json`. The work
is decisions, conventions, guidelines and client-shareable docs — not code. Project facts live in
the workspace `CLAUDE.md`; read it first and treat it as authoritative.

## The decision-first loop

1. **Search before deciding.** Any question that could already be settled → the
   `library-record-search` skill first. A standing record is the answer; cite it by slug.
2. **Decide, then record once.** A new decision, convention or guideline → the
   `library-record-create` skill. A change to a standing one → the `library-record-revise` skill
   (amend or supersede, never a silent edit). Shape per the `library-record-writing` skill.
3. **One rule, one place.** A rule lives in exactly one record; docs, READMEs and other records
   reference it by slug and never restate it.
4. **No ledgers.** No running logs, changelogs or decision tables beside the records — the record
   set and git history are the ledger.
5. **Tech goes in `tags`.** Which technology a record is about is a `tags` value, not a folder or a
   separate pack.

## Hard rules

- **Never write a client, company or private project name** in a record or a shareable doc. Use
  neutral placeholders (`acme-api`, `acme-web`).
- Conventions for a repo in the workspace are the `stack-conventions` skill's floor; the
  workspace `CLAUDE.md` overrides it.
- Research of outside facts → `researcher`; the verdict it returns is recorded through step 2.

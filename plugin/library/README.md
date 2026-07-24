# Library — warm knowledge (never auto-loaded)

Nothing here loads into an agent's context automatically. These are durable **records** and
**source lists** the self-improvement loops consult on demand, and that a human reads to understand
past decisions. Hot knowledge (always- or trigger-loaded) lives in the orchestrator +
`.claude/skills/`; this folder is everything worth keeping that should NOT cost tokens on every task.

This is the framework's library and ships **empty**. The upstream's domain-specific research records
are stripped (we pull only curated, domain-agnostic updates). This directory is where
`$XENOMOON_LIBRARY` points (`<framework>/plugin/library/` — the one capability tree); real,
per-project research is drafted project-local under `<project>/.claude/library/` as the orchestrator
learns the project, and broadly-useful findings promote up here alongside the capability.

## The one convention — role decides home

| The thing is…                                           | Role        | Home                               |
| ------------------------------------------------------- | ----------- | ---------------------------------- |
| knowledge an agent **loads to learn how**               | skill       | `.claude/skills/<name>/`           |
| code an agent **runs**                                  | tool        | `plugin/tools/` (project `tools/`) |
| a **verdict / definition kept** so we don't re-research | record      | `library/<kind>/<slug>.md`         |
| **where to fetch** external raw material                | source list | `library/sources/<thing>.md`       |
| always-relevant **routing / convention**                | —           | the orchestrator / `CLAUDE.md`     |

A record is OUR verdict (an output); a source list points OUT to the world (an input) — separate
shelves. The researcher agents (`skill-researcher`, `cli-researcher`, `transcript-researcher`) write
their findings here on demand; they never load it automatically.

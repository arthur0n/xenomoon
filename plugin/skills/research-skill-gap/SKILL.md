---
name: research-skill-gap
agents: [researcher]
domain: universal
description: Researcher MODE — demand-pull skill research. Use when dispatched to close a skill gap ("we hit a gap implementing X right now and no skill covers it", a builder reported a missing pattern, or the orchestrator sees no skill applies before dispatching). Searches the external skill sources registry, evaluates candidates against project conventions, and recommends adopt/reject to the human; on approval, rewrites (never copies) the skill into the project.
---

# Mode: skill-gap research (demand-pull)

Your output is skill evaluations and (on human approval) adopted skill files in
`.claude/skills/`. You start from a NEED — a gap the current work hit — not from a source.
(The source-push path, harvesting a dropped resource, is `research-transcript`.)

## The sources

The knowledge base is the framework's plugin library (`$XENOMOON_LIBRARY` →
`<framework>/plugin/library/` — the one capability tree). Read
`library/sources/skill-sources.md` first when it exists — each source lists its URL, license,
cache path (under `$HOME/.cache/xenomoon/`, NEVER `/tmp`), and bootstrap/refresh commands.
Nothing is bundled: if a cache folder is missing, run the source's bootstrap (runtime
download); if present, refresh best-effort — a failed refresh (offline) is fine, use the
cached copy. Sources are grouped by subdomain (e.g. React, Node.js, AWS) — search the
subdomain the gap names. With no registry, web-search the topic.

Never install or copy a collection wholesale. Never edit files inside a cache. New source
worth registering → propose the registry line in your verdict (human approves the edit).

## Workflow

1. **Confirm the gap first.** Read the project's `CLAUDE.md` index (follow it into
   `.claude/library/` for conventions) and glob `.claude/skills/`. If an existing skill or a
   project doc already covers the need, say so and stop — a successful result, not a failure.
2. **Search the sources.** List candidates and read the `description:` frontmatter of
   plausible ones. Pick the best 1–2; don't deep-read everything.
3. **Copy for evaluation.** Copy only `skills/<name>/` (+ its `references/`) into
   `.claude/skills/eval/<name>/`. The eval folder is scratch — always deleted at the end.
4. **Evaluate against conventions.** Read the full candidate. Classify each section:
   _irrelevant_ (out of scope for this stack), _conflicts_ (contradicts a convention — name
   it), or _useful_ (fills the gap without conflict). Adoptable only if the useful core fills
   the gap on its own.
5. **Ask the human** (`mcp__ui__form` foreground / `mcp__ui__ask` backgrounded — see the
   charter's foreground-vs-background split). Read-only `note` with the verdict + evidence,
   then a required `select`: adopt / reject / adopt-a-subset, your recommendation first.
   Cutting is the default: if the project doesn't need it _now_, recommend reject and note
   where the pattern lives for later.
6. **On adopt — rewrite, never copy.** Write to the skill-writing doctrine
   (`<framework>/plugin/docs/process/skill-writing.md` — description = triggers only,
   checkable completion criteria, no no-ops/negation, one page). Create
   `.claude/skills/<name>/SKILL.md` in the project's skill template:
   - Frontmatter: `name: <name>`, `description:` stating what it does AND concrete trigger
     phrases/situations.
   - Sections in order: title + one paragraph of _why this way_ → `## Requirements` →
     `## Project conventions` (paths, names, defaults for THIS project) → `## Steps`
     (numbered, code inline) → `## Verification checklist` (observable checks) →
     `## Error → Fix` (table).
   - ONE canonical path consistent with project conventions — cut every alternative and
     anything out of stack scope. Adapt code to conventions; never transcribe conflicting
     library code.
   - End with an attribution line crediting source + license
     (`Adapted from <Source> (<URL>), <License>.`).
   - Add the skill to the `CLAUDE.md` "## Skills" list (one line, existing format).
7. **Delete the eval copy** (`rm -rf .claude/skills/eval/<name>`) — always, both outcomes.

## Mode-specific never-do

- Pad an adopted skill with the source's full feature surface — adopt the slice that fills
  the gap; park the rest in the verdict.
- Verify the project — adopted skills get proven later when the builder uses them.

## Mode-specific return

The gap, candidates evaluated, the human's decision, the new skill path on adopt, the
one-line builder task ("implement X using the new `<name>` skill"), eval-dir cleanup
confirmed.

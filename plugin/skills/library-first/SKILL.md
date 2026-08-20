---
name: library-first
agents: [junior-analyst, senior-analyst]
domain: universal
description: Check the written record BEFORE investigating — search the project library (authoritative product intent) then the framework library (findings/verdicts/tools/sources indexes), and only then the code or the graph. Covers the OKF frontmatter subset that makes a record findable, and the "nothing covers this → propose the record" output line. Load at the START of any investigation, triage or research task.
---

# Library first — read the record before you re-derive it

A question already answered by a record costs one read. Re-deriving it costs a session, and the
second answer often contradicts the first. So the written record is the first place you look
**once you have decided to do the work** — before the graph, before grep, before opening a single
source file.

**One thing comes earlier: your stage's skip gate.** If the stage has a cheap "already done"
check (an existing label, a prior verdict), run THAT first and stop on it. A skip must stay cheap
— searching a library for work you are about to decline is the same waste this skill exists to
prevent, pointed the other way.

## Search order

**1. The project library — `<project>/.claude/library/`.** Authoritative product INTENT: business
rules, product facts, standing decisions, in the owner's own words. If it contradicts what the
code does, that is a finding, not a mistake to correct silently.

```bash
ls "$PROJECT/.claude/library/"                       # what exists at all
rg -il "<key terms>" "$PROJECT/.claude/library/"     # which record mentions it
```

Read the project's `CLAUDE.md` index first when one exists — it points at the records
(index-only doctrine: `CLAUDE.md` points, it never dumps content).

**2. The framework library — `plugin/library/<kind>/`.** Kinds: `findings` (traps met for real),
`verdicts` (a decision kept so it is not re-researched), `tools`, `sources` (where to fetch raw
material). Each kind has an `index.md` holding one line per record —
`- [<title>](<slug>.md) — <description>`. **Read the index, not the directory:** it is one cheap
read and its `description` is a one-line verdict, so you can tell from the index alone whether
the record is worth opening.

```bash
cat plugin/library/*/index.md                        # every record, one line each
```

**3. Only now, the code or the graph.** With `graphify` for structure questions, raw search last.

## When nothing covers it — say so, and propose the record

Silence is not an answer. If the search comes back empty, state that plainly in your output and
propose the record that should exist, so the gap closes instead of recurring:

```
**RECORD:** none found — propose `findings/<slug>.md` — "<the one-line verdict it would carry>"
```

Propose; never write it yourself unless writing records is your job. A record is a durable claim
and it is human-gated — see `library-record-writing` for the writing method.

**And close the loop at the END of the work, not only at the start.** Reading first stops you
repeating an investigation; writing after is what stops the NEXT one repeating yours. When the
task finishes, `project-library` says what earns an entry, who writes which kind, and why a
revision beats a second record that contradicts the first.

## OKF — what makes a record findable

Records carry frontmatter as their **machine face**: the UI sidebar and the kind index read it.
The parser (`ui/lib/frontmatter.js`) accepts a deliberate subset — flat `key: value` scalars plus
inline `[a, b]` arrays. **Nested YAML is out of scope**; a record that needs structure puts it in
the body.

```yaml
---
name: <slug> # matches the filename
kind: findings | verdicts | tools | sources
description: <ONE-LINE VERDICT — adopt / reject / park + the deciding reason, not a summary>
---
```

The `description` is the line that shows up in the index, so it must carry the verdict itself —
"rejected: needs a paid plan for the only feature we wanted" beats "notes about tool X".

**Where the scaffold is incomplete, say so rather than assuming:** a project library whose docs
carry no frontmatter and no index cannot be searched by anything but `rg`. That is a real gap —
report it the same way you report a missing record, and let the human decide when it grows one.

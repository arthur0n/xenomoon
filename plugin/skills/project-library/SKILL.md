---
name: project-library
agents: [product-owner, senior-analyst, junior-analyst]
domain: universal
description: The project's own knowledge base — where a project's timeless facts live (`<project>/.claude/library/`), what belongs there versus in an issue, and the obligation that closes every exploration: the next agent must not have to rediscover what this one just learned. Load when finishing an exploration, when writing or revising a business rule, or when onboarding a project that has no library yet.
---

# The project library — so the next session starts where this one ended

A session explores, decides, and ends. Without a written record the next session — a week
later, a different agent, the same product owner — starts from zero and asks the same
questions. The project library is the cure, and it is **the project's**, never the framework's.

Three things own this:

- **`library-first`** — read it BEFORE investigating. That skill is the entry.
- **This skill** — what a project record is, who writes which kind, and when.
- **The human** — every write under `.claude/` is theirs to approve.

## 1. Where it lives, and why there

```
<project>/.claude/library/
├── README.md              the index — one line per record, what it answers
├── business-rules.md      how the product must behave (product-owner)
└── explorations/          what the code actually does (analysts)
```

**Project-local, always.** The framework ships to every project, so a project's facts in
`plugin/library/` would leak into every other one. The rule is not stylistic: `plugin/library/`
is for AGNOSTIC records, the project's repo for its own.

**Committed with the project**, so the knowledge travels with the code and survives a
framework reinstall. An install is disposable; the library is not.

## 2. What belongs — the timeless test

Ask: **would this still be true if every open issue vanished?**

| belongs                                  | does not                       |
| ---------------------------------------- | ------------------------------ |
| how the product must behave, and why     | what we're changing this week  |
| where a subsystem lives and how it fits  | a fix's diff                   |
| a decision and the constraint behind it  | the discussion that reached it |
| a trap the code sets for its next reader | a status update                |

An issue records **what changed**. The library records **what is true**. If a sentence needs
"currently" or "for now" to be accurate, it is not a library entry.

## 3. Who writes what

**The product owner owns intent.** Business rules, the shape of the product, what must never
happen. Written as behaviour, not implementation: a rule that names a function is a rule that
dies at the next refactor. This is already human-gated — propose the exact text, get a yes.

**The analysts own the map.** What the code does, where the seams are, what surprised you. One
record per subsystem or question, not per issue.

**Everyone writes the trap they hit.** The thing that cost an hour and is invisible in the
code: the config that must be set first, the two files that must change together, the check
that passes for the wrong reason. That is the highest-value entry in the library and the one
most often skipped, because by the time you understand it, it feels obvious.

## 4. The obligation that closes an exploration

**An exploration ends with a record or an explicit "nothing durable here."** Not a summary of
the work — what is now KNOWN that was not written down before.

Concretely, at the end of an investigation:

1. **Did I learn something timeless?** If no, say so and stop. Most small tasks earn nothing,
   and padding the library is how it stops being read.
2. **Does a record already cover this?** Then **revise it**, don't add beside it. Two records
   disagreeing is worse than none — the reader cannot tell which is current, and both get
   distrusted.
3. **Propose the text and get the human's yes.** Writing under `.claude/` is theirs.
4. **Add the index line.** A record the index does not name is a record nobody finds.

## 5. When the truth changes, the record changes

A stale record is worse than a missing one: it is believed. When work contradicts a record,
updating it is **part of that work**, not a follow-up — a follow-up is a thing that does not
happen.

Correct it in place and say what changed. Keep the entry short enough that rewriting it is
cheap; a page nobody dares edit is a page that rots.

## 6. Shape of a record

One page. A reader who needs three pages needs three records.

```markdown
# <what this answers, as a statement>

**Holds when:** <the scope — which part of the product, which conditions>

<the facts, in whatever structure fits: prose, a table, a list of rules>

**Watch out:** <the trap, if there is one — what looks true and is not>
```

Name the file after the question it answers, not the issue that prompted it.

**Language: the project's, not yours by default.** Where the project's own instructions state a
language for what it writes, write the PROSE in that language. Absent any such statement,
English. File and directory names stay as written here — they are how the next agent finds the
library at all.

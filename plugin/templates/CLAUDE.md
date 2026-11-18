# {{PROJECT_NAME}}

<!-- This file is an INDEX with the same shape in every project. Keep it under 200 lines.
     One line per fact, concrete enough to verify. Pages of detail live in a doc with one
     line here. Stack and infrastructure detail lives in `README.md`. Delete a section that
     does not apply. -->

## What it is

{{one or two sentences: who uses it, what it does}}

- Built with: {{one line, the basics only: language, main framework, storage}}. Detail: `README.md`.
- This project runs inside the Xenomoon framework: its agents, skills and the hub come from it.

## Data model and tenancy

- Tenancy: {{who owns the data, and how isolation works}}
- Scoping rule: {{the helper or layer every owned query goes through}}
- Entities: `.claude/library/project.md`

## Commands

- Install: {{command}}
- Dev: {{command}}
- Validate: {{type-check + lint + tests in one command}}
- Test: {{command}}
- Build: {{command}}
- {{one line per other command the agents need}}

## Hard rules

The few rules that hold for every task. Each line says what is done, then what enforces it:
the check, or "judgment".

- {{what is done. Check: the check that enforces it.}}
- {{what is done. Judgment: review.}}

## Conventions

An index. Each area has its own doc; one line per doc.

- {{area}}: {{path}} — {{what it covers}}
- {{one line per area}}

## Library index

- `.claude/library/business-rules.md` — standing product facts in the owner's words; the agents treat it as the intent.
- `.claude/library/project.md` — longer project details: entities, environments.
- {{one line per further library doc}}

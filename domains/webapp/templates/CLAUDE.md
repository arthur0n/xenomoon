# {{PROJECT_NAME}}

<!-- This file is an INDEX with the same shape in every project. Keep it under 200 lines.
     One line per fact, concrete enough to verify. Pages of detail live in a doc with one
     line here. Stack and infrastructure detail lives in `README.md`. Delete a section that
     does not apply. -->

## What it is

{{one or two sentences: who uses it, what it does}}

- Built with: {{one line, the basics only, e.g. React, Node, PostgreSQL}}. Detail: `README.md`.
- This project runs inside the Xenomoon framework: its agents, skills and the hub come from it.

## Data model and tenancy

- Tenancy: {{single-user | multi-tenant | per-org, and how isolation works}}
- Scoping rule: {{the helper or layer every user-owned query goes through}}
- Entities: `.claude/library/project.md`

## Commands

- Install: {{e.g. pnpm install}}
- Dev: {{e.g. pnpm dev}}
- Validate: {{type-check + lint + tests, e.g. pnpm validate}}
- Test: {{e.g. pnpm test}}
- Build: {{e.g. pnpm build}}
- {{one line per other command the agents need: smoke, e2e, migrate}}

## Hard rules

The few rules that hold for every task. Each line says what is done, then what enforces it:
the check, or "judgment".

- {{e.g. Deploys ship from CI on a push to main. Check: the deploy workflow.}}
- {{e.g. A database change is a generated migration, reviewed, then applied by the migrate command. Judgment: review.}}

## Conventions

An index. Each area has its own doc; one line per doc.

- UI: {{path, e.g. `.claude/library/conventions-ui.md`}} — {{what it covers}}
- Backend: {{path}} — {{what it covers}}
- Database: {{path}} — {{what it covers}}
- Testing: {{path}} — {{what it covers}}
- {{add or delete areas to match the project}}

## Library index

- `.claude/library/business-rules.md` — standing product facts in the owner's words; the agents treat it as the intent.
- `.claude/library/project.md` — longer project details: entities, environments.
- {{one line per further library doc}}

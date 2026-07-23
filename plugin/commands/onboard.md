---
description: Onboard an EXISTING Claude-using project into the framework — inventory + conflict report scripted, CLAUDE.md merge + business-rules interview via the designer; every write human-gated
argument-hint: "(no args — runs against the bound project)"
---

# /onboard — AI-assisted install onto an existing project

The bound project already has a Claude life (its own `CLAUDE.md`, maybe `.claude/skills`,
hooks, conventions). Installing the framework must NEGOTIATE with what exists, never
overwrite it. **Their content is authoritative** — the framework's structure fills gaps.

**FOREGROUND ONLY** (writes under the project and its `.claude/` are human-gated per write).
Deterministic parts are scripted below; judgment parts hand to the **designer**.

## Step 1 — scripted inventory (read-only, no judgment)

1. **Their `CLAUDE.md` / `docs/conventions.md`:** which of the framework's expected blocks
   exist (Commands · Business rules / product facts · convention floor · NEVER list) and
   which are missing. Report as a checklist.
2. **Their `.claude/skills/`:** list each skill (name + description line). Default verdict
   for every one: **keep project-local**. Flag only clearly-generic candidates (no project
   nouns, technique-shaped) as day-zero promotion candidates — file each flagged one via
   `mcp__ui__promote` `{ kind: "skills", … }` so the human decides on the board.
3. **Their `.claude/settings.json` + hooks:** diff against the framework's hooks
   (double-gating, contradictions — e.g. their own destructive-git guard vs ours).
   **Report only — never touch their settings.**
4. **Stack commands:** read `package.json` scripts and map validate / build / test / smoke /
   e2e onto the domain's command expectations; note gaps (no test script, etc.).

## Step 2 — the judgment half → the designer

Hand the inventory to the **designer** (foreground, form-driven):

- **Annotated CLAUDE.md merge proposal** — their content stays verbatim; the designer
  proposes ADDING the missing framework blocks (Commands mapping from step 1.4, an empty
  `## Business rules / product facts` scaffold, a NEVER-list seed). Human approves the Edit.
- **Business-rules interview** — the designer interviews to seed the Business-rules block
  (this is the bootstrap for the analyst's intent guardrail and the contamination
  business-terms signal — a project without the block gets a weaker privacy gate).

## Step 3 — report

The checklist (found/missing blocks), skills kept-local vs flagged (board links), hook
conflicts found, the commands mapping, and what the designer proposed vs what the human
approved. End with the doctor's verdict (run `npm run doctor`, paste the summary line) and
this instruction, verbatim: **start a NEW session now — this one predates what we just
learned; the next one loads it all.**

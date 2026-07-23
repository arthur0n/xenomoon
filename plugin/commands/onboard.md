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

Hand the inventory to the **designer** (foreground, form-driven). **Dispatch it CLEAN: pass
the step-1 inventory as facts, but do NOT suggest candidate rule areas or topics** — a
pre-loaded topic list manufactures rubber-stamp questions (the designer will dutifully cite
code for whatever you seed it with).

- **Annotated CLAUDE.md merge proposal** — their content stays verbatim; the designer
  proposes ADDING the missing framework blocks (Commands mapping from step 1.4, an empty
  `## Business rules / product facts` scaffold, a NEVER-list seed). Human approves the Edit.
- **Business-rules interview — intent comes from what the user SAYS, never from what code
  implies.** Code-mining is banned as a question source: a rule reverse-engineered from an
  implemented check is a restatement of enforced code — there is nothing to decide, so it
  is NOT a business rule for this block. The interview asks open questions ("what should
  agents know about how this product is _meant_ to work that the code can't tell them?");
  a rule earns the block only when it is non-obvious, decision-bearing, or has a failure
  history. **"Nothing to capture yet" is a first-class, expected outcome** — an empty
  scaffold plus zero rules is a SUCCESS, not a gap to fill; rules accrue later via `/learn`
  as real work reveals them. (Why this block matters when it IS filled: it bootstraps the
  analyst's intent guardrail and the contamination business-terms signal.)

## Step 3 — report

The checklist (found/missing blocks), skills kept-local vs flagged (board links), hook
conflicts found, the commands mapping, and what the designer proposed vs what the human
approved. End with the doctor's verdict (run `npm run doctor`, paste the summary line) and
this instruction, verbatim: **start a NEW session now — this one predates what we just
learned; the next one loads it all.**

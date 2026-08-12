---
description: Onboard an EXISTING Claude-using project into the framework — inventory + conflict report scripted, CLAUDE.md merge + business-rules interview via the product-owner; every write human-gated
argument-hint: "(no args — runs against the bound project)"
---

# /onboard — AI-assisted install onto an existing project

The bound project already has a Claude life (its own `CLAUDE.md`, maybe `.claude/skills`,
hooks, conventions). Installing the framework must NEGOTIATE with what exists, never
overwrite it. **Their content is authoritative** — the framework's structure fills gaps.

**FOREGROUND ONLY** (writes under the project and its `.claude/` are human-gated per write).
Deterministic parts are scripted below; judgment parts hand to the **product-owner**.

## Step 1 — scripted inventory (read-only, no judgment)

1. **Their `CLAUDE.md` / `docs/conventions.md`:** which of the framework's expected blocks
   exist (Commands · Library index → `.claude/library/business-rules.md` · convention floor · NEVER list) and
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

## Step 1b — branch model (confirm or set)

Read `<project>/.xenomoon/branch-model` (first line = model; optional `prod=`/`dev=` lines
override the main/development defaults). Report the current model — or "none set" — in the
inventory. The model is confirmed/changed in step 2's interview (one `select` field:
`trunk` — work lands directly on the default branch (POC/early MVP) · `pr-main` —
branch → PR → main, branch dies at merge · `staged` — development is the default target,
main is promotion-only and deploys · `custom` — the project has its own doctrine). On
change: write the file (foreground, human-gated like every onboard write). `custom`
additionally lands the doctrine text in `.claude/library/branch-doctrine.md` + one
CLAUDE.md index pointer line.

## Step 2 — the judgment half → the product-owner

Hand the inventory to the **product-owner** (foreground, form-driven). **Dispatch it CLEAN: pass
the step-1 inventory as facts, but do NOT suggest candidate rule areas or topics** — a
pre-loaded topic list manufactures rubber-stamp questions (the product-owner will dutifully cite
code for whatever you seed it with).

- **Annotated CLAUDE.md merge proposal** — their content stays verbatim; the product-owner
  proposes ADDING the missing framework blocks (Commands mapping from step 1.4, a
  `## Library index` scaffold pointing at an empty `.claude/library/business-rules.md`,
  a NEVER-list seed). CLAUDE.md stays an INDEX — full rules go in the library doc, one
  pointer line each here. Human approves the Edit.
- **Business-rules interview — intent comes from what the user SAYS, never from what code
  implies.** Code-mining is banned as a question source: a rule reverse-engineered from an
  implemented check is a restatement of enforced code — there is nothing to decide, so it
  is NOT a business rule for this block. The interview asks open questions ("what should
  agents know about how this product is _meant_ to work that the code can't tell them?");
  a rule earns the block only when it is non-obvious, decision-bearing, or has a failure
  history. **"Nothing to capture yet" is a first-class, expected outcome** — an empty
  scaffold plus zero rules is a SUCCESS, not a gap to fill; rules accrue later as a side
  effect of real work (the product-owner's interviews, the analyst's findings — `/learn` is
  only the manual fallback). (Why this block matters when it IS filled: it bootstraps the
  analyst's intent guardrail and the contamination business-terms signal.)

## Step 3 — report

The checklist (found/missing blocks), skills kept-local vs flagged (board links), hook
conflicts found, the commands mapping, and what the product-owner proposed vs what the human
approved. End with the doctor's verdict (run `npm run doctor`, paste the summary line) and
this instruction, verbatim: **start a NEW session now — this one predates what we just
learned; the next one loads it all.**

---
description: Distill finished work into domain learnings — skills / library records / project conventions, each routed by scope and human-gated
argument-hint: "[issue# | prd-slug | empty = everything new since last run]"
---

# /learn — the domain learning distiller

After real work lands (an issue closed, a PRD delivered, a UAT run — or invoked manually),
mine what happened and DRAFT durable learnings. **The domain is the unit that learns**; you
are the distiller that feeds it. Routing contract: `plugin/docs/process/updates-routing.md`
— every candidate classifies as FRAMEWORK / DOMAIN / PROJECT, one landing path per scope.

**FOREGROUND ONLY.** Draft writes go under the project's `.claude/`, which is deliberately
excluded from the background write grant — never run this backgrounded; every write is
human-approved as it happens. Sub-agents (audit loops) never write drafts — they emit draft
CONTENT in reports, and THIS command materializes it.

Arguments: `$ARGUMENTS`

## Step 1 — the deterministic cost gate (no LLM pass without new signal)

Read `.xenomoon/learn-state.json` in the project ({ lastRun, seenIssues: [], seenRejects: n }
— create on first run). Proceed ONLY if at least one exists since last run:

- a newly CLOSED issue (compare `gh issue list --state closed` against `seenIssues`),
- a new entry in `.xenomoon/qa-divergence.md`,
- a new REJECTED promotion in `.xenomoon/promotions.json`,
- an explicit target in the arguments (a number or PRD slug always runs).

Nothing new → say "nothing to learn since <lastRun>" and STOP. Update the state file at the
end of a run (human-gated write like the rest).

## Step 2 — distill

For each new item, read the durable record (the issue thread's ANALYSIS/QA/REVIEW comments,
the PRD's Applied-recommendations + Scope-out, the divergence entry) and ask: **what here
would bite the NEXT project too?** The bar: draft only what RECURS or BIT US — a one-off
judgment call is not a learning. Aim for 0–3 candidates per run; zero is a fine answer.

## Step 3 — classify each candidate (updates-routing.md)

- **DOMAIN** — a repeatable technique or a hard-won verdict/footgun any project in this
  domain hits. → step 4a/4b.
- **PROJECT** — a fact/rule of THIS project (business rule, data-model intent). → step 4c.
- **FRAMEWORK** — the spine itself failed (hook, orchestrator, gate). → step 4d.

## Step 4 — land

- **4a DOMAIN skill** (repeatable technique): write
  `<project>/.claude/skills/<name>/SKILL.md` (follow the `write-a-skill` method: trigger-rich
  description, steps, verification), then file it: `mcp__ui__promote`
  `{ kind: "skills", name: "<name>", reason: "<one line>" }`.
- **4b DOMAIN library record** (verdict / finding / footgun): write
  `<project>/.claude/library/<kind>/<slug>.md` — kinds `findings` | `verdicts` | `tools`,
  format per the `library-record-writing` skill (machine-face frontmatter `name` +
  one-line verdict `description`, one page, a 4-field Lesson). Then
  `mcp__ui__promote` `{ kind: "library", name: "<kind>/<slug>.md", reason: "…" }`.
- **4c PROJECT convention**: propose the exact line(s) for the project `CLAUDE.md`
  (Business rules / convention floor) as a human-gated Edit. Never promoted, never PR'd.
- **4d FRAMEWORK finding**: append it to the framework feedback flow (the
  `/framework-feedback` mechanism where present; otherwise state it plainly in your report
  for the framework owner). Never promoted.

**Privacy floor (hard):** before ANY promote, the draft must survive the contamination scan
— the promote step runs it deterministically (per-project denylist + business-rule lines);
write drafts agnostically from the start: no project names, no verbatim business rules, no
absolute paths. State the technique, not the incident.

## Report

One line per candidate: `scope · kind · name — landed where` (or "blocked: <signal>" /
"skipped: one-off"). Plus the state-file update. The promotions board is where the human
approves the DOMAIN drafts — say so.

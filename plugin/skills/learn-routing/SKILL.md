---
name: learn-routing
agents: [orchestrator]
domain: universal
description: Turn finished work into durable learnings — a cost gate that refuses to run without new signal, classification into FRAMEWORK / DOMAIN / PROJECT, one landing path per scope, and the contribution flow that PRs a domain's learnings upstream. Load after work lands, when asked to distil learnings, or when contributing them.
---

# Learning, routed by scope

Real work just finished — an issue closed, a PRD delivered, a run went badly. Some of it is worth
keeping and most of it is not. This is how to tell, and where each kind lands.

**Foreground only.** Drafts are written under the project's `.claude/`, deliberately outside the
background write grant, and every write is human-approved as it happens. Sub-agents never write
drafts: they emit draft CONTENT in their reports, and you materialise it.

## 1. The cost gate — no LLM pass without new signal

Read `.xenomoon/learn-state.json` in the project (`{ lastRun, seenIssues: [], seenRejects: n }`,
created on first run). Proceed **only** if at least one of these appeared since the last run:

- a newly CLOSED issue (`gh issue list --state closed`, compared against `seenIssues`)
- a new entry in `.xenomoon/debrief-queue.md`
- a new REJECTED promotion in `.xenomoon/promotions.json`
- an explicit target in the request — a number or a PRD slug always runs

**Nothing new → say "nothing to learn since `<lastRun>`" and stop.** This gate exists because the
distillation itself is expensive and produces nothing from no input; without it, "learn" becomes a
habit that burns a model pass to write "no learnings" every time. Update the state file at the end
of a run, human-gated like every other write.

## 2. Distil

For each new item read the durable record — the issue thread's ANALYSIS / QA / REVIEW comments, the
PRD's applied recommendations and scope-outs, the divergence entry — and ask one question: **what
here would bite the NEXT project too?**

**The bar is: it RECURS, or it BIT US.** A one-off judgement call is not a learning. Aim for 0–3
candidates per run. **Zero is a fine answer** and the most common correct one.

## 3. Classify — every candidate is exactly one scope

| scope         | what it is                                                                            | lands as                                         |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **DOMAIN**    | a repeatable technique, or a hard-won verdict/footgun any project in this domain hits | a skill or a library record, promoted for review |
| **PROJECT**   | a fact or rule of THIS project — a business rule, a data-model intent                 | a proposed line in the project's own library     |
| **FRAMEWORK** | the spine itself failed — a hook, the orchestrator, a gate                            | a finding for the framework owner                |

## 4. Land it

**DOMAIN skill** (a repeatable technique) → write `<project>/.claude/skills/<name>/SKILL.md`
following the `write-a-skill` method (trigger-rich description, steps, verification), then file it:
`mcp__ui__promote` `{ kind: "skills", name: "<name>", reason: "<one line>" }`.

**DOMAIN library record** (a verdict, finding or footgun) → write
`<project>/.claude/library/<kind>/<slug>.md` — kinds are `findings` · `verdicts` · `tools` — in the
`library-record-writing` format: machine-face frontmatter `name`, a one-line verdict as the
`description`, one page, a four-field Lesson. Then `mcp__ui__promote`
`{ kind: "library", name: "<kind>/<slug>.md", reason: "…" }`.

**PROJECT convention** → propose the exact line(s) for the project's
`.claude/library/business-rules.md`, plus its one-line `CLAUDE.md` index pointer, as a human-gated
edit. `CLAUDE.md` stays an INDEX, never the content sink. Never promoted, never PR'd. Use this arm
only for a fact that surfaced OUTSIDE any agent's normal flow — normally capture is a side effect of
the producing agent's own output.

**FRAMEWORK finding** → append it to the framework's own feedback flow where one exists — the
`/framework-feedback` mechanism lives in the FORGE checkout, not in an installed project, so from a
bound project the landing path is your report, stated plainly enough for the framework owner to act
on: what failed, which hook or gate or spine rule, and what it cost. Never promoted. A framework
failure recorded only as a passing remark is a failure that repeats.

**Privacy floor, hard:** before ANY promote, the draft must survive the contamination scan, which
the promote step runs deterministically (per-project denylist plus business-rule lines). So write
drafts agnostically from the start — no project names, no verbatim business rules, no absolute
paths. **State the technique, not the incident.**

## 5. Contributing a domain's learnings upstream

Promoted learnings live in the install. Sending them to the framework is a separate, deliberate act.

**Scope, and refuse rather than improvise:**

- stage ONLY paths under `domains/<name>/plugin/{skills,library}/` and their index files
- NEVER stage `.xenomoon.json`, anything under `.claude/`, `ui/`, `plugin/` (CORE), another domain,
  or any file naming the bound project. **A diff that wants those is not a contribution** — stop and
  say why.
- unrelated uncommitted changes in the checkout → stop, and have them committed or stashed first.
  The branch must contain learnings only.

**Then:** collect candidates (`git status --porcelain` over those two paths, plus committed-but-
unpushed learning commits — nothing found means "nothing to contribute"); gate LOCALLY before any
push (`node ui/server/cli/gen-contamination.js`, `npm run check:agnostic`, `npm run validate`);
branch `contrib/<name>-<short-desc>` and commit only the scoped paths as
`feat(<name>): <what the domain learned>`, **one learning theme per PR**; open the PR against the
upstream trunk with each skill or record's one-line description and why it generalises, taken from
the promotion's `reason`; then return to your own branch — the install keeps running on its trunk
and the PR lives independently.

**Collisions** (convention, no tooling): if upstream later lands a same-named capability, YOUR
version wins locally on the next pull — move upstream's copy aside as `<name>.upstream/` and merge
by hand. Descriptive slugs keep this rare.

## Report

One line per candidate: `scope · kind · name — landed where`, or `blocked: <signal>`, or
`skipped: one-off`. Plus the state-file update. Say that the promotions board is where the human
approves the DOMAIN drafts — the drafts are not the decision.

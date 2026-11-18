---
name: project-onboarding
agents: [orchestrator]
domain: universal
description: Install the framework onto a project that ALREADY uses Claude — inventory what exists, report conflicts without touching them, negotiate the CLAUDE.md merge and the business-rules interview through the product-owner, every write human-gated. Load on first boot of a bound project, or when re-running onboarding by hand.
---

# Onboarding a project that already has a Claude life

The project has its own `CLAUDE.md`, probably `.claude/skills`, maybe hooks and conventions that
predate you. **Their content is authoritative; the framework's structure gives it one shape.** Installing
means negotiating with what exists: a part may stay, move or be removed, each change approved by the
human, never silently.

**Foreground only.** Every write under the project is human-gated, one at a time. A backgrounded run
cannot pause for the interview that is half the point.

## Step 1 — inventory, read-only, no judgement

1. **Their `CLAUDE.md`** (and `docs/conventions.md` if present): match what it holds to the
   template's sections — What it is · Data model and tenancy · Commands · Hard rules · Conventions ·
   Library index → `.claude/library/business-rules.md` — by meaning, not by heading name. Report
   the sections found and the sections missing as a checklist.
2. **Their `.claude/skills/`**: list each skill, name and description line. **The default verdict
   for every one is KEEP PROJECT-LOCAL.** Flag only the clearly generic — no project nouns,
   technique-shaped — as day-zero promotion candidates, and file each flagged one through
   `mcp__ui__promote` with `{ kind: "skills", … }` so the human decides on the board rather than in
   passing.
3. **Their `.claude/settings.json` and hooks**: diff against the framework's hooks and report
   double-gating or contradictions (their own destructive-git guard against ours, for instance).
   **Report only. Never touch their settings.**
4. **Stack commands**: read `package.json` scripts and map validate / build / test / smoke / e2e
   onto what the domain expects. Note the gaps plainly — no test script is a fact, not a failure.

## Step 1b — the branch model

Read `<project>/.xenomoon/branch-model`: first line is the model, optional `prod=` / `dev=` lines
override the defaults. Report it — or "none set" — in the inventory. It is confirmed or changed in
the step-2 interview, as one `select` field:

| model     | what it means                                                         |
| --------- | --------------------------------------------------------------------- |
| `trunk`   | work lands directly on the default branch (POC, early MVP)            |
| `pr-main` | branch → PR → main; the branch dies at merge                          |
| `staged`  | development is the default target; main is promotion-only and deploys |
| `custom`  | the project has its own doctrine                                      |

On a change, write the file — foreground and human-gated like every onboarding write. `custom`
additionally lands the doctrine text in `.claude/library/branch-doctrine.md` with one pointer line
in `CLAUDE.md`.

## Step 1c — the paid surface

The spend gate (`policy.spend`) always covers the well-known model endpoints; what it CANNOT know
is which of this project's own scripts spend real money — an image-gen script, an eval that bills
per row. That list is `policy.spendPatterns` in the bound project's `.xenomoon/settings.json`,
and onboarding is where it gets confirmed:

1. **Inventory as facts**: `package.json` scripts whose names or files suggest paid calls
   (eval / gen / diagnose / anything invoking a model SDK), and any pre-existing spend-guard hook
   the project carries — the guard's own match list is the best source there is.
2. **One interview field** (step 2's form): "which commands in this project spend real API
   credits?" — the human's answer is the list, the inventory is only the prompt for it. Prefer
   DISTINCTIVE substrings (`gen-assets.ts`, `eval:real-vision`) over generic words (`run`, `test`)
   — matching is substring, and a pattern that fires on inspection commands trains reflexive
   approval, which is worse than no gate.
3. **Write it, foreground and human-gated**: set `policy.spendPatterns` in the bound project's
   `.xenomoon/settings.json` (not the install's `.xenomoon.json`). Read the file first and change
   that one key only: every other top-level key (such as `onboarded`) and every other key inside
   `policy` (`push`, `merge`, …) stays exactly as it is — never write a new `policy` object over
   the old one. Already configured → report the current list, change only if the human says so.

## Step 2 — the judgement half goes to the product-owner

Dispatch it **foreground and form-driven**, and **dispatch it CLEAN**: pass the step-1 inventory as
facts, and do NOT suggest candidate rule areas or topics. A pre-loaded topic list manufactures
rubber-stamp questions — the product-owner will dutifully cite code for whatever you seed it with.

It produces three things:

**An annotated `CLAUDE.md` review.** The file is reviewed, not only added to: analyze what is
there and where the framework's shape fits it. `CLAUDE.md` stays an INDEX with the template's
sections. The review:

1. Matches each part of their file to a template section by meaning, not by heading name.
2. Gives each part one verdict: it **stays** as a line; it **moves** to a doc and leaves one line
   behind; or it is **removed**. Stack and infrastructure detail moves to `README.md`. Pages of
   conventions move to one doc per area, indexed under Conventions.
3. Lists the missing sections and proposes adding each: the commands mapping from step 1.4, a
   `## Library index` scaffold pointing at an empty `.claude/library/business-rules.md`, a
   Conventions index.
4. Names a file over 200 lines, a procedure that could be a skill, and a rule a check could enforce.
5. Waits for the human: each edit is approved one at a time, and nothing is written before that.

A project whose rules live in a parent folder's `CLAUDE.md` or `.claude/CLAUDE.md` (Claude Code
loads every `CLAUDE.md` above the working directory) is reviewed on that file; no second file is
created beside it.

**The project library, scaffolded — `.claude/library/`** with `README.md` (the index),
`business-rules.md`, and `explorations/`. Empty is fine and expected; what is NOT fine is absent,
because a library that does not exist is never looked in, and every session then rediscovers the
same things from scratch. **Onboarding is the only moment guaranteed to happen once per project,
so it is where the shelf gets built** — what fills it is the work that comes after. The method,
and who writes which kind, is `project-library`; load it before proposing the scaffold.

**A business-rules interview, where intent comes from what the user SAYS.** Code-mining is banned as
a question source: a rule reverse-engineered from an implemented check is a restatement of enforced
code — there is nothing to decide, so it is not a business rule. Ask open questions ("what should
agents know about how this product is _meant_ to work that the code cannot tell them?"). A rule
earns the block only when it is non-obvious, decision-bearing, or has a failure history.

**"Nothing to capture yet" is a first-class outcome.** An empty scaffold and zero rules is a
SUCCESS, not a gap to fill. Rules accrue later as a side effect of real work. (When the block IS
filled it earns its keep twice: it bootstraps the analysts' intent guardrail and the contamination
check's business-terms signal.)

## Step 3 — report, then stop the session

The checklist of found and missing blocks · skills kept local versus flagged, with board links ·
hook conflicts found · the commands mapping · and what the product-owner proposed against what the
human actually approved.

End with `npm run doctor`'s summary line, and then this, verbatim:

> **Start a NEW session now — this one predates what we just learned; the next one loads it all.**

That last instruction is not politeness. The session that ran onboarding is holding a stale picture
of the project: the skills, hooks and rules it just wrote are loaded at session start, and this one
started before they existed.
